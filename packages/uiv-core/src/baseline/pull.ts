/**
 * baseline pull 核心(T1.2 Step 7,fixture 模式)。
 * getNodes → 归一化 → 写 baselines/<dir>/spec.json + upsert mapping.json;
 * baseline.png 只探测存在性不阻断(fixture 模式下 REST images 通道不可用,
 * PNG 由主会话经 MCP 落盘,来源通道待 Codex 决断)。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FigmaClient } from '../figma/client.js';
import { normalizeNodesResponse } from '../figma/normalize.js';
import { upsertMappingEntry } from './mapping.js';

export interface PullResult { specPath: string; baselinePngPath: string; baselinePngExists: boolean; mappingPath: string }

export type { MappingEntry } from './mapping.js';

/** macOS 路径避 ':':nodeId 的 ':' 换 '-',拼 @version;mapping.json 内保留原 id。 */
export function baselineDirName(nodeId: string, version: string): string {
  return `${nodeId.replaceAll(':', '-')}@${version}`;
}

export async function pullBaseline(client: FigmaClient, fileKey: string, nodeId: string,
                                   uiVerifyDir: string, version?: string): Promise<PullResult> {
  const raw = await client.getNodes(fileKey, nodeId, version);
  const spec = normalizeNodesResponse(raw, fileKey, nodeId);

  const dir = join(uiVerifyDir, 'baselines', baselineDirName(nodeId, spec.version));
  mkdirSync(dir, { recursive: true });

  const specPath = join(dir, 'spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');

  const baselinePngPath = join(dir, 'baseline.png');
  const baselinePngExists = existsSync(baselinePngPath);

  const mappingPath = upsertMappingEntry(uiVerifyDir, { fileKey, nodeId, version: spec.version, minScore: 0.9, matrix: 'default5' });

  return { specPath, baselinePngPath, baselinePngExists, mappingPath };
}
