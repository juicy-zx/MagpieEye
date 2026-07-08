import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { pullBaseline } from '../baseline/pull.js';
import { CachedFigmaClient } from './cache.js';
import { FixtureFigmaClient } from './client.js';

it('【T2.4 验收】钉版本命中零网络+不串键;内循环 3 次 check 零请求', async () => {
  const c = new CachedFigmaClient(
    new FixtureFigmaClient(fileURLToPath(new URL('../../fixtures/rest-nodes-card.json', import.meta.url))),
    mkdtempSync(join(tmpdir(), 'uiv-c-')));
  await c.getNodes('F', '1:100', 'T1_0A_V1');
  await c.getNodes('F', '1:100', 'T1_0A_V1');
  expect(c.stats).toEqual({ networkCalls: 1, cacheHits: 1 });
  await c.getNodes('F', '1:100', 'V2');        // version 不同不串键
  expect(c.stats.networkCalls).toBe(2);
  const dir = mkdtempSync(join(tmpdir(), 'uiv-i-'));
  await pullBaseline(c, 'FKEY', '1:100', dir); // 预热(未钉,回填 version)
  const warm = c.stats.networkCalls;
  for (let i = 0; i < 3; i++) await pullBaseline(c, 'FKEY', '1:100', dir, 'T1_0A_V1');
  expect(c.stats.networkCalls).toBe(warm);     // 内循环 Figma 请求数=0
  expect(c.stats.cacheHits).toBe(4);
});
