import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DirectGradleRunner, SpawnGradleRunner, UdsGradleRunner, buildExecutionReceipt, renderPreviewViaDaemon, selectGradleRunner } from './gradle-runner.js';

const dir = (): string => mkdtempSync(join(tmpdir(), 'uivd-'));   // 短路径守 AF_UNIX 104B
const openServers = new Set<net.Server>();
afterEach(() => { for (const s of openServers) s.close(); openServers.clear(); });

/** 假 daemon:按 \n 拆行,每行以 respond(req) 的 JSON+\n 回复;listen 后 resolve 关闭句柄。 */
function fakeDaemon(sock: string, respond: (req: { id: string; cmd: string; args?: unknown }) => unknown): Promise<() => Promise<void>> {
  const server = net.createServer((conn) => {
    let buf = '';
    conn.on('data', (d: Buffer) => {
      buf += d.toString();
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        conn.write(`${JSON.stringify(respond(JSON.parse(line)))}\n`);
      }
    });
  });
  openServers.add(server);
  return new Promise((resolve) => {
    server.listen(sock, () => resolve(() => new Promise<void>((res) => { server.close(() => res()); })));
  });
}

describe('T2.1 双车道 runner', () => {
  it('UdsGradleRunner: payload 原样返回;gradle.run 透传 cwd/args', async () => {
    const sock = join(dir(), 'daemon.sock');
    let seen: { id: string; cmd: string; args?: unknown } | undefined;
    await fakeDaemon(sock, (req) => { seen = req; return { id: req.id, ok: true, payload: { exitCode: 7, stderr: 'e: boom' } }; });
    await expect(new UdsGradleRunner(sock).run('/d', ['t'])).resolves.toEqual({ exitCode: 7, stderr: 'e: boom' });
    expect(seen).toMatchObject({ cmd: 'gradle.run', args: { cwd: '/d', args: ['t'] } });
  });

  it('UdsGradleRunner: ok:false → daemon error 上抛', async () => {
    const sock = join(dir(), 'daemon.sock');
    await fakeDaemon(sock, (req) => ({ id: req.id, ok: false, error: 'nope' }));
    await expect(new UdsGradleRunner(sock).run('/d', ['t'])).rejects.toThrow(/daemon error: nope/);
  });

  // P0-8 双 lane 反转:CLI 默认 direct、--sandbox 走沙箱(codex 019f6029 B/C/E)。
  it('selectGradleRunner default → DirectGradleRunner + receipt effectiveLane=direct(无策略注入)', async () => {
    const s = await selectGradleRunner(dir(), { requestedLane: 'default', selectedBy: 'cli-default' });
    expect(s.runner).toBeInstanceOf(DirectGradleRunner);
    expect(s.runner).not.toBeInstanceOf(SpawnGradleRunner);
    expect((s.runner as DirectGradleRunner).extraArgs).toEqual([]);   // 无 --no-daemon/--offline 注入
    expect(s.execution).toMatchObject({
      requestedLane: 'default', effectiveLane: 'direct', selectedBy: 'cli-default',
      runner: 'DirectGradleRunner', sandboxEstablished: false,
      gradleUserHomeMode: 'inherited', networkMode: 'host', gradleOffline: false,
    });
  });

  it('selectGradleRunner sandbox → SpawnGradleRunner(--no-daemon --offline)+ receipt effectiveLane=sandbox', async () => {
    const s = await selectGradleRunner(dir(), { requestedLane: 'sandbox', selectedBy: 'cli-flag' });
    expect(s.runner).toBeInstanceOf(SpawnGradleRunner);
    expect((s.runner as SpawnGradleRunner).extraArgs).toEqual(['--no-daemon', '--offline']);
    expect(s.execution).toMatchObject({
      requestedLane: 'sandbox', effectiveLane: 'sandbox', selectedBy: 'cli-flag',
      runner: 'SpawnGradleRunner', sandboxEstablished: true,
      gradleUserHomeMode: 'project-local', networkMode: 'denied-except-localhost', gradleOffline: true,
    });
  });

  it('selectGradleRunner no-fallback:sandbox 请求恒 SpawnGradleRunner、default 请求恒 DirectGradleRunner(单次选路不换 lane)', async () => {
    const sb = await selectGradleRunner(dir(), { requestedLane: 'sandbox', selectedBy: 'ci-policy' });
    expect(sb.runner).not.toBeInstanceOf(DirectGradleRunner);
    expect(sb.execution.effectiveLane).toBe('sandbox');
    const dr = await selectGradleRunner(dir(), { requestedLane: 'default', selectedBy: 'cli-default' });
    expect(dr.runner).not.toBeInstanceOf(SpawnGradleRunner);
    expect(dr.execution.effectiveLane).toBe('direct');
  });

  it('selectGradleRunner: P0-1 daemon 硬禁用 —— 即便 daemon 存活(ping 可通),sandbox 请求仍冷道 SpawnGradleRunner', async () => {
    const d = dir();
    await fakeDaemon(join(d, 'daemon.sock'), (req) => ({ id: req.id, ok: true, payload: { pong: true } }));
    const s = await selectGradleRunner(d, { requestedLane: 'sandbox', selectedBy: 'cli-flag' });
    expect(s.runner).toBeInstanceOf(SpawnGradleRunner);
  });
});

