#!/usr/bin/env node
/**
 * T2.1 等价判据:比较两份 report.json 是否逐字段等价(排除时间戳类字段)。
 * EQUIVALENT → stdout "EQUIVALENT"、exit 0;否则 "DIVERGENT@<首个分歧下标>" + 两侧上下文、exit 1。
 * v1 report 实测无时间戳字段 → EXCLUDE 空表;未来时间戳类字段在此登记 dot-path。
 */
import { readFileSync } from 'node:fs';

const EXCLUDE = []; // 例:'meta.generatedAt' —— v1 无,留空

const [aPath, bPath] = process.argv.slice(2);
if (!aPath || !bPath) {
  console.error('usage: diff-reports.mjs <a.json> <b.json>');
  process.exit(2);
}

function deletePath(obj, dotPath) {
  const parts = dotPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur == null || typeof cur !== 'object') return;
    cur = cur[parts[i]];
  }
  if (cur != null && typeof cur === 'object') delete cur[parts.at(-1)];
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}

const a = JSON.parse(readFileSync(aPath, 'utf8'));
const b = JSON.parse(readFileSync(bPath, 'utf8'));
for (const p of EXCLUDE) { deletePath(a, p); deletePath(b, p); }

const sa = JSON.stringify(sortKeys(a));
const sb = JSON.stringify(sortKeys(b));
if (sa === sb) { console.log('EQUIVALENT'); process.exit(0); }

let i = 0;
while (i < sa.length && i < sb.length && sa[i] === sb[i]) i++;
const ctx = 60;
console.log(`DIVERGENT@${i}`);
console.log(`A: …${sa.slice(Math.max(0, i - ctx), i + ctx)}`);
console.log(`B: …${sb.slice(Math.max(0, i - ctx), i + ctx)}`);
process.exit(1);
