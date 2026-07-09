import { describe, it, expect } from 'vitest';
import { joinByTag, toDp } from './join.js';
import { L2Error } from './types.js';
import type { FigmaNode, SemNode, SemanticsDump } from './types.js';

const fig = (id: string, x: number, y: number, w = 10, h = 10): FigmaNode =>
  ({ id, name: id, type: 'RECTANGLE', absoluteBoundingBox: { x, y, width: w, height: h } });

const sem = (tag: string | null, x: number, y: number, w: number, h: number, children: SemNode[] = []): SemNode => ({
  testTag: tag, text: null,
  positionInRoot: { x, y }, size: { width: w, height: h },
  touchBoundsInRoot: { left: x, top: y, right: x + w, bottom: y + h },
  colorHex: null, fontSizeSp: null, cornerRadiusPx: null, children,
});

// 全树带 tag 的 Figma 节点(含容器)按 fig:<nodeId> 确定性 join;px÷density 换算 dp,fontSizeSp 不换算。
describe('joinByTag(fig:<nodeId> 确定性 join + px÷density)', () => {
  const root: FigmaNode = {                    // 根 id 空 → 不参与 join,仅承载 3 叶子
    id: '', name: 'root', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 360, height: 200 },
    children: [fig('1:101', 12, 12), fig('1:102', 12, 36), fig('1:103', 12, 60)],
  };
  const dump: SemanticsDump = {
    density: 2.0,
    root: sem(null, 0, 0, 720, 400, [
      sem('fig:1:101', 24, 24, 400, 40),
      sem('fig:1:102', 24, 72, 400, 32),
      sem('fig:9:9', 48, 48, 20, 20),          // 多余 tag,无 Figma 对应
    ]),
  };

  it('pairs 命中 2 且 px÷2.0 → positionDp {12,12}', () => {
    const r = joinByTag(root, dump);
    expect(r.pairs).toHaveLength(2);
    expect(r.pairs[0]?.figma.id).toBe('1:101');
    expect(r.pairs[0]?.sem.positionDp).toEqual({ x: 12, y: 12 });
    expect(r.pairs[0]?.sem.sizeDp).toEqual({ width: 200, height: 20 });
    expect(r.pairs[0]?.sem.touchBoundsDp).toEqual({ left: 12, top: 12, right: 212, bottom: 32 });
  });

  it('missing = 未命中的 Figma 节点(1:103)', () => {
    const r = joinByTag(root, dump);
    expect(r.missing.map((n) => n.id)).toEqual(['1:103']);
  });

  it('extra = 无 Figma 对应的多余 dump tag(fig:9:9)', () => {
    const r = joinByTag(root, dump);
    expect(r.extra).toEqual(['fig:9:9']);
  });

  it('带 tag 的容器一并 join(供 padding 断言),子节点 dp 化保留', () => {
    const container: FigmaNode = {
      id: '1:100', name: 'Card', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 360, height: 200 },
      children: [fig('1:101', 12, 12)],
    };
    const d: SemanticsDump = {
      density: 2.0,
      root: sem('fig:1:100', 0, 0, 720, 400, [sem('fig:1:101', 24, 24, 400, 40)]),
    };
    const r = joinByTag(container, d);
    const containerPair = r.pairs.find((p) => p.figma.id === '1:100');
    expect(containerPair).toBeDefined();
    expect(containerPair?.sem.children[0]?.positionDp).toEqual({ x: 12, y: 12 });
  });

  it('cornerRadiusPx÷density 换算,fontSizeSp 原值不换算', () => {
    const d: SemanticsDump = {
      density: 2.0,
      root: sem(null, 0, 0, 720, 400, [{
        testTag: 'fig:1:101', text: 'Hi',
        positionInRoot: { x: 24, y: 24 }, size: { width: 100, height: 40 },
        touchBoundsInRoot: { left: 24, top: 24, right: 124, bottom: 64 },
        colorHex: '#FF9900', fontSizeSp: 16, cornerRadiusPx: 16, children: [],
      }]),
    };
    const r = joinByTag(root, d);
    expect(r.pairs[0]?.sem.cornerRadiusDp).toBe(8);   // 16px ÷ 2.0
    expect(r.pairs[0]?.sem.fontSizeSp).toBe(16);       // sp 不换算
    expect(r.pairs[0]?.sem.colorHex).toBe('#FF9900');
  });

  it('density≠2.0 抛 L2Error(render_harness_error)', () => {
    const bad: SemanticsDump = { density: 3.0, root: sem(null, 0, 0, 1, 1) };
    expect(() => joinByTag(root, bad)).toThrow(L2Error);
    try { joinByTag(root, bad); } catch (e) { expect((e as L2Error).subReason).toBe('render_harness_error'); }
  });

  // T3.4:toDp 透传 invariant 新字段。boundsInRoot(clipped px)÷density;布尔/字符串原样。
  it('toDp 透传新字段:boundsInRoot÷density,clickable/hasVisualOverflow/contentDescription 原样', () => {
    const n: SemNode = {
      testTag: 'fig:1:1', text: 'Hi',
      positionInRoot: { x: 24, y: 24 }, size: { width: 100, height: 40 },
      touchBoundsInRoot: { left: 24, top: 24, right: 124, bottom: 64 },
      colorHex: null, fontSizeSp: null, cornerRadiusPx: null,
      boundsInRoot: { left: 24, top: 24, right: 124, bottom: 44 },  // 高被父裁半(unclipped bottom 64→clipped 44)
      hasVisualOverflow: true, clickable: true, contentDescription: '头像',
      children: [],
    };
    const dp = toDp(n, 2.0);
    expect(dp.boundsDp).toEqual({ left: 12, top: 12, right: 62, bottom: 22 });   // ÷2.0
    expect(dp.hasVisualOverflow).toBe(true);
    expect(dp.clickable).toBe(true);
    expect(dp.contentDescription).toBe('头像');
  });

  it('toDp 未带新字段 → boundsDp/clickable/hasVisualOverflow/contentDescription 保持 undefined(不造默认值)', () => {
    const dp = toDp(sem('fig:1:2', 0, 0, 10, 10), 2.0);
    expect(dp.boundsDp).toBeUndefined();
    expect(dp.clickable).toBeUndefined();
    expect(dp.hasVisualOverflow).toBeUndefined();
    expect(dp.contentDescription).toBeUndefined();
  });
});
