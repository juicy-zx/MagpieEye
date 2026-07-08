/**
 * T2.5 降级 1:文本归一化 + 编辑距离相似度(设计文档第 4 节)。
 * 归一化后全等(含多空白折叠、首尾空白)→ 1;否则 1 − 编辑距离 / 较长串长度。
 */

/** 折叠内部连续空白为单空格,去首尾空白。 */
export function normalizeText(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

/** 标准两行滚动 DP 编辑距离(Levenshtein)。 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let cur = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n]!;
}

/** 归一化后相似度:全等 → 1(两侧归一化后皆空亦为 1);否则 1 − 距离 / max(长度)。 */
export function textSimilarity(a: string, b: string): number {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (x === y) return 1;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}
