/**
 * report.json → JUnit XML 转换(T4.3 Step 1)。CI 平台(GitHub Actions/Jenkins 等)通用消费 JUnit XML
 * 呈现测试结果;本函数只做纯转换,不含门禁语义 —— exit code 门禁职责在 `uiv verify-page`/
 * `scripts/ci-gate.sh`(milestone-4.md T4.3 §0 两道门表),`uiv report --junit` 恒 exit 0。
 * schema 载体见 `scripts/fixtures/junit/junit.xsd`(Step 2,离线手写,机判契约,本文件产物须过之)。
 */
import type { PageCell, PageReport } from '../page/report.js';
import type { ReportV1 } from './v1.js';

/** 属性值转义(XML 5 特殊字符全转)。 */
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
/** 文本节点转义(仅 &<> 为 XML 语法所需;引号在文本节点无需转义,保留原样便于可读)。 */
function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function attr(name: string, value: string | number): string {
  return `${name}="${escapeAttr(String(value))}"`;
}

interface CaseResult { xml: string; failed: boolean; skipped: boolean }

function caseFromPageCell(cell: PageCell, classname: string): CaseResult {
  const open = `<testcase ${attr('name', cell.cellId)} ${attr('classname', classname)}`;
  if (cell.pass) return { xml: `${open}/>`, failed: false, skipped: false };
  if (cell.reason === 'inconclusive') {
    const xml = `${open}><skipped ${attr('message', cell.subReason ?? '')}/></testcase>`;
    return { xml, failed: false, skipped: true };
  }
  const message = cell.failureClasses.join(',');
  const body = escapeText(JSON.stringify(cell.topViolations));
  return { xml: `${open}><failure ${attr('message', message)}>${body}</failure></testcase>`, failed: true, skipped: false };
}

function caseFromV1(r: ReportV1, classname: string): CaseResult {
  const open = `<testcase ${attr('name', 'check')} ${attr('classname', classname)}`;
  if (r.pass) return { xml: `${open}/>`, failed: false, skipped: false };
  if (r.reason === 'inconclusive') {
    const xml = `${open}><skipped ${attr('message', r.subReason ?? '')}/></testcase>`;
    return { xml, failed: false, skipped: true };
  }
  const violations = r.structural?.violations ?? [];
  const message = violations.length > 0 ? violations.map((v) => v.hint).join(' | ') : `score=${r.score}`;
  const body = escapeText(JSON.stringify({ violations, score: r.score }));
  return { xml: `${open}><failure ${attr('message', message)}>${body}</failure></testcase>`, failed: true, skipped: false };
}

/** page-report 与 v1 report 二判别(kind 字段唯 page-report 携带)。 */
function isPageReport(x: ReportV1 | PageReport): x is PageReport {
  return (x as PageReport).kind === 'page-report';
}

export function toJUnitXml(input: ReportV1 | PageReport, opts?: { suiteName?: string }): string {
  const page = isPageReport(input);
  const classname = page ? input.test : 'uiv';
  const suiteName = opts?.suiteName ?? classname;
  const cases = page ? input.perCell.map((c) => caseFromPageCell(c, classname)) : [caseFromV1(input, classname)];

  const tests = cases.length;
  const failures = cases.filter((c) => c.failed).length;
  const skipped = cases.filter((c) => c.skipped).length;
  const time = page ? input.durationMs / 1000 : 0;

  const suitesAttrs = [attr('name', suiteName), attr('tests', tests), attr('failures', failures), attr('skipped', skipped)].join(' ');
  const suiteAttrs = [attr('name', suiteName), attr('tests', tests), attr('failures', failures), attr('skipped', skipped), attr('time', time)].join(' ');
  return `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<testsuites ${suitesAttrs}><testsuite ${suiteAttrs}>${cases.map((c) => c.xml).join('')}</testsuite></testsuites>\n`;
}
