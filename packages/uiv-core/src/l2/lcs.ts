/** T2.5 降级 2:GUIPilot 式 LCS(第 4 节写死)。盲区:几何同构双胞胎互换不可检出,由 tag/text 层承担。 */
import { LCS_ALPHA, LCS_SIM_MIN, LCS_TYPE_DISCOUNT } from './constants.js';
import type { FigmaNode, SemDp } from './types.js';

export interface GeomLeaf { kind: 'TEXT' | 'OTHER'; x: number; y: number; w: number; h: number }

/** Figma 叶子几何投影(N 内 absoluteBoundingBox 非 null)。 */
export function figGeom(n: FigmaNode): GeomLeaf {
  const b = n.absoluteBoundingBox!;
  return { kind: n.type === 'TEXT' ? 'TEXT' : 'OTHER', x: b.x, y: b.y, w: b.width, h: b.height };
}

/** 语义叶子几何投影(dp)。 */
export function semGeom(s: SemDp): GeomLeaf {
  return { kind: s.text !== null ? 'TEXT' : 'OTHER', x: s.positionDp.x, y: s.positionDp.y, w: s.sizeDp.width, h: s.sizeDp.height };
}

/** sim=(simPos+IoU+simAR)/3,类型不同 ×δ;simPos=1/(1+L1/α),L1=|Δx|+|Δy|+|Δw|+|Δh|(dp)。 */
export function similarity(a: GeomLeaf, b: GeomLeaf): number {
  const l1 = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.w - b.w) + Math.abs(a.h - b.h);
  const simPos = 1 / (1 + l1 / LCS_ALPHA);
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.w * a.h + b.w * b.h - inter;
  const iou = union <= 0 ? 0 : inter / union;
  const ra = a.h > 0 ? a.w / a.h : 0; const rb = b.h > 0 ? b.w / b.h : 0;
  const simAr = ra > 0 && rb > 0 ? Math.min(ra, rb) / Math.max(ra, rb) : 0;
  const s = (simPos + iou + simAr) / 3;
  return a.kind === b.kind ? s : s * LCS_TYPE_DISCOUNT;
}

/** 加权 LCS:dp[i][j]=max(跳过, sim≥LCS_SIM_MIN ? diag+sim : 弃);回溯输出升序 [figIdx,semIdx]。 */
export function lcsAlign(fig: GeomLeaf[], sem: GeomLeaf[]): Array<[number, number]> {
  const m = fig.length, n = sem.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const s = similarity(fig[i - 1]!, sem[j - 1]!);
    dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!, s >= LCS_SIM_MIN ? dp[i - 1]![j - 1]! + s : -1);
  }
  const out: Array<[number, number]> = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    const s = similarity(fig[i - 1]!, sem[j - 1]!);
    if (s >= LCS_SIM_MIN && dp[i]![j]! === dp[i - 1]![j - 1]! + s) { out.push([i - 1, j - 1]); i--; j--; }
    else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) i--;
    else j--;
  }
  return out.reverse();
}
