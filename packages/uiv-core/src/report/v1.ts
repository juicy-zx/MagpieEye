/**
 * report.json v1 schema + 手写校验器(T1.3 Step 10;扩展 v0)。
 * v1 = v0 基础字段 + L2 结构块(structural)+ score + 防震荡(regression/regressionReason)。
 * v0 的 pass=渲染管线成功语义在 v1 升级为 L2 verdict:pass 由结构断言判定。
 */
import type { PixelResult } from './v0.js';
import type { PixelDiagnostic, SubReason, Violation } from '../l2/types.js';
import type { InvariantAdvisory } from '../l2/invariant.js';

/** T2.8:渲染来源车道。fast=Paparazzi 快车道 worker;slow=Roborazzi 慢车道;fast-fallback-slow=快车道不可用/失败后回落慢车道。 */
export type Lane = 'fast' | 'slow' | 'fast-fallback-slow';

export interface MatchFailureV1 {
  figmaLeaves: string[]; semLeaves: string[];
  unmatchedFigma: Array<{ figmaId: string; name: string }>; unmatchedSem: string[];
}

export interface StructuralV1 {
  matched: number;
  untaggedCoverage: number;
  matchRate: number;
  matchedNodes: Array<{ figmaId: string; name: string; joinSource: 'tag' | 'text' | 'lcs' }>;
  untagged: Array<{ figmaId: string; name: string; suggestedTag: string }>;
  missing: Array<{ figmaId: string; name: string; expectedBounds: [number, number, number, number] | null }>;
  diagnostics: { containerMissing: Array<{ figmaId: string; name: string }>; pixel: PixelDiagnostic[] };  // 对象形态钉死(全文统一,Codex M2 审查裁定);T2.7 在同一对象上追加 pixel 键,不新增并列字段
  matchFailure: MatchFailureV1 | null;
  extra: string[];
  violations: Violation[];
  invariant?: { executed: number; advisories: InvariantAdvisory[] };  // T3.4:L2-invariant 执行数 + advisory(供审计,不参与门禁);缺省=未跑 invariant
}

export interface ReportV1 {
  schemaVersion: 1;
  pass: boolean;                       // 由 L2 verdict 决定
  reason: 'inconclusive' | null;
  subReason: SubReason | null;
  compileError: string | null;
  pixel: PixelResult | null;           // advisory,不参与 pass
  structural: StructuralV1 | null;     // 管线未达 L2(编译/挽具失败)时为 null
  artifacts: { baseline: string | null; render: string | null; diff: string | null };
  score: number;
  regression: boolean;                 // 分层判定连续 2 轮停滞 → true
  regressionReason: string | null;     // regression 时必填
  lane?: Lane;                         // T2.8:渲染来源车道;缺省(存量报告)语义等价 slow
  judgePath?: 'parity' | 'invariant-only';  // T3.4:缺省⇒parity(存量兼容);invariant-only 报告顶层标注
  parityUnavailable?: boolean;         // T3.4:缺省⇒false;invariant-only 报告恒 true(无 parity 基准)
}

const SUB_REASONS: readonly string[] = [
  'tag_coverage_low', 'matching_rate_low', 'semantics_export_failed',
  'render_harness_error', 'figma_spec_invalid', 'native_graphics_unverified', 'fixture_unavailable',
];

const LANES: readonly string[] = ['fast', 'slow', 'fast-fallback-slow'];

function fail(path: string, want: string, got: unknown): never {
  throw new Error(`report.json v1 invalid at ${path}: expected ${want}, got ${JSON.stringify(got)}`);
}
function num(v: unknown, path: string): number { if (typeof v !== 'number') fail(path, 'number', v); return v; }
function strOrNull(v: unknown, path: string): string | null {
  if (v !== null && typeof v !== 'string') fail(path, 'string | null', v); return v as string | null;
}

function checkPixel(v: unknown, path: string): void {
  if (v === null) return;
  if (typeof v !== 'object') fail(path, 'object | null', v);
  const p = v as Record<string, unknown>;
  num(p['diffRatio'], `${path}.diffRatio`);
  num(p['diffCount'], `${path}.diffCount`);
  if (!Array.isArray(p['clusters'])) fail(`${path}.clusters`, 'array', p['clusters']);
}

