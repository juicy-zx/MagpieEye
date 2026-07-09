#!/usr/bin/env bash
# T4.3:本地 CI 入口(模拟"CI 平台调用点"的可机判形态)。真实远程 CI(GitHub Actions/
# Jenkins 等 yaml)是用户侧 followup,本脚本只是那个 yaml 会调用的等价本地命令序列。
#
# 两道门性质区分(设计文档 5.3,milestone-4.md T4.3 §0;不可混用名字):
#   门 A:UI parity 硬门禁 —— `uiv verify-page` + `uiv report --junit`。
#         回答"像不像设计稿"(L2 结构断言,唯一裁决者)。exit code 即门:非 0 立即 FAIL 整个 gate。
#   门 B:视觉回归套件 —— `verifyRoborazziDebug` 等价显式形态(CalibCardScreenshotTest,
#         -Proborazzi.test.verify=true)。回答"UI 有没有非预期变更"(同渲染器这次 vs 上次)。
#         默认仅报告(WARN,不阻断);仅当显式声明 UIV_CI_BLOCK_REGRESSION=1 且给出
#         UIV_CI_TOLERANCE(容差 threshold validator)才可能阻断——未声明容差就要求阻断视为用法错误。
#   哨兵:设计稿漂移 —— `uiv baseline pull --check-version`。回答"钉住的 version 是否落后
#         Figma /meta 最新"。只告警不阻断,exit 恒 0;重录基准需人工触发(re-pin)。
#
# 铁律:golden(demo-android/app/src/test/snapshots/*.png)仅在 macOS 录制 —— Linux 字体
# 渲染与 macOS 不一致(Paparazzi #1465 实锤同类问题)。若未来本 CI 移到 Linux 跑:门 B 改用
# 容差 comparator 或只跑 L1/L2 结构断言,禁止裸像素 golden 门禁(会被字体渲染差异污染出假红)。
#
# 依赖:/usr/bin/xmllint(macOS 系统自带,libxml2 --schema 校验;非 macOS 环境需自行安装同名工具)。
#
# 环境变量(均可选,给出默认值):
#   UIV_CI_TEST               门 A verify-page 的 --test FQN(默认取
#                              scripts/m3-t35/calib-page-report.snapshot.json 的 .test 字段)
#   UIV_CI_NODE                门 A verify-page 的 --node(默认 1:100)
#   UIV_CI_BLOCK_REGRESSION    '1' = 门 B 声明阻断意图(默认不设,即默认不阻断)
#   UIV_CI_TOLERANCE            门 B 阻断时的显式容差(0..1,传给 -Puiv.ci.threshold);
#                              UIV_CI_BLOCK_REGRESSION=1 但未设此项 → 用法错误,exit 2
#   UIV_CI_META_FIXTURE        哨兵 --meta-fixture 路径(默认 scripts/fixtures/figma-meta.drifted.json;
#                              真实定期轮询 REST /meta = pending_followups B1,此处仍是 fixture 驱动)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

UIV_CI_TEST="${UIV_CI_TEST:-$(node -e "console.log(JSON.parse(require('fs').readFileSync('scripts/m3-t35/calib-page-report.snapshot.json','utf8')).test)")}"
UIV_CI_NODE="${UIV_CI_NODE:-1:100}"
UIV_CI_META_FIXTURE="${UIV_CI_META_FIXTURE:-scripts/fixtures/figma-meta.drifted.json}"

UIV="node packages/uiv-cli/dist/index.js"
GRADLEW=(env "GRADLE_USER_HOME=$ROOT/demo-android/.gradle-home" "$ROOT/demo-android/gradlew" -p "$ROOT/demo-android" --console=plain)
PAGE_REPORT=".ui-verify/reports/ci/page-report.json"
JUNIT_XML=".ui-verify/reports/ci/junit.xml"

echo "ci-gate: npm run build"
npm run build

# ── 门 A:UI parity 硬门禁 ───────────────────────────────────────────────
echo "ci-gate: [gate-A] uiv verify-page --test $UIV_CI_TEST --node $UIV_CI_NODE"
GATE_A_RC=0
# 注:不可写成 `if ! CMD; then RC=$?; fi` —— then 分支内的 $? 是取反后条件表达式自身的退出码
# (恒 0,否则不会进 then),并非 CMD 的真实退出码;`CMD || RC=$?` 才能正确捕获且不触发 set -e。
$UIV verify-page --test "$UIV_CI_TEST" --node "$UIV_CI_NODE" --demo demo-android --session ci --json --out "$PAGE_REPORT" || GATE_A_RC=$?

# JUnit XML 转换 + schema 校验恒执行(不管门 A 输赢)——CI 平台失败时更需要这份 XML。
echo "ci-gate: [gate-A] uiv report --junit"
$UIV report --junit --in "$PAGE_REPORT" --out "$JUNIT_XML"
/usr/bin/xmllint --noout --schema scripts/fixtures/junit/junit.xsd "$JUNIT_XML"

if [ "$GATE_A_RC" -ne 0 ]; then
  echo "FAIL [gate-A] ui parity"
  exit "$GATE_A_RC"
fi
echo "ci-gate: [gate-A] PASS"

# ── 门 B:视觉回归套件(默认仅报告)────────────────────────────────────────
# 范围钉死 *CalibCardScreenshotTest —— 仓库仅此一个测试录了 golden(见 T4.3 §1 硬约束),
# 裸 :app:verifyRoborazziDebug 全量跑会因其余未录 golden 的测试假红。
echo "ci-gate: [gate-B] visual regression suite (CalibCardScreenshotTest, verify mode)"
GATE_B_RC=0
"${GRADLEW[@]}" :app:testDebugUnitTest --tests '*CalibCardScreenshotTest' -Proborazzi.test.verify=true --rerun || GATE_B_RC=$?

if [ "$GATE_B_RC" -ne 0 ]; then
  echo "WARN [gate-B] visual regression detected (diff: demo-android/app/build/outputs/roborazzi/); 默认不阻断——设计文档 5.3"
  if [ "${UIV_CI_BLOCK_REGRESSION:-}" = "1" ]; then
    if [ -z "${UIV_CI_TOLERANCE:-}" ]; then
      echo "ERROR: blocking requires explicit tolerance (设计文档 5.3)"
      exit 2
    fi
    echo "ci-gate: [gate-B] UIV_CI_BLOCK_REGRESSION=1, retrying with -Puiv.ci.threshold=$UIV_CI_TOLERANCE"
    GATE_B_RETRY_RC=0
    "${GRADLEW[@]}" :app:testDebugUnitTest --tests '*CalibCardScreenshotTest' -Proborazzi.test.verify=true -Puiv.ci.threshold="$UIV_CI_TOLERANCE" --rerun || GATE_B_RETRY_RC=$?
    if [ "$GATE_B_RETRY_RC" -ne 0 ]; then
      echo "FAIL [gate-B] visual regression exceeds declared tolerance ($UIV_CI_TOLERANCE)"
      exit 1
    fi
    echo "ci-gate: [gate-B] within declared tolerance ($UIV_CI_TOLERANCE)"
  fi
else
  echo "ci-gate: [gate-B] PASS (no regression)"
fi

# ── 哨兵:设计稿漂移(只告警,不影响 exit)──────────────────────────────────
echo "ci-gate: [sentinel] design drift check (--meta-fixture $UIV_CI_META_FIXTURE; 真实定期轮询 REST /meta = followup B1)"
$UIV baseline pull --check-version --file FKEY --meta-fixture "$UIV_CI_META_FIXTURE"

echo "ci-gate: PASS"
