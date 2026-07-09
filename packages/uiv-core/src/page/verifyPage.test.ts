import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { pullBaseline } from '../baseline/pull.js';
import type { MappingStateRef } from '../baseline/mapping.js';
import { FixtureFigmaClient } from '../figma/client.js';
import type { GradleRunner } from '../check/run.js';
import type { SemNode, SemanticsDump } from '../l2/types.js';
import { verifyPage } from './verifyPage.js';
import type { VerifyPageOpts } from './verifyPage.js';

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

async function setup(): Promise<{ demoDir: string; uiVerifyDir: string }> {
  const root = mkdtempSync(join(tmpdir(), 'uiv-page-'));
  const demoDir = join(root, 'demo-android');
  const uiVerifyDir = join(root, '.ui-verify');
  mkdirSync(demoDir, { recursive: true });
  mkdirSync(uiVerifyDir, { recursive: true });
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
