import { describe, it, expect } from 'vitest';
import { makeHint, runL2 } from './report.js';
import type { FigmaNode, SemNode, SemanticsDump, Violation } from './types.js';

// ---- 固定物料:Canonical Calibration Contract(绝对坐标,根在画布 (100,100)) ----
function calibSpec(): FigmaNode {
  return {
    id: '1:100', name: 'CalibCard', type: 'FRAME',
    absoluteBoundingBox: { x: 100, y: 100, width: 360, height: 200 }, cornerRadius: 8,
    fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.4, b: 0.8, a: 1 } }],
    children: [
      { id: '1:101', name: 'CalibTitle', type: 'TEXT', absoluteBoundingBox: { x: 112, y: 112, width: 200, height: 20 },
        characters: 'Calibration Card', style: { fontSize: 16 }, fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }] },
      { id: '1:102', name: 'CalibSubtitle', type: 'TEXT', absoluteBoundingBox: { x: 112, y: 136, width: 200, height: 16 },
        characters: 'Known geometry fixture', style: { fontSize: 12 }, fills: [{ type: 'SOLID', color: { r: 0.8, g: 0.878, b: 1, a: 1 } }] },
      { id: '1:103', name: 'CalibSwatch', type: 'RECTANGLE', absoluteBoundingBox: { x: 112, y: 160, width: 80, height: 40 },
        fills: [{ type: 'SOLID', color: { r: 1, g: 0.6, b: 0, a: 1 } }] },
      { id: '1:104', name: 'CalibBadge', type: 'RECTANGLE', absoluteBoundingBox: { x: 396, y: 112, width: 52, height: 20 },
        cornerRadius: 10, fills: [{ type: 'SOLID', color: { r: 1, g: 0.231, b: 0.188, a: 1 } }] },
    ],
  };
}

function sem(tag: string | null, x: number, y: number, w: number, h: number,
            colorHex: string | null = null, fontSizeSp: number | null = null, children: SemNode[] = []): SemNode {
  return {
    testTag: tag, text: null, positionInRoot: { x, y }, size: { width: w, height: h },
    touchBoundsInRoot: { left: x, top: y, right: x + w, bottom: y + h },
    colorHex, fontSizeSp, cornerRadiusPx: null, children,
  };
}

/** 与 calibSpec 逐属性对齐的正确语义树(px = dp×2.0,根在 (0,0))。 */
function goodDump(): SemanticsDump {
  return { density: 2.0, root: sem('fig:1:100', 0, 0, 720, 400, null, null, [
    sem('fig:1:101', 24, 24, 400, 40, '#FFFFFF', 16),
    sem('fig:1:102', 24, 72, 400, 32, '#CCE0FF', 12),
    sem('fig:1:103', 24, 120, 160, 80, '#FF9900', null),
    sem('fig:1:104', 592, 24, 104, 40, '#FF3B30', null),
  ]) };
}

const props = (vs: Violation[]): string[] => vs.map((v) => v.property);

describe('makeHint(确定性模板)', () => {
  it('同输入两次调用字符串全等', () => {
    const v: Violation = { judgePath: 'parity', testTag: 'fig:1:101', figmaName: 'CalibTitle',
      property: 'fontSize', expected: '16sp', actual: '14sp', severity: 'high', hint: '' };
    expect(makeHint(v, 'CalibTitle')).toBe(makeHint(v, 'CalibTitle'));
  });
  it('fontSize 违规 hint 含 TextStyle.fontSize 与 16sp', () => {
    const v: Violation = { judgePath: 'parity', testTag: 'fig:1:101', figmaName: 'CalibTitle',
      property: 'fontSize', expected: '16sp', actual: '14sp', severity: 'high', hint: '' };
    const h = makeHint(v, 'CalibTitle');
    expect(h).toContain('TextStyle.fontSize');
    expect(h).toContain('16sp');
  });
});

