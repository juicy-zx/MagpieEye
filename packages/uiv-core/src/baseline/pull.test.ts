import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { FixtureFigmaClient } from '../figma/client.js';
import { baselineDirName, pullBaseline, stateJudgePath } from './pull.js';
import { L2Error } from '../l2/types.js';
import type { MappingEntry, MappingStateRef } from './mapping.js';

const fixturePath = fileURLToPath(new URL('../../fixtures/rest-nodes-card.json', import.meta.url));

function newClient(): FixtureFigmaClient {
  return new FixtureFigmaClient(fixturePath);
}

describe('baselineDirName', () => {
  it("nodeId 的 ':' 换 '-',拼 @version(macOS 路径避 ':')", () => {
    expect(baselineDirName('1:100', 'T1_0A_V1')).toBe('1-100@T1_0A_V1');
  });
});

describe('pullBaseline (fixture mode)', () => {
  it('spec.json 落盘且内容为 re-base 后的 spec', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'uiv-pull-'));
    const r = await pullBaseline(newClient(), 'FKEY', '1:100', dir);
    const spec = JSON.parse(readFileSync(r.specPath, 'utf8'));
    expect(spec.root.bbox.w).toBe(360);
  });
  it('基准目录名为 1-100@T1_0A_V1', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'uiv-pull-'));
    const r = await pullBaseline(newClient(), 'FKEY', '1:100', dir);
    expect(basename(dirname(r.specPath))).toBe('1-100@T1_0A_V1');
  });
  it('baseline.png 未落盘时 baselinePngExists=false(只探测不阻断)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'uiv-pull-'));
    const r = await pullBaseline(newClient(), 'FKEY', '1:100', dir);
    expect(r.baselinePngExists).toBe(false);
    expect(basename(r.baselinePngPath)).toBe('baseline.png');
  });
  it('mapping.json upsert 条目,重复 pull 不产生重复条目', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'uiv-pull-'));
    await pullBaseline(newClient(), 'FKEY', '1:100', dir);
    const r2 = await pullBaseline(newClient(), 'FKEY', '1:100', dir);
    const mapping = JSON.parse(readFileSync(r2.mappingPath, 'utf8'));
    expect(mapping).toHaveLength(1);
    expect(mapping[0]).toEqual({
      fileKey: 'FKEY', nodeId: '1:100', version: 'T1_0A_V1', minScore: 0.9, matrix: 'default5',
    });
  });
});

// T3.4:states[] 路由读取器(跨章契约第 5 条),运行期不猜,未声明/parity 缺 variant 即抛。
describe('stateJudgePath(states[] 路由)', () => {
  const entry = (states?: MappingStateRef[]): MappingEntry =>
    ({ fileKey: 'FKEY', nodeId: '1:100', version: 'V1', minScore: 0.9, matrix: 'default5', ...(states ? { states } : {}) });

  it('未声明该 state 名 → 抛 L2Error(figma_spec_invalid)', () => {
    expect(() => stateJudgePath(entry([{ name: 'typical', judgePath: 'invariant-only' }]), 'rtl')).toThrow(L2Error);
    try { stateJudgePath(entry(), 'rtl'); } catch (e) { expect((e as L2Error).subReason).toBe('figma_spec_invalid'); }
  });
  it('声明 parity 却缺 figmaVariantNodeId → 抛 L2Error(figma_spec_invalid)', () => {
    expect(() => stateJudgePath(entry([{ name: 'hover', judgePath: 'parity' }]), 'hover')).toThrow(L2Error);
    try { stateJudgePath(entry([{ name: 'hover', judgePath: 'parity' }]), 'hover'); }
    catch (e) { expect((e as L2Error).subReason).toBe('figma_spec_invalid'); }
  });
  it('合法声明原样返回(invariant-only 无需 variant;parity 带 variant)', () => {
    const ref: MappingStateRef = { name: 'rtl', judgePath: 'invariant-only' };
    expect(stateJudgePath(entry([ref]), 'rtl')).toEqual(ref);
    const pref: MappingStateRef = { name: 'hover', judgePath: 'parity', figmaVariantNodeId: '2:200' };
    expect(stateJudgePath(entry([pref]), 'hover')).toEqual(pref);
  });
});
