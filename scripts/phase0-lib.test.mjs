import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyDeviations, checkWhitelist, stripArtifacts, decide, renderAcceptanceDoc,
  assertSeededDetection, MAX_ROUNDS,
} from './phase0-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARD_FILE = path.join(ROOT, 'demo-android/app/src/main/java/com/magpie/uiv/demo/CalibCard.kt');

const fake = (over = {}) => ({
  pass: false, reason: null, score: 0.5, regression: false, regressionReason: null,
  structural: { violations: [{ property: 'fontSize', testTag: 'fig:1:101' }], missing: [{ figmaId: '1:104' }] },
  artifacts: {
    baseline: '.ui-verify/baselines/1-100@T1_0A_V1/baseline.png',
    render: '.ui-verify/renders/1-100@T1_0A_V1/rendered.png',
    diff: '.ui-verify/reports/1-100@T1_0A_V1/diff.png',
  },
  ...over,
});

describe('applyDeviations:对真实 CalibCard.kt 源码机械生成写偏副本(D1~D4)', () => {
  it('真实源码上四处替换恰好各命中 1 次,产出预期文本', () => {
    const src = fs.readFileSync(CARD_FILE, 'utf8');
    const out = applyDeviations(src);
    expect(out).toContain('16.dp to 16.dp,  // fig:1:101 CalibTitle'); // D1:CHILD_POSITIONS 表 title 项
    expect(out).not.toContain('12.dp to 12.dp'); // 原值不再出现
    expect(out).toContain('fontSize = 14.sp'); // D2
    expect(out).toContain('Color(0xFFFF6600)'); // D3
    expect(out).toContain('Color(0xFFCCE0FF)'); // subtitle 不再写偏
    expect(out).not.toMatch(/^[ \t]*CalibBadge\(\)/m); // D4:调用行已移除
    expect(out).toContain('private fun CalibBadge'); // D4:定义保留,只是不再被调用
    // 其余三条 CHILD_POSITIONS 项与合同值不变(subtitle/swatch/badge 坐标未被误改)
    expect(out).toContain('12.dp to 36.dp,  // fig:1:102 CalibSubtitle');
    expect(out).toContain('12.dp to 60.dp,  // fig:1:103 CalibSwatch');
    expect(out).toContain('296.dp to 12.dp, // fig:1:104 CalibBadge');
  });

  it('对已经写偏过的源码再次调用 → 抛错(防止双重注入静默错改)', () => {
    const src = fs.readFileSync(CARD_FILE, 'utf8');
    const deviated = applyDeviations(src);
    expect(() => applyDeviations(deviated)).toThrow(/期望恰好 1 处匹配/);
  });

  it('缺任一 D1~D4 锚点的源码 → 抛错并指名具体缺失项', () => {
    const src = fs.readFileSync(CARD_FILE, 'utf8');
    const noBadgeCall = src.replace(/^[ \t]*CalibBadge\(\)[ \t]*\n/m, '');
    expect(() => applyDeviations(noBadgeCall)).toThrow(/D4/);
  });
});

describe('checkWhitelist:gitGuard 白名单纯逻辑(注入假 changed 列表)', () => {
  const ALLOWED = ['demo-android/app/src/main/java/com/magpie/uiv/demo/CalibCard.kt'];

  it('changed 为空 → ok', () => {
    expect(checkWhitelist([], ALLOWED)).toEqual({ ok: true, violations: [] });
  });
  it('changed 仅含白名单文件 → ok', () => {
    expect(checkWhitelist([...ALLOWED], ALLOWED)).toEqual({ ok: true, violations: [] });
  });
  it('changed 含白名单外文件 → violation 列出越界文件', () => {
    const changed = [...ALLOWED, 'scripts/phase0-acceptance.mjs'];
    expect(checkWhitelist(changed, ALLOWED)).toEqual({ ok: false, violations: ['scripts/phase0-acceptance.mjs'] });
  });
  it('changed 与白名单完全不相关 → 全部列为 violation', () => {
    const changed = ['packages/uiv-core/src/l2/report.ts', '.claude/plans/magpie-eye-full-impl/meta.json'];
    const r = checkWhitelist(changed, ALLOWED);
    expect(r.ok).toBe(false);
    expect(r.violations).toEqual(changed);
  });
  it('前缀相同但非精确相等 → 仍判 violation(精确相等匹配,非前缀/glob)', () => {
    const changed = ['demo-android/app/src/main/java/com/magpie/uiv/demo/CalibCard.kt.bak'];
    expect(checkWhitelist(changed, ALLOWED).ok).toBe(false);
  });
});

