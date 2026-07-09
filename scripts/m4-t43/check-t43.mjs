#!/usr/bin/env node
/**
 * T4.3 Step 8:scripts/ci-gate.sh 红绿四场景验收(a-d,沿 check-t34.mjs 的 die/ok 形态)。
 * 写偏类验收(改 CalibCard.kt 与 golden PNG),与其他写偏任务排他串行。
 *
 * git 护栏(Codex 建议,必守):运行前后各取一次 `git status --short` 全仓快照,只允许本脚本
 * 自己的改动(且逐步复原 CalibCard.kt / golden PNG);任一写偏段落用 try/finally 保证复原 —— 即便
 * 中途断言失败也不留手;脚本末尾比对前后两份快照必须完全一致,否则判定为护栏违规(可能是本脚本
 * 自身 bug,也可能是与并发改动混淆,一律先视为红)。
 *
 * 写偏前置断言(Codex 复审修复,必守):每处写偏前先断言目标路径与 HEAD 完全一致
 * (`git diff --quiet HEAD -- path`),脏则立即 exit 2 且不碰该文件——防止用户运行前已有的
 * 未提交改动被写偏/复原流程覆盖或掩盖。复原不再借助 `git checkout`(会把未暂存的宿主改动一并
 * 丢弃),改为运行前保存原始 Buffer、复原时按原字节写回。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { DEVIATION_SUBS } from '../phase0-lib.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const CI_GATE = join(ROOT, 'scripts', 'ci-gate.sh');
const CALIB_CARD = join(ROOT, 'demo-android/app/src/main/java/com/magpie/uiv/demo/CalibCard.kt');
const GOLDEN = join(ROOT, 'demo-android/app/src/test/snapshots/CalibCard.png');
const JUNIT_XSD = join(ROOT, 'scripts/fixtures/junit/junit.xsd');
const JUNIT_XML = join(ROOT, '.ui-verify/reports/ci/junit.xml');

class CheckFailure extends Error {
  constructor(code, msg) { super(msg); this.code = code; }
}
const die = (code, msg) => { throw new CheckFailure(code, msg); };
const ok = (msg) => console.log(`[check-t43] OK: ${msg}`);

function gitStatusShort() {
  return execFileSync('git', ['status', '--short'], { cwd: ROOT, encoding: 'utf8' });
}
/**
 * 写偏前置断言(Codex 复审修复,必守):目标路径须与 HEAD 完全一致 —— `git diff --quiet HEAD -- path`
 * 同时覆盖已暂存与未暂存的偏离,比裸 `git diff --quiet`(仅未暂存 vs 索引)更贴合"与 HEAD 一致"的意图。
 * 脏则立即 exit 2 且不碰该文件:一是防止用户运行前已有的未提交改动被下面的写偏/复原流程覆盖或掩盖;
 * 二是本脚本的写偏断言(如 D1 恰好 1 处匹配)本身也假设起点是已知的 HEAD 干净态,脏树会让断言结果失真。
 * exit 2 与 CheckFailure 默认的 exit 1 区分:2 = 前置条件/用法错误,1 = 场景断言失败。
 */
function assertCleanAgainstHead(path, label) {
  try {
    execFileSync('git', ['diff', '--quiet', 'HEAD', '--', path], { cwd: ROOT, stdio: 'pipe' });
  } catch (e) {
    if (e.status !== 1) throw e; // 非"存在差异"的其它失败(如路径不存在)照常抛出,不吞
    const status = execFileSync('git', ['status', '--short', '--', path], { cwd: ROOT, encoding: 'utf8' });
    die(2, `${label}: 目标文件运行前已与 HEAD 不一致,拒绝写偏(防止后续复原覆盖/掩盖这些未提交改动):\n${status}`);
  }
}

/**
 * 按运行前保存的原始字节写回,不再借助 `git checkout` 做复原手段(避免把宿主未提交改动一并抹掉)。
 * 写回后当场核验路径确已回到与运行前一致的状态(不等脚本收尾才发现复原失败)。
 */
function restoreOriginal(path, originalBuffer, label) {
  writeFileSync(path, originalBuffer);
  const residual = execFileSync('git', ['status', '--short', '--', path], { cwd: ROOT, encoding: 'utf8' });
  if (residual.trim() !== '') die(1, `${label}: 复原后仍有残留改动:\n${residual}`);
}

/** 跑 ci-gate.sh;永不因子进程非 0 退出而抛错(非 0 exit 正是待断言项)。合并 stdout+stderr 供文本断言。 */
function runCiGate(env = {}) {
  try {
    const stdout = execFileSync('bash', [CI_GATE], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024,
    });
    return { code: 0, output: stdout };
  } catch (e) {
    const output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    return { code: typeof e.status === 'number' ? e.status : 1, output };
  }
}

function assertContains(haystack, needle, label) {
  if (!haystack.includes(needle)) die(1, `${label}: 期望输出含 "${needle}",实际未见。末 1500 字:\n${haystack.slice(-1500)}`);
}
function assertExitCode(actual, expected, label) {
  if (actual !== expected) die(1, `${label}: 期望 exit ${expected},实际 ${actual}`);
}

/** D1(phase0-lib.mjs 既有写偏表首条:CHILD_POSITIONS 表 CalibTitle 项位置偏移)。单条应用,不动 D2~D4。 */
function applyD1(src) {
  const { re, to, name } = DEVIATION_SUBS[0];
  const n = (src.match(re) ?? []).length;
  if (n !== 1) throw new Error(`${name}: 期望恰好 1 处匹配 ${re},实际 ${n} 处`);
  return src.replace(re, to);
}

