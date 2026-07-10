/**
 * T4.4 commit2:XML/View producer → L2-invariant 全链(跨语言:ViewDumpRule 真 dump → runInvariants)。
 * 引擎零改;本文件只新增测试、只读被测源。fixture 为 demo-android Robolectric 真 measure+layout 产物。
 *   - D1 CS2 textOverflow:NATIVE hard-gate,遍历所有行(含多行末行 ellipsis),非 TextView null 不承重。
 *   - Codex 追加:clickable=true + touchBoundsInRoot=null 归一化(touchTarget 跳过;missingCd 承重)。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { runInvariants } from './invariant.js';
import type { SemanticsDump, Violation } from './types.js';

const F = (name: string): SemanticsDump =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../fixtures/xml/${name}`, import.meta.url)), 'utf8')) as SemanticsDump;
const props = (vs: Violation[]): string[] => vs.map((v) => v.property);

describe('T4.4 commit2:CS2 textOverflow(真 TextView measure+layout → dump → invariant,NATIVE hard-gate)', () => {
  it('overflow 正例(单行 ellipsis)→ textOverflow high 违规(hard violation,非 advisory)', () => {
    const r = runInvariants(F('cs2-overflow-positive.semantics.json'));
    expect(props(r.violations)).toEqual(['textOverflow']);
    expect(r.violations[0]?.severity).toBe('high');
    expect(r.advisories).toEqual([]);         // NATIVE:硬门,不降级 advisory
    expect(r.executed).toBe(1);
  });

  it('non-overflow 负例 → 无违规(hasVisualOverflow=false 执行但不产)', () => {
    const r = runInvariants(F('cs2-overflow-negative.semantics.json'));
    expect(r.violations).toEqual([]);
    expect(r.executed).toBe(1);               // 执行了 textOverflow 门(值可得),只是未触发
  });

  it('多行末行 ellipsis → textOverflow high(证明遍历所有行:第 0 行无 ellipsis 仍检出)', () => {
    const dump = F('cs2-overflow-multiline.semantics.json');
    expect(dump.root.hasVisualOverflow).toBe(true);   // ViewDumpRule 已遍历所有行写入 true
    const r = runInvariants(dump);
    expect(props(r.violations)).toEqual(['textOverflow']);
    expect(r.violations[0]?.severity).toBe('high');
  });

  it('NATIVE hard-gate 绑定:同 overflow dump 切非 NATIVE → 降级 advisory(不产 violation)', () => {
    const dump = { ...F('cs2-overflow-positive.semantics.json'), graphicsMode: 'LEGACY' };
    const r = runInvariants(dump);
    expect(r.violations).toEqual([]);
    expect(r.advisories.map((a) => a.property)).toEqual(['textOverflow']);
  });
});

describe('T4.4 commit2:clickable=true + touchBoundsInRoot=null 全链(Codex 追加,真 XML inflate → dump → invariant)', () => {
  it('矩阵:touchBounds 全 null → touchTarget 门对全部 clickable 跳过;missingCd 仅无可及名者承重', () => {
    const r = runInvariants(F('clickable-matrix.semantics.json'));
    // 唯一违规 = c2(clickable 无文本无 cd);c1(子文本形成有效名)/c3(合法 cd)不产。
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0]?.property).toBe('missingContentDescription');
    expect(r.violations[0]?.testTag).toBe('fig:cm:c2-clickable-no-name');
    expect(r.violations[0]?.severity).toBe('high');
    // touchTargetTooSmall 全程不产(touchBounds 缺席 → 门跳过,不伪填视觉盒当真)。
    expect(props(r.violations)).not.toContain('touchTargetTooSmall');
  });

  it('touchTarget null 契约:任一 clickable 节点 touchBoundsInRoot=null 均不触 touchTargetTooSmall', () => {
    const dump = F('clickable-matrix.semantics.json');
    const clickableTags: string[] = [];
    const walk = (n: { testTag: string | null; clickable?: boolean; touchBoundsInRoot?: unknown; children: unknown[] }): void => {
      if (n.clickable === true) {
        clickableTags.push(n.testTag ?? '(sem)');
        expect(n.touchBoundsInRoot).toBeNull();   // ViewDumpRule 诚实缺席(显式 null)
      }
      for (const c of n.children as typeof n[]) walk(c);
    };
    walk(dump.root as never);
    expect(clickableTags).toHaveLength(3);        // 3 个真实 clickable 节点全覆盖
    const r = runInvariants(dump);
    expect(props(r.violations)).not.toContain('touchTargetTooSmall');
  });
});

describe('T4.4 commit2 R1:受控父裁剪 child 负例(boundsInRoot 让 childClipped 真产 violation,非仅加 executed)', () => {
  it('裁剪态:fig:clip:child 的 boundsInRoot < unclipped(被父裁)→ childClipped high 违规', () => {
    const r = runInvariants(F('clip-child-violation.semantics.json'));
    const cc = r.violations.filter((v) => v.property === 'childClipped');
    expect(cc).toHaveLength(1);
    expect(cc[0]?.testTag).toBe('fig:clip:child');
    expect(cc[0]?.severity).toBe('high');
  });

  it('移除裁剪:child 的 boundsInRoot==unclipped → childClipped 门执行但违规消失(证违规由裁剪产生,非环境噪声)', () => {
    const r = runInvariants(F('clip-child-resolved.semantics.json'));
    expect(props(r.violations)).not.toContain('childClipped');
    expect(r.violations).toEqual([]);
    expect(r.executed).toBe(1);   // childClipped 门仍执行(有 boundsInRoot),只是不触发
  });
});
