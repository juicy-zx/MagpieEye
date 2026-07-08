#!/usr/bin/env node
/**
 * T2.3 S4:快车道常驻 worker 延迟采样 driver。
 * 启动 = 复用 DumpEnvTest 抓取的测试 JVM 地面真值(jvm args + classpath),cwd=coexist-probe。
 * 计时口径(判据 G1)= driver 写入 stdin 渲染指令 → 收到 worker "rendered" 响应行
 * (worker 在 PNG ImageIO.write 落盘完成后才发响应)。
 * 预热 3 轮 → 连续 20 轮采样(G1 统计域)→ 续至 30 轮记内存曲线。
 * 安全前置:worker 纯 stdin/stdout,零 socket。
 */
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const probe = join(here, 'coexist-probe');
const envDir = join(probe, 'build', 'worker-env');
const evidence = join(here, 'evidence');
const outDir = join(evidence, 'render-out');
mkdirSync(outDir, { recursive: true });

const jvmArgs = readFileSync(join(envDir, 'jvm-args.txt'), 'utf8').split('\n').filter(Boolean)
  .filter((a) => a !== '-Duser.variant'); // 空值参数直启时非法
const classpath = readFileSync(join(envDir, 'classpath.txt'), 'utf8').trim();

const WARMUP = 3, MEASURED = 20, TOTAL = 30, ROUND_TIMEOUT_MS = 60_000;
const FQN = 'com.magpie.uiv.demo.CalibCardPreview';

const worker = spawn('java', [...jvmArgs, '-cp', classpath, 'com.magpie.uiv.demo.RenderWorkerKt'], {
  cwd: probe, stdio: ['pipe', 'pipe', 'pipe'],
});
let stdoutBuf = '', stderrBuf = '';
const pendingOut = [];
let resolveLine = null;
worker.stdout.on('data', (d) => {
  stdoutBuf += d;
  let idx;
  while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
    const line = stdoutBuf.slice(0, idx); stdoutBuf = stdoutBuf.slice(idx + 1);
    if (resolveLine) { const r = resolveLine; resolveLine = null; r(line); } else pendingOut.push(line);
  }
});
worker.stderr.on('data', (d) => { stderrBuf += d; process.stderr.write(d); });
const workerExit = new Promise((r) => worker.on('exit', (code, sig) => r({ code, sig })));

function nextLine() {
  return new Promise((resolve, reject) => {
    if (pendingOut.length) return resolve(pendingOut.shift());
    const t = setTimeout(() => { resolveLine = null; reject(new Error(`round timeout ${ROUND_TIMEOUT_MS}ms`)); }, ROUND_TIMEOUT_MS);
    resolveLine = (l) => { clearTimeout(t); resolve(l); };
  });
}
const rssKb = () => { try { return parseInt(execFileSync('ps', ['-o', 'rss=', '-p', String(worker.pid)]).toString().trim(), 10); } catch { return null; } };
const md5 = (p) => createHash('md5').update(readFileSync(p)).digest('hex');

const t0Boot = Date.now();
// 等 ready(stderr JSON 行)
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('worker ready timeout 120s')), 120_000);
  const iv = setInterval(() => {
    if (stderrBuf.includes('"event":"ready"')) { clearTimeout(t); clearInterval(iv); resolve(); }
  }, 50);
  worker.on('exit', () => { clearTimeout(t); clearInterval(iv); reject(new Error('worker died before ready:\n' + stderrBuf)); });
});
const bootWallMs = Date.now() - t0Boot;
const setupMs = JSON.parse(stderrBuf.split('\n').find((l) => l.includes('"event":"ready"'))).setupMs;

const rounds = [];
let failed = null;
for (let i = 1; i <= TOTAL; i++) {
  const phase = i <= WARMUP ? 'warmup' : i <= WARMUP + MEASURED ? 'measured' : 'extra';
  const out = join(outDir, `round-${String(i).padStart(2, '0')}-${phase}.png`);
  const t0 = Date.now();
  worker.stdin.write(`render ${FQN} ${out}\n`);
  let line;
  try { line = await nextLine(); } catch (e) { failed = { round: i, error: e.message }; break; }
  const wallMs = Date.now() - t0;
  let resp;
  try { resp = JSON.parse(line); } catch { resp = { event: 'error', message: 'unparseable: ' + line }; }
  if (resp.event !== 'rendered') { failed = { round: i, error: resp.message }; break; }
  rounds.push({ round: i, phase, wallMs, workerMs: resp.ms, heapUsedMb: resp.heapUsedMb, rssKb: rssKb(), md5: md5(out) });
  console.log(`round ${i} (${phase}): wall=${wallMs}ms worker=${resp.ms}ms heap=${resp.heapUsedMb}MB rss=${Math.round(rounds.at(-1).rssKb / 1024)}MB`);
}
worker.stdin.write('quit\n');
worker.stdin.end();
const exit = await Promise.race([workerExit, new Promise((r) => setTimeout(() => { worker.kill('SIGKILL'); r({ code: null, sig: 'SIGKILL(timeout)' }); }, 15_000))]);

const measured = rounds.filter((r) => r.phase === 'measured').map((r) => r.wallMs);
const sorted = [...measured].sort((a, b) => a - b);
const p50 = sorted.length === MEASURED ? Math.round((sorted[9] + sorted[10]) / 2) : null; // N=20:第10/11位均值
const p90 = sorted.length === MEASURED ? sorted[Math.ceil(0.9 * MEASURED) - 1] : null;     // nearest-rank:第18位
const hashes = [...new Set(rounds.map((r) => r.md5))];

const result = {
  task: 'T2.3',
  candidate: 'paparazzi-2.0.0-alpha05 PaparazziSdk persistent worker (JUnit-free)',
  probe: 'coexist-probe (AGP 9.0.1 + built-in Kotlin 2.2.10 + compose-bom 2026.06.00)',
  protocol: 'stdin "render <fqn> <out>" -> stdout JSON line after PNG written; timing = stdin write -> response received',
  deviceConfig: '720x400px, density XHIGH(2.0), LANDSCAPE, theme android:Theme.Material.Light.NoActionBar, RenderingMode.NORMAL',
  fqn: FQN,
  warmupRounds: WARMUP, measuredRounds: MEASURED, totalRounds: TOTAL,
  bootWallMs, setupMs,
  p50Ms: p50, p90Ms: p90,
  g1: { p50TargetMs: 6000, p90TargetMs: 10000, pass: p50 !== null && p50 <= 6000 && p90 <= 10000 },
  distinctPngMd5: hashes,
  failed,
  workerExit: exit,
  rounds,
  measuredAt: new Date().toISOString(),
};
writeFileSync(join(evidence, 'latency-fastlane.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ p50Ms: p50, p90Ms: p90, g1pass: result.g1.pass, bootWallMs, setupMs, failed }, null, 2));
process.exit(failed ? 2 : result.g1.pass ? 0 : 1);
