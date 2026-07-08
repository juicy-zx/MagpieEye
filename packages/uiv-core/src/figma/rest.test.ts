import { afterEach, expect, it, vi } from 'vitest';
import { QuotaBudgeter, QuotaExceededError } from './quota.js';
import { FigmaPatMissingError, RestFigmaClient, type FetchFn } from './rest.js';

function fakeFetch(body: unknown = {}) {
  const urls: string[] = []; let headers: Record<string, string> = {};
  const fn: FetchFn = async (u, i) => { urls.push(u); headers = i.headers; return { status: 200, json: async () => body }; };
  return { fn, urls, headers: () => headers };
}

afterEach(() => vi.unstubAllEnvs());
it('RestFigmaClient:URL/null 透传(C3)/env 兜底/PAT/预算接线', async () => {
  vi.stubEnv('FIGMA_PAT', 'ENV-PAT');
  const f = fakeFetch({ images: { '1:100': null } });
  const c = new RestFigmaClient({ fetchFn: f.fn });
  await c.getNodes('FKEY', '1:100', 'V9');
  expect(await c.getImages('FKEY', ['1:100', '1:101'], 2)).toEqual({ '1:100': null });
  expect(f.urls[0]).toBe('https://api.figma.com/v1/files/FKEY/nodes?ids=1%3A100&version=V9');
  expect(f.urls[1]).toContain('/v1/images/FKEY?ids=1%3A100%2C1%3A101&scale=2&format=png&use_absolute_bounds=true');
  expect(f.headers()).toEqual({ 'X-Figma-Token': 'ENV-PAT' });
  vi.stubEnv('FIGMA_PAT', '');
  expect(() => new RestFigmaClient({ fetchFn: f.fn })).toThrow(FigmaPatMissingError);
  const h = fakeFetch();
  const b = new RestFigmaClient({ pat: 'P', fetchFn: h.fn, budget: new QuotaBudgeter({ perMinute: 9, perDay: 1 }, () => 1e6) });
  await b.getNodes('F', '1:1');
  await expect(b.getNodes('F', '1:1')).rejects.toBeInstanceOf(QuotaExceededError);
  expect(h.urls).toHaveLength(1);   // 被拒不发请求
});
