/**
 * 确定性 hint 模板 + report.json v1 组装(T1.3 Step 10)。
 * makeHint:纯模板,零 LLM 依赖,同输入恒等输出。
 * runL2:串起 rebase→N→join→逐属性断言→指标→verdict→防震荡,产出 v1 结构块与顶层判定。
 */
import {
  DEFAULT_BLOCKING_SEVERITIES, DEFAULT_MIN_SCORE, MATCH_RATE_FUSE, UNTAGGED_COVERAGE_THRESHOLD,
} from './constants.js';
import { assertPair } from './assert.js';
import { matchThreeTier } from './match.js';
import type { MatchResult } from './match.js';
import { leafPairCount, leafTagHits, matchRate, score, untaggedCoverage } from './metrics.js';
import { comparableNodes } from './nodeset.js';
import { rebase } from './rebase.js';
import { stepState } from './stability.js';
import { L2Error } from './types.js';
import type { Box, FigmaNode, SemDp, SemNode, SemanticsDump, StateFile, SubReason, Violation } from './types.js';
import { verdict } from './verdict.js';
import type { ReportV1, StructuralV1 } from '../report/v1.js';

const FIX_MAP: Record<string, string> = {
  position: '用参与测量的布局定位调整位置(自定义 Layout/padding/align/Arrangement/约束布局),避免绘制期位移做主定位',
  size: 'Modifier.size/width/height',
  itemSpacing: 'Arrangement.spacedBy',
  fontSize: 'TextStyle.fontSize',
  color: 'Color 参数或 token',
  cornerRadius: 'RoundedCornerShape',
};
function fixFor(property: string): string {
  if (property.startsWith('padding')) return 'Modifier.padding';
  return FIX_MAP[property] ?? property;
}

/** 确定性修正建议:违规属性 + spec 期望值 + testTag 反查 composable 名 → 参数级建议。 */
export function makeHint(v: Violation, figmaName: string): string {
  return `${v.property} 应为 ${v.expected}(Figma "${figmaName}"),当前 ${v.actual};检查 ${fixFor(v.property)}`;
}

function collectDumpTags(n: SemNode, out: Set<string>): Set<string> {
  if (n.testTag !== null) out.add(n.testTag);
  for (const c of n.children) collectDumpTags(c, out);
  return out;
}

// v1 结构块格式器(纯投影,确定性)。
const idName = (n: FigmaNode): { figmaId: string; name: string } => ({ figmaId: n.id, name: n.name });
const bounds4 = (b: Box | null): [number, number, number, number] | null =>
  b === null ? null : [b.x, b.y, b.width, b.height];
const figLine = (n: FigmaNode): string => {
  const b = n.absoluteBoundingBox;
  return `${n.id} ${n.name} ${n.type} ${b === null ? '-' : `(${b.x},${b.y} ${b.width}x${b.height})`}`;
};
const semLine = (s: SemDp): string =>
  `${s.testTag ?? '-'} ${s.text ?? '-'} (${s.positionDp.x},${s.positionDp.y} ${s.sizeDp.width}x${s.sizeDp.height})dp`;

export interface RunL2Opts {
  minScore?: number;
  blockingSeverities?: readonly string[];
  ignoreRegions?: Box[];
  prevState?: StateFile | null;
  untaggedCoverageThreshold?: number;
}

function inconclusiveReport(subReason: SubReason, structural: StructuralV1 | null, sc: number): ReportV1 {
  return {
    schemaVersion: 1, pass: false, reason: 'inconclusive', subReason,
    compileError: null, pixel: null, structural,
    artifacts: { baseline: null, render: null, diff: null },
    score: sc, regression: false, regressionReason: null,
  };
}

