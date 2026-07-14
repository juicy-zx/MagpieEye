/**
 * uiv check 核心(T1.2 Step 8)。gradle 层为可注入接口(单测用 FakeRunner,
 * 生产实现 node:child_process.spawn 由 CLI 提供)。
 * v0 pass 语义:pass = 渲染管线成功(gradle exit 0 且 rendered.png 收集到);
 * L1 结果只进 pixel 字段(advisory),不参与判定。
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { atomicCopyFileSync, atomicWriteFileSync } from '../util/atomic.js';
import { baselineDirName } from '../baseline/pull.js';
import { runL1 } from '../l1/engine.js';
import { loadIgnoreRegions } from '../l1/ignore.js';
import { validateReportV0 } from '../report/v0.js';
import type { PixelResult, ReportV0 } from '../report/v0.js';

export interface GradleRunner {          // 生产实现用 node:child_process.spawn
  run(cwd: string, args: string[]): Promise<{ exitCode: number; stderr: string }>;
}
export interface CheckOpts {
  demoDir: string; testFqn: string; nodeId: string; version: string; uiVerifyDir: string;
  /** T2.8 快车道:worker 已产出的 PNG 绝对路径;设置则跳过 gradle 与收集,直接进 L1/报告(与慢车道同一路径)。 */
  preRenderedPng?: string;
  /** T3.3:baseline 存在也不跑 L1(逐格页验证:非 base 设备尺寸/配色不同,L1 纯噪声)。 */
  skipL1?: boolean;
  /** T3.3:拼在 compare 参数后的额外 gradle 参数(-Puiv.device/state、--rerun)。 */
  extraGradleArgs?: string[];
  /** T3.3:仅 renders/reports 路径变 <nodeDir>/cells/<sub>(baselines 仍 <nodeDir>);逐格产物隔离。 */
  artifactSubdir?: string;
}

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

/** 跑前清理:递归删除 roboDir 下属于本组件的上一轮 roborazzi 比对产物(名含 needle 且以 _actual.png / _compare.png 结尾)。 */
function pruneRoborazziArtifacts(dir: string, needle: string): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      pruneRoborazziArtifacts(p, needle);
    } else if (entry.isFile() && entry.name.includes(needle)
      && (entry.name.endsWith('_actual.png') || entry.name.endsWith('_compare.png'))) {
      rmSync(p, { force: true });
    }
  }
}

function writeReport(reportsDir: string, report: ReportV0): { report: ReportV0; reportPath: string } {
  const validated = validateReportV0(report);
  mkdirSync(reportsDir, { recursive: true });
  const reportPath = join(reportsDir, 'report.json');
  atomicWriteFileSync(reportPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
  return { report: validated, reportPath };
}

export async function runCheck(runner: GradleRunner, opts: CheckOpts): Promise<{ report: ReportV0; reportPath: string }> {
  const nodeDir = baselineDirName(opts.nodeId, opts.version);
  // T3.3:逐格产物隔离——renders/reports 追加 cells/<sub>;baselines 恒 <nodeDir>。
  const cellSeg = opts.artifactSubdir !== undefined ? ['cells', opts.artifactSubdir] : [];
  const reportsDir = join(opts.uiVerifyDir, 'reports', nodeDir, ...cellSeg);
  const renderDir = join(opts.uiVerifyDir, 'renders', nodeDir, ...cellSeg);
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

  // T2.8 快车道:worker 已产 PNG,跳过 gradle 与收集,直接复用下方 copy+L1+报告主链(与慢车道同一路径)。
  let found: string | null;
  if (opts.preRenderedPng !== undefined) {
    found = existsSync(opts.preRenderedPng) ? opts.preRenderedPng : null;
  } else {
    // 跑前清理上一轮遗留的比对产物(<short>_actual/_compare.png)。roborazzi 在 compare 通过时不重写
    // _actual,遗留的旧 _actual(mtime 可能因 gradle 缓存恢复/快速迭代而贴近本轮 t0)会绕过下方新鲜度门被
    // 误选,对旧帧采样报假阳性(用户实证:正确卡片却报幻影 color 违规)。清理后 run 结束时凡在场的
    // _actual/_compare 必属本轮,采集口径无歧义;新鲜度门作为二道防线保留。record 链路(runRecord 写
    // snapshots/ golden,不读 _actual)在独立 gradle 调用中执行,不受此清理影响。
    const shortName = (opts.testFqn.split('.').at(-1) ?? '').replace(/ScreenshotTest$/, '');
    const roboDir = join(opts.demoDir, 'app', 'build', 'outputs', 'roborazzi');
    pruneRoborazziArtifacts(roboDir, shortName);

    const t0 = Date.now();
    // T2.1(D-07):UIV_RERUN=1 追加 --rerun,供测量脚本强制忽略 up-to-date/build cache 真实重跑
    // (默认不追加,不影响正常 check 的增量构建性能)。
    const rerunArgs = process.env.UIV_RERUN === '1' ? ['--rerun'] : [];
    const { exitCode, stderr } = await runner.run(opts.demoDir, [
      'testDebugUnitTest', '--tests', opts.testFqn, '-Proborazzi.test.compare=true', ...rerunArgs, ...(opts.extraGradleArgs ?? []),
    ]);

    if (exitCode !== 0) {
      const compileError = extractCompileError(stderr);
      if (compileError !== null) {
        return writeReport(reportsDir, { ...base, compileError });
      }
      return writeReport(reportsDir, { ...base, reason: 'inconclusive', subReason: 'render_harness_error' });
    }

    // exit 0:收集 rendered.png(测试类短名去 ScreenshotTest 后缀 = 组件短名)。
    // T2.6 三级优先+新鲜度门(章内设计):①本轮 _actual ②本轮非 _compare(旧 added 形态)③golden(unchanged 零产物);
    // 叠加跑前清理后,①②只可能命中本轮产物;mtime 早于本轮 gradle 启动(t0)的候选仍一律拒收(二道防线)。
    const goldenPath = join(opts.demoDir, 'app', 'src', 'test', 'snapshots', `${shortName}.png`);
    const fresh = (p: string | null): string | null => (p !== null && statSync(p).mtimeMs >= t0 - 1000 ? p : null);
    found = fresh(findNewestPng(roboDir, `${shortName}_actual`))
      ?? fresh(findNewestPng(roboDir, shortName, (n) => n.endsWith('_compare.png')))
      ?? (existsSync(goldenPath) ? goldenPath : null);
  }
  if (found === null) {
    return writeReport(reportsDir, { ...base, reason: 'inconclusive', subReason: 'render_harness_error' });
  }
  mkdirSync(renderDir, { recursive: true });
  const renderedPng = join(renderDir, 'rendered.png');
  atomicCopyFileSync(found, renderedPng);

  let pixel: PixelResult | null = null;
  let diffPng: string | null = null;
  if (baselineExists && opts.skipL1 !== true) {
    // 产物目录口径:diff/report 归 reports/<nodeDir>[/cells/<sub>];rendered.png/semantics.json 归 renders/。
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

  return writeReport(reportsDir, {
    ...base,
    pass: true,
    pixel,
    artifacts: { ...base.artifacts, render: renderedPng, diff: diffPng },
  });
}
