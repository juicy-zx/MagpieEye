#!/usr/bin/env bash
# T2.1 等价验收:写偏卡片,冷/热两路径各跑一次 check,逐字段比对 report。
# 子命令:deviate | leg cold | leg hot | diff。cwd 恒 WS。
set -euo pipefail
cd "$(cd "$(dirname "$0")/../.." && pwd)"

CARD=demo-android/app/src/main/java/com/magpie/uiv/demo/CalibCard.kt
R=.ui-verify/reports/1-100@T1_0A_V1/report.json
T=.calib-tmp/t2.1
S=.ui-verify/daemon.sock
BAK=$T/CARD.orig
mkdir -p "$T"

CHECK=(node packages/uiv-cli/dist/index.js check
  --preview com.magpie.uiv.demo.CalibCardPreview --node 1:100 --demo demo-android)

leg () {
  # $1 = cold|hot;写偏态下 check 必失败(ec=1),报告落 $T/$1.json
  rm -f .ui-verify/state.json          # 防震荡状态污染(每路径独立起算)
  set +e
  "${CHECK[@]}" >/dev/null 2>"$T/$1.err"
  ec=$?
  set -e
  grep -q "lane=$1" "$T/$1.err" || { echo "leg $1: lane mismatch"; cat "$T/$1.err"; exit 4; }
  [ "$ec" -eq 1 ] || { echo "leg $1: expected ec=1 (deviated must fail), got $ec"; sed -n '1,40p' "$T/$1.err"; exit 4; }
  cp "$R" "$T/$1.json"
  echo "LEG-$1-OK"
}

case "${1:-}" in
  deviate)
    git diff --quiet -- "$CARD" || { echo "CARD dirty; refuse to deviate"; exit 3; }
    cp "$CARD" "$BAK"                   # 临时备份(不经 git),供 diff 子命令原样恢复
    sed -i '' 's/12\.dp to 36\.dp,/20.dp to 44.dp,/' "$CARD"   # subtitle +8,+8 → 稳定 position 违规
    grep -q '20.dp to 44.dp' "$CARD" && echo DEVIATED
    ;;
  leg)
    case "${2:-}" in
      cold) [ ! -S "$S" ] || { echo "cold requires NO daemon sock at $S"; exit 3; }; leg cold ;;
      hot)  { [ -S "$S" ] && [ "$(stat -f %Lp "$S")" = 600 ]; } || { echo "hot requires 0600 sock at $S"; exit 5; }; leg hot ;;
      *) echo "usage: equivalence.sh leg cold|hot"; exit 2 ;;
    esac
    ;;
  diff)
    set +e
    node scripts/t2.1/diff-reports.mjs "$T/cold.json" "$T/hot.json"
    dec=$?
    set -e
    mv "$BAK" "$CARD"                   # 备份恢复(非 git checkout,不触 git 索引)
    echo RESTORED
    exit "$dec"
    ;;
  *)
    echo "usage: equivalence.sh deviate | leg cold|hot | diff"; exit 2 ;;
esac
