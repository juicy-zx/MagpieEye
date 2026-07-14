/**
 * P0-9 workspace 锁单测:建锁/释放/活锁拒绝/陈旧回收(确证死亡)/仅本持有者可释放。
 * 陈旧回收与活锁判定经 spy process.kill 注入 ESRCH/存活,确定性覆盖 PID 死亡检测。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EXIT_WORKSPACE_LOCKED, WorkspaceLockedError,
  acquireWorkspaceLock, releaseWorkspaceLock, withWorkspaceLock,
} from './workspace-lock.js';

function freshDir(): string { return mkdtempSync(join(tmpdir(), 'uiv-lock-')); }
const lockPath = (dir: string): string => join(dir, '.uiv.lock');

afterEach(() => { vi.restoreAllMocks(); });

describe('acquire / release', () => {
  it('建锁写入本进程 pid;释放后锁文件消失', () => {
    const dir = freshDir();
    const h = acquireWorkspaceLock(dir);
    expect(existsSync(lockPath(dir))).toBe(true);
    expect(h.pid).toBe(process.pid);
    const info = JSON.parse(readFileSync(lockPath(dir), 'utf8')) as { pid: number; nonce: string };
    expect(info.pid).toBe(process.pid);
    expect(info.nonce).toBe(h.nonce);
    releaseWorkspaceLock(h);
    expect(existsSync(lockPath(dir))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('活锁(持有者存活)后到者立即 WorkspaceLockedError,不阻塞', () => {
    const dir = freshDir();
    const h = acquireWorkspaceLock(dir);   // 本进程持锁(存活)
    // 第二次取锁:既有 pid=本进程,process.kill(pid,0) 成功=存活 → 拒绝
    expect(() => acquireWorkspaceLock(dir)).toThrow(WorkspaceLockedError);
    releaseWorkspaceLock(h);
    rmSync(dir, { recursive: true, force: true });
  });

  it('释放后可再次取锁', () => {
    const dir = freshDir();
    const h1 = acquireWorkspaceLock(dir);
    releaseWorkspaceLock(h1);
    const h2 = acquireWorkspaceLock(dir);   // 不抛
    expect(existsSync(lockPath(dir))).toBe(true);
    releaseWorkspaceLock(h2);
    rmSync(dir, { recursive: true, force: true });
  });

  it('不同 workspace 互不阻塞', () => {
    const a = freshDir(); const b = freshDir();
    const ha = acquireWorkspaceLock(a);
    const hb = acquireWorkspaceLock(b);   // 另一 workspace,不抛
    expect(existsSync(lockPath(a))).toBe(true);
    expect(existsSync(lockPath(b))).toBe(true);
    releaseWorkspaceLock(ha); releaseWorkspaceLock(hb);
    rmSync(a, { recursive: true, force: true }); rmSync(b, { recursive: true, force: true });
  });
});

describe('陈旧锁回收(仅确证死亡)', () => {
  it('持有者确证死亡(ESRCH)→ 回收陈旧锁并取得', () => {
    const dir = freshDir();
    writeFileSync(lockPath(dir),
      `${JSON.stringify({ pid: 424242, nonce: 'deadnonce', createdAt: new Date().toISOString() })}\n`);
    vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(new Error('no such process'), { code: 'ESRCH' }); });
    const h = acquireWorkspaceLock(dir);   // 陈旧死锁被回收
    expect(h.pid).toBe(process.pid);
    const info = JSON.parse(readFileSync(lockPath(dir), 'utf8')) as { pid: number };
    expect(info.pid).toBe(process.pid);   // 锁已换成本进程
    rmSync(dir, { recursive: true, force: true });
  });

  it('持有者仍存活 → 不回收,拒绝', () => {
    const dir = freshDir();
    writeFileSync(lockPath(dir),
      `${JSON.stringify({ pid: 424242, nonce: 'alivenonce', createdAt: new Date().toISOString() })}\n`);
    vi.spyOn(process, 'kill').mockImplementation(() => true);   // 不抛 = 存活
    expect(() => acquireWorkspaceLock(dir)).toThrow(WorkspaceLockedError);
    // 陈旧锁未被动过(内容仍是 424242)
    const info = JSON.parse(readFileSync(lockPath(dir), 'utf8')) as { pid: number };
    expect(info.pid).toBe(424242);
    rmSync(dir, { recursive: true, force: true });
  });

  it('锁内容不可解析 → 保守拒绝(不误判死亡)', () => {
    const dir = freshDir();
    writeFileSync(lockPath(dir), 'not-json-garbage');
    expect(() => acquireWorkspaceLock(dir)).toThrow(WorkspaceLockedError);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('释放归属校验', () => {
  it('锁已被他人重建(nonce 不符)→ 本持有者 release 不误删', () => {
    const dir = freshDir();
    const h = acquireWorkspaceLock(dir);
    // 模拟锁被回收后他人重建:同 pid 不同 nonce
    writeFileSync(lockPath(dir),
      `${JSON.stringify({ pid: process.pid, nonce: 'someone-else', createdAt: new Date().toISOString() })}\n`);
    releaseWorkspaceLock(h);   // nonce 不匹配 → 不删
    expect(existsSync(lockPath(dir))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('withWorkspaceLock', () => {
  it('正常路径:执行后释放锁', async () => {
    const dir = freshDir();
    const r = await withWorkspaceLock(dir, async () => 42);
    expect(r).toBe(42);
    expect(existsSync(lockPath(dir))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('异常路径:抛出后仍释放锁', async () => {
    const dir = freshDir();
    await expect(withWorkspaceLock(dir, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(existsSync(lockPath(dir))).toBe(false);   // finally 已释放
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('退出码常量', () => {
  it('EXIT_WORKSPACE_LOCKED = 75(EX_TEMPFAIL,可判读可重试)', () => {
    expect(EXIT_WORKSPACE_LOCKED).toBe(75);
  });
});
