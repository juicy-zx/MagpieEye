/**
 * uiv check 核心(T1.2 Step 8)。gradle 层为可注入接口(单测用 FakeRunner,
 * 生产实现 node:child_process.spawn 由 CLI 提供)。
 * v0 pass 语义:pass = 渲染管线成功(gradle exit 0 且 rendered.png 收集到);
 * L1 结果只进 pixel 字段(advisory),不参与判定。
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { baselineDirName } from '../baseline/pull.js';
import { runL1 } from '../l1/engine.js';
import { loadIgnoreRegions } from '../l1/ignore.js';
import { validateReportV0 } from '../report/v0.js';
import type { PixelResult, ReportV0 } from '../report/v0.js';

export interface GradleRunner {          // 生产实现用 node:child_process.spawn
  run(cwd: string, args: string[]): Promise<{ exitCode: number; stderr: string }>;
}
export interface CheckOpts { demoDir: string; testFqn: string; nodeId: string; version: string; uiVerifyDir: string }

const COMPILE_ERROR_RE = /^e: .*$|^.*Compilation error.*$/gm;

/** 从 stderr 截取编译错误匹配段;无匹配返回 null。 */
function extractCompileError(stderr: string): string | null {
  const lines = stderr.match(COMPILE_ERROR_RE);
  return lines === null ? null : lines.join('\n');
}

/** 递归找 dir 下文件名含 needle 的最新 .png;无 → null。 */
function findNewestPng(dir: string, needle: string): string | null {
  if (!existsSync(dir)) return null;
  let newest: { path: string; mtimeMs: number } | null = null;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = findNewestPng(p, needle);
      if (sub !== null) {
        const m = statSync(sub).mtimeMs;
        if (newest === null || m > newest.mtimeMs) newest = { path: sub, mtimeMs: m };
      }
    } else if (entry.isFile() && entry.name.endsWith('.png') && entry.name.includes(needle)) {
      const m = statSync(p).mtimeMs;
      if (newest === null || m > newest.mtimeMs) newest = { path: p, mtimeMs: m };
    }
  }
  return newest === null ? null : newest.path;
}

function writeReport(uiVerifyDir: string, nodeDir: string, report: ReportV0): { report: ReportV0; reportPath: string } {
  const validated = validateReportV0(report);
  const reportDir = join(uiVerifyDir, 'reports', nodeDir);
  mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, 'report.json');
  writeFileSync(reportPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
  return { report: validated, reportPath };
}

export async function runCheck(runner: GradleRunner, opts: CheckOpts): Promise<{ report: ReportV0; reportPath: string }> {
  const nodeDir = baselineDirName(opts.nodeId, opts.version);
  const baselinePng = join(opts.uiVerifyDir, 'baselines', nodeDir, 'baseline.png');
  const baselineExists = existsSync(baselinePng);
  const base: ReportV0 = {
    schemaVersion: 0,
    pass: false,
    reason: null,
    subReason: null,
    compileError: null,
    pixel: null,
    artifacts: { baseline: baselineExists ? baselinePng : null, render: null, diff: null },
  };

  const { exitCode, stderr } = await runner.run(opts.demoDir, [
    'testDebugUnitTest', '--tests', opts.testFqn, '-Proborazzi.test.compare=true',
  ]);

  if (exitCode !== 0) {
    const compileError = extractCompileError(stderr);
    if (compileError !== null) {
      return writeReport(opts.uiVerifyDir, nodeDir, { ...base, compileError });
    }
    return writeReport(opts.uiVerifyDir, nodeDir, { ...base, reason: 'inconclusive', subReason: 'render_harness_error' });
  }

  // exit 0:收集 rendered.png(测试类短名去 ScreenshotTest 后缀 = 组件短名)
  const shortName = (opts.testFqn.split('.').at(-1) ?? '').replace(/ScreenshotTest$/, '');
  const found = findNewestPng(join(opts.demoDir, 'app', 'build', 'outputs', 'roborazzi'), shortName);
  if (found === null) {
    return writeReport(opts.uiVerifyDir, nodeDir, { ...base, reason: 'inconclusive', subReason: 'render_harness_error' });
  }
  const renderDir = join(opts.uiVerifyDir, 'renders', nodeDir);
  mkdirSync(renderDir, { recursive: true });
  const renderedPng = join(renderDir, 'rendered.png');
  copyFileSync(found, renderedPng);

  let pixel: PixelResult | null = null;
  let diffPng: string | null = null;
  if (baselineExists) {
    diffPng = join(renderDir, 'diff.png');
    pixel = await runL1(baselinePng, renderedPng, diffPng, loadIgnoreRegions(opts.uiVerifyDir, opts.nodeId));
  }

  return writeReport(opts.uiVerifyDir, nodeDir, {
    ...base,
    pass: true,
    pixel,
    artifacts: { ...base.artifacts, render: renderedPng, diff: diffPng },
  });
}
