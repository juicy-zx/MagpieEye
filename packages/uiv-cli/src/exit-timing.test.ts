/**
 * HOTFIX(defect1) 回归护栏:冷道 check 完工后进程必须在阈值内自行退出。
 *
 * 背景:T2.6/T2.9 交付过退出治理(SpawnGradleRunner stdio 显式销毁 + flushAndExit),但从未固化为
 * 自动化机判——gradle-runner.test.ts 只测热道 UdsGradleRunner/选路/快车道,SpawnGradleRunner.run()
 * 对真实 `./gradlew` 的退出行为零覆盖。用户实证冷道 check 完工后进程挂 22+ 分钟不退(长命 kotlin/gradle
 * daemon 继承并悬置 stdio 写端 + odiff server 句柄堵住事件循环)。此测直接 spawn 构建产物 dist CLI 跑
 * 冷道 check,mock gradlew 留一枚长命孙进程持有 stderr 管道 + 真实 odiff server 起停,断言进程在阈值内退出。
 */
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

const DIST_CLI = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const PREVIEW = 'com.magpie.uiv.demo.CalibCardPreview';   // → CalibCardScreenshotTest → short 'CalibCard'
const NODE_ID = '1:100';
const VERSION = 'V1';
const EXIT_BUDGET_MS = 12_000;   // 健康退出 <2s;宽限至 12s 容 CI 抖动,远低于"悬挂"
const HARD_TIMEOUT_MS = 20_000;  // 超此即判定悬挂(测试失败)

function writePng(path: string, width: number): void {
  const png = new PNG({ width, height: 32 });
  png.data.fill(255);
  writeFileSync(path, PNG.sync.write(png));
}

/** 组装冷道 fixture:.ui-verify(mapping+baseline)+ demo(mock gradlew,run 中落渲染帧并留长命孙进程)。 */
function makeFixture(): { workdir: string; template: string } {
  const workdir = mkdtempSync(join(tmpdir(), 'uiv-exit-'));
  const nodeDir = `${NODE_ID.replace(':', '-')}@${VERSION}`;
  const baseDir = join(workdir, '.ui-verify', 'baselines', nodeDir);
  mkdirSync(baseDir, { recursive: true });
  writePng(join(baseDir, 'baseline.png'), 32);   // 有基线 → runCheck 走 odiff(起 3 管道 server)
  writeFileSync(join(workdir, '.ui-verify', 'mapping.json'), JSON.stringify(
    [{ fileKey: 'FKEY', nodeId: NODE_ID, version: VERSION, minScore: 0.9, matrix: 'default5' }], null, 2,
  ));
  const demo = join(workdir, 'demo');
  mkdirSync(demo, { recursive: true });
  mkdirSync(join(demo, 'app'), { recursive: true });   // 修正②:默认 :app 模块目录须在 CLI(gradle)调用前存在;mock gradlew 仍照常写 app/build/... 产物
  // 渲染帧模板放 roboDir 之外,避免被 pruneRoborazziArtifacts(跑前清理)删除;gradlew 在 run 中 cp 进去。
  const template = join(workdir, 'render-template.png');
  writePng(template, 32);
  const gradlew = join(demo, 'gradlew');
  writeFileSync(gradlew, [
    '#!/bin/sh',
    'echo "> Task :app:testDebugUnitTest" 1>&2',
    'echo "BUILD SUCCESSFUL in 2s" 1>&2',
    'mkdir -p app/build/outputs/roborazzi',
    `cp '${template}' app/build/outputs/roborazzi/CalibCard_actual.png`,
    '# 长命孙进程继承 gradlew fd2(= node 为捕获 stderr 建的 socketpair 写端),模拟 kotlin/gradle daemon 悬置管道',
    'sleep 20 &',
    'exit 0',
    '',
  ].join('\n'));
  chmodSync(gradlew, 0o755);
  return { workdir, template };
}

describe('HOTFIX(defect1): check 完工后进程在阈值内自行退出(P0-8 默认 direct lane,spawn 真实 dist CLI)', () => {
  it.skipIf(!existsSync(DIST_CLI))(
    '无 --sandbox(lane=direct,DirectGradleRunner)+ 长命孙进程持 stderr + odiff server → 进程 <12s 退出,不悬挂',
    async () => {
      const { workdir } = makeFixture();
      const child = spawn(
        process.execPath,
        [DIST_CLI, 'check', '--preview', PREVIEW, '--node', NODE_ID, '--demo', 'demo'],
        { cwd: workdir, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
      );
      let out = '';
      child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
      child.stderr.on('data', () => { /* drain：读端保持活跃,复现真实管道背压场景 */ });

      const start = Date.now();
      const killGroup = (): void => { try { if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL'); } catch { /* 已退 */ } };
      try {
        const code = await new Promise<number | null>((resolve, reject) => {
          const to = setTimeout(() => { killGroup(); reject(new Error(`CLI 未在 ${HARD_TIMEOUT_MS}ms 内退出(悬挂)`)); }, HARD_TIMEOUT_MS);
          child.on('exit', (c) => { clearTimeout(to); resolve(c); });
          child.on('error', (e) => { clearTimeout(to); reject(e); });
        });
        const elapsed = Date.now() - start;
        expect(code).not.toBeNull();          // 正常退出(非被杀)
        expect(elapsed).toBeLessThan(EXIT_BUDGET_MS);
        expect(out).toContain('report.json'); // 末行 report 路径契约仍在
      } finally {
        killGroup();   // 收养的 sleep 孙进程随组一并清理,不留孤儿
      }
    },
    HARD_TIMEOUT_MS + 10_000,
  );
});
