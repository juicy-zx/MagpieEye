/**
 * commands.ts 纯抽取冒烟:三段编排从 index.ts 原样搬移,行为不变。回归护栏以既有
 * exit-timing.test.ts(冷道 check e2e)/check-version.test.ts(--version 转发)为闸;本测仅冒烟
 * runBaselinePullCommand 的 cwd 注入与结构化返回(复用 baseline/pull 既有 fixture 套路)。
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { CliUsageError } from './args.js';
import { runCheckCommand, runBaselinePullCommand } from './commands.js';

const FIXTURE = fileURLToPath(new URL('../../uiv-core/fixtures/rest-nodes-card.json', import.meta.url));

describe('runBaselinePullCommand(cwd 注入冒烟)', () => {
  it('fixture 驱动 → spec.json 落 <cwd>/.ui-verify/baselines/<nodeDir>,结构化返回', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'uiv-cmd-'));
    const r = await runBaselinePullCommand({ fixture: FIXTURE, file: 'FKEY', node: '1:100' }, cwd);
    expect(existsSync(r.specPath)).toBe(true);
    expect(basename(dirname(r.specPath))).toBe('1-100@T1_0A_V1');
    expect(r.baselinePngExists).toBe(false);   // fixture 无 PNG,只探测不阻断
    expect(basename(r.baselinePngPath)).toBe('baseline.png');
    const spec = JSON.parse(readFileSync(r.specPath, 'utf8')) as { root: { bbox: { w: number } } };
    expect(spec.root.bbox.w).toBe(360);
  });

  // 批次⑤欠2(2026-07-16 勘误发现):按旧文档把 runDir 目录传给 --fixture,
  // 此前 FixtureFigmaClient 内部 readFile 裸抛 EISDIR 栈,exit 2 无可读信息。
  // 修法:前置校验产可读 CliUsageError,并指向在线冻结通道 uiv pin。
  it('--fixture 传目录(EISDIR 场景)→ 可读 CliUsageError 指向 uiv pin,不再裸抛 EISDIR 栈', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'uiv-cmd-eisdir-'));
    const fixtureDir = mkdtempSync(join(tmpdir(), 'uiv-cmd-eisdir-target-'));
    await expect(runBaselinePullCommand({ fixture: fixtureDir, file: 'FKEY', node: '1:100' }, cwd))
      .rejects.toThrow(CliUsageError);
    await expect(runBaselinePullCommand({ fixture: fixtureDir, file: 'FKEY', node: '1:100' }, cwd))
      .rejects.toThrow(/uiv pin/);
  });
});

// P0-8 双 lane:direct lane 端到端(mock gradlew)证 lane 透传 + execution receipt + 产 ReportV1(codex C:direct Done-when②③)。
const PREVIEW = 'com.magpie.uiv.demo.CalibCardPreview';   // → CalibCardScreenshotTest → short 'CalibCard'
const NODE_ID = '1:100';
const VERSION = 'V1';

function writePng(path: string, width: number): void {
  const png = new PNG({ width, height: 32 });
  png.data.fill(255);
  writeFileSync(path, PNG.sync.write(png));
}

/** 组装 direct check fixture:.ui-verify(mapping+baseline)+ demo(mock gradlew,run 中落渲染帧;直连不经 sandbox-exec)。 */
function makeCheckFixture(): string {
  const workdir = mkdtempSync(join(tmpdir(), 'uiv-cmd-check-'));
  const baseDir = join(workdir, '.ui-verify', 'baselines', `${NODE_ID.replace(':', '-')}@${VERSION}`);
  mkdirSync(baseDir, { recursive: true });
  writePng(join(baseDir, 'baseline.png'), 32);
  writeFileSync(join(workdir, '.ui-verify', 'mapping.json'), JSON.stringify(
    [{ fileKey: 'FKEY', nodeId: NODE_ID, version: VERSION, minScore: 0.9, matrix: 'default5' }], null, 2,
  ));
  const demo = join(workdir, 'demo');
  mkdirSync(join(demo, 'app'), { recursive: true });   // 默认 :app 模块目录须在 gradle 调用前存在
  const template = join(workdir, 'render-template.png');
  writePng(template, 32);
  const gradlew = join(demo, 'gradlew');   // DirectGradleRunner 直 spawn <demo>/gradlew(cwd=demo)
  writeFileSync(gradlew, [
    '#!/bin/sh',
    'echo "> Task :app:testDebugUnitTest" 1>&2',
    'echo "BUILD SUCCESSFUL in 1s" 1>&2',
    'mkdir -p app/build/outputs/roborazzi',
    `cp '${template}' app/build/outputs/roborazzi/CalibCard_actual.png`,
    'exit 0',
    '',
  ].join('\n'));
  chmodSync(gradlew, 0o755);
  return workdir;
}

describe('runCheckCommand(P0-8 双 lane:lane 透传 + execution receipt + direct 产 ReportV1)', () => {
  it('lane=default → DirectGradleRunner 跑 mock gradlew 产 ReportV1;receipt effectiveLane=direct/inherited/host/无 offline', async () => {
    const workdir = makeCheckFixture();
    const { report, reportPath, execution } = await runCheckCommand({
      preview: PREVIEW, node: NODE_ID, demo: 'demo',
      lane: { requestedLane: 'default', selectedBy: 'cli-default' },
    }, workdir);
    expect(existsSync(reportPath)).toBe(true);
    expect(report.schemaVersion).toBe(1);
    // receipt 由父进程按请求 lane 组装,透传溯源,记 direct 姿态(非 gradle 自报)。
    expect(execution).toEqual({
      requestedLane: 'default', effectiveLane: 'direct', selectedBy: 'cli-default',
      runner: 'DirectGradleRunner', sandboxEstablished: false,
      gradleUserHomeMode: 'inherited', networkMode: 'host', gradleOffline: false,
    });
  });
});