export function runL2(root: FigmaNode, dump: SemanticsDump, opts: RunL2Opts): ReportV1 {
  const minScore = opts.minScore ?? DEFAULT_MIN_SCORE;
  const blockingSeverities = opts.blockingSeverities ?? DEFAULT_BLOCKING_SEVERITIES;
  const prevState = opts.prevState ?? null;
  const covThreshold = opts.untaggedCoverageThreshold ?? UNTAGGED_COVERAGE_THRESHOLD;

  const rebased = rebase(root);
  const N = comparableNodes(rebased, opts.ignoreRegions ?? []);

  let m: MatchResult;
  try {
    m = matchThreeTier(rebased, dump, N);
  } catch (e) {
    if (e instanceof L2Error) return inconclusiveReport(e.subReason, null, 0);
    throw e;
  }

  const dumpTags = collectDumpTags(dump.root, new Set<string>());
  const nSize = N.length;
  const cov = untaggedCoverage(leafTagHits(N, dumpTags), nSize);
  const pairedIds = new Set(m.pairs.map((p) => p.figma.id));
  const mr = matchRate(leafPairCount(N, pairedIds), nSize);

  // 熔断:mr<0.8 → 不执行断言、不输出 violations(不强行断言);缺失叶子硬失败仅在非熔断态生成。
  const fused = mr < MATCH_RATE_FUSE;
  const violations: Violation[] = [];
  let executed = 0;
  if (!fused) {
    // 逐属性断言(全 pair,含容器供 padding),hint 确定性填充。
    for (const pair of m.pairs) {
      const r = assertPair(pair);
      executed += r.executed;
      for (const v of r.violations) violations.push({ ...v, hint: makeHint(v, pair.figma.name) });
    }
    // missing 叶子硬失败(Codex M2 审查裁定):每个 comparable missing 叶子计一条 high 违规。
    for (const n of m.missingLeaves) {
      violations.push({
        judgePath: 'parity', testTag: `fig:${n.id}`, figmaName: n.name,
        property: 'missing', expected: 'present', actual: 'missing', severity: 'high',
        hint: `节点在语义树中缺失(Figma "${n.name}"):检查是否漏渲染或 testTag 未导出`,
      });
    }
  }
  const sc = fused ? 0 : score(violations, executed);

  const structural: StructuralV1 = {
    matched: m.pairs.length, untaggedCoverage: cov, matchRate: mr,
    matchedNodes: m.pairs.map((p) => ({ ...idName(p.figma), joinSource: p.joinSource })),
    untagged: N.filter((n) => !dumpTags.has(`fig:${n.id}`)).map((n) => ({ ...idName(n), suggestedTag: `fig:${n.id}` })),
    missing: m.missingLeaves.map((n) => ({ ...idName(n), expectedBounds: bounds4(n.absoluteBoundingBox) })),
    diagnostics: { containerMissing: m.containerMissing.map(idName) },
    matchFailure: fused ? {
      figmaLeaves: N.slice(0, 50).map(figLine), semLeaves: m.semLeavesDp.slice(0, 50).map(semLine),
      unmatchedFigma: m.missingLeaves.map(idName), unmatchedSem: m.unmatchedSem.slice(0, 50).map(semLine),
    } : null,
    extra: m.extra, violations,
  };

  // subReason:coverage 判定优先于 matchRate 熔断;熔断行为与该优先级无关。
  let subReason: SubReason | null = null;
  if (cov < covThreshold) subReason = 'tag_coverage_low';
  else if (fused) subReason = 'matching_rate_low';

  const { pass } = verdict({ subReason, violations, score: sc, minScore, blockingSeverities });

  const blockingHits = violations.filter((v) => blockingSeverities.includes(v.severity)).length;
  const state = stepState(prevState, { blockingHits, score: sc, pass });

  return {
    schemaVersion: 1, pass,
    reason: subReason === null ? null : 'inconclusive', subReason,
    compileError: null, pixel: null, structural,
    artifacts: { baseline: null, render: null, diff: null },
    score: sc, regression: state.regression, regressionReason: state.regressionReason,
  };
}
