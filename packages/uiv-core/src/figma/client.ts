/**
 * Figma 数据通道接口化(T1.2 Step 4)。
 * 生产实现(REST + PAT)留待 B1;fixture 模式驱动 Phase 0。
 * baseline.png 来源通道待 Codex 决断(pending-codex-decisions #B),此处只留接口。
 */
import { readFile } from 'node:fs/promises';
import { L2Error } from '../l2/types.js';

export interface FigmaClient {
  getNodes(fileKey: string, nodeId: string, version?: string): Promise<unknown>;   // GET /v1/files/:key/nodes 形状
  getImages(fileKey: string, nodeIds: string[], scale: number): Promise<Record<string, string | null>>;
  getMeta(fileKey: string): Promise<unknown>;   // T4.3:GET /v1/files/:key/meta 形状(设计稿漂移哨兵输入)
}

export class FigmaImageNullError extends Error {}

export function pickImageUrl(images: Record<string, string | null>, nodeId: string): string {
  const url = images[nodeId];
  if (url == null) throw new FigmaImageNullError(`images API returned null for ${nodeId} (render failed, retry later)`);
  return url;
}

export class FixtureFigmaClient implements FigmaClient {
  constructor(private fixturePath: string, private metaFixturePath?: string) {}
  async getNodes(): Promise<unknown> {
    return JSON.parse(await readFile(this.fixturePath, 'utf8'));
  }
  async getImages(): Promise<Record<string, string | null>> {
    return {};   // fixture 模式无 images 通道;baseline.png 走 MCP 落盘约定
  }
  /** T4.3:未配 metaFixturePath 而被调 → fixture_unavailable(B1 期 fixture 驱动的哨兵单测契约)。 */
  async getMeta(): Promise<unknown> {
    if (this.metaFixturePath === undefined) throw new L2Error('fixture_unavailable');
    return JSON.parse(await readFile(this.metaFixturePath, 'utf8'));
  }
}
