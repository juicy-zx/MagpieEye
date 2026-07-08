import { describe, it, expect } from 'vitest';
import { validateReportV0 } from './v0.js';
import type { ReportV0 } from './v0.js';

function validPassReport(): ReportV0 {
  return {
    schemaVersion: 0,
    pass: true,
    reason: null,
    subReason: null,
    compileError: null,
    pixel: { diffRatio: 0.01, diffCount: 42, clusters: [{ x: 0, y: 0, w: 16, h: 16 }] },
    artifacts: { baseline: '/abs/baseline.png', render: '/abs/rendered.png', diff: '/abs/diff.png' },
  };
}

describe('report.json v0 validator', () => {
  it('合法通过件原样返回', () => {
    const r = validPassReport();
    expect(validateReportV0(r)).toEqual(r);
  });
  it('合法失败件原样返回', () => {
    const r: ReportV0 = {
      schemaVersion: 0,
      pass: false,
      reason: null,
      subReason: null,
      compileError: 'e: CalibCard.kt:5 unresolved',
      pixel: null,
      artifacts: { baseline: null, render: null, diff: null },
    };
    expect(validateReportV0(r)).toEqual(r);
  });
  it('缺字段 artifacts 抛错且 message 含字段路径', () => {
    const r: Record<string, unknown> = { ...validPassReport() };
    delete r['artifacts'];
    expect(() => validateReportV0(r)).toThrow(/artifacts/);
  });
  it('subReason 枚举违规抛错', () => {
    const r = { ...validPassReport(), subReason: 'whatever' };
    expect(() => validateReportV0(r)).toThrow(/subReason/);
  });
  it('组合违规 reason=inconclusive 而 subReason=null 抛错', () => {
    const r = { ...validPassReport(), pass: false, reason: 'inconclusive', subReason: null };
    expect(() => validateReportV0(r)).toThrow(/subReason/);
  });
  it('组合违规 pass=true 而 compileError 非空抛错', () => {
    const r = { ...validPassReport(), compileError: 'e: boom' };
    expect(() => validateReportV0(r)).toThrow(/compileError/);
  });
});
