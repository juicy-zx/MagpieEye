import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { attributeSource, enrichViolations } from './source-attr.js';
import type { Violation } from '../l2/types.js';

function setup(files: Record<string, string>): string {
  const demo = mkdtempSync(join(tmpdir(), 'uiv-srcattr-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(demo, 'app', 'src', 'main', rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
  }
  return demo;
}

const mkV = (over: Partial<Violation> = {}): Violation =>
  ({ judgePath: 'parity', testTag: 'fig:1:103', figmaName: 'S', property: 'color',
    expected: 'e', actual: 'a', severity: 'high', hint: 'h', ...over });

describe('attributeSource', () => {
  it('命中行号正确(demoDir 相对路径,posix 分隔)', () => {
    const demo = setup({ 'java/com/x/CalibCard.kt': 'package x\n\n// c\nModifier.testTag("fig:1:101")\n' });
    expect(attributeSource('fig:1:101', demo)).toBe('app/src/main/java/com/x/CalibCard.kt:4');
  });
  it('多文件命中取字典序首个', () => {
    const demo = setup({
      'java/com/x/Bravo.kt': 'x\ntestTag("fig:1:100")\n',
      'java/com/x/Alpha.kt': 'testTag("fig:1:100")\n',
    });
    expect(attributeSource('fig:1:100', demo)).toBe('app/src/main/java/com/x/Alpha.kt:1');
  });
  it('无命中 → null', () => {
    const demo = setup({ 'java/com/x/CalibCard.kt': 'testTag("fig:1:101")\n' });
    expect(attributeSource('fig:9:999', demo)).toBeNull();
  });
});

describe('enrichViolations', () => {
  it('逐条填 source,已有值不覆写', () => {
    const demo = setup({ 'java/com/x/CalibCard.kt': 'a\nb\ntestTag("fig:1:103")\n' });
    const vs = [mkV(), mkV({ testTag: 'fig:1:999', source: 'kept.kt:1' })];
    enrichViolations(vs, demo);
    expect(vs[0]!.source).toBe('app/src/main/java/com/x/CalibCard.kt:3');
    expect(vs[1]!.source).toBe('kept.kt:1');   // 已有值不覆写
  });
});
