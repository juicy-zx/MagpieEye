/**
 * T4.2:L3 证据锚定回填(设计文档 3.2B "无证据判定丢弃" + §2.1 裁定)。
 * - fail/uncertain:evidence 空 ∨ 任一 evidence 与其 cellId 对应簇集 AABB 不相交 → 整项 drop(模型幻觉);
 * - pass:携 evidence 时逐项锚定检查,未锚定项剔除(净化)但 verdict 保留(不计 drop);
 * - 存活项逐个过 Step 1 checkL3Verdict(形状非法=调用方 bug,直接 throw,与 drop 区分);
 * 写回后全报告 validatePageReport;pass 恒不动。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { checkL3Verdict, validatePageReport } from '../report.js';
import type { L3Verdict } from './types.js';
import type { L3InputPack } from './inputPack.js';

interface Rect { x: number; y: number; w: number; h: number }

/** 标准 AABB 相交(evidence 矩形 vs 簇矩形)。 */
function intersects(e: Rect, c: Rect): boolean {
  return e.x < c.x + c.w && e.x + e.w > c.x && e.y < c.y + c.h && e.y + e.h > c.y;
}

/** evidence 锚定 = cellId 命中输入包簇集 ∧ 与该集任一簇相交。形状/坐标不合法一律判未锚定。 */
function isAnchored(ev: unknown, clustersByCell: Map<string, Rect[]>): boolean {
  if (ev === null || typeof ev !== 'object') return false;
  const e = ev as Record<string, unknown>;
  const clusters = clustersByCell.get(e['cellId'] as string);
  if (clusters === undefined) return false;
  const { x, y, w, h } = e;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof w !== 'number' || typeof h !== 'number') return false;
  return clusters.some((c) => intersects({ x, y, w, h }, c));
}

export function attachL3Verdicts(pageReportPath: string, verdicts: unknown, packPath: string):
  { attached: number; dropped: number } {
  if (!Array.isArray(verdicts)) throw new Error('l3 verdicts must be an array');
  const pack = JSON.parse(readFileSync(packPath, 'utf8')) as L3InputPack;
  const clustersByCell = new Map<string, Rect[]>();
  for (const cell of pack.cells) clustersByCell.set(cell.cellId, cell.clusters);

  const kept: L3Verdict[] = [];
  let dropped = 0;
  for (const raw of verdicts) {
    const v = raw !== null && typeof raw === 'object' ? raw as Record<string, unknown> : null;
    const verdict = v === null ? undefined : v['verdict'];
    const evRaw = v === null ? undefined : v['evidence'];
    const evidence = Array.isArray(evRaw) ? evRaw as unknown[] : [];

    if (verdict === 'pass') {
      // 净化:剔除未锚定 evidence,verdict 保留(§2.1 pass 分支)。
      const item = { ...v, evidence: evidence.filter((e) => isAnchored(e, clustersByCell)) };
      checkL3Verdict(item, `l3Verdicts[${kept.length}]`);
      kept.push(item as unknown as L3Verdict);
    } else if (verdict === 'fail' || verdict === 'uncertain') {
      const anchored = evidence.length > 0 && evidence.every((e) => isAnchored(e, clustersByCell));
      if (!anchored) { dropped += 1; continue; }
      checkL3Verdict(raw, `l3Verdicts[${kept.length}]`);   // 锚定住但形状非法 → throw(调用方 bug)
      kept.push(raw as L3Verdict);
    } else {
      // 未知 verdict 值 / 形状非法 → 交 checkL3Verdict throw(调用方 bug,不静默 drop)。
      checkL3Verdict(raw, `l3Verdicts[${kept.length}]`);
      kept.push(raw as L3Verdict);
    }
  }

  const report = JSON.parse(readFileSync(pageReportPath, 'utf8')) as Record<string, unknown>;
  report['l3Verdicts'] = kept;
  validatePageReport(report);   // 全报告重校验(含 kept 逐项);pass 未改
  writeFileSync(pageReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { attached: kept.length, dropped };
}
