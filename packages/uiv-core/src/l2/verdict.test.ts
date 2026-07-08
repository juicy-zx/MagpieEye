import { describe, it, expect } from 'vitest';
import { verdict } from './verdict.js';
import type { Severity, Violation } from './types.js';

const v = (severity: Severity): Violation => ({
  judgePath: 'parity', testTag: 'fig:x', figmaName: 'x',
  property: 'p', expected: 'e', actual: 'a', severity, hint: '',
});

// 设计文档 2.4 节判定优先级:pass = (非 inconclusive) ∧ (blockingSeverities 命中=0) ∧ (score≥minScore),按序短路。
describe('verdict pass 三条件短路', () => {
  it('2.4-条件1短路: inconclusive时即便零违规满分也fail', () =>
    expect(verdict({ subReason: 'tag_coverage_low', violations: [], score: 1 }).pass).toBe(false));

  it('2.4-条件2: blockingSeverities 命中即 fail(1 high, score 0.95)', () =>
    expect(verdict({ subReason: null, violations: [v('high')], score: 0.95 }).pass).toBe(false));

  it('2.4-条件2 先于 minScore 不互换(1 high, score 1.0, minScore 0)', () =>
    expect(verdict({ subReason: null, violations: [v('high')], score: 1.0, minScore: 0 }).pass).toBe(false));

  it('2.4-blockingSeverities 可配(同上但 ["blocking"] → 转看条件3 → true)', () =>
    expect(verdict({ subReason: null, violations: [v('high')], score: 1.0, minScore: 0, blockingSeverities: ['blocking'] }).pass).toBe(true));

  it('2.4-条件3: minScore 只管 medium/low 累积(3 medium, score 0.88 < 0.9)', () =>
    expect(verdict({ subReason: null, violations: [v('medium'), v('medium'), v('medium')], score: 0.88 }).pass).toBe(false));

  it('2.4-全过(2 low, score 0.98)', () =>
    expect(verdict({ subReason: null, violations: [v('low'), v('low')], score: 0.98 }).pass).toBe(true));
});
