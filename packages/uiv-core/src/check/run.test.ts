import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, it, expect } from 'vitest';
import { runCheck } from './run.js';
import type { GradleRunner } from './run.js';

const TEST_FQN = 'com.magpie.uiv.demo.CalibCardScreenshotTest';

class FakeRunner implements GradleRunner {
  calls: Array<{ cwd: string; args: string[] }> = [];
  constructor(private exitCode: number, private stderr: string) {}
  async run(cwd: string, args: string[]): Promise<{ exitCode: number; stderr: string }> {
    this.calls.push({ cwd, args });
    return { exitCode: this.exitCode, stderr: this.stderr };
  }
}

function makeDirs(): { demoDir: string; uiVerifyDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'uiv-check-'));
  const demoDir = join(root, 'demo-android');
  const uiVerifyDir = join(root, '.ui-verify');
  mkdirSync(demoDir, { recursive: true });
  mkdirSync(uiVerifyDir, { recursive: true });
  return { demoDir, uiVerifyDir };
}

function writeWhitePng(path: string): void {
  const png = new PNG({ width: 64, height: 64 });
  png.data.fill(255);
  writeFileSync(path, PNG.sync.write(png));
}

/** 在 roborazzi outputs 目录种一张文件名含组件短名(CalibCard)的 PNG。 */
function seedRoborazziPng(demoDir: string): string {
  const outDir = join(demoDir, 'app', 'build', 'outputs', 'roborazzi');
  mkdirSync(outDir, { recursive: true });
  const p = join(outDir, 'com.magpie.uiv.demo.CalibCardScreenshotTest.card.png');
  writeWhitePng(p);
  return p;
}

function opts(demoDir: string, uiVerifyDir: string) {
  return { demoDir, testFqn: TEST_FQN, nodeId: '1:100', version: 'T1_0A_V1', uiVerifyDir };
}

describe('runCheck (injectable gradle runner)', () => {
  it('编译失败: compileError 含匹配行,pass=false,subReason=null', async () => {
    const { demoDir, uiVerifyDir } = makeDirs();
    const runner = new FakeRunner(1, 'w: warning\ne: CalibCard.kt:5: unresolved reference\nFAILURE: Build failed');
    const { report } = await runCheck(runner, opts(demoDir, uiVerifyDir));
    expect(report.pass).toBe(false);
    expect(report.compileError).toContain('e: CalibCard.kt:5: unresolved');
    expect(report.subReason).toBeNull();
    // 固定 gradle 参数契约
    expect(runner.calls[0]).toEqual({
      cwd: demoDir,
      args: ['testDebugUnitTest', '--tests', TEST_FQN, '-Proborazzi.test.compare=true'],
    });
  });
  it('挽具失败(无编译特征): reason=inconclusive + subReason=render_harness_error', async () => {
    const { demoDir, uiVerifyDir } = makeDirs();
    const runner = new FakeRunner(1, 'Some infra explosion without kotlin markers');
    const { report } = await runCheck(runner, opts(demoDir, uiVerifyDir));
    expect(report.pass).toBe(false);
    expect(report.reason).toBe('inconclusive');
    expect(report.subReason).toBe('render_harness_error');
  });
  it('成功无基准: pass=true,pixel=null,rendered.png 已复制', async () => {
    const { demoDir, uiVerifyDir } = makeDirs();
    seedRoborazziPng(demoDir);
    const runner = new FakeRunner(0, '');
    const { report, reportPath } = await runCheck(runner, opts(demoDir, uiVerifyDir));
    expect(report.pass).toBe(true);
    expect(report.pixel).toBeNull();
    expect(existsSync(join(uiVerifyDir, 'renders', '1-100@T1_0A_V1', 'rendered.png'))).toBe(true);
    expect(existsSync(reportPath)).toBe(true);
  });
  it('成功有基准: pixel 非空且报告过校验器', async () => {
    const { demoDir, uiVerifyDir } = makeDirs();
    seedRoborazziPng(demoDir);
    const baseDir = join(uiVerifyDir, 'baselines', '1-100@T1_0A_V1');
    mkdirSync(baseDir, { recursive: true });
    writeWhitePng(join(baseDir, 'baseline.png'));
    const runner = new FakeRunner(0, '');
    const { report } = await runCheck(runner, opts(demoDir, uiVerifyDir));  // runCheck 内部已过 validateReportV0
    expect(report.pass).toBe(true);
    expect(report.pixel).not.toBeNull();
    expect(report.pixel?.diffCount).toBe(0);
    expect(report.artifacts.baseline).toBe(join(baseDir, 'baseline.png'));
  });
  it('成功但 outputs 无匹配 PNG: 同判 render_harness_error', async () => {
    const { demoDir, uiVerifyDir } = makeDirs();
    const runner = new FakeRunner(0, '');
    const { report } = await runCheck(runner, opts(demoDir, uiVerifyDir));
    expect(report.pass).toBe(false);
    expect(report.reason).toBe('inconclusive');
    expect(report.subReason).toBe('render_harness_error');
  });
});
