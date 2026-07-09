#!/usr/bin/env node
// T3.5 半程 1 校验：真实 verify-page 新鲜 report 的 schema/pass + 与提交快照关键字段一致（nodeId/version/pass）。
// 用法：node check-half1.mjs <fresh-report> <snapshot>
import { readFileSync } from 'fs';

const [freshPath, snapPath] = process.argv.slice(2);
const fresh = JSON.parse(readFileSync(freshPath, 'utf-8'));
const snap = JSON.parse(readFileSync(snapPath, 'utf-8'));

function fail(msg) { console.error(`[half1] FAIL: ${msg}`); process.exit(1); }

// page-report v1 最小 schema。
if (fresh.schemaVersion !== 1) fail(`schemaVersion=${fresh.schemaVersion}`);
if (fresh.kind !== 'page-report') fail(`kind=${fresh.kind}`);
if (fresh.pass !== true) fail(`pass=${fresh.pass}（真实 verify-page 未通过）`);
if (!Array.isArray(fresh.perCell) || fresh.perCell.length === 0) fail('perCell 非非空数组');
if (typeof fresh.sessionId !== 'string') fail('sessionId 非 string');
// 三显式交叉格中的 parity 两格必在（base__typical / pixel5-dark__typical）。
const ids = fresh.perCell.map((c) => c.cellId);
for (const need of ['base__typical', 'pixel5-dark__typical']) {
  if (!ids.includes(need)) fail(`perCell 缺 ${need}`);
}
if (!fresh.perCell.every((c) => c.pass === true)) fail('存在 perCell 未通过');

// 与提交快照关键字段一致。
for (const k of ['nodeId', 'version', 'pass']) {
  if (fresh[k] !== snap[k]) fail(`${k} 与快照不一致：fresh=${fresh[k]} snapshot=${snap[k]}`);
}

console.log(`[half1] ok: 真实 verify-page pass=true，${fresh.perCell.length} 格全绿，nodeId=${fresh.nodeId}/version=${fresh.version} 与快照一致`);