function checkStructural(v: unknown, path: string): void {
  if (v === null) return;
  if (typeof v !== 'object') fail(path, 'object | null', v);
  const s = v as Record<string, unknown>;
  num(s['matched'], `${path}.matched`);
  num(s['untaggedCoverage'], `${path}.untaggedCoverage`);
  num(s['matchRate'], `${path}.matchRate`);
  for (const k of ['missing', 'extra', 'violations', 'matchedNodes', 'untagged'] as const) {
    if (!Array.isArray(s[k])) fail(`${path}.${k}`, 'array', s[k]);
  }
  const diag = s['diagnostics'];
  if (diag === null || typeof diag !== 'object') fail(`${path}.diagnostics`, 'object', diag);
  else {
    const d = diag as Record<string, unknown>;
    if (!Array.isArray(d['containerMissing'])) fail(`${path}.diagnostics.containerMissing`, 'array', d['containerMissing']);
    if (!Array.isArray(d['pixel'])) fail(`${path}.diagnostics.pixel`, 'array', d['pixel']);
  }
  const mf = s['matchFailure'];
  if (mf !== null) {
    if (typeof mf !== 'object') fail(`${path}.matchFailure`, 'object | null', mf);
    const m = mf as Record<string, unknown>;
    for (const k of ['figmaLeaves', 'semLeaves', 'unmatchedFigma', 'unmatchedSem'] as const) {
      if (!Array.isArray(m[k])) fail(`${path}.matchFailure.${k}`, 'array', m[k]);
    }
  }
  // T3.4:structural.invariant 块(可选);存在则 executed number + advisories array。
  const inv = s['invariant'];
  if (inv !== undefined) {
    if (inv === null || typeof inv !== 'object') fail(`${path}.invariant`, 'object', inv);
    const iv = inv as Record<string, unknown>;
    num(iv['executed'], `${path}.invariant.executed`);
    if (!Array.isArray(iv['advisories'])) fail(`${path}.invariant.advisories`, 'array', iv['advisories']);
  }
}

export function validateReportV1(x: unknown): ReportV1 {
  if (x === null || typeof x !== 'object') fail('$', 'object', x);
  const r = x as Record<string, unknown>;

  if (r['schemaVersion'] !== 1) fail('schemaVersion', '1', r['schemaVersion']);
  if (typeof r['pass'] !== 'boolean') fail('pass', 'boolean', r['pass']);
  if (r['reason'] !== null && r['reason'] !== 'inconclusive') fail('reason', "'inconclusive' | null", r['reason']);
  if (r['subReason'] !== null && !SUB_REASONS.includes(r['subReason'] as string)) {
    fail('subReason', `${SUB_REASONS.join(' | ')} | null`, r['subReason']);
  }
  strOrNull(r['compileError'], 'compileError');
  checkPixel(r['pixel'], 'pixel');
  checkStructural(r['structural'], 'structural');
  if (r['artifacts'] === null || typeof r['artifacts'] !== 'object') fail('artifacts', '{ baseline, render, diff }', r['artifacts']);
  const a = r['artifacts'] as Record<string, unknown>;
  for (const k of ['baseline', 'render', 'diff'] as const) strOrNull(a[k], `artifacts.${k}`);
  num(r['score'], 'score');
  if (typeof r['regression'] !== 'boolean') fail('regression', 'boolean', r['regression']);
  strOrNull(r['regressionReason'], 'regressionReason');
  // T2.8:lane 缺省=slow 以兼容存量报告;非缺省须在枚举内。
  if (r['lane'] !== undefined && !LANES.includes(r['lane'] as string)) {
    fail('lane', `${LANES.join(' | ')} | (absent ⇒ slow)`, r['lane']);
  }
  // T3.4:judgePath 缺省⇒parity;parityUnavailable 布尔。
  if (r['judgePath'] !== undefined && r['judgePath'] !== 'parity' && r['judgePath'] !== 'invariant-only') {
    fail('judgePath', "'parity' | 'invariant-only' | (absent ⇒ parity)", r['judgePath']);
  }
  if (r['parityUnavailable'] !== undefined && typeof r['parityUnavailable'] !== 'boolean') {
    fail('parityUnavailable', 'boolean', r['parityUnavailable']);
  }
  if (r['judgePath'] === 'invariant-only' && r['parityUnavailable'] !== true) {
    fail('parityUnavailable', 'true when judgePath===invariant-only', r['parityUnavailable']);
  }

  // 组合约束
  if (r['reason'] === 'inconclusive' && r['subReason'] === null) fail('subReason', "non-null when reason==='inconclusive'", r['subReason']);
  if (r['pass'] === true && r['compileError'] !== null) fail('compileError', 'null when pass===true', r['compileError']);
  if (r['pass'] === true && r['reason'] !== null) fail('reason', 'null when pass===true', r['reason']);
  if (r['regression'] === true && r['regressionReason'] === null) fail('regressionReason', 'non-null when regression===true', r['regressionReason']);

  // structural 组合约束(仅 structural 非 null)
  const st = r['structural'];
  if (st !== null && typeof st === 'object') {
    const s = st as Record<string, unknown>;
    // D-06:matching_rate_low ⇒ matchFailure 非空;不再要求 violations 为空(tag 配对真实违规 + missing 硬失败可共存)。
    if (r['subReason'] === 'matching_rate_low' && s['matchFailure'] === null) {
      fail('structural.matchFailure', 'non-null when subReason===matching_rate_low', s['matchFailure']);
    }
    if (r['subReason'] === 'tag_coverage_low' && Array.isArray(s['untagged']) && s['untagged'].length === 0) {
      fail('structural.untagged', 'non-empty when subReason===tag_coverage_low', s['untagged']);
    }
  }
  return x as ReportV1;
}
