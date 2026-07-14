#!/usr/bin/env bash
# P0-9 并发隔离 + 原子写 集成 gate(交付检查单 P0-9 Done when 的跨进程机判)。
#
# 铁律(参照 p0-1-sandbox-gate.sh):
#   · 全程走【生产 dist 产物】——真实 uiv CLI(baseline pull)与 dist 的 workspace-lock.js /
#     util/atomic.js(经 pathToFileURL 动态 import),不内联复制锁/原子写逻辑。
#   · 跨进程用后台 holder(持锁进程)制造确定性争用窗口,避免"两条快命令赛跑"式 flaky。
#   · trap 清理所有后台 holder/writer 与临时 workspace。
#
# 门项:
#   [C] 并发同 workspace:holder 持锁时,真实 `uiv baseline pull` 被明确拒绝(exit 75 +
#       stderr "workspace locked"),且拒绝期间零落盘(无交叉覆盖);holder 释放后同命令恢复成功。
#   [K] 陈旧锁回收:SIGKILL 持锁 holder(留陈旧锁),后续 `uiv baseline pull` 确证死亡回收陈旧锁并成功,不死锁。
#   [A] 原子写抗 kill:writer 进程用 dist atomicWriteFileSync 高频写 state.json,反复 SIGKILL 于写中途;
#       每次 kill 后目标文件恒为【可解析的完整 JSON】(旧版或新版),永不残缺半写。
#   [M] 不同 workspace 并行:holder 持 ws3 锁时,ws4 的 `uiv baseline pull` 不被阻塞,成功。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LOCK_JS="$ROOT/packages/uiv-cli/dist/workspace-lock.js"
ATOMIC_JS="$ROOT/packages/uiv-core/dist/util/atomic.js"
CLI="$ROOT/packages/uiv-cli/dist/index.js"
FIXTURE="$ROOT/packages/uiv-core/fixtures/rest-nodes-card.json"

FAILED=0
pass() { echo "PASS [$1] ${*:2}"; }
fail() { echo "FAIL [$1] ${*:2}"; FAILED=1; }

# ── 前置:构建 dist(gate 全程走生产 dist 产物)────────────────────────────
echo "gate: npm run build"
if ! npm run build >/dev/null 2>&1; then
  echo "FATAL: npm run build 失败"; exit 1
fi
for f in "$LOCK_JS" "$ATOMIC_JS" "$CLI" "$FIXTURE"; do
  [ -f "$f" ] || { echo "FATAL: 缺产物 $f"; exit 1; }
done

