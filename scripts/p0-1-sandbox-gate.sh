#!/usr/bin/env bash
# P0-1 冷路径 macOS Seatbelt 沙箱集成 gate(codex 硬性要求)。
#
# 铁律(codex 定稿):
#   · 最终正向验证必须走【生产路径】SpawnGradleRunner→sandbox-exec→gradlew→testDebugUnitTest,
#     不得直接调 sandbox-exec;
#   · 负控探针用【生产 profile 生成器】(node -e 调 dist 的 buildColdPathProfile),不内联复制 SBPL;
#   · 环境断言经【实际 runner】启临时 wrapper(打印其收到的 env)核验白名单/污染剔除;
#   · trap 清理 sentinel/符号链接/临时 profile;不用破坏工作树或 gradle 缓存的命令。
#
# 门项:
#   [F] 文件 Home 读闸:Home 外(userHome 下、workspace 外)sentinel 读 EPERM;
#       workspace 内指向该 sentinel 的符号链接读亦 EPERM;workspace 内真实文件读放行(正控)。
#   [N] 网络:loopback bind/connect 放行;IPv4 TCP、UDP、外部 IPv6、::ffff:1.1.1.1(IPv4-mapped
#       非回环)均即时 EPERM。
#   [E] 环境:父环境注入污染(假 FIGMA_PAT / 大小写 proxy / _JAVA_OPTIONS / JDK_JAVA_OPTIONS /
#       GRADLE_OPTS),经实际 runner 启 wrapper,断言 JAVA_TOOL_OPTIONS 精确 =
#       -Djava.net.preferIPv4Stack=true,且污染项均不在子进程 env。
#   [B] 真实 testDebugUnitTest(--offline --rerun-tasks --no-build-cache)经生产 runner BUILD
#       SUCCESSFUL + 核验 Roborazzi 产物与测试 XML(--tests 收敛到 CalibCard 以适配前台耗时,
#       仍是真实 testDebugUnitTest 任务)。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEMO="$ROOT/demo-android"
DIST="$ROOT/packages/uiv-cli/dist"
TEST_FQN="com.magpie.uiv.demo.CalibCardScreenshotTest"

if [ "$(uname)" != "Darwin" ]; then
  echo "SKIP: P0-1 冷路径沙箱仅 macOS(darwin);当前 $(uname)"
  exit 0
fi

FAILED=0
pass() { echo "PASS [$1] ${*:2}"; }
fail() { echo "FAIL [$1] ${*:2}"; FAILED=1; }

# ── 前置:构建 dist(gate 全程走生产 dist 产物)───────────────────────────
echo "gate: npm run build"
if ! npm run build >/dev/null 2>&1; then
  echo "FATAL: npm run build 失败"; exit 1
fi

# ── 清理登记 ────────────────────────────────────────────────────────────
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/p0-1-gate.XXXXXX")"
HOME_SENTINEL="$HOME/.uiv-sb-sentinel.$$"      # userHome 下、workspace 外 → 应被读闸拦
WS_SYMLINK="$DEMO/.uiv-sb-symlink.$$"          # workspace 内、指向上面 sentinel → 亦应被拦
cleanup() { rm -f "$HOME_SENTINEL" "$WS_SYMLINK"; rm -rf "$TMP_ROOT"; }
trap cleanup EXIT

