import { describe, it, expect } from 'vitest';
import { samplePixelColor } from './sampler.js';

function mkPng(w: number, h: number, at: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = at(x, y); const i = (y * w + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return { width: w, height: h, data };
}
const B = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe('samplePixelColor:内缩安全区中位色', () => {
  it('纯色区命中;inset 默认 0.2(50×50→30×30)可配', () => {
    const png = mkPng(100, 100, () => [0x33, 0x66, 0x99]);
    expect(samplePixelColor(png, B(10, 10, 50, 50))).toEqual({ hex: '#336699', sampledPixels: 900 });
    expect(samplePixelColor(png, B(10, 10, 50, 50), { insetRatio: 0.4 })?.sampledPixels).toBe(100);
  });
  it('红边框被内缩排除采到内部绿;渐变取中位可复现', () => {
    const bordered = mkPng(40, 40, (x, y) => (x < 4 || y < 4 || x >= 36 || y >= 36 ? [255, 0, 0] : [0, 255, 0]));
    expect(samplePixelColor(bordered, B(0, 0, 40, 40))?.hex).toBe('#00FF00');
    const grad = mkPng(100, 20, (x) => [x, 0, 0]);
    expect(samplePixelColor(grad, B(0, 0, 100, 20))?.hex).toBe('#310000'); // x∈[20,80) 下中位 r=49
  });
  it('越界防御:全越界→null;部分越界 clamp 采样', () => {
    const png = mkPng(100, 100, () => [10, 20, 30]);
    expect(samplePixelColor(png, B(90, 90, 50, 50))).toBeNull();
    expect(samplePixelColor(png, B(-20, -20, 60, 60))?.hex).toBe('#0A141E');
  });
});
