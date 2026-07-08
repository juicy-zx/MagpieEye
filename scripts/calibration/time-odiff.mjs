// time-odiff.mjs <a.png> <b.png> <diff.png>
// 经 npx 调 odiff-bin 比对 3 轮取中位数;exit 0(一致)/22(像素差异)均视为正常
import { spawnSync } from 'node:child_process';
const [a, b, out] = process.argv.slice(2);
if (!a || !b || !out) { console.error('usage: time-odiff.mjs <a> <b> <diff>'); process.exit(64); }
// 预热:触发 npx 缓存 odiff-bin,不计时
const warm = spawnSync('npx', ['-y', '-p', 'odiff-bin', 'odiff', '--version'], { encoding: 'utf8' });
if (warm.error) { console.error('npx unavailable: ' + warm.error.message); process.exit(1); }
const runs = [];
for (let i = 0; i < 3; i++) {
  const t0 = performance.now();
  const r = spawnSync('npx', ['-y', '-p', 'odiff-bin', 'odiff', a, b, out], { encoding: 'utf8' });
  const ms = Math.round(performance.now() - t0);
  if (r.error) { console.error('odiff spawn failed: ' + r.error.message); process.exit(1); }
  if (r.status !== 0 && r.status !== 22) {
    console.error(`odiff unexpected exit ${r.status}: ${r.stderr}`); process.exit(1);
  }
  runs.push({ exit: r.status, ms });
}
const sorted = runs.map((r) => r.ms).sort((x, y) => x - y);
console.log(JSON.stringify({ note: 'includes npx forwarding overhead (warmed cache)', runs, median_ms: sorted[1] }));
