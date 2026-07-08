#!/usr/bin/env node
// T1.1:延迟实测 → meta.json.latency_baseline(内循环预算以此为准,设计文档"先实测、再定预算")
// 结构按任务验收口径:{ warm_s: [...], cold_s: [...], median_warm_s: n }(秒,保留 1 位小数)
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/zhuxi/AI/magpie_eye';
const META = `${ROOT}/.claude/plans/magpie-eye-full-impl/meta.json`;
const data = JSON.parse(readFileSync(`${ROOT}/docs/latency-t1.1.json`, 'utf8'));

const toS = (ms) => Math.round(ms / 100) / 10;
const warmS = data.warm_ms.map(toS);
const coldS = data.cold_ms.map(toS);
const sorted = [...warmS].sort((a, b) => a - b);

const meta = JSON.parse(readFileSync(META, 'utf8'));
meta.latency_baseline = {
  task: 'T1.1',
  scenario: 'testDebugUnitTest --tests CalibCardScreenshotTest --rerun (record); cold=cold daemon(--no-daemon), not cold cache',
  warm_s: warmS,
  cold_s: coldS,
  median_warm_s: sorted[Math.floor(sorted.length / 2)],
  measured_at: new Date().toISOString().slice(0, 10),
};
writeFileSync(META, JSON.stringify(meta, null, 2) + '\n');
console.log(JSON.stringify(meta.latency_baseline));
