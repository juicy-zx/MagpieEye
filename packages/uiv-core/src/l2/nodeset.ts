/**
 * 可比对节点集 N(T1.3 Step 3,设计文档 2.4 节)。
 * N = Figma 节点树中 visible!==false 的叶子,排除三类:
 *   纯装饰 vector/asset(VECTOR/BOOLEAN_OPERATION,整体导出为图,不展开内部)、
 *   已被 ignore-region 完全覆盖的节点、absoluteBoundingBox 为 null 的节点。
 * N 是 untaggedCoverage/matchRate/score 的统一分母,只含叶子(容器不进 N)。
 */
import type { Box, FigmaNode } from './types.js';

const DECORATIVE = new Set(['VECTOR', 'BOOLEAN_OPERATION']);

function fullyInside(bbox: Box, region: Box): boolean {
  return bbox.x >= region.x && bbox.y >= region.y
    && bbox.x + bbox.width <= region.x + region.width
    && bbox.y + bbox.height <= region.y + region.height;
}

export function comparableNodes(root: FigmaNode, ignoreRegions: Box[]): FigmaNode[] {
  const out: FigmaNode[] = [];
  const walk = (n: FigmaNode): void => {
    // 先剪子树:不可见 / 纯装饰(不展开内部)
    if (n.visible === false) return;
    if (DECORATIVE.has(n.type)) return;
    const children = n.children ?? [];
    if (children.length > 0) {              // 容器:递归,自身不进 N
      for (const c of children) walk(c);
      return;
    }
    // 叶子:过 bbox null / ignore-region 完全覆盖
    const bbox = n.absoluteBoundingBox;
    if (bbox === null) return;
    if (ignoreRegions.some((r) => fullyInside(bbox, r))) return;
    out.push(n);
  };
  walk(root);
  return out;
}
