/**
 * pass 三条件短路判定(T1.3 Step 8,设计文档 2.4 节判定优先级)。
 * pass = (reason≠inconclusive) ∧ (blockingSeverities 命中数=0) ∧ (score≥minScore),按序短路。
 * “无 blocking/high 违规”是先于 minScore 的硬条件,两者不互换;
 * minScore 只约束剩余 medium/low 违规的累积量。
 */
import { DEFAULT_BLOCKING_SEVERITIES, DEFAULT_MIN_SCORE } from './constants.js';
import type { SubReason, Violation } from './types.js';

export interface VerdictInput {
  subReason: SubReason | null;
  violations: Violation[];
  score: number;
  minScore?: number;
  blockingSeverities?: readonly string[];
}

export function verdict(input: VerdictInput): { pass: boolean } {
  const minScore = input.minScore ?? DEFAULT_MIN_SCORE;
  const blockingSeverities = input.blockingSeverities ?? DEFAULT_BLOCKING_SEVERITIES;

  if (input.subReason !== null) return { pass: false };                 // 条件1:inconclusive
  const blockingHits = input.violations.filter((v) => blockingSeverities.includes(v.severity)).length;
  if (blockingHits > 0) return { pass: false };                         // 条件2:先于 minScore
  if (input.score < minScore) return { pass: false };                   // 条件3:medium/low 累积
  return { pass: true };
}
