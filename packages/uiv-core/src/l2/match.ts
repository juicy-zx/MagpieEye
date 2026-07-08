/** T2.5 三级编排(第 4 节):tag→text(仅 TEXT)→LCS;容器只走 tag(padding 断言不受影响),降级只补配 N 中叶子。 */
import { TEXT_SIM_MIN } from './constants.js';
import { joinByTag, toDp } from './join.js';
import { figGeom, lcsAlign, semGeom } from './lcs.js';
import { textSimilarity } from './similarity.js';
import type { FigmaNode, Pair, SemDp, SemNode, SemanticsDump } from './types.js';

export type JoinSource = 'tag' | 'text' | 'lcs';
export interface MatchedPair extends Pair { joinSource: JoinSource }
export interface MatchResult { // missingLeaves=N 内未配叶;containerMissing→diagnostics;extra=多余 tag(降级消费的除外)
  pairs: MatchedPair[]; missingLeaves: FigmaNode[]; containerMissing: FigmaNode[];
  extra: string[]; semLeavesDp: SemDp[]; unmatchedSem: SemDp[];
}

const flat = (n: SemNode): SemNode[] => (n.children.length === 0 ? [n] : n.children.flatMap(flat));

export function matchThreeTier(rebased: FigmaNode, dump: SemanticsDump, N: FigmaNode[]): MatchResult {
  const joined = joinByTag(rebased, dump);
  const pairs: MatchedPair[] = joined.pairs.map((p) => ({ ...p, joinSource: 'tag' as const }));
  const pairedIds = new Set(joined.pairs.map((p) => p.figma.id));
  const consumedTags = new Set(joined.pairs.map((p) => `fig:${p.figma.id}`));

  const semLeavesDp = flat(dump.root).map((s) => toDp(s, dump.density))
    .sort((a, b) => a.positionDp.y - b.positionDp.y || a.positionDp.x - b.positionDp.x);
  const rest = semLeavesDp.filter((s) => s.testTag === null || !consumedTags.has(s.testTag));
  const used = new Set<SemDp>();
  const figRest = N.filter((n) => !pairedIds.has(n.id)).sort((a, b) =>   // N 保证 bbox 非 null
    a.absoluteBoundingBox!.y - b.absoluteBoundingBox!.y || a.absoluteBoundingBox!.x - b.absoluteBoundingBox!.x);

  // 降级 1:fig 按 (y,x) 序贪心取最高分 ≥TEXT_SIM_MIN,平分取语义序靠前者(确定性)。
  for (const f of figRest) {
    if (f.type !== 'TEXT' || f.characters === undefined) continue;
    let best: SemDp | null = null; let bestSim = 0;
    for (const s of rest) {
      if (used.has(s) || s.text === null) continue;
      const sim = textSimilarity(f.characters, s.text);
      if (sim >= TEXT_SIM_MIN && sim > bestSim) { best = s; bestSim = sim; }
    }
    if (best !== null) { used.add(best); pairedIds.add(f.id); pairs.push({ figma: f, sem: best, joinSource: 'text' }); }
  }

  // 降级 2:LCS 全局对齐(两侧均已 (y,x) 偏序)。
  const figLcs = figRest.filter((f) => !pairedIds.has(f.id)), semLcs = rest.filter((s) => !used.has(s));
  for (const [fi, si] of lcsAlign(figLcs.map(figGeom), semLcs.map(semGeom))) {
    used.add(semLcs[si]!); pairedIds.add(figLcs[fi]!.id);
    pairs.push({ figma: figLcs[fi]!, sem: semLcs[si]!, joinSource: 'lcs' });
  }

  const fallbackTags = new Set([...used].map((s) => s.testTag).filter((t): t is string => t !== null));
  return {
    pairs,
    missingLeaves: N.filter((n) => !pairedIds.has(n.id)),
    containerMissing: joined.missing.filter((n) => (n.children ?? []).length > 0),
    extra: joined.extra.filter((t) => !fallbackTags.has(t)),
    semLeavesDp,
    unmatchedSem: rest.filter((s) => !used.has(s)),
  };
}
