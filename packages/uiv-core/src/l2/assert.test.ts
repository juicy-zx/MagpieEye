import { describe, it, expect } from 'vitest';
import { assertPair } from './assert.js';
import type { PixelSampleCtx } from './assert.js';
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

/** Figma 直接子节点(A′ 门身份双射的 Figma 侧)。 */
const figKid = (id: string, x: number, y: number, w: number, h: number): FigmaNode => ({
  id, name: `Kid-${id}`, type: 'RECTANGLE', absoluteBoundingBox: { x, y, width: w, height: h },
});
/** 语义直接子节点(tag=fig:<id> 时可与 figKid 形成身份映射)。 */
const semKid = (tag: string | null, x: number, y: number, w: number, h: number): SemDp => ({
  testTag: tag, text: null, positionDp: { x, y }, sizeDp: { width: w, height: h },
  touchBoundsDp: { left: x, top: y, right: x + w, bottom: y + h },
  colorHex: null, fontSizeSp: null, cornerRadiusDp: null, children: [],
});

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

  // padding:容器 pair,首子相对父,0.5dp 网格,medium。
  // A′ 门口径改造(Codex D1):figma 侧补直接子节点、sem 子挂 fig:<id> tag 使身份双射成立,派生断言本身仍被验证。
  // R1-①:设计侧可推导性门要求 Figma 子几何与 authored padding 一致(fig 子恒 x=12),偏差注入语义侧。
  const container = (semChildX: number): Pair => mkPair(
    { paddingLeft: 12, absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 200 },
      children: [figKid('1:201', 12, 20, 50, 20)] },
    { positionDp: { x: 0, y: 0 }, sizeDp: { width: 200, height: 200 },
      children: [semKid('fig:1:201', semChildX, 20, 50, 20)] });
  it('paddingLeft 12 vs 16 记 medium 违规', () =>
    expect(has(assertPair(container(16)), 'paddingLeft', 'medium')).toBe(true));
  it('paddingLeft 12 vs 12.4(网格内)不违规', () =>
    expect(has(assertPair(container(12.4)), 'paddingLeft', 'medium')).toBe(false));

  // itemSpacing:相邻子间距,0.5dp 网格,medium(B1:轴向由 layoutMode 决定,VERTICAL=y 轴)。
  // R1-①:Figma 子间隙恒 8(与 authored 一致过设计侧门),偏差注入语义侧。
  const stack = (semGap: number): Pair => mkPair(
    { itemSpacing: 8, layoutMode: 'VERTICAL', absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 200 },
      children: [figKid('1:201', 0, 0, 50, 20), figKid('1:202', 0, 28, 50, 20)] },
    { positionDp: { x: 0, y: 0 }, sizeDp: { width: 200, height: 200 }, children: [
      semKid('fig:1:201', 0, 0, 50, 20),
      semKid('fig:1:202', 0, 20 + semGap, 50, 20),
    ] });
  it('itemSpacing 8 vs 12 记 medium 违规', () =>
    expect(has(assertPair(stack(12)), 'itemSpacing', 'medium')).toBe(true));
  it('itemSpacing 8 vs 8 不违规', () =>
    expect(has(assertPair(stack(8)), 'itemSpacing', 'medium')).toBe(false));

  it('违规对象带 judgePath=parity/testTag/figmaName', () => {
    const r = assertPair(mkPair({ name: 'Title', style: { fontSize: 16 } }, { fontSizeSp: 14 }));
    expect(r.violations[0]).toMatchObject({ judgePath: 'parity', testTag: 'fig:1:101', figmaName: 'Title' });
  });

  // T3.3:excludeProperties(geometry-only 排除 color)—— 命中属性不产 violation、不计 executed。
  it('T3.3 excludeProperties=[color]:无 color 违规且 executed 减少', () => {
    const pair = mkPair({ fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }] }, { colorHex: '#0000FF' });
    const full = assertPair(pair);
    const noColor = assertPair(pair, undefined, ['color']);
    expect(has(full, 'color', 'high')).toBe(true);
    expect(noColor.violations.some((v) => v.property === 'color')).toBe(false);
    expect(noColor.executed).toBe(full.executed - 1);   // 少一次 color 断言
  });
});

