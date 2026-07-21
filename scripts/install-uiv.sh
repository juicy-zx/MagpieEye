#!/usr/bin/env bash
# install-uiv.sh — 新设备克隆本仓后一键安装 uiv(Node CLI)。
#
# 用法(在仓库根执行):
#   ./scripts/install-uiv.sh              # npm 安装构建 + 全局 uiv 命令
#   ./scripts/install-uiv.sh --skip-link  # 不建全局命令(用 node packages/uiv-cli/dist/index.js 调用)
#
# 前置(脚本会检查):Node >= 26 / npm >= 11;首次安装需联网(npm 依赖)。
# Android harness 制品(com.magpie.uiv:view-dump / semantics-dump)由远程 Maven 仓
# 预先发布提供,本脚本不处理——目标 Android 工程的 repositories 需包含该远程仓。
# 目标工程跑真渲染另需 JDK + Android SDK(工程自身的 gradle 前置,与本安装无关)。
# 平台:macOS / Linux(bash)。Windows 请用 WSL。--sandbox 隔离 lane 仅 macOS,direct lane 全平台。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
SKIP_LINK=0
for a in "$@"; do
  case "$a" in
    --skip-link) SKIP_LINK=1 ;;
    *) echo "未知参数: $a(可用 --skip-link)"; exit 2 ;;
  esac
done

step() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*"; exit 1; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }

# ---------- 0. 前置检查 ----------
step "0/3 前置检查"
command -v node >/dev/null || die "缺 Node(需 >=26):https://nodejs.org"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 26 ] || die "Node $(node -v) 过低,uiv 要求 >=26(engines 硬门)"
ok "Node $(node -v)"
NPM_MAJOR="$(npm -v | cut -d. -f1)"
[ "$NPM_MAJOR" -ge 11 ] || die "npm $(npm -v) 过低,要求 >=11"
ok "npm $(npm -v)"

# ---------- 1. 依赖 + 构建 ----------
step "1/3 npm install + build(workspaces:uiv-core / uiv-cli / ui-verify-mcp)"
npm install
npm run build
ok "dist 构建完成"

# ---------- 2. 全局 uiv 命令 ----------
if [ "$SKIP_LINK" -eq 0 ]; then
  step "2/3 建全局 uiv 命令(npm link)"
  if npm link --workspace packages/uiv-cli 2>/dev/null; then
    ok "已链接:$(command -v uiv || echo '(新 shell 生效)')"
  else
    # npm 前缀不可写等场景:退化为用户级 wrapper
    mkdir -p "$HOME/.local/bin"
    printf '#!/bin/sh\nexec node "%s/packages/uiv-cli/dist/index.js" "$@"\n' "$REPO_ROOT" > "$HOME/.local/bin/uiv"
    chmod +x "$HOME/.local/bin/uiv"
    ok "npm link 不可用,已写 wrapper 到 ~/.local/bin/uiv(请确保 ~/.local/bin 在 PATH)"
  fi
else
  step "2/3 跳过全局命令(--skip-link);调用方式:node $REPO_ROOT/packages/uiv-cli/dist/index.js"
fi

# ---------- 3. 验收 ----------
step "3/3 验收"
UIV_BIN="uiv"; command -v uiv >/dev/null || UIV_BIN="node $REPO_ROOT/packages/uiv-cli/dist/index.js"
$UIV_BIN --version >/dev/null || die "uiv --version 失败"
ok "uiv --version = $($UIV_BIN --version)"

cat <<'EOF'

安装完成。下一步(在目标 Android 工程):
  1. 接线 harness 制品(本脚本只装 CLI,不改你的工程;以下两处需手工加):

     // settings.gradle(.kts) 的 dependencyResolutionManagement.repositories
     // 或 build.gradle(.kts) 的 allprojects.repositories —— 按你工程的形态二选一
     maven { url = uri("https://juicy-zx.github.io/MagpieEye/maven") }

     // 目标模块 build.gradle(.kts) 的 dependencies —— View/XML 与 Compose 各取其一
     testImplementation("com.magpie.uiv:view-dump:0.1.0")        // View / XML 布局
     testImplementation("com.magpie.uiv:semantics-dump:0.1.0")   // Jetpack Compose
     // 另需 roborazzi(产 PNG):testImplementation("io.github.takahirom.roborazzi:roborazzi:1.63.0")
     // 无需任何 gradle 插件——属性转发由 uiv CLI 的 init script 自动注入
  2. uiv preflight --project <工程根> --module :app --json   # 静态环境门
  3. 按 .claude/skills/uiv-design-to-layout/ 的规程接线模块、写布局与 ScreenshotTest
  4. uiv check --preview <pkg>.<Name>Preview --node <figmaId> --demo <工程根> --module :app
注意:首次 uiv check 渲染会由 gradle 下载 harness 制品与 Robolectric android-all(需联网一次);之后可离线。
EOF
