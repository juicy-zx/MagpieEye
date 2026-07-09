import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { FixtureFigmaClient } from '../figma/client.js';
import { pinBaseline, variantStateName, PinScopeError } from './pin.js';

const cardPath = fileURLToPath(new URL('../../fixtures/rest-nodes-card.json', import.meta.url));
const card = (): FixtureFigmaClient => new FixtureFigmaClient(cardPath);
const now = (): Date => new Date('2026-07-09T00:00:00Z');

describe('pinBaseline standalone/scope/幂等', () => {
  it('standalone:无 scope 无标记;基准落盘', async () => {
    const root = mkdtempSync(join(tmpdir(), 'uiv-pin-'));
    const r = await pinBaseline(card(), root, { fileKey: 'F', nodeId: '1:100',
      testFqn: 'com.magpie.uiv.demo.CalibCardTest', demoDir: 'demo-android', now });
    expect(r.entry).toEqual({ fileKey: 'F', nodeId: '1:100', version: 'T1_0A_V1', minScore: 0.9, matrix: 'l-shape',
      testFqn: 'com.magpie.uiv.demo.CalibCardTest', demoDir: 'demo-android' });
    expect(r.repersistRequested).toBe(false);
    expect(existsSync(join(root, '.ui-verify/baselines/1-100@T1_0A_V1/spec.json'))).toBe(true);
  });

  it('scoped:三字段(hash=源文档字节 sha1)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'uiv-pin-'));
    mkdirSync(join(root, 'docs')); writeFileSync(join(root, 'docs/req.md'), 'PRD');
    const r = await pinBaseline(card(), root, { fileKey: 'F', nodeId: '1:100',
      testFqn: 'com.magpie.uiv.demo.CalibCardTest', demoDir: 'demo-android', sourceDoc: 'docs/req.md', now, minScore: 0.95 });
    expect(r.entry.scope).toEqual({ sourceDocumentPath: 'docs/req.md',
      sourceDocumentHash: createHash('sha1').update('PRD').digest('hex'),
      pinnedAt: '2026-07-09T00:00:00.000Z' });
    expect(r.entry.minScore).toBe(0.95);
  });

  it('scope fail-fast:源文档不存在/越界工作区 均 rejects PinScopeError', async () => {
    const root = mkdtempSync(join(tmpdir(), 'uiv-pin-'));
    const opt = (sourceDoc: string) => ({ fileKey: 'F', nodeId: '1:100',
      testFqn: 'com.magpie.uiv.demo.CalibCardTest', demoDir: 'demo-android', sourceDoc, now });
    await expect(pinBaseline(card(), root, opt('nope.md'))).rejects.toBeInstanceOf(PinScopeError);
    await expect(pinBaseline(card(), root, opt('../esc.md'))).rejects.toBeInstanceOf(PinScopeError);
  });
});
