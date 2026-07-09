import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { attachL3Verdicts } from './attach.js';
import { validatePageReport } from '../report.js';
import type { PageReport } from '../report.js';
import type { L3InputPack } from './inputPack.js';

const CLUSTERS = [{ x: 0, y: 0, w: 10, h: 10 }, { x: 40, y: 40, w: 8, h: 8 }];

function basePageReport(): PageReport {
  return {
    schemaVersion: 1, kind: 'page-report', pass: true, test: 'com.magpie.uiv.demo.CalibPageScreenshotTest',
    sessionId: 'standalone', nodeId: '1:100', version: 'T1_0A_V1', matrix: 'l-shape', states: ['typical'],
    perCell: [], l3Verdicts: [], unresolvedKnownDeviations: [],
    classification: { classes: [], actionable: false, retryNoteCandidate: null, environmentCells: [] },
    durationMs: 1,
  };
}
function inputPack(): L3InputPack {
  return {
    schemaVersion: 1, kind: 'l3-input', nodeId: '1:100', version: 'T1_0A_V1',
    coordsNote: 'x', rubric: [], verdictContract: 'x',
    cells: [{ cellId: 'base__typical', state: 'typical', assertionScope: 'full',
      triptychPath: 'x.png', clusters: CLUSTERS, diffRatio: 0.1 }],
  };
}
function setup(): { reportPath: string; packPath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'uiv-attach-'));
  const reportPath = join(dir, 'page-report.json');
  const packPath = join(dir, 'l3-input.json');
  writeFileSync(reportPath, JSON.stringify(basePageReport(), null, 2));
  writeFileSync(packPath, JSON.stringify(inputPack(), null, 2));
  return { reportPath, packPath };
}

// 锚定到簇[0]=(0,0,10,10) 的合法 fail;evidence 空的 fail;伪坐标(与两簇均不相交)fail。
const legalFail = { item: 'color', verdict: 'fail',
  evidence: [{ cellId: 'base__typical', x: 1, y: 1, w: 2, h: 2 }], severity: 'high', suggestion: '修颜色' };
const emptyFail = { item: 'spacing', verdict: 'fail', evidence: [], severity: 'high', suggestion: '空证据' };
const fakeFail = { item: 'typography', verdict: 'fail',
  evidence: [{ cellId: 'base__typical', x: 9000, y: 9000, w: 5, h: 5 }], severity: 'high', suggestion: '伪坐标' };

describe('attachL3Verdicts(T4.2)', () => {
  it('合法 verdicts 回填:attached=1 dropped=0,pass 不变,report 过 validatePageReport', () => {
    const { reportPath, packPath } = setup();
    const r = attachL3Verdicts(reportPath, [legalFail], packPath);
    expect(r).toEqual({ attached: 1, dropped: 0 });
    const report = validatePageReport(JSON.parse(readFileSync(reportPath, 'utf8')));
    expect(report.l3Verdicts).toHaveLength(1);
    expect(report.pass).toBe(true);
  });

  it('evidence 空的 fail → dropped+1 不入报', () => {
    const { reportPath, packPath } = setup();
    const r = attachL3Verdicts(reportPath, [legalFail, emptyFail], packPath);
    expect(r).toEqual({ attached: 1, dropped: 1 });
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    expect(report.l3Verdicts).toHaveLength(1);
    expect(report.l3Verdicts[0].item).toBe('color');
  });

  it('伪坐标(与簇不相交)fail → dropped+1', () => {
    const { reportPath, packPath } = setup();
    expect(attachL3Verdicts(reportPath, [fakeFail], packPath)).toEqual({ attached: 0, dropped: 1 });
  });

  it('全部为 fail verdict 时 pass 仍 true(仅建议不门禁)', () => {
    const { reportPath, packPath } = setup();
    attachL3Verdicts(reportPath, [legalFail, { ...legalFail, item: 'spacing' }], packPath);
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    expect(report.pass).toBe(true);
    expect(report.l3Verdicts).toHaveLength(2);
    expect(report.l3Verdicts.every((v: { verdict: string }) => v.verdict === 'fail')).toBe(true);
  });

  it('§2.1 pass verdict 带伪坐标 evidence → 该 evidence 剔除、verdict 保留(attached 含它、dropped 不含)', () => {
    const { reportPath, packPath } = setup();
    const passWithFake = { item: 'color', verdict: 'pass',
      evidence: [{ cellId: 'base__typical', x: 9000, y: 9000, w: 5, h: 5 }], severity: null, suggestion: null };
    const r = attachL3Verdicts(reportPath, [passWithFake], packPath);
    expect(r).toEqual({ attached: 1, dropped: 0 });
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    expect(report.l3Verdicts).toHaveLength(1);
    expect(report.l3Verdicts[0].verdict).toBe('pass');
    expect(report.l3Verdicts[0].evidence).toHaveLength(0);   // 伪坐标净化
  });

  it('pass verdict 带合法 evidence → 保留该 evidence', () => {
    const { reportPath, packPath } = setup();
    const passWithReal = { item: 'color', verdict: 'pass',
      evidence: [{ cellId: 'base__typical', x: 2, y: 2, w: 3, h: 3 }], severity: null, suggestion: null };
    expect(attachL3Verdicts(reportPath, [passWithReal], packPath)).toEqual({ attached: 1, dropped: 0 });
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    expect(report.l3Verdicts[0].evidence).toHaveLength(1);
  });

  it('fail 项 evidence 锚定但 severity=null(结构非法)→ throw(与 drop 区分)', () => {
    const { reportPath, packPath } = setup();
    const anchoredButIllegal = { item: 'color', verdict: 'fail',
      evidence: [{ cellId: 'base__typical', x: 1, y: 1, w: 2, h: 2 }], severity: null, suggestion: '修' };
    expect(() => attachL3Verdicts(reportPath, [anchoredButIllegal], packPath)).toThrow(/severity/);
  });

  it('verdicts 非数组 → throw', () => {
    const { reportPath, packPath } = setup();
    expect(() => attachL3Verdicts(reportPath, { not: 'array' }, packPath)).toThrow();
  });
});
