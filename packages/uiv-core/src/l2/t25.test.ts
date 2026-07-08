import { describe, it, expect } from 'vitest';
import { matchThreeTier } from './match.js';
import { runL2 } from './report.js';
import { comparableNodes } from './nodeset.js';
import { validateReportV1 } from '../report/v1.js';
import type { FigmaNode, SemNode, SemanticsDump } from './types.js';

// ---- builder 规格(px = dp×2;根 (0,0) 免 rebase;Step 4 复用) ----
function fig(id: string, name: string, type: string, x: number, y: number, w: number, h: number,
            extra: Partial<FigmaNode> = {}): FigmaNode {
  return { id, name, type, absoluteBoundingBox: { x, y, width: w, height: h }, ...extra };
}
function sem(tag: string | null, text: string | null, x: number, y: number, w: number, h: number,
            fontSizeSp: number | null = null): SemNode {
  return {
    testTag: tag, text,
    positionInRoot: { x: x * 2, y: y * 2 }, size: { width: w * 2, height: h * 2 },
    touchBoundsInRoot: { left: x * 2, top: y * 2, right: (x + w) * 2, bottom: (y + h) * 2 },
    colorHex: null, fontSizeSp, cornerRadiusPx: null, children: [],
  };
}
const root = (kids: FigmaNode[]): FigmaNode => fig('1:100', 'Card', 'FRAME', 0, 0, 360, 200, { children: kids });
const dump = (kids: SemNode[]): SemanticsDump => ({ density: 2, root: { ...sem('fig:1:100', null, 0, 0, 360, 200), children: kids } });

describe('编排直测(tag→text→LCS + joinSource)', () => {
  it('容器只走 tag;text 归一化命中降级 1;缺 tag 容器入 containerMissing;多余 tag 被消费不入 extra', () => {
    const r = root([
      fig('1:101', 'T1', 'TEXT', 12, 12, 200, 20, { characters: 'Cal Card' }),
      fig('2:1', 'C', 'FRAME', 0, 100, 100, 100, { children: [fig('2:2', 'L', 'RECTANGLE', 5, 105, 20, 20)] }),
    ]);
    const m = matchThreeTier(r, dump([
      sem('fig:9:9', 'Cal  Card ', 12, 12, 200, 20),   // tag 无 Figma 对应,但被降级 1 消费
      sem('fig:2:2', null, 5, 105, 20, 20),
      sem(null, null, 300, 180, 9, 9),                 // 无对应,残留 unmatchedSem
    ]), comparableNodes(r, []));
    expect(m.pairs.find((p) => p.figma.id === '1:101')?.joinSource).toBe('text');
    expect(m.extra).toEqual([]);                       // fig:9:9 被降级消费,不再算多余
    expect(m.missingLeaves).toEqual([]);
    expect(m.containerMissing.map((n) => n.id)).toEqual(['2:1']);
    expect(m.unmatchedSem).toHaveLength(1);
  });
});

describe('降级 1 tie-break:重复文本不错配', () => {
  it('同文案两叶子按语义 (y,x) 序与 fig 同序确定性配对', () => {
    const s3 = root([
      fig('3:1', 'L1', 'TEXT', 10, 10, 60, 20, { characters: 'OK' }),
      fig('3:2', 'L2', 'TEXT', 10, 200, 60, 20, { characters: 'OK' }),
    ]);
    const m2 = matchThreeTier(s3, dump([
      sem(null, 'OK', 10, 10, 60, 20),
      sem(null, 'OK', 10, 200, 60, 20),
    ]), comparableNodes(s3, []));
    expect(m2.pairs.find((p) => p.figma.id === '3:1')?.sem.positionDp).toEqual({ x: 10, y: 10 });
    expect(m2.pairs.find((p) => p.figma.id === '3:2')?.sem.positionDp).toEqual({ x: 10, y: 200 });
    expect(m2.pairs.find((p) => p.figma.id === '3:1')?.joinSource).toBe('text');
    expect(m2.pairs.find((p) => p.figma.id === '3:2')?.joinSource).toBe('text');
  });
});

// ---- 验收六类端到端(fixture 级,runL2 全链路) ----
const SPEC = (): FigmaNode => root([
  fig('1:101', 'T1', 'TEXT', 12, 12, 200, 20, { characters: 'Ca' }),
  fig('1:102', 'T2', 'TEXT', 12, 36, 200, 16, { characters: 'Gk' }),
  fig('1:103', 'R1', 'RECTANGLE', 12, 60, 80, 40),
  fig('1:104', 'R2', 'RECTANGLE', 296, 12, 52, 20),
  fig('1:105', 'R3', 'RECTANGLE', 12, 160, 120, 16),
]);
const good = (): SemanticsDump => dump([
  sem('fig:1:101', 'Ca', 12, 12, 200, 20),
  sem('fig:1:102', 'Gk', 12, 36, 200, 16),
  sem('fig:1:103', null, 12, 60, 80, 40),
  sem('fig:1:104', null, 296, 12, 52, 20),
  sem('fig:1:105', null, 12, 160, 120, 16),
]);

