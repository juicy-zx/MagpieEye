#!/usr/bin/env node
/**
 * ui-verify MCP server stdio 入口(bin)。Claude Code 以项目根为 cwd 拉起(.mcp.json,设计文档 5.2 形态 B)。
 * stdout = JSON-RPC 信道;host 关停 stdin(EOF)或 SIGINT/SIGTERM → 清场(stopOdiffServer)后 exit 0。
 * 不搬 CLI 的 flushAndExit(那是一次性 CLI 收尾治理,长驻 server 不适用)。
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { stopOdiffServer } from '@magpie-eye/uiv-core';
import { createUiVerifyServer } from './server.js';

async function main(): Promise<void> {
  await createUiVerifyServer().connect(new StdioServerTransport());

  // StdioServerTransport 仅监听 stdin 'data'/'error',不监听 'end'/'close';故此处自挂关停钩子:
  // host 关停(stdin EOF)或收到终止信号 → 释放 odiff server 子进程后 exit 0,不留悬挂。
  const shutdown = (): void => {
    stopOdiffServer();
    process.exit(0);
  };
  process.stdin.on('end', shutdown);
  process.stdin.on('close', shutdown);
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
