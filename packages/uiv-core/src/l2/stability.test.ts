import { describe, it, expect } from 'vitest';
import { stepState } from './stability.js';
import type { StateFile } from './types.js';

/** 折叠 stepState 跑一串轮次((blockingHits, score),默认 pass=false)。 */
function fold(seq: Array<[number, number, boolean?]>): StateFile[] {
  const out: StateFile[] = [];
  let prev: StateFile | null = null;
  for (const [bh, sc, pass] of seq) {
    prev = stepState(prev, { blockingHits: bh, score: sc, pass: pass ?? false });
    out.push(prev);
  }
  return out;
}

// 设计原则 2:分层比较,主键 blocking 违规数、次键 score;连续 2 轮停滞→regression;轮上限 5。
describe('stepState 防震荡分层比较', () => {
  it('先重构再修值不误杀: (2,0.60)→(1,0.59)→(0,0.80) 全程 regression:false,stagnation 归 0', () => {
    const s = fold([[2, 0.60], [1, 0.59], [0, 0.80]]);
    expect(s.every((x) => x.regression === false)).toBe(true);
    expect(s.at(-1)?.stagnation).toBe(0);
  });

  it('容忍边界: (2,0.60)→(1,0.58) 回退恰 0.02 → 改善(stagnation 0)', () => {
    const s = fold([[2, 0.60], [1, 0.58]]);
    expect(s[1]?.stagnation).toBe(0);
    expect(s[1]?.regression).toBe(false);
  });

  it('超容忍: (2,0.60)→(1,0.50) 回退 0.10 → 停滞 1', () => {
    const s = fold([[2, 0.60], [1, 0.50]]);
    expect(s[1]?.stagnation).toBe(1);
    expect(s[1]?.regression).toBe(false);
  });

  it('连续 2 轮停滞: (2,0.6)×3 第 3 轮 regression:true 且 reason 含前后值', () => {
    const s = fold([[2, 0.6], [2, 0.6], [2, 0.6]]);
    expect(s[1]?.regression).toBe(false);
    expect(s[2]?.regression).toBe(true);
    expect(s[2]?.regressionReason).toContain('2→2');
    expect(s[2]?.regressionReason).toContain('0.60→0.60');
    expect(s[2]?.regressionReason).toContain('连续2轮停滞');
  });

  it('reason 必填: 任一 regression:true 结果 regressionReason !== null', () => {
    const s = fold([[2, 0.6], [2, 0.6], [2, 0.6]]);
    expect(s[2]?.regressionReason).not.toBeNull();
  });

  it('轮上限: 5 轮均未 pass → regression:true, reason 含 round_limit(5)', () => {
    const s = fold([[5, 0.10], [4, 0.20], [3, 0.30], [2, 0.40], [1, 0.50]]);
    expect(s[4]?.round).toBe(5);
    expect(s[4]?.regression).toBe(true);
    expect(s[4]?.regressionReason).toContain('round_limit(5)');
  });

  it('pass 重置: pass:true 返回初始态(round 0)', () => {
    const s = fold([[2, 0.6], [2, 0.6], [0, 0.99, true]]);
    expect(s[2]).toEqual({ round: 0, stagnation: 0, regression: false, regressionReason: null, history: [] });
  });
});
