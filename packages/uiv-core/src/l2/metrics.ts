/**
 * L2 指标公式(T1.3 Step 7,设计文档 2.4 节唯一出处)。
 * untaggedCoverage/matchRate 的分子分母都只统计 N 中的叶子;
 * 容器(如 CalibCard)tag 命中/配对不计入分子(leafTagHits/leafPairCount 强制)。
 */
import { SEVERITY_WEIGHT } from './constants.js';
import type { FigmaNode, Violation } from './types.js';

/** N 中 fig:<id> 命中 dump tag 的叶子数(容器不在 N,天然不计)。 */
export function leafTagHits(leaves: FigmaNode[], dumpTags: Set<string>): number {
  return leaves.filter((n) => dumpTags.has(`fig:${n.id}`)).length;
}

/** N 中被 tag 配对成功(id ∈ pairedIds)的叶子数。 */
export function leafPairCount(leaves: FigmaNode[], pairedIds: Set<string>): number {
  return leaves.filter((n) => pairedIds.has(n.id)).length;
}

/** tag 契约履约率 = N 中 tag 命中叶子 / |N|;N=0 视为 1(空集判定交给 verdict 层)。 */
export function untaggedCoverage(taggedLeafHits: number, nSize: number): number {
  return nSize === 0 ? 1 : taggedLeafHits / nSize;
}

/** 两树可比性 = N 中配对成功叶子 / |N|;v0 仅 tag 策略;N=0 视为 1。 */
export function matchRate(pairedLeaves: number, nSize: number): number {
  return nSize === 0 ? 1 : pairedLeaves / nSize;
}

/** score = 1 − Σ(severity 权重) / 已执行断言数;executed=0 → 0。 */
export function score(violations: Violation[], executed: number): number {
  if (executed === 0) return 0;
  const sum = violations.reduce((s, x) => s + SEVERITY_WEIGHT[x.severity], 0);
  return 1 - sum / executed;
}
