import { PNG } from 'pngjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { compare, ODiffServer } from 'odiff-bin';
const d = '.calib-tmp/t22'; mkdirSync(d, { recursive: true });
const g = new PNG({ width: 720, height: 1600 }); g.data.fill(255);
writeFileSync(`${d}/a.png`, PNG.sync.write(g));
for (let y = 50; y < 150; y++) {
  g.data.fill(0, (y * 720 + 50) * 4, (y * 720 + 150) * 4);
  // fill(0,..) 连 alpha 一并清零→像素全透明,odiff 与底图合成后视为无差异(实测 match:true);
  // 显式复位 alpha=255 保持不透明,确保基准测的是真实 pixel-diff 路径而非"无差异"退化场景。
  for (let x = 50; x < 150; x++) g.data[(y * 720 + x) * 4 + 3] = 255;
}
writeFileSync(`${d}/b.png`, PNG.sync.write(g));
const o = { threshold: 0.063, antialiasing: true }, med = a => [...a].sort((x, y) => x - y)[2];
const bench = async fn => { const ms = []; let r;
  for (let i = 0; i < 5; i++) { const t = performance.now(); r = await fn(i); ms.push(Math.round(performance.now() - t)); }
  return { ms, r }; };
const P = await bench(i => compare(`${d}/a.png`, `${d}/b.png`, `${d}/s${i}.png`, o));
const srv = new ODiffServer();
await srv.compare(`${d}/a.png`, `${d}/b.png`, `${d}/w.png`, o);
const S = await bench(i => srv.compare(`${d}/a.png`, `${d}/b.png`, `${d}/v${i}.png`, o));
srv.stop();
// ODiffServer.compare() 透传 server 协议原始响应,多带一个 requestId 字段(spawn 路径没有);
// 该字段不属于公开 ODiffResult 契约,比较前剔除,否则永远 MISMATCH(与图像内容无关)。
const strip = (r) => { const { requestId, ...rest } = r; return rest; };
if (JSON.stringify(strip(P.r)) !== JSON.stringify(strip(S.r))) { console.error('MISMATCH'); process.exit(1); }
const f = 'docs/latency-m2.json', all = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
all.t2_2_odiff = { image: '720x1600', spawn_ms: P.ms, server_ms: S.ms, median_spawn_ms: med(P.ms),
  median_server_ms: med(S.ms), resultsIdentical: true, measured_at: new Date().toISOString().slice(0, 10) };
writeFileSync(f, JSON.stringify(all, null, 1) + '\n');
console.log('BENCH-OK', med(P.ms), med(S.ms));
