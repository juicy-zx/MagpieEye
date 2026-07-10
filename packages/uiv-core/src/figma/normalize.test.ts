import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { normalizeNodesResponse } from './normalize.js';
const raw = JSON.parse(readFileSync(new URL('../../fixtures/rest-nodes-card.json', import.meta.url), 'utf8'));
describe('normalize happy path', () => {
  it('产出 re-base 后的 spec 树(canonical 5 节点)', () => {
    const s = normalizeNodesResponse(raw, 'FKEY', '1:100');
    expect(s.version).toBe('T1_0A_V1');
    expect(s.root.bbox).toEqual({ x: 0, y: 0, w: 360, h: 200 });      // 减根原点(100,100)
    expect(s.root.fills[0].hex).toBe('#3366CC');
    expect(s.root.cornerRadii).toEqual([8, 8, 8, 8]);
    const [title, subtitle, swatch, badge] = s.root.children;
    expect(title.bbox).toEqual({ x: 12, y: 12, w: 200, h: 20 });
    expect(title.text?.fontSize).toBe(16);
    expect(subtitle.bbox).toEqual({ x: 12, y: 36, w: 200, h: 16 });
    expect(subtitle.text?.fontSize).toBe(12);
    expect(swatch.bbox).toEqual({ x: 12, y: 60, w: 80, h: 40 });
    expect(swatch.fills[0].hex).toBe('#FF9900');
    expect(badge.bbox).toEqual({ x: 296, y: 12, w: 52, h: 20 });
    expect(badge.cornerRadii).toEqual([10, 10, 10, 10]);
  });
  it('nodeId 不存在时抛 FigmaSpecInvalidError', () =>
    expect(() => normalizeNodesResponse(raw, 'FKEY', '9:9')).toThrow(/9:9/));
});

describe('C3 boundaries', () => {
  it('C3-1 absoluteBoundingBox null 不抛错且 bbox=null', () => {
    const r = structuredClone(raw);
    r.nodes['1:100'].document.children[0].absoluteBoundingBox = null;
    const s = normalizeNodesResponse(r, 'FKEY', '1:100');
    expect(s.root.children[0].bbox).toBeNull();
  });
  it('C3-2 rectangleCornerRadii 四角不同原样透传', () => {
    const r = structuredClone(raw);
    delete r.nodes['1:100'].document.cornerRadius;
    r.nodes['1:100'].document.rectangleCornerRadii = [8, 8, 0, 0];
    const s = normalizeNodesResponse(r, 'FKEY', '1:100');
    expect(s.root.cornerRadii).toEqual([8, 8, 0, 0]);
  });
  it('C3-3 characterStyleOverrides 混排合并为 [start,end) 区段', () => {
    const r = structuredClone(raw);
    r.nodes['1:100'].document.children[0].characterStyleOverrides = [0, 0, 1, 1];
    r.nodes['1:100'].document.children[0].styleOverrideTable = { '1': { fontSize: 20 } };
    const s = normalizeNodesResponse(r, 'FKEY', '1:100');
    expect(s.root.children[0].text?.overrides).toEqual([{ start: 2, end: 4, style: { fontSize: 20 } }]);
  });
  it('C3-4 layoutMode GRID 原样透传(不得归入 NONE、不抛错)', () => {
    const r = structuredClone(raw);
    r.nodes['1:100'].document.layoutMode = 'GRID';
    const s = normalizeNodesResponse(r, 'FKEY', '1:100');
    expect(s.root.layoutMode).toBe('GRID');
  });
  it('C3-5 padding/itemSpacing 缺省为 0,显式值透传', () => {
    // 缺省路径:canonical 根节点本就无 padding/itemSpacing 字段
    const s0 = normalizeNodesResponse(raw, 'FKEY', '1:100');
    expect(s0.root.padding).toEqual({ l: 0, t: 0, r: 0, b: 0 });
    expect(s0.root.itemSpacing).toBe(0);
    // 显式路径:克隆件根节点加显式 padding/itemSpacing
    const r = structuredClone(raw);
    r.nodes['1:100'].document.paddingLeft = 12;
    r.nodes['1:100'].document.paddingTop = 12;
    r.nodes['1:100'].document.paddingRight = 12;
    r.nodes['1:100'].document.paddingBottom = 12;
    r.nodes['1:100'].document.itemSpacing = 8;
    const s1 = normalizeNodesResponse(r, 'FKEY', '1:100');
    expect(s1.root.padding).toEqual({ l: 12, t: 12, r: 12, b: 12 });
    expect(s1.root.itemSpacing).toBe(8);
  });
  it('R1-④a fills opacity=0 保真(?? 语义:0 不得回退 color.a 或 1)', () => {
    const r = structuredClone(raw);
    r.nodes['1:100'].document.fills[0].opacity = 0;
    const s = normalizeNodesResponse(r, 'FKEY', '1:100');
    expect(s.root.fills[0].opacity).toBe(0);
  });
});