describe('P0-8 buildExecutionReceipt(父进程 receipt,LaneRequest 确定性派生,非 gradle 自报)', () => {
  it('default → direct 姿态字段', () => {
    expect(buildExecutionReceipt({ requestedLane: 'default', selectedBy: 'cli-default' })).toEqual({
      requestedLane: 'default', effectiveLane: 'direct', selectedBy: 'cli-default',
      runner: 'DirectGradleRunner', sandboxEstablished: false,
      gradleUserHomeMode: 'inherited', networkMode: 'host', gradleOffline: false,
    });
  });
  it('sandbox → sandbox 姿态字段;selectedBy 溯源透传(mcp-policy)', () => {
    expect(buildExecutionReceipt({ requestedLane: 'sandbox', selectedBy: 'mcp-policy' })).toEqual({
      requestedLane: 'sandbox', effectiveLane: 'sandbox', selectedBy: 'mcp-policy',
      runner: 'SpawnGradleRunner', sandboxEstablished: true,
      gradleUserHomeMode: 'project-local', networkMode: 'denied-except-localhost', gradleOffline: true,
    });
  });
  it('no-fallback 不变式:requestedLane=sandbox 时 effectiveLane 恒 sandbox(任何 selectedBy 均不为 direct)', () => {
    for (const selectedBy of ['cli-flag', 'mcp-policy', 'ci-policy'] as const) {
      expect(buildExecutionReceipt({ requestedLane: 'sandbox', selectedBy }).effectiveLane).toBe('sandbox');
    }
  });
});

describe('P0-8 DirectGradleRunner(直连,反蒙混:spawn 真实 child 断言无冷道注入)', () => {
  it('直 spawn <cwd>/gradlew:透传 args、env 继承宿主、无 sandbox-exec/--offline/--no-daemon/preferIPv4Stack/GRADLE_USER_HOME 重定向', async () => {
    const d = dir();
    const gradlew = join(d, 'gradlew');
    // mock gradlew:把 argv/env dump 到 cwd 内文件(子进程 cwd=demoDir → 相对路径落在此),供断言真实 child invocation。
    writeFileSync(gradlew, ['#!/bin/sh', 'printf "%s\\n" "$@" > _argv.txt', 'env > _env.txt', 'exit 0', ''].join('\n'));
    chmodSync(gradlew, 0o755);
    process.env.UIV_DIRECT_PROBE = 'inherited-ok';
    try {
      const r = await new DirectGradleRunner().run(d, [':app:testDebugUnitTest', '--tests', 'com.x.FooTest', '-Proborazzi.test.compare=true']);
      expect(r.exitCode).toBe(0);
      const argv = readFileSync(join(d, '_argv.txt'), 'utf8');
      const env = readFileSync(join(d, '_env.txt'), 'utf8');
      // 任务 args 正确透传(含 --tests 过滤)
      expect(argv).toContain(':app:testDebugUnitTest');
      expect(argv).toContain('--tests');
      expect(argv).toContain('com.x.FooTest');
      // 无沙箱包裹 / 无冷道策略注入
      expect(argv).not.toContain('sandbox-exec');
      expect(argv).not.toContain('--offline');
      expect(argv).not.toContain('--no-daemon');
      expect(argv).not.toContain('preferIPv4Stack');
      // env 继承宿主(探针可见),无项目本地 GRADLE_USER_HOME 重定向、无 IPv4 JVM 注入
      expect(env).toContain('UIV_DIRECT_PROBE=inherited-ok');
      expect(env).not.toContain(`GRADLE_USER_HOME=${join(d, '.gradle-home')}`);
      expect(env).not.toContain('-Djava.net.preferIPv4Stack=true');
    } finally {
      delete process.env.UIV_DIRECT_PROBE;
    }
  });
});

describe('T2.8 renderPreviewViaDaemon(快车道 UDS 客户端)', () => {
  it('成功回 png/semantics;render 参数透传', async () => {
    const sock = join(dir(), 'daemon.sock');
    let seen: { cmd: string; render?: unknown } | undefined;
    await fakeDaemon(sock, (req) => {
      seen = req as typeof seen;
      return { id: req.id, ok: true, payload: { png: '/p.png', semantics: '/s.json', renderMs: 12, semanticsMs: 8 } };
    });
    await expect(renderPreviewViaDaemon(sock, 'com.x.FooPreview', '/p.png', '/s.json'))
      .resolves.toMatchObject({ png: '/p.png', semantics: '/s.json', renderMs: 12 });
    expect(seen).toMatchObject({ cmd: 'renderPreview', render: { previewFqn: 'com.x.FooPreview', outPng: '/p.png', outSemantics: '/s.json' } });
  });

  it('daemon ok:false(如 worker_stale)→ reject,供 CLI 回落', async () => {
    const sock = join(dir(), 'daemon.sock');
    await fakeDaemon(sock, (req) => ({ id: req.id, ok: false, error: 'worker_stale: rebuild required' }));
    await expect(renderPreviewViaDaemon(sock, 'com.x.FooPreview', '/p.png', '/s.json')).rejects.toThrow(/worker_stale/);
  });

  it('无 daemon(sock 缺失)→ reject,供 CLI 回落', async () => {
    await expect(renderPreviewViaDaemon(join(dir(), 'daemon.sock'), 'com.x.FooPreview', '/p.png', '/s.json')).rejects.toThrow();
  });

  it('payload 缺 png/semantics → reject', async () => {
    const sock = join(dir(), 'daemon.sock');
    await fakeDaemon(sock, (req) => ({ id: req.id, ok: true, payload: { renderMs: 1 } }));
    await expect(renderPreviewViaDaemon(sock, 'com.x.FooPreview', '/p.png', '/s.json')).rejects.toThrow(/malformed/);
  });
});
