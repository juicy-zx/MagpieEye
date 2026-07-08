/** T2.7(D-04):boundsPx 各边内缩 insetRatio 后与 PNG 交集,取 RGB 通道中位(偶数取下中位);null=交集空。 */
import type { Box } from './types.js';

export const DEFAULT_INSET_RATIO = 0.2;
export interface DecodedPng { width: number; height: number; data: Uint8Array }

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[(values.length - 1) >> 1] as number;
}

export function samplePixelColor(
  png: DecodedPng, boundsPx: Box, options?: { insetRatio?: number },
): { hex: string; sampledPixels: number } | null {
  const inset = options?.insetRatio ?? DEFAULT_INSET_RATIO;
  const x0 = Math.max(0, Math.round(boundsPx.x + boundsPx.width * inset));
  const y0 = Math.max(0, Math.round(boundsPx.y + boundsPx.height * inset));
  const x1 = Math.min(png.width, Math.round(boundsPx.x + boundsPx.width * (1 - inset)));
  const y1 = Math.min(png.height, Math.round(boundsPx.y + boundsPx.height * (1 - inset)));
  if (x1 <= x0 || y1 <= y0) return null;
  const rs: number[] = []; const gs: number[] = []; const bs: number[] = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * png.width + x) * 4;
    rs.push(png.data[i] as number); gs.push(png.data[i + 1] as number); bs.push(png.data[i + 2] as number);
  }
  const h = (v: number): string => v.toString(16).padStart(2, '0').toUpperCase();
  return { hex: `#${h(median(rs))}${h(median(gs))}${h(median(bs))}`, sampledPixels: rs.length };
}
