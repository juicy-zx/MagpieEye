/**
 * T3.3:整页外循环编排器(设计文档 3.2/3.3)。expandMatrix → 串行逐格(渲染 + L1/L2/invariant)→
 * 逐格判定档路由(口径③)→ 失败分类聚合 → source 归因 → page-report。
 * judgePath 路由(③表):
 *   base × parity 可用态           → parity / full
 *   base × 无 pin 态               → invariant-only / invariant-only(走 runInvariantOnly)
 *   pixel5-dark × parity 可用态     → parity / geometry-only(排除 color)
 *   pixel5-dark × 无 pin 态;fontScale1.3/smallPhone/tablet × 一切态 → render-only / render-only
 * state.json 防震荡不参与(disableState);逐格产物隔离到 cells/<cellId>/。
 */
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { atomicCopyFileSync, atomicWriteFileSync } from '../util/atomic.js';
import { baselineDirName } from '../baseline/pull.js';
import type { MappingStateRef } from '../baseline/mapping.js';
import { SEVERITY_WEIGHT } from '../l2/constants.js';
import { runInvariantOnly } from '../l2/report.js';
import type { SemanticsDump, SubReason, Violation } from '../l2/types.js';
import type { ReportV0 } from '../report/v0.js';
import type { ReportV1 } from '../report/v1.js';
import { runCheck } from '../check/run.js';
import type { GradleRunner } from '../check/run.js';
import { runCheckL2 } from '../check/runL2.js';
import { classifyCell, classifyPage } from './classify.js';
import { expandMatrix } from './matrix.js';
import type { Device } from './matrix.js';
import { validatePageReport } from './report.js';
import type { PageAssertionScope, PageCell, PageJudgePath, PageReport } from './report.js';
import { buildL3InputPack } from './l3/inputPack.js';
import type { L3Candidate } from './l3/inputPack.js';
import { attachL3Verdicts } from './l3/attach.js';
import type { VlmProvider } from './l3/provider.js';
import { enrichViolations } from './source-attr.js';

export interface VerifyPageOpts {
  demoDir: string; testFqn: string; nodeId: string; version: string; uiVerifyDir: string; sessionId: string;
  matrix: string; states: readonly string[]; minScore?: number; outPath?: string;
  pinnedStates?: readonly MappingStateRef[];   // T3.2/T3.4 mapping.states[](states[] canonical schema)
  vlmProvider?: VlmProvider;                    // T4.2:provider 形态(B3);缺省=不注入=零 LLM 调用(轻量形态)
}

interface CellRoute { judgePath: PageJudgePath; assertionScope: PageAssertionScope }

/** 逐格判定档路由(口径③)。parity 可用 = typical(隐式)或 pinnedStates 命中且 judgePath:'parity'。 */
function routeCell(device: Device, state: string, ref: MappingStateRef | undefined): CellRoute {
  const parityAvailable = state === 'typical' || ref?.judgePath === 'parity';
  if (device === 'base') {
    return parityAvailable
      ? { judgePath: 'parity', assertionScope: 'full' }
      : { judgePath: 'invariant-only', assertionScope: 'invariant-only' };
  }
  if (device === 'pixel5-dark' && parityAvailable) {
    return { judgePath: 'parity', assertionScope: 'geometry-only' };
  }
  return { judgePath: 'render-only', assertionScope: 'render-only' };
}

/** render-only:v0 渲染成功性 → v1 占位(structural null,score=pass?1:0)。 */
function renderOnlyReport(v0: ReportV0): ReportV1 {
  return {
    schemaVersion: 1, pass: v0.pass, reason: v0.reason, subReason: v0.subReason as SubReason | null,
    compileError: v0.compileError, pixel: v0.pixel, structural: null,
    artifacts: v0.artifacts, score: v0.pass ? 1 : 0, regression: false, regressionReason: null,
  };
}

function inconclusiveReport(subReason: SubReason, v0: ReportV0): ReportV1 {
  return {
    schemaVersion: 1, pass: false, reason: 'inconclusive', subReason, compileError: null,
    pixel: v0.pixel, structural: null, artifacts: v0.artifacts, score: 0, regression: false, regressionReason: null,
  };
}

const bySeverity = (a: Violation, b: Violation): number =>
  SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || a.testTag.localeCompare(b.testTag);

/** demo 测试短名(与 runCheckL2 一致口径):去 ScreenshotTest/Test 后缀。 */
function shortNameOf(testFqn: string): string {
  return (testFqn.split('.').at(-1) ?? '').replace(/ScreenshotTest$/, '').replace(/Test$/, '');
}

