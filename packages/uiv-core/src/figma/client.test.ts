import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { FigmaImageNullError, FixtureFigmaClient, pickImageUrl } from './client.js';
import { normalizeNodesResponse } from './normalize.js';

const fixturePath = fileURLToPath(new URL('../../fixtures/rest-nodes-card.json', import.meta.url));

describe('FigmaClient (fixture mode)', () => {
  it('FixtureFigmaClient.getNodes() 返回值可被 normalizeNodesResponse 消化', async () => {
    const client = new FixtureFigmaClient(fixturePath);
    const raw = await client.getNodes('FKEY', '1:100');
    const spec = normalizeNodesResponse(raw, 'FKEY', '1:100');
    expect(spec.version).toBe('T1_0A_V1');
  });
  it('pickImageUrl 命中返回 url', () => {
    expect(pickImageUrl({ '1:100': 'https://x/y.png' }, '1:100')).toBe('https://x/y.png');
  });
  it('C3-6 images 返回 null 时抛 FigmaImageNullError 且 message 含 nodeId', () => {
    expect(() => pickImageUrl({ '1:100': null }, '1:100')).toThrow(FigmaImageNullError);
    expect(() => pickImageUrl({ '1:100': null }, '1:100')).toThrow(/1:100/);
  });
});
