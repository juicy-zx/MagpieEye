/**
 * REST `GET /v1/files/:key/nodes` 响应 → spec.json 归一化器(T1.2 Step 2/3)。
 * 字段规则见 M1 子计划 T1.2 Step 2 表;坐标 re-base:REST absoluteBoundingBox
 * 恒为绝对画布坐标,统一减根 frame 原点(设计文档 C5/第 4 节口径)。
 */
import { FigmaSpecInvalidError } from './types.js';
import type { Rect, Spec, SpecNode } from './types.js';

interface RawBox { x: number; y: number; width: number; height: number }
interface RawPaint {
  type?: string;
  color?: { r: number; g: number; b: number; a?: number };
  opacity?: number;
}
interface RawNode {
  id?: string; name?: string; type?: string; visible?: boolean;
  absoluteBoundingBox?: RawBox | null;
  cornerRadius?: number;
  rectangleCornerRadii?: [number, number, number, number];
  layoutMode?: string;
  primaryAxisAlignItems?: string;
  paddingLeft?: number; paddingTop?: number; paddingRight?: number; paddingBottom?: number;
  itemSpacing?: number;
  fills?: RawPaint[];
  characters?: string;
  style?: { fontSize?: number; fontWeight?: number };
  characterStyleOverrides?: number[];
  styleOverrideTable?: Record<string, Record<string, unknown>>;
  children?: RawNode[];
}
interface RawNodesResponse {
  version?: unknown;
  nodes?: Record<string, { document?: RawNode } | undefined>;
}

function channelToHexPair(v: number): string {
  return Math.round(v * 255).toString(16).padStart(2, '0').toUpperCase();
}

function normalizeFills(fills: RawPaint[] | undefined): SpecNode['fills'] {
  return (fills ?? []).map((f) => {
    if (f.type === 'SOLID' && f.color != null) {
      const { r, g, b, a } = f.color;
      return {
        type: 'SOLID',
        hex: `#${channelToHexPair(r)}${channelToHexPair(g)}${channelToHexPair(b)}`,
        opacity: f.opacity ?? a ?? 1,
      };
    }
    return { type: f.type ?? 'UNKNOWN', hex: null, opacity: f.opacity ?? 1 };
  });
}

/** characterStyleOverrides 逐字符 key → 连续相同 key 合并为 [start,end) 区段;key 0 或缺失 = 无覆盖跳过。 */
function normalizeOverrides(
  characters: string,
  keys: number[] | undefined,
  table: Record<string, Record<string, unknown>> | undefined,
): NonNullable<SpecNode['text']>['overrides'] {
  if (keys === undefined || keys.length === 0) return [];
  const out: NonNullable<SpecNode['text']>['overrides'] = [];
  let runKey = 0;
  let runStart = 0;
  const flush = (end: number): void => {
    if (runKey !== 0 && end > runStart) {
      out.push({ start: runStart, end, style: table?.[String(runKey)] ?? {} });
    }
  };
  for (let i = 0; i < characters.length; i++) {
    const key = keys[i] ?? 0; // 数组短于字符数时,后续字符视为无覆盖
    if (key !== runKey) {
      flush(i);
      runKey = key;
      runStart = i;
    }
  }
  flush(characters.length);
  return out;
}

function normalizeLayoutMode(v: string | undefined): SpecNode['layoutMode'] {
  // 白名单透传,缺失/其他一律 NONE(禁止 switch 漏 GRID)
  return v === 'HORIZONTAL' || v === 'VERTICAL' || v === 'GRID' ? v : 'NONE';
}

/**
 * B3:primaryAxisAlignItems 白名单发射 —— 仅当节点明确为 auto-layout(normalize 后 layoutMode
 * 非 NONE,天然防 raw undefined!==NONE 误发射)且 raw 值命中四值白名单才发射;缺失/其他不发射
 * (旧 spec = unknown),严禁合成 MIN/PACKED/几何反推。
 */
function normalizePrimaryAxisAlignItems(
  layoutMode: SpecNode['layoutMode'], v: string | undefined,
): NonNullable<SpecNode['primaryAxisAlignItems']> | undefined {
  if (layoutMode === 'NONE') return undefined;
  return v === 'MIN' || v === 'CENTER' || v === 'MAX' || v === 'SPACE_BETWEEN' ? v : undefined;
}

function normalizeCornerRadii(node: RawNode): SpecNode['cornerRadii'] {
  if (node.rectangleCornerRadii !== undefined) {
    const [tl, tr, br, bl] = node.rectangleCornerRadii;
    return [tl, tr, br, bl];
  }
  if (node.cornerRadius !== undefined) {
    const r = node.cornerRadius;
    return [r, r, r, r];
  }
  return null;
}

function walk(node: RawNode, rootOrigin: { x: number; y: number }): SpecNode {
  const ab = node.absoluteBoundingBox;
  const bbox: Rect | null = ab == null
    ? null
    : { x: ab.x - rootOrigin.x, y: ab.y - rootOrigin.y, w: ab.width, h: ab.height };
  const isText = node.type === 'TEXT';
  const characters = node.characters ?? '';
  const layoutMode = normalizeLayoutMode(node.layoutMode);
  const primaryAxisAlignItems = normalizePrimaryAxisAlignItems(layoutMode, node.primaryAxisAlignItems);
  return {
    id: node.id ?? '',
    name: node.name ?? '',
    type: node.type ?? '',
    visible: node.visible ?? true,
    bbox,
    layoutMode,
    // B3:缺失即不携带 own-property(unknown),下游不得读到合成值
    ...(primaryAxisAlignItems !== undefined ? { primaryAxisAlignItems } : {}),
    padding: {
      l: node.paddingLeft ?? 0,
      t: node.paddingTop ?? 0,
      r: node.paddingRight ?? 0,
      b: node.paddingBottom ?? 0,
    },
    itemSpacing: node.itemSpacing ?? 0,
    cornerRadii: normalizeCornerRadii(node),
    fills: normalizeFills(node.fills),
    text: isText
      ? {
          characters,
          fontSize: node.style?.fontSize ?? 0,
          fontWeight: node.style?.fontWeight ?? 0,
          overrides: normalizeOverrides(characters, node.characterStyleOverrides, node.styleOverrideTable),
        }
      : null,
    children: (node.children ?? []).map((c) => walk(c, rootOrigin)),
  };
}

export function normalizeNodesResponse(raw: unknown, fileKey: string, nodeId: string): Spec {
  const resp = raw as RawNodesResponse;
  const doc = resp.nodes?.[nodeId]?.document;
  if (doc === undefined) {
    throw new FigmaSpecInvalidError(`node ${nodeId} not found in nodes response`);
  }
  if (typeof resp.version !== 'string') {
    throw new FigmaSpecInvalidError('nodes response missing string field: version');
  }
  const rootBox = doc.absoluteBoundingBox;
  const rootOrigin = rootBox == null ? { x: 0, y: 0 } : { x: rootBox.x, y: rootBox.y };
  return {
    specVersion: 0,
    fileKey,
    nodeId,
    version: resp.version,
    root: walk(doc, rootOrigin),
  };
}
