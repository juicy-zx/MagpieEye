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
import { L2Error } from '../l2/types.js';
import { upsertMappingEntry } from './mapping.js';
import type { MappingEntry, MappingStateRef } from './mapping.js';

export interface PullResult { specPath: string; baselinePngPath: string; baselinePngExists: boolean; mappingPath: string }

export type { MappingEntry, MappingStateRef } from './mapping.js';

/**
 * states[] 路由读取器(T3.4,跨章契约第 5 条)。复用 T3.2 mapping.ts 的 MappingStateRef,不重定义接口。
 * 运行期不猜:未声明该 state 名、或声明 judgePath:'parity' 却缺 figmaVariantNodeId → 抛 L2Error('figma_spec_invalid')。
 */
export function stateJudgePath(e: MappingEntry, state: string): MappingStateRef {
  const ref = e.states?.find((s) => s.name === state);
  if (ref === undefined) throw new L2Error('figma_spec_invalid');
  if (ref.judgePath === 'parity' && (ref.figmaVariantNodeId === undefined || ref.figmaVariantNodeId === '')) {
    throw new L2Error('figma_spec_invalid');
  }
  return ref;
}

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
