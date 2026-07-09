import { describe, expect, it } from 'vitest';
import { toJUnitXml } from './junit.js';
import type { ReportV1 } from './v1.js';
import type { PageCell, PageReport } from '../page/report.js';

function validCell(over: Partial<PageCell> = {}): PageCell {
  return {
    cellId: 'base__typical', device: 'base', state: 'typical', qualifiers: 'w360dp-h800dp-xhdpi',
    judgePath: 'parity', assertionScope: 'full', pass: true, reason: null, subReason: null, score: 1,
    failureClasses: [], topViolations: [], reportPath: '/abs/reports/1-100@V/cells/base__typical/report.json', ...over,
  };
}
function validPageReport(over: Partial<PageReport> = {}): PageReport {
  return {
    schemaVersion: 1, kind: 'page-report', pass: true, test: 'com.magpie.uiv.demo.CalibPageScreenshotTest',
    sessionId: 'standalone', nodeId: '1:100', version: 'T1_0A_V1', matrix: 'l-shape', states: ['typical'],
    perCell: [validCell()], l3Verdicts: [], unresolvedKnownDeviations: [],
    classification: { classes: [], actionable: false, retryNoteCandidate: null, environmentCells: [] },
    durationMs: 1234, ...over,
  };
}
function validV1(over: Partial<ReportV1> = {}): ReportV1 {
  return {
    schemaVersion: 1, pass: true, reason: null, subReason: null, compileError: null, pixel: null,
    structural: null, artifacts: { baseline: null, render: null, diff: null },
    score: 1, regression: false, regressionReason: null, ...over,
  };
}

describe('toJUnitXml: page-report', () => {
  it('三格(pass/fail/inconclusive)→三 testcase,testsuite 计数与 time 正确', () => {
    const report = validPageReport({
      pass: false,
      durationMs: 58570,
      perCell: [
        validCell({ cellId: 'base__typical', pass: true }),
        validCell({
          cellId: 'pixel5-dark__typical', pass: false, reason: null,
          failureClasses: ['implementation_gap'],
          topViolations: [{ judgePath: 'parity', testTag: 'fig:1:101', figmaName: 'CalibTitle', property: 'position', expected: '(12,12)', actual: '(9,12)', severity: 'high', hint: 'shifted' }],
        }),
        validCell({ cellId: 'tablet__typical', pass: false, reason: 'inconclusive', subReason: 'fixture_unavailable' }),
      ],
    });
    const xml = toJUnitXml(report);

    // pass 格:无子元素(自闭合)
    expect(xml).toMatch(/<testcase name="base__typical" classname="com\.magpie\.uiv\.demo\.CalibPageScreenshotTest"\s*\/>/);
    // fail 格:failure message=failureClasses join ',';文本含 topViolations JSON
    expect(xml).toContain('<testcase name="pixel5-dark__typical" classname="com.magpie.uiv.demo.CalibPageScreenshotTest">');
    expect(xml).toMatch(/<failure message="implementation_gap">/);
    expect(xml).toContain(JSON.stringify(report.perCell[1]!.topViolations));
    // inconclusive 格:skipped message=subReason,自闭合无文本
    expect(xml).toMatch(/<testcase name="tablet__typical" classname="com\.magpie\.uiv\.demo\.CalibPageScreenshotTest">/);
    expect(xml).toMatch(/<skipped message="fixture_unavailable"\s*\/>/);

    // testsuite 计数与 perCell 一致;time=durationMs/1000
    expect(xml).toMatch(/<testsuite [^>]*name="com\.magpie\.uiv\.demo\.CalibPageScreenshotTest"/);
    expect(xml).toMatch(/tests="3"/);
    expect(xml).toMatch(/failures="1"/);
    expect(xml).toMatch(/skipped="1"/);
    expect(xml).toMatch(/time="58\.57"/);

    // 根节点结构:单 testsuites 含单 testsuite
    expect(xml.match(/<testsuites/g)).toHaveLength(1);
    expect(xml.match(/<testsuite /g)).toHaveLength(1);
  });

  it('opts.suiteName 覆盖 testsuite name(classname 仍取 report.test)', () => {
    const report = validPageReport();
    const xml = toJUnitXml(report, { suiteName: 'custom-suite' });
    expect(xml).toMatch(/<testsuite [^>]*name="custom-suite"/);
    expect(xml).toContain('classname="com.magpie.uiv.demo.CalibPageScreenshotTest"');
  });
});

describe('toJUnitXml: report v1', () => {
  it('pass → 单 testcase name=check,无子元素', () => {
    const xml = toJUnitXml(validV1());
    expect(xml).toMatch(/<testcase name="check"[^>]*\/>/);
    expect(xml).toMatch(/tests="1"/);
    expect(xml).toMatch(/failures="0"/);
    expect(xml).toMatch(/skipped="0"/);
  });

  it('structural.violations 非空 → failure,文本含 violations+score', () => {
    const violations: ReportV1['structural'] = {
      matched: 3, untaggedCoverage: 1, matchRate: 1, matchedNodes: [], untagged: [], missing: [],
      diagnostics: { containerMissing: [], pixel: [] }, matchFailure: null, extra: [],
      violations: [{ judgePath: 'parity', testTag: 'fig:1:101', figmaName: 'CalibTitle', property: 'position', expected: '(12,12)', actual: '(9,12)', severity: 'high', hint: 'shifted 3dp' }],
    };
    const report = validV1({ pass: false, score: 0.5, structural: violations });
    const xml = toJUnitXml(report);
    expect(xml).toMatch(/<testcase name="check"[^>]*>/);
    expect(xml).toContain('<failure');
    expect(xml).toContain(JSON.stringify(violations.violations));
    expect(xml).toContain('0.5');
    expect(xml).toMatch(/failures="1"/);
  });

  it('inconclusive → skipped message=subReason', () => {
    const report = validV1({ pass: false, reason: 'inconclusive', subReason: 'render_harness_error', score: 0 });
    const xml = toJUnitXml(report);
    expect(xml).toMatch(/<skipped message="render_harness_error"\s*\/>/);
    expect(xml).toMatch(/skipped="1"/);
    expect(xml).toMatch(/failures="0"/);
  });
});

describe('toJUnitXml: escapeXml', () => {
  it('violation hint 注入 <tag>&"\' → attr 与文本均转义,无裸露特殊字符', () => {
    const nasty = `<tag>&"'`;
    const violations: ReportV1['structural'] = {
      matched: 1, untaggedCoverage: 1, matchRate: 1, matchedNodes: [], untagged: [], missing: [],
      diagnostics: { containerMissing: [], pixel: [] }, matchFailure: null, extra: [],
      violations: [{ judgePath: 'parity', testTag: 'fig:1:101', figmaName: 'CalibTitle', property: 'position', expected: 'x', actual: 'y', severity: 'high', hint: nasty }],
    };
    const report = validV1({ pass: false, score: 0, structural: violations });
    const xml = toJUnitXml(report);
    // 原始未转义字符串不应裸露出现在产物中
    expect(xml).not.toContain(nasty);
    // < > & 在 JSON 不受影响,故转义后的 "&lt;tag&gt;&amp;" 片段应同时见于 message 属性(hint 直出)
    // 与 <failure> 文本体(JSON.stringify(violations) 内嵌 hint 后再转义)——两处均转义达成"attr/text 全转义"。
    const occurrences = xml.split('&lt;tag&gt;&amp;').length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
    // attr 上下文额外校验引号类字符也被转义(quot/apos)
    expect(xml).toContain('&lt;tag&gt;&amp;&quot;&apos;');
  });
});