# ── 生产 profile 生成(node -e 调 dist buildColdPathProfile;路径探测镜像 SpawnGradleRunner)──
cat > "$TMP_ROOT/gen-profile.mjs" <<'MJS'
import { realpathSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [distJs, demo] = process.argv.slice(2);
const { buildColdPathProfile } = await import(pathToFileURL(distJs).href);

// 探测与生产 SpawnGradleRunner 同源(javaHome/androidSdk 三级 / 两级回退)。
function detectJavaHome(demoDir) {
  const gp = path.join(demoDir, 'gradle.properties');
  if (existsSync(gp)) {
    const m = readFileSync(gp, 'utf8').match(/^[ \t]*org\.gradle\.java\.home[ \t]*=[ \t]*(.+?)[ \t]*$/m);
    if (m && m[1]) return m[1];
  }
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;
  return execFileSync('/usr/libexec/java_home', [], { encoding: 'utf8' }).trim();
}
function detectAndroidSdk(demoDir) {
  const lp = path.join(demoDir, 'local.properties');
  if (existsSync(lp)) {
    const m = readFileSync(lp, 'utf8').match(/^[ \t]*sdk\.dir[ \t]*=[ \t]*(.+?)[ \t]*$/m);
    if (m && m[1]) return m[1].replace(/\\:/g, ':').replace(/\\\\/g, '\\');
  }
  return process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
}

const userHome = realpathSync(os.homedir());
const workspaceRoot = realpathSync(demo);
const sdk = detectAndroidSdk(demo);
const androidSdk = sdk ? realpathSync(sdk) : undefined;
const javaHome = realpathSync(detectJavaHome(demo));
const m2 = path.join(os.homedir(), '.m2', 'repository');
const mavenRepo = existsSync(m2) ? realpathSync(m2) : undefined;
const opts = { userHome, workspaceRoot, javaHome, ...(androidSdk ? { androidSdk } : {}), ...(mavenRepo ? { mavenRepo } : {}) };
process.stdout.write(buildColdPathProfile(opts));
MJS

PROFILE="$TMP_ROOT/cold.sb"
if ! node "$TMP_ROOT/gen-profile.mjs" "$DIST/sandbox-profile.js" "$DEMO" > "$PROFILE" 2>"$TMP_ROOT/gen.err"; then
  echo "FATAL: 生产 profile 生成失败"; cat "$TMP_ROOT/gen.err"; exit 1
fi
echo "gate: 生产 profile 已生成 → $PROFILE"
echo "───── profile ─────"; cat "$PROFILE"; echo "───────────────────"

# ── [F] 文件 Home 读闸 ──────────────────────────────────────────────────
echo "TOP-SECRET-$$-do-not-leak" > "$HOME_SENTINEL"
ln -s "$HOME_SENTINEL" "$WS_SYMLINK"

if sandbox-exec -f "$PROFILE" /bin/cat "$HOME_SENTINEL" >/dev/null 2>&1; then
  fail F "userHome 下 sentinel 竟可读(Home 读闸失效)"
else
  pass F "userHome 下 sentinel 读 EPERM"
fi
if sandbox-exec -f "$PROFILE" /bin/cat "$WS_SYMLINK" >/dev/null 2>&1; then
  fail F "workspace 内符号链接绕过 Home 读闸读到了 sentinel"
else
  pass F "workspace 内符号链接读 EPERM(Seatbelt 按真实路径判定,拦截)"
fi
if sandbox-exec -f "$PROFILE" /bin/cat "$DEMO/settings.gradle.kts" >/dev/null 2>&1; then
  pass F "workspace 内真实文件读放行(正控)"
else
  fail F "workspace 内真实文件读被误拦(放行例外失效)"
fi

# ── [N] 网络 ────────────────────────────────────────────────────────────
cat > "$TMP_ROOT/netprobe.py" <<'PY'
import sys, socket, errno
DENY = (errno.EPERM, errno.EACCES)
def run(mode):
    if mode == 'loopback':
        srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        srv.bind(('127.0.0.1', 0)); srv.listen(1)
        port = srv.getsockname()[1]
        cli = socket.socket(socket.AF_INET, socket.SOCK_STREAM); cli.settimeout(3)
        cli.connect(('127.0.0.1', port)); cli.close(); srv.close()
        print('LOOPBACK_OK'); return 0
    try:
        if mode == 'tcp4':
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM); s.settimeout(3); s.connect(('1.1.1.1', 443))
        elif mode == 'udp4':
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.settimeout(3); s.connect(('1.1.1.1', 53)); s.send(b'x')
        elif mode == 'tcp6':
            s = socket.socket(socket.AF_INET6, socket.SOCK_STREAM); s.settimeout(3); s.connect(('2606:4700:4700::1111', 443))
        elif mode == 'mapped':
            s = socket.socket(socket.AF_INET6, socket.SOCK_STREAM); s.settimeout(3); s.connect(('::ffff:1.1.1.1', 443))
        else:
            print('UNKNOWN_MODE'); return 9
    except socket.timeout:
        print('TIMEOUT'); return 4
    except OSError as e:
        if e.errno in DENY:
            print('EPERM'); return 0
        print('OTHER_ERRNO', e.errno, e); return 2
    print('CONNECTED'); return 3
sys.exit(run(sys.argv[1]))
PY

net_probe() {  # $1=mode  → 0 iff 预期结果(loopback=放行;其余=EPERM)
  sandbox-exec -f "$PROFILE" /usr/bin/python3 -S -E "$TMP_ROOT/netprobe.py" "$1"
}
if net_probe loopback >/dev/null 2>&1; then pass N "loopback bind/connect 放行"; else fail N "loopback 竟被拦"; fi
for m in tcp4 udp4 tcp6 mapped; do
  out="$(net_probe "$m" 2>&1)"; rc=$?
  if [ $rc -eq 0 ]; then pass N "$m 即时 EPERM"; else fail N "$m 未按预期拒绝(rc=$rc out=$out)"; fi
done

