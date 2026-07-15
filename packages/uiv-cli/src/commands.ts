/**
 * uiv CLI 编排复用层(T4.1)。check/verify-page/baseline-pull 三段编排从 index.ts 原样抽取,
 * 供 CLI 入口(index.ts)与 ui-verify MCP server(@magpie-eye/ui-verify-mcp)共同复用。
 *
 * 契约(Codex 裁定,四约束):本层只做编排、返回结构化结果——
 *   ① 禁 console.log:末行路径打印留 CLI index.ts(由返回值代打印);stdio MCP 下 stdout=JSON-RPC 信道。
 *   ② 无 process 退出:exitCode 由调用方按 report.pass 设定。
 *   ③ 无 MCP 专属逻辑:IO/退出/错误呈现各由 CLI 入口与 MCP wrapper 自理。
 *   ④ 进度/lane 信息维持 console.error(CLI 行为不变;MCP 允许 stderr 日志)。
 * uiVerifyDir/demo/fixture/out 相对路径均按注入的 cwd 解析(CLI 传 process.cwd(),MCP 同)。
 * --record/--json/pin 逻辑不在本层(CLI 独有,MCP 不暴露)。
 */
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  FixtureFigmaClient, addIgnoreRegion, pullBaseline, runCheckL2, stopOdiffServer, verifyPage,
} from '@magpie-eye/uiv-core';
import type { MappingEntry, PageReport, ReportV1 } from '@magpie-eye/uiv-core';
import { CliUsageError, previewToTestFqn } from './args.js';
import type { CliIgnoreRegion } from './args.js';
import { selectMappingEntry } from './mapping-entry.js';
import { isFastLaneEnabled } from './fastlane.js';
import { renderPreviewViaDaemon, selectGradleRunner } from './gradle-runner.js';
import type { ExecutionReceipt, LaneRequest } from './gradle-runner.js';
import { withWorkspaceLock } from './workspace-lock.js';

type Lane = 'fast' | 'slow' | 'fast-fallback-slow';

/** check/verify-page 的 version/minScore/states 取自 mapping.json(baseline pull 的 upsert 产物,source of truth)。
 *  version 可选:给定时按 nodeId+version 唯一命中消歧(D-02/M3),否则按 nodeId 取首条。选取纯逻辑见 mapping-entry.ts。 */
async function readMappingEntry(uiVerifyDir: string, nodeId: string, version?: string): Promise<MappingEntry> {
  const mappingPath = path.join(uiVerifyDir, 'mapping.json');
  let text: string;
  try {
    text = await readFile(mappingPath, 'utf8');
  } catch {
    throw new CliUsageError(`mapping.json not found at ${mappingPath}; run \`uiv baseline pull\` first`);
  }
  const entries = JSON.parse(text) as MappingEntry[];
  return selectMappingEntry(entries, nodeId, version);
}

export interface CheckParams {
  preview: string; node: string; demo: string; version?: string; ignoreRegion?: CliIgnoreRegion;
  /** P0-8 批次②:Gradle project path(默认 :app,由 core 约定映射出模块目录)/ variant(默认 debug)。 */
  module?: string; variant?: string;
  /** P0-8 双 lane(codex 019f6029):gradle 执行 lane 请求 + 溯源(default→direct / sandbox→冷道)。无隐性安全默认:
   *  CLI 显式传 --sandbox 值,MCP handler 强制 sandbox。与 fast/slow 渲染轴正交。 */
  lane: LaneRequest;
}

/** = `uiv check`(无 --record);返回 v1 report + 盘上路径 + execution receipt。exitCode/record/末行打印/receipt 发射由调用方处理。 */
export async function runCheckCommand(
  p: CheckParams, cwd: string,
): Promise<{ report: ReportV1; reportPath: string; execution: ExecutionReceipt }> {
  const uiVerifyDir = path.resolve(cwd, '.ui-verify');
  // P0-9:workspace 锁边界(CLI/MCP/直接 import commands 共用变更边界)。整个 check 编排持锁,finally 释放。
  return withWorkspaceLock(uiVerifyDir, async () => {
  const testFqn = previewToTestFqn(p.preview);
  if (p.ignoreRegion !== undefined) {
    addIgnoreRegion(uiVerifyDir, p.node, p.ignoreRegion);   // 先持久化再执行
  }
  const entry = await readMappingEntry(uiVerifyDir, p.node, p.version);
  // gradle runner 选路(direct/sandbox);快车道失败时的回落道均走它。
  const sel = await selectGradleRunner(uiVerifyDir, p.lane);
  const runner = sel.runner;

  // T2.8 快车道:静态 preview 先试 fast(daemon 托管 worker);任何失败自动回落慢车道并如实标注 lane。
  let lane: Lane = 'slow';
  let preRendered: { renderedPng: string; semanticsPath: string } | undefined;
  if (isFastLaneEnabled(p.preview)) {
    const stageDir = path.join(uiVerifyDir, 'renders');   // .ui-verify/renders 已被 .gitignore 忽略
    mkdirSync(stageDir, { recursive: true });
    const stagePng = path.join(stageDir, '.fast-stage.png');
    const stageSem = path.join(stageDir, '.fast-stage.semantics.json');
    try {
      await renderPreviewViaDaemon(path.join(uiVerifyDir, 'daemon.sock'), p.preview, stagePng, stageSem);
      preRendered = { renderedPng: stagePng, semanticsPath: stageSem };
      lane = 'fast';
      console.error('uiv: render lane=fast (daemon paparazzi worker)');
    } catch (e) {
      lane = 'fast-fallback-slow';
      console.error(`uiv: fast lane unavailable (${(e as Error).message}); falling back to slow`);
    }
  }
  if (lane !== 'fast') console.error(`uiv: gradle lane=${sel.execution.effectiveLane} (${sel.reason})`);

  try {
    const { report, reportPath } = await runCheckL2(runner, {
      demoDir: path.resolve(cwd, p.demo),
      testFqn,
      nodeId: p.node,
      version: entry.version,
      uiVerifyDir,
      minScore: entry.minScore,
      lane,
      // P0-8 批次②:moduleName(Gradle project path)/ variant 透传,core 约定映射出模块目录 + 派生 task。
      moduleName: p.module ?? ':app',
      variant: p.variant ?? 'debug',
      ...(preRendered ? { preRendered } : {}),
    });
    return { report, reportPath, execution: sel.execution };
  } finally {
    // D-07(a):释放 odiff server 子进程,防其 idle 悬挂拖住进程退出(实证 idle 7 分钟)。
    // Codex 裁定:本层(CLI command)与 MCP wrapper 层的 finally 双调用=幂等双保险(stopOdiffServer 幂等),有意为之,勿删。
    stopOdiffServer();
  }
  });
}

