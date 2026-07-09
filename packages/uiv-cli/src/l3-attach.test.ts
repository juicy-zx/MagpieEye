/**
 * T4.2:uiv l3-attach 回填通道 e2e(spawn 构建产物 dist CLI,同 check-version.test.ts 惯例)。
 * 成功场景 stdout 含 attached=1 dropped=1 + exit 0;verdicts 非法 JSON → exit 1(§2.3:执行期数据问题,
 * 与 CliUsageError=exit 2 的调用规范错误分层)。fixture 复用 Step 4 attach 用例素材(单格两簇 + 一合法一空证据 fail)。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DIST_CLI = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const CLUSTERS = [{ x: 0, y: 0, w: 10, h: 10 }, { x: 40, y: 40, w: 8, h: 8 }];

function pageReport(): unknown {
  return {
    schemaVersion: 1, kind: 'page-report', pass: true, test: 'com.magpie.uiv.demo.CalibPageScreenshotTest',
    sessionId: 'standalone', nodeId: '1:100', version: 'T1_0A_V1', matrix: 'l-shape', states: ['typical'],
    perCell: [], l3Verdicts: [], unresolvedKnownDeviations: [],
    classification: { classes: [], actionable: false, retryNoteCandidate: null, environmentCells: [] },
    durationMs: 1,
  };
}
function inputPack(): unknown {
  return {
    schemaVersion: 1, kind: 'l3-input', nodeId: '1:100', version: 'T1_0A_V1',
    coordsNote: 'x', rubric: [], verdictContract: 'x',
    cells: [{ cellId: 'base__typical', state: 'typical', assertionScope: 'full',
      triptychPath: 'x.png', clusters: CLUSTERS, diffRatio: 0.1 }],
  };
}
// 一条合法(锚定簇[0])+ 一条 evidence 空的 fail(应 drop)→ attached=1 dropped=1。
const verdicts = [
  { item: 'color', verdict: 'fail', evidence: [{ cellId: 'base__typical', x: 1, y: 1, w: 2, h: 2 }], severity: 'high', suggestion: '修' },
  { item: 'spacing', verdict: 'fail', evidence: [], severity: 'high', suggestion: '空' },
];

function runCli(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [DIST_CLI, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
    child.on('error', reject);
  });
}

/** 落 report/pack/verdicts 三 fixture 到 tmp;verdictsContent 传字符串以便注入非法 JSON。 */
function seed(verdictsContent: string): { reportPath: string; packPath: string; verdictsPath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'uiv-l3attach-'));
  const reportPath = join(dir, 'page-report.json');
  const packPath = join(dir, 'l3-input.json');
  const verdictsPath = join(dir, 'verdicts.json');
  writeFileSync(reportPath, JSON.stringify(pageReport(), null, 2));
  writeFileSync(packPath, JSON.stringify(inputPack(), null, 2));
  writeFileSync(verdictsPath, verdictsContent);
  return { reportPath, packPath, verdictsPath };
}

describe('uiv l3-attach e2e(T4.2,spawn dist)', () => {
  it.skipIf(!existsSync(DIST_CLI))('成功回填 → stdout 含 attached=1 dropped=1、exit 0', async () => {
    const { reportPath, packPath, verdictsPath } = seed(JSON.stringify(verdicts, null, 2));
    const r = await runCli(['l3-attach', '--report', reportPath, '--verdicts', verdictsPath, '--pack', packPath]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('attached=1 dropped=1');
  }, 10_000);

  it.skipIf(!existsSync(DIST_CLI))('verdicts 非法 JSON → exit 1(§2.3)', async () => {
    const { reportPath, packPath, verdictsPath } = seed('not valid json {{{');
    const r = await runCli(['l3-attach', '--report', reportPath, '--verdicts', verdictsPath, '--pack', packPath]);
    expect(r.code).toBe(1);
  }, 10_000);
});
