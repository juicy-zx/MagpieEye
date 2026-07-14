import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, it, expect } from 'vitest';
import { RecordRefusedError, runRecord } from './record.js';
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

describe('T2.1(D-07): UIV_RERUN=1 强制 --rerun(测量脚本专用,默认不影响增量构建)', () => {
  it('设置 UIV_RERUN=1 时 gradle 参数追加 --rerun', async () => {
    const { demoDir, uiVerifyDir } = makeDirs();
    const runner = new FakeRunner(0, '');
    const prev = process.env.UIV_RERUN;
    process.env.UIV_RERUN = '1';
    try {
      await runCheck(runner, opts(demoDir, uiVerifyDir));
    } finally {
      if (prev === undefined) delete process.env.UIV_RERUN; else process.env.UIV_RERUN = prev;
    }
    expect(runner.calls[0]).toEqual({
      cwd: demoDir,
      args: ['testDebugUnitTest', '--tests', TEST_FQN, '-Proborazzi.test.compare=true', '--rerun'],
    });
  });
});

describe('T2.6: runRecord(check 全过后录 golden)', () => {
  const rec: string[][] = [];
  const okRunner: GradleRunner = {
    async run(cwd: string, args: string[]) {
      rec.push(args);
      const s = join(cwd, 'app/src/test/snapshots');
      mkdirSync(s, { recursive: true });
      writeWhitePng(join(s, 'CalibCard.png'));
      return { exitCode: 0, stderr: '' };
    },
  };
  it('T2.6 runRecord: pass:false 拒绝不跑 gradle;pass:true 参数+golden 校验', async () => {
    const r0 = new FakeRunner(0, '');
    await expect(runRecord(r0, { demoDir: makeDirs().demoDir, testFqn: TEST_FQN }, false)).rejects.toBeInstanceOf(RecordRefusedError);
    expect(r0.calls.length).toBe(0);
    const { demoDir } = makeDirs();
    const { goldenPath } = await runRecord(okRunner, { demoDir, testFqn: TEST_FQN }, true);
    expect(rec[0]).toEqual(['testDebugUnitTest', '--tests', TEST_FQN, '-Proborazzi.test.record=true', '--rerun']);
    expect(goldenPath).toBe(join(demoDir, 'app/src/test/snapshots/CalibCard.png'));
  });
});

describe('T2.6: 收集三级优先 + 新鲜度门(防 _compare/陈旧 _actual 误收)', () => {
  const seed = (dir: string, name: string, w: number, ageMs = 0): void => {
    mkdirSync(dir, { recursive: true });
    const png = new PNG({ width: w, height: 64 });
    png.data.fill(255);
    const p = join(dir, name);
    writeFileSync(p, PNG.sync.write(png));
    if (ageMs > 0) {
      const t = new Date(Date.now() - ageMs);
      utimesSync(p, t, t);
    }
  };
  const W = (p: string): number => PNG.sync.read(readFileSync(p)).width;
  const robo = (dd: string): string => join(dd, 'app/build/outputs/roborazzi');
  // 本轮 run() 中落产物的 runner(模拟 roborazzi;跑前清理后,凡在场者皆本轮所产)。
  const writingRunner = (files: Array<{ name: string; w: number }>): GradleRunner => ({
    async run(cwd: string) {
      for (const f of files) seed(robo(cwd), f.name, f.w);
      return { exitCode: 0, stderr: '' };
    },
  });

  it('T2.6 收集: 本轮 _actual 优先于本轮 _compare', async () => {
    const { demoDir, uiVerifyDir } = makeDirs();
    const runner = writingRunner([{ name: 'CalibCard_actual.png', w: 64 }, { name: 'CalibCard_compare.png', w: 128 }]);
    const r = await runCheck(runner, opts(demoDir, uiVerifyDir));
    expect(W(r.report.artifacts.render!)).toBe(64);
  });

  it('T2.6 收集: 本轮零产物(compare 通过)回落 golden;陈旧遗留 _actual 不误选', async () => {
    const { demoDir, uiVerifyDir } = makeDirs();
    seed(robo(demoDir), 'CalibCard_actual.png', 128, 600_000);   // 陈旧遗留错帧
    seed(join(demoDir, 'app/src/test/snapshots'), 'CalibCard.png', 64);   // golden
    const r = await runCheck(new FakeRunner(0, ''), opts(demoDir, uiVerifyDir));   // 本轮不写新产物
    expect(W(r.report.artifacts.render!)).toBe(64);
  });

  // P0-2:陈旧候选(tier② 合法白 PNG,若被采用必然通过)+ 无 golden → stale_artifact;
  // 与"从未产出任何候选"(render_harness_error,见上文 outputs 无匹配 PNG 用例)显式区分。
  it('P0-2 收集: 陈旧候选 + 无 golden 回退 → stale_artifact(非 render_harness_error)', async () => {
    const { demoDir, uiVerifyDir } = makeDirs();
    seed(robo(demoDir), 'CalibCard.png', 64, 600_000);   // tier② 陈旧候选(非 _actual/_compare,跑前清理不删);无 golden
    const r = await runCheck(new FakeRunner(0, ''), opts(demoDir, uiVerifyDir));   // 本轮零新产物
    expect(r.report.pass).toBe(false);
    expect(r.report.reason).toBe('inconclusive');
    expect(r.report.subReason).toBe('stale_artifact');
    expect(r.report.artifacts.render).toBeNull();   // 陈旧候选未被复制进 renders
  });
});