describe('runL2 组装(v1 结构块 + 顶层判定)', () => {
  it('合格 fixture → pass true, coverage/matchRate 1, score 1, 无违规', () => {
    const r = runL2(calibSpec(), goodDump(), {});
    expect(r.pass).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.structural?.untaggedCoverage).toBe(1);
    expect(r.structural?.matchRate).toBe(1);
    expect(r.score).toBe(1);
    expect(r.structural?.violations).toHaveLength(0);
    expect(r.regression).toBe(false);
  });

  it('去掉 3 个 tag → inconclusive(tag_coverage_low), pass false', () => {
    const d = goodDump();
    d.root.children[1]!.testTag = null;
    d.root.children[2]!.testTag = null;
    d.root.children[3]!.testTag = null;
    const r = runL2(calibSpec(), d, {});
    expect(r.structural?.untaggedCoverage).toBe(0.25);
    expect(r.reason).toBe('inconclusive');
    expect(r.subReason).toBe('tag_coverage_low');
    expect(r.pass).toBe(false);
  });

  it('写偏字号 → violations 恰 1 条(fontSize), pass false', () => {
    const d = goodDump();
    d.root.children[0]!.fontSizeSp = 14;    // 16 应 14
    const r = runL2(calibSpec(), d, {});
    expect(r.structural?.violations).toHaveLength(1);
    expect(r.structural?.violations[0]?.property).toBe('fontSize');
    expect(r.pass).toBe(false);
  });

  // 端到端(fixture 级,不跑 gradle):写偏 4 类 → position/fontSize/color 命中 violations,badge 命中 missing。
  it('端到端 4 类: padding(position)16应12 / 字号14应16 / swatch颜色偏 / badge缺失', () => {
    const bad: SemanticsDump = { density: 2.0, root: sem('fig:1:100', 0, 0, 720, 400, null, null, [
      sem('fig:1:101', 24, 24, 400, 40, '#FFFFFF', 14),   // 字号 14 应 16 → fontSize
      sem('fig:1:102', 32, 72, 400, 32, '#CCE0FF', 12),   // x px32→dp16 vs 12(左边距 16 应 12) → position
      sem('fig:1:103', 24, 120, 160, 80, '#0000FF', null),// 颜色 #0000FF vs #FF9900 → color
      // CalibBadge (1:104) 缺失 → structural.missing
    ]) };
    const r = runL2(calibSpec(), bad, {});
    expect(props(r.structural!.violations).sort()).toEqual(['color', 'fontSize', 'position']);
    expect(r.structural?.missing.map((m) => m.figmaId)).toEqual(['1:104']);
    expect(r.structural?.untaggedCoverage).toBe(0.75);          // badge 缺 tag → 3/4
    expect(r.reason).toBe('inconclusive');
    expect(r.subReason).toBe('tag_coverage_low');
    expect(r.pass).toBe(false);
    expect(r.score).toBeLessThan(1);
    expect(r.structural?.violations.every((v) => v.hint.length > 0)).toBe(true);
  });

  // 反例(钉死“容器命中不虚高”):容器有 tag、4 叶子全缺 tag → coverage/matchRate=0 且 inconclusive。
  it('反例:容器有tag、4叶子全缺tag → untaggedCoverage=0/matchRate=0 且 inconclusive', () => {
    const leaf = (id: string, name: string, x: number, y: number, w: number, h: number): FigmaNode => ({
      id, name, type: 'RECTANGLE', absoluteBoundingBox: { x, y, width: w, height: h },
    });
    const spec: FigmaNode = {
      id: '1:100', name: 'CalibCard', type: 'FRAME',
      absoluteBoundingBox: { x: 100, y: 100, width: 360, height: 200 },
      children: [
        { ...leaf('1:101', 'CalibTitle', 112, 112, 200, 20), type: 'TEXT', characters: 'Calibration Card', style: { fontSize: 16 } },
        { ...leaf('1:102', 'CalibSubtitle', 112, 136, 200, 16), type: 'TEXT', characters: 'Known geometry fixture', style: { fontSize: 12 } },
        leaf('1:103', 'CalibSwatch', 112, 160, 80, 40),
        leaf('1:104', 'CalibBadge', 396, 112, 52, 20),
      ],
    };
    const semLeaf = (x: number, y: number, w: number, h: number): SemNode =>
      sem(null, x, y, w, h);                    // 4 个叶子全缺 tag
    const dump: SemanticsDump = { density: 2.0, root: {
      ...semLeaf(0, 0, 720, 400), testTag: 'fig:1:100',   // 只有容器命中 tag
      children: [semLeaf(24, 24, 400, 40), semLeaf(24, 72, 400, 32), semLeaf(24, 120, 160, 80), semLeaf(592, 24, 104, 40)],
    } };
    const report = runL2(spec, dump, {});
    expect(report.structural?.untaggedCoverage).toBe(0);    // 容器命中不进分子
    expect(report.structural?.matchRate).toBe(0);
    expect(report.reason).toBe('inconclusive');
    expect(['tag_coverage_low', 'matching_rate_low']).toContain(report.subReason);
    expect(report.pass).toBe(false);
  });

  it('density≠2.0 → inconclusive(render_harness_error)', () => {
    const r = runL2(calibSpec(), { density: 1.0, root: sem(null, 0, 0, 1, 1) }, {});
    expect(r.reason).toBe('inconclusive');
    expect(r.subReason).toBe('render_harness_error');
    expect(r.pass).toBe(false);
  });
});
