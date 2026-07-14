import { describe, expect, it } from 'vitest';
import { FAST_LANE_PREVIEWS, isFastLaneEnabled } from './fastlane.js';

const PREVIEW = 'com.magpie.uiv.demo.CalibCardPreview';

describe('P0-1 alpha:快车道 daemon/worker 代码级硬禁用(isFastLaneEnabled 恒 false)', () => {
  it('白名单常量仍保留 CalibCardPreview(P1 复活用)', () => {
    expect(FAST_LANE_PREVIEWS.has(PREVIEW)).toBe(true);
  });
  it('白名单内 preview 亦恒不进 fast lane —— 无逃生开关(任何 UIV_FASTLANE 值均不放行)', () => {
    expect(isFastLaneEnabled(PREVIEW, {})).toBe(false);
    expect(isFastLaneEnabled(PREVIEW, { UIV_FASTLANE: '1' })).toBe(false);
    expect(isFastLaneEnabled(PREVIEW, { UIV_FASTLANE: '0' })).toBe(false);
  });
  it('白名单外 preview 恒不进 fast lane', () => {
    expect(isFastLaneEnabled('com.magpie.uiv.demo.OtherPreview', {})).toBe(false);
    expect(isFastLaneEnabled('com.magpie.uiv.demo.OtherPreview', { UIV_FASTLANE: '0' })).toBe(false);
  });
});
