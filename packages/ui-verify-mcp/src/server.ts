/**
 * ui-verify MCP server(T4.1,设计文档 2.6 三工具门面 / 5.2 形态 B)。
 * stdio transport:stdout = JSON-RPC 信道;逻辑复用 @magpie-eye/uiv-cli/commands(与 CLI 同源)。
 *
 * 契约(口径④/⑤/⑥):
 *   - 三工具 schema 对齐 CLI(ui_check/ui_verify_page/ui_baseline);inputSchema 用 zod。
 *   - 返回单块 text content(JSON 字符串),不声明 outputSchema(防与 core 校验器双源漂移)。
 *   - ui_check 的 report 剥离 artifacts(PNG/diff 路径留盘上 report.json);page-report 无顶层 artifacts,原样返回。
 *   - pass:false 是正常返回(报告即产品,不置 isError);CliUsageError/其余异常 → isError + 文本 `uiv: <message>`,server 不崩。
 *   - 每次工具调用 finally stopOdiff(口径⑤,防 odiff 子进程 idle 悬挂);工具执行经 promise 队列串行(口径⑥)。
 */
import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { stopOdiffServer } from '@magpie-eye/uiv-core';
import type { PageReport, ReportV1 } from '@magpie-eye/uiv-core';
import { runBaselinePullCommand, runCheckCommand, runVerifyPageCommand } from '@magpie-eye/uiv-cli/commands';
import type { BaselinePullParams, CheckParams, VerifyPageParams } from '@magpie-eye/uiv-cli/commands';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const packageVersion: string = require('../package.json').version;

/**
 * 命令实现注入点(委托而非继承):默认绑 uiv-cli/commands 真实现,测试注入 fake(InMemoryTransport)。
 * stopOdiff 亦经此注入(默认 = core stopOdiffServer),规避单测对真 odiff 子进程的依赖。
 */
export interface CommandImpl {
  check(p: CheckParams, cwd: string): Promise<{ report: ReportV1; reportPath: string }>;
  verifyPage(p: VerifyPageParams, cwd: string): Promise<{ report: PageReport; reportPath: string }>;
  baselinePull(p: BaselinePullParams, cwd: string): Promise<{ specPath: string; baselinePngExists: boolean; baselinePngPath: string }>;
  stopOdiff(): void;
}

const realImpl: CommandImpl = {
  check: runCheckCommand,
  verifyPage: runVerifyPageCommand,
  baselinePull: runBaselinePullCommand,
  stopOdiff: stopOdiffServer,
};

type TextResult = { content: { type: 'text'; text: string }[]; isError?: true };

export function createUiVerifyServer(impl: CommandImpl = realImpl): McpServer {
  const server = new McpServer({ name: 'ui-verify', version: packageVersion });

  // 口径⑥ 串行队列(~8 行):state.json 读改写 / odiff 全局单例 / demo gradle 锁均非并发安全,
  // 而 MCP 协议允许并发请求 → 尾链 promise 串行化每次工具执行。
  let tail: Promise<unknown> = Promise.resolve();
  function serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = tail.then(fn, fn);   // 无论前一个成败,都在其之后再跑
    tail = run.then(() => undefined, () => undefined);   // 吞掉结果/异常,仅用于串行链
    return run;
  }

  // 统一 handler 包装:串行 + JSON text content + 错误映射 + finally stopOdiff。
  function toolCall(build: () => Promise<unknown>): Promise<TextResult> {
    return serialize(async () => {
      try {
        const payload = await build();
        return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
      } catch (e) {
        // 口径④:CliUsageError/其余异常一律映射为 isError + `uiv: <message>`(server 不崩;pass:false 不走此路)。
        return { content: [{ type: 'text', text: `uiv: ${(e as Error).message}` }], isError: true };
      } finally {
        // 口径⑤ + Codex 裁定:MCP wrapper 层 finally stopOdiff,与 commands.ts 命令层 finally 双调用
        // = 幂等双保险(stopOdiffServer 幂等),有意为之,勿删。
        impl.stopOdiff();
      }
    });
  }

  server.registerTool('ui_check', {
    description: '= uiv check(无 --record):渲染 preview → L1 像素 + L2 结构裁判。返回 {reportPath, report};report 剥离 artifacts(PNG/diff 路径留盘上 report.json,按需 Read)。pass:false 是正常返回,不置 isError。',
    inputSchema: {
      preview: z.string(),
      node: z.string(),
      demo: z.string(),
      version: z.string().optional(),
      ignoreRegion: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
    },
  }, (args) => toolCall(async () => {
    const { report, reportPath } = await impl.check({
      preview: args.preview, node: args.node, demo: args.demo,
      ...(args.version !== undefined ? { version: args.version } : {}),
      ...(args.ignoreRegion !== undefined ? { ignoreRegion: args.ignoreRegion } : {}),
    }, process.cwd());
    // artifacts 剥离:解构去键得新对象,不 mutate 原 report(与 CLI「末行给路径、内容自取」同口径)。
    const { artifacts: _artifacts, ...stripped } = report;
    return { reportPath, report: stripped };
  }));

  server.registerTool('ui_verify_page', {
    description: '= uiv verify-page:整页矩阵外循环,恒返回 page-report(perCell[].reportPath 指向逐格盘上报告;无顶层 artifacts,原样返回)。',
    inputSchema: {
      test: z.string(),
      node: z.string(),
      demo: z.string(),
      session: z.string(),
      version: z.string().optional(),
      states: z.array(z.string()).optional(),
      matrix: z.string().optional(),
      out: z.string().optional(),
    },
  }, (args) => toolCall(async () => {
    const { report, reportPath } = await impl.verifyPage({
      test: args.test, node: args.node, demo: args.demo, session: args.session,
      ...(args.version !== undefined ? { version: args.version } : {}),
      ...(args.states !== undefined ? { states: args.states } : {}),
      ...(args.matrix !== undefined ? { matrix: args.matrix } : {}),
      ...(args.out !== undefined ? { out: args.out } : {}),
    }, process.cwd());
    return { reportPath, report };
  }));

  server.registerTool('ui_baseline', {
    description: '= uiv baseline pull(fixture 模式,REST 通道待 B1):拉基准 spec.json。返回 {specPath, baselinePngExists}。',
    inputSchema: {
      fixture: z.string(),
      file: z.string(),
      node: z.string(),
    },
  }, (args) => toolCall(async () => {
    const { specPath, baselinePngExists } = await impl.baselinePull(
      { fixture: args.fixture, file: args.file, node: args.node }, process.cwd(),
    );
    return { specPath, baselinePngExists };
  }));

  return server;
}
