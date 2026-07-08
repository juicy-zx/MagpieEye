/**
 * 防震荡分层比较(T1.3 Step 9,设计原则 2)。纯函数,persist 到 .ui-verify/state.json。
 * “改善”定义:blockingHits 下降且 score 回退≤0.02,或 blockingHits 持平且 score 上升;
 * 否则停滞 +1;stagnation≥2 → regression;round≥5 且未 pass → regression(round_limit 优先)。
 * pass → 重置为初始态。regressionReason 必含前后值。
 */
import { ROUND_LIMIT, SCORE_BACKSLIDE_TOLERANCE, STAGNATION_TRIGGER } from './constants.js';
import type { StateFile } from './types.js';

const INITIAL: StateFile = { round: 0, stagnation: 0, regression: false, regressionReason: null, history: [] };
const EPS = 1e-9;   // 吸收 score 浮点噪声(如 0.60−0.58=0.0200000000000000018)

export function stepState(
  prev: StateFile | null,
  cur: { blockingHits: number; score: number; pass: boolean },
): StateFile {
  if (cur.pass) return { ...INITIAL, history: [] };

  const round = (prev?.round ?? 0) + 1;
  const history = [...(prev?.history ?? []), { round, blockingHits: cur.blockingHits, score: cur.score }];

  // 上轮指标取自 prev.history 末项(StateFile 顶层不携带 blockingHits/score)。
  const last = prev?.history.at(-1) ?? null;

  let stagnation: number;
  if (prev === null || last === null) {
    stagnation = 0;
  } else {
    const improved =
      (cur.blockingHits < last.blockingHits && last.score - cur.score <= SCORE_BACKSLIDE_TOLERANCE + EPS)
      || (cur.blockingHits === last.blockingHits && cur.score > last.score);
    stagnation = improved ? 0 : prev.stagnation + 1;
  }

  let regression = false;
  let regressionReason: string | null = null;
  if (round >= ROUND_LIMIT) {
    regression = true;
    regressionReason = `round_limit(${ROUND_LIMIT}): ${round} 轮未通过`;
  } else if (stagnation >= STAGNATION_TRIGGER && last !== null) {
    regression = true;
    regressionReason =
      `blockingHits ${last.blockingHits}→${cur.blockingHits}, `
      + `score ${last.score.toFixed(2)}→${cur.score.toFixed(2)}, 连续${stagnation}轮停滞`;
  }

  return { round, stagnation, regression, regressionReason, history };
}
