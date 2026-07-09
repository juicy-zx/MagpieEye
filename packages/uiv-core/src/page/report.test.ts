import { describe, expect, it } from 'vitest';
import { validatePageReport } from './report.js';
import type { PageCell, PageReport } from './report.js';
import type { L3Verdict } from './l3/types.js';

function validCell(over: Partial<PageCell> = {}): PageCell {
  return {
    cellId: 'base__typical', device: 'base', state: 'typical', qualifiers: 'w360dp-h800dp-xhdpi',
    judgePath: 'parity', assertionScope: 'full', pass: true, reason: null, subReason: null, score: 1,
    failureClasses: [], topViolations: [], reportPath: '/abs/reports/1-100@V/cells/base__typical/report.json', ...over,
  };
}
function validReport(over: Partial<PageReport> = {}): PageReport {
  return {
    schemaVersion: 1, kind: 'page-report', pass: true, test: 'com.magpie.uiv.demo.CalibPageScreenshotTest',
    sessionId: 'standalone', nodeId: '1:100', version: 'T1_0A_V1', matrix: 'l-shape', states: ['typical'],
    perCell: [validCell()], l3Verdicts: [], unresolvedKnownDeviations: [],
    classification: { classes: [], actionable: false, retryNoteCandidate: null, environmentCells: [] },
    durationMs: 1234, ...over,
  };
}

describe('validatePageReport', () => {
  it('合法样例原样返回', () => {
    const r = validReport();
    expect(validatePageReport(r)).toEqual(r);
  });
  it('invariant-only 格的合法样例原样返回', () => {
    const r = validReport({ perCell: [validCell({ cellId: 'base__empty', state: 'empty',
      judgePath: 'invariant-only', assertionScope: 'invariant-only' })] });
    expect(validatePageReport(r)).toEqual(r);
  });
  it('schemaVersion≠1 抛错', () =>
    expect(() => validatePageReport({ ...validReport(), schemaVersion: 2 })).toThrow(/schemaVersion/));
  it('sessionId 缺失/非 string 抛错', () => {
    const r = validReport() as Record<string, unknown>;
    delete r['sessionId'];
    expect(() => validatePageReport(r)).toThrow(/sessionId/);
    expect(() => validatePageReport({ ...validReport(), sessionId: 42 })).toThrow(/sessionId/);
  });
  it('l3Verdicts 缺失/非数组抛错', () => {
    const r = validReport() as Record<string, unknown>;
    delete r['l3Verdicts'];
    expect(() => validatePageReport(r)).toThrow(/l3Verdicts/);
    expect(() => validatePageReport({ ...validReport(), l3Verdicts: 'nope' })).toThrow(/l3Verdicts/);
  });
  it('perCell 缺 cellId 抛错', () => {
    const cell = validCell() as Record<string, unknown>;
    delete cell['cellId'];
    expect(() => validatePageReport({ ...validReport(), perCell: [cell] })).toThrow(/cellId/);
  });
});

/** 合法 fail L3Verdict(全字段);override 覆盖具体字段造反例。 */
function failVerdict(over: Partial<L3Verdict> = {}): L3Verdict {
  return {
    item: 'color', verdict: 'fail', evidence: [{ cellId: 'base__typical', x: 1, y: 2, w: 3, h: 4 }],
    severity: 'high', suggestion: '修颜色', ...over,
  };
}

describe('validatePageReport: l3Verdicts schema(T4.2)', () => {
  it('合法 fail 项(全字段)通过', () => {
    const r = validReport({ l3Verdicts: [failVerdict()] });
    expect(validatePageReport(r)).toEqual(r);
  });
  it("verdict:'fail' 且 evidence:[] → throw /evidence/", () => {
    expect(() => validatePageReport(validReport({ l3Verdicts: [failVerdict({ evidence: [] })] }))).toThrow(/evidence/);
  });
  it('fail 且 severity:null → throw', () => {
    expect(() => validatePageReport(validReport({ l3Verdicts: [failVerdict({ severity: null })] }))).toThrow(/severity/);
  });
  it('fail 且 suggestion:null → throw', () => {
    expect(() => validatePageReport(validReport({ l3Verdicts: [failVerdict({ suggestion: null })] }))).toThrow(/suggestion/);
  });
  it("item:'contrast'(非法量规项)→ throw", () => {
    const bad = { ...failVerdict(), item: 'contrast' } as unknown as L3Verdict;
    expect(() => validatePageReport(validReport({ l3Verdicts: [bad] }))).toThrow(/item/);
  });
  it("verdict:'maybe'(非法)→ throw", () => {
    const bad = { ...failVerdict(), verdict: 'maybe' } as unknown as L3Verdict;
    expect(() => validatePageReport(validReport({ l3Verdicts: [bad] }))).toThrow(/verdict/);
  });
  it('pass 且 evidence:[]、severity/suggestion 均 null → 通过(裁定注:pass 允许无证据)', () => {
    const r = validReport({ l3Verdicts: [{ item: 'color', verdict: 'pass', evidence: [], severity: null, suggestion: null }] });
    expect(validatePageReport(r)).toEqual(r);
  });
  it('uncertain 且 evidence 非空、severity/suggestion 均 null → 通过(§2.2:uncertain 不按 fail 强度校验)', () => {
    const r = validReport({ l3Verdicts: [{ item: 'spacing', verdict: 'uncertain',
      evidence: [{ cellId: 'base__typical', x: 0, y: 0, w: 5, h: 5 }], severity: null, suggestion: null }] });
    expect(validatePageReport(r)).toEqual(r);
  });
  it('uncertain 且 evidence:[] → throw /evidence/(fail/uncertain 均强制证据锚定)', () => {
    const bad = { item: 'spacing', verdict: 'uncertain', evidence: [], severity: null, suggestion: null } as L3Verdict;
    expect(() => validatePageReport(validReport({ l3Verdicts: [bad] }))).toThrow(/evidence/);
  });
  it('evidence 缺 cellId → throw', () => {
    const bad = { ...failVerdict(), evidence: [{ x: 1, y: 2, w: 3, h: 4 }] } as unknown as L3Verdict;
    expect(() => validatePageReport(validReport({ l3Verdicts: [bad] }))).toThrow(/cellId/);
  });
  it('evidence 坐标非 number → throw', () => {
    const bad = { ...failVerdict(), evidence: [{ cellId: 'base__typical', x: 'nope', y: 2, w: 3, h: 4 }] } as unknown as L3Verdict;
    expect(() => validatePageReport(validReport({ l3Verdicts: [bad] }))).toThrow(/x/);
  });
});