export async function verifyPage(
  runner: GradleRunner, opts: VerifyPageOpts,
): Promise<{ report: PageReport; reportPath: string }> {
  const startMs = Date.now();
  const cells = expandMatrix(opts.matrix, opts.states);
  const perCell: PageCell[] = [];
  const classifyInput: Array<{ cellId: string; report: ReportV1 }> = [];
  const l3Candidates: L3Candidate[] = [];   // T4.2:parity 格 L3 候选(合格性由 buildL3InputPack 按 artifacts 三路径过滤)
  const shortName = shortNameOf(opts.testFqn);

  for (const cell of cells) {
    const t0 = Date.now();
    const ref = opts.pinnedStates?.find((s) => s.name === cell.state);
    const route = routeCell(cell.device, cell.state, ref);
    const common = {
      demoDir: opts.demoDir, testFqn: opts.testFqn, uiVerifyDir: opts.uiVerifyDir,
      artifactSubdir: cell.cellId, skipL1: cell.device !== 'base',
      extraGradleArgs: [`-Puiv.device=${cell.device}`, `-Puiv.state=${cell.state}`, '--rerun'],
    };

    let report: ReportV1;
    let reportPath: string;
    if (route.judgePath === 'parity') {
      // parity 可用态:variant 基准 nodeDir(命中 pin 且 figmaVariantNodeId)否则页 nodeId。
      const parityNodeId = ref?.judgePath === 'parity' && ref.figmaVariantNodeId ? ref.figmaVariantNodeId : opts.nodeId;
      const rc = await runCheckL2(runner, {
        ...common, nodeId: parityNodeId, version: opts.version, disableState: true, semanticsMinMtimeMs: t0,
        ...(opts.minScore !== undefined ? { minScore: opts.minScore } : {}),
        ...(route.assertionScope === 'geometry-only' ? { excludeProperties: ['color'] } : {}),
      });
      report = rc.report; reportPath = rc.reportPath;
      // T4.2:parity 格入 L3 候选(pixel5-dark 因 skipL1 无 diff,后续按 artifacts 三路径过滤自然排除)。
      l3Candidates.push({
        cellId: cell.cellId, state: cell.state, assertionScope: route.assertionScope,
        artifacts: report.artifacts,
        pixel: report.pixel === null ? null : { diffRatio: report.pixel.diffRatio, clusters: report.pixel.clusters },
      });
    } else if (route.judgePath === 'invariant-only') {
      // base × 无 pin 态:先 runCheck 渲染产 semantics dump,再 runInvariantOnly 取真实 pass/violations。
      const rc = await runCheck(runner, { ...common, nodeId: opts.nodeId, version: opts.version });
      reportPath = rc.reportPath;
      const semPath = join(opts.demoDir, 'app', 'build', 'uiv', `${shortName}.semantics.json`);
      if (rc.report.pass && existsSync(semPath) && statSync(semPath).mtimeMs >= t0) {
        const dump = JSON.parse(readFileSync(semPath, 'utf8')) as SemanticsDump;
        report = runInvariantOnly(dump, opts.minScore !== undefined ? { minScore: opts.minScore, prevState: null } : { prevState: null });
      } else if (rc.report.pass) {
        report = inconclusiveReport('semantics_export_failed', rc.report);   // 渲染成功但 dump 缺失/陈旧
      } else {
        report = renderOnlyReport(rc.report);                                // 渲染失败(compile/harness)
      }
    } else {
      // render-only:runCheck v0 渲染成功性。
      const rc = await runCheck(runner, { ...common, nodeId: opts.nodeId, version: opts.version });
      report = renderOnlyReport(rc.report); reportPath = rc.reportPath;
    }

    if (report.structural) enrichViolations(report.structural.violations, opts.demoDir);
    const topViolations = [...(report.structural?.violations ?? [])].sort(bySeverity).slice(0, 5);
    perCell.push({
      cellId: cell.cellId, device: cell.device, state: cell.state, qualifiers: cell.qualifiers,
      judgePath: route.judgePath, assertionScope: route.assertionScope,
      pass: report.pass, reason: report.reason, subReason: report.subReason,
      score: report.score, failureClasses: classifyCell(report), topViolations, reportPath,
    });
    classifyInput.push({ cellId: cell.cellId, report });
  }

  const nodeDir = baselineDirName(opts.nodeId, opts.version);
  const pageReport: PageReport = {
    schemaVersion: 1, kind: 'page-report', pass: perCell.every((c) => c.pass),
    test: opts.testFqn, sessionId: opts.sessionId, nodeId: opts.nodeId, version: opts.version,
    matrix: opts.matrix, states: [...new Set(cells.map((c) => c.state))],
    perCell, l3Verdicts: [], unresolvedKnownDeviations: [],
    classification: classifyPage(classifyInput), durationMs: Date.now() - startMs,
  };
  validatePageReport(pageReport);

  const reportsDir = join(opts.uiVerifyDir, 'reports', nodeDir);
  mkdirSync(reportsDir, { recursive: true });
  const pageReportPath = join(reportsDir, 'page-report.json');
  atomicWriteFileSync(pageReportPath, `${JSON.stringify(pageReport, null, 2)}\n`, 'utf8');

  // T4.2:L1/L2 全过才触发 L3(轻量形态生成输入包;provider 注入时回填 l3Verdicts)。pass=false 分支零调用(触发前置);
  // 整段 advisory:失败仅 warn,不改 pass/返回值/退出码(同 L1 容错先例)。写盘后、--out 复制前接线,令 --out 拿到最终版。
  let finalReport = pageReport;
  if (pageReport.pass) {
    try {
      const built = buildL3InputPack(l3Candidates, nodeDir, join(opts.uiVerifyDir, 'reports'), opts.nodeId, opts.version);
      if (built !== null && opts.vlmProvider !== undefined) {
        const raw = await opts.vlmProvider.judge(built.pack);
        attachL3Verdicts(pageReportPath, raw, built.packPath);   // 证据锚定过滤 + 写回磁盘
        finalReport = validatePageReport(JSON.parse(readFileSync(pageReportPath, 'utf8')));   // 重读拿含 l3Verdicts 的最终版
      }
    } catch (e) {
      console.warn(`uiv: L3 advisory failed: ${(e as Error).message}`);
    }
  }

  if (opts.outPath !== undefined) {
    mkdirSync(dirname(opts.outPath), { recursive: true });
    atomicCopyFileSync(pageReportPath, opts.outPath);   // --out 另复制一份(magpie 传 .magpie/sessions/<id>/);attach 已写回,复制的是最终版
  }
  return { report: finalReport, reportPath: pageReportPath };
}
