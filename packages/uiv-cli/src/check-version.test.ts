/**
 * 回归护栏(M3 复审非阻塞建议):check 分支曾遗漏把 --version 转发给 readMappingEntry
 * (对照 verify-page 分支恒转发),导致 mapping.json 同 nodeId 多 entry(D-02/M3 scope 消歧
 * 场景,见 mapping-entry.test.ts)时 --version 静默失效、恒选首条。
 * 此测 spawn 构建产物 dist CLI(main() 顶层执行、未导出,故走进程边界同 exit-timing.test.ts
 * 惯例),用同 nodeId 双 version entry 的 mapping.json + 不命中任一条的 --version 触发
 * selectMappingEntry 的 0-命中 CliUsageError:断言消息含目标 version,证明 version 确已
 * 抵达 selectMappingEntry(而非被 readMappingEntry 调用处吞掉)。该分支先于 gradle runner
 * 选路/--demo IO 即会命中,故无需真实 demo 工程或 gradlew mock。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIST_CLI = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const PREVIEW = 'com.magpie.uiv.demo.CalibCardPreview';
const NODE_ID = '1:100';

/** 同 nodeId 双 entry(standalone V1 + scoped V2),仿 mapping-entry.test.ts 的消歧场景。 */
function makeFixture(): string {
  const workdir = mkdtempSync(join(tmpdir(), 'uiv-check-version-'));
  mkdirSync(join(workdir, '.ui-verify'), { recursive: true });
  writeFileSync(join(workdir, '.ui-verify', 'mapping.json'), JSON.stringify([
    { fileKey: 'FKEY', nodeId: NODE_ID, version: 'V1', minScore: 0.9, matrix: 'l-shape' },
    { fileKey: 'FKEY', nodeId: NODE_ID, version: 'V2', minScore: 0.9, matrix: 'l-shape' },
  ], null, 2));
  return workdir;
}

describe('回归(M3 复审): check --version 需转发进 readMappingEntry 以消歧同 nodeId 多 entry', () => {
  it.skipIf(!existsSync(DIST_CLI))(
    '同 nodeId 双 version entry + --version 不命中任一条 → CliUsageError 消息含该 version(证明已转发)',
    async () => {
      const workdir = makeFixture();
      const child = spawn(
        process.execPath,
        [DIST_CLI, 'check', '--preview', PREVIEW, '--node', NODE_ID, '--demo', 'demo', '--version', 'V9'],
        { cwd: workdir, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let stderr = '';
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      const code = await new Promise<number | null>((resolve, reject) => {
        child.on('exit', resolve);
        child.on('error', reject);
      });
      expect(code).toBe(2);   // CliUsageError 路径(main 顶层 catch,与 selectMappingEntry 抛出一致)
      expect(stderr).toMatch(/no mapping entry for node 1:100 version V9/);
    },
    10_000,
  );
});
