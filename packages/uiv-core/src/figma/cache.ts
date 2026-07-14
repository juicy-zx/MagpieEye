import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteFileSync } from '../util/atomic.js';
import type { FigmaClient } from './client.js';

export class CachedFigmaClient implements FigmaClient {   // 口径 1
  readonly stats = { networkCalls: 0, cacheHits: 0 };
  constructor(private inner: FigmaClient, private dir: string) {}
  private file(k: string, n: string, v: string) {   // macOS 路径避 ':'
    return join(this.dir, `${k}__${n.replaceAll(':', '-')}@${v}.json`);
  }
  async getNodes(fileKey: string, nodeId: string, version?: string): Promise<unknown> {
    if (version !== undefined) {
      const p = this.file(fileKey, nodeId, version);
      if (existsSync(p)) { this.stats.cacheHits++; return JSON.parse(readFileSync(p, 'utf8')); }
    }
    this.stats.networkCalls++;
    const raw = await this.inner.getNodes(fileKey, nodeId, version);
    const v = version ?? (raw as { version?: string }).version;
    if (v) { mkdirSync(this.dir, { recursive: true }); atomicWriteFileSync(this.file(fileKey, nodeId, v), JSON.stringify(raw), 'utf8'); }
    return raw;
  }
  async getImages(fileKey: string, nodeIds: string[], scale: number): Promise<Record<string, string | null>> {
    this.stats.networkCalls++;
    return this.inner.getImages(fileKey, nodeIds, scale);
  }
  // T4.3:getMeta 恒直通不缓存 —— 哨兵语义是"问最新",缓存会使漂移检测永远读到陈旧答案。
  async getMeta(fileKey: string): Promise<unknown> {
    this.stats.networkCalls++;
    return this.inner.getMeta(fileKey);
  }
}
