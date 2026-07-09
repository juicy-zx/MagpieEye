/**
 * T4.3 Step 2:toJUnitXml 产物过 junit.xsd(scripts/fixtures/junit/junit.xsd,手写离线 schema)。
 * 依赖 /usr/bin/xmllint(macOS 系统自带,libxml2 --schema 校验器);未装环境本测将报错而非静默跳过,
 * 属预期(本仓库钉死 macOS 开发机,milestone-4.md T4.3 §1 硬约束④)。
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toJUnitXml } from './junit.js';
import type { ReportV1 } from './v1.js';
import type { PageReport } from '../page/report.js';

const XSD = fileURLToPath(new URL('../../../../scripts/fixtures/junit/junit.xsd', import.meta.url));
const XMLLINT = '/usr/bin/xmllint';

function writeTmp(xml: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'uiv-junit-xmllint-'));
  const p = join(dir, 'out.xml');
  writeFileSync(p, xml, 'utf8');
  return p;
}
function validateAgainstXsd(path: string): void {
  execFileSync(XMLLINT, ['--noout', '--schema', XSD, path], { stdio: 'pipe' });
}

const pageReport: PageReport = {
  schemaVersion: 1, kind: 'page-report', pass: false, test: 'com.magpie.uiv.demo.CalibPageScreenshotTest',
  sessionId: 'ci', nodeId: '1:100', version: 'T1_0A_V1', matrix: 'l-shape', states: ['typical'],
  perCell: [
    { cellId: 'base__typical', device: 'base', state: 'typical', qualifiers: 'w360dp-h800dp-xhdpi',
      judgePath: 'parity', assertionScope: 'full', pass: true, reason: null, subReason: null, score: 1,
      failureClasses: [], topViolations: [], reportPath: '/abs/cells/base__typical/report.json' },
    { cellId: 'pixel5-dark__typical', device: 'pixel5-dark', state: 'typical', qualifiers: 'w360dp-h800dp-night-xhdpi',
      judgePath: 'parity', assertionScope: 'geometry-only', pass: false, reason: null, subReason: null, score: 0.4,
      failureClasses: ['implementation_gap'],
      topViolations: [{ judgePath: 'parity', testTag: 'fig:1:101', figmaName: 'CalibTitle', property: 'position', expected: '(12,12)', actual: '(9,12)', severity: 'high', hint: 'shifted' }],
      reportPath: '/abs/cells/pixel5-dark__typical/report.json' },
    { cellId: 'tablet__typical', device: 'tablet', state: 'typical', qualifiers: 'w800dp-h1280dp-xhdpi',
      judgePath: 'render-only', assertionScope: 'render-only', pass: false, reason: 'inconclusive', subReason: 'fixture_unavailable', score: 0,
      failureClasses: [], topViolations: [], reportPath: '/abs/cells/tablet__typical/report.json' },
  ],
  l3Verdicts: [], unresolvedKnownDeviations: [],
  classification: { classes: [], actionable: false, retryNoteCandidate: null, environmentCells: [] },
  durationMs: 12345,
};

const v1Report: ReportV1 = {
  schemaVersion: 1, pass: false, reason: null, subReason: null, compileError: null, pixel: null,
  structural: { matched: 3, untaggedCoverage: 1, matchRate: 1, matchedNodes: [], untagged: [], missing: [],
    diagnostics: { containerMissing: [], pixel: [] }, matchFailure: null, extra: [],
    violations: [{ judgePath: 'parity', testTag: 'fig:1:101', figmaName: 'CalibTitle', property: 'position', expected: '(12,12)', actual: '(9,12)', severity: 'high', hint: 'shifted' }] },
  artifacts: { baseline: '/abs/baseline.png', render: '/abs/rendered.png', diff: '/abs/diff.png' },
  score: 0.5, regression: false, regressionReason: null,
};

describe('toJUnitXml 产物过 junit.xsd(xmllint --schema)', () => {
  it('page-report(混合 pass/fail/inconclusive)产物过校验', () => {
    const path = writeTmp(toJUnitXml(pageReport));
    expect(() => validateAgainstXsd(path)).not.toThrow();
  });
  it('v1 report(fail)产物过校验', () => {
    const path = writeTmp(toJUnitXml(v1Report));
    expect(() => validateAgainstXsd(path)).not.toThrow();
  });
  it('v1 report(pass)产物过校验', () => {
    const pass: ReportV1 = { ...v1Report, pass: true, reason: null, structural: null, score: 1 };
    const path = writeTmp(toJUnitXml(pass));
    expect(() => validateAgainstXsd(path)).not.toThrow();
  });
  it('反证:手工去掉 testcase 必需属性 classname 的坏 XML → xmllint 非 0', () => {
    const xml = toJUnitXml(v1Report);
    const bad = xml.replace(/ classname="[^"]*"/, '');
    expect(bad).not.toBe(xml);   // 确认替换确实生效(防正则漂移导致假阴性)
    const path = writeTmp(bad);
    expect(() => validateAgainstXsd(path)).toThrow();
  });
});
