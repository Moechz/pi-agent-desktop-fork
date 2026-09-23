#!/bin/bash
# ============================================================================
# glibc 上限门禁：TOS 7 基座是 Ubuntu 22.04（glibc **2.35**），
# 任何要求更高 glibc 的二进制/原生模块在真机上都会直接跑不起来（GLIBC_2.39 not found）。
# 尤其注意：arm64 构建若跑在 ubuntu-24.04 runner（glibc 2.39）上，必须靠这道门禁拦住。
#
# 检查对象：包内全部 ELF（node 运行时、rg/fd、standalone 下的 *.node / *.so）
# 用法：check-glibc.sh <目录> [上限=2.35]
# ============================================================================
set -euo pipefail

ROOT="${1:?用法: check-glibc.sh <目录> [上限]}"
MAX="${2:-2.35}"

# 版本比较：$1 > $2 时返回 0（不依赖 GNU sort -V，macOS 也能跑）
version_gt() {
  local a1 a2 b1 b2
  IFS=. read -r a1 a2 _ <<< "$1"
  IFS=. read -r b1 b2 _ <<< "$2"
  a1=${a1:-0}; a2=${a2:-0}; b1=${b1:-0}; b2=${b2:-0}
  if [ "$a1" -gt "$b1" ]; then return 0; fi
  if [ "$a1" -lt "$b1" ]; then return 1; fi
  [ "$a2" -gt "$b2" ]
}

command -v objdump > /dev/null 2>&1 || { echo "⚠️ 无 objdump，跳过 glibc 门禁（请确保构建环境本身 ≤ glibc $MAX）"; exit 0; }

max_seen="0"
bad=""
count=0
while IFS= read -r -d '' file; do
  if ! head -c 4 "$file" 2>/dev/null | grep -q $'\x7fELF'; then continue; fi
  count=$((count + 1))
  # 该 ELF 引用的最高 GLIBC_x.y 版本
  highest=""
  while IFS= read -r ver; do
    ver=${ver#GLIBC_}
    [ -n "$ver" ] || continue
    if [ -z "$highest" ] || version_gt "$ver" "$highest"; then highest="$ver"; fi
  done < <(objdump -T "$file" 2>/dev/null | grep -oE 'GLIBC_[0-9]+\.[0-9]+' || true)
  [ -n "$highest" ] || continue
  if version_gt "$highest" "$max_seen"; then max_seen="$highest"; fi
  if version_gt "$highest" "$MAX"; then
    bad="$bad\n  $file 需要 GLIBC_$highest"
  fi
done < <(find "$ROOT" -type f \( -perm -u+x -o -name '*.node' -o -name '*.so*' \) -print0 2>/dev/null)

echo "  ELF 文件数: $count   最高 glibc 需求: $max_seen   上限: $MAX"
if [ -n "$bad" ]; then
  echo -e "❌ 以下文件超出 TOS 基座 glibc，装机必崩：$bad" >&2
  exit 1
fi
echo "  ✓ 全部 ELF 均可在 glibc ≤ $MAX 的 TOS 7 上运行"