describe('stripArtifacts', () => {
  it('剥离 artifacts 字段,序列化结果不含任何图片路径,其余字段原样保留', () => {
    const s = stripArtifacts(fake());
    expect(s.artifacts).toBeUndefined();
    expect(JSON.stringify(s)).not.toMatch(/\.png/);
    expect(s.structural.violations).toHaveLength(1);
    expect(s.score).toBe(0.5);
  });
});

describe('decide:停止条件三分支(轮次 1-based,上限 5)', () => {
  it('分支一 成功:序列 [fail, fail, pass] 在第 3 轮 pass 停止', () => {
    const seq = [fake(), fake(), fake({ pass: true, structural: { violations: [], missing: [] } })];
    const ds = seq.map((r, i) => decide(r, i + 1));
    expect(ds[0]).toEqual({ verdict: 'continue', reason: null });
    expect(ds[1]).toEqual({ verdict: 'continue', reason: null });
    expect(ds[2]).toEqual({ verdict: 'pass', reason: null });
  });
  it('分支二 超轮:连续 5 轮 fail → 第 5 轮判 max_rounds(即 轮次>5 不可能发生)', () => {
    const seq = Array.from({ length: 5 }, () => fake());
    const ds = seq.map((r, i) => decide(r, i + 1));
    expect(ds.slice(0, 4).every((d) => d.verdict === 'continue')).toBe(true);
    expect(ds[4]).toEqual({ verdict: 'fail', reason: 'max_rounds' });
  });
  it('分支三 regression:第 2 轮 regression=true 立即失败;第 5 轮 regression 归因 regression 而非 max_rounds', () => {
    expect(decide(fake({ regression: true, regressionReason: 'score 0.78→0.78 停滞 2 轮' }), 2))
      .toEqual({ verdict: 'fail', reason: 'regression' });
    expect(decide(fake({ regression: true }), 5)).toEqual({ verdict: 'fail', reason: 'regression' });
  });
  it('pass 优先级最高:最后一轮 pass 即使 regression 脏位也判成功', () => {
    expect(decide(fake({ pass: true, regression: true }), 5)).toEqual({ verdict: 'pass', reason: null });
  });
});

describe('assertSeededDetection:检出能力门(D1~D4 全命中,防假通过)', () => {
  const full = () => fake({ structural: {
    violations: [
      { property: 'position', testTag: 'fig:1:101' },
      { property: 'fontSize', testTag: 'fig:1:101' },
      { property: 'color', testTag: 'fig:1:103' },
    ],
    missing: [{ figmaId: '1:104' }],
  } });
  it('4 项全命中 → 返回空数组', () => expect(assertSeededDetection(full())).toEqual([]));
  it('color 以 fill 报告同样算命中', () => {
    const r = full(); r.structural.violations[2].property = 'fill';
    expect(assertSeededDetection(r)).toEqual([]);
  });
  it('缺 D4(missing 无 1:104)→ 返回含 D4 的缺失清单', () => {
    const r = full(); r.structural.missing = [];
    expect(assertSeededDetection(r)).toEqual(['D4 missing figmaId=1:104']);
  });
  it('缺 D1(无 position@fig:1:101)→ 清单含 D1', () => {
    const r = full(); r.structural.violations = r.structural.violations.slice(1);
    expect(assertSeededDetection(r)).toContain('D1 position@fig:1:101');
  });
});

describe('renderAcceptanceDoc', () => {
  it('输出含每轮一行的 violations/missing/score/耗时表格与结论', () => {
    const doc = renderAcceptanceDoc({
      rounds: [
        { round: 1, violations: 3, missing: 1, score: 0.62, pass: false, checkMs: 21000 },
        { round: 2, violations: 0, missing: 0, score: 0.98, pass: true, checkMs: 18500 },
      ],
      verdict: 'pass',
      deviations: ['D1 padding'],
      startedAt: 0, finishedAt: 120000,
    });
    expect(doc).toContain('| 轮次 | violations | missing | score | pass | check 耗时(s) |');
    expect(doc).toContain('| 1 | 3 | 1 | 0.62 | false | 21.0 |');
    expect(doc).toContain('| 2 | 0 | 0 | 0.98 | true | 18.5 |');
    expect(doc).toContain('通过');
    expect(doc).toContain('D1 padding');
    expect(doc).toContain(`上限 ${MAX_ROUNDS} 轮`);
  });
});
