/**
 * testTag 确定性 join(T1.3 Step 4,设计文档第 4 节主策略)。
 * 对全树所有带 tag(fig:<nodeId>)的 Figma 节点(含容器,供 padding 断言)与语义树按 tag join;
 * 语义侧 px÷density 换算为 dp(SemDp),fontSizeSp/colorHex 不换算。
 * dump.density≠2.0 → 抛 L2Error('render_harness_error')(密度未钉死,几何不可信)。
 * 注:untaggedCoverage/matchRate 分子只统计 N 中叶子,容器 pair 由 metrics 层过滤(见 metrics.ts)。
 */
import { DENSITY } from './constants.js';
import { L2Error } from './types.js';
import type { FigmaNode, Pair, SemDp, SemNode, SemanticsDump } from './types.js';

export function toDp(n: SemNode, density: number): SemDp {
  const d = (v: number): number => v / density;
  return {
    testTag: n.testTag, text: n.text,
    positionDp: { x: d(n.positionInRoot.x), y: d(n.positionInRoot.y) },
    sizeDp: { width: d(n.size.width), height: d(n.size.height) },
    // T4.4:touchBoundsInRoot 缺省/null 统一归一化为 touchBoundsDp 不产出(undefined);有值才换算 DP。
    ...(n.touchBoundsInRoot != null ? {
      touchBoundsDp: {
        left: d(n.touchBoundsInRoot.left), top: d(n.touchBoundsInRoot.top),
        right: d(n.touchBoundsInRoot.right), bottom: d(n.touchBoundsInRoot.bottom),
      },
    } : {}),
    colorHex: n.colorHex, fontSizeSp: n.fontSizeSp,           // sp 不换算
    cornerRadiusDp: n.cornerRadiusPx === null ? null : d(n.cornerRadiusPx),
    // T3.4 invariant 字段透传:boundsInRoot(clipped px)÷density;布尔/字符串原样,undefined 保持 undefined(exactOptionalPropertyTypes)。
    ...(n.boundsInRoot !== undefined ? {
      boundsDp: { left: d(n.boundsInRoot.left), top: d(n.boundsInRoot.top), right: d(n.boundsInRoot.right), bottom: d(n.boundsInRoot.bottom) },
    } : {}),
    ...(n.hasVisualOverflow !== undefined ? { hasVisualOverflow: n.hasVisualOverflow } : {}),
    ...(n.clickable !== undefined ? { clickable: n.clickable } : {}),
    ...(n.contentDescription !== undefined ? { contentDescription: n.contentDescription } : {}),
    children: n.children.map((c) => toDp(c, density)),
  };
}

/** 递归收集语义树中带 tag 的节点:tag → SemNode。 */
function collectTags(n: SemNode, map: Map<string, SemNode>): void {
  if (n.testTag !== null) map.set(n.testTag, n);
  for (const c of n.children) collectTags(c, map);
}

export function joinByTag(
  root: FigmaNode, dump: SemanticsDump,
): { pairs: Pair[]; missing: FigmaNode[]; extra: string[] } {
  if (dump.density !== DENSITY) throw new L2Error('render_harness_error');

  const tagMap = new Map<string, SemNode>();
  collectTags(dump.root, tagMap);
  const consumed = new Set<string>();

  const pairs: Pair[] = [];
  const missing: FigmaNode[] = [];
  const walk = (n: FigmaNode): void => {
    if (n.id !== '') {                       // 仅 id 非空(可形成 fig:<id>)的节点参与 join
      const tag = `fig:${n.id}`;
      const semNode = tagMap.get(tag);
      if (semNode !== undefined) {
        pairs.push({ figma: n, sem: toDp(semNode, dump.density) });
        consumed.add(tag);
      } else {
        missing.push(n);
      }
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(root);

  const extra = [...tagMap.keys()].filter((t) => !consumed.has(t));
  return { pairs, missing, extra };
}
