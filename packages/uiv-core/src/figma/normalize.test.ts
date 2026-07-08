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
