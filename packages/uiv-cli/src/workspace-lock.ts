/**
 * P0-9 workspace 文件锁(OS 锁 + PID/nonce,alpha)。
 * 覆盖 CLI / MCP / 公开 commands API 共用变更边界:同一 workspace(.ui-verify)的并发写互斥。
 *
 * 方案(交付检查单 P0-9 分支「OS 锁 + PID/启动标识,TTL 不单独抢占」):
 *   · 原子建锁:openSync(path,'wx')(O_CREAT|O_EXCL),已存在即 EEXIST;锁内容 = 持有者 pid + 启动 nonce + 时间戳。
 *   · TTL 不触发抢占:仅当持有者【确证死亡】(process.kill(pid,0) 抛 ESRCH)才回收陈旧锁;
 *     活着的慢任务(gradle 冷构建)绝不被超时抢占。
 *   · 后到进程遇活锁:明确拒绝(WorkspaceLockedError → 退出码 EXIT_WORKSPACE_LOCKED),不阻塞等待。
 *   · 锁按 workspace 粒度(锁文件在该 workspace 的 .ui-verify 下),不同 workspace 并行不互斥。
 *   · 释放:finally 删锁(仅当仍属本持有者);异常退出留的陈旧锁由下个进程「确证死亡」检测回收。
 */
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

/** 后到进程遇活锁的可判读拒绝(退出码 EXIT_WORKSPACE_LOCKED)。参照 CliUsageError/RecordRefusedError 风格。 */
export class WorkspaceLockedError extends Error {}

/** workspace 被占用退出码(sysexits EX_TEMPFAIL=75「临时失败,可重试」;区别于 0/1/2/3/4)。 */
export const EXIT_WORKSPACE_LOCKED = 75;

const LOCK_FILE = '.uiv.lock';
const MAX_RECLAIM = 5;   // 陈旧回收竞争重试上限,防回收/重建互相抢占的活锁

export interface LockHandle { lockPath: string; pid: number; nonce: string }

interface LockInfo { pid: number; nonce: string; createdAt: string }

/** 读并校验锁内容;缺 pid/nonce 或解析失败 → null(不可判定持有者 = 保守不回收)。 */
function readLockInfo(lockPath: string): LockInfo | null {
  try {
    const parsed = JSON.parse(readFileSync(lockPath, 'utf8')) as Partial<LockInfo>;
    if (typeof parsed.pid !== 'number' || typeof parsed.nonce !== 'string') return null;
    return { pid: parsed.pid, nonce: parsed.nonce, createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '' };
  } catch {
    return null;
  }
}

/** 持有者是否【确证死亡】:process.kill(pid,0) 抛 ESRCH = 死亡可回收;EPERM/成功 = 活着不可回收。 */
function isHolderDead(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;                                        // 成功 = 存活
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ESRCH';   // ESRCH = 无此进程 = 死亡;EPERM(他人进程存活)= 活
  }
}

/** O_CREAT|O_EXCL 原子建锁并写入持有者标识;已存在抛 EEXIST(交由上层判活/回收)。 */
function createLockOrThrow(lockPath: string, info: LockInfo): void {
  const fd = openSync(lockPath, 'wx');
  try {
    writeSync(fd, `${JSON.stringify(info)}\n`);
  } finally {
    closeSync(fd);
  }
}

/** 回收陈旧锁:再读确认仍是同一(pid+nonce)死锁才 unlink,避免误删刚被他人重建的活锁。 */
function reclaimStaleLock(lockPath: string, dead: LockInfo): void {
  const cur = readLockInfo(lockPath);
  if (cur !== null && cur.pid === dead.pid && cur.nonce === dead.nonce) {
    try { unlinkSync(lockPath); } catch { /* 他人已回收 */ }
  }
}

/**
 * 取 workspace 锁。活锁 → 立即 WorkspaceLockedError(不等待);仅确证死亡的陈旧锁才回收后重取。
 * uiVerifyDir 不存在则先建(锁文件须落在该目录内)。
 */
export function acquireWorkspaceLock(uiVerifyDir: string): LockHandle {
  mkdirSync(uiVerifyDir, { recursive: true });
  const lockPath = join(uiVerifyDir, LOCK_FILE);
  const info: LockInfo = { pid: process.pid, nonce: randomBytes(8).toString('hex'), createdAt: new Date().toISOString() };

  for (let attempt = 0; attempt <= MAX_RECLAIM; attempt += 1) {
    try {
      createLockOrThrow(lockPath, info);
      return { lockPath, pid: info.pid, nonce: info.nonce };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      const existing = readLockInfo(lockPath);
      if (existing === null) {
        throw new WorkspaceLockedError(
          `workspace locked: ${lockPath} (unparseable lock; remove it manually if no uiv process is running)`,
        );
      }
      if (!isHolderDead(existing.pid)) {
        throw new WorkspaceLockedError(
          `workspace locked: ${lockPath} (held by pid ${existing.pid}); another uiv process is writing this workspace`,
        );
      }
      reclaimStaleLock(lockPath, existing);   // 确证死亡 → 回收陈旧锁,循环重取
    }
  }
  throw new WorkspaceLockedError(`workspace lock reclaim contended: ${lockPath}`);
}

/** 释放锁:仅当锁仍属本持有者(pid+nonce 匹配)才删,防误删被回收后他人重建的锁。 */
export function releaseWorkspaceLock(handle: LockHandle): void {
  const cur = readLockInfo(handle.lockPath);
  if (cur !== null && cur.pid === handle.pid && cur.nonce === handle.nonce) {
    try { unlinkSync(handle.lockPath); } catch { /* 已不在 */ }
  }
}

/** acquire → fn → finally release 的便捷包装(命令入口统一用它,保证异常路径也释放)。 */
export async function withWorkspaceLock<T>(uiVerifyDir: string, fn: () => Promise<T>): Promise<T> {
  const handle = acquireWorkspaceLock(uiVerifyDir);
  try {
    return await fn();
  } finally {
    releaseWorkspaceLock(handle);
  }
}