export interface VerifyPageParams {
  test: string; node: string; demo: string; session: string;
  version?: string; states?: string[]; matrix?: string; out?: string;
  /** P0-8 批次②:Gradle project path(默认 :app)/ variant(默认 debug),透传逐格 runCheck(L2)。 */
  module?: string; variant?: string;
  /** P0-8 双 lane(codex 019f6029):gradle 执行 lane 请求 + 溯源。同 CheckParams.lane。 */
  lane: LaneRequest;
}

/** = `uiv verify-page`(恒返回 report,无 --json 打印分支)。exitCode/末行打印/receipt 发射由调用方处理。 */
export async function runVerifyPageCommand(
  p: VerifyPageParams, cwd: string,
): Promise<{ report: PageReport; reportPath: string; execution: ExecutionReceipt }> {
  const uiVerifyDir = path.resolve(cwd, '.ui-verify');
  // P0-9:workspace 锁边界(与 CLI/MCP 共用)。整页外循环持锁,finally 释放。
  return withWorkspaceLock(uiVerifyDir, async () => {
  // 统一调用契约(跨章第 1 条):version/minScore/states 取自 mapping entry。
  const entry = await readMappingEntry(uiVerifyDir, p.node, p.version);
  const states = (p.states && p.states.length > 0) ? p.states : (entry.states?.map((s) => s.name) ?? []);
  const matrix = p.matrix ?? 'l-shape';   // CLI 默认经 args 已定 'l-shape';MCP 省略时同默认
  const sel = await selectGradleRunner(uiVerifyDir, p.lane);
  console.error(`uiv: gradle lane=${sel.execution.effectiveLane} (${sel.reason})`);
  try {
    const { report, reportPath } = await verifyPage(sel.runner, {
      demoDir: path.resolve(cwd, p.demo),
      testFqn: p.test,
      nodeId: p.node,
      version: entry.version,
      uiVerifyDir,
      sessionId: p.session,
      matrix,
      states,
      minScore: entry.minScore,
      // P0-8 批次②:moduleName / variant 透传逐格。
      moduleName: p.module ?? ':app',
      variant: p.variant ?? 'debug',
      ...(entry.states ? { pinnedStates: entry.states } : {}),
      ...(p.out !== undefined ? { outPath: path.resolve(cwd, p.out) } : {}),
    });
    return { report, reportPath, execution: sel.execution };
  } finally {
    // D-07(a) + Codex 裁定:命令层与 MCP wrapper 层 finally 双调用=幂等双保险,勿删。
    stopOdiffServer();
  }
  });
}

export interface BaselinePullParams { fixture: string; file: string; node: string }

/** = `uiv baseline pull`(fixture 模式;REST 通道待 B1)。baseline.png 缺失只探测不阻断,WARN 打印由调用方处理。 */
export async function runBaselinePullCommand(
  p: BaselinePullParams, cwd: string,
): Promise<{ specPath: string; baselinePngExists: boolean; baselinePngPath: string }> {
  const uiVerifyDir = path.resolve(cwd, '.ui-verify');
  // P0-9:workspace 锁边界(与 CLI/MCP 共用)。spec.json/mapping.json 落盘持锁。
  return withWorkspaceLock(uiVerifyDir, async () => {
    const client = new FixtureFigmaClient(path.resolve(cwd, p.fixture));
    const r = await pullBaseline(client, p.file, p.node, uiVerifyDir);
    return { specPath: r.specPath, baselinePngExists: r.baselinePngExists, baselinePngPath: r.baselinePngPath };
  });
}
