#!/usr/bin/env node
// T3.4:内容态端到端 + 字节级确定性(纯 node,常量路径,exit code 机判;沿 check-t10b.mjs 形态)。
// 依赖 dist(先 `npm run build` 或 `tsc -b packages/uiv-core`);invariant 断言经 uiv-core dist 导入。
// 注:runInvariants 尚未入 core barrel(见 milestone-3.md 共享文件登记,收尾 agent 集成),
//   故从 dist/l2/invariant.js 直取;runInvariantOnly 由 report.js 导出(已在 barrel),此处一并直取模块路径,barrel 状态无关。
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInvariants } from '../packages/uiv-core/dist/l2/invariant.js';
import { runInvariantOnly } from '../packages/uiv-core/dist/l2/report.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEMO = join(ROOT, 'demo-android');
const GRADLE_HOME = join(DEMO, '.gradle-home');
const UIV = join(DEMO, 'app', 'build', 'uiv');
const PREVIEWS = join(DEMO, 'app', 'build', 'outputs', 'roborazzi', 'previews');

const die = (code, msg) => { console.error(`[check-t34] FAIL(exit ${code}): ${msg}`); process.exit(code); };
const ok = (msg) => console.log(`[check-t34] OK: ${msg}`);
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

// demo gradle 三件套照旧(GRADLE_USER_HOME=./.gradle-home;Robolectric android-all 由 ~/.m2 解析)。
// 落盘 PNG 须走 roborazzi record 任务(record 属性透传 test worker);裸 testDebugUnitTest 只比对不落盘。
function gradle(extraArgs) {
  execFileSync(join(DEMO, 'gradlew'), ['-p', DEMO, ':app:recordRoborazziDebug', ...extraArgs, '--console=plain'],
    { env: { ...process.env, GRADLE_USER_HOME: GRADLE_HOME }, stdio: 'inherit' });
}

// 1. 禁运行期 Random(demo main;amplify 以零随机上位满足"种子固定")。
try {
  const hit = execFileSync('grep', ['-rn', '-E', 'kotlin\\.random|java\\.util\\.Random', join(DEMO, 'app', 'src', 'main')], { encoding: 'utf8' });
  if (hit.trim()) die(1, `demo main 命中运行期 Random:\n${hit}`);
} catch (e) {
  if (e.status !== 1) die(1, `grep 异常(status=${e.status}):${e.message}`); // grep exit 1 = 无匹配(期望)
}
ok('demo main 无 kotlin.random/java.util.Random');

// 2. 录制 fixture + preview;previews/ 下 FixtureCardPreview PNG 恰 7(CS5 展开 + @PreviewParameter 不设 limit 反证)。
gradle(['--tests', '*FixtureCard*', '--tests', '*PreviewScanner*']);
const previewPngs = existsSync(PREVIEWS)
  ? readdirSync(PREVIEWS).filter((f) => f.includes('FixtureCardPreview') && f.endsWith('.png')) : [];
if (previewPngs.length !== 7) die(3, `FixtureCardPreview PNG 期望 7,实际 ${previewPngs.length}:${previewPngs.join(', ')}`);
ok(`CS5:FixtureCardPreview PNG 恰 7`);

// 3. LONG_TEXT → runInvariants 含 textOverflow(high):故意溢出→invariant fail,hard-gate 端到端证明。
const longDump = JSON.parse(readFileSync(join(UIV, 'fixture_long_text.semantics.json'), 'utf8'));
const longInv = runInvariants(longDump);
if (!longInv.violations.some((v) => v.property === 'textOverflow' && v.severity === 'high')) {
  die(4, `LONG_TEXT 应含 textOverflow(high),实际 violations=${JSON.stringify(longInv.violations.map((v) => v.property))}`);
}
ok('LONG_TEXT → textOverflow(high)hard-gate 端到端');

// 4. RTL → runInvariantOnly:pass ∧ judgePath==='invariant-only' ∧ parityUnavailable===true。
const rtlDump = JSON.parse(readFileSync(join(UIV, 'fixture_rtl.semantics.json'), 'utf8'));
const rtl = runInvariantOnly(rtlDump, {});
if (!(rtl.pass === true && rtl.judgePath === 'invariant-only' && rtl.parityUnavailable === true)) {
  die(5, `RTL invariant-only 期望 pass/invariant-only/parityUnavailable,实际 ${JSON.stringify({ pass: rtl.pass, judgePath: rtl.judgePath, parityUnavailable: rtl.parityUnavailable })}`);
}
ok('RTL → invariant-only pass');

// 5. 字节级确定性:暂存 fixture_long_text.{png,semantics.json} 的 sha256 → --rerun-tasks 二跑 → 双文件一致(D-07:--rerun 防 build cache 假热)。
const pngPath = join(UIV, 'fixture_long_text.png');
const semPath = join(UIV, 'fixture_long_text.semantics.json');
if (!existsSync(pngPath)) die(2, 'fixture_long_text.png 未落盘(record 失败)');
const png1 = sha256(pngPath);
const sem1 = sha256(semPath);
gradle(['--tests', '*FixtureCardScreenshotTest*', '--rerun-tasks']);
const png2 = sha256(pngPath);
const sem2 = sha256(semPath);
if (png1 !== png2) die(2, `fixture_long_text.png sha256 二跑不一致:${png1} vs ${png2}`);
if (sem1 !== sem2) die(2, `fixture_long_text.semantics.json sha256 二跑不一致:${sem1} vs ${sem2}`);
ok('字节级确定性:PNG + semantics 双跑 sha256 一致');

console.log('[check-t34] 全部通过(exit 0)');
process.exit(0);
