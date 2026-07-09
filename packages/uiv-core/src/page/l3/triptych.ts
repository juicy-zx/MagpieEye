/**
 * T4.2:L3 三联图拼接(设计文档 2.7,轻量形态素材)。
 * 横拼 基准|渲染|diff,gutter 8px 白(#FFFFFF 不透明),顶对齐,矮图底部白填。pngjs sync API,确定性。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';

export interface TriptychResult { path: string; width: number; height: number }

const GUTTER = 8;

export function composeTriptych(baselinePng: string, renderedPng: string,
                                diffPng: string, outPath: string): TriptychResult {
  const b = PNG.sync.read(readFileSync(baselinePng));
  const r = PNG.sync.read(readFileSync(renderedPng));
  const d = PNG.sync.read(readFileSync(diffPng));
  const width = b.width + r.width + d.width + GUTTER * 2;
  const height = Math.max(b.height, r.height, d.height);

  const canvas = new PNG({ width, height });
  canvas.data.fill(255);   // 全白不透明底(gutter 白 + 矮图底部白填)
  PNG.bitblt(b, canvas, 0, 0, b.width, b.height, 0, 0);
  PNG.bitblt(r, canvas, 0, 0, r.width, r.height, b.width + GUTTER, 0);
  PNG.bitblt(d, canvas, 0, 0, d.width, d.height, b.width + r.width + GUTTER * 2, 0);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, PNG.sync.write(canvas));
  return { path: outPath, width, height };
}
