import { describe, it, expect } from 'vitest';
import { rebase } from './rebase.js';
import type { FigmaNode } from './types.js';

// 设计文档第 4 节坐标口径:Figma absoluteBoundingBox 先减目标 Frame 原点 re-base 为相对坐标。
describe('rebase(Figma absoluteBoundingBox → 相对根坐标)', () => {
  it('根置 (0,0),子减根原点,尺寸不变', () => {
    const tree: FigmaNode = {
      id: '1:100', name: 'Card', type: 'FRAME',
      absoluteBoundingBox: { x: 100, y: 200, width: 360, height: 200 },
      children: [
        { id: '1:101', name: 'Child', type: 'RECTANGLE',
          absoluteBoundingBox: { x: 112, y: 212, width: 80, height: 20 } },
      ],
    };
    const out = rebase(tree);
    expect(out.absoluteBoundingBox).toEqual({ x: 0, y: 0, width: 360, height: 200 });
    expect(out.children?.[0]?.absoluteBoundingBox).toEqual({ x: 12, y: 12, width: 80, height: 20 });
  });

  it('bbox 为 null 的节点保持 null', () => {
    const tree: FigmaNode = {
      id: '1:100', name: 'Card', type: 'FRAME',
      absoluteBoundingBox: { x: 100, y: 200, width: 360, height: 200 },
      children: [{ id: '1:102', name: 'Ghost', type: 'RECTANGLE', absoluteBoundingBox: null }],
    };
    const out = rebase(tree);
    expect(out.children?.[0]?.absoluteBoundingBox).toBeNull();
  });

  it('不修改入参(深拷贝)', () => {
    const tree: FigmaNode = {
      id: '1:100', name: 'Card', type: 'FRAME',
      absoluteBoundingBox: { x: 100, y: 200, width: 360, height: 200 },
    };
    rebase(tree);
    expect(tree.absoluteBoundingBox).toEqual({ x: 100, y: 200, width: 360, height: 200 });
  });

  it('根 bbox 为 null 时视原点为 (0,0),子坐标原样保留', () => {
    const tree: FigmaNode = {
      id: '1:100', name: 'Card', type: 'FRAME', absoluteBoundingBox: null,
      children: [
        { id: '1:101', name: 'Child', type: 'RECTANGLE',
          absoluteBoundingBox: { x: 12, y: 12, width: 80, height: 20 } },
      ],
    };
    const out = rebase(tree);
    expect(out.children?.[0]?.absoluteBoundingBox).toEqual({ x: 12, y: 12, width: 80, height: 20 });
  });
});