describe('assertPair 像素采样颜色通道(T2.7)', () => {
  const px = (r: number, g: number, b: number): PixelSampleCtx => ({
    png: { width: 4, height: 4, data: Uint8Array.from({ length: 64 }, (_, i) => [r, g, b, 255][i % 4] as number) },
    density: 2,
  });
  const fig = { absoluteBoundingBox: { x: 0, y: 0, width: 2, height: 2 },   // spec #FF9900
    fills: [{ type: 'SOLID', color: { r: 1, g: 0.6, b: 0, a: 1 } }] };
  const sem = { sizeDp: { width: 2, height: 2 } };   // dp×2 = px(0,0,4,4)

  it('非文本叶子:偏色→parity-pixel-sampled(alpha=1 正控,ΔE 超阈产 high);同色不违规计 executed;无 ctx 不执行', () => {
    const bad = assertPair(mkPair(fig, sem), px(0xff, 0x66, 0x00));
    expect(bad.violations).toContainEqual(expect.objectContaining({
      judgePath: 'parity-pixel-sampled', property: 'color',
      expected: '#FF9900', actual: '#FF6600', severity: 'high' }));
    const ok = assertPair(mkPair(fig, sem), px(0xff, 0x99, 0x00));
    expect(has(ok, 'color', 'high')).toBe(false);
    expect(ok.executed).toBe(3);                            // position+size+color
    expect(assertPair(mkPair(fig, sem)).executed).toBe(2);  // 无 ctx 跳过
  });
  it('跳过三态记 diagnostics 不计 executed:非纯色/容器/完全越界', () => {
    const cases: Array<[string, Pair]> = [
      ['pixel_sample_skipped_nonsolid', mkPair({ ...fig, fills: [{ type: 'GRADIENT_LINEAR' }] }, sem)],
      ['pixel_sample_skipped_container', mkPair(fig, { ...sem, children: [mkPair({}, {}).sem] })],
      ['pixel_sample_empty_region', mkPair(fig, { ...sem, positionDp: { x: 99, y: 99 } })],
    ];
    for (const [code, pair] of cases) {
      const r = assertPair(pair, px(1, 2, 3));
      expect(r.diagnostics).toContainEqual(expect.objectContaining({ code }));
      expect(r.executed).toBe(2);
    }
  });
  it('文本节点恒走语义通道(subtitle 语义色检出保留)', () => {
    const r = assertPair(mkPair(
      { fills: [{ type: 'SOLID', color: { r: 0.8, g: 0.878, b: 1, a: 1 } }] },  // #CCE0FF
      { colorHex: '#99B3E6' }), px(0x99, 0xb3, 0xe6));
    expect(r.violations).toContainEqual(expect.objectContaining({ judgePath: 'parity', property: 'color' }));
  });
});

