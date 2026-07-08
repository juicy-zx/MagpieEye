// T1.4 Phase 0 验收 harness 纯函数(零 IO):写偏注入变换 / artifacts 剥离 / 停止条件判定 /
// 检出能力门 / git 白名单判定 / 验收报告渲染。全部被 phase0-lib.test.mjs 钉死;
// phase0-acceptance.mjs 只做文件 IO 与 gradle 子进程编排,判定逻辑一律委托到本文件。
export const MAX_ROUNDS = 5;

// D1~D4 写偏注入表(与 milestone-1.md T1.4 章"写死的偏差清单"逐字对应源码)。
// D1 的正则锚定 CHILD_POSITIONS 表 title 项的行内注释 `// fig:1:101 CalibTitle`,
// 而非已废弃的 `.offset(x = 12.dp, y = 12.dp)`(CalibCard.kt 经 D-03 修复后改用
// 自定义 Layout + 私有表 CHILD_POSITIONS 摆放四个叶子,offset 正则已不存在于源码)。
export const DEVIATION_SUBS = [
  {
    re: /12\.dp to 12\.dp,(\s*\/\/ fig:1:101 CalibTitle)/g,
    to: '16.dp to 16.dp,$1',
    name: 'D1 CalibTitle 位置(position,CHILD_POSITIONS 表 title 项)',
  },
  { re: /fontSize = 16\.sp/g, to: 'fontSize = 14.sp', name: 'D2 CalibTitle 字号(fontSize)' },
  { re: /Color\(0xFFFF9900\)/g, to: 'Color(0xFFFF6600)', name: 'D3 CalibSwatch 填充色(color,像素采样通道)' },
  { re: /^[ \t]*CalibBadge\(\)[ \t]*\n/gm, to: '', name: 'D4 CalibBadge 调用行移除(missing,不渲染)' },
];

/**
 * 从"正确"CalibCard.kt 源码机械生成写偏副本。每条替换要求在输入中恰好匹配 1 处,
 * 否则抛错(防止对已偏离 Canonical Contract 或已处于写偏态的源码静默错改)。
 */
export function applyDeviations(src) {
  let out = src;
  for (const { re, to, name } of DEVIATION_SUBS) {
    const n = (out.match(re) ?? []).length;
    if (n !== 1) {
      throw new Error(`${name}: 期望恰好 1 处匹配 ${re}, 实际 ${n} 处 —— 请核对源码是否已偏离 Canonical Contract 或已处于写偏态`);
    }
    out = out.replace(re, to);
  }
  if (/^[ \t]*CalibBadge\(\)/m.test(out)) {
    throw new Error('D4 失效:替换后仍存在 CalibBadge() 调用');
  }
  return out;
}

export function stripArtifacts(report) {
  const { artifacts, ...rest } = report;
  return rest;
}

// round 为 1-based 当前轮次。优先级:pass > regression > max_rounds > continue。
export function decide(report, round, maxRounds = MAX_ROUNDS) {
  if (report.pass === true) return { verdict: 'pass', reason: null };
  if (report.regression === true) return { verdict: 'fail', reason: 'regression' };
  if (round >= maxRounds) return { verdict: 'fail', reason: 'max_rounds' };
  return { verdict: 'continue', reason: null };
}

/**
 * 检出能力门(独立探针专用,由 --verify-detection 调用,不参与 --step 的轮次判停):
 * report 必须同时命中全部 seeded deviations D1~D4,否则"检出能力不足"。
 * 返回缺失清单,空数组=全命中。color 允许以 property 'color' 或 'fill' 报告。
 */
export function assertSeededDetection(report) {
  const v = report.structural?.violations ?? [];
  const hit = (props, tag) => v.some((x) => props.includes(x.property) && x.testTag === tag);
  const misses = [];
  if (!hit(['position'], 'fig:1:101')) misses.push('D1 position@fig:1:101');
  if (!hit(['fontSize'], 'fig:1:101')) misses.push('D2 fontSize@fig:1:101');
  if (!hit(['color', 'fill'], 'fig:1:103')) misses.push('D3 color@fig:1:103');
  if (!(report.structural?.missing ?? []).some((m) => (m.figmaId ?? m.id) === '1:104')) {
    misses.push('D4 missing figmaId=1:104');
  }
  return misses;
}

/**
 * git 白名单判定(纯函数,精确相等匹配)。IO 侧(git diff 取changed 列表)由
 * phase0-acceptance.mjs 的 gitGuard() 负责,此处只接收纯数组以便单测注入假 changed 列表。
 */
export function checkWhitelist(changedFiles, allowedPaths) {
  const violations = changedFiles.filter((f) => !allowedPaths.some((p) => f === p));
  return { ok: violations.length === 0, violations };
}

export function renderAcceptanceDoc({ rounds, verdict, deviations, startedAt, finishedAt }) {
  return [
    '# Phase 0 端到端验收报告(T1.4)',
    '',
    `- 结论:**${verdict === 'pass' ? '通过' : '未通过'}**(${rounds.length} 轮,上限 ${MAX_ROUNDS} 轮)`,
    `- 总耗时:${((finishedAt - startedAt) / 1000).toFixed(0)}s`,
    '- 修正者输入:仅剥离 artifacts 字段后的 report.json,无任何图片路径',
    '',
    '## 预置偏差清单',
    '',
    ...deviations.map((d) => `- ${d}`),
    '',
    '## 逐轮数据',
    '',
    '| 轮次 | violations | missing | score | pass | check 耗时(s) |',
    '|---|---|---|---|---|---|',
    ...rounds.map((r) =>
      `| ${r.round} | ${r.violations} | ${r.missing} | ${r.score} | ${r.pass} | ${(r.checkMs / 1000).toFixed(1)} |`),
    '',
  ].join('\n');
}
