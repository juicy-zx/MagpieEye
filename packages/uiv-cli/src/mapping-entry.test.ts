import { describe, it, expect } from 'vitest';
import type { MappingEntry } from '@magpie-eye/uiv-core';
import { CliUsageError } from './args.js';
import { selectMappingEntry } from './mapping-entry.js';

const mk = (nodeId: string, version: string, extra: Partial<MappingEntry> = {}): MappingEntry =>
  ({ fileKey: 'FKEY', nodeId, version, minScore: 0.9, matrix: 'l-shape', ...extra });

describe('selectMappingEntry: --version 消歧(D-02/M3)', () => {
  // mapping v2:同 nodeId 的 standalone 与 scoped 两条 entry 共存(不同 version)。
  const standalone = mk('1:100', 'V1');
  const scoped = mk('1:100', 'V2', { scope: { sourceDocumentPath: 'docs/a.md', sourceDocumentHash: 'h', pinnedAt: '2026-01-01T00:00:00Z' } });
  const entries = [standalone, scoped];

  it('正例:给定 version 唯一命中同 nodeId 的对应条', () => {
    expect(selectMappingEntry(entries, '1:100', 'V2')).toBe(scoped);
    expect(selectMappingEntry(entries, '1:100', 'V1')).toBe(standalone);
  });

  it('未给 version:保持既有语义(按 nodeId 取首条,向后兼容单 entry 常态)', () => {
    expect(selectMappingEntry(entries, '1:100')).toBe(standalone);
  });

  it('反例:给定 version 0 命中 → CliUsageError', () => {
    expect(() => selectMappingEntry(entries, '1:100', 'V9')).toThrow(CliUsageError);
    expect(() => selectMappingEntry(entries, '1:100', 'V9')).toThrow(/no mapping entry/);
  });

  it('反例:给定 version >1 命中(同 nodeId+version 多条) → CliUsageError', () => {
    const dup = [mk('1:100', 'V1'), mk('1:100', 'V1', { demoDir: 'other-demo' })];
    expect(() => selectMappingEntry(dup, '1:100', 'V1')).toThrow(CliUsageError);
    expect(() => selectMappingEntry(dup, '1:100', 'V1')).toThrow(/ambiguous/);
  });

  it('反例:未给 version 且 nodeId 不存在 → CliUsageError', () => {
    expect(() => selectMappingEntry(entries, '9:999')).toThrow(CliUsageError);
  });
});