// Codex D1(A′+B1+B2)/D2:派生断言结构可判定门 —— 身份双射不成立/轴向不可知时保守跳过并记 diagnostic。
describe('assertPair 派生几何门(A′ 身份双射 + B1/B2 轴向,Codex D1/D2)', () => {
  const skipOf = (r: { diagnostics: Array<Record<string, unknown>> }): Array<Record<string, unknown>> =>
    r.diagnostics.filter((d) => d['code'] === 'l2_derived_geometry_skipped');

  it('A′ 拍平中间容器(yanhao 最小重现):sem 子 tag 非 Figma 直接子 id → 跳过派生、不计 executed、记 diagnostic', () => {
    // Figma:父 → 中间容器 1:210(未挂 tag,被语义树拍平)→ 孙 1:211;直接子集合 {1:210, 1:212}。
    // 语义:直接子 = 孙 1:211 + 1:212 → 身份双射不成立(1:211 ∉ 直接子集合)。
    const middle: FigmaNode = { ...figKid('1:210', 0, 16, 360, 200), children: [figKid('1:211', 16, 28, 302, 80)] };
    const pair = mkPair(
      { paddingLeft: 0, paddingTop: 16, itemSpacing: 20, layoutMode: 'VERTICAL',
        absoluteBoundingBox: { x: 0, y: 0, width: 360, height: 475 },
        children: [middle, figKid('1:212', 0, 427, 360, 48)] },
      { positionDp: { x: 0, y: 0 }, sizeDp: { width: 360, height: 475 }, children: [
        semKid('fig:1:211', 16, 28, 302, 80), semKid('fig:1:212', 0, 427, 360, 48),
      ] });
    const r = assertPair(pair);
    expect(r.violations).toEqual([]);            // 修复前:paddingLeft 16/paddingTop 28/itemSpacing 319 三条假违规
    expect(r.executed).toBe(2);                  // 仅 position + size
    expect(skipOf(r)).toEqual([expect.objectContaining({
      code: 'l2_derived_geometry_skipped', nodeId: '1:101',
      reason: 'direct_child_correspondence_unproven',
      rules: ['padding', 'itemSpacing'], semChildCount: 2, figChildCount: 2,
    })]);
  });

  it('A′ 语义子未挂 tag:数量相等也不放行(身份不可证)', () => {
    const r = assertPair(mkPair(
      { paddingLeft: 5, children: [figKid('1:201', 10, 10, 20, 20)] },
      { children: [semKid(null, 10, 10, 20, 20)] }));
    expect(r.violations).toEqual([]);            // 修复前:paddingLeft 派生 10 vs 5 假违规
    expect(skipOf(r)).toEqual([expect.objectContaining({
      reason: 'direct_child_correspondence_unproven', rules: ['padding'], semChildCount: 1, figChildCount: 1,
    })]);
  });

  it('A′ 两侧直接子数量不等 → 跳过(Figma 1 子被语义树拍平为 2)', () => {
    const r = assertPair(mkPair(
      { paddingLeft: 12, children: [figKid('1:201', 12, 6, 78, 20)] },
      { children: [semKid('fig:1:202', 12, 6, 20, 20), semKid('fig:1:203', 40, 6, 50, 20)] }));
    expect(r.violations).toEqual([]);
    expect(skipOf(r)).toEqual([expect.objectContaining({
      reason: 'direct_child_correspondence_unproven', semChildCount: 2, figChildCount: 1,
    })]);
  });

  it('A′ tag 重复(非单射)→ 跳过', () => {
    const r = assertPair(mkPair(
      { paddingLeft: 0, children: [figKid('1:201', 0, 0, 20, 20), figKid('1:202', 0, 30, 20, 20)] },
      { children: [semKid('fig:1:201', 0, 0, 20, 20), semKid('fig:1:201', 0, 30, 20, 20)] }));
    expect(r.violations).toEqual([]);
    expect(skipOf(r)).toHaveLength(1);
  });

  it('R2-② Figma 侧重复 id(figKids [A,A] × sem [A,B])→ 双射 fail-closed 跳过(修复前错误放行 [semA,semA])', () => {
    const r = assertPair(mkPair(
      { paddingLeft: 0, absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 60 },
        children: [figKid('1:201', 0, 0, 20, 20), figKid('1:201', 0, 30, 20, 20)] },
      { sizeDp: { width: 200, height: 60 }, children: [
        semKid('fig:1:201', 0, 0, 20, 20), semKid('fig:1:202', 0, 30, 20, 20),
      ] }));
    expect(r.violations).toEqual([]);
    expect(r.executed).toBe(2);                  // 仅 position + size,padding 不得放行执行
    expect(skipOf(r)).toEqual([expect.objectContaining({
      reason: 'direct_child_correspondence_unproven', rules: ['padding'], semChildCount: 2, figChildCount: 2,
    })]);
  });

  // R2-①:want* 入口不得因单侧数量不足而静默漏报 —— 任一侧达最小基数即入门,
  // 数量不对称由双射门 fail-closed 记 diagnostic;两侧都不足最小基数才视为天然不可观察。
  it('R2-① Figma 1 直接子 / 语义 0 子 / authored padding:修复前静默无 diagnostic → correspondence_unproven', () => {
    const r = assertPair(mkPair(
      { paddingLeft: 12, children: [figKid('1:201', 12, 6, 78, 20)] },
      { children: [] }));
    expect(r.violations).toEqual([]);
    expect(skipOf(r)).toEqual([expect.objectContaining({
      reason: 'direct_child_correspondence_unproven', rules: ['padding'], semChildCount: 0, figChildCount: 1,
    })]);
  });

  it('R2-① Figma 2 子 / 语义 1 子 / 仅 authored itemSpacing:修复前静默无 diagnostic → correspondence_unproven', () => {
    const r = assertPair(mkPair(
      { itemSpacing: 8, layoutMode: 'VERTICAL',
        children: [figKid('1:201', 0, 0, 50, 20), figKid('1:202', 0, 28, 50, 20)] },
      { children: [semKid('fig:1:201', 0, 0, 50, 20)] }));
    expect(r.violations).toEqual([]);
    expect(skipOf(r)).toEqual([expect.objectContaining({
      reason: 'direct_child_correspondence_unproven', rules: ['itemSpacing'], semChildCount: 1, figChildCount: 2,
    })]);
  });

  it('R2-① 边界:两侧都不足最小基数(authored padding、双侧 0 子)→ 天然不可观察,无 diagnostic', () => {
    const r = assertPair(mkPair({ paddingLeft: 12 }, {}));
    expect(r.violations).toEqual([]);
    expect(skipOf(r)).toEqual([]);
  });

  it('A′ 不可见/无 bbox 的 Figma 子不入可见集:映射到它的 sem 子 → 跳过', () => {
    const hidden: FigmaNode = { ...figKid('1:201', 0, 0, 20, 20), visible: false };
    const r = assertPair(mkPair(
      { paddingLeft: 0, children: [hidden, figKid('1:202', 0, 30, 20, 20)] },
      { children: [semKid('fig:1:201', 0, 0, 20, 20), semKid('fig:1:202', 0, 30, 20, 20)] }));
    expect(r.violations).toEqual([]);
    expect(skipOf(r)).toEqual([expect.objectContaining({ semChildCount: 2, figChildCount: 1 })]);
  });

  it('B1 layoutMode undefined:不得默认 VERTICAL —— padding 照常执行,itemSpacing 跳过(layout_mode_missing)', () => {
    // y 轴派生 = 60-(20+20) = 20 ≠ 8:若误按 VERTICAL 执行必产假违规。
    const r = assertPair(mkPair(
      { paddingLeft: 12, itemSpacing: 8, absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 200 },
        children: [figKid('1:201', 12, 20, 50, 20), figKid('1:202', 12, 60, 50, 20)] },
      { positionDp: { x: 0, y: 0 }, sizeDp: { width: 200, height: 200 }, children: [
        semKid('fig:1:201', 12, 20, 50, 20), semKid('fig:1:202', 12, 60, 50, 20),
      ] }));
    expect(r.violations).toEqual([]);
    expect(r.executed).toBe(3);                  // position + size + paddingLeft(spacing 不计)
    expect(skipOf(r)).toEqual([expect.objectContaining({
      reason: 'layout_mode_missing', rules: ['itemSpacing'],
    })]);
  });

  it('B2 HORIZONTAL 按 x 轴派生:gap 8 匹配不违规(修复前恒按 y 轴派生 -20 假违规)', () => {
    // R1-①:Figma 第二子恒 x=58(design-derived 8 = authored 过门),语义偏差注入 semX2。
    const row = (semX2: number): Pair => mkPair(
      { itemSpacing: 8, layoutMode: 'HORIZONTAL', absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 20 },
        children: [figKid('1:201', 0, 0, 50, 20), figKid('1:202', 58, 0, 50, 20)] },
      { positionDp: { x: 0, y: 0 }, sizeDp: { width: 200, height: 20 }, children: [
        semKid('fig:1:201', 0, 0, 50, 20), semKid('fig:1:202', semX2, 0, 50, 20),
      ] });
    expect(assertPair(row(58)).violations).toEqual([]);                       // 50+8=58 → 派生 8 ✓
    expect(assertPair(row(62)).violations).toContainEqual(expect.objectContaining({
      property: 'itemSpacing', expected: '8', actual: '12', severity: 'medium',
    }));
  });

  it('B2 文档顺序优先于坐标排序:负 spacing/乱序 sem 数组按 Figma 子顺序对齐,且不改 sem.children 原数组', () => {
    // Figma 文档顺序:1:201(x=60) 在前、1:202(x=0) 在后 → 派生 = 0-(60+30) = -90;坐标排序会误得 30。
    const pair = mkPair(
      { itemSpacing: -90, layoutMode: 'HORIZONTAL', absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 20 },
        children: [figKid('1:201', 60, 0, 30, 20), figKid('1:202', 0, 0, 30, 20)] },
      { positionDp: { x: 0, y: 0 }, sizeDp: { width: 200, height: 20 }, children: [
        semKid('fig:1:202', 0, 0, 30, 20), semKid('fig:1:201', 60, 0, 30, 20),   // sem 数组顺序故意与文档顺序相反
      ] });
    const before = pair.sem.children.map((c) => c.testTag);
    expect(assertPair(pair).violations).toEqual([]);
    expect(pair.sem.children.map((c) => c.testTag)).toEqual(before);   // 禁止原地改 children
  });

  it('B2 GRID(非 flow 拓扑)→ itemSpacing 保守跳过(unsupported_layout)', () => {
    const r = assertPair(mkPair(
      { itemSpacing: 4, layoutMode: 'GRID',
        children: [figKid('1:201', 0, 0, 20, 20), figKid('1:202', 30, 0, 20, 20)] },
      { children: [semKid('fig:1:201', 0, 0, 20, 20), semKid('fig:1:202', 30, 0, 20, 20)] }));
    expect(r.violations).toEqual([]);
    expect(skipOf(r)).toEqual([expect.objectContaining({
      reason: 'unsupported_layout', rules: ['itemSpacing'],
    })]);
  });
});

