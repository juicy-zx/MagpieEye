import { describe, it, expect } from 'vitest';
import { textSimilarity } from './similarity.js';
import { lcsAlign, similarity } from './lcs.js';
import type { GeomLeaf } from './lcs.js';

const g = (kind: 'TEXT' | 'OTHER', x: number, y: number, w: number, h: number): GeomLeaf => ({ kind, x, y, w, h });

describe('降级算子(text 相似度 + GUIPilot 式 LCS)', () => {
  it('降级 1:归一化编辑距离相似度边界', () => {
    expect(textSimilarity('Calibration  Card', ' Calibration Card ')).toBe(1);   // 归一化后全等
    expect(textSimilarity('  ', '')).toBe(1);                                     // 双空 vs 空 → 归一化后全等
    expect(textSimilarity('a'.repeat(19) + 'b', 'a'.repeat(20))).toBeCloseTo(0.95, 5);
    expect(textSimilarity('Hello', 'Goodbye!')).toBeLessThan(0.95);
  });

  it('降级 2:similarity 合成式(位置/IoU/宽高比 + 类型折扣)', () => {
    expect(similarity(g('OTHER', 12, 60, 80, 40), g('OTHER', 12, 60, 80, 40))).toBe(1);      // 全等
    expect(similarity(g('TEXT', 12, 60, 80, 40), g('OTHER', 12, 60, 80, 40))).toBe(0.5);     // 几何同、类型折 0.5
    expect(similarity(g('OTHER', 10, 10, 100, 20), g('OTHER', 12, 12, 100, 20))).toBeGreaterThanOrEqual(0.6);
  });

  it('降级 2:交换位不错配(候选 sim<0.6 全弃)+ 缺位对齐', () => {
    // TEXT/OTHER 上下互换:四路 sim≈0.092/0.417/0.464/0.092 均<0.6 → 空对齐(盲区由 tag/text 层承担)
    expect(lcsAlign(
      [g('TEXT', 10, 10, 200, 20), g('OTHER', 10, 40, 80, 40)],
      [g('OTHER', 10, 10, 80, 40), g('TEXT', 10, 40, 200, 20)],
    )).toEqual([]);
    // 中间叶子缺位:首尾精确对齐,跳过缺失项
    const f = [g('TEXT', 0, 0, 100, 20), g('OTHER', 0, 30, 50, 50), g('TEXT', 0, 90, 100, 20)];
    expect(lcsAlign(f, [f[0]!, f[2]!])).toEqual([[0, 0], [2, 1]]);
  });
});
