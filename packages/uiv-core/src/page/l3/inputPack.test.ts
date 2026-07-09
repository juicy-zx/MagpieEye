import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { buildL3InputPack } from './inputPack.js';
import type { L3Candidate } from './inputPack.js';
import { RUBRIC_ITEMS } from './types.js';

function writePng(path: string, w = 8, h = 8): void {
  const png = new PNG({ width: w, height: h });
  png.data.fill(255);
  writeFileSync(path, PNG.sync.write(png));
}

const NODE_ID = '1:100';
const VERSION = 'T1_0A_V1';
const NODE_DIR = '1-100@T1_0A_V1';

/** 三路径齐全的合格候选(baseline/render/diff 真实落盘)。 */
function qualified(dir: string, cellId: string): L3Candidate {
  const base = join(dir, `${cellId}-baseline.png`);
  const render = join(dir, `${cellId}-render.png`);
  const diff = join(dir, `${cellId}-diff.png`);
  writePng(base); writePng(render); writePng(diff);
  return {
    cellId, state: 'typical', assertionScope: 'full',
    artifacts: { baseline: base, render, diff },
    pixel: { diffRatio: 0.15, clusters: [{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 8, h: 8 }] },
  };
}

describe('buildL3InputPack(T4.2)', () => {
  it('合格格过滤 + rubric 7 项固定序 + triptych 落盘 + l3-input.json schema', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uiv-l3pack-'));
    const reportsRoot = join(dir, 'reports');
    const cellA = qualified(dir, 'base__typical');
    // cellB:baseline/render 在,diff 指向不存在文件(模拟 odiff match 不落盘 / L1 advisory 失败)
    const bBase = join(dir, 'b-baseline.png'); const bRender = join(dir, 'b-render.png');
    writePng(bBase); writePng(bRender);
    const cellB: L3Candidate = {
      cellId: 'pixel5-dark__typical', state: 'typical', assertionScope: 'geometry-only',
      artifacts: { baseline: bBase, render: bRender, diff: join(dir, 'nope-diff.png') },
      pixel: { diffRatio: 0, clusters: [] },
    };
    const res = buildL3InputPack([cellA, cellB], NODE_DIR, reportsRoot, NODE_ID, VERSION);
    expect(res).not.toBeNull();
    const { pack, packPath } = res!;

    // 只收 cellA(cellB diff 不 existsSync)
    expect(pack.cells.map((c) => c.cellId)).toEqual(['base__typical']);
    expect(pack.cells[0]!.clusters).toHaveLength(2);
    expect(pack.cells[0]!.diffRatio).toBe(0.15);

    // l3-input.json 落盘 + schema
    expect(packPath).toBe(join(reportsRoot, NODE_DIR, 'l3', 'l3-input.json'));
    expect(existsSync(packPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(packPath, 'utf8'));
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.kind).toBe('l3-input');
    expect(parsed.nodeId).toBe(NODE_ID);
    expect(parsed.version).toBe(VERSION);

    // triptych 落盘且 cell.triptychPath 指向它
    const tPath = join(reportsRoot, NODE_DIR, 'l3', 'triptych-base__typical.png');
    expect(existsSync(tPath)).toBe(true);
    expect(pack.cells[0]!.triptychPath).toBe(tPath);

    // rubric 严格 7 项、序=RUBRIC_ITEMS、每条以 '<item>:' 前缀
    expect(pack.rubric).toHaveLength(7);
    pack.rubric.forEach((line, i) => expect(line.startsWith(`${RUBRIC_ITEMS[i]}:`)).toBe(true));

    // verdictContract 含 '仅建议' 与 'evidence'
    expect(pack.verdictContract).toContain('仅建议');
    expect(pack.verdictContract).toContain('evidence');
  });

  it('零合格格(diff 全缺)→ 返回 null 且 l3/ 目录不创建', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uiv-l3pack-empty-'));
    const reportsRoot = join(dir, 'reports');
    const cellB: L3Candidate = {
      cellId: 'base__typical', state: 'typical', assertionScope: 'full',
      artifacts: { baseline: null, render: null, diff: null }, pixel: null,
    };
    const res = buildL3InputPack([cellB], NODE_DIR, reportsRoot, NODE_ID, VERSION);
    expect(res).toBeNull();
    expect(existsSync(join(reportsRoot, NODE_DIR, 'l3'))).toBe(false);
  });
});
