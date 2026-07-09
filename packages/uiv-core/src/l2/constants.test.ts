import { describe, it, expect } from 'vitest';
import {
  DENSITY, TOL_POS_DP, TOL_FONT_SP, TOL_DELTA_E, EXACT_GRID_DP,
  SEVERITY_WEIGHT, DEFAULT_BLOCKING_SEVERITIES, DEFAULT_MIN_SCORE,
  UNTAGGED_COVERAGE_THRESHOLD, MATCH_RATE_FUSE, STAGNATION_TRIGGER,
  ROUND_LIMIT, SCORE_BACKSLIDE_TOLERANCE,
  TEXT_SIM_MIN, LCS_ALPHA, LCS_TYPE_DISCOUNT, LCS_SIM_MIN,
  TOUCH_TARGET_MIN_DP, CLIP_TOL_DP, OVERLAP_MIN_DP,
} from './constants.js';

// 常量快照测试:防后续步骤悄改口径(设计文档 2.4 节 + 设计原则 2 的唯一出处)。
describe('L2 口径常量(2.4 节代码化)', () => {
  it('density=2.0(与 Figma scale=2 标定对齐)', () => expect(DENSITY).toBe(2.0));
  it('位置/尺寸 ±2dp', () => expect(TOL_POS_DP).toBe(2));
  it('字号 ±0.5sp', () => expect(TOL_FONT_SP).toBe(0.5));
  it('颜色 CIEDE2000 ΔE<3', () => expect(TOL_DELTA_E).toBe(3));
  it('精确比 0.5dp 网格(框架量化噪声上界)', () => expect(EXACT_GRID_DP).toBe(0.5));
  it('severity 权重 blocking=1.0/high=0.8/medium=0.4/low=0.1', () =>
    expect(SEVERITY_WEIGHT).toEqual({ blocking: 1.0, high: 0.8, medium: 0.4, low: 0.1 }));
  it('blockingSeverities 默认 ["blocking","high"]', () =>
    expect(DEFAULT_BLOCKING_SEVERITIES).toEqual(['blocking', 'high']));
  it('minScore 默认 0.9', () => expect(DEFAULT_MIN_SCORE).toBe(0.9));
  it('untaggedCoverage 阈值 0.9', () => expect(UNTAGGED_COVERAGE_THRESHOLD).toBe(0.9));
  it('matchRate 熔断 0.8', () => expect(MATCH_RATE_FUSE).toBe(0.8));
  it('连续 2 轮停滞触发 regression', () => expect(STAGNATION_TRIGGER).toBe(2));
  it('轮上限 5(UI2Code^N 实证饱和)', () => expect(ROUND_LIMIT).toBe(5));
  it('总分回退容忍 0.02', () => expect(SCORE_BACKSLIDE_TOLERANCE).toBe(0.02));
  it('降级算子口径:TEXT_SIM_MIN=0.95/LCS_ALPHA=10/LCS_TYPE_DISCOUNT=0.5/LCS_SIM_MIN=0.6', () => {
    expect(TEXT_SIM_MIN).toBe(0.95);
    expect(LCS_ALPHA).toBe(10);
    expect(LCS_TYPE_DISCOUNT).toBe(0.5);
    expect(LCS_SIM_MIN).toBe(0.6);
  });
  it('T3.4 L2-invariant:触控最小 48dp / 裁剪容差 0.5dp / 兄弟重叠下限 1dp(设计 3.3)', () => {
    expect(TOUCH_TARGET_MIN_DP).toBe(48);
    expect(CLIP_TOL_DP).toBe(0.5);
    expect(OVERLAP_MIN_DP).toBe(1);
  });
});
