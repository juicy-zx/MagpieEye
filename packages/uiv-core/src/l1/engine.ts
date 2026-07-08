/**
 * L1 像素比对引擎(T1.2 Step 6):odiff 双指标 + looks-same 聚类。
 * 严格 advisory——结果只进 report.json 的 pixel 字段,不参与 pass 判定(设计文档 2.5 节)。
 * 注意:ignoreRegions 只作用于 odiff 指标;looks-same 聚类不感知 ignore,簇照报(同属 advisory)。
 */
import { compare } from 'odiff-bin';
import looksSame from 'looks-same';
import type { PixelResult } from '../report/v0.js';

export interface IgnoreRegion { x: number; y: number; w: number; h: number }

export async function runL1(baselinePng: string, renderedPng: string, diffOut: string,
                            ignore: IgnoreRegion[]): Promise<PixelResult> {
  const r = await compare(baselinePng, renderedPng, diffOut, {
    threshold: 0.063, antialiasing: true,
    // odiff-bin 会把空数组序列化成非法 `--ignore=`(CLI 报 Invalid ignore regions format),仅非空时传
    ...(ignore.length > 0
      ? { ignoreRegions: ignore.map(g => ({ x1: g.x, y1: g.y, x2: g.x + g.w, y2: g.y + g.h })) }
      : {}),
  });
  const diffCount = r.match ? 0 : (r as { diffCount: number }).diffCount;
  const diffRatio = r.match ? 0 : (r as { diffPercentage: number }).diffPercentage / 100;
  const ls = await looksSame(baselinePng, renderedPng, { shouldCluster: true, clustersSize: 10 });
  // 相同图时 looks-same 仍返回一个坐标全 null 的占位簇,须剔除
  const clusters = ls.equal ? [] : (ls.diffClusters ?? [])
    .filter(c => c.left != null && c.top != null && c.right != null && c.bottom != null)
    .map(c => ({ x: c.left, y: c.top, w: c.right - c.left + 1, h: c.bottom - c.top + 1 }));
  return { diffRatio, diffCount, clusters };
}
