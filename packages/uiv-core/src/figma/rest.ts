import type { FigmaClient } from './client.js';
import { QuotaBudgeter } from './quota.js';

export class FigmaPatMissingError extends Error {}
export type FetchFn = (url: string, init: { headers: Record<string, string> }) => Promise<{ status: number; json(): Promise<unknown> }>;
const BASE = 'https://api.figma.com';

export class RestFigmaClient implements FigmaClient {
  private pat: string; private fetchFn: FetchFn; private budget: QuotaBudgeter;
  constructor(o: { pat?: string; fetchFn?: FetchFn; budget?: QuotaBudgeter } = {}) {
    this.pat = o.pat ?? process.env.FIGMA_PAT ?? '';
    if (!this.pat) throw new FigmaPatMissingError('FIGMA_PAT 未设置(B1)');
    this.fetchFn = o.fetchFn ?? (fetch as unknown as FetchFn);
    this.budget = o.budget ?? new QuotaBudgeter();
  }
  private async get(p: string): Promise<unknown> {
    await this.budget.acquire();
    const res = await this.fetchFn(BASE + p, { headers: { 'X-Figma-Token': this.pat } });
    if (res.status !== 200) throw new Error(`figma REST ${res.status}: GET ${p}`);
    return res.json();
  }
  getNodes(fileKey: string, nodeId: string, version?: string): Promise<unknown> {
    return this.get(`/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}${version ? `&version=${encodeURIComponent(version)}` : ''}`);
  }
  async getImages(fileKey: string, nodeIds: string[], scale: number): Promise<Record<string, string | null>> {
    const raw = await this.get(`/v1/images/${fileKey}?ids=${encodeURIComponent(nodeIds.join(','))}&scale=${scale}&format=png&use_absolute_bounds=true`);
    return (raw as { images?: Record<string, string | null> }).images ?? {};
  }
  /** T4.3:设计稿漂移哨兵输入通道。 */
  getMeta(fileKey: string): Promise<unknown> {
    return this.get(`/v1/files/${fileKey}/meta`);
  }
}
