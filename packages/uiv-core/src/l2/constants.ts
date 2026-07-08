/**
 * L2 口径常量 —— 设计文档 2.4 节(指标与判定口径)+ 设计原则 2(防震荡分层比较)
 * 的代码化,唯一出处。数值不得改动;constants.test.ts 做快照防漂移。
 */
export const DENSITY = 2.0;
export const TOL_POS_DP = 2;          // 位置/尺寸 L1 距离 ±2dp
export const TOL_FONT_SP = 0.5;       // 字号 ±0.5sp
export const TOL_DELTA_E = 3;         // 颜色 CIEDE2000 ΔE<3
export const EXACT_GRID_DP = 0.5;     // “精确比”容差 = 框架量化噪声上界 0.5dp(padding/itemSpacing/圆角)
export const SEVERITY_WEIGHT = { blocking: 1.0, high: 0.8, medium: 0.4, low: 0.1 } as const;
export const DEFAULT_BLOCKING_SEVERITIES: readonly string[] = ['blocking', 'high'];
export const DEFAULT_MIN_SCORE = 0.9;
export const UNTAGGED_COVERAGE_THRESHOLD = 0.9;
export const MATCH_RATE_FUSE = 0.8;
export const STAGNATION_TRIGGER = 2; // 连续停滞轮数→regression
export const ROUND_LIMIT = 5;
export const SCORE_BACKSLIDE_TOLERANCE = 0.02;
