/**
 * yanhao HashtagPanel 真实基线回归(L2 派生断言缺陷修复的常驻锚点)。
 * fixture 来源(已固化进 packages/uiv-core/fixtures/,不依赖 gitignored .ui-verify/):
 *   fileKey hH7NUAlm9DsLRaGScQP0Z1 / node 39:10844 / version 2342874355766877359
 *   semantics = 真实 Robolectric 渲染语义树快照;spec = 同版本 Figma REST 归一化基线;
 *   rendered.png = 同轮真实渲染产物(喂像素通道,与 uiv check 端到端同构)。
 * 修复前(缺陷态)该组输入产 5 条 medium 假违规(padding×2 + itemSpacing×3,score 0.942857,executed 35):
 *   语义树拍平未挂 tag 的中间容器/INSTANCE,直接子节点派生几何失真 + itemSpacing 恒按 y 轴。
 * 修复后(Codex D1 A′+B1+B2 / D2 / D4 / R1-① 口径):
 *   派生断言仅在语义↔Figma 可见直接子节点身份双射 + 设计侧可推导性双门通过时执行 →
 *   本树全部容器身份双射不成立,保守跳过记 l2_derived_geometry_skipped;半透明 paint
 *   (Hashtag 文本 #FFFFFF α≈0.9)跳过 ΔE 记 l2_color_skipped_translucent_paint;
 *   容器像素采样跳过记 pixel_sample_skipped_container → violations=0、score=1、executed=15。
 * R1-① 设计侧门在本 fixture 不改变 skip 集合(双射门先于设计门全部拦下);冻结 spec 为旧格式、
 *   无 primaryAxisAlignItems 字段(unknown 路径,B3 显式 SPACE_BETWEEN 门不触发)—— 本回归即
 *   旧 spec unknown 路径的常驻反控。若双射未来放行,根容器 SPACE_BETWEEN 几何(authored gap 20
 *   vs design-derived 211)与 btn_fullscreen 居中 icon(authored pad 0 vs design-derived 4)
 *   仍由 design_derivation_mismatch 兜底(assert.test.ts yanhao 根真实几何单测钉死);
 *   B3 后新抓 spec 携显式 SPACE_BETWEEN 时则由 primary_axis_space_between 前置跳过 itemSpacing。
 *
 * executed 35 → 15 逐规则账目(修复前 = 6 pair 全量执行;修复后 20 条保守跳过不计分母):
 *   pair                                     修复前执行                     修复后跳过(原因)
 *   39:10844 根容器(VERTICAL)               pos+size+pad×4+gap = 7        pad×4+gap(correspondence 门)
 *   I…144062 正文 TEXT                       pos+size+font+color = 4       —
 *   39:10846 ct_hashtag_bar(HORIZONTAL)     pos+size+pad×4+gap = 7        pad×4+gap(correspondence 门)
 *   I…94053 btn_add_hashtag(VERTICAL)       pos+size+pad×4+gap = 7        pad×4+gap(correspondence 门)
 *   I…58638 Hashtag TEXT                     pos+size+font+color = 4       color(translucent α≈0.9)
 *   I…94058 btn_fullscreen(HORIZONTAL)      pos+size+pad×4 = 6            pad×4(correspondence 门;gap 需≥2 sem 子,原本不执行)
 *   合计                                     35                            −16 padding −3 itemSpacing −1 color = 15
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, it, expect } from 'vitest';
import { specNodeToFigma } from '../check/runL2.js';
import type { Spec } from '../figma/types.js';
import { SEVERITY_WEIGHT } from './constants.js';
import { runL2 } from './report.js';
import type { SemNode, SemanticsDump } from './types.js';

const spec = JSON.parse(readFileSync(
  new URL('../../fixtures/yanhao-hashtag.real.spec.json', import.meta.url), 'utf8')) as Spec;
const dump = JSON.parse(readFileSync(
  new URL('../../fixtures/yanhao-hashtag.real.semantics.json', import.meta.url), 'utf8')) as SemanticsDump;
const png = PNG.sync.read(readFileSync(
  fileURLToPath(new URL('../../fixtures/yanhao-hashtag.real.rendered.png', import.meta.url))));

describe('yanhao HashtagPanel 39:10844 真实基线回归(L2 派生断言假违规清零)', () => {
  it('fixture 完整性:spec 与 semantics 为同一 file/node/version 配对', () => {
    expect(spec.fileKey).toBe('hH7NUAlm9DsLRaGScQP0Z1');
    expect(spec.nodeId).toBe('39:10844');
    expect(spec.version).toBe('2342874355766877359');
    expect(dump.density).toBe(2.0);
  });

  it('fixture 输入 SHA256 钉死(防基线刷新/无声篡改本回归的输入)', () => {
    const sha = (rel: string): string => createHash('sha256')
      .update(readFileSync(new URL(rel, import.meta.url))).digest('hex');
    expect(sha('../../fixtures/yanhao-hashtag.real.spec.json'))
      .toBe('efef42bf0b7f5ea0b2fc3ef2ac51a8a3dfee6cb32146c98e58ce71988354114a');
    expect(sha('../../fixtures/yanhao-hashtag.real.semantics.json'))
      .toBe('a08353953eef50f06900a5ec7e0d6152fe12df6b236ff11bc6e067048dbc40ac');
    expect(sha('../../fixtures/yanhao-hashtag.real.rendered.png'))
      .toBe('5146e621c1479d36f648aef94da6d87def8673ee4294c405d282fe54026cec2f');
  });

  // 与 uiv check 端到端同构:真实 spec + 真实语义树 + 真实渲染 PNG(像素通道)。
  const figmaRoot = specNodeToFigma(spec.root);
  const report = runL2(figmaRoot, dump, { prevState: null, pixelSource: { png } });

  it('violations=0、score=1.0、pass=true(修复前:5 medium,score 0.942857)', () => {
    expect(report.structural?.violations).toEqual([]);
    expect(report.score).toBe(1);
    expect(report.pass).toBe(true);
    expect(report.structural?.untaggedCoverage).toBe(1);
    expect(report.structural?.matchRate).toBe(1);
    expect(report.structural?.matched).toBe(6);
  });

  // R2-③(撤回 R1-③c):structural.executed 生产计数导出已摘除,禁止任何生产代码为测试暴露计数。
  // 黑盒钉 executed=15:score = 1 − ΣW/executed 反推分母 —— 深拷贝真实语义树,向确定会执行的
  // 正文 TEXT fontSize 规则注入单条 >0.5sp 偏差(Codex 原文要求注 medium;本 fixture 的 medium
  // 规则恒不可注 —— cornerRadius sem 恒 null 不执行、padding/itemSpacing 全被双门跳过 ——
  // 改用等价口径:任一确定执行规则按其 severity 权重反推。fontSize 为 high,W_high=0.8,
  // score = 1 − 0.8/15 ≈ 0.94667,整数分母 15 为该值唯一解),同时钉 diagnostics multiset
  // 与基准运行完全一致(注伤不得扰动 skip 集合)。
  it('R2-③ 黑盒钉 executed=15:注入单条正文 fontSize 偏差 → score = 1 − W_high/15;structural 不再导出 executed', () => {
    expect(Object.keys(report.structural ?? {})).not.toContain('executed');   // 计数导出已撤回

    const TEXT_TAG = 'fig:I39:10845;10587:144062';
    const findByTag = (n: SemNode, tag: string): SemNode | null => {
      if (n.testTag === tag) return n;
      for (const c of n.children) { const hit = findByTag(c, tag); if (hit !== null) return hit; }
      return null;
    };
    const injected = structuredClone(dump);
    const target = findByTag(injected.root, TEXT_TAG);
    expect(target?.fontSizeSp).toBe(14);         // 注伤前提:基准值如预期
    target!.fontSizeSp = 15;                     // |14−15| = 1sp > 0.5sp → 恰 1 条 high

    const r = runL2(figmaRoot, injected, { prevState: null, pixelSource: { png } });
    expect(r.structural?.violations).toEqual([expect.objectContaining({
      property: 'fontSize', severity: 'high', testTag: TEXT_TAG, expected: '14sp', actual: '15sp',
    })]);
    expect(r.score).toBe(1 - SEVERITY_WEIGHT.high / 15);   // 0.9466…,黑盒反推 executed=15(修复前 35)
    // pass=false 源于 high 违规的硬阻断(verdict 条件),与 0.9 分数门无关(此处 score≈0.9467 仍 >0.9)。
    expect(r.pass).toBe(false);                            // high 违规照常阻断(注伤真实生效旁证)
    // 注伤不得扰动 skip 集合:diagnostics multiset 与基准运行完全一致
    const key = (d: { code: string; testTag: string }): string => `${d.code}|${d.testTag}`;
    const byKey = (a: { code: string; testTag: string }, b: { code: string; testTag: string }): number =>
      key(a).localeCompare(key(b));
    expect([...(r.structural?.diagnostics.pixel ?? [])].sort(byKey))
      .toEqual([...(report.structural?.diagnostics.pixel ?? [])].sort(byKey));
  });

  it('R1-③a 完整 diagnostics multiset 钉死(8 条:4 geometry + 1 translucent + 3 container;排序比较完整对象)', () => {
    const geoDetail = (reason: string, semN: number, figN: number, rules: string[]): string =>
      `派生几何断言跳过(${reason}):语义直接子 ${semN} / Figma 可见直接子 ${figN},规则 [${rules.join(',')}]`;
    const expected = [
      // 根容器:语义直接子是被拍平的孙节点(文本 tag id 非 Figma 直接子 id)
      { code: 'l2_derived_geometry_skipped', testTag: 'fig:39:10844', nodeId: '39:10844',
        reason: 'direct_child_correspondence_unproven', rules: ['padding', 'itemSpacing'],
        semChildCount: 2, figChildCount: 2,
        detail: geoDetail('direct_child_correspondence_unproven', 2, 2, ['padding', 'itemSpacing']) },
      // ct_hashtag_bar:语义子 94053 在 Figma 侧隔了 btn_hashtag/btn_add_hashtag 两层中间容器
      { code: 'l2_derived_geometry_skipped', testTag: 'fig:39:10846', nodeId: '39:10846',
        reason: 'direct_child_correspondence_unproven', rules: ['padding', 'itemSpacing'],
        semChildCount: 2, figChildCount: 2,
        detail: geoDetail('direct_child_correspondence_unproven', 2, 2, ['padding', 'itemSpacing']) },
      // btn_add_hashtag INSTANCE:Figma 直接子 1(ic&text)被语义树拍平为 2(icon+文本)
      { code: 'l2_derived_geometry_skipped', testTag: 'fig:I39:10846;10221:94053',
        nodeId: 'I39:10846;10221:94053',
        reason: 'direct_child_correspondence_unproven', rules: ['padding', 'itemSpacing'],
        semChildCount: 2, figChildCount: 1,
        detail: geoDetail('direct_child_correspondence_unproven', 2, 1, ['padding', 'itemSpacing']) },
      // btn_fullscreen:语义子未挂 tag,身份不可证(数量相等也不放行)
      { code: 'l2_derived_geometry_skipped', testTag: 'fig:I39:10846;10221:94058',
        nodeId: 'I39:10846;10221:94058',
        reason: 'direct_child_correspondence_unproven', rules: ['padding'],
        semChildCount: 1, figChildCount: 1,
        detail: geoDetail('direct_child_correspondence_unproven', 1, 1, ['padding']) },
      // Hashtag 文本 #FFFFFF α≈0.9:未合成背景,跳过 ΔE
      { code: 'l2_color_skipped_translucent_paint', testTag: 'fig:I39:10846;10221:94053;10154:58638',
        detail: '首 fill 半透明(alpha=0.8999999761581421),显示色未合成背景,跳过 ΔE 断言' },
      // 像素通道容器跳过 ×3(根 / btn_add_hashtag / btn_fullscreen:有 SOLID fill 且语义子非空)
      { code: 'pixel_sample_skipped_container', testTag: 'fig:39:10844', detail: '容器子像素污染' },
      { code: 'pixel_sample_skipped_container', testTag: 'fig:I39:10846;10221:94053', detail: '容器子像素污染' },
      { code: 'pixel_sample_skipped_container', testTag: 'fig:I39:10846;10221:94058', detail: '容器子像素污染' },
    ];
    const key = (d: { code: string; testTag: string }): string => `${d.code}|${d.testTag}`;
    const byKey = (a: { code: string; testTag: string }, b: { code: string; testTag: string }): number =>
      key(a).localeCompare(key(b));
    const actual = [...(report.structural?.diagnostics.pixel ?? [])].sort(byKey);
    expect(actual).toEqual([...expected].sort(byKey));
  });
});
