import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { composeTriptych } from './triptych.js';

/** 纯色不透明 PNG(RGBA,A=255)。 */
function solid(path: string, w: number, h: number, r: number, g: number, b: number): void {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
  }
  writeFileSync(path, PNG.sync.write(png));
}
function px(png: PNG, x: number, y: number): [number, number, number] {
  const o = (y * png.width + x) * 4;
  return [png.data[o]!, png.data[o + 1]!, png.data[o + 2]!];
}

describe('composeTriptych(T4.2)', () => {
  it('横拼三图 + 8px gutter + 顶对齐底白填;尺寸/像素抽查/字节级确定性', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uiv-triptych-'));
    const b = join(dir, 'b.png'); const r = join(dir, 'r.png'); const d = join(dir, 'd.png');
    solid(b, 4, 6, 255, 0, 0);   // 红 4×6
    solid(r, 4, 4, 0, 255, 0);   // 绿 4×4
    solid(d, 6, 5, 0, 0, 255);   // 蓝 6×5
    const out = join(dir, 'trip.png');
    const res = composeTriptych(b, r, d, out);
    expect(existsSync(out)).toBe(true);
    expect(res).toEqual({ path: out, width: 30, height: 6 });   // 4+4+6 + 2×8 gutter;h=max(6,4,5)

    const png = PNG.sync.read(readFileSync(out));
    expect(px(png, 0, 0)).toEqual([255, 0, 0]);        // baseline 红(x=0)
    expect(px(png, 12, 0)).toEqual([0, 255, 0]);       // rendered 绿(x=4+8)
    expect(px(png, 24, 0)).toEqual([0, 0, 255]);       // diff 蓝(x=4+4+16)
    expect(px(png, 12, 5)).toEqual([255, 255, 255]);   // 绿图仅高 4,y=5 补白
    expect(px(png, 5, 0)).toEqual([255, 255, 255]);    // baseline 与 rendered 间 gutter 白

    // 确定性:同输入两次产物字节级一致
    const out2 = join(dir, 'trip2.png');
    composeTriptych(b, r, d, out2);
    expect(readFileSync(out2).equals(readFileSync(out))).toBe(true);
  });
});
