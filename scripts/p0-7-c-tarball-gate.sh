#!/usr/bin/env bash
# P0-7 C 轨制品检查：只相信实际 npm pack 产物，不把 package.json 的 files 声明当证据。
#
# 默认模式为三个可分发 npm 包分别执行 npm pack（含其 prepack 生命周期），然后检查
# 每个生成的 tarball。--archive 模式供发布 bundle 组装后或反控时复用同一归档检查。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT=""

cleanup() {
  [ -z "$TMP_ROOT" ] || rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

inspect_archive() {
  local archive="$1"
  [ -f "$archive" ] || { echo "FAIL [C] 归档不存在: $archive" >&2; return 1; }

  # npm tarball 路径通常以 package/ 开头；此模式也覆盖任意嵌套 .claude 目录。
  if tar -tzf "$archive" | grep -E '(^|/)\.claude(/|$)' >/dev/null; then
    echo "FAIL [C] $archive 含 .claude 路径:" >&2
    tar -tzf "$archive" | grep -E '(^|/)\.claude(/|$)' >&2
    return 1
  fi
  echo "PASS [C] $(basename "$archive") 无 .claude 路径"
}

usage() {
  echo "用法: $0 [--archive <file.tgz>]" >&2
  exit 2
}

if [ "$#" -gt 0 ]; then
  [ "$#" -eq 2 ] && [ "$1" = "--archive" ] || usage
  inspect_archive "$2"
  exit $?
fi

cd "$ROOT"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/uiv-p0-7-pack.XXXXXX")"
FAILED=0

for package_dir in packages/uiv-core packages/uiv-cli packages/ui-verify-mcp; do
  pack_json="$(cd "$package_dir" && npm pack --json --pack-destination "$TMP_ROOT")" || {
    echo "FAIL [C] $package_dir npm pack 失败" >&2
    FAILED=1
    continue
  }
  tarball="$(node --input-type=module -e '
    const records = JSON.parse(process.argv[1]);
    if (!Array.isArray(records) || records.length !== 1 || typeof records[0]?.filename !== "string") process.exit(2);
    process.stdout.write(records[0].filename);
  ' "$pack_json")" || {
    echo "FAIL [C] $package_dir 未返回唯一 tarball 文件名" >&2
    FAILED=1
    continue
  }
  inspect_archive "$TMP_ROOT/$tarball" || FAILED=1
done

[ "$FAILED" -eq 0 ] && { echo "P0-7 C tarball gate: ALL PASS"; exit 0; }
echo "P0-7 C tarball gate: FAILED" >&2
exit 1