describe('HOTFIX(defect2): compare 通过、遗留 _actual 绕过新鲜度门 → 必须回落 golden(用户实证)', () => {
  const robo = (dd: string): string => join(dd, 'app/build/outputs/roborazzi');
  const seed = (dir: string, name: string, w: number, ageMs = 0): void => {
    mkdirSync(dir, { recursive: true });
    const png = new PNG({ width: w, height: 64 });
    png.data.fill(255);
    const p = join(dir, name);
    writeFileSync(p, PNG.sync.write(png));
    if (ageMs > 0) { const t = new Date(Date.now() - ageMs); utimesSync(p, t, t); }
  };
  const W = (p: string): number => PNG.sync.read(readFileSync(p)).width;

  // 用户复现:上一失败轮遗留 <short>_actual(错帧,宽 128),mtime 晚于 golden、早于本轮 t0 但落在
  // `>= t0-1000` 新鲜度窗内(真实场景中 gradle 缓存恢复/快速迭代会令遗留 _actual mtime 贴近 t0)。
  // 本轮 compare 通过 → roborazzi 不写新 _actual(FakeRunner 不产文件)。修前:遗留 _actual 越门被误
  // 选,对旧帧采样报假阳性;修后:跑前清理令本轮无 _actual/_compare,回落 golden(宽 64,正确帧)。
  it('遗留错帧 _actual 不得误选,渲染源回落 golden', async () => {
    const { demoDir, uiVerifyDir } = makeDirs();
    seed(join(demoDir, 'app/src/test/snapshots'), 'CalibCard.png', 64, 600_000);
    seed(robo(demoDir), 'CalibCard_actual.png', 128, 200);
    const r = await runCheck(new FakeRunner(0, ''), opts(demoDir, uiVerifyDir));
    expect(r.report.pass).toBe(true);
    expect(W(r.report.artifacts.render!)).toBe(64);
  });
});

describe('T3.3 复用面扩展:artifactSubdir 隔离 + skipL1', () => {
  it('artifactSubdir 两格落 cells/<id>/ 互不覆写;skipL1 有基准也不跑 L1(pixel/diff null)', async () => {
    const { demoDir, uiVerifyDir } = makeDirs();
    const baseDir = join(uiVerifyDir, 'baselines', '1-100@T1_0A_V1');
    mkdirSync(baseDir, { recursive: true });
    writeWhitePng(join(baseDir, 'baseline.png'));
    seedRoborazziPng(demoDir);
    const a = await runCheck(new FakeRunner(0, ''), { ...opts(demoDir, uiVerifyDir), artifactSubdir: 'base__typical', skipL1: true });
    seedRoborazziPng(demoDir);
    const b = await runCheck(new FakeRunner(0, ''), { ...opts(demoDir, uiVerifyDir), artifactSubdir: 'pixel5-dark__typical', skipL1: true });
    expect(existsSync(join(uiVerifyDir, 'renders', '1-100@T1_0A_V1', 'cells', 'base__typical', 'rendered.png'))).toBe(true);
    expect(existsSync(join(uiVerifyDir, 'renders', '1-100@T1_0A_V1', 'cells', 'pixel5-dark__typical', 'rendered.png'))).toBe(true);
    expect(a.reportPath).toContain(join('cells', 'base__typical'));
    expect(b.reportPath).toContain(join('cells', 'pixel5-dark__typical'));
    expect(a.report.pixel).toBeNull();            // skipL1:基准在也不跑 L1
    expect(a.report.artifacts.diff).toBeNull();
    expect(a.report.artifacts.baseline).not.toBeNull();
  });
});

