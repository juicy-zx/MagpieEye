/**
 * server.ts 三工具 in-process 单测(InMemoryTransport + fake CommandImpl,不依赖真 odiff/gradle)。
 * 覆盖:冒烟列举 / artifacts 剥离 / schema 拒非法 / 错误映射 / 可选透传 / 串行 / finally stopOdiff。
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import type { PageReport, ReportV1 } from '@magpie-eye/uiv-core';
import type { VerifyPageParams } from '@magpie-eye/uiv-cli/commands';
import { createUiVerifyServer } from './server.js';
import type { CommandImpl } from './server.js';

const sleep = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms); });

const reportV1Fixture: ReportV1 = {
  schemaVersion: 1, pass: false, reason: null, subReason: null, compileError: null,
  pixel: null, structural: null, artifacts: { baseline: 'b.png', render: 'r.png', diff: null },
  score: 0, regression: false, regressionReason: null,
};

const pageReportFixture: PageReport = {
  schemaVersion: 1, kind: 'page-report', pass: true, test: 'com.x.CalibPageScreenshotTest',
  sessionId: 's1', nodeId: '1:100', version: 'V1', matrix: 'l-shape', states: ['typical'],
  perCell: [{
    cellId: 'base@typical', device: 'base', state: 'typical', qualifiers: '',
    judgePath: 'parity', assertionScope: 'full', pass: true, reason: null, subReason: null,
    score: 1, failureClasses: [], topViolations: [], reportPath: '/tmp/cells/base@typical/report.json',
  }],
  l3Verdicts: [], unresolvedKnownDeviations: [],
  classification: { classes: [], actionable: false, retryNoteCandidate: null, environmentCells: [] },
  durationMs: 12,
};

function makeFake(overrides: Partial<CommandImpl> = {}): CommandImpl {
  return {
    check: async () => ({ reportPath: '/tmp/r.json', report: reportV1Fixture }),
    verifyPage: async () => ({ reportPath: '/tmp/p.json', report: pageReportFixture }),
    baselinePull: async () => ({ specPath: '/tmp/s.json', baselinePngExists: false, baselinePngPath: '/tmp/b.png' }),
    stopOdiff: () => { /* no-op */ },
    ...overrides,
  };
}

async function connect(impl: CommandImpl): Promise<Client> {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await createUiVerifyServer(impl).connect(st);
  const client = new Client({ name: 't', version: '0' });
  await client.connect(ct);
  return client;
}

function textOf(res: { content: unknown }): string {
  return (res.content as [{ text: string }])[0].text;
}

describe('createUiVerifyServer 三工具', () => {
  it('冒烟:in-process 连通,三工具可列出', async () => {
    const client = await connect(makeFake());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['ui_baseline', 'ui_check', 'ui_verify_page']);
  });

  it('① ui_check:text JSON 含 reportPath;report 剥离 artifacts;pass:false 但不置 isError', async () => {
    const client = await connect(makeFake());
    const res = await client.callTool({
      name: 'ui_check', arguments: { preview: 'com.x.FooPreview', node: '1:100', demo: 'demo' },
    });
    expect(res.isError).toBeFalsy();
    const payload = JSON.parse(textOf(res)) as { reportPath: string; report: Record<string, unknown> };
    expect(payload.reportPath).toBe('/tmp/r.json');
    expect(payload.report['pass']).toBe(false);
    expect(payload.report['schemaVersion']).toBe(1);
    expect('artifacts' in payload.report).toBe(false);   // 剥离
  });

  it('② 缺 demo → SDK schema 层拒(isError,校验先于 handler);impl.check 未被调用', async () => {
    let checkCalls = 0;
    const client = await connect(makeFake({
      check: async () => { checkCalls += 1; return { reportPath: '/tmp/r.json', report: reportV1Fixture }; },
    }));
    const res = await client.callTool({
      name: 'ui_check', arguments: { preview: 'com.x.FooPreview', node: '1:100' },
    });
    expect(res.isError).toBe(true);       // SDK 在 handler 前用 zod 校验 inputSchema,缺必填即拒
    expect(textOf(res)).toContain('demo');
    expect(checkCalls).toBe(0);           // impl 未被调用
  });

  it('③ impl 抛错(mapping.json not found)→ isError:true,text 含原文', async () => {
    const client = await connect(makeFake({
      check: async () => { throw new Error('mapping.json not found at /x; run `uiv baseline pull` first'); },
    }));
    const res = await client.callTool({
      name: 'ui_check', arguments: { preview: 'com.x.FooPreview', node: '1:100', demo: 'demo' },
    });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('uiv: mapping.json not found');
  });

  it('④ ui_verify_page:states/matrix 可选透传;返回含 perCell[].reportPath', async () => {
    let seen: VerifyPageParams | undefined;
    const client = await connect(makeFake({
      verifyPage: async (p) => { seen = p; return { reportPath: '/tmp/p.json', report: pageReportFixture }; },
    }));
    const res = await client.callTool({
      name: 'ui_verify_page',
      arguments: { test: 'com.x.CalibPageScreenshotTest', node: '1:100', demo: 'demo', session: 's1', states: ['typical', 'rtl'], matrix: 'full' },
    });
    expect(res.isError).toBeFalsy();
    expect(seen?.states).toEqual(['typical', 'rtl']);
    expect(seen?.matrix).toBe('full');
    const payload = JSON.parse(textOf(res)) as { report: PageReport };
    expect(payload.report.perCell[0]!.reportPath).toBe('/tmp/cells/base@typical/report.json');
  });

  it('⑤ 串行:两并发 callTool 经队列串行(后者 start >= 前者 end)', async () => {
    const spans: Array<{ tool: string; start: number; end: number }> = [];
    const record = async (tool: string): Promise<void> => {
      const start = Date.now();
      await sleep(30);
      spans.push({ tool, start, end: Date.now() });
    };
    const client = await connect(makeFake({
      check: async () => { await record('check'); return { reportPath: '/tmp/r.json', report: reportV1Fixture }; },
      baselinePull: async () => { await record('baseline'); return { specPath: '/tmp/s.json', baselinePngExists: false, baselinePngPath: '/tmp/b.png' }; },
    }));
    await Promise.all([
      client.callTool({ name: 'ui_check', arguments: { preview: 'com.x.FooPreview', node: '1:100', demo: 'demo' } }),
      client.callTool({ name: 'ui_baseline', arguments: { fixture: 'f.json', file: 'FKEY', node: '1:100' } }),
    ]);
    expect(spans).toHaveLength(2);
    const sorted = [...spans].sort((a, b) => a.start - b.start);
    expect(sorted[1]!.start).toBeGreaterThanOrEqual(sorted[0]!.end);   // 无重叠 = 串行
  });

  it('⑥ 每次调用后 stopOdiff 被调(含成功与 impl 抛错路径)', async () => {
    let stopCount = 0;
    const client = await connect(makeFake({
      stopOdiff: () => { stopCount += 1; },
      check: async () => { throw new Error('boom'); },
    }));
    await client.callTool({ name: 'ui_baseline', arguments: { fixture: 'f.json', file: 'FKEY', node: '1:100' } });
    expect(stopCount).toBe(1);   // 成功路径
    const res = await client.callTool({ name: 'ui_check', arguments: { preview: 'com.x.FooPreview', node: '1:100', demo: 'demo' } });
    expect(res.isError).toBe(true);
    expect(stopCount).toBe(2);   // 抛错仍走 finally
  });
});
