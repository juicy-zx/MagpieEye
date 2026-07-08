import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS = path.join(ROOT, 'scripts/phase0-acceptance.mjs');

function run(cfgPath, args) {
  try {
    const out = execFileSync('node', [HARNESS, ...args], {
      env: { ...process.env, PHASE0_CONFIG: cfgPath }, encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('phase0-acceptance harness 冒烟(stub uiv check,不碰 Gradle)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase0-smoke-'));
  const reportPath = path.join(tmp, 'report.json');
  const cfgPath = path.join(tmp, 'config.json');
  const stateDir = path.join(tmp, 'state');

  // 最小可被 applyDeviations 的 D1~D4 正则各命中恰好 1 次的"卡片"内容(不必是合法 Kotlin,
  // phase0-lib.mjs 只做字符串变换,不编译)。真实源码上的行为已由 phase0-lib.test.mjs 覆盖。
  const CORRECT_CARD = [
    'private val CHILD_POSITIONS = listOf(',
    '    12.dp to 12.dp,  // fig:1:101 CalibTitle',
    ')',
    'fun x() {',
    '    fontSize = 16.sp',
    '    Color(0xFFCCE0FF)',
    '            CalibBadge()',
    '}',
    '',
  ].join('\n');

  // failReport 命中全部 seeded deviations(D1~D4),用于 verify-detection 的 4/4 断言与 step 的
  // "continue"分支;passReport 用于 step 的"pass"分支。两者均为真实 report.json v1 形状。
  const failReport = {
    schemaVersion: 1, pass: false, reason: null, subReason: null, compileError: null,
    pixel: null, score: 0.62, regression: false, regressionReason: null,
    structural: {
      matched: 3, untaggedCoverage: 0.75, matchRate: 0.75,
      violations: [
        { judgePath: 'parity', testTag: 'fig:1:101', figmaName: 'CalibTitle', property: 'position', expected: '(12,12)', actual: '(16,16)', severity: 'high', hint: 'x' },
        { judgePath: 'parity', testTag: 'fig:1:101', figmaName: 'CalibTitle', property: 'fontSize', expected: '16sp', actual: '14sp', severity: 'high', hint: 'x' },
        { judgePath: 'parity', testTag: 'fig:1:102', figmaName: 'CalibSubtitle', property: 'color', expected: '#CCE0FF', actual: '#99B3E6', severity: 'medium', hint: 'x' },
      ],
      missing: [{ figmaId: '1:104', name: 'CalibBadge', expectedBounds: [296, 12, 52, 20] }],
      extra: [],
    },
    artifacts: { baseline: 'x/baseline.png', render: 'x/rendered.png', diff: 'x/diff.png' },
  };
  const passReport = {
    schemaVersion: 1, pass: true, reason: null, subReason: null, compileError: null,
    pixel: null, score: 0.98, regression: false, regressionReason: null,
    structural: { matched: 4, untaggedCoverage: 1, matchRate: 1, violations: [], missing: [], extra: [] },
    artifacts: { baseline: 'x/baseline.png', render: 'x/rendered.png', diff: 'x/diff.png' },
  };

  beforeAll(() => {
    // stub uiv check:调用计数 1~2 次产出 failReport(命中全部 D1~D4),第 3 次起产出 passReport。
    // exit code 摹仿真实 CLI 语义:pass ? 0 : 1。
    fs.writeFileSync(path.join(tmp, 'stub.mjs'), `
import fs from 'node:fs';
const cnt = ${JSON.stringify(path.join(tmp, 'cnt'))};
const n = fs.existsSync(cnt) ? Number(fs.readFileSync(cnt, 'utf8')) + 1 : 1;
fs.writeFileSync(cnt, String(n));
const report = n <= 2 ? ${JSON.stringify(failReport)} : ${JSON.stringify(passReport)};
fs.writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify(report));
process.exit(report.pass ? 0 : 1);
`);
    fs.writeFileSync(path.join(tmp, 'card.kt'), CORRECT_CARD);
    fs.writeFileSync(path.join(tmp, 'meta.json'), '{}');
    fs.writeFileSync(cfgPath, JSON.stringify({
      cardFile: path.join(tmp, 'card.kt'),
      backupSrc: path.join(tmp, 'fixtures/CalibCard.original.kt'),
      deviatedSrc: path.join(tmp, 'fixtures/CalibCard.deviated.kt'),
      allowedFixPaths: [],
      skipGitGuard: true,
      checkCmd: `node ${path.join(tmp, 'stub.mjs')}`,
      reportPath,
      stateDir,
      docPath: path.join(tmp, 'phase0-acceptance.md'),
      metaPath: path.join(tmp, 'meta.json'),
      deviations: ['smoke 偏差'],
    }));
  });

  it('--inject:写偏副本安装到 cardFile,快照落盘,round 状态重置为空', () => {
    const r = run(cfgPath, ['--inject']);
    expect(r.code).toBe(0);
    const installed = fs.readFileSync(path.join(tmp, 'card.kt'), 'utf8');
    expect(installed).toContain('16.dp to 16.dp,  // fig:1:101 CalibTitle');
    expect(installed).toContain('fontSize = 14.sp');
    expect(installed).toContain('Color(0xFF99B3E6)');
    expect(installed).not.toMatch(/^\s*CalibBadge\(\)/m);
    const original = fs.readFileSync(path.join(tmp, 'fixtures/CalibCard.original.kt'), 'utf8');
    expect(original).toBe(CORRECT_CARD);
    const deviated = fs.readFileSync(path.join(tmp, 'fixtures/CalibCard.deviated.kt'), 'utf8');
    expect(deviated).toBe(installed);
    expect(JSON.parse(fs.readFileSync(path.join(stateDir, 'state.json'), 'utf8')).rounds).toEqual([]);
  });

  it('--verify-detection:命中全部 4 项 → exit 0,不消耗/不推进 round 状态', () => {
    const r = run(cfgPath, ['--verify-detection']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/"hit":4,"total":4/);
    expect(r.out).toContain('检出能力门通过:4/4');
    // 不写 round-N-report.json,不改动 state.json 的轮次计数(仍为空)
    expect(fs.existsSync(path.join(stateDir, 'round-1-report.json'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(stateDir, 'state.json'), 'utf8')).rounds).toEqual([]);
    const probe = JSON.parse(fs.readFileSync(path.join(stateDir, 'verify-detection-report.json'), 'utf8'));
    expect(probe.artifacts).toBeUndefined();
  });

  it('--step 第 1 轮(stub 第 2 次调用,仍为 fail)→ exit 0(continue),落盘剥离后的 round-1-report.json', () => {
    const r = run(cfgPath, ['--step']);
    expect(r.code).toBe(0);
    const stripped = fs.readFileSync(path.join(stateDir, 'round-1-report.json'), 'utf8');
    expect(stripped).not.toMatch(/\.png/);
    expect(JSON.parse(stripped).artifacts).toBeUndefined();
    expect(JSON.parse(stripped).structural.violations).toHaveLength(3);
    const lastLine = r.out.trim().split('\n').at(-1);
    const parsed = JSON.parse(lastLine);
    expect(parsed).toMatchObject({ round: 1, pass: false, violationsCount: 3, missing: 1, next: 'step' });
  });

  it('--step 第 2 轮(stub 第 3 次调用,pass)→ exit 10', () => {
    const r = run(cfgPath, ['--step']);
    expect(r.code).toBe(10);
    const lastLine = r.out.trim().split('\n').at(-1);
    expect(JSON.parse(lastLine)).toMatchObject({ round: 2, pass: true, next: 'finalize' });
  });

  it('--finalize:生成验收文档并写 meta.latency_baseline.phase0_loop → exit 0', () => {
    const r = run(cfgPath, ['--finalize']);
    expect(r.code).toBe(0);
    const doc = fs.readFileSync(path.join(tmp, 'phase0-acceptance.md'), 'utf8');
    expect(doc).toContain('| 1 | 3 | 1 | 0.62 | false |');
    expect(doc).toContain('| 2 | 0 | 0 | 0.98 | true |');
    const meta = JSON.parse(fs.readFileSync(path.join(tmp, 'meta.json'), 'utf8'));
    expect(meta.latency_baseline.phase0_loop.rounds).toBe(2);
    expect(meta.latency_baseline.phase0_loop.checkMsPerRound).toHaveLength(2);
    expect(meta.latency_baseline.phase0_loop.p50CheckMs).toBeGreaterThan(0);
  });
});

describe('phase0-acceptance --inject 前置条件守卫', () => {
  it('cardFile 不含任何 D1~D4 锚点 → exit 32,不改动 cardFile', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase0-smoke-badcard-'));
    const cardPath = path.join(tmp, 'card.kt');
    fs.writeFileSync(cardPath, 'not a calib card at all\n');
    const cfgPath = path.join(tmp, 'config.json');
    fs.writeFileSync(cfgPath, JSON.stringify({
      cardFile: cardPath,
      backupSrc: path.join(tmp, 'fixtures/CalibCard.original.kt'),
      deviatedSrc: path.join(tmp, 'fixtures/CalibCard.deviated.kt'),
      allowedFixPaths: [], skipGitGuard: true,
      checkCmd: 'node -e 1',
      reportPath: path.join(tmp, 'report.json'),
      stateDir: path.join(tmp, 'state'),
      docPath: path.join(tmp, 'phase0-acceptance.md'),
      metaPath: path.join(tmp, 'meta.json'),
      deviations: [],
    }));
    const r = run(cfgPath, ['--inject']);
    expect(r.code).toBe(32);
    expect(fs.readFileSync(cardPath, 'utf8')).toBe('not a calib card at all\n');
    expect(fs.existsSync(path.join(tmp, 'fixtures/CalibCard.deviated.kt'))).toBe(false);
  });
});
