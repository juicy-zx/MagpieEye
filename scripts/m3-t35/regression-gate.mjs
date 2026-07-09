#!/usr/bin/env node
// T3.5 存量回归门禁（演示脚本第 3 节）。读 magpie_agent 全量 vitest JSON，判定：
//   (a) 失败集 ⊆ 已记录基线（3 条确定性 Go + 4 个并行 flaky 文件）；任何越界失败先隔离复跑复核，
//       复跑仍失败 = 真回归 → 门禁红；复跑绿 = 确认 flaky（时序竞争）→ 容忍。
//   (b) 新文件 ui-visual-validation.test.ts 全 pass。
//   (c) 通过数 ≥ 基线（3364）。
// 用法：node regression-gate.mjs <vitest-json> <magpie-agent-dir> <known-env-failures.txt>
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';

const [jsonPath, agentDir, knownPath] = process.argv.slice(2);
if (!jsonPath || !agentDir || !knownPath) {
  console.error('usage: regression-gate.mjs <vitest-json> <magpie-agent-dir> <known-env-failures.txt>');
  process.exit(2);
}

const PASS_BASELINE = 3364;
const NEW_FILE = 'tests/capabilities/loop/ui-visual-validation.test.ts';

// 解析基线名单。
const goTitles = new Set();
const flakyFiles = new Set();
for (const line of readFileSync(knownPath, 'utf-8').split('\n')) {
  const t = line.trim();
  if (t.startsWith('#') || !t) continue;
  const parts = t.split('|').map((s) => s.trim());
  if (parts[0] === 'GO-ENV' && parts[2]) goTitles.add(parts[2]);
  if (parts[0] === 'FLAKY-PARALLEL' && parts[1]) flakyFiles.add(parts[1]);
}

const report = JSON.parse(readFileSync(jsonPath, 'utf-8'));
const rel = (name) => name.replace(/.*\/magpie_agent\//, '');

const failures = [];
for (const suite of report.testResults || []) {
  const file = rel(suite.name);
  for (const a of suite.assertionResults || []) {
    if (a.status === 'failed') failures.push({ file, title: a.fullName || a.title });
  }
}

console.log(`[gate] total=${report.numTotalTests} passed=${report.numPassedTests} failed=${report.numFailedTests}`);

// (b) 新文件全 pass。
const newFileFailures = failures.filter((f) => f.file === NEW_FILE);
if (newFileFailures.length > 0) {
  console.error(`[gate] FAIL: 新文件 ${NEW_FILE} 有 ${newFileFailures.length} 条失败：`);
  for (const f of newFileFailures) console.error(`  - ${f.title}`);
  process.exit(1);
}
console.log(`[gate] ok: ${NEW_FILE} 全 pass`);

// (a) 失败分类。
const suspectFiles = new Set();
for (const f of failures) {
  if (goTitles.has(f.title)) continue;             // 确定性 Go 基线
  if (flakyFiles.has(f.file)) continue;            // 已知并行 flaky 文件
  suspectFiles.add(f.file);                        // 越界，待隔离复核
}

for (const file of suspectFiles) {
  console.log(`[gate] 越界失败文件，隔离复跑复核：${file}`);
  try {
    execFileSync('npx', ['vitest', 'run', file], { cwd: agentDir, stdio: 'pipe' });
    console.log(`[gate] ok: ${file} 隔离复跑全绿 → 确认 flaky（时序竞争），容忍`);
  } catch {
    console.error(`[gate] FAIL: ${file} 隔离复跑仍失败 → 判定真回归`);
    process.exit(1);
  }
}
console.log(`[gate] ok: 失败集 ⊆ 基线（Go 确定性 + 并行 flaky）`);

// (c) 通过数。
if ((report.numPassedTests || 0) < PASS_BASELINE) {
  console.error(`[gate] FAIL: 通过数 ${report.numPassedTests} < 基线 ${PASS_BASELINE}`);
  process.exit(1);
}
console.log(`[gate] ok: 通过数 ${report.numPassedTests} >= ${PASS_BASELINE}`);
console.log('[gate] PASS');
