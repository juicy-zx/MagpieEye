import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, it, expect } from 'vitest';
import { FixtureFigmaClient } from '../figma/client.js';
import { pullBaseline } from '../baseline/pull.js';
import { validateReportV1 } from '../report/v1.js';
import { runCheckL2 } from './runL2.js';
import type { GradleRunner } from './run.js';

const FIXTURE = fileURLToPath(new URL('../../fixtures/rest-nodes-card.json', import.meta.url));
const REAL_SEMANTICS = fileURLToPath(new URL('../../fixtures/CalibCard.real.semantics.json', import.meta.url));
const TEST_FQN = 'com.magpie.uiv.demo.CalibCardScreenshotTest';

class FakeRunner implements GradleRunner {
  constructor(private exitCode: number, private stderr: string) {}
  async run(): Promise<{ exitCode: number; stderr: string }> { return { exitCode: this.exitCode, stderr: this.stderr }; }
}

function sem(tag: string | null, x: number, y: number, w: number, h: number,
            colorHex: string | null = null, fontSizeSp: number | null = null, children: unknown[] = []): unknown {
  return {
    testTag: tag, text: null, positionInRoot: { x, y }, size: { width: w, height: h },
    touchBoundsInRoot: { left: x, top: y, right: x + w, bottom: y + h },
    colorHex, fontSizeSp, cornerRadiusPx: null, children,
  };
}
function goodDump(titleFont = 16): unknown {
  return { density: 2.0, root: sem('fig:1:100', 0, 0, 720, 400, null, null, [
    sem('fig:1:101', 24, 24, 400, 40, '#FFFFFF', titleFont),
    sem('fig:1:102', 24, 72, 400, 32, '#CCE0FF', 12),
    sem('fig:1:103', 24, 120, 160, 80, '#FF9900', null),
    sem('fig:1:104', 592, 24, 104, 40, '#FF3B30', null),
  ]) };
}

function writeWhitePng(path: string): void {
  const png = new PNG({ width: 8, height: 8 });
  png.data.fill(255);
  writeFileSync(path, PNG.sync.write(png));
}

async function setup(dumpObj: unknown | null): Promise<{ demoDir: string; uiVerifyDir: string }> {
  const root = mkdtempSync(join(tmpdir(), 'uiv-l2-'));
  const demoDir = join(root, 'demo-android');
  const uiVerifyDir = join(root, '.ui-verify');
  mkdirSync(demoDir, { recursive: true });
  mkdirSync(uiVerifyDir, { recursive: true });
  // spec.json 经 fixture baseline pull(version T1_0A_V1)
  await pullBaseline(new FixtureFigmaClient(FIXTURE), 'FILEKEY', '1:100', uiVerifyDir);
  // rendered.png(供 v0 管线判成功)
  const outDir = join(demoDir, 'app', 'build', 'outputs', 'roborazzi');
  mkdirSync(outDir, { recursive: true });
  writeWhitePng(join(outDir, 'com.magpie.uiv.demo.CalibCardScreenshotTest.CalibCard.png'));
  // semantics.json(SemanticsDumpRule 落位)
  if (dumpObj !== null) {
    const uiDir = join(demoDir, 'app', 'build', 'uiv');
    mkdirSync(uiDir, { recursive: true });
    writeFileSync(join(uiDir, 'CalibCard.semantics.json'), JSON.stringify(dumpObj), 'utf8');
  }
  return { demoDir, uiVerifyDir };
}

function opts(demoDir: string, uiVerifyDir: string) {
  return { demoDir, testFqn: TEST_FQN, nodeId: '1:100', version: 'T1_0A_V1', uiVerifyDir };
}

describe('runCheckL2(uiv check 接入 L2,fixture 级不跑 gradle)', () => {
  it('正确 semantics → pass true, coverage 1, score 1, report.json v1 合法, state.json 落盘', async () => {
    const { demoDir, uiVerifyDir } = await setup(goodDump());
    const { report, reportPath, statePath } = await runCheckL2(new FakeRunner(0, ''), opts(demoDir, uiVerifyDir));
    expect(report.pass).toBe(true);
    expect(report.schemaVersion).toBe(1);
    expect(report.structural?.untaggedCoverage).toBe(1);
    expect(report.structural?.matchRate).toBe(1);
    expect(report.score).toBe(1);
    expect(existsSync(statePath)).toBe(true);
    // report.json 落盘且过 v1 校验
    expect(() => validateReportV1(JSON.parse(readFileSync(reportPath, 'utf8')))).not.toThrow();
    // semantics.json 复制到 renders/
    expect(existsSync(join(uiVerifyDir, 'renders', '1-100@T1_0A_V1', 'semantics.json'))).toBe(true);
  });

  it('写偏字号(14 应 16)→ pass false, violations 含 fontSize(exit 将为 1)', async () => {
    const { demoDir, uiVerifyDir } = await setup(goodDump(14));
    const { report } = await runCheckL2(new FakeRunner(0, ''), opts(demoDir, uiVerifyDir));
    expect(report.pass).toBe(false);
    expect(report.structural?.violations.map((v) => v.property)).toContain('fontSize');
  });

  it('缺 semantics.json → inconclusive(semantics_export_failed)', async () => {
    const { demoDir, uiVerifyDir } = await setup(null);
    const { report } = await runCheckL2(new FakeRunner(0, ''), opts(demoDir, uiVerifyDir));
    expect(report.reason).toBe('inconclusive');
    expect(report.subReason).toBe('semantics_export_failed');
    expect(report.pass).toBe(false);
  });

  // T1.3 收尾验收(Codex D-03):CalibCard.kt 改自定义 Layout 摆放(非 Modifier.offset)后,
  // 真实 Gradle/Robolectric 渲染产出的 semantics.json(而非手写 goodDump())喂给 runCheckL2,
  // 验证 positionInRoot 已是真实布局几何、L2 全过。fixture 为该次真实产出的原样快照。
  it('真实 Gradle 渲染 semantics.json(自定义 Layout 摆放)→ pass true, coverage/matchRate 1, score 1', async () => {
    const realDump: unknown = JSON.parse(readFileSync(REAL_SEMANTICS, 'utf8'));
    const { demoDir, uiVerifyDir } = await setup(realDump);
    const { report } = await runCheckL2(new FakeRunner(0, ''), opts(demoDir, uiVerifyDir));
    expect(report.pass).toBe(true);
    expect(report.structural?.untaggedCoverage).toBe(1);
    expect(report.structural?.matchRate).toBe(1);
    expect(report.score).toBe(1);
    expect(report.structural?.violations).toHaveLength(0);
  });

  it('编译失败 → v1 携 compileError, structural null, pass false', async () => {
    const { demoDir, uiVerifyDir } = await setup(goodDump());
    const runner = new FakeRunner(1, 'e: CalibCard.kt:5: unresolved reference\nFAILURE');
    const { report } = await runCheckL2(runner, opts(demoDir, uiVerifyDir));
    expect(report.compileError).toContain('unresolved');
    expect(report.structural).toBeNull();
    expect(report.pass).toBe(false);
  });
});