// R1-①(Codex):设计侧可推导性门 —— 身份双射成立后,同一套包络/相邻间隙 derivation 先跑在
// Figma direct-child bbox 上;design-derived ≈ authored(同 0.5dp 网格容差)的规则才拿
// semantic-derived 去比,不可重建的规则按规则粒度跳过并记 design_derivation_mismatch
// (与 correspondence_unproven 区分)。门只消费设计数据 → 真实实现偏差不会借道变成 skip。
describe('assertPair 设计侧可推导性门(R1-①,design_derivation_mismatch)', () => {
  const mismatchOf = (r: { diagnostics: Array<Record<string, unknown>> }): Array<Record<string, unknown>> =>
    r.diagnostics.filter((d) => d['reason'] === 'design_derivation_mismatch');

  it('Codex 反例 fixed-size+counter-axis CENTER:包络推导左右各 60 ≠ authored 20 → 两条 padding 规则跳过(修复前 2 条 medium 假违规)', () => {
    // 父宽 200,authored paddingLeft/Right=20,唯一子宽 80 居中(x=60);语义侧如实镜像设计(实现无偏差)。
    const r = assertPair(mkPair(
      { paddingLeft: 20, paddingRight: 20, absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 60 },
        children: [figKid('1:201', 60, 0, 80, 60)] },
      { sizeDp: { width: 200, height: 60 }, children: [semKid('fig:1:201', 60, 0, 80, 60)] }));
    expect(r.violations).toEqual([]);            // 修复前:paddingLeft 60/paddingRight 60 两条 medium 假违规
    expect(r.executed).toBe(2);                  // 仅 position + size,两条 padding 规则不计
    expect(mismatchOf(r)).toEqual([expect.objectContaining({
      code: 'l2_derived_geometry_skipped', reason: 'design_derivation_mismatch',
      rules: ['paddingLeft', 'paddingRight'],
    })]);
  });

  it('MAX 对齐按规则粒度:paddingLeft 不可重建跳过,paddingRight 可重建照常执行且仍检出语义侧真实偏差', () => {
    // authored L=20/R=20;子 w=80 对齐 MAX(x=100):design left=100≠20 → 跳过;design right=200-180=20 → 执行。
    const mk = (semX: number): Pair => mkPair(
      { paddingLeft: 20, paddingRight: 20, absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 60 },
        children: [figKid('1:201', 100, 0, 80, 60)] },
      { sizeDp: { width: 200, height: 60 }, children: [semKid('fig:1:201', semX, 0, 80, 60)] });
    const ok = assertPair(mk(100));              // 语义镜像设计
    expect(ok.violations).toEqual([]);
    expect(ok.executed).toBe(3);                 // position + size + paddingRight(left 不计)
    expect(mismatchOf(ok)).toEqual([expect.objectContaining({ rules: ['paddingLeft'] })]);
    const drift = assertPair(mk(96));            // 真实实现偏差:右缘 96+80=176 → sem-derived right 24
    expect(drift.violations).toContainEqual(expect.objectContaining({
      property: 'paddingRight', expected: '20', actual: '24', severity: 'medium',
    }));
  });

  it('SPACE_BETWEEN 止血(yanhao 根真实几何):authored gap 20 vs design-derived 211 → itemSpacing 跳过,可重建的 paddingTop 照常执行', () => {
    // yanhao 39:10844:VERTICAL,pad t=16,gap 20;直接子 (0,16,360,200)/(0,427,360,48) → design gap = 427-216 = 211。
    const r = assertPair(mkPair(
      { paddingTop: 16, itemSpacing: 20, layoutMode: 'VERTICAL',
        absoluteBoundingBox: { x: 0, y: 0, width: 360, height: 475 },
        children: [figKid('39:10845', 0, 16, 360, 200), figKid('39:10846', 0, 427, 360, 48)] },
      { sizeDp: { width: 360, height: 475 }, children: [
        semKid('fig:39:10845', 0, 16, 360, 200), semKid('fig:39:10846', 0, 427, 360, 48),
      ] }));
    expect(r.violations).toEqual([]);            // 修复前:itemSpacing 20 vs 211 medium 假违规
    expect(r.executed).toBe(3);                  // position + size + paddingTop
    expect(mismatchOf(r)).toEqual([expect.objectContaining({ rules: ['itemSpacing'] })]);
  });

  it('父 bbox 缺失:design-derived 不可得 → padding 规则全部跳过(不回退语义侧派生)', () => {
    const r = assertPair(mkPair(
      { paddingLeft: 5, absoluteBoundingBox: null, children: [figKid('1:201', 10, 10, 20, 20)] },
      { children: [semKid('fig:1:201', 10, 10, 20, 20)] }));
    expect(r.violations).toEqual([]);            // 修复前:sem 派生 10 vs 5 假违规
    expect(r.executed).toBe(0);                  // fb null:position/size 亦不可执行
    expect(mismatchOf(r)).toEqual([expect.objectContaining({ rules: ['paddingLeft'] })]);
  });
});

