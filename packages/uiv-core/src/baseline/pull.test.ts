import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { FixtureFigmaClient } from '../figma/client.js';
import { baselineDirName, pullBaseline } from './pull.js';

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
