/**
 * T4.3 Step 4:设计稿漂移哨兵纯逻辑(零 IO)。extractMetaVersion 容 REST /meta 两种候选形状
 * (真实响应形状核验= followup,milestone-4.md T4.3 §1 硬约束⑤);detectVersionDrift 纯比对。
 */
import { describe, expect, it } from 'vitest';
import { detectVersionDrift, extractMetaVersion } from './version-check.js';
import type { MappingEntry } from './mapping.js';
import { L2Error } from '../l2/types.js';

describe('extractMetaVersion', () => {
  it('形状 A:{version} 顶层字段', () => {
    expect(extractMetaVersion({ version: 'v2' })).toBe('v2');
  });
  it('形状 B:{file:{version}} 嵌套字段', () => {
    expect(extractMetaVersion({ file: { version: 'v2' } })).toBe('v2');
  });
  it('坏形状抛 L2Error(figma_spec_invalid)', () => {
    expect(() => extractMetaVersion({ nope: 1 })).toThrow(L2Error);
    try {
      extractMetaVersion(null);
      throw new Error('unreachable');
    } catch (e) {
      expect(e).toBeInstanceOf(L2Error);
      expect((e as L2Error).subReason).toBe('figma_spec_invalid');
    }
  });
});

describe('detectVersionDrift', () => {
  const entries: MappingEntry[] = [
    { fileKey: 'FKEY', nodeId: '1:100', version: 'T1_0A_V1', minScore: 0.9, matrix: 'l-shape' },
    { fileKey: 'FKEY', nodeId: '1:200', version: 'LATEST', minScore: 0.9, matrix: 'l-shape' },
    { fileKey: 'OTHER', nodeId: '1:100', version: 'STALE', minScore: 0.9, matrix: 'l-shape' },
  ];
  it('命中 fileKey 且 version≠latest → 返回漂移项', () => {
    expect(detectVersionDrift(entries, 'FKEY', 'LATEST')).toEqual([
      { nodeId: '1:100', pinned: 'T1_0A_V1', latest: 'LATEST' },
    ]);
  });
  it('version===latest → 不入漂移列表', () => {
    const only = [entries[1]!];   // 1:200 已是 LATEST
    expect(detectVersionDrift(only, 'FKEY', 'LATEST')).toEqual([]);
  });
  it('其余 fileKey 一律忽略(即便 version 亦不同)', () => {
    expect(detectVersionDrift(entries, 'OTHER', 'LATEST')).toEqual([
      { nodeId: '1:100', pinned: 'STALE', latest: 'LATEST' },
    ]);
    expect(detectVersionDrift(entries, 'NOPE', 'LATEST')).toEqual([]);
  });
});
