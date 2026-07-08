import { describe, it, expect } from 'vitest';
import { validateReportV1 } from './v1.js';
import type { ReportV1 } from './v1.js';

function validPass(): ReportV1 {
  return {
    schemaVersion: 1, pass: true, reason: null, subReason: null, compileError: null,
    pixel: null,
    structural: { matched: 5, untaggedCoverage: 1, matchRate: 1, matchedNodes: [], untagged: [],
      missing: [], diagnostics: { containerMissing: [], pixel: [] }, matchFailure: null, extra: [], violations: [] },
    artifacts: { baseline: '/abs/baseline.png', render: '/abs/rendered.png', diff: null },
    score: 1, regression: false, regressionReason: null,
  };
}

describe('report.json v1 校验器(扩展 v0)', () => {
  it('合法通过件原样返回', () => {
    const r = validPass();
    expect(validateReportV1(r)).toEqual(r);
  });
  it('合法 inconclusive 件(structural + subReason)原样返回', () => {
    const r: ReportV1 = {
      ...validPass(), pass: false, reason: 'inconclusive', subReason: 'tag_coverage_low',
      structural: { matched: 1, untaggedCoverage: 0.25, matchRate: 0.25, matchedNodes: [],
        untagged: [{ figmaId: '1:104', name: 'CalibBadge', suggestedTag: 'fig:1:104' }],
        missing: [], diagnostics: { containerMissing: [], pixel: [] }, matchFailure: null, extra: [], violations: [] },
      score: 0.5,
    };
    expect(validateReportV1(r)).toEqual(r);
  });
  it('schemaVersion≠1 抛错', () =>
    expect(() => validateReportV1({ ...validPass(), schemaVersion: 0 })).toThrow(/schemaVersion/));
  it('structural 缺 violations 数组抛错', () => {
    const r = validPass();
    (r.structural as Record<string, unknown>)['violations'] = 'nope';
    expect(() => validateReportV1(r)).toThrow(/violations/);
  });
  it('subReason 枚举违规抛错', () =>
    expect(() => validateReportV1({ ...validPass(), subReason: 'whatever' })).toThrow(/subReason/));
  it('reason=inconclusive 而 subReason=null 抛错', () =>
    expect(() => validateReportV1({ ...validPass(), pass: false, reason: 'inconclusive', subReason: null })).toThrow(/subReason/));
  it('regression=true 而 regressionReason=null 抛错', () =>
    expect(() => validateReportV1({ ...validPass(), pass: false, regression: true, regressionReason: null })).toThrow(/regressionReason/));
  it('structural 可为 null(编译/挽具失败)', () => {
    const r: ReportV1 = { ...validPass(), pass: false, compileError: 'e: boom', structural: null };
    expect(validateReportV1(r)).toEqual(r);
  });
  it('matching_rate_low 而 matchFailure=null 抛错', () => {
    const r: ReportV1 = {
      ...validPass(), pass: false, reason: 'inconclusive', subReason: 'matching_rate_low',
      structural: { matched: 0, untaggedCoverage: 1, matchRate: 0, matchedNodes: [], untagged: [],
        missing: [], diagnostics: { containerMissing: [], pixel: [] }, matchFailure: null, extra: [], violations: [] },
      score: 0,
    };
    expect(() => validateReportV1(r)).toThrow(/matchFailure/);
  });
  it('tag_coverage_low 而 untagged=[] 抛错', () => {
    const r: ReportV1 = {
      ...validPass(), pass: false, reason: 'inconclusive', subReason: 'tag_coverage_low',
      structural: { matched: 1, untaggedCoverage: 0.5, matchRate: 1, matchedNodes: [], untagged: [],
        missing: [], diagnostics: { containerMissing: [], pixel: [] }, matchFailure: null, extra: [], violations: [] },
      score: 1,
    };
    expect(() => validateReportV1(r)).toThrow(/untagged/);
  });
});
