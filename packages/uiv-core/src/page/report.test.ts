import { describe, expect, it } from 'vitest';
import { validatePageReport } from './report.js';
import type { PageCell, PageReport } from './report.js';

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
