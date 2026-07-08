import { describe, it, expect } from 'vitest';
import { untaggedCoverage, matchRate, score, leafTagHits, leafPairCount } from './metrics.js';
import type { FigmaNode, Severity, Violation } from './types.js';

const v = (severity: Severity): Violation => ({
  judgePath: 'parity', testTag: 'fig:x', figmaName: 'x',
  property: 'p', expected: 'e', actual: 'a', severity, hint: '',
});
const leaf = (id: string): FigmaNode => ({ id, name: id, type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 0, width: 1, height: 1 } });

// 设计文档 2.4 节:分子/分母只统计 N 中叶子,容器命中不进分子。
describe('L2 指标公式(2.4 节)', () => {
  it('2.4-untaggedCoverage: N=10 命中 9 → 0.9', () => expect(untaggedCoverage(9, 10)).toBe(0.9));
  it('2.4-untaggedCoverage: N=0 → 1(空集判定交给 verdict)', () => expect(untaggedCoverage(0, 0)).toBe(1));

  it('2.4-untaggedCoverage-容器不计分: 只容器 tag 命中、4 叶子全缺 tag → leafTagHits=0 → 0', () => {
    const N = [leaf('1:101'), leaf('1:102'), leaf('1:103'), leaf('1:104')];
    const dumpTags = new Set(['fig:1:100']);   // 仅容器命中
    const hits = leafTagHits(N, dumpTags);
    expect(hits).toBe(0);
    expect(untaggedCoverage(hits, N.length)).toBe(0);
  });

  it('2.4-matchRate-v0: N=10 配对 7 → 0.7(容器配对不计入分子;T2.5 接降级匹配后分子扩大)', () =>
    expect(matchRate(7, 10)).toBe(0.7));
  it('2.4-matchRate-容器不计分: pairedIds 仅含容器 → leafPairCount=0', () => {
    const N = [leaf('1:101'), leaf('1:102')];
    expect(leafPairCount(N, new Set(['1:100']))).toBe(0);
  });

  it('2.4-score: [high,medium,low], executed=10 → 0.87', () =>
    expect(score([v('high'), v('medium'), v('low')], 10)).toBeCloseTo(0.87, 10));
  it('2.4-score-空断言: executed=0 → 0', () => expect(score([], 0)).toBe(0));
  it('2.4-score-blocking 权重 1.0', () => expect(score([v('blocking')], 10)).toBeCloseTo(0.9, 10));
});
