/**
 * stdio 集成测试(本章验收核心 = 编排计划 M4 T4.1 行):StdioClientTransport 拉起真实 dist server 进程
 * → JSON-RPC 调 ui_check → 断言 report 结构与 artifacts 剥离口径 → server 干净退出。
 *
 * hermetic:自建 mock-gradlew fixture(抄 exit-timing.test.ts 的 makeFixture 套路,不共享、不碰真 demo):
 * tmpdir 下 .ui-verify/mapping.json(FKEY/1:100/V1/minScore .9)+ baselines/1-100@V1/baseline.png +
 * demo/gradlew 假脚本(落 CalibCard_actual 渲染帧);无 spec.json → 走 inconclusive 路径,ReportV1 结构照常成立。
 * UIV_FASTLANE=0 强制冷道(跳过 daemon 快车道尝试),假 gradlew 秒级。
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { PNG } from 'pngjs';
import { validateReportV1 } from '@magpie-eye/uiv-core';
import { beforeAll, describe, expect, it } from 'vitest';

const DIST_SERVER = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const PREVIEW = 'com.magpie.uiv.demo.CalibCardPreview';   // → CalibCardScreenshotTest → short 'CalibCard'
const NODE_ID = '1:100';
const VERSION = 'V1';

function writePng(path: string, width: number): void {
  const png = new PNG({ width, height: 32 });
  png.data.fill(255);
  writeFileSync(path, PNG.sync.write(png));
}

/** 冷道 fixture:.ui-verify(mapping+baseline)+ demo(mock gradlew,run 中落 CalibCard_actual 渲染帧)。 */
function makeFixture(): string {
  const workdir = mkdtempSync(join(tmpdir(), 'uiv-mcp-e2e-'));
  const nodeDir = `${NODE_ID.replace(':', '-')}@${VERSION}`;
  const baseDir = join(workdir, '.ui-verify', 'baselines', nodeDir);
  mkdirSync(baseDir, { recursive: true });
  writePng(join(baseDir, 'baseline.png'), 32);   // 有基线 → runCheckL2 走 odiff
  writeFileSync(join(workdir, '.ui-verify', 'mapping.json'), JSON.stringify(
    [{ fileKey: 'FKEY', nodeId: NODE_ID, version: VERSION, minScore: 0.9, matrix: 'default5' }], null, 2,
  ));
  const demo = join(workdir, 'demo');
  mkdirSync(demo, { recursive: true });
  const template = join(workdir, 'render-template.png');   // 放 roboDir 外,免被跑前清理删除
  writePng(template, 32);
  const gradlew = join(demo, 'gradlew');
  writeFileSync(gradlew, [
    '#!/bin/sh',
    'echo "> Task :app:testDebugUnitTest" 1>&2',
    'echo "BUILD SUCCESSFUL in 2s" 1>&2',
    'mkdir -p app/build/outputs/roborazzi',
    `cp '${template}' app/build/outputs/roborazzi/CalibCard_actual.png`,
    'exit 0',
    '',
  ].join('\n'));
  chmodSync(gradlew, 0o755);
  return workdir;
}

/** 过滤 undefined 的 process.env + 强制冷道,交子进程 server(gradlew/odiff 需完整 env)。 */
function serverEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  env['UIV_FASTLANE'] = '0';   // 强制冷道,跳过 daemon 快车道尝试
  return env;
}

function textOf(res: { content: unknown }): string {
  return (res.content as [{ text: string }])[0].text;
}

describe('stdio 集成:拉起真实 server → ui_check → report 结构 + artifacts 剥离', () => {
  beforeAll(() => {
    execFileSync('npx', ['tsc', '-b', 'packages/ui-verify-mcp'], { stdio: 'inherit' });   // 自建 dist,增量幂等
  }, 120_000);

  it('ui_check 端到端:响应剥离 artifacts / 盘上 report 过 validateReportV1 / 二次调用自洽 / 缺参 isError', async () => {
    const workdir = makeFixture();
    const transport = new StdioClientTransport({
      command: process.execPath, args: [DIST_SERVER], cwd: workdir, env: serverEnv(), stderr: 'ignore',
    });
    const client = new Client({ name: 'e2e', version: '0' });
    await client.connect(transport);
    try {
      const res = await client.callTool({ name: 'ui_check', arguments: { preview: PREVIEW, node: NODE_ID, demo: 'demo' } });
      expect(res.isError).toBeFalsy();
      const payload = JSON.parse(textOf(res)) as { reportPath: string; report: Record<string, unknown> };

      // 盘上 report.json 过 validateReportV1(artifacts 完整);响应 report 剥离 artifacts。
      expect(typeof payload.reportPath).toBe('string');
      expect(existsSync(payload.reportPath)).toBe(true);
      const disk = validateReportV1(JSON.parse(readFileSync(payload.reportPath, 'utf8')));
      expect(disk.artifacts).toBeTruthy();                 // 盘上 artifacts 完整
      expect(payload.report['schemaVersion']).toBe(1);
      expect(typeof payload.report['pass']).toBe('boolean');
      expect('artifacts' in payload.report).toBe(false);   // 响应剥离 artifacts

      // 二次同参调用仍成功(odiff 起停跨调用自洽)。
      const res2 = await client.callTool({ name: 'ui_check', arguments: { preview: PREVIEW, node: NODE_ID, demo: 'demo' } });
      expect(res2.isError).toBeFalsy();

      // ui_baseline 缺必填参 → SDK schema 拒 → isError。
      const resErr = await client.callTool({ name: 'ui_baseline', arguments: { fixture: 'x.json' } });
      expect(resErr.isError).toBe(true);
    } finally {
      await client.close();   // 关停 transport,子进程 server 干净退出
    }
  }, 120_000);
});
