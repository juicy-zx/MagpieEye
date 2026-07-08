import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { beforeAll, describe, it, expect } from 'vitest';
import { runL1 } from './engine.js';
import { addIgnoreRegion, loadIgnoreRegions } from './ignore.js';

let dir: string;
let basePng: string;
let samePng: string;
let diffPng: string;

/** 生成 64×64 纯白 PNG;withRedBlock 时左上 16×16 涂红。 */
function writeTestPng(path: string, withRedBlock: boolean): void {
  const png = new PNG({ width: 64, height: 64 });
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const o = (y * 64 + x) * 4;
      const red = withRedBlock && x < 16 && y < 16;
      png.data[o] = 255;
      png.data[o + 1] = red ? 0 : 255;
      png.data[o + 2] = red ? 0 : 255;
      png.data[o + 3] = 255;
    }
  }
  writeFileSync(path, PNG.sync.write(png));
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'uiv-l1-'));
  basePng = join(dir, 'base.png');
  samePng = join(dir, 'same.png');
  diffPng = join(dir, 'diff.png');
  writeTestPng(basePng, false);
  writeTestPng(samePng, false);
  writeTestPng(diffPng, true);
});

describe('L1 engine (odiff + looks-same)', () => {
  it('相同图: diffCount=0 且无簇', async () => {
    const r = await runL1(basePng, samePng, join(dir, 'out-same.png'), []);
    expect(r.diffCount).toBe(0);
    expect(r.clusters.length).toBe(0);
  });
  it('不同图: 指标非零且首簇与差异区相交', async () => {
    const r = await runL1(basePng, diffPng, join(dir, 'out-diff.png'), []);
    expect(r.diffCount).toBeGreaterThan(0);
    expect(r.diffRatio).toBeGreaterThan(0);
    expect(r.clusters.length).toBeGreaterThanOrEqual(1);
    const c = r.clusters[0];
    // 与 (0,0,16,16) 相交
    expect(c.x < 16 && c.y < 16 && c.x + c.w > 0 && c.y + c.h > 0).toBe(true);
  });
  it('ignore 区域覆盖差异区: odiff 指标归零(looks-same 簇仍报,属 advisory)', async () => {
    const r = await runL1(basePng, diffPng, join(dir, 'out-ignored.png'), [{ x: 0, y: 0, w: 16, h: 16 }]);
    expect(r.diffCount).toBe(0);
  });
});

describe('ignore-regions 持久化', () => {
  it('addIgnoreRegion 两次 → loadIgnoreRegions 返回两条且 JSON 文件存在', () => {
    const uiVerifyDir = mkdtempSync(join(tmpdir(), 'uiv-ignore-'));
    addIgnoreRegion(uiVerifyDir, '1:100', { x: 0, y: 0, w: 16, h: 16 });
    addIgnoreRegion(uiVerifyDir, '1:100', { x: 32, y: 32, w: 8, h: 8 });
    const regions = loadIgnoreRegions(uiVerifyDir, '1:100');
    expect(regions).toHaveLength(2);
    expect(regions[1]).toEqual({ x: 32, y: 32, w: 8, h: 8 });
    expect(existsSync(join(uiVerifyDir, 'ignore-regions.json'))).toBe(true);
  });
  it('文件不存在时 loadIgnoreRegions 返回空表', () => {
    const uiVerifyDir = mkdtempSync(join(tmpdir(), 'uiv-ignore-empty-'));
    expect(loadIgnoreRegions(uiVerifyDir, '1:100')).toEqual([]);
  });
});
