/**
 * uiv pin:parity contract 固化(T3.2 Step 2/3)。
 * 拉基准(fixture/REST 经注入 client)→ 归一化落 spec.json → 写 mapping.json v2 entry(受控 sig)。
 * COMPONENT_SET 自动枚举 variant 为独立状态基准;--source 决定 scope(无 scope = standalone,永不入 magpie 合同)。
 * 口径:scope.sourceDocumentHash = 源文档字节 sha1(对齐 magpie hashContent,非 sha256);scope 解析 fail-fast 先于拉取。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { FigmaClient } from '../figma/client.js';
import { normalizeNodesResponse } from '../figma/normalize.js';
import { FigmaSpecInvalidError } from '../figma/types.js';
import { baselineDirName } from './pull.js';
import { upsertMappingEntry } from './mapping.js';
import type { MappingEntry, MappingScope, MappingStateRef } from './mapping.js';
import { requestContractRepersist } from './repersist.js';

export class PinScopeError extends Error {}

export interface PinOptions {
  fileKey: string;
  nodeId: string;
  testFqn: string;
  demoDir: string;
  sourceDoc?: string;
  explicitStates?: MappingStateRef[];
  minScore?: number;
  matrix?: string;
  now?: () => Date;
}

export interface PinnedBaseline { nodeId: string; specPath: string; baselinePngExists: boolean }

export interface PinResult {
  entry: MappingEntry;
  mappingPath: string;
  pulled: PinnedBaseline[];
  repersistRequested: boolean;
  warnings: string[];
}

interface RawVariantNode {
  id?: string; name?: string; type?: string;
  children?: RawVariantNode[];
  componentPropertyDefinitions?: Record<string, { type?: string; variantOptions?: string[] } | undefined>;
}
interface RawNodesResp {
  version?: unknown;
  nodes?: Record<string, { document?: RawVariantNode } | undefined>;
}

/** normalize → baselines/<dir>/spec.json 落盘 + baseline.png 探测(同 pull.ts 现状)。 */
function writeSpecFromRaw(raw: unknown, fileKey: string, nodeId: string, uiVerifyDir: string): PinnedBaseline {
  const spec = normalizeNodesResponse(raw, fileKey, nodeId);
  const dir = join(uiVerifyDir, 'baselines', baselineDirName(nodeId, spec.version));
  mkdirSync(dir, { recursive: true });
  const specPath = join(dir, 'spec.json');
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
  return { nodeId, specPath, baselinePngExists: existsSync(join(dir, 'baseline.png')) };
}

/** undefined→undefined;相对路径按 root 解析,越界(..)或文件不存在→PinScopeError。hash = 源文档字节 sha1 hex。 */
function resolveScope(root: string, sourceDoc: string | undefined, now: () => Date): MappingScope | undefined {
  if (sourceDoc === undefined) return undefined;
  const abs = isAbsolute(sourceDoc) ? sourceDoc : resolve(root, sourceDoc);
  const rel = relative(root, abs);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new PinScopeError(`source document escapes workspace: ${sourceDoc}`);
  }
  if (!existsSync(abs)) {
    throw new PinScopeError(`source document not found: ${sourceDoc}`);
  }
  return {
    sourceDocumentPath: rel.split(sep).join('/'),
    sourceDocumentHash: createHash('sha1').update(readFileSync(abs)).digest('hex'),
    pinnedAt: now().toISOString(),
  };
}

/** variant 名 "State=Empty[, Size=Big]" → 取值段小写 '-' 连(empty-big);无 '=' 整名小写。 */
export function variantStateName(name: string): string {
  return name.split(',').map((p) => { const [k, v] = p.split('='); return (v ?? k ?? '').trim(); })
    .filter(Boolean).join('-').toLowerCase();
}

export async function pinBaseline(client: FigmaClient, workspaceRoot: string, opts: PinOptions): Promise<PinResult> {
  const now = opts.now ?? ((): Date => new Date());
  const uiVerifyDir = join(workspaceRoot, '.ui-verify');
  // ① scope 解析(fail-fast,先于拉取)
  const scope = resolveScope(workspaceRoot, opts.sourceDoc, now);
  // ② 首拉不带 version,以响应 version 钉
  const raw = await client.getNodes(opts.fileKey, opts.nodeId);
  const resp = raw as RawNodesResp;
  const doc = resp.nodes?.[opts.nodeId]?.document;
  const version = resp.version;
  if (doc === undefined || typeof version !== 'string') {
    throw new FigmaSpecInvalidError(`pin: node ${opts.nodeId} document/version missing in nodes response`);
  }
  // ③ 收集状态基准
  const states = new Map<string, string>();
  const pulled: PinnedBaseline[] = [];
  const warnings: string[] = [];
  if (doc.type === 'COMPONENT_SET') {
    for (const child of doc.children ?? []) {
      if (child.type === 'COMPONENT' && child.id) {
        const synthetic = { version, nodes: { [child.id]: { document: child } } };
        pulled.push(writeSpecFromRaw(synthetic, opts.fileKey, child.id, uiVerifyDir));   // set 本体不落,re-base 到 variant 原点
        states.set(variantStateName(child.name ?? ''), child.id);
      }
    }
    // variantOptions 仅交叉校验:无对应子节点→WARN 不阻断
    const stateSegments = new Set<string>();
    for (const name of states.keys()) for (const seg of name.split('-')) stateSegments.add(seg);
    for (const def of Object.values(doc.componentPropertyDefinitions ?? {})) {
      if (def?.type === 'VARIANT') {
        for (const o of def.variantOptions ?? []) {
          if (!stateSegments.has(o.toLowerCase())) warnings.push(`variantOption 未见对应子节点: ${o}`);
        }
      }
    }
  } else {
    pulled.push(writeSpecFromRaw(raw, opts.fileKey, opts.nodeId, uiVerifyDir));
  }
  // ④ 显式 --state:带钉定 version 单独拉取,同名覆盖自动枚举
  for (const s of opts.explicitStates ?? []) {
    const variantId = s.figmaVariantNodeId;
    if (variantId === undefined) continue;
    const raw2 = await client.getNodes(opts.fileKey, variantId, version);
    pulled.push(writeSpecFromRaw(raw2, opts.fileKey, variantId, uiVerifyDir));
    states.set(s.name, variantId);
  }
  // ⑤ 组装 entry(scope/states 仅非空才带字段;本函数产出的 state 恒 parity 且恒有 figmaVariantNodeId)
  const stateRefs: MappingStateRef[] = [...states].map(([name, variantId]) => ({
    name, judgePath: 'parity' as const, ...(variantId ? { figmaVariantNodeId: variantId } : {}),
  }));
  const entry: MappingEntry = {
    fileKey: opts.fileKey,
    nodeId: opts.nodeId,
    version,
    minScore: opts.minScore ?? 0.9,
    matrix: opts.matrix ?? 'l-shape',
    testFqn: opts.testFqn,
    demoDir: opts.demoDir,
    ...(scope ? { scope } : {}),
    ...(stateRefs.length > 0 ? { states: stateRefs } : {}),
  };
  const mappingPath = upsertMappingEntry(uiVerifyDir, entry);
  // ⑥ re-persist 触发(仅 scoped pin 且探测到 .magpie/)
  const repersistRequested = scope !== undefined && requestContractRepersist(workspaceRoot);
  return { entry, mappingPath, pulled, repersistRequested, warnings };
}
