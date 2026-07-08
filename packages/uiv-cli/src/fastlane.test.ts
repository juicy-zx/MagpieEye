import { describe, expect, it } from 'vitest';
import { FAST_LANE_PREVIEWS, isFastLaneEnabled } from './fastlane.js';

const PREVIEW = 'com.magpie.uiv.demo.CalibCardPreview';

describe('T2.1(D-07): UIV_FASTLANE=0 强制慢车道(测量脚本确定性隔离,防 T2.8 fastlane 污染 P50 采样)', () => {
  it('白名单常量含 CalibCardPreview', () => {
    expect(FAST_LANE_PREVIEWS.has(PREVIEW)).toBe(true);
  });
  it('默认(未设置开关)白名单 preview 可进 fast lane', () => {
    expect(isFastLaneEnabled(PREVIEW, {})).toBe(true);
  });
  it('UIV_FASTLANE=0 时白名单 preview 强制不进 fast lane(lane 必为 slow/cold 系)', () => {
    expect(isFastLaneEnabled(PREVIEW, { UIV_FASTLANE: '0' })).toBe(false);
  });
  it('UIV_FASTLANE 为其他值(非字面量 "0")不影响白名单 preview 进 fast lane', () => {
    expect(isFastLaneEnabled(PREVIEW, { UIV_FASTLANE: '1' })).toBe(true);
  });
  it('白名单外 preview 恒不进 fast lane,与开关无关', () => {
    expect(isFastLaneEnabled('com.magpie.uiv.demo.OtherPreview', {})).toBe(false);
    expect(isFastLaneEnabled('com.magpie.uiv.demo.OtherPreview', { UIV_FASTLANE: '0' })).toBe(false);
  });
});
