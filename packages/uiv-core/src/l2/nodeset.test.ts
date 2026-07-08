import { describe, it, expect } from 'vitest';
import { comparableNodes } from './nodeset.js';
import type { Box, FigmaNode } from './types.js';

const leaf = (id: string, x: number, y: number, w = 10, h = 10): FigmaNode =>
  ({ id, name: id, type: 'RECTANGLE', absoluteBoundingBox: { x, y, width: w, height: h } });

// 设计文档 2.4 节:可比对节点集 N = visible!==false 的叶子,排除纯装饰 vector / ignore-region 覆盖 / bbox null。
describe('comparableNodes(N,2.4 节三类排除)', () => {
  it('只取叶子:容器 FRAME 不进 N', () => {
    const root: FigmaNode = {
      id: '1:100', name: 'Card', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
      children: [leaf('1:101', 0, 0), leaf('1:102', 0, 20)],
    };
    const n = comparableNodes(root, []);
    expect(n.map((x) => x.id)).toEqual(['1:101', '1:102']);
  });

  it('visible!==false:叶子 visible:false 排除,visible 缺省视为可见', () => {
    const root: FigmaNode = {
      id: '1:100', name: 'Card', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
      children: [
        { ...leaf('1:101', 0, 0), visible: false },
        leaf('1:102', 0, 20),                        // visible 缺省
      ],
    };
    expect(comparableNodes(root, []).map((x) => x.id)).toEqual(['1:102']);
  });

  it('纯装饰 vector(VECTOR/BOOLEAN_OPERATION)排除且不展开内部', () => {
    const root: FigmaNode = {
      id: '1:100', name: 'Card', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
      children: [
        { id: '1:v', name: 'icon', type: 'VECTOR', absoluteBoundingBox: { x: 0, y: 0, width: 8, height: 8 },
          children: [leaf('1:inner', 1, 1, 2, 2)] },       // 内部结构不展开
        { id: '1:b', name: 'bool', type: 'BOOLEAN_OPERATION', absoluteBoundingBox: { x: 9, y: 0, width: 8, height: 8 } },
        leaf('1:102', 0, 20),
      ],
    };
    expect(comparableNodes(root, []).map((x) => x.id)).toEqual(['1:102']);
  });

  it('ignore-region 完全覆盖排除,部分相交不排除', () => {
    const region: Box = { x: 0, y: 0, width: 30, height: 30 };
    const root: FigmaNode = {
      id: '1:100', name: 'Card', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
      children: [
        leaf('1:inside', 5, 5, 10, 10),   // 完全落入 region → 排除
        leaf('1:partial', 25, 25, 20, 20),// 与 region 部分相交 → 保留
      ],
    };
    expect(comparableNodes(root, [region]).map((x) => x.id)).toEqual(['1:partial']);
  });

  it('bbox null 排除', () => {
    const root: FigmaNode = {
      id: '1:100', name: 'Card', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
      children: [
        { id: '1:ghost', name: 'ghost', type: 'RECTANGLE', absoluteBoundingBox: null },
        leaf('1:102', 0, 20),
      ],
    };
    expect(comparableNodes(root, []).map((x) => x.id)).toEqual(['1:102']);
  });
});
