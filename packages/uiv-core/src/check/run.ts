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

/** 递归找 dir 下文件名含 needle 的最新 .png;无 → null。exclude 命中的文件名跳过(如 _compare.png 类比对产物)。 */
function findNewestPng(dir: string, needle: string, exclude?: (name: string) => boolean): string | null {
  if (!existsSync(dir)) return null;
  let newest: { path: string; mtimeMs: number } | null = null;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = findNewestPng(p, needle, exclude);
      if (sub !== null) {
        const m = statSync(sub).mtimeMs;
        if (newest === null || m > newest.mtimeMs) newest = { path: sub, mtimeMs: m };
      }
    } else if (entry.isFile() && entry.name.endsWith('.png') && entry.name.includes(needle) && !(exclude?.(entry.name) ?? false)) {
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

  const t0 = Date.now();
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

  // exit 0:收集 rendered.png(测试类短名去 ScreenshotTest 后缀 = 组件短名)。
  // T2.6 三级优先+新鲜度门(章内设计):①本轮 _actual ②本轮非 _compare(旧 added 形态)③golden(unchanged 零产物);
  // mtime 早于本轮 gradle 启动(t0)的候选一律拒收,防陈旧 _actual/_compare 被"最新含短名"误收。
  const shortName = (opts.testFqn.split('.').at(-1) ?? '').replace(/ScreenshotTest$/, '');
  const roboDir = join(opts.demoDir, 'app', 'build', 'outputs', 'roborazzi');
  const goldenPath = join(opts.demoDir, 'app', 'src', 'test', 'snapshots', `${shortName}.png`);
  const fresh = (p: string | null): string | null => (p !== null && statSync(p).mtimeMs >= t0 - 1000 ? p : null);
  const found = fresh(findNewestPng(roboDir, `${shortName}_actual`))
    ?? fresh(findNewestPng(roboDir, shortName, (n) => n.endsWith('_compare.png')))
    ?? (existsSync(goldenPath) ? goldenPath : null);
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
    // 产物目录口径:diff/report 归 reports/<nodeDir>/;rendered.png/semantics.json 归 renders/<nodeDir>/。
    const reportsDir = join(opts.uiVerifyDir, 'reports', nodeDir);
    mkdirSync(reportsDir, { recursive: true });
    const diffOut = join(reportsDir, 'diff.png');
    try {
      pixel = await runL1(baselinePng, renderedPng, diffOut, loadIgnoreRegions(opts.uiVerifyDir, opts.nodeId));
      diffPng = diffOut;
    } catch (e) {
      // D-07(c):L1 是 advisory 通道,失败(server+spawn 双双不可用等)不得让已成功的渲染主链/L2 verdict 一并失败。
      console.warn(`uiv: L1 advisory failed, continuing without pixel diff: ${(e as Error).message}`);
    }
  }

  return writeReport(opts.uiVerifyDir, nodeDir, {
    ...base,
    pass: true,
    pixel,
    artifacts: { ...base.artifacts, render: renderedPng, diff: diffPng },
  });
}
