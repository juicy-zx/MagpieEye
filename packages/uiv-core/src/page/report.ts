/**
 * T3.3:page-report v1 schema + 手写校验器(同 report/v0、v1 风格)。
 * 顶层 sessionId/nodeId/version/matrix 为 T3.1b adapter 的 schema/target 校验依据(跨章契约裁定第 1/2 条);
 * pass = perCell 全 pass;l3Verdicts(T4.2:L3Verdict[],逐项证据锚定校验,仅建议不门禁)默认 [];
 * unresolvedKnownDeviations 恒 [](M4 填)。
 */
import type { PageClassification } from './classify.js';
import type { FailureClass } from './classify.js';
import { RUBRIC_ITEMS } from './l3/types.js';
import type { L3Verdict } from './l3/types.js';
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
  l3Verdicts: L3Verdict[];               // T4.2:L3 建议(仅建议不门禁);默认 [](provider/回填未跑)
  unresolvedKnownDeviations: never[];    // 恒 [](M4 填)
  classification: PageClassification;
  durationMs: number;
}

const JUDGE_PATHS: readonly string[] = ['parity', 'render-only', 'invariant-only'];
const ASSERTION_SCOPES: readonly string[] = ['full', 'geometry-only', 'render-only', 'invariant-only'];
const SUB_REASONS: readonly string[] = [
  'tag_coverage_low', 'matching_rate_low', 'semantics_export_failed', 'stale_artifact', 'module_dir_missing',
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

const L3_VERDICTS: readonly string[] = ['pass', 'fail', 'uncertain'];
const L3_SEVERITIES: readonly string[] = ['high', 'medium', 'low'];

function checkL3Evidence(v: unknown, path: string): void {
  if (v === null || typeof v !== 'object') fail(path, 'object', v);
  const e = v as Record<string, unknown>;
  str(e['cellId'], `${path}.cellId`);
  for (const k of ['x', 'y', 'w', 'h'] as const) num(e[k], `${path}.${k}`);
}

/**
 * T4.2:逐项 L3Verdict 校验(证据锚定强度分级,§2.2 裁定)。
 * - item∈RUBRIC_ITEMS、verdict∈{pass,fail,uncertain}、evidence 逐项形状合法(cellId+xywh number);
 * - fail/uncertain ⇒ evidence 非空(证据锚定);
 * - fail ⇒ severity 非 null ∧ suggestion 非空 string(uncertain 允许二者为 null,不推广)。
 * attach 复用此校验:形状非法=调用方 bug,直接 throw(与"伪证据丢弃"区分)。
 */
export function checkL3Verdict(v: unknown, path: string): void {
  if (v === null || typeof v !== 'object') fail(path, 'object', v);
  const d = v as Record<string, unknown>;
  if (!RUBRIC_ITEMS.includes(d['item'] as never)) fail(`${path}.item`, RUBRIC_ITEMS.join(' | '), d['item']);
  if (!L3_VERDICTS.includes(d['verdict'] as string)) fail(`${path}.verdict`, L3_VERDICTS.join(' | '), d['verdict']);
  const evidence = arr(d['evidence'], `${path}.evidence`);
  evidence.forEach((e, i) => checkL3Evidence(e, `${path}.evidence[${i}]`));
  if (d['severity'] !== null && !L3_SEVERITIES.includes(d['severity'] as string)) {
    fail(`${path}.severity`, `${L3_SEVERITIES.join(' | ')} | null`, d['severity']);
  }
  if (d['suggestion'] !== null && typeof d['suggestion'] !== 'string') fail(`${path}.suggestion`, 'string | null', d['suggestion']);
  if (d['verdict'] !== 'pass' && evidence.length === 0) {
    fail(`${path}.evidence`, 'non-empty when verdict is fail/uncertain', evidence);
  }
  if (d['verdict'] === 'fail') {
    if (d['severity'] === null) fail(`${path}.severity`, "non-null when verdict==='fail'", d['severity']);
    if (typeof d['suggestion'] !== 'string' || d['suggestion'] === '') {
      fail(`${path}.suggestion`, "non-empty string when verdict==='fail'", d['suggestion']);
    }
  }
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
  arr(r['l3Verdicts'], 'l3Verdicts').forEach((v, i) => checkL3Verdict(v, `l3Verdicts[${i}]`));
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
