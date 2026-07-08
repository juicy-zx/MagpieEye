#!/usr/bin/env node
/**
 * T1.4 Phase 0 端到端验收 harness:单步模式,由主会话在轮与轮之间驱动
 * (harness 只负责跑 uiv check / 剥离 artifacts / 判停 / 计时;修正循环的编排与
 * 修正者 subagent 派发一律在主会话,harness 自身不跑修正循环)。
 *
 * 用法: node scripts/phase0-acceptance.mjs <--inject|--step|--verify-detection|--finalize>
 *
 * 模式:
 *   --inject            从当前(应为"正确"态的)cardFile 机械生成写偏副本并安装,
 *                        重置 .ui-verify/phase0 轮次状态(round 0)。同时把 before/after
 *                        快照落盘到 scripts/fixtures/(验收可重现)。
 *   --step               跑一轮 uiv check:gitGuard → check → 剥离 artifacts 落盘
 *                        round-<N>-report.json → 更新 state.json → decide() 判停。
 *                        不含检出能力门(那是 --verify-detection 的职责,见下)。
 *   --verify-detection    独立探针,只跑一次 check,断言 report 同时命中全部 seeded
 *                        deviations D1~D4。不写 round-<N>-report.json、不推进/不消耗
 *                        state.json 的轮次计数(可在 --inject 之后、真正开始消耗 5 轮
 *                        预算之前先行调用,验证检出能力,不占用轮次预算)。
 *   --finalize           读取 state.json 最终态,生成 docs/phase0-acceptance.md 并把
 *                        latency_baseline.phase0_loop 写入 meta.json。
 *
 * exit code 约定:
 *   0  = step:continue(继续下一轮)          10 = step:pass(验收通过)
 *   20 = step:fail max_rounds                21 = step:fail regression
 *   30 = 协议违规:gitGuard 白名单外文件被改动  31 = verify-detection:检出能力不足
 *   32 = inject 前置条件不满足(cardFile 非"正确"态,applyDeviations 匹配数非预期)
 *   1  = harness/环境错误(未产出 report.json 等意外异常)   2 = 用法错误
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyDeviations, checkWhitelist, stripArtifacts, decide, renderAcceptanceDoc,
  assertSeededDetection, MAX_ROUNDS,
} from './phase0-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfgPath = process.env.PHASE0_CONFIG || path.join(ROOT, 'scripts/phase0-config.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const abs = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));
const stateDir = abs(cfg.stateDir);
const statePath = path.join(stateDir, 'state.json');

function readState() {
  if (!fs.existsSync(statePath)) return { startedAt: Date.now(), rounds: [] };
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}
function writeState(s) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(s, null, 2));
}

function inject() {
  const cardPath = abs(cfg.cardFile);
  const original = fs.readFileSync(cardPath, 'utf8');
  let deviated;
  try {
    deviated = applyDeviations(original);
  } catch (e) {
    console.error(`inject 前置条件不满足:${e.message}`);
    process.exit(32);
  }
  fs.mkdirSync(path.dirname(abs(cfg.backupSrc)), { recursive: true });
  fs.writeFileSync(abs(cfg.backupSrc), original);
  fs.writeFileSync(abs(cfg.deviatedSrc), deviated);
  fs.rmSync(stateDir, { recursive: true, force: true });
  fs.writeFileSync(cardPath, deviated);
  writeState({ startedAt: Date.now(), rounds: [] });
  console.log(`inject 完成:写偏实现已安装 → ${cfg.cardFile}(快照:${cfg.backupSrc} / ${cfg.deviatedSrc})`);
}

function gitGuard() {
  if (cfg.skipGitGuard) return;
  // execFileSync(无 shell):固定参数数组,不走字符串插值,规避 shell 注入面。
  const changed = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  const { ok, violations } = checkWhitelist(changed, cfg.allowedFixPaths);
  if (!ok) {
    console.error(`协议违规:白名单外文件被改动:\n${violations.join('\n')}`);
    process.exit(30);
  }
}

/** 跑一次 uiv check,返回解析后的 report 与耗时;不做任何判定,判定由调用方负责。 */
function runCheckOnce() {
  const t0 = Date.now();
  // checkCmd 在 config 中是单一字符串(便于 ops 只改 json 一处),按空白切成 argv 后经
  // execFileSync(无 shell)执行,避免字符串直接过 shell 插值(该字符串本身不含空格路径,
  // 空白切分足够;无 shell 意味着 shell 元字符不会被解释)。
  const [command, ...args] = cfg.checkCmd.split(/\s+/).filter(Boolean);
  try {
    execFileSync(command, args, { cwd: ROOT, stdio: 'inherit' });
  } catch {
    /* uiv check 在 report.pass!==true 时以非零退出,report.json 仍已产出,判定看 report 本身 */
  }
  const checkMs = Date.now() - t0;
  const reportPath = abs(cfg.reportPath);
  if (!fs.existsSync(reportPath)) {
    console.error(`harness 错误:未产出 ${cfg.reportPath}`);
    process.exit(1);
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  return { report, checkMs };
}

function step() {
  gitGuard();
  const state = readState();
  const round = state.rounds.length + 1;
  const { report, checkMs } = runCheckOnce();

  fs.mkdirSync(stateDir, { recursive: true });
  const strippedPath = path.join(stateDir, `round-${round}-report.json`);
  fs.writeFileSync(strippedPath, JSON.stringify(stripArtifacts(report), null, 2));

  const violationsCount = report.structural?.violations?.length ?? null;
  const missingCount = report.structural?.missing?.length ?? null;
  state.rounds.push({
    round,
    violations: violationsCount,
    missing: missingCount,
    score: report.score ?? null,
    pass: report.pass === true,
    reason: report.reason ?? null,
    regression: report.regression === true,
    checkMs,
  });
  writeState(state);

  const d = decide(report, round, MAX_ROUNDS);
  const next = d.verdict === 'continue' ? 'step' : d.verdict === 'pass' ? 'finalize' : 'blocked';
  const out = {
    round, pass: d.verdict === 'pass', violationsCount, missing: missingCount,
    score: report.score ?? null, next, reportPath: path.relative(ROOT, strippedPath),
  };
  console.log(JSON.stringify(out));
  if (d.verdict === 'pass') process.exit(10);
  if (d.verdict === 'fail') process.exit(d.reason === 'regression' ? 21 : 20);
  process.exit(0);
}

function verifyDetection() {
  gitGuard();
  const { report, checkMs } = runCheckOnce();
  const misses = assertSeededDetection(report);
  fs.mkdirSync(stateDir, { recursive: true });
  const strippedPath = path.join(stateDir, 'verify-detection-report.json');
  fs.writeFileSync(strippedPath, JSON.stringify(stripArtifacts(report), null, 2));
  const total = 4;
  const hit = total - misses.length;
  console.log(JSON.stringify({
    mode: 'verify-detection', hit, total, misses, checkMs,
    reportPath: path.relative(ROOT, strippedPath),
  }));
  if (misses.length > 0) {
    console.error(`检出能力不足(${hit}/${total}):${misses.join('; ')}`);
    process.exit(31);
  }
  console.log(`检出能力门通过:${hit}/${total} seeded deviations 全部命中`);
}

function finalize() {
  const state = readState();
  const last = state.rounds.at(-1);
  if (!last || last.pass !== true || state.rounds.length > MAX_ROUNDS) {
    console.error(`验收未达标:rounds=${state.rounds.length}, lastPass=${last?.pass ?? 'n/a'}`);
    process.exit(1);
  }
  const finishedAt = Date.now();
  fs.mkdirSync(path.dirname(abs(cfg.docPath)), { recursive: true });
  fs.writeFileSync(abs(cfg.docPath), renderAcceptanceDoc({
    rounds: state.rounds, verdict: 'pass', deviations: cfg.deviations,
    startedAt: state.startedAt, finishedAt,
  }));
  const meta = JSON.parse(fs.readFileSync(abs(cfg.metaPath), 'utf8'));
  const checkMsPerRound = state.rounds.map((r) => r.checkMs);
  const sorted = [...checkMsPerRound].sort((a, b) => a - b);
  meta.latency_baseline = meta.latency_baseline ?? {};
  meta.latency_baseline.phase0_loop = {
    rounds: state.rounds.length,
    checkMsPerRound,
    p50CheckMs: sorted[Math.floor((sorted.length - 1) / 2)],
    totalWallMs: finishedAt - state.startedAt,
    recordedAt: new Date(finishedAt).toISOString(),
  };
  fs.writeFileSync(abs(cfg.metaPath), JSON.stringify(meta, null, 2));
  console.log(`验收通过:${cfg.docPath} 已生成,latency_baseline.phase0_loop 已写入 ${cfg.metaPath}`);
}

const mode = process.argv[2];
if (mode === '--inject') inject();
else if (mode === '--step') step();
else if (mode === '--verify-detection') verifyDetection();
else if (mode === '--finalize') finalize();
else {
  console.error('用法: node scripts/phase0-acceptance.mjs <--inject|--step|--verify-detection|--finalize>');
  process.exit(2);
}
