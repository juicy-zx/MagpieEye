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
// 半程 1 实跑 states 取自 mapping entry。核对提交快照：states=["typical"]（demo mapping 未声明 error/longText 态），
// 故 l-shape 矩阵展开为 5 格全 typical——parity 两格（base/pixel5-dark）+ render-only 三轴格（fontScale1.3/smallPhone/tablet）。
// 说明：T3.5 原设想的 error/longText 交叉格（fontScale1.3__longText/pixel5-dark__error 等）不在本 demo 矩阵内
//       （该矩阵无 error 态），故按实际矩阵收紧：锁死全展开格数 + 显式断言全部 5 格存在且全绿。
const EXPECTED_CELLS = ['base__typical', 'pixel5-dark__typical', 'fontScale1.3__typical', 'smallPhone__typical', 'tablet__typical'];
// 锁死格数：与提交快照一致（防矩阵漏格/多格），且恰为 l-shape 全展开的 5 格。
if (fresh.perCell.length !== snap.perCell.length) fail(`perCell 格数与快照不一致：fresh=${fresh.perCell.length} snapshot=${snap.perCell.length}`);
if (fresh.perCell.length !== EXPECTED_CELLS.length) fail(`perCell 格数=${fresh.perCell.length}，期望 ${EXPECTED_CELLS.length}（l-shape 全展开）`);
// 显式断言全部矩阵格在 perCell 中存在（parity 两格 + render-only 三轴“交叉”格）。
const ids = fresh.perCell.map((c) => c.cellId);
for (const need of EXPECTED_CELLS) {
  if (!ids.includes(need)) fail(`perCell 缺 ${need}（l-shape 矩阵格）`);
}
if (!fresh.perCell.every((c) => c.pass === true)) fail('存在 perCell 未通过（要求 matrix 全展开格全绿）');

// 与提交快照关键字段一致。
for (const k of ['nodeId', 'version', 'pass']) {
  if (fresh[k] !== snap[k]) fail(`${k} 与快照不一致：fresh=${fresh[k]} snapshot=${snap[k]}`);
}

console.log(`[half1] ok: 真实 verify-page pass=true，${fresh.perCell.length} 格全绿，nodeId=${fresh.nodeId}/version=${fresh.version} 与快照一致`);
