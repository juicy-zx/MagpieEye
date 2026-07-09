/**
 * T3.3:page-report v1 schema + 手写校验器(同 report/v0、v1 风格)。
 * 顶层 sessionId/nodeId/version/matrix 为 T3.1b adapter 的 schema/target 校验依据(跨章契约裁定第 1/2 条);
 * pass = perCell 全 pass;l3Verdicts/unresolvedKnownDeviations 恒 [](M4 填)。
 */
import type { PageClassification } from './classify.js';
import type { FailureClass } from './classify.js';
import type { SubReason, Violation } from '../l2/types.js';

export type PageJudgePath = 'parity' | 'render-only' | 'invariant-only';
export type PageAssertionScope = 'full' | 'geometry-only' | 'render-only' | 'invariant-only';

export interface PageCell {
  cellId: string; device: string; state: string; qualifiers: string;
  judgePath: PageJudgePath;              // T3.4 已交付,不再是预留
  assertionScope: PageAssertionScope;
  pass: boolean;
  reason: 'inconclusive' | null;
  subReason: SubReason | null;
  score: number;
  failureClasses: FailureClass[];
  topViolations: Violation[];            // ≤5,含 source
  reportPath: string;
}

export interface PageReport {
  schemaVersion: 1;
  kind: 'page-report';
  pass: boolean;                         // perCell 全 pass
  test: string;
  sessionId: string;                     // standalone 跑允许字面量 'standalone'
  nodeId: string;
  version: string;
  matrix: string;
  states: string[];
  perCell: PageCell[];
  l3Verdicts: never[];                   // 恒 [](M4 填)
  unresolvedKnownDeviations: never[];    // 恒 [](M4 填)
  classification: PageClassification;
  durationMs: number;
}

const JUDGE_PATHS: readonly string[] = ['parity', 'render-only', 'invariant-only'];
const ASSERTION_SCOPES: readonly string[] = ['full', 'geometry-only', 'render-only', 'invariant-only'];
const SUB_REASONS: readonly string[] = [
  'tag_coverage_low', 'matching_rate_low', 'semantics_export_failed',
  'render_harness_error', 'figma_spec_invalid', 'native_graphics_unverified', 'fixture_unavailable',
];

function fail(path: string, want: string, got: unknown): never {
  throw new Error(`page-report invalid at ${path}: expected ${want}, got ${JSON.stringify(got)}`);
}
function str(v: unknown, path: string): string { if (typeof v !== 'string') fail(path, 'string', v); return v; }
function num(v: unknown, path: string): number { if (typeof v !== 'number') fail(path, 'number', v); return v; }
function arr(v: unknown, path: string): unknown[] { if (!Array.isArray(v)) fail(path, 'array', v); return v; }

function checkCell(v: unknown, path: string): void {
  if (v === null || typeof v !== 'object') fail(path, 'object', v);
  const c = v as Record<string, unknown>;
  str(c['cellId'], `${path}.cellId`);
  str(c['device'], `${path}.device`);
  str(c['state'], `${path}.state`);
  str(c['qualifiers'], `${path}.qualifiers`);
  if (!JUDGE_PATHS.includes(c['judgePath'] as string)) fail(`${path}.judgePath`, JUDGE_PATHS.join(' | '), c['judgePath']);
  if (!ASSERTION_SCOPES.includes(c['assertionScope'] as string)) fail(`${path}.assertionScope`, ASSERTION_SCOPES.join(' | '), c['assertionScope']);
  if (typeof c['pass'] !== 'boolean') fail(`${path}.pass`, 'boolean', c['pass']);
  if (c['reason'] !== null && c['reason'] !== 'inconclusive') fail(`${path}.reason`, "'inconclusive' | null", c['reason']);
  if (c['subReason'] !== null && !SUB_REASONS.includes(c['subReason'] as string)) fail(`${path}.subReason`, `${SUB_REASONS.join(' | ')} | null`, c['subReason']);
  num(c['score'], `${path}.score`);
  arr(c['failureClasses'], `${path}.failureClasses`);
  arr(c['topViolations'], `${path}.topViolations`);
  str(c['reportPath'], `${path}.reportPath`);
}

export function validatePageReport(x: unknown): PageReport {
  if (x === null || typeof x !== 'object') fail('$', 'object', x);
  const r = x as Record<string, unknown>;
  if (r['schemaVersion'] !== 1) fail('schemaVersion', '1', r['schemaVersion']);
  if (r['kind'] !== 'page-report') fail('kind', "'page-report'", r['kind']);
  if (typeof r['pass'] !== 'boolean') fail('pass', 'boolean', r['pass']);
  str(r['test'], 'test');
  str(r['sessionId'], 'sessionId');
  str(r['nodeId'], 'nodeId');
  str(r['version'], 'version');
  str(r['matrix'], 'matrix');
  arr(r['states'], 'states');
  arr(r['perCell'], 'perCell').forEach((c, i) => checkCell(c, `perCell[${i}]`));
  if (!Array.isArray(r['l3Verdicts'])) fail('l3Verdicts', 'array', r['l3Verdicts']);
  if (!Array.isArray(r['unresolvedKnownDeviations'])) fail('unresolvedKnownDeviations', 'array', r['unresolvedKnownDeviations']);
  const cls = r['classification'];
  if (cls === null || typeof cls !== 'object') fail('classification', 'object', cls);
  else {
    const cl = cls as Record<string, unknown>;
    arr(cl['classes'], 'classification.classes');
    if (typeof cl['actionable'] !== 'boolean') fail('classification.actionable', 'boolean', cl['actionable']);
    if (cl['retryNoteCandidate'] !== null && typeof cl['retryNoteCandidate'] !== 'string') fail('classification.retryNoteCandidate', 'string | null', cl['retryNoteCandidate']);
    arr(cl['environmentCells'], 'classification.environmentCells');
  }
  num(r['durationMs'], 'durationMs');
  return x as PageReport;
}
