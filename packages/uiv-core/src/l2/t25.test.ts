import { describe, it, expect } from 'vitest';
import { matchThreeTier } from './match.js';
import { comparableNodes } from './nodeset.js';
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
