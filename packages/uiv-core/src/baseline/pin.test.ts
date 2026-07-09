import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { FixtureFigmaClient } from '../figma/client.js';
import type { FigmaClient } from '../figma/client.js';
import { pinBaseline, variantStateName, PinScopeError } from './pin.js';

const cardPath = fileURLToPath(new URL('../../fixtures/rest-nodes-card.json', import.meta.url));
const csPath = fileURLToPath(new URL('../../fixtures/rest-nodes-componentset.json', import.meta.url));
const card = (): FixtureFigmaClient => new FixtureFigmaClient(cardPath);
const cs = (): FixtureFigmaClient => new FixtureFigmaClient(csPath);
const multi = (m: Record<string, unknown>): FigmaClient => ({
  getNodes: async (_f: string, id: string) => m[id],
  getImages: async () => ({}),
});
const now = (): Date => new Date('2026-07-09T00:00:00Z');

describe('pinBaseline standalone/scope/幂等', () => {
  it('standalone:无 scope 无标记;基准落盘', async () => {
    const root = mkdtempSync(join(tmpdir(), 'uiv-pin-'));
    const r = await pinBaseline(card(), root, { fileKey: 'F', nodeId: '1:100',
      testFqn: 'com.magpie.uiv.demo.CalibCardTest', demoDir: 'demo-android', now });
    expect(r.entry).toEqual({ fileKey: 'F', nodeId: '1:100', version: 'T1_0A_V1', minScore: 0.9, matrix: 'l-shape',
      testFqn: 'com.magpie.uiv.demo.CalibCardTest', demoDir: 'demo-android' });
    expect(r.repersistRequested).toBe(false);
    expect(existsSync(join(root, '.ui-verify/baselines/1-100@T1_0A_V1/spec.json'))).toBe(true);
  });

  it('scoped:三字段(hash=源文档字节 sha1)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'uiv-pin-'));
    mkdirSync(join(root, 'docs')); writeFileSync(join(root, 'docs/req.md'), 'PRD');
    const r = await pinBaseline(card(), root, { fileKey: 'F', nodeId: '1:100',
      testFqn: 'com.magpie.uiv.demo.CalibCardTest', demoDir: 'demo-android', sourceDoc: 'docs/req.md', now, minScore: 0.95 });
    expect(r.entry.scope).toEqual({ sourceDocumentPath: 'docs/req.md',
      sourceDocumentHash: createHash('sha1').update('PRD').digest('hex'),
      pinnedAt: '2026-07-09T00:00:00.000Z' });
    expect(r.entry.minScore).toBe(0.95);
  });

  it('scope fail-fast:源文档不存在/越界工作区 均 rejects PinScopeError', async () => {
    const root = mkdtempSync(join(tmpdir(), 'uiv-pin-'));
    const opt = (sourceDoc: string) => ({ fileKey: 'F', nodeId: '1:100',
      testFqn: 'com.magpie.uiv.demo.CalibCardTest', demoDir: 'demo-android', sourceDoc, now });
    await expect(pinBaseline(card(), root, opt('nope.md'))).rejects.toBeInstanceOf(PinScopeError);
    await expect(pinBaseline(card(), root, opt('../esc.md'))).rejects.toBeInstanceOf(PinScopeError);
  });
});

describe('pinBaseline COMPONENT_SET 枚举', () => {
  it('CS6:批量分状态基准+states[];re-base 到 variant 原点;set 本体不落', async () => {
    const root = mkdtempSync(join(tmpdir(), 'uiv-cs-'));
    const r = await pinBaseline(cs(), root, { fileKey: 'F', nodeId: '9:100',
      testFqn: 'com.magpie.uiv.demo.CalibCardTest', demoDir: 'demo-android', now });
    expect(r.entry.states).toEqual([{ name: 'empty', judgePath: 'parity', figmaVariantNodeId: '9:101' },
      { name: 'filled', judgePath: 'parity', figmaVariantNodeId: '9:102' },
      { name: 'error', judgePath: 'parity', figmaVariantNodeId: '9:103' }]);
    const spec = JSON.parse(readFileSync(join(root, '.ui-verify/baselines/9-101@CS_V1/spec.json'), 'utf8'));
    expect(spec.root.bbox).toEqual({ x: 0, y: 0, w: 360, h: 200 });
    expect(spec.root.children[0].bbox).toEqual({ x: 12, y: 12, w: 100, h: 16 });
    expect(existsSync(join(root, '.ui-verify/baselines/9-100@CS_V1'))).toBe(false);
    expect(r.warnings).toEqual([]);
  });

  it('variantStateName+显式 --state 覆盖同名', async () => {
    expect(variantStateName('State=Empty, Size=Big')).toBe('empty-big');
    expect(variantStateName('Fallback')).toBe('fallback');
    const csRaw = JSON.parse(readFileSync(csPath, 'utf8'));
    const alt = { version: 'CS_V1', nodes: { '7:200': { document: { id: '7:200', name: 'EmptyAlt', type: 'FRAME',
      absoluteBoundingBox: { x: 5, y: 5, width: 360, height: 200 }, children: [] } } } };
    const r = await pinBaseline(multi({ '9:100': csRaw, '7:200': alt }), mkdtempSync(join(tmpdir(), 'uiv-cs-')),
      { fileKey: 'F', nodeId: '9:100', testFqn: 'com.magpie.uiv.demo.CalibCardTest', demoDir: 'demo-android',
        explicitStates: [{ name: 'empty', judgePath: 'parity', figmaVariantNodeId: '7:200' }], now });
    expect(r.entry.states!.find((s) => s.name === 'empty')!.figmaVariantNodeId).toBe('7:200');
  });

  it('CS6 variantOption 无对应子节点 → WARN 不阻断', async () => {
    const csRaw = JSON.parse(readFileSync(csPath, 'utf8'));
    const clone = structuredClone(csRaw);
    clone.nodes['9:100'].document.children = clone.nodes['9:100'].document.children
      .filter((c: { id: string }) => c.id !== '9:101');
    const r = await pinBaseline(multi({ '9:100': clone }), mkdtempSync(join(tmpdir(), 'uiv-cs-')),
      { fileKey: 'F', nodeId: '9:100', testFqn: 'com.magpie.uiv.demo.CalibCardTest', demoDir: 'demo-android', now });
    expect(r.warnings).toEqual(['variantOption 未见对应子节点: Empty']);
  });
});

describe('re-persist 触发标记', () => {
  it('触发标记:scoped+.magpie/ 才写;standalone 不写', async () => {
    const root = mkdtempSync(join(tmpdir(), 'uiv-pin-'));
    mkdirSync(join(root, '.magpie'));
    mkdirSync(join(root, 'docs')); writeFileSync(join(root, 'docs/req.md'), 'PRD');
    const scoped = await pinBaseline(card(), root, { fileKey: 'F', nodeId: '1:100',
      testFqn: 'com.magpie.uiv.demo.CalibCardTest', demoDir: 'demo-android', sourceDoc: 'docs/req.md', now });
    expect(scoped.repersistRequested).toBe(true);
    const marker = JSON.parse(readFileSync(join(root, '.magpie/uiv-repersist.json'), 'utf8'));
    expect([marker.schemaVersion, marker.reason, marker.mappingPath]).toEqual([1, 'uiv-pin', '.ui-verify/mapping.json']);
    const standalone = await pinBaseline(card(), root, { fileKey: 'F', nodeId: '1:100',
      testFqn: 'com.magpie.uiv.demo.CalibCardTest', demoDir: 'demo-android', now });
    expect(standalone.repersistRequested).toBe(false);
  });
});
