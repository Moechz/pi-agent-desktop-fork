#!/bin/bash
# ============================================================================
# 本地换装：把当前的 release/mac-universal 构建安装到 /Applications 并重启应用
#
# 在 **Terminal.app** 里运行（不要在 Pi Agent Desktop 内部运行——换装会退出应用，
# 你的对话会中断）：
#
#     bash scripts/install-local-mac.sh
#
# 流程：确认产物 → 询问是否退出正在运行的应用 → 覆盖 /Applications → 去隔离属性 → 启动
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/release/mac-universal/Pi Agent Desktop.app"
DST="/Applications/Pi Agent Desktop.app"
APP_NAME="Pi Agent Desktop"

[ -d "$SRC" ] || { echo "❌ 未找到构建产物：$SRC"; echo "   先跑：npm run dist:mac"; exit 1; }

NEW_VER="$(python3 -c "import json;print(json.load(open('$SRC/Contents/Resources/app/package.json'))['version'])" 2>/dev/null || echo '?')"
echo "新构建版本：$NEW_VER"
echo "目标：$DST"

if pgrep -x "$APP_NAME" >/dev/null; then
  echo "⚠️  应用正在运行 —— 换装需要先退出（当前对话会中断）"
  read -r -p "现在退出并换装？[y/N] " ans
  [ "$ans" = "y" ] || [ "$ans" = "Y" ] || { echo "已取消（应用未动）"; exit 1; }
  osascript -e "quit app \"$APP_NAME\"" 2>/dev/null || pkill -x "$APP_NAME" || true
  for _ in $(seq 1 20); do pgrep -x "$APP_NAME" >/dev/null || break; sleep 1; done
  pgrep -x "$APP_NAME" >/dev/null && { echo "❌ 应用仍在运行，请手动退出后重跑"; exit 1; }
fi

echo "→ 覆盖安装…"
rm -rf "$DST"
ditto "$SRC" "$DST"
xattr -cr "$DST" 2>/dev/null || true
echo "✅ 已换装（$NEW_VER）"

echo "→ 启动应用…"
open "$DST"
echo "完成。首次启动如提示「已损坏」，执行：xattr -cr \"$DST\""