/** golden 顶部 1/4 高度整带反色 —— 远超任何合理容差(含 0.01),门 B 红/WARN 两态共用同一次篡改。 */
function tamperGolden() {
  const png = PNG.sync.read(readFileSync(GOLDEN));
  const bandHeight = Math.max(1, Math.floor(png.height / 4));
  for (let y = 0; y < bandHeight; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const idx = (png.width * y + x) << 2;
      png.data[idx] = 255 - png.data[idx];
      png.data[idx + 1] = 255 - png.data[idx + 1];
      png.data[idx + 2] = 255 - png.data[idx + 2];
    }
  }
  writeFileSync(GOLDEN, PNG.sync.write(png));
}

async function main() {
  const summary = [];
  const before = gitStatusShort();

  try {
    // ── a. 绿:全通过 + 哨兵 WARN(告警不阻断)───────────────────────────────
    {
      const r = runCiGate();
      assertExitCode(r.code, 0, 'a.绿');
      assertContains(r.output, 'ci-gate: PASS', 'a.绿');
      assertContains(r.output, 'WARN version drift', 'a.绿(哨兵告警)');
      execFileSync('/usr/bin/xmllint', ['--noout', '--schema', JUNIT_XSD, JUNIT_XML], { stdio: 'pipe' });
      const xml = readFileSync(JUNIT_XML, 'utf8');
      if (!xml.includes('<testsuites')) die(1, 'a.绿: junit.xml 缺 <testsuites 根节点');
      ok('a. 绿场景:ci-gate exit 0,含 PASS + 哨兵 WARN,junit.xml 存在且过 xmllint --schema');
      summary.push('a. 绿           exit=0  ci-gate: PASS ✓  WARN version drift ✓  junit.xml 过 xmllint ✓');
    }

    // ── b. 门 A 红:CalibCard.kt 写偏(D1 位置,try/finally 保证复原)──────────
    {
      assertCleanAgainstHead(CALIB_CARD, 'b.门A红(写偏前置)');
      const original = readFileSync(CALIB_CARD);
      writeFileSync(CALIB_CARD, applyD1(original.toString('utf8')));
      try {
        const r = runCiGate();
        assertExitCode(r.code, 1, 'b.门A红');
        assertContains(r.output, 'FAIL [gate-A]', 'b.门A红');
        const xml = readFileSync(JUNIT_XML, 'utf8');
        if (!xml.includes('<failure')) die(1, 'b.门A红: junit.xml 缺 <failure(失败时报告仍应产出)');
        ok('b. 门 A 红:CalibCard.kt 写偏(D1)→ ci-gate exit 1,FAIL [gate-A],junit.xml 含 <failure');
        summary.push('b. 门A红        exit=1  FAIL [gate-A] ✓  junit.xml 含 <failure ✓');
      } finally {
        restoreOriginal(CALIB_CARD, original, 'b.门A红');
      }
    }

    // ── c/d. 门 B(golden 篡改一次,c/d 共用,try/finally 保证复原)────────────
    assertCleanAgainstHead(GOLDEN, 'c/d.门B(写偏前置)');
    const goldenOriginal = readFileSync(GOLDEN);
    tamperGolden();
    try {
      // c. 默认(无阻断开关):WARN,不影响 exit
      {
        const r = runCiGate();
        assertExitCode(r.code, 0, 'c.门B默认WARN');
        assertContains(r.output, 'WARN [gate-B]', 'c.门B默认WARN');
        ok('c. 门 B 默认 WARN:golden 像素篡改 → ci-gate exit 0,WARN [gate-B](默认不阻断)');
        summary.push('c. 门B默认WARN  exit=0  WARN [gate-B] ✓(默认不阻断)');
      }
      // d. 开关红:声明阻断 + 显式容差仍超 → exit 1;声明阻断但无容差 → 用法错误 exit 2
      {
        const r1 = runCiGate({ UIV_CI_BLOCK_REGRESSION: '1', UIV_CI_TOLERANCE: '0.01' });
        assertExitCode(r1.code, 1, 'd.门B开关红(有容差仍超)');
        assertContains(r1.output, 'FAIL [gate-B]', 'd.门B开关红(有容差仍超)');
        assertContains(r1.output, 'exceeds declared tolerance', 'd.门B开关红(有容差仍超)');

        const r2 = runCiGate({ UIV_CI_BLOCK_REGRESSION: '1' });
        assertExitCode(r2.code, 2, 'd.门B开关红(无容差)');
        assertContains(r2.output, 'blocking requires explicit tolerance', 'd.门B开关红(无容差)');

        ok('d. 门 B 开关红:BLOCK_REGRESSION=1+TOLERANCE=0.01 仍超 → exit 1;BLOCK_REGRESSION=1 无容差 → exit 2');
        summary.push('d. 门B开关红    有容差仍超 exit=1 ✓  无容差(用法错误) exit=2 ✓');
      }
    } finally {
      restoreOriginal(GOLDEN, goldenOriginal, 'c/d.门B');
    }
  } finally {
    const after = gitStatusShort();
    if (after !== before) {
      die(1, `git 护栏违规:运行前后工作树不一致(应恒复原)。\n--- 运行前 ---\n${before || '(clean)'}\n--- 运行后 ---\n${after || '(clean)'}`);
    }
  }

  console.log('\n[check-t43] 四场景摘要:');
  for (const line of summary) console.log(`  ${line}`);
  ok('全部 4 场景通过(a-d);git 护栏确认工作树与运行前一致');
}

main().then(
  () => process.exit(0),
  (e) => {
    const code = e instanceof CheckFailure ? e.code : 1;
    console.error(`[check-t43] FAIL(exit ${code}): ${e.message}`);
    process.exit(code);
  },
);
