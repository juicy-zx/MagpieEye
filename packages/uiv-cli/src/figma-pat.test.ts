/**
 * resolveFigmaPat 单测:优先级(env > 文件)+ 防提交提醒(不阻断)+ 权限提醒(不阻断) + trim。
 * gitignore 判定用例真实 `git init` 临时仓(execFileSync),不 mock git——依赖真实 git check-ignore 行为。
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveFigmaPat } from './figma-pat.js';

function freshDir(): string { return mkdtempSync(join(tmpdir(), 'uiv-figma-pat-')); }

function gitInit(dir: string): void {
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir });
}

afterEach(() => { vi.unstubAllEnvs(); });

describe('resolveFigmaPat', () => {
  it('① env 优先:设了 FIGMA_PAT 时即便同目录有未 gitignore 的 .figma-pat 文件也直接返回 env 值,不读文件、不打印任何警告', () => {
    const dir = freshDir();
    gitInit(dir);   // 仓库内 + 未 gitignore,若文件被读取本应触发警告——env 优先应完全绕过
    writeFileSync(join(dir, '.figma-pat'), 'figd_TESTONLY_fromfile');
    vi.stubEnv('FIGMA_PAT', 'figd_TESTONLY_fromenv');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(resolveFigmaPat(dir)).toBe('figd_TESTONLY_fromenv');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it('② 文件不存在 → 返回空串(交由既有 usage error 处理)', () => {
    const dir = freshDir();
    vi.stubEnv('FIGMA_PAT', '');
    expect(resolveFigmaPat(dir)).toBe('');
    rmSync(dir, { recursive: true, force: true });
  });

  it('③ git 仓库内、.figma-pat 未被 .gitignore 忽略 → 不阻断:console.error 警告含绝对路径与修复指引,仍返回文件内容', () => {
    const dir = freshDir();
    gitInit(dir);
    const patPath = join(dir, '.figma-pat');
    writeFileSync(patPath, 'figd_TESTONLY_xxx');
    chmodSync(patPath, 0o600);   // 排除权限告警干扰,聚焦 gitignore 警告
    vi.stubEnv('FIGMA_PAT', '');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(resolveFigmaPat(dir)).toBe('figd_TESTONLY_xxx');
    const warned = spy.mock.calls.some((c) => {
      const msg = String(c[0]);
      return msg.includes(patPath) && msg.includes('.gitignore');
    });
    expect(warned).toBe(true);
    spy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it('④ git 仓库内、.figma-pat 已被 .gitignore 忽略 → 放行,正常返回内容', () => {
    const dir = freshDir();
    gitInit(dir);
    writeFileSync(join(dir, '.gitignore'), '.figma-pat\n');
    writeFileSync(join(dir, '.figma-pat'), 'figd_TESTONLY_ignored');
    vi.stubEnv('FIGMA_PAT', '');
    expect(resolveFigmaPat(dir)).toBe('figd_TESTONLY_ignored');
    rmSync(dir, { recursive: true, force: true });
  });

  it('⑤ 非 git 目录 → 放行(无提交风险),正常返回内容', () => {
    const dir = freshDir();   // 未 git init
    writeFileSync(join(dir, '.figma-pat'), 'figd_TESTONLY_nongit');
    vi.stubEnv('FIGMA_PAT', '');
    expect(resolveFigmaPat(dir)).toBe('figd_TESTONLY_nongit');
    rmSync(dir, { recursive: true, force: true });
  });

  it('⑥ 内容 trim:首尾空白/换行被去掉', () => {
    const dir = freshDir();   // 非 git 目录,聚焦 trim 行为
    writeFileSync(join(dir, '.figma-pat'), '\n  figd_TESTONLY_trimme  \n\n');
    vi.stubEnv('FIGMA_PAT', '');
    expect(resolveFigmaPat(dir)).toBe('figd_TESTONLY_trimme');
    rmSync(dir, { recursive: true, force: true });
  });

  it('权限提醒(不阻断):组/他人可读写时 console.error 一枚警告,仍返回内容', () => {
    const dir = freshDir();   // 非 git 目录,聚焦权限告警路径
    const patPath = join(dir, '.figma-pat');
    writeFileSync(patPath, 'figd_TESTONLY_perm');
    chmodSync(patPath, 0o644);   // group/other 可读 → 触发告警
    vi.stubEnv('FIGMA_PAT', '');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(resolveFigmaPat(dir)).toBe('figd_TESTONLY_perm');
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls.some((c) => String(c[0]).includes('chmod 600'))).toBe(true);
    spy.mockRestore();
    chmodSync(patPath, 0o600);   // 恢复,便于临时目录清理
    rmSync(dir, { recursive: true, force: true });
  });
});
