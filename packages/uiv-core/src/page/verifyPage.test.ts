import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, expect, it, vi } from 'vitest';
import { pullBaseline } from '../baseline/pull.js';
import type { MappingStateRef } from '../baseline/mapping.js';
import { FixtureFigmaClient } from '../figma/client.js';
import type { GradleRunner } from '../check/run.js';
import type { SemNode, SemanticsDump } from '../l2/types.js';
import { verifyPage } from './verifyPage.js';
import type { VerifyPageOpts } from './verifyPage.js';
import type { VlmProvider } from './l3/provider.js';
import type { L3InputPack } from './l3/inputPack.js';

const FIXTURE = fileURLToPath(new URL('../../fixtures/rest-nodes-card.json', import.meta.url));
const TEST_FQN = 'com.magpie.uiv.demo.CalibPageScreenshotTest';   // shortName = CalibPage

function sem(tag: string | null, x: number, y: number, w: number, h: number,
            colorHex: string | null = null, fontSizeSp: number | null = null, children: SemNode[] = []): SemNode {
  return {
    testTag: tag, text: null, positionInRoot: { x, y }, size: { width: w, height: h },
    touchBoundsInRoot: { left: x, top: y, right: x + w, bottom: y + h },
    colorHex, fontSizeSp, cornerRadiusPx: null, children,
  };
}
/** 与 calib fixture 逐属性对齐的正确语义树(px = dp×2.0)。 */
function goodDump(): SemanticsDump {
  return { density: 2.0, graphicsMode: 'NATIVE', root: sem('fig:1:100', 0, 0, 720, 400, null, null, [
    sem('fig:1:101', 24, 24, 400, 40, '#FFFFFF', 16),
    sem('fig:1:102', 24, 72, 400, 32, '#CCE0FF', 12),
    sem('fig:1:103', 24, 120, 160, 80, '#FF9900', null),
    sem('fig:1:104', 592, 24, 104, 40, '#FF3B30', null),
  ]) };
}
/** 把首个子节点几何写偏(px 200 vs 期望 24 → positionDp 偏 88dp ≫ 2dp 容差)→ L2 position 高违规 → 整页 fail。 */
function badGeomDump(): SemanticsDump {
  return { density: 2.0, graphicsMode: 'NATIVE', root: sem('fig:1:100', 0, 0, 720, 400, null, null, [
    sem('fig:1:101', 200, 24, 400, 40, '#FFFFFF', 16),
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

/** 每次 run() 落 CalibPage_actual.png + build/uiv/CalibPage.semantics.json(均 fresh);记录 args。 */
class WritingRunner implements GradleRunner {
  calls: string[][] = [];
  constructor(private readonly exit = 0, private readonly dump: unknown = goodDump()) {}
  async run(cwd: string, args: string[]): Promise<{ exitCode: number; stderr: string }> {
    this.calls.push(args);
    if (this.exit === 0) {
      const robo = join(cwd, 'app', 'build', 'outputs', 'roborazzi');
      mkdirSync(robo, { recursive: true });
      writeWhitePng(join(robo, 'CalibPage_actual.png'));
      const ui = join(cwd, 'app', 'build', 'uiv');
      mkdirSync(ui, { recursive: true });
      writeFileSync(join(ui, 'CalibPage.semantics.json'), JSON.stringify(this.dump), 'utf8');
    }
    return { exitCode: this.exit, stderr: this.exit === 0 ? '' : 'infra boom without kotlin markers' };
  }
}

/** stderr 首行匹配 run.ts 的 COMPILE_ERROR_RE(`^e: `),第二行为不匹配的干扰行——验证真实提取链。 */
class CompileFailRunner implements GradleRunner {
  calls: string[][] = [];
  async run(cwd: string, args: string[]): Promise<{ exitCode: number; stderr: string }> {
    this.calls.push(args);
    return { exitCode: 1, stderr: 'e: /src/CalibCard.kt:5:10 Unresolved reference: foo\nFAILURE: Build failed with an exception.' };
  }
}

async function setup(): Promise<{ demoDir: string; uiVerifyDir: string }> {
  const root = mkdtempSync(join(tmpdir(), 'uiv-page-'));
  const demoDir = join(root, 'demo-android');
  const uiVerifyDir = join(root, '.ui-verify');
  mkdirSync(demoDir, { recursive: true });
  mkdirSync(uiVerifyDir, { recursive: true });
  mkdirSync(join(demoDir, 'app'), { recursive: true });   // 修正②:默认 :app 模块目录须在 gradle 调用前存在(fail-closed fixture)
  await pullBaseline(new FixtureFigmaClient(FIXTURE), 'FILEKEY', '1:100', uiVerifyDir);
  return { demoDir, uiVerifyDir };
}

function baseOpts(demoDir: string, uiVerifyDir: string, over: Partial<VerifyPageOpts> = {}): VerifyPageOpts {
  return {
    demoDir, testFqn: TEST_FQN, nodeId: '1:100', version: 'T1_0A_V1', uiVerifyDir,
    sessionId: 'standalone', matrix: 'custom:base/typical,pixel5-dark/typical', states: [], ...over,
  };
}

describe('verifyPage', () => {
  it('custom 2 格全绿:perCell 序/隔离/gradle 录参/sessionId/l3Verdicts;base parity full、dark parity geometry-only', async () => {
    const { demoDir, uiVerifyDir } = await setup();
    const runner = new WritingRunner();
    const { report, reportPath } = await verifyPage(runner, baseOpts(demoDir, uiVerifyDir));
    expect(report.pass).toBe(true);
    expect(report.sessionId).toBe('standalone');
    expect(report.kind).toBe('page-report');
    expect(report.l3Verdicts).toEqual([]);
    expect(report.perCell.map((c) => c.cellId)).toEqual(['base__typical', 'pixel5-dark__typical']);
    const [base, dark] = report.perCell;
    expect([base!.judgePath, base!.assertionScope]).toEqual(['parity', 'full']);
    expect([dark!.judgePath, dark!.assertionScope]).toEqual(['parity', 'geometry-only']);
    // 逐格产物隔离 cells/<cellId>/
    expect(base!.reportPath).toContain(join('cells', 'base__typical'));
    expect(dark!.reportPath).toContain(join('cells', 'pixel5-dark__typical'));
    expect(existsSync(join(uiVerifyDir, 'renders', '1-100@T1_0A_V1', 'cells', 'base__typical', 'semantics.json'))).toBe(true);
    // gradle 录参:每格一次,含 -Puiv.device / --rerun
    expect(runner.calls).toHaveLength(2);
    expect(runner.calls[0]).toEqual(expect.arrayContaining(['-Puiv.device=base', '-Puiv.state=typical', '--rerun']));
    expect(runner.calls[1]).toEqual(expect.arrayContaining(['-Puiv.device=pixel5-dark', '--rerun']));
    expect(existsSync(reportPath)).toBe(true);
    expect(report.classification.actionable).toBe(false);
  });

  it('渲染失败格 → 页 fail、分类 env-only、note=null、环境格入 environmentCells', async () => {
    const { demoDir, uiVerifyDir } = await setup();
    const { report } = await verifyPage(new WritingRunner(1), baseOpts(demoDir, uiVerifyDir));
    expect(report.pass).toBe(false);
    expect(report.classification.actionable).toBe(false);
    expect(report.classification.retryNoteCandidate).toBeNull();
    expect(report.classification.classes).toEqual(['environment_gap']);
    expect(report.classification.environmentCells).toEqual(['base__typical', 'pixel5-dark__typical']);
  });

  it('编译失败格 → 页 fail、分类含 implementation_gap、retryNoteCandidate 含编译摘要首行', async () => {
    const { demoDir, uiVerifyDir } = await setup();
    const { report } = await verifyPage(new CompileFailRunner(), baseOpts(demoDir, uiVerifyDir, { matrix: 'custom:base/typical' }));
    expect(report.pass).toBe(false);
    expect(report.classification.classes).toContain('implementation_gap');
    expect(report.classification.actionable).toBe(true);
    expect(report.classification.retryNoteCandidate).toContain('Unresolved reference: foo');
    expect(report.classification.retryNoteCandidate).not.toContain('FAILURE: Build failed');
    expect(report.classification.environmentCells).toEqual([]);
  });

  it('base×invariant-only 态(pinnedStates 命中)→ invariant-only;非 base 同态仍 render-only', async () => {
    const { demoDir, uiVerifyDir } = await setup();
    const pinnedStates: MappingStateRef[] = [{ name: 'empty', judgePath: 'invariant-only' }];
    const { report } = await verifyPage(new WritingRunner(), baseOpts(demoDir, uiVerifyDir, {
      matrix: 'custom:base/empty,fontScale1.3/empty', states: ['empty'], pinnedStates }));
    const base = report.perCell.find((c) => c.cellId === 'base__empty')!;
    const fs = report.perCell.find((c) => c.cellId === 'fontScale1.3__empty')!;
    expect([base.judgePath, base.assertionScope]).toEqual(['invariant-only', 'invariant-only']);
    expect([fs.judgePath, fs.assertionScope]).toEqual(['render-only', 'render-only']);
    expect(report.pass).toBe(true);   // goodDump 无 invariant 违规 + 渲染成功
  });

  it('--out 时另复制一份 page-report', async () => {
    const { demoDir, uiVerifyDir } = await setup();
    const outPath = join(mkdtempSync(join(tmpdir(), 'uiv-out-')), 'sessions', 'S1', 'ui-visual-validation.json');
    const { report } = await verifyPage(new WritingRunner(), baseOpts(demoDir, uiVerifyDir, { sessionId: 'S1', outPath }));
    expect(existsSync(outPath)).toBe(true);
    expect(report.sessionId).toBe('S1');
  });

  // 修正②(codex 019f6029)正控:所选模块目录不存在 → gradle 调用前 fail-closed,逐格 module_dir_missing、
  // 页级 env-only,且 gradle runner 未被调用(WritingRunner.calls 为空,证"执行前"失败);不惰性建目录。
  it('模块目录不存在 → 页 fail、逐格 module_dir_missing、env-only、gradle 未被调用', async () => {
    const { demoDir, uiVerifyDir } = await setup();   // 仅建 demoDir/app;:ghost 映射目录不存在
    const runner = new WritingRunner();
    const { report } = await verifyPage(runner, baseOpts(demoDir, uiVerifyDir, { moduleName: ':ghost' }));
    expect(report.pass).toBe(false);
    expect(runner.calls).toHaveLength(0);   // gradle 调用前失败:runner 零调用
    expect(report.perCell.map((c) => c.subReason)).toEqual(['module_dir_missing', 'module_dir_missing']);
    expect(report.classification.classes).toEqual(['environment_gap']);
    expect(report.classification.actionable).toBe(false);
    expect(existsSync(join(demoDir, 'ghost'))).toBe(false);   // 不惰性建目录
  });
});

describe('verifyPage L3 触发前置(T4.2)', () => {
  const NODE_DIR = '1-100@T1_0A_V1';
  it('L2 fail 整页 → pass false ∧ l3/ 目录不存在 ∧ l3Verdicts=[] ∧ page-report 原文不含 l3-input', async () => {
    const { demoDir, uiVerifyDir } = await setup();
    const { report, reportPath } = await verifyPage(new WritingRunner(0, badGeomDump()), baseOpts(demoDir, uiVerifyDir));
    expect(report.pass).toBe(false);
    expect(report.l3Verdicts).toEqual([]);
    expect(existsSync(join(uiVerifyDir, 'reports', NODE_DIR, 'l3'))).toBe(false);   // 零 L3 目录
    expect(readFileSync(reportPath, 'utf8')).not.toContain('l3-input');             // 报告原文零 L3 痕迹
  });

  it('全绿跑 → l3Verdicts 仍 [](轻量形态不自动回填);若 l3-input.json 存在则 cells triptychPath 齐落盘', async () => {
    const { demoDir, uiVerifyDir } = await setup();
    const { report } = await verifyPage(new WritingRunner(), baseOpts(demoDir, uiVerifyDir));
    expect(report.pass).toBe(true);
    expect(report.l3Verdicts).toEqual([]);
    const packPath = join(uiVerifyDir, 'reports', NODE_DIR, 'l3', 'l3-input.json');
    if (existsSync(packPath)) {
      const pack = JSON.parse(readFileSync(packPath, 'utf8')) as { cells: Array<{ triptychPath: string }> };
      for (const cell of pack.cells) expect(existsSync(cell.triptychPath)).toBe(true);
    }
  });
});

/** 真实 baseline.png(64×64 纯白)落盘到 baselines/<nodeDir>/,令 base 格 L1 真跑。 */
function seedBaseline(uiVerifyDir: string): string {
  const dir = join(uiVerifyDir, 'baselines', '1-100@T1_0A_V1');
  mkdirSync(dir, { recursive: true });
  const p = join(dir, 'baseline.png');
  const png = new PNG({ width: 64, height: 64 });
  png.data.fill(255);
  writeFileSync(p, PNG.sync.write(png));
  return p;
}

/** 读 baseline 尺寸动态生成"同尺寸但左上 16×16 抹红"的 actual → odiff 真产非空 clusters + diff.png 落盘。 */
class DiffingRunner implements GradleRunner {
  calls: string[][] = [];
  constructor(private readonly baselinePngPath: string, private readonly dump: unknown = goodDump()) {}
  async run(cwd: string, args: string[]): Promise<{ exitCode: number; stderr: string }> {
    this.calls.push(args);
    const base = PNG.sync.read(readFileSync(this.baselinePngPath));
    const actual = new PNG({ width: base.width, height: base.height });
    base.data.copy(actual.data);
    for (let y = 0; y < Math.min(16, base.height); y++) {
      for (let x = 0; x < Math.min(16, base.width); x++) {
        const o = (y * base.width + x) * 4;
        actual.data[o] = 255; actual.data[o + 1] = 0; actual.data[o + 2] = 0; actual.data[o + 3] = 255;
      }
    }
    const robo = join(cwd, 'app', 'build', 'outputs', 'roborazzi');
    mkdirSync(robo, { recursive: true });
    writeFileSync(join(robo, 'CalibPage_actual.png'), PNG.sync.write(actual));
    const ui = join(cwd, 'app', 'build', 'uiv');
    mkdirSync(ui, { recursive: true });
    writeFileSync(join(ui, 'CalibPage.semantics.json'), JSON.stringify(this.dump), 'utf8');
    return { exitCode: 0, stderr: '' };
  }
}

/** fake provider:记录调用;返回引用 pack 首簇的合法 fail + 一条 evidence 空的 fail(应被 drop)。 */
class FakeVlmProvider implements VlmProvider {
  calls: L3InputPack[] = [];
  async judge(pack: L3InputPack): Promise<unknown> {
    this.calls.push(pack);
    const cell = pack.cells[0];
    const cl = cell?.clusters[0];
    const evidence = cell !== undefined && cl !== undefined
      ? [{ cellId: cell.cellId, x: cl.x, y: cl.y, w: cl.w, h: cl.h }] : [];
    return [
      { item: 'color', verdict: 'fail', evidence, severity: 'high', suggestion: '颜色偏差' },
      { item: 'spacing', verdict: 'fail', evidence: [], severity: 'high', suggestion: '无证据(应 drop)' },
    ];
  }
}

describe('verifyPage vlm provider(T4.2 B3)', () => {
  const NODE_DIR = '1-100@T1_0A_V1';
  it('全绿 + 真实非空 clusters + 注入 fake → l3Verdicts 非空、无证据项 drop、全 fail 下 pass 仍 true', async () => {
    const { demoDir, uiVerifyDir } = await setup();
    const baselinePath = seedBaseline(uiVerifyDir);
    const fake = new FakeVlmProvider();
    const { report } = await verifyPage(new DiffingRunner(baselinePath), baseOpts(demoDir, uiVerifyDir, { vlmProvider: fake }));
    expect(report.pass).toBe(true);                    // L1/L2 全过
    expect(fake.calls).toHaveLength(1);                // pass ∧ pack 非 null → provider 调用一次
    expect(report.l3Verdicts.length).toBeGreaterThanOrEqual(1);
    expect(report.l3Verdicts.every((v) => v.verdict === 'fail')).toBe(true);
    expect(report.pass).toBe(true);                    // 全 fail verdict 不改 pass(仅建议不门禁)
    // 落盘 page-report.json 同步含回填后的 l3Verdicts
    const onDisk = JSON.parse(readFileSync(join(uiVerifyDir, 'reports', NODE_DIR, 'page-report.json'), 'utf8'));
    expect(onDisk.l3Verdicts.length).toBeGreaterThanOrEqual(1);
  });

  it('L2 fail + 真实 diff + 注入 fake → 触发前置对 provider 生效:fake.calls===0', async () => {
    const { demoDir, uiVerifyDir } = await setup();
    const baselinePath = seedBaseline(uiVerifyDir);
    const fake = new FakeVlmProvider();
    const { report } = await verifyPage(
      new DiffingRunner(baselinePath, badGeomDump()), baseOpts(demoDir, uiVerifyDir, { vlmProvider: fake }));
    expect(report.pass).toBe(false);
    expect(fake.calls).toHaveLength(0);                // pass=false → 整段 L3 块跳过,provider 零调用
    expect(report.l3Verdicts).toEqual([]);
  });

  it('provider judge 抛错 → advisory warn 后 report 正常返回、l3Verdicts []', async () => {
    const { demoDir, uiVerifyDir } = await setup();
    const baselinePath = seedBaseline(uiVerifyDir);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const throwing: VlmProvider = { judge: () => Promise.reject(new Error('provider boom')) };
    try {
      const { report } = await verifyPage(new DiffingRunner(baselinePath), baseOpts(demoDir, uiVerifyDir, { vlmProvider: throwing }));
      expect(report.pass).toBe(true);
      expect(report.l3Verdicts).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
