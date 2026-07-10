import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, it, expect } from 'vitest';
import { FixtureFigmaClient } from '../figma/client.js';
import { pullBaseline } from '../baseline/pull.js';
import type { SpecNode } from '../figma/types.js';
import { runL2 } from '../l2/report.js';
import type { SemanticsDump } from '../l2/types.js';
import { validateReportV1 } from '../report/v1.js';
import { runCheckL2, specNodeToFigma } from './runL2.js';
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

  it('T2.8 慢车道默认 report.lane=slow', async () => {
    const { demoDir, uiVerifyDir } = await setup(goodDump());
    const { report } = await runCheckL2(new FakeRunner(0, ''), opts(demoDir, uiVerifyDir));
    expect(report.lane).toBe('slow');
  });

  it('T2.8 快车道 preRendered:跳过 gradle,worker PNG+语义树喂 L1/L2,lane=fast,L2 与慢车道等价', async () => {
    const { demoDir, uiVerifyDir } = await setup(goodDump());
    const stageDir = join(uiVerifyDir, 'renders');
    mkdirSync(stageDir, { recursive: true });
    const stagePng = join(stageDir, '.fast-stage.png');
    const stageSem = join(stageDir, '.fast-stage.semantics.json');
    writeWhitePng(stagePng);
    writeFileSync(stageSem, JSON.stringify(goodDump()), 'utf8');
    let gradleCalled = false;
    const spyRunner: GradleRunner = { async run() { gradleCalled = true; return { exitCode: 0, stderr: '' }; } };
    const { report } = await runCheckL2(spyRunner, {
      ...opts(demoDir, uiVerifyDir), lane: 'fast', preRendered: { renderedPng: stagePng, semanticsPath: stageSem },
    });
    expect(report.lane).toBe('fast');
    expect(report.pass).toBe(true);
    expect(report.structural?.matchRate).toBe(1);
    expect(report.structural?.untaggedCoverage).toBe(1);
    expect(gradleCalled).toBe(false);   // 快车道不跑 gradle
  });

  it('T2.8 快车道写偏(字号 14 应 16)→ violations 与慢车道一致(fontSize)', async () => {
    // 慢车道:同一写偏 dump 走 gradle 路径(FakeRunner + build/uiv)
    const slow = await setup(goodDump(14));
    const slowRes = await runCheckL2(new FakeRunner(0, ''), opts(slow.demoDir, slow.uiVerifyDir));
    // 快车道:同一写偏 dump 走 preRendered 路径
    const fast = await setup(goodDump(14));
    const stageDir = join(fast.uiVerifyDir, 'renders');
    mkdirSync(stageDir, { recursive: true });
    const stagePng = join(stageDir, '.fast-stage.png');
    const stageSem = join(stageDir, '.fast-stage.semantics.json');
    writeWhitePng(stagePng);
    writeFileSync(stageSem, JSON.stringify(goodDump(14)), 'utf8');
    const fastRes = await runCheckL2(new FakeRunner(0, ''), {
      ...opts(fast.demoDir, fast.uiVerifyDir), lane: 'fast', preRendered: { renderedPng: stagePng, semanticsPath: stageSem },
    });
    const key = (v: { property: string; testTag: string }): string => `${v.testTag}:${v.property}`;
    expect(new Set((fastRes.report.structural?.violations ?? []).map(key)))
      .toEqual(new Set((slowRes.report.structural?.violations ?? []).map(key)));
    expect(fastRes.report.pass).toBe(slowRes.report.pass);
  });

  it('编译失败 → v1 携 compileError, structural null, pass false', async () => {
    const { demoDir, uiVerifyDir } = await setup(goodDump());
    const runner = new FakeRunner(1, 'e: CalibCard.kt:5: unresolved reference\nFAILURE');
    const { report } = await runCheckL2(runner, opts(demoDir, uiVerifyDir));
    expect(report.compileError).toContain('unresolved');
    expect(report.structural).toBeNull();
    expect(report.pass).toBe(false);
  });

  // T3.3 复用面:semanticsMinMtimeMs(陈旧 dump 门)+ disableState(逐格不参与防震荡)。
  it('T3.3 semanticsMinMtimeMs:semantics.json 早于门 → semantics_export_failed(防上一格陈旧 dump 复用)', async () => {
    const { demoDir, uiVerifyDir } = await setup(goodDump());
    const semPath = join(demoDir, 'app', 'build', 'uiv', 'CalibCard.semantics.json');
    const old = new Date(Date.now() - 600_000);
    utimesSync(semPath, old, old);
    const { report } = await runCheckL2(new FakeRunner(0, ''), { ...opts(demoDir, uiVerifyDir), semanticsMinMtimeMs: Date.now() });
    expect(report.reason).toBe('inconclusive');
    expect(report.subReason).toBe('semantics_export_failed');
  });

  it('T3.3 disableState:不写 state.json,regression false', async () => {
    const { demoDir, uiVerifyDir } = await setup(goodDump());
    const { report, statePath } = await runCheckL2(new FakeRunner(0, ''), { ...opts(demoDir, uiVerifyDir), disableState: true });
    expect(existsSync(statePath)).toBe(false);
    expect(report.regression).toBe(false);
    expect(report.pass).toBe(true);
  });
});

function specNode(over: Partial<SpecNode>): SpecNode {
  return { id: '9:0', name: 'N', type: 'FRAME', visible: true, bbox: { x: 0, y: 0, w: 200, h: 200 },
    layoutMode: 'NONE', padding: { l: 0, t: 0, r: 0, b: 0 }, itemSpacing: 0, cornerRadii: null,
    fills: [], text: null, children: [], ...over };
}

