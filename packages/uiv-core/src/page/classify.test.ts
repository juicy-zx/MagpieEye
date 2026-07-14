import { describe, expect, it } from 'vitest';
import { SUBREASON_CLASS, classifyCell, classifyPage } from './classify.js';
import type { Violation } from '../l2/types.js';
import type { ReportV1, StructuralV1 } from '../report/v1.js';

function baseStructural(over: Partial<StructuralV1> = {}): StructuralV1 {
  return {
    matched: 0, untaggedCoverage: 1, matchRate: 1, matchedNodes: [], untagged: [], missing: [],
    diagnostics: { containerMissing: [], pixel: [] }, matchFailure: null, extra: [], violations: [], ...over,
  };
}
function mkReport(over: Partial<ReportV1> = {}): ReportV1 {
  return {
    schemaVersion: 1, pass: false, reason: null, subReason: null, compileError: null, pixel: null,
    structural: baseStructural(), artifacts: { baseline: null, render: null, diff: null },
    score: 0, regression: false, regressionReason: null, ...over,
  };
}
function mkViolation(property: string, over: Partial<Violation> = {}): Violation {
  return { judgePath: 'parity', testTag: 'fig:1:103', figmaName: 'CalibSwatch', property,
    expected: 'e', actual: 'a', severity: 'high', hint: 'h', ...over };
}

describe('classifyCell', () => {
  it('① SUBREASON_CLASS 覆盖 SubReason 全 9 键且逐项符合表', () => {
    expect(SUBREASON_CLASS).toEqual({
      tag_coverage_low: 'implementation_gap', matching_rate_low: 'implementation_gap',
      semantics_export_failed: 'environment_gap', render_harness_error: 'environment_gap',
      stale_artifact: 'environment_gap', module_dir_missing: 'environment_gap',   // 修正②:新增 module_dir_missing → environment_gap
      figma_spec_invalid: 'environment_gap',
      native_graphics_unverified: 'environment_gap', fixture_unavailable: 'implementation_gap',
    });
    expect(Object.keys(SUBREASON_CLASS)).toHaveLength(9);
  });

  it('② violations 非空(无 missing/编译)→ [behavior_drift]', () => {
    expect(classifyCell(mkReport({ structural: baseStructural({ violations: [mkViolation('color')] }) })))
      .toEqual(['behavior_drift']);
  });

  it('③ missing 非空→含 implementation_gap;violations+missing 双非空→固定序 [impl, drift]', () => {
    const missOnly = mkReport({ structural: baseStructural({ missing: [{ figmaId: '1:104', name: 'CalibBadge', expectedBounds: null }] }) });
    expect(classifyCell(missOnly)).toEqual(['implementation_gap']);
    const both = mkReport({ structural: baseStructural({
      violations: [mkViolation('color')], missing: [{ figmaId: '1:104', name: 'CalibBadge', expectedBounds: null }] }) });
    expect(classifyCell(both)).toEqual(['implementation_gap', 'behavior_drift']);
  });

  it('④ compileError → [implementation_gap]', () => {
    expect(classifyCell(mkReport({ compileError: 'e: boom', structural: null }))).toEqual(['implementation_gap']);
  });

  it('⑤ pass=true → []', () => {
    expect(classifyCell(mkReport({ pass: true }))).toEqual([]);
  });
});

describe('classifyPage', () => {
  it('⑥ env-only 格:actionable=false/note=null/进 environmentCells;混合格 note 含 cellId+expected/actual+source', () => {
    const envCell = { cellId: 'smallPhone__typical', report: mkReport({ reason: 'inconclusive', subReason: 'render_harness_error' }) };
    const envOnly = classifyPage([envCell]);
    expect(envOnly.actionable).toBe(false);
    expect(envOnly.retryNoteCandidate).toBeNull();
    expect(envOnly.environmentCells).toEqual(['smallPhone__typical']);
    expect(envOnly.classes).toEqual(['environment_gap']);

    const driftCell = { cellId: 'base__typical', report: mkReport({ structural: baseStructural({
      violations: [mkViolation('color', { expected: '#FF9900', actual: '#0000FF',
        source: 'app/src/main/java/com/magpie/uiv/demo/CalibCard.kt:63' })] }) }) };
    const mixed = classifyPage([envCell, driftCell]);
    expect(mixed.actionable).toBe(true);
    expect(mixed.environmentCells).toEqual(['smallPhone__typical']);
    expect(mixed.classes).toEqual(['environment_gap', 'behavior_drift']);
    expect(mixed.retryNoteCandidate).toContain('[base__typical]');
    expect(mixed.retryNoteCandidate).toContain('expected #FF9900 actual #0000FF');
    expect(mixed.retryNoteCandidate).toContain('CalibCard.kt:63');
  });

  it('⑦ compileError 格 → classes 含 implementation_gap;retryNoteCandidate 含编译摘要首行,不含次行', () => {
    const cell = { cellId: 'base__typical', report: mkReport({ compileError: 'e: X.kt:1:1 boom\nsecond line', structural: null }) };
    const result = classifyPage([cell]);
    expect(result.classes).toContain('implementation_gap');
    expect(result.actionable).toBe(true);
    expect(result.retryNoteCandidate).toContain('[base__typical] compile: e: X.kt:1:1 boom');
    expect(result.retryNoteCandidate).not.toContain('second line');
    expect(result.environmentCells).toEqual([]);
  });
});
