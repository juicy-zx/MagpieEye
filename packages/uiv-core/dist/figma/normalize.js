/**
 * REST `GET /v1/files/:key/nodes` 响应 → spec.json 归一化器(T1.2 Step 2/3)。
 * 字段规则见 M1 子计划 T1.2 Step 2 表;坐标 re-base:REST absoluteBoundingBox
 * 恒为绝对画布坐标,统一减根 frame 原点(设计文档 C5/第 4 节口径)。
 */
import { FigmaSpecInvalidError } from './types.js';
function channelToHexPair(v) {
    return Math.round(v * 255).toString(16).padStart(2, '0').toUpperCase();
}
function normalizeFills(fills) {
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
function normalizeOverrides(characters, keys, table) {
    if (keys === undefined || keys.length === 0)
        return [];
    const out = [];
    let runKey = 0;
    let runStart = 0;
    const flush = (end) => {
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
function normalizeLayoutMode(v) {
    // 白名单透传,缺失/其他一律 NONE(禁止 switch 漏 GRID)
    return v === 'HORIZONTAL' || v === 'VERTICAL' || v === 'GRID' ? v : 'NONE';
}
function normalizeCornerRadii(node) {
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
function walk(node, rootOrigin) {
    const ab = node.absoluteBoundingBox;
    const bbox = ab == null
        ? null
        : { x: ab.x - rootOrigin.x, y: ab.y - rootOrigin.y, w: ab.width, h: ab.height };
    const isText = node.type === 'TEXT';
    const characters = node.characters ?? '';
    return {
        id: node.id ?? '',
        name: node.name ?? '',
        type: node.type ?? '',
        visible: node.visible ?? true,
        bbox,
        layoutMode: normalizeLayoutMode(node.layoutMode),
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
export function normalizeNodesResponse(raw, fileKey, nodeId) {
    const resp = raw;
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
//# sourceMappingURL=normalize.js.map