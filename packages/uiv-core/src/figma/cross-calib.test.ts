/**
 * cross-calib:真实 Figma REST 响应(uiv-calibration 文件 1:2 CalibCard)与
 * canonical fixture(rest-nodes-card.json)归一化后必须逐字段全等(除节点 id
 * 与 spec 顶层 fileKey/nodeId/version 标签外)。证明 uiv-core 归一化管线在
 * 真实 REST payload 上产出与设计口径一致的几何/样式,而非只对 canonical
 * 手造 fixture 生效。
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { normalizeNodesResponse } from './normalize.js';
import type { SpecNode } from './types.js';

const realRaw = JSON.parse(
  readFileSync(new URL('../../fixtures/rest-nodes-card.real.json', import.meta.url), 'utf8'),
);
const canonicalRaw = JSON.parse(
  readFileSync(new URL('../../fixtures/rest-nodes-card.json', import.meta.url), 'utf8'),
);

const REAL_FILE_KEY = 'a3EzhvJtAuEzTpM0bxzYjT';
const REAL_ROOT_ID = '1:2';
const CANONICAL_FILE_KEY = 'FKEY';
const CANONICAL_ROOT_ID = '1:100';

// 真实↔canonical 节点映射(1:2↔1:100, 1:3↔1:101, 1:4↔1:102, 1:5↔1:103, 1:6↔1:104):
// CalibCard/CalibTitle/CalibSubtitle/CalibSwatch/CalibBadge 依序。
const NODE_NAME_ORDER = ['CalibCard', 'CalibTitle', 'CalibSubtitle', 'CalibSwatch', 'CalibBadge'];

/** 递归抹除 id 字段(真实/canonical 走不同 nodeId 体系,口径 C 禁止迁移,仅比较几何与样式)。 */
function stripIds(node: SpecNode): unknown {
  const { id: _id, children, ...rest } = node;
  return { ...rest, children: children.map(stripIds) };
}

/** 前序展开为节点数组,便于按顺序逐节点比对。 */
function flatten(node: SpecNode): SpecNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

describe('cross-calib: 真实 REST fixture vs canonical fixture', () => {
  const realSpec = normalizeNodesResponse(realRaw, REAL_FILE_KEY, REAL_ROOT_ID);
  const canonicalSpec = normalizeNodesResponse(canonicalRaw, CANONICAL_FILE_KEY, CANONICAL_ROOT_ID);

  it('version 是标签差异:真实为 Figma 文件版本号,canonical 为标定版本标签', () => {
    expect(realSpec.version).toBe('2373767505772482544');
    expect(canonicalSpec.version).toBe('T1_0A_V1');
  });

  it('真实 fileKey 原样归一化进 spec.fileKey', () => {
    expect(realSpec.fileKey).toBe('a3EzhvJtAuEzTpM0bxzYjT');
  });

  it('抹除 id 后 root 树深比较全等(bbox/cornerRadii/fills/text/padding 逐字段一致)', () => {
    expect(stripIds(realSpec.root)).toEqual(stripIds(canonicalSpec.root));
  });

  it('逐节点(按 CalibCard/Title/Subtitle/Swatch/Badge 顺序)断言 name/type/bbox/cornerRadii/fills/text 全等', () => {
    const realNodes = flatten(realSpec.root);
    const canonicalNodes = flatten(canonicalSpec.root);
    expect(realNodes.map((n) => n.name)).toEqual(NODE_NAME_ORDER);
    expect(canonicalNodes.map((n) => n.name)).toEqual(NODE_NAME_ORDER);
    realNodes.forEach((realNode, i) => {
      const canonicalNode = canonicalNodes[i];
      expect(realNode.name).toBe(canonicalNode.name);
      expect(realNode.type).toBe(canonicalNode.type);
      expect(realNode.bbox).toEqual(canonicalNode.bbox);
      expect(realNode.cornerRadii).toEqual(canonicalNode.cornerRadii);
      expect(realNode.fills).toEqual(canonicalNode.fills);
      expect(realNode.text).toEqual(canonicalNode.text);
    });
  });
});
