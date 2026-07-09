/**
 * T4.3 Step 4:设计稿漂移哨兵纯逻辑(零 IO;设计文档 5.3"哨兵"行 — 只告警不阻断)。
 * extractMetaVersion 消化 Figma REST GET /v1/files/:key/meta 响应(真实响应形状核验待
 * FIGMA_PAT 到位后跟进,pending_followups B1;此处按两种已知候选形状宽容解析)。
 */
import type { MappingEntry } from './mapping.js';
import { L2Error } from '../l2/types.js';

/** 候选形状 A:{version}顶层;候选形状 B:{file:{version}}嵌套。两者皆非 → figma_spec_invalid。 */
export function extractMetaVersion(meta: unknown): string {
  if (meta !== null && typeof meta === 'object') {
    const m = meta as Record<string, unknown>;
    if (typeof m['version'] === 'string') return m['version'];
    const file = m['file'];
    if (file !== null && typeof file === 'object') {
      const v = (file as Record<string, unknown>)['version'];
      if (typeof v === 'string') return v;
    }
  }
  throw new L2Error('figma_spec_invalid');
}

export interface VersionDrift { nodeId: string; pinned: string; latest: string }

/** entries 中 fileKey 命中且 version≠latest 的逐条列出(其余 fileKey 忽略);相等⇒不入列。 */
export function detectVersionDrift(entries: MappingEntry[], fileKey: string, latest: string): VersionDrift[] {
  const drifts: VersionDrift[] = [];
  for (const e of entries) {
    if (e.fileKey !== fileKey) continue;
    if (e.version !== latest) drifts.push({ nodeId: e.nodeId, pinned: e.version, latest });
  }
  return drifts;
}
