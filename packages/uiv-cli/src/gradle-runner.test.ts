import { mkdtempSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SpawnGradleRunner, UdsGradleRunner, renderPreviewViaDaemon, selectGradleRunner } from './gradle-runner.js';

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

  it('selectGradleRunner: 无 sock → cold(SpawnGradleRunner + --no-daemon)', async () => {
    const s = await selectGradleRunner(dir());
    expect(s.lane).toBe('cold');
    expect(s.runner).toBeInstanceOf(SpawnGradleRunner);
    expect((s.runner as SpawnGradleRunner).extraArgs).toContain('--no-daemon');
  });

  it('selectGradleRunner: P0-1 硬禁用 —— 即便 daemon 存活(ping 可通)仍恒返回冷道', async () => {
    const d = dir();
    await fakeDaemon(join(d, 'daemon.sock'), (req) => ({ id: req.id, ok: true, payload: { pong: true } }));
    const s = await selectGradleRunner(d);
    expect(s.lane).toBe('cold');
    expect(s.runner).toBeInstanceOf(SpawnGradleRunner);
  });

  it('selectGradleRunner: sock 为普通文件 → cold', async () => {
    const d = dir();
    writeFileSync(join(d, 'daemon.sock'), '');
    const s = await selectGradleRunner(d);
    expect(s.lane).toBe('cold');
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
