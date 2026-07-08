import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
    if (v) { mkdirSync(this.dir, { recursive: true }); writeFileSync(this.file(fileKey, nodeId, v), JSON.stringify(raw), 'utf8'); }
    return raw;
  }
  async getImages(fileKey: string, nodeIds: string[], scale: number): Promise<Record<string, string | null>> {
    this.stats.networkCalls++;
    return this.inner.getImages(fileKey, nodeIds, scale);
  }
}
