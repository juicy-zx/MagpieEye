/**
 * Figma 坐标 re-base(T1.3 Step 2,设计文档第 4 节)。
 * absoluteBoundingBox 恒为绝对画布坐标,统一减根 frame 原点为相对坐标;
 * bbox 为 null 的节点保持 null(不可见节点 renderBounds 为 null)。
 * 幂等:根已在 (0,0) 时为 no-op(持久化 spec.json 已 re-base 亦安全)。
 */
import type { FigmaNode } from './types.js';

export function rebase(root: FigmaNode): FigmaNode {
  const origin = root.absoluteBoundingBox === null
    ? { x: 0, y: 0 }
    : { x: root.absoluteBoundingBox.x, y: root.absoluteBoundingBox.y };
  const clone = structuredClone(root);
  const shift = (n: FigmaNode): void => {
    if (n.absoluteBoundingBox !== null) {
      n.absoluteBoundingBox = {
        x: n.absoluteBoundingBox.x - origin.x,
        y: n.absoluteBoundingBox.y - origin.y,
        width: n.absoluteBoundingBox.width,
        height: n.absoluteBoundingBox.height,
      };
    }
    for (const c of n.children ?? []) shift(c);
  };
  shift(clone);
  return clone;
}
