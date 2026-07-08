#!/usr/bin/env node
/**
 * T2.1 热路径 P50 机判:1 轮预热 + 10 轮实测,每轮先 toggle CARD 末尾 `// t2.1-touch`
 * (强制重编译+重跑,对齐内循环单轮改代码;M1 用 --rerun,差异记入 protocol)。
 * 落档 docs/latency-m2.json 的 t2_1_hot 键(按键分治,不覆盖他任务 key)。
 * stdout 末行 {"p50Ms":…,"pass":…};exit(pass?0:1)。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const CARD = 'demo-android/app/src/main/java/com/magpie/uiv/demo/CalibCard.kt';
const MARK = '// t2.1-touch';
const LATENCY = 'docs/latency-m2.json';
const CMD = ['packages/uiv-cli/dist/index.js', 'check',
  '--preview', 'com.magpie.uiv.demo.CalibCardPreview', '--node', '1:100', '--demo', 'demo-android'];

const ORIG = readFileSync(CARD, 'utf8');
let marked = false;
const toggle = () => {
  marked = !marked;
  writeFileSync(CARD, marked ? ORIG.replace(/\n?$/, `\n${MARK}\n`) : ORIG);
};

function oneRound() {
  toggle();                                    // 改代码 → 强制重编译+重跑
  const t0 = Date.now();
  const r = spawnSync('node', CMD, { encoding: 'utf8' });
  const ms = Date.now() - t0;
  if (r.status !== 0) { console.error(r.stderr); console.error(`round failed: status=${r.status}`); process.exit(2); }
  if (!(r.stderr ?? '').includes('lane=hot')) { console.error(r.stderr); console.error('not hot lane'); process.exit(3); }
  return ms;
}

oneRound();                                    // 预热(不计)
const samples = [];
for (let i = 0; i < 10; i++) samples.push(oneRound());

writeFileSync(CARD, ORIG);                      // 去除残留 MARK
// 复原机判:CARD 须回到已提交态(arg 数组,不走 shell)
if (spawnSync('git', ['diff', '--quiet', '--', CARD]).status !== 0) {
  console.error('CARD not restored to committed state'); process.exit(4);
}

const sorted = [...samples].sort((a, b) => a - b);
const p50Ms = Math.round((sorted[4] + sorted[5]) / 2);
const pass = p50Ms <= 3100;

const all = existsSync(LATENCY) ? JSON.parse(readFileSync(LATENCY, 'utf8')) : {};
all.t2_1_hot = {
  task: 'T2.1', lane: 'hot', protocol: 'EOF-comment-toggle (M1: --rerun)',
  warmupRounds: 1, samples, p50Ms, targetMs: 3100, m1WarmMedianS: 5.1, pass,
  measuredAt: new Date().toISOString(),
};
writeFileSync(LATENCY, `${JSON.stringify(all, null, 1)}\n`);

console.log(JSON.stringify({ p50Ms, pass }));
process.exit(pass ? 0 : 1);
