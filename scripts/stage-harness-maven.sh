#!/usr/bin/env bash
# stage-harness-maven.sh — 首发原字节脚本:把 ~/.m2 里已锚定摘要的 0.1.0-alpha.4 两枚
# harness AAR 三件套拷入 Maven 目录布局的输出目录,逐件核对 docs/RELEASE-0.1.0-digests.md
# 中登记的 SHA-256,任一不符即失败——防止把和已公示摘要不同字节的产物错发到 gh-pages。
#
# 用法(在仓库根执行):
#   ./scripts/stage-harness-maven.sh [输出目录]   # 默认 ./maven-staging
#
# 前置:~/.m2/repository/com/magpie/uiv/{view-dump,semantics-dump}/0.1.0-alpha.4/ 下需已有
# publishToMavenLocal 产出的 aar/pom/module(即 docs/RELEASE-0.1.0-digests.md §1
# 摘要所锚定的那批同字节文件)。本脚本只拷贝比对,不触发任何 gradle 构建。
#
# 下一步(脚本末尾也会打印):把输出目录内容放入 gh-pages 分支 /maven 并启用 GitHub Pages,
# 详见 docs/release-automation.md。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-./maven-staging}"
VERSION="0.1.0-alpha.4"
DIGESTS_DOC="$REPO_ROOT/docs/RELEASE-0.1.0-digests.md"
M2_BASE="$HOME/.m2/repository/com/magpie/uiv"
ARTIFACTS=(view-dump semantics-dump)

step() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*"; exit 1; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }

[ -f "$DIGESTS_DOC" ] || die "找不到摘要清单:$DIGESTS_DOC"

# 从 docs/RELEASE-0.1.0-digests.md 的表格行里解析某个文件名对应的期望 SHA-256
# (表格形如 `| \`<file>\` | <size> | \`<sha256>\` |`),不硬编码具体摘要值。
expected_sha256() {
  local fname="$1"
  grep -F "\`${fname}\`" "$DIGESTS_DOC" \
    | sed -E 's/^\|[^|]*\|[^|]*\|[[:space:]]*`([0-9a-f]{64})`[[:space:]]*\|.*/\1/'
}

step "0/2 前置检查"
for artifact in "${ARTIFACTS[@]}"; do
  [ -d "$M2_BASE/$artifact/$VERSION" ] || die "找不到 mavenLocal 产物目录:$M2_BASE/$artifact/$VERSION(需先在本机 publishToMavenLocal 过 $VERSION)"
done
ok "mavenLocal 下两枚 $VERSION 制品目录均存在"

step "1/2 拷贝 + 逐件 SHA-256 比对($OUT_DIR)"
mkdir -p "$OUT_DIR"
for artifact in "${ARTIFACTS[@]}"; do
  SRC_DIR="$M2_BASE/$artifact/$VERSION"
  DEST_DIR="$OUT_DIR/com/magpie/uiv/$artifact/$VERSION"
  mkdir -p "$DEST_DIR"
  for ext in aar pom module; do
    FNAME="${artifact}-${VERSION}.${ext}"
    SRC="$SRC_DIR/$FNAME"
    [ -f "$SRC" ] || die "缺文件:$SRC"

    EXPECTED="$(expected_sha256 "$FNAME")"
    [ -n "$EXPECTED" ] || die "摘要清单里找不到 $FNAME 的登记值:$DIGESTS_DOC"

    ACTUAL="$(shasum -a 256 "$SRC" | awk '{print $1}')"
    [ "$ACTUAL" = "$EXPECTED" ] || die "SHA-256 不符:$FNAME(期望 $EXPECTED,实际 $ACTUAL)——字节与已公示摘要不一致,拒绝上仓"

    cp "$SRC" "$DEST_DIR/$FNAME"
    printf '%s  %s\n' "$ACTUAL" "$FNAME" > "$DEST_DIR/$FNAME.sha256"
    ok "$FNAME 摘要一致,已拷贝 + 生成 .sha256 sidecar"
  done
done

step "2/2 完成"
ok "已生成 Maven 布局:$OUT_DIR/com/magpie/uiv/{view-dump,semantics-dump}/$VERSION/"

cat <<EOF

下一步:把 $OUT_DIR 内容(com/magpie/uiv/... 树)放入 gh-pages 分支的 /maven 路径下并
启用 GitHub Pages(Settings → Pages → 选择 gh-pages 分支)。append-only 纪律:该路径下
已存在的版本目录不可覆盖。完整步骤见 docs/release-automation.md。
EOF
