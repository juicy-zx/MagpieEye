import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { upsertMappingEntry, verifyMappingSig } from './mapping.js';
import type { MappingEntry } from './mapping.js';

const base: MappingEntry = { fileKey: 'F', nodeId: '1:100', version: 'V1', minScore: 0.9, matrix: 'l-shape',
  testFqn: 'com.magpie.uiv.demo.CalibCardTest', demoDir: 'demo-android' };
const scoped = (v: string): MappingEntry => ({ ...base, version: v,
  scope: { sourceDocumentPath: 'docs/req.md', sourceDocumentHash: 'aa', pinnedAt: '2026-07-09T00:00:00.000Z' } });

describe('mapping v2 受控写入', () => {
  it('主键含 scope.path;幂等 re-pin(version 替换);sig 受控/手改失配', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uiv-map-'));
    upsertMappingEntry(dir, base);
    upsertMappingEntry(dir, scoped('V1'));            // 同 nodeId 异 scope → 两条(D-02)
    const p = upsertMappingEntry(dir, scoped('V2'));  // 同键 re-pin → 替换
    const m = JSON.parse(readFileSync(p, 'utf8')) as MappingEntry[];
    expect([m.length, m[1]!.version]).toEqual([2, 'V2']);
    expect(verifyMappingSig(dir)).toBe(true);
    writeFileSync(p, readFileSync(p, 'utf8').replace('0.9', '0.1'));   // 模型手改 → T3.1b 不豁免
    expect(verifyMappingSig(dir)).toBe(false);
  });
});
