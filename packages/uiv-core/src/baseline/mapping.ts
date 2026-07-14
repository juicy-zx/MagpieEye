/**
 * mapping.json v2 受控写入(T3.2 Step 1)。
 * uiParity source of truth:顶层 MappingEntry 数组;upsert 主键含 scope.sourceDocumentPath 消歧(D-02)。
 * 每次写 mapping.json 同写 sidecar mapping.json.sig(sha256 内容摘要),供 magpie T3.1b 判"受控写入"豁免。
 * 注:scope.sourceDocumentHash 是源文档 sha1(对齐 magpie hashContent,由 pin 侧写入);sig.digest 是 mapping.json 字节 sha256——两者用途不同不得混用。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteFileSync } from '../util/atomic.js';

export interface MappingScope { sourceDocumentPath: string; sourceDocumentHash: string; pinnedAt: string }
export interface MappingStateRef { name: string; judgePath: 'parity' | 'invariant-only'; figmaVariantNodeId?: string }
export interface MappingEntry {
  fileKey: string; nodeId: string; version: string; minScore: number;
  testFqn?: string; demoDir?: string; matrix: string; scope?: MappingScope; states?: MappingStateRef[];
}

const sha256 = (b: string | Buffer): string => createHash('sha256').update(b).digest('hex');
const key = (e: MappingEntry): string => `${e.fileKey} ${e.nodeId} ${e.scope?.sourceDocumentPath ?? ''}`;

export function upsertMappingEntry(uiVerifyDir: string, entry: MappingEntry): string {
  mkdirSync(uiVerifyDir, { recursive: true });
  const mappingPath = join(uiVerifyDir, 'mapping.json');
  const entries: MappingEntry[] = existsSync(mappingPath) ? JSON.parse(readFileSync(mappingPath, 'utf8')) : [];
  const i = entries.findIndex((e) => key(e) === key(entry));
  if (i >= 0) entries[i] = entry; else entries.push(entry);
  const body = `${JSON.stringify(entries, null, 2)}\n`;
  atomicWriteFileSync(mappingPath, body, 'utf8');
  atomicWriteFileSync(`${mappingPath}.sig`,
    `${JSON.stringify({ schemaVersion: 1, writtenBy: 'uiv', algo: 'sha256', digest: sha256(body) })}\n`, 'utf8');
  return mappingPath;
}

/** T3.1b 豁免判据:mapping/sig 任一缺失→false;否则 sig.digest === sha256(mapping 字节)。手改 mapping 即失配。 */
export function verifyMappingSig(uiVerifyDir: string): boolean {
  const mappingPath = join(uiVerifyDir, 'mapping.json');
  const sigPath = `${mappingPath}.sig`;
  if (!existsSync(mappingPath) || !existsSync(sigPath)) return false;
  try {
    const sig = JSON.parse(readFileSync(sigPath, 'utf8')) as { digest?: unknown };
    return sig.digest === sha256(readFileSync(mappingPath));
  } catch {
    return false;
  }
}