// Codex D3:runL2 NONE 门单测 —— 两侧 children 完全对应(A′ 身份双射成立)、几何故意可派生出
// 非零值(padding 派生 16 vs 声明 10;spacing 派生 24 vs 声明 7),防 A′ 门误保护掩盖 NONE 门缺失。
// R1-① 后该几何为设计侧不自洽:若 NONE 门缺失,派生属性会被携带 → 设计侧门记
// design_derivation_mismatch skip → 仍被下方"无 skip diagnostic"断言检出。
describe('specNodeToFigma NONE 门(D3:NONE 不携带派生属性;VERTICAL 正控执行断言)', () => {
  const gateSpec = (layoutMode: SpecNode['layoutMode']): SpecNode => specNode({
    id: '9:1', layoutMode, padding: { l: 10, t: 10, r: 10, b: 10 }, itemSpacing: 7,
    children: [
      specNode({ id: '9:2', type: 'RECTANGLE', bbox: { x: 16, y: 16, w: 50, h: 20 } }),
      specNode({ id: '9:3', type: 'RECTANGLE', bbox: { x: 16, y: 60, w: 50, h: 20 } }),
    ],
  });
  const gateDump = { density: 2.0, root: sem('fig:9:1', 0, 0, 400, 400, null, null, [
    sem('fig:9:2', 32, 32, 100, 40), sem('fig:9:3', 32, 120, 100, 40),
  ]) } as SemanticsDump;

  it('NONE:padding/itemSpacing 不进 FigmaNode → 派生断言不执行(无违规、无 skip diagnostic、score 1)', () => {
    const report = runL2(specNodeToFigma(gateSpec('NONE')), gateDump, { prevState: null });
    expect(report.pass).toBe(true);
    expect(report.score).toBe(1);
    expect(report.structural?.violations).toEqual([]);
    expect((report.structural?.diagnostics.pixel ?? [])
      .filter((d) => d.code === 'l2_derived_geometry_skipped')).toEqual([]);
  });

  it('VERTICAL 正控:双射+设计侧双门放行 → 派生断言执行并检出 padding/itemSpacing 违规(门未误保护)', () => {
    // R1-①:正控须过设计侧可推导性门 → Figma 子几何与 authored 自洽(首子 (10,10) 对 pad l/t=10;
    // 末子右缘/底缘 190 对 pad r/b=10;间隙 37-30=7 对 gap=7);语义侧维持 16/60 几何 →
    // sem-derived padding 16 vs 10、spacing 24 vs 7 为真实实现偏差,必须检出。
    const consistentSpec = specNode({
      id: '9:1', layoutMode: 'VERTICAL', padding: { l: 10, t: 10, r: 10, b: 10 }, itemSpacing: 7,
      children: [
        specNode({ id: '9:2', type: 'RECTANGLE', bbox: { x: 10, y: 10, w: 180, h: 20 } }),
        specNode({ id: '9:3', type: 'RECTANGLE', bbox: { x: 10, y: 37, w: 180, h: 153 } }),
      ],
    });
    const report = runL2(specNodeToFigma(consistentSpec), gateDump, { prevState: null });
    const props = (report.structural?.violations ?? []).map((v) => v.property);
    expect(props).toContain('paddingLeft');
    expect(props).toContain('itemSpacing');
    expect((report.structural?.diagnostics.pixel ?? [])
      .filter((d) => d.code === 'l2_derived_geometry_skipped')).toEqual([]);   // 双门放行,无保守跳过
  });

  it('B1 透传:非 NONE 携带 layoutMode;NONE 不携带 layoutMode/padding/itemSpacing', () => {
    const vertical = specNodeToFigma(gateSpec('VERTICAL'));
    expect(vertical.layoutMode).toBe('VERTICAL');
    expect(vertical.itemSpacing).toBe(7);
    const none = specNodeToFigma(gateSpec('NONE'));
    expect(none.layoutMode).toBeUndefined();
    expect(none.paddingLeft).toBeUndefined();
    expect(none.itemSpacing).toBeUndefined();
  });

  // B3:primaryAxisAlignItems 在 layoutMode!==NONE 门内透传;spec 缺字段不得合成 own-property。
  it('B3-⑤ spec 携带 primaryAxisAlignItems → FigmaNode 透传', () => {
    const fig = specNodeToFigma(specNode({ layoutMode: 'VERTICAL', primaryAxisAlignItems: 'SPACE_BETWEEN' }));
    expect(fig.primaryAxisAlignItems).toBe('SPACE_BETWEEN');
  });
  it('B3-⑥ spec 缺字段 → FigmaNode 无 own-property(unknown 不得合成)', () => {
    const fig = specNodeToFigma(specNode({ layoutMode: 'VERTICAL' }));
    expect(Object.hasOwn(fig, 'primaryAxisAlignItems')).toBe(false);
  });
});

// Codex D4:spec fills opacity 透传到断言层(effective alpha;spec v0 无 node opacity,等于 paint opacity)。
describe('specNodeToFigma paint opacity 透传(D4)', () => {
  it('fills[].opacity 进 color.a(不再恒 1)', () => {
    const n = specNodeToFigma(specNode({
      fills: [{ type: 'SOLID', hex: '#FFFFFF', opacity: 0.9 }],
    }));
    expect(n.fills?.[0]?.color?.a).toBe(0.9);
    const opaque = specNodeToFigma(specNode({ fills: [{ type: 'SOLID', hex: '#FF0000', opacity: 1 }] }));
    expect(opaque.fills?.[0]?.color?.a).toBe(1);
  });

  it('R1-④a opacity=0 保真透传(?? 语义,0 不得回退 1)', () => {
    const zero = specNodeToFigma(specNode({ fills: [{ type: 'SOLID', hex: '#FF0000', opacity: 0 }] }));
    expect(zero.fills?.[0]?.color?.a).toBe(0);
  });
});