// B3(Codex D3/D4):显式 SPACE_BETWEEN 门 —— 双射门之后、mode∈{H,V} 判定之后、designGap 之前,
// 一律跳 itemSpacing(authored gap 语义是"剩余空间等分",数值偶合不构成可断言性);不提前返回,
// padding 继续原断言。缺字段(旧 spec unknown)不触发本门,维持设计门兜底(上方 SPACE_BETWEEN 止血用例即反控)。
describe('assertPair 显式 SPACE_BETWEEN 门(B3,primary_axis_space_between)', () => {
  const skipOf = (r: { diagnostics: Array<Record<string, unknown>> }): Array<Record<string, unknown>> =>
    r.diagnostics.filter((d) => d['code'] === 'l2_derived_geometry_skipped');

  it('B3-⑦ 双射成立:恰 1 条 primary_axis_space_between/[itemSpacing];padding 语义偏差照常检出(Codex oracle 2)', () => {
    // 父 (0,0,200,100),authored padT/padB=10、gap=8;Figma 子 (0,10,200,20)/(0,70,200,20):
    // design padT=10 ✓ padB=100-90=10 ✓(可推导继续执行);design gap=70-30=40(SPACE_BETWEEN 撑开)。
    // 语义侧注入 paddingTop 偏差(首子 y=16 → sem-derived 16 vs authored 10)证明只跳 itemSpacing。
    const r = assertPair(mkPair(
      { paddingTop: 10, paddingBottom: 10, itemSpacing: 8,
        layoutMode: 'VERTICAL', primaryAxisAlignItems: 'SPACE_BETWEEN',
        absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 100 },
        children: [figKid('1:201', 0, 10, 200, 20), figKid('1:202', 0, 70, 200, 20)] },
      { sizeDp: { width: 200, height: 100 }, children: [
        semKid('fig:1:201', 0, 16, 200, 20), semKid('fig:1:202', 0, 70, 200, 20),
      ] }));
    expect(skipOf(r)).toEqual([expect.objectContaining({
      code: 'l2_derived_geometry_skipped', nodeId: '1:101',
      reason: 'primary_axis_space_between', rules: ['itemSpacing'],
    })]);
    expect(r.violations).toEqual([expect.objectContaining({
      property: 'paddingTop', expected: '10', actual: '16', severity: 'medium',
    })]);                                        // 只跳 itemSpacing:padding 违规照常触发,无 itemSpacing 违规
    expect(r.executed).toBe(4);                  // position + size + paddingTop + paddingBottom(gap 不计)
  });

  it('B3-⑨ 显式 CENTER/MIN:itemSpacing 照常执行不误杀', () => {
    // authored gap 8 = design gap(过设计门);语义 gap 12 为真实偏差,必须检出。
    for (const align of ['CENTER', 'MIN'] as const) {
      const r = assertPair(mkPair(
        { itemSpacing: 8, layoutMode: 'VERTICAL', primaryAxisAlignItems: align,
          absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 200 },
          children: [figKid('1:201', 0, 0, 50, 20), figKid('1:202', 0, 28, 50, 20)] },
        { sizeDp: { width: 200, height: 200 }, children: [
          semKid('fig:1:201', 0, 0, 50, 20), semKid('fig:1:202', 0, 32, 50, 20),
        ] }));
      expect(r.violations).toContainEqual(expect.objectContaining({
        property: 'itemSpacing', expected: '8', actual: '12', severity: 'medium' }));
      expect(skipOf(r)).toEqual([]);
    }
  });

  it('B3-⑩ D3 钉子:SPACE_BETWEEN 且 authored 恰=design gap(数值偶合)仍跳', () => {
    // authored gap 40 恰 = design gap(60-20=40):偶合不构成可断言性,一律跳;
    // 语义侧注入 gap 50 偏差旁证确实未执行(若执行必产违规)。
    const r = assertPair(mkPair(
      { itemSpacing: 40, layoutMode: 'VERTICAL', primaryAxisAlignItems: 'SPACE_BETWEEN',
        absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 100 },
        children: [figKid('1:201', 0, 0, 200, 20), figKid('1:202', 0, 60, 200, 20)] },
      { sizeDp: { width: 200, height: 100 }, children: [
        semKid('fig:1:201', 0, 0, 200, 20), semKid('fig:1:202', 0, 70, 200, 20),
      ] }));
    expect(r.violations).toEqual([]);
    expect(r.executed).toBe(2);                  // 仅 position + size
    expect(skipOf(r)).toEqual([expect.objectContaining({
      reason: 'primary_axis_space_between', rules: ['itemSpacing'],
    })]);
  });
});

