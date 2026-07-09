#!/usr/bin/env bash
# T3.5 M3 北极星验收：两半拼合演示（非 LLM 环节全真实）+ 存量回归门禁。
#   半程 1（真实工具链，magpie_eye）：uiv verify-page 对 demo-android 真渲染真裁判 → pass:true。
#   半程 2（真实 loop，magpie_agent vitest）：ui_change 需求经 loop 全自动跑通至 completed（收官用例）。
#   第 3 节：存量回归门禁（失败集 ⊆ 基线；新文件全绿；通过数达标）。
# exit 0 即 “一个 ui_change 需求在 loop 全自动跑通” 的机判形态（M3 T3.5 北极星）。
set -euo pipefail

MAGPIE_EYE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MAGPIE_AGENT_DIR="${MAGPIE_AGENT_DIR:-$(cd "$MAGPIE_EYE_DIR/../magpie_agent" && pwd)}"
SNAPSHOT="$MAGPIE_EYE_DIR/scripts/m3-t35/calib-page-report.snapshot.json"
KNOWN="$MAGPIE_AGENT_DIR/tests/fixtures/ui-visual/known-env-failures.txt"
GATE="$MAGPIE_EYE_DIR/scripts/m3-t35/regression-gate.mjs"
CHECK_HALF1="$MAGPIE_EYE_DIR/scripts/m3-t35/check-half1.mjs"
TMP="$(mktemp -d)"
FRESH="$TMP/half1-report.json"

echo "================ 半程 1：真实 uiv verify-page（demo-android 真渲染真裁判）================"
cd "$MAGPIE_EYE_DIR"
TEST="$(node -e "console.log(require('$SNAPSHOT').test)")"
node packages/uiv-cli/dist/index.js verify-page \
  --test "$TEST" --node "1:100" --demo demo-android --session standalone --json --out "$FRESH" \
  > "$TMP/half1-stdout.txt"
echo "  verify-page 完成（page-report: $(tail -1 "$TMP/half1-stdout.txt")）"
node "$CHECK_HALF1" "$FRESH" "$SNAPSHOT"

echo "================ 半程 2 + 第 3 节回归门禁：magpie_agent 全量 vitest（含收官 E2E）================"
cd "$MAGPIE_AGENT_DIR"
# 全量跑一次即同时覆盖：半程 2 收官用例（在 ui-visual-validation.test.ts 内）+ 第 3 节回归门禁。
npx vitest run --reporter=json --outputFile="$TMP/t35-vitest.json" > "$TMP/vitest-console.txt" 2>&1 || true
node "$GATE" "$TMP/t35-vitest.json" "$MAGPIE_AGENT_DIR" "$KNOWN"

echo "================ M3 T3.5 北极星验收：PASS ================"
echo "  半程1：真实 verify-page pass:true（demo-android 真渲染）"
echo "  半程2：ui_change 需求 loop 全自动跑通至 completed（收官用例绿）"
echo "  回归：失败集 ⊆ 基线 + 新文件全绿 + 通过数达标"
