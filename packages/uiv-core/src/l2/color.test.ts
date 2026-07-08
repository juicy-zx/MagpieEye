import { describe, it, expect } from 'vitest';
import { labDeltaE, ciede2000 } from './color.js';

// Sharma 2005 CIEDE2000 标准测例(kL=kC=kH=1,sRGB→Lab 用 D65)。
describe('CIEDE2000 色差', () => {
  it('labDeltaE 例1 → 2.0425', () =>
    expect(labDeltaE([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 3));
  it('labDeltaE 例3 → 3.4412', () =>
    expect(labDeltaE([50, 2.8361, -74.0200], [50, 0, -82.7485])).toBeCloseTo(3.4412, 3));
  it('同色 ΔE = 0', () => expect(ciede2000('#FF6633', '#FF6633')).toBeCloseTo(0, 5));
  it('黑白 ΔE ≈ 100(±0.5)', () => expect(ciede2000('#000000', '#FFFFFF')).toBeCloseTo(100, 0));
});