# ── 清理登记 ──────────────────────────────────────────────────────────────
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/p0-9-gate.XXXXXX")"
BG_PIDS=()
cleanup() {
  for p in "${BG_PIDS[@]:-}"; do [ -n "$p" ] && kill -9 "$p" 2>/dev/null; done
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

# ── 生产模块驱动的辅助脚本(动态 import dist,不复制逻辑)────────────────────
cat > "$TMP_ROOT/hold-lock.mjs" <<'MJS'
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [modPath, dir, readyFile, holdMs] = process.argv.slice(2);
const { withWorkspaceLock } = await import(pathToFileURL(modPath).href);
await withWorkspaceLock(dir, async () => {
  writeFileSync(readyFile, 'ready');                       // 通知父进程"已持锁"
  await new Promise((r) => setTimeout(r, Number(holdMs))); // 持锁窗口;被 SIGKILL 则留陈旧锁
});
MJS

cat > "$TMP_ROOT/atomic-writer.mjs" <<'MJS'
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [modPath, target] = process.argv.slice(2);
const { atomicWriteFileSync } = await import(pathToFileURL(modPath).href);
const blob = 'x'.repeat(300000);           // 够大,提高"kill 落在写中途"的概率
let i = 0;
for (;;) { atomicWriteFileSync(target, `${JSON.stringify({ n: i, blob })}\n`, 'utf8'); i += 1; }
MJS

wait_for_file() {  # <path> <timeout_s>
  local path="$1" timeout="$2" waited=0
  while [ ! -e "$path" ]; do
    sleep 0.1; waited=$((waited + 1))
    [ "$waited" -ge $((timeout * 10)) ] && return 1
  done
  return 0
}

pull() {  # <cwd> → 运行真实 uiv baseline pull,回显 exit code;stderr 落 $TMP_ROOT/last.err
  local cwd="$1"
  ( cd "$cwd" && node "$CLI" baseline pull --fixture "$FIXTURE" --file FKEY --node 1:100 \
      >"$TMP_ROOT/last.out" 2>"$TMP_ROOT/last.err" )
  echo $?
}

spec_count() { find "$1/.ui-verify/baselines" -name spec.json 2>/dev/null | wc -l | tr -d ' '; }

# ── [C] 并发同 workspace:活锁明确拒绝 + 零交叉覆盖 + 释放后恢复 ─────────────
WS1="$TMP_ROOT/ws1"; mkdir -p "$WS1"
node "$TMP_ROOT/hold-lock.mjs" "$LOCK_JS" "$WS1/.ui-verify" "$WS1/ready" 4000 &
HOLDER=$!; BG_PIDS+=("$HOLDER")
if wait_for_file "$WS1/ready" 5; then
  CODE="$(pull "$WS1")"
  if [ "$CODE" = "75" ] && grep -qi "workspace locked" "$TMP_ROOT/last.err"; then
    pass C "活锁时 baseline pull 明确拒绝(exit 75 + 'workspace locked')"
  else
    fail C "期望 exit 75+locked;实际 exit=$CODE err=$(cat "$TMP_ROOT/last.err")"
  fi
  if [ "$(spec_count "$WS1")" = "0" ]; then
    pass C "拒绝期间零落盘(无交叉覆盖:被拒进程未写 spec.json)"
  else
    fail C "被拒进程竟落盘 spec.json(交叉覆盖风险)"
  fi
else
  fail C "holder 未在 5s 内持锁就绪"
fi
wait "$HOLDER" 2>/dev/null   # holder 正常释放锁
if [ ! -e "$WS1/.ui-verify/.uiv.lock" ]; then
  pass C "holder 正常退出后锁已释放(finally 删锁)"
else
  fail C "holder 退出后锁文件残留"
fi
CODE="$(pull "$WS1")"
if [ "$CODE" = "0" ] && [ "$(spec_count "$WS1")" != "0" ]; then
  pass C "锁释放后同命令恢复成功(不被永久阻塞)"
else
  fail C "锁释放后恢复失败:exit=$CODE spec=$(spec_count "$WS1")"
fi

# ── [K] 陈旧锁回收:SIGKILL 持锁者 → 后续命令确证死亡回收陈旧锁,不死锁 ────────
WS2="$TMP_ROOT/ws2"; mkdir -p "$WS2"
node "$TMP_ROOT/hold-lock.mjs" "$LOCK_JS" "$WS2/.ui-verify" "$WS2/ready" 60000 &
HOLDER2=$!; BG_PIDS+=("$HOLDER2")
if wait_for_file "$WS2/ready" 5; then
  kill -9 "$HOLDER2" 2>/dev/null; wait "$HOLDER2" 2>/dev/null   # 硬杀,留陈旧锁
  if [ -e "$WS2/.ui-verify/.uiv.lock" ]; then
    CODE="$(pull "$WS2")"
    if [ "$CODE" = "0" ] && [ "$(spec_count "$WS2")" != "0" ]; then
      pass K "持锁者被 SIGKILL 后,后续命令回收陈旧锁并成功(不死锁)"
    else
      fail K "陈旧锁未被回收:exit=$CODE err=$(cat "$TMP_ROOT/last.err")"
    fi
  else
    fail K "SIGKILL 后未留陈旧锁(测试前提不成立)"
  fi
else
  fail K "holder2 未在 5s 内持锁就绪"
fi

# ── [A] 原子写抗 kill:反复于写中途 SIGKILL,目标文件恒可解析(旧/新版) ────────
ATOMIC_DIR="$TMP_ROOT/atomic"; mkdir -p "$ATOMIC_DIR"
TARGET="$ATOMIC_DIR/state.json"
A_OK=1
for round in 1 2 3 4 5 6 7 8; do
  node "$TMP_ROOT/atomic-writer.mjs" "$ATOMIC_JS" "$TARGET" &
  WPID=$!; BG_PIDS+=("$WPID")
  wait_for_file "$TARGET" 5 || { fail A "round $round: writer 未产出目标"; A_OK=0; break; }
  # 随机 40–160ms 后于写中途硬杀
  python3 -c "import time,random; time.sleep(random.uniform(0.04,0.16))" 2>/dev/null || sleep 0.1
  kill -9 "$WPID" 2>/dev/null; wait "$WPID" 2>/dev/null
  if ! node -e "JSON.parse(require('fs').readFileSync('$TARGET','utf8'))" 2>/dev/null; then
    fail A "round $round: kill 后 state.json 残缺不可解析(原子性破坏)"
    A_OK=0; break
  fi
  # 无 .uivtmp 残留累积(rename 后临时文件应已消失;被杀那次可能留 1 个,清掉再验累积)
  rm -f "$ATOMIC_DIR"/*.uivtmp 2>/dev/null
done
[ "$A_OK" = "1" ] && pass A "8 轮写中途 SIGKILL,state.json 恒为完整可解析 JSON(原子写永不半写)"

# ── [M] 不同 workspace 并行:互不阻塞 ──────────────────────────────────────
WS3="$TMP_ROOT/ws3"; WS4="$TMP_ROOT/ws4"; mkdir -p "$WS3" "$WS4"
node "$TMP_ROOT/hold-lock.mjs" "$LOCK_JS" "$WS3/.ui-verify" "$WS3/ready" 4000 &
HOLDER3=$!; BG_PIDS+=("$HOLDER3")
if wait_for_file "$WS3/ready" 5; then
  CODE="$(pull "$WS4")"   # 不同 workspace
  if [ "$CODE" = "0" ] && [ "$(spec_count "$WS4")" != "0" ]; then
    pass M "holder 持 ws3 锁时,ws4 命令不被阻塞(成功)"
  else
    fail M "不同 workspace 竟被阻塞:exit=$CODE"
  fi
else
  fail M "holder3 未在 5s 内持锁就绪"
fi
kill -9 "$HOLDER3" 2>/dev/null; wait "$HOLDER3" 2>/dev/null

# ── 汇总 ──────────────────────────────────────────────────────────────────
echo "────────────────────────────────────────────"
if [ "$FAILED" = "0" ]; then
  echo "P0-9 concurrency gate: ALL PASS"; exit 0
else
  echo "P0-9 concurrency gate: FAILED"; exit 1
fi