describe('T2.5 验收六类', () => {
  it('① 文本命中 + 缺 tag 清单 + coverage 合同可配', () => {
    const d = good(); d.root.children[0]!.testTag = null;   // 1:101 丢 tag,靠文本补配
    const r = runL2(SPEC(), d, {});
    expect(r.structural?.matchedNodes).toContainEqual({ figmaId: '1:101', name: 'T1', joinSource: 'text' });
    expect(r.subReason).toBe('tag_coverage_low');            // cov=0.8,mr=1
    expect(r.structural?.untagged).toEqual([{ figmaId: '1:101', name: 'T1', suggestedTag: 'fig:1:101' }]);
    expect(r.pass).toBe(false);
    expect(runL2(SPEC(), d, { untaggedCoverageThreshold: 0.8 }).pass).toBe(true);   // 阈值放宽即过
  });

  it('② 文本也缺 → 走 LCS 补配', () => {
    const d = good(); d.root.children[2]!.testTag = null;   // 1:103 非文本叶,丢 tag → LCS
    const r = runL2(SPEC(), d, {});
    expect(r.structural?.matchedNodes).toContainEqual({ figmaId: '1:103', name: 'R1', joinSource: 'lcs' });
  });

  it('③ 交换位不错配 → 双入 missing,不得 pass', () => {
    const s2 = root([fig('2:1', 'T', 'TEXT', 10, 10, 200, 20, { characters: 'X' }), fig('2:2', 'B', 'RECTANGLE', 10, 40, 80, 40)]);
    const r = runL2(s2, dump([sem(null, 'Zw', 10, 40, 200, 20), sem(null, null, 10, 10, 80, 40)]), {});
    expect(r.structural?.missing.map((x) => x.figmaId).sort()).toEqual(['2:1', '2:2']);
    expect(r.pass).toBe(false);
  });

  it('④ 缺失组件 → missing 记录,mr=0.8 不熔断', () => {
    const d = good(); d.root.children.splice(3, 1);         // Badge 1:104 整节点缺
    const r = runL2(SPEC(), d, {});
    expect(r.structural?.missing.map((x) => x.figmaId)).toEqual(['1:104']);
    expect(r.structural?.matchFailure).toBeNull();           // mr=0.8 未熔断
    expect(r.pass).toBe(false);                              // cov=0.8
  });

  it('⑤ 低覆盖低匹配率不得 pass;调低阈值后熔断显形', () => {
    const d = dump([sem(null, 'AAAA', 200, 300, 10, 10), sem(null, null, 250, 350, 30, 5)]);
    const r = runL2(SPEC(), d, {});
    expect(r.pass).toBe(false);
    expect(r.subReason).toBe('tag_coverage_low');            // cov=0 优先于熔断
    // D-06:熔断只抑制 text/lcs 降级配对属性断言;5 叶全未配 → missing 硬失败照常生成(不受熔断门控)。
    expect(r.structural?.violations).toHaveLength(5);
    expect(r.structural?.violations.every((v) => v.property === 'missing')).toBe(true);
    expect(r.structural?.matchFailure?.unmatchedFigma).toHaveLength(5);
    const r2 = runL2(SPEC(), d, { untaggedCoverageThreshold: 0 });
    expect(r2.subReason).toBe('matching_rate_low');          // cov 门放开 → 熔断显形
    expect(r2.pass).toBe(false);
    expect(() => validateReportV1(r2)).not.toThrow();        // D-06:matching_rate_low ⇒ matchFailure 非空(violations 可含 missing 硬失败)
  });

  it('⑥ missing 硬失败:N=20 缺 1 叶,cov/mr 均达标仍不得 pass(反例)', () => {
    const leaves = Array.from({ length: 20 }, (_, i) => fig('9:' + i, 'L' + i, 'RECTANGLE', i * 20, 0, 16, 16));
    const s = root(leaves);
    const d6 = dump(leaves.slice(1).map((n) =>
      sem('fig:' + n.id, null, n.absoluteBoundingBox!.x, n.absoluteBoundingBox!.y, n.absoluteBoundingBox!.width, n.absoluteBoundingBox!.height)));
    const r = runL2(s, d6, {});
    expect(r.structural?.untaggedCoverage).toBe(0.95);       // 19/20 ≥ 0.9 不触 tag_coverage_low
    expect(r.structural?.matchRate).toBe(0.95);              // 19/20 ≥ 0.8 不熔断
    expect(r.subReason).toBeNull();
    expect(r.structural?.violations).toContainEqual(expect.objectContaining({ property: 'missing', severity: 'high' }));
    expect(r.pass).toBe(false);                              // missing 硬失败,不因 cov/mr 达标而放行
  });
});