# ── runner 驱动(生产 SpawnGradleRunner;内部起 sandbox-exec)────────────
cat > "$TMP_ROOT/run-runner.mjs" <<'MJS'
import { pathToFileURL } from 'node:url';
const [distJs, cwd, ...args] = process.argv.slice(2);
const { SpawnGradleRunner } = await import(pathToFileURL(distJs).href);
const r = await new SpawnGradleRunner(['--no-daemon']).run(cwd, args);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.exitCode);
MJS

# ── [E] 环境断言(经实际 runner 启 wrapper)──────────────────────────────
WRAPDEMO="$TMP_ROOT/wrapdemo"
mkdir -p "$WRAPDEMO"
cat > "$WRAPDEMO/gradlew" <<'WRAP'
#!/bin/sh
/usr/bin/env > "$(dirname "$0")/env-dump.txt"
exit 0
WRAP
chmod +x "$WRAPDEMO/gradlew"

(
  export FIGMA_PAT="fake-should-not-leak-$$"
  export HTTP_PROXY="http://evil:8080"; export http_proxy="http://evil:8080"
  export HTTPS_PROXY="http://evil:8080"; export https_proxy="http://evil:8080"
  export _JAVA_OPTIONS="-Dinjected=1"; export JDK_JAVA_OPTIONS="-Dinjected=2"; export GRADLE_OPTS="-Dinjected=3"
  node "$TMP_ROOT/run-runner.mjs" "$DIST/gradle-runner.js" "$WRAPDEMO" env-dump-run >/dev/null 2>&1
)
DUMP="$WRAPDEMO/env-dump.txt"
if [ ! -f "$DUMP" ]; then
  fail E "wrapper 未经 runner 启动(env-dump 未产出)"
else
  if grep -qx 'JAVA_TOOL_OPTIONS=-Djava.net.preferIPv4Stack=true' "$DUMP"; then
    pass E "JAVA_TOOL_OPTIONS 精确 = -Djava.net.preferIPv4Stack=true"
  else
    fail E "JAVA_TOOL_OPTIONS 不符:$(grep '^JAVA_TOOL_OPTIONS=' "$DUMP" || echo '(缺失)')"
  fi
  for bad in FIGMA_PAT HTTP_PROXY http_proxy HTTPS_PROXY https_proxy _JAVA_OPTIONS JDK_JAVA_OPTIONS GRADLE_OPTS; do
    if grep -q "^${bad}=" "$DUMP"; then fail E "污染项 $bad 泄漏进子进程 env"; else pass E "已剔除污染项 $bad"; fi
  done
  if grep -q '^GRADLE_USER_HOME=' "$DUMP"; then pass E "GRADLE_USER_HOME 已注入"; else fail E "GRADLE_USER_HOME 缺失"; fi
  if grep -q '^JAVA_HOME=' "$DUMP"; then pass E "JAVA_HOME 已注入"; else fail E "JAVA_HOME 缺失"; fi
fi

# ── [B] 真实 testDebugUnitTest 经生产 runner ────────────────────────────
ROBO_DIR="$DEMO/app/build/outputs/roborazzi"
XML="$DEMO/app/build/test-results/testDebugUnitTest/TEST-${TEST_FQN}.xml"
MARKER="$TMP_ROOT/.e2e-marker"; touch "$MARKER"
echo "gate: [B] 生产 runner 跑 testDebugUnitTest --tests $TEST_FQN(前台,gradle 较慢,请稍候)"
node "$TMP_ROOT/run-runner.mjs" "$DIST/gradle-runner.js" "$DEMO" \
  testDebugUnitTest --tests "$TEST_FQN" --offline --rerun-tasks --no-build-cache \
  >"$TMP_ROOT/e2e.log" 2>&1
E2E_RC=$?
if [ $E2E_RC -eq 0 ]; then
  pass B "testDebugUnitTest 经沙箱生产 runner BUILD SUCCESSFUL"
else
  fail B "testDebugUnitTest 失败(rc=$E2E_RC);末 40 行日志:"
  tail -40 "$TMP_ROOT/e2e.log"
fi
if ls "$ROBO_DIR"/CalibCard*.png >/dev/null 2>&1; then pass B "Roborazzi 产物存在($(ls "$ROBO_DIR"/CalibCard*.png | wc -l | tr -d ' ') 件 CalibCard*)"; else fail B "Roborazzi 产物缺失"; fi
if [ -f "$XML" ]; then pass B "测试 XML 存在"; else fail B "测试 XML 缺失:$XML"; fi
if [ -n "$(find "$XML" -newer "$MARKER" 2>/dev/null)" ]; then pass B "测试 XML 本轮新写(--rerun-tasks 生效)"; else fail B "测试 XML 未刷新"; fi

echo "──────────────────────────────────────────────"
if [ $FAILED -eq 0 ]; then echo "P0-1 SANDBOX GATE: ALL PASS"; else echo "P0-1 SANDBOX GATE: FAILED"; fi
exit $FAILED
