/**
 * stdio 生命周期机判(常驻 vitest,D-07/HOTFIX 同旨):spawn 真实 dist server → initialize 握手 →
 * stdin EOF(host 关停)→ 断言进程清场自退(≤5s),不悬挂(HARD 15s 判失败)。
 * 测前 execSync tsc -b(增量幂等,自建 dist;exit-timing 先例的 spawn-真实-dist 套路)。
 */
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { beforeAll, describe, expect, it } from 'vitest';

const DIST_SERVER = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const EXIT_BUDGET_MS = 5_000;    // stdin EOF 后健康退出预算
const HARD_TIMEOUT_MS = 15_000;  // 超此即判悬挂

describe('stdio 生命周期:initialize → stdin EOF → 清场退出', () => {
  beforeAll(() => {
    // execFileSync(arg 数组,不经 shell):增量幂等,current 时为无写 no-op,自建 dist。
    execFileSync('npx', ['tsc', '-b', 'packages/ui-verify-mcp'], { stdio: 'inherit' });
  }, 120_000);

  it('spawn dist server → initialize 收到响应 → stdin.end() → 进程 ≤5s 退出(code 0)', async () => {
    const child = spawn(process.execPath, [DIST_SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
    child.stderr.on('data', () => { /* drain,避免背压 */ });
    let out = '';
    const initReq = JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'lifecycle', version: '0' } },
    });

    try {
      // ① 握手:写 initialize,等到 id:1 的响应(证明 server 起来且 stdout=JSON-RPC 信道)。
      await new Promise<void>((resolve, reject) => {
        const to = setTimeout(() => reject(new Error('initialize 无响应')), HARD_TIMEOUT_MS);
        child.stdout.on('data', (d: Buffer) => {
          out += d.toString();
          if (out.includes('"id":1')) { clearTimeout(to); resolve(); }
        });
        child.on('error', (e) => { clearTimeout(to); reject(e); });
        child.stdin.write(`${initReq}\n`);
      });
      expect(out).toContain('ui-verify');   // serverInfo.name,确认响应出自本 server

      // ② host 关停:stdin EOF → server 应清场 exit 0。
      child.stdin.end();
      const shutdownStart = Date.now();
      const code = await new Promise<number | null>((resolve, reject) => {
        const to = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`stdin EOF 后未在 ${HARD_TIMEOUT_MS}ms 内退出(悬挂)`)); }, HARD_TIMEOUT_MS);
        child.on('exit', (c) => { clearTimeout(to); resolve(c); });
      });
      expect(code).toBe(0);
      expect(Date.now() - shutdownStart).toBeLessThan(EXIT_BUDGET_MS);
    } finally {
      child.kill('SIGKILL');   // 兜底,不留孤儿
    }
  }, HARD_TIMEOUT_MS * 2 + 10_000);
});
