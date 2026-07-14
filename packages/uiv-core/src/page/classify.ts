/**
 * T3.3:失败分类映射(设计文档 3.2C)。逐格 SubReason/结构信号 → FailureClass;
 * 页级聚合产 classification(classes/actionable/retryNoteCandidate/environmentCells)。
 * retryNoteCandidate 只由 implementation_gap/behavior_drift 证据构建(口径⑥);仅 env 格进 environmentCells。
 * 编译失败归 implementation_gap,摘要行进 retryNoteCandidate。
 */
import { SEVERITY_WEIGHT } from '../l2/constants.js';
import type { SubReason, Violation } from '../l2/types.js';
import type { ReportV1 } from '../report/v1.js';

export type FailureClass = 'environment_gap' | 'implementation_gap' | 'behavior_drift';
/** 输出序固定(口径⑤):env→impl→drift。 */
const ORDER: readonly FailureClass[] = ['environment_gap', 'implementation_gap', 'behavior_drift'];

/** 3.2C 完整映射;末两项(native_graphics_unverified/fixture_unavailable)为 3.2C 未列,按语义归类(⑤)。
 *  stale_artifact(P0-2):陈旧=构建缓存未刷新的基础设施问题,非模型可行动 → environment_gap(actionable:false)。
 *  module_dir_missing(P0-8 批次②-fix,codex 019f6029):模块目录是环境事实,非模型可闭合 → environment_gap。 */
export const SUBREASON_CLASS: Record<SubReason, FailureClass> = {
  tag_coverage_low: 'implementation_gap', matching_rate_low: 'implementation_gap',
  semantics_export_failed: 'environment_gap', render_harness_error: 'environment_gap',
  stale_artifact: 'environment_gap', module_dir_missing: 'environment_gap',
  figma_spec_invalid: 'environment_gap',
  native_graphics_unverified: 'environment_gap', fixture_unavailable: 'implementation_gap',
};

/** 单格分类:pass→[];否则按编译/subReason/missing/violations 命中并按 ORDER 输出。一格可多类。 */
export function classifyCell(r: ReportV1): FailureClass[] {
  if (r.pass) return [];
  const hit = new Set<FailureClass>();
  if (r.compileError !== null) hit.add('implementation_gap');    // 编译失败=模型代码写坏,可行动
  if (r.reason === 'inconclusive' && r.subReason !== null) hit.add(SUBREASON_CLASS[r.subReason]);
  if ((r.structural?.missing.length ?? 0) > 0) hit.add('implementation_gap');
  if ((r.structural?.violations.length ?? 0) > 0) hit.add('behavior_drift');
  if (hit.size === 0) hit.add('behavior_drift');                 // 兜底(违规被 scope 过滤等)
  return ORDER.filter((c) => hit.has(c));
}

export interface PageClassification {
  classes: FailureClass[];
  actionable: boolean;
  retryNoteCandidate: string | null;
  environmentCells: string[];
}

const RETRY_NOTE_MAX_LINES = 20;

/** 违规排序:severity 权重降序,平手 testTag 字典序。 */
function bySeverityThenTag(a: Violation, b: Violation): number {
  return SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || a.testTag.localeCompare(b.testTag);
}

/**
 * 页级聚合(口径⑥)。actionable = 任一格含 implementation_gap/behavior_drift;
 * retryNoteCandidate 逐 actionable 格:top3 violations(权重降序)+ 前 3 missing,封顶 20 行;
 * 仅 environment_gap 的格进 environmentCells 不进 note;无 actionable 格 → null。
 */
export function classifyPage(cells: ReadonlyArray<{ cellId: string; report: ReportV1 }>): PageClassification {
  const allClasses = new Set<FailureClass>();
  const environmentCells: string[] = [];
  const lines: string[] = [];
  let actionable = false;

  for (const { cellId, report } of cells) {
    const classes = classifyCell(report);
    for (const c of classes) allClasses.add(c);
    const cellActionable = classes.includes('implementation_gap') || classes.includes('behavior_drift');
    if (classes.length > 0 && !cellActionable) environmentCells.push(cellId);   // 仅 env 格
    if (cellActionable) {
      actionable = true;
      const vs = [...(report.structural?.violations ?? [])].sort(bySeverityThenTag);
      for (const v of vs.slice(0, 3)) {
        const src = v.source ?? null;
        lines.push(`[${cellId}] ${v.property} @${v.testTag}: expected ${v.expected} actual ${v.actual}${src === null ? '' : ` (${src})`}`);
      }
      for (const m of (report.structural?.missing ?? []).slice(0, 3)) {
        lines.push(`[${cellId}] missing: ${m.name} ${m.figmaId}`);
      }
      if (report.compileError !== null) {
        lines.push(`[${cellId}] compile: ${report.compileError.split('\n')[0]}`);
      }
    }
  }

  return {
    classes: ORDER.filter((c) => allClasses.has(c)),
    actionable,
    retryNoteCandidate: actionable ? lines.slice(0, RETRY_NOTE_MAX_LINES).join('\n') : null,
    environmentCells,
  };
}
