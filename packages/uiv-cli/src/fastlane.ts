/**
 * T2.8 快车道白名单 + D-07 测量开关(适用的静态 @Preview 白名单,Codex D-05 定位钉死:
 * 仅静态 @Preview 组件级加速)。worker 目前钉死 CalibCardPreview;名单外一律慢车道 lane='slow'。
 * UIV_FASTLANE=0 强制跳过 fast lane 直走慢车道:供 T2.1 测量脚本确定性隔离 P50 采样,
 * 防 daemon 已托管 worker 时 fast lane 抢跑短路 gradle,污染热路径耗时(T2.8 fastlane 污染)。
 */
export const FAST_LANE_PREVIEWS = new Set<string>(['com.magpie.uiv.demo.CalibCardPreview']);

/**
 * P0-1 alpha:冷路径沙箱为唯一交付。daemon 托管的快车道 worker 尚未纳入沙箱,代码级硬禁用
 * (无逃生开关)—— 恒 false,令 commands.ts 中 renderPreviewViaDaemon 分支永不进入。
 * 白名单常量 FAST_LANE_PREVIEWS / UIV_FASTLANE 语义保留,待 P1 daemon 沙箱化后复活本函数逻辑。
 */
export function isFastLaneEnabled(_previewFqn: string, _env: NodeJS.ProcessEnv = process.env): boolean {
  return false;
}
