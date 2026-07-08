import { describe, it, expect } from 'vitest';
import { assertPair } from './assert.js';
import type { FigmaNode, Pair, SemDp } from './types.js';

function mkPair(fig: Partial<FigmaNode>, sem: Partial<SemDp>): Pair {
  const figma: FigmaNode = {
    id: '1:101', name: 'Node', type: 'RECTANGLE',
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 20 }, ...fig,
  };
  const s: SemDp = {
    testTag: 'fig:1:101', text: null,
    positionDp: { x: 0, y: 0 }, sizeDp: { width: 100, height: 20 },
    touchBoundsDp: { left: 0, top: 0, right: 100, bottom: 20 },
    colorHex: null, fontSizeSp: null, cornerRadiusDp: null, children: [], ...sem,
  };
  return { figma, sem: s };
}

const has = (r: { violations: unknown[] }, property: string, severity: string): boolean =>
  (r.violations as Array<{ property: string; severity: string }>)
    .some((v) => v.property === property && v.severity === severity);

describe('assertPair 逐属性断言(±2dp/精确/±0.5sp/ΔE<3)', () => {
  // position:L1 距离≤2,high
  it('position 偏 3dp 记 high 违规', () => {
    const r = assertPair(mkPair({}, { positionDp: { x: 3, y: 0 } }));
    expect(has(r, 'position', 'high')).toBe(true);
  });
  it('position 偏 2dp(L1)不违规', () => {
    const r = assertPair(mkPair({}, { positionDp: { x: 2, y: 0 } }));
    expect(has(r, 'position', 'high')).toBe(false);
  });

  // size:各轴≤2,high
  it('size 宽差 5dp 记 high 违规', () => {
    const r = assertPair(mkPair({}, { sizeDp: { width: 105, height: 20 } }));
    expect(has(r, 'size', 'high')).toBe(true);
  });
  it('size 宽差 2dp 不违规', () => {
    const r = assertPair(mkPair({}, { sizeDp: { width: 102, height: 20 } }));
    expect(has(r, 'size', 'high')).toBe(false);
  });

  // fontSize:≤0.5sp,high(doc 完整示例)
  it('字号超过±0.5sp记high违规', () => {
    const r = assertPair(mkPair({ style: { fontSize: 16 } }, { fontSizeSp: 14 }));
    expect(r.violations).toContainEqual(expect.objectContaining({
      property: 'fontSize', expected: '16sp', actual: '14sp', severity: 'high',
    }));
  });
  it('字号偏差0.5sp内不违规且executed+1', () => {
    const r = assertPair(mkPair({ style: { fontSize: 16 } }, { fontSizeSp: 15.6 }));
    expect(has(r, 'fontSize', 'high')).toBe(false);
    expect(r.executed).toBe(3);   // position + size + fontSize
  });

  // color:ΔE00<3,high
  it('color 红 vs 蓝 记 high 违规', () => {
    const r = assertPair(mkPair(
      { fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }] }, { colorHex: '#0000FF' }));
    expect(has(r, 'color', 'high')).toBe(true);
  });
  it('color ΔE<3 近色不违规(#FF6633 vs #FE6532)', () => {
    const r = assertPair(mkPair(
      { fills: [{ type: 'SOLID', color: { r: 1, g: 0.4, b: 0.2, a: 1 } }] }, { colorHex: '#FE6532' }));
    expect(has(r, 'color', 'high')).toBe(false);
  });

  // cornerRadius:双侧可得时网格比,medium;sem null → 不执行
  it('cornerRadius 8 vs 4 记 medium 违规', () => {
    const r = assertPair(mkPair({ cornerRadius: 8 }, { cornerRadiusDp: 4 }));
    expect(has(r, 'cornerRadius', 'medium')).toBe(true);
  });
  it('cornerRadius sem null → 不执行不计分母', () => {
    const r = assertPair(mkPair({ cornerRadius: 8 }, { cornerRadiusDp: null }));
    expect(has(r, 'cornerRadius', 'medium')).toBe(false);
    expect(r.executed).toBe(2);   // 仅 position + size
  });

  // padding:容器 pair,首子相对父,0.5dp 网格,medium
  const container = (childX: number): Pair => mkPair(
    { paddingLeft: 12, absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 200 } },
    { positionDp: { x: 0, y: 0 }, sizeDp: { width: 200, height: 200 }, children: [{
      testTag: null, text: null, positionDp: { x: childX, y: 20 }, sizeDp: { width: 50, height: 20 },
      touchBoundsDp: { left: childX, top: 20, right: childX + 50, bottom: 40 },
      colorHex: null, fontSizeSp: null, cornerRadiusDp: null, children: [],
    }] });
  it('paddingLeft 12 vs 16 记 medium 违规', () =>
    expect(has(assertPair(container(16)), 'paddingLeft', 'medium')).toBe(true));
  it('paddingLeft 12 vs 12.4(网格内)不违规', () =>
    expect(has(assertPair(container(12.4)), 'paddingLeft', 'medium')).toBe(false));

  // itemSpacing:相邻子间距,0.5dp 网格,medium
  const stack = (gap: number): Pair => mkPair(
    { itemSpacing: 8, absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 200 } },
    { positionDp: { x: 0, y: 0 }, sizeDp: { width: 200, height: 200 }, children: [
      { testTag: null, text: null, positionDp: { x: 0, y: 0 }, sizeDp: { width: 50, height: 20 },
        touchBoundsDp: { left: 0, top: 0, right: 50, bottom: 20 },
        colorHex: null, fontSizeSp: null, cornerRadiusDp: null, children: [] },
      { testTag: null, text: null, positionDp: { x: 0, y: 20 + gap }, sizeDp: { width: 50, height: 20 },
        touchBoundsDp: { left: 0, top: 20 + gap, right: 50, bottom: 40 + gap },
        colorHex: null, fontSizeSp: null, cornerRadiusDp: null, children: [] },
    ] });
  it('itemSpacing 8 vs 12 记 medium 违规', () =>
    expect(has(assertPair(stack(12)), 'itemSpacing', 'medium')).toBe(true));
  it('itemSpacing 8 vs 8 不违规', () =>
    expect(has(assertPair(stack(8)), 'itemSpacing', 'medium')).toBe(false));

  it('违规对象带 judgePath=parity/testTag/figmaName', () => {
    const r = assertPair(mkPair({ name: 'Title', style: { fontSize: 16 } }, { fontSizeSp: 14 }));
    expect(r.violations[0]).toMatchObject({ judgePath: 'parity', testTag: 'fig:1:101', figmaName: 'Title' });
  });
});