describe('P0-8 批次②:参数化(--module 目录 / --variant 任务派生)', () => {
  it('moduleDir 覆写 → 产物路径基于所选模块目录(非 demoDir/app),render 收集自该目录', async () => {
    const { demoDir, uiVerifyDir } = makeDirs();
    const moduleDir = join(demoDir, 'features', 'login');   // :features:login 约定映射目标
    const outDir = join(moduleDir, 'build', 'outputs', 'roborazzi');
    mkdirSync(outDir, { recursive: true });
    writeWhitePng(join(outDir, 'com.magpie.uiv.demo.CalibCardScreenshotTest.card.png'));
    const r = await runCheck(new FakeRunner(0, ''), { ...opts(demoDir, uiVerifyDir), moduleDir });
    expect(r.report.pass).toBe(true);
    expect(r.report.artifacts.render).not.toBeNull();
  });

  it('moduleName(:features:login)→ 约定映射 demoDir/features/login;默认 app 目录无产物则 render_harness_error', async () => {
    const { demoDir, uiVerifyDir } = makeDirs();
    const outDir = join(demoDir, 'features', 'login', 'build', 'outputs', 'roborazzi');
    mkdirSync(outDir, { recursive: true });
    writeWhitePng(join(outDir, 'com.magpie.uiv.demo.CalibCardScreenshotTest.card.png'));
    const hit = await runCheck(new FakeRunner(0, ''), { ...opts(demoDir, uiVerifyDir), moduleName: ':features:login' });
    expect(hit.report.pass).toBe(true);
    // 默认 :app 目录下无产物 → 找不到即失败(render_harness_error),不跨目录猜测搜索。
    const miss = await runCheck(new FakeRunner(0, ''), opts(demoDir, uiVerifyDir));
    expect(miss.report.pass).toBe(false);
    expect(miss.report.subReason).toBe('render_harness_error');
  });

  it('variant=release → 任务派生 testReleaseUnitTest', async () => {
    const { demoDir, uiVerifyDir } = makeDirs();
    const runner = new FakeRunner(1, 'infra');
    await runCheck(runner, { ...opts(demoDir, uiVerifyDir), variant: 'release' });
    expect(runner.calls[0]!.args[0]).toBe('testReleaseUnitTest');
  });
});

describe('D-07(c): L1 advisory 失败隔离(不污染已成功的渲染主链/L2 verdict)', () => {
  it('baseline.png 损坏致 L1(server+spawn 双降级)全链路抛错: pass 仍 true,pixel/diff 置 null', async () => {
    const { demoDir, uiVerifyDir } = makeDirs();
    seedRoborazziPng(demoDir);
    const baseDir = join(uiVerifyDir, 'baselines', '1-100@T1_0A_V1');
    mkdirSync(baseDir, { recursive: true });
    // 非法 PNG 字节:odiff server/spawn 与 looks-same 均无法解析,runL1 必抛错。
    writeFileSync(join(baseDir, 'baseline.png'), 'not a real png, deliberately corrupt for D-07(c)');
    const runner = new FakeRunner(0, '');
    const { report } = await runCheck(runner, opts(demoDir, uiVerifyDir));
    expect(report.pass).toBe(true);
    expect(report.pixel).toBeNull();
    expect(report.artifacts.diff).toBeNull();
    expect(report.artifacts.render).not.toBeNull();
  });
});
