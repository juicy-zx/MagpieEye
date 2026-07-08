/**
 * 确定性 hint 模板 + report.json v1 组装(T1.3 Step 10)。
 * makeHint:纯模板,零 LLM 依赖,同输入恒等输出。
 * runL2:串起 rebase→N→join→逐属性断言→指标→verdict→防震荡,产出 v1 结构块与顶层判定。
 */
import {
  DEFAULT_BLOCKING_SEVERITIES, DEFAULT_MIN_SCORE, MATCH_RATE_FUSE, UNTAGGED_COVERAGE_THRESHOLD,
} from './constants.js';
import { assertPair } from './assert.js';
import { joinByTag } from './join.js';
import { leafPairCount, leafTagHits, matchRate, score, untaggedCoverage } from './metrics.js';
import { comparableNodes } from './nodeset.js';
import { rebase } from './rebase.js';
import { stepState } from './stability.js';
import { L2Error } from './types.js';
import type { Box, FigmaNode, SemNode, SemanticsDump, StateFile, SubReason, Violation } from './types.js';
import { verdict } from './verdict.js';
import type { ReportV1, StructuralV1 } from '../report/v1.js';

const FIX_MAP: Record<string, string> = {
  position: '布局排列/Modifier.offset',
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

export interface RunL2Opts {
  minScore?: number;
  blockingSeverities?: readonly string[];
  ignoreRegions?: Box[];
  prevState?: StateFile | null;
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

  const rebased = rebase(root);
  const N = comparableNodes(rebased, opts.ignoreRegions ?? []);

  let joined;
  try {
    joined = joinByTag(rebased, dump);
  } catch (e) {
    if (e instanceof L2Error) return inconclusiveReport(e.subReason, null, 0);
    throw e;
  }

  const dumpTags = collectDumpTags(dump.root, new Set<string>());
  const nSize = N.length;
  const cov = untaggedCoverage(leafTagHits(N, dumpTags), nSize);
  const pairedIds = new Set(joined.pairs.map((p) => p.figma.id));
  const mr = matchRate(leafPairCount(N, pairedIds), nSize);

  // 逐属性断言(全 pair,含容器供 padding),hint 确定性填充。
  const violations: Violation[] = [];
  let executed = 0;
  for (const pair of joined.pairs) {
    const r = assertPair(pair);
    executed += r.executed;
    for (const v of r.violations) violations.push({ ...v, hint: makeHint(v, pair.figma.name) });
  }
  const sc = score(violations, executed);

  const structural: StructuralV1 = {
    matched: joined.pairs.length,
    untaggedCoverage: cov,
    matchRate: mr,
    missing: joined.missing.map((n) => ({
      figmaId: n.id, name: n.name,
      expectedBounds: n.absoluteBoundingBox === null
        ? null
        : [n.absoluteBoundingBox.x, n.absoluteBoundingBox.y, n.absoluteBoundingBox.width, n.absoluteBoundingBox.height],
    })),
    extra: joined.extra,
    violations,
  };

  // subReason:coverage 判定优先于 matchRate 熔断。
  let subReason: SubReason | null = null;
  if (cov < UNTAGGED_COVERAGE_THRESHOLD) subReason = 'tag_coverage_low';
  else if (mr < MATCH_RATE_FUSE) subReason = 'matching_rate_low';

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
