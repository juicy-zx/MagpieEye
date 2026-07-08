#!/usr/bin/env bash
# T1.1:暖/冷 Gradle 下单 preview 截图测试端到端延迟(设计文档第 8 节 Day 1;冷=冷 daemon,非冷缓存)
# 用法: measure-latency.sh [cold|warm|merge]  —— 冷/暖各 3 轮,分阶段执行避免单次超长;merge 汇总
set -euo pipefail
DEMO="$(cd "$(dirname "$0")/../demo-android" && pwd)"
DOCS="$(cd "$DEMO/.." && pwd)/docs"
cd "$DEMO"
export GRADLE_USER_HOME="$DEMO/.gradle-home"

now_ms() { node -e 'process.stdout.write(String(Date.now()))'; }
run_once() {
  ./gradlew "$@" :app:testDebugUnitTest \
    --tests 'com.magpie.uiv.demo.CalibCardScreenshotTest' \
    -Proborazzi.test.record=true --rerun >/dev/null
}

PHASE="${1:-all}"

if [ "$PHASE" = "cold" ] || [ "$PHASE" = "all" ]; then
  COLD=()
  for i in 1 2 3; do
    ./gradlew --stop >/dev/null 2>&1 || true
    t0=$(now_ms); run_once --no-daemon; t1=$(now_ms); COLD+=("$((t1 - t0))")
  done
  printf '{"cold_ms":[%d,%d,%d]}\n' "${COLD[0]}" "${COLD[1]}" "${COLD[2]}" > "$DOCS/latency-cold.tmp.json"
  cat "$DOCS/latency-cold.tmp.json"
fi

if [ "$PHASE" = "warm" ] || [ "$PHASE" = "all" ]; then
  ./gradlew help >/dev/null 2>&1   # 起 daemon
  WARM=()
  for i in 1 2 3; do
    t0=$(now_ms); run_once; t1=$(now_ms); WARM+=("$((t1 - t0))")
  done
  printf '{"warm_ms":[%d,%d,%d]}\n' "${WARM[0]}" "${WARM[1]}" "${WARM[2]}" > "$DOCS/latency-warm.tmp.json"
  cat "$DOCS/latency-warm.tmp.json"
fi

if [ "$PHASE" = "merge" ] || [ "$PHASE" = "all" ]; then
  node -e '
    const fs = require("fs");
    const docs = process.argv[1];
    const cold = JSON.parse(fs.readFileSync(`${docs}/latency-cold.tmp.json`, "utf8")).cold_ms;
    const warm = JSON.parse(fs.readFileSync(`${docs}/latency-warm.tmp.json`, "utf8")).warm_ms;
    fs.writeFileSync(`${docs}/latency-t1.1.json`, JSON.stringify({ cold_ms: cold, warm_ms: warm }) + "\n");
    fs.rmSync(`${docs}/latency-cold.tmp.json`); fs.rmSync(`${docs}/latency-warm.tmp.json`);
    console.log(fs.readFileSync(`${docs}/latency-t1.1.json`, "utf8").trim());
  ' "$DOCS"
fi
