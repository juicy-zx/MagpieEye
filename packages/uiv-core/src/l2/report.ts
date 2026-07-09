/**
 * 确定性 hint 模板 + report.json v1 组装(T1.3 Step 10)。
 * makeHint:纯模板,零 LLM 依赖,同输入恒等输出。
 * runL2:串起 rebase→N→join→逐属性断言→指标→verdict→防震荡,产出 v1 结构块与顶层判定。
 */
import {
  DEFAULT_BLOCKING_SEVERITIES, DEFAULT_MIN_SCORE, DENSITY, MATCH_RATE_FUSE, UNTAGGED_COVERAGE_THRESHOLD,
} from './constants.js';
import { assertPair } from './assert.js';
import type { PixelSampleCtx } from './assert.js';
import { runInvariants } from './invariant.js';
import type { InvariantResult } from './invariant.js';
import { matchThreeTier } from './match.js';
import type { MatchResult } from './match.js';
import { leafPairCount, leafTagHits, matchRate, score, untaggedCoverage } from './metrics.js';
import { comparableNodes } from './nodeset.js';
import { rebase } from './rebase.js';
import type { DecodedPng } from './sampler.js';
import { stepState } from './stability.js';
import { L2Error } from './types.js';
import type { Box, FigmaNode, PixelDiagnostic, SemDp, SemNode, SemanticsDump, StateFile, SubReason, Violation } from './types.js';
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
  pixelSource?: { png: DecodedPng };
  invariant?: boolean;   // T3.4:L2-invariant 免基准套件,默认 true;违规不入 score 分母,经 high 阻断
  excludeProperties?: readonly string[];   // T3.3:命中属性跳过 assertPair(geometry-only 排除 color:不产 violation、不计 executed)
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

  // 熔断(Codex D-06):mr<0.8 只抑制 joinSource==='text'|'lcs' 降级配对的属性断言;
  // tag 配对(可信契约)照常执行全部断言;missing 硬失败不受熔断门控(与 structural.missing 同步生成,D4 检出稳定)。
  const fused = mr < MATCH_RATE_FUSE;
  const violations: Violation[] = [];
  let executed = 0;
  const pixelCtx: PixelSampleCtx | undefined = opts.pixelSource === undefined
    ? undefined : { png: opts.pixelSource.png, density: dump.density };
  const pixelDiagnostics: PixelDiagnostic[] = [];
  // 逐属性断言(全 pair,含容器供 padding),hint 确定性填充;非文本叶子走像素通道(T2.7)。
  // 熔断态下仅对 tag 配对断言,text/lcs 降级配对抑制(不因低配对率对降级样本强行断言)。
  for (const pair of m.pairs) {
    if (fused && pair.joinSource !== 'tag') continue;
    const r = assertPair(pair, pixelCtx, opts.excludeProperties);
    executed += r.executed;
    for (const v of r.violations) violations.push({ ...v, hint: makeHint(v, pair.figma.name) });
    for (const d of r.diagnostics) pixelDiagnostics.push(d);
  }
  // missing 叶子硬失败(Codex M2 审查裁定 + D-06 不受熔断门控):每个 comparable missing 叶子计一条 high 违规。
  for (const n of m.missingLeaves) {
    violations.push({
      judgePath: 'parity', testTag: `fig:${n.id}`, figmaName: n.name,
      property: 'missing', expected: 'present', actual: 'missing', severity: 'high',
      hint: `节点在语义树中缺失(Figma "${n.name}"):检查是否漏渲染或 testTag 未导出`,
    });
  }
  const sc = fused ? 0 : score(violations, executed);

  // T3.4:invariant 免基准套件默认开。sc 已按 parity violations/executed 先行算得(存量 score 零漂移);
  // invariant 违规只进 verdict 条件 2(high 阻断)与 structural,不入 score 分母。
  let inv: InvariantResult = { violations: [], executed: 0, advisories: [] };
  if (opts.invariant !== false) {
    inv = runInvariants(dump);
    for (const v of inv.violations) violations.push(v);
  }

  const structural: StructuralV1 = {
    matched: m.pairs.length, untaggedCoverage: cov, matchRate: mr,
    matchedNodes: m.pairs.map((p) => ({ ...idName(p.figma), joinSource: p.joinSource })),
    untagged: N.filter((n) => !dumpTags.has(`fig:${n.id}`)).map((n) => ({ ...idName(n), suggestedTag: `fig:${n.id}` })),
    missing: m.missingLeaves.map((n) => ({ ...idName(n), expectedBounds: bounds4(n.absoluteBoundingBox) })),
    diagnostics: { containerMissing: m.containerMissing.map(idName), pixel: pixelDiagnostics },
    matchFailure: fused ? {
      figmaLeaves: N.slice(0, 50).map(figLine), semLeaves: m.semLeavesDp.slice(0, 50).map(semLine),
      unmatchedFigma: m.missingLeaves.map(idName), unmatchedSem: m.unmatchedSem.slice(0, 50).map(semLine),
    } : null,
    extra: m.extra, violations,
    invariant: { executed: inv.executed, advisories: inv.advisories },
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

/**
 * invariant-only 判定(T3.4,口径裁定①③)。无 Figma 基准的内容态:只跑 L2-invariant。
 * pass 只按条件 2(存在 high/blocking severity violation ⇒ fail),不走条件 1(score<minScore);
 * score = 1 − Σweight/executed(executed=0⇒1)仅 informational 展示,不参与 pass 判定。
 * structural.untaggedCoverage/matchRate 置 1(无基准无 tag 契约,免误触 coverage 门禁),
 * structural.invariant.executed 如实暴露本轮执行数(供审计);顶层标 judgePath:'invariant-only'+parityUnavailable:true。
 */
export function runInvariantOnly(
  dump: SemanticsDump,
  opts: { minScore?: number; blockingSeverities?: readonly string[]; prevState?: StateFile | null },
): ReportV1 {
  const blockingSeverities = opts.blockingSeverities ?? DEFAULT_BLOCKING_SEVERITIES;
  const prevState = opts.prevState ?? null;

  // density 守卫:runInvariants 遇 density≠2 会抛 L2Error,此处先转 inconclusive(仍标 invariant-only)。
  if (dump.density !== DENSITY) {
    return {
      schemaVersion: 1, pass: false, reason: 'inconclusive', subReason: 'render_harness_error',
      compileError: null, pixel: null, structural: null,
      artifacts: { baseline: null, render: null, diff: null },
      score: 0, regression: false, regressionReason: null,
      judgePath: 'invariant-only', parityUnavailable: true,
    };
  }

  const inv = runInvariants(dump);
  const sc = inv.executed === 0 ? 1 : score(inv.violations, inv.executed);   // informational,不参与 pass
  const blockingHits = inv.violations.filter((v) => blockingSeverities.includes(v.severity)).length;
  const pass = blockingHits === 0;                                           // 只按条件 2(口径裁定①)

  const structural: StructuralV1 = {
    matched: 0, untaggedCoverage: 1, matchRate: 1,
    matchedNodes: [], untagged: [], missing: [],
    diagnostics: { containerMissing: [], pixel: [] },
    matchFailure: null, extra: [], violations: inv.violations,
    invariant: { executed: inv.executed, advisories: inv.advisories },
  };

  const state = stepState(prevState, { blockingHits, score: sc, pass });

  return {
    schemaVersion: 1, pass, reason: null, subReason: null,
    compileError: null, pixel: null, structural,
    artifacts: { baseline: null, render: null, diff: null },
    score: sc, regression: state.regression, regressionReason: state.regressionReason,
    judgePath: 'invariant-only', parityUnavailable: true,
  };
}
