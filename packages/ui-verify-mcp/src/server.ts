/**
 * ui-verify MCP server(T4.1,设计文档 2.6 三工具门面 / 5.2 形态 B)。
 * stdio transport:stdout = JSON-RPC 信道(禁 console.log);逻辑复用 @magpie-eye/uiv-cli/commands。
 *
 * Step 0 骨架:三工具注册 + handler 一律 isError,仅供冒烟(in-process listTools)。
 * 真实 handler(schema 对齐 CLI / artifacts 剥离 / 串行 / 错误映射 / stopOdiffServer)在 Step 2 落地。
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function createUiVerifyServer(): McpServer {
  const server = new McpServer({ name: 'ui-verify', version: '0.0.1' });
  const notImpl = (): { content: { type: 'text'; text: string }[]; isError: true } => ({
    content: [{ type: 'text', text: 'uiv: not implemented' }],
    isError: true,
  });

  server.registerTool('ui_check', {
    description: '= uiv check(无 --record)',
    inputSchema: { preview: z.string(), node: z.string(), demo: z.string() },
  }, notImpl);

  server.registerTool('ui_verify_page', {
    description: '= uiv verify-page(恒返回 report)',
    inputSchema: { test: z.string(), node: z.string(), demo: z.string(), session: z.string() },
  }, notImpl);

  server.registerTool('ui_baseline', {
    description: '= uiv baseline pull',
    inputSchema: { fixture: z.string(), file: z.string(), node: z.string() },
  }, notImpl);

  return server;
}
