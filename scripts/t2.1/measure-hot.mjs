#!/usr/bin/env node
/**
 * T2.1 D-07 慢车道热路径 P50 机判(唯一口径):1 轮预热 + 10 轮实测,每轮走真实 --rerun 全量重跑。
 * Codex D-07 裁定废除旧 EOF-comment-toggle 协议——两态来回切换,第二次出现的状态命中 Gradle 本地
 * build cache 直接读缓存产物(非真实渲染),产生假热样本;新口径改为每轮 gradle 命令追加 --rerun,
 * 强制忽略 up-to-date 检查与 build cache,真实重编译+重渲染。
 * 经 uiv check CLI 走真实热路径(daemon UDS gradle.run):UIV_RERUN=1 令 run.ts 追加 --rerun,
 * UIV_FASTLANE=0 强制跳过 T2.8 快车道(daemon 若已托管 worker 会抢跑短路 gradle,污染 P50 采样)。
 * 判定阈值 p50Ms<=6000(D-07 修正;3.1s 目标已废止,建立在"daemon 能摊薄渲染/JVM 成本"的证伪假设上)。
 * 落档 docs/latency-m2.json 的 t2_1_hot 键(按键分治,不覆盖 t2_2_odiff/t2_8_fast)。
 * stdout 末行 {"p50Ms":…,"pass":…};exit(pass?0:1)。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const LATENCY = 'docs/latency-m2.json';
const CMD = ['packages/uiv-cli/dist/index.js', 'check',
  '--preview', 'com.magpie.uiv.demo.CalibCardPreview', '--node', '1:100', '--demo', 'demo-android'];
// D-07 唯一口径:每轮真实重跑,禁 fast lane 干扰,防止 P50 采样被污染。
const ENV = { ...process.env, UIV_RERUN: '1', UIV_FASTLANE: '0' };
// 既有冷路径实测基线(orchestration.md D-07:冷 10442ms),本次仅重测热路径,不重跑冷路径。
const COLD_P50_MS = 10442;
const TARGET_MS = 6000;

function oneRound() {
  const t0 = Date.now();
  const r = spawnSync('node', CMD, { encoding: 'utf8', env: ENV });
  const ms = Date.now() - t0;
  if (r.status !== 0) { console.error(r.stderr); console.error(`round failed: status=${r.status}`); process.exit(2); }
  if (!(r.stderr ?? '').includes('lane=hot')) { console.error(r.stderr); console.error('not hot lane'); process.exit(3); }
  return ms;
}

oneRound();                                    // 预热(不计)
const samples = [];
for (let i = 0; i < 10; i++) samples.push(oneRound());

const sorted = [...samples].sort((a, b) => a - b);
const p50Ms = Math.round((sorted[4] + sorted[5]) / 2);
const pass = p50Ms <= TARGET_MS;
const savedMs = COLD_P50_MS - p50Ms;
const speedupRatio = Math.round((COLD_P50_MS / p50Ms) * 100) / 100;

const all = existsSync(LATENCY) ? JSON.parse(readFileSync(LATENCY, 'utf8')) : {};
all.t2_1_hot = {
  protocol: '--rerun',
  samples,
  p50_ms: p50Ms,
  cold_p50_ms: COLD_P50_MS,
  saved_ms: savedMs,
  speedup_ratio: speedupRatio,
  target_ms: TARGET_MS,
  pass,
  measured_at: new Date().toISOString(),
};
writeFileSync(LATENCY, `${JSON.stringify(all, null, 1)}\n`);

console.log(JSON.stringify({ p50Ms, pass }));
process.exit(pass ? 0 : 1);
