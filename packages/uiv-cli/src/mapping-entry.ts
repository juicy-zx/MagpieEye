/**
 * verify-page/check 的 mapping entry 选取（纯函数，IO 在 index.ts）。
 * D-02/M3 scope 消歧：mapping v2 允许同 nodeId 的 standalone/scoped 多条共存，仅按 nodeId 取首条会
 * 在多 entry 时取错。给定 --version 时按 nodeId+version 唯一命中（0 或 >1 命中均 CliUsageError）；
 * 未给 version 时保持既有语义（按 nodeId 取首条，向后兼容单 entry 常态）。
 */
import type { MappingEntry } from '@magpie-eye/uiv-core';
import { CliUsageError } from './args.js';

export function selectMappingEntry(entries: MappingEntry[], nodeId: string, version?: string): MappingEntry {
  if (version !== undefined) {
    const matches = entries.filter((e) => e.nodeId === nodeId && e.version === version);
    if (matches.length === 0) {
      throw new CliUsageError(`no mapping entry for node ${nodeId} version ${version} in mapping.json; run \`uiv baseline pull\` / \`uiv pin\` first`);
    }
    if (matches.length > 1) {
      throw new CliUsageError(`ambiguous mapping: ${matches.length} entries for node ${nodeId} version ${version}; node+version must be unique`);
    }
    return matches[0]!;
  }
  const entry = entries.find((e) => e.nodeId === nodeId);
  if (entry === undefined) {
    throw new CliUsageError(`node ${nodeId} not in mapping.json; run \`uiv baseline pull\` first`);
  }
  return entry;
}