// Codex D4:半透明 paint(effective alpha<1)只跳过依赖显示色的 ΔE 断言;几何/排版不受影响,不做背景合成。
describe('assertPair 半透明 paint 颜色断言跳过(Codex D4)', () => {
  it('半透明 tagged leaf(语义通道):跳过 ΔE、不扣分、记 l2_color_skipped_translucent_paint', () => {
    const r = assertPair(mkPair(
      { fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 0.5 } }] }, { colorHex: '#0000FF' }));
    expect(r.violations).toEqual([]);            // 未合成的 #FF0000 vs #0000FF 不得判违规
    expect(r.executed).toBe(2);                  // position + size(color 不计)
    expect(r.diagnostics).toEqual([expect.objectContaining({
      code: 'l2_color_skipped_translucent_paint', testTag: 'fig:1:101',
    })]);
  });

  it('R1-④a opacity=0 边界(?? 语义:0 不得回退 1):按半透明跳过 ΔE 并记 diagnostic', () => {
    const r = assertPair(mkPair(
      { fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 0 } }] }, { colorHex: '#0000FF' }));
    expect(r.violations).toEqual([]);
    expect(r.executed).toBe(2);
    expect(r.diagnostics).toEqual([expect.objectContaining({ code: 'l2_color_skipped_translucent_paint' })]);
  });

  it('opacity=1 控制例:ΔE>3 仍产 high violation(通道未被误杀)', () => {
    const r = assertPair(mkPair(
      { fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }] }, { colorHex: '#0000FF' }));
    expect(has(r, 'color', 'high')).toBe(true);
    expect(r.executed).toBe(3);
  });

  it('半透明非文本叶子(像素通道):跳过采样、记 diagnostic、不计 executed', () => {
    const ctx: PixelSampleCtx = {
      png: { width: 4, height: 4, data: Uint8Array.from({ length: 64 }, (_, i) => [0xff, 0x99, 0x00, 255][i % 4] as number) },
      density: 2,
    };
    const r = assertPair(mkPair(
      { absoluteBoundingBox: { x: 0, y: 0, width: 2, height: 2 },
        fills: [{ type: 'SOLID', color: { r: 1, g: 0.6, b: 0, a: 0.5 } }] },
      { sizeDp: { width: 2, height: 2 } }), ctx);
    expect(r.violations).toEqual([]);
    expect(r.executed).toBe(2);
    expect(r.diagnostics).toEqual([expect.objectContaining({ code: 'l2_color_skipped_translucent_paint' })]);
  });
});
