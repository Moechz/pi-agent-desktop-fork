#!/bin/bash
# ============================================================================
# Pi Agent for TOS —— deb 构建（四阶段：fetch → stage → verify → deb）
#
# 用法：
#   ./build.sh --standalone <已构建的 .next/standalone 目录> [--arch amd64|arm64]
#   ./build.sh --build-standalone [--arch amd64]      # 在 Linux 上现场构建应用本体
#
# 产物：dist/<appid>_<version>_<arch>.deb 与同名 .sha256
#
# 设计要点（对照 TOS-DEB-PACKAGING-GUIDE.md 的硬坑）：
#   - 不依赖 dpkg/docker：ar + Python tarfile 出标准 deb（坑 8）
#   - 所有下载物按 config.env 的 sha256 pin 校验，不匹配即失败（V6 溯源）
#   - 文本资产统一 LF、去 BOM；剔除 .DS_Store / ._*（macOS 构建机污染）
#   - verify 阶段断言：ExecStart 无 $、无 Restart=、图标/语言文件合规、二进制架构正确
# ============================================================================
set -euo pipefail

CALLER_PWD="$PWD"
cd "$(dirname "$0")"
TOS_DIR="$PWD"
REPO_DIR="$(cd .. && pwd)"

# ---------- 参数 ----------
STANDALONE=""
BUILD_STANDALONE=0
ARCH_OVERRIDE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --standalone)
      # 调用方的 cwd 可能与脚本目录不同，这里立刻解析为绝对路径（下方会 cd 到 tos/）
      case "$2" in
        /*) STANDALONE="$2" ;;
        *) STANDALONE="$CALLER_PWD/$2" ;;
      esac
      shift 2 ;;
    --build-standalone) BUILD_STANDALONE=1; shift ;;
    --arch) ARCH_OVERRIDE="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

# ---------- 配置 ----------
# shellcheck disable=SC1091
. ./config.env
[ -n "$ARCH_OVERRIDE" ] && TARGET_ARCH="$ARCH_OVERRIDE"

case "$TARGET_ARCH" in
  amd64) NODE_ASSET_ARCH="x64";   RG_ASSET_ARCH="x86_64";  FD_ASSET_ARCH="x86_64";  RG_FLAVOR="unknown-linux-musl" ;;
  arm64) NODE_ASSET_ARCH="arm64"; RG_ASSET_ARCH="aarch64"; FD_ASSET_ARCH="aarch64"; RG_FLAVOR="unknown-linux-gnu" ;;
  *) echo "不支持的架构: $TARGET_ARCH（仅 amd64 / arm64）" >&2; exit 2 ;;
esac
case "$TARGET_ARCH" in
  amd64) PLATFORM_NAME="x86_64" ;;
  arm64) PLATFORM_NAME="ARM64" ;;
esac

NODE_SHA256_VAR="NODE_SHA256_$(echo "$TARGET_ARCH" | tr 'a-z' 'A-Z')"
RG_SHA256_VAR="RG_SHA256_$(echo "$TARGET_ARCH" | tr 'a-z' 'A-Z')"
FD_SHA256_VAR="FD_SHA256_$(echo "$TARGET_ARCH" | tr 'a-z' 'A-Z')"
NODE_SHA256_EXPECTED="${!NODE_SHA256_VAR}"
RG_SHA256_EXPECTED="${!RG_SHA256_VAR}"
FD_SHA256_EXPECTED="${!FD_SHA256_VAR}"

NODE_TARBALL="node-v${NODE_VERSION}-linux-${NODE_ASSET_ARCH}.tar.xz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL}"
RG_TARBALL="ripgrep-${RIPGREP_VERSION}-${RG_ASSET_ARCH}-${RG_FLAVOR}.tar.gz"
RG_URL="https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/${RG_TARBALL}"
FD_TARBALL="fd-v${FD_VERSION}-${FD_ASSET_ARCH}-unknown-linux-gnu.tar.gz"
FD_URL="https://github.com/sharkdp/fd/releases/download/v${FD_VERSION}/${FD_TARBALL}"

WORK="$TOS_DIR/build"
STAGE="$WORK/stage"
DIST="$TOS_DIR/dist"
PKGROOT="$STAGE/pkgroot"
APP_DIR="$PKGROOT/usr/local/$APP_ID"
BIN_DIR="$APP_DIR/bin"
VENDOR_BIN_DIR="$APP_DIR/vendor/bin/linux-$TARGET_ARCH"

say() { echo; echo "════ $* ════"; }

# curl 兼容层：支持 HTTPS_PROXY
fetch() {
  local url="$1" out="$2"
  local args=(-sSL --fail -m 900 -C - "$url" -o "$out")
  [ -n "${HTTPS_PROXY:-}" ] && args=(-x "$HTTPS_PROXY" "${args[@]}")
  curl "${args[@]}" || true
}

# 下载 + sha256 校验的重试循环（代理链路抖动会截断大文件：续传 + 重来）
fetch_verified() {
  local url="$1" out="$2" expected="$3" label="$4"
  echo "  ↓ $(basename "$out")"
  local attempt
  for attempt in 1 2 3 4 5 6; do
    [ "$attempt" -ge 4 ] && rm -f "$out"   # 多次续传仍不匹配 → 从零重下
    fetch "$url" "$out"
    if [ -f "$out" ] && [ "$(sha256_of "$out")" = "$expected" ]; then
      echo "  ✓ $label sha256 校验通过${attempt:+（第 $attempt 次尝试）}"
      return 0
    fi
    echo "  ⚠️ $label 第 $attempt 次不完整/不匹配，续传重试…" >&2
    sleep 2
  done
  echo "❌ $label 多次下载后仍校验失败：$out" >&2
  exit 1
}

# 跨平台 sha256
sha256_of() {
  if command -v sha256sum > /dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

verify_sha256() {
  local file="$1" expected="$2" label="$3"
  local actual
  actual="$(sha256_of "$file")"
  if [ "$actual" != "$expected" ]; then
    echo "❌ $label SHA-256 不匹配" >&2
    echo "   期望 $expected" >&2
    echo "   实际 $actual" >&2
    exit 1
  fi
  echo "  ✓ $label sha256 校验通过"
}

# ============================== 0. 准备 ==============================
say "0/4 准备"
# 官方 Node 压缩包内含只读目录 → 先补写权限再删，避免 rm 失败中断构建
chmod -R u+w "$WORK" 2>/dev/null || true
rm -rf "$WORK" "$DIST"
mkdir -p "$WORK" "$DIST" "$BIN_DIR" "$VENDOR_BIN_DIR" "$APP_DIR/images/icons" "$APP_DIR/init.d" "$APP_DIR/nginx"
SRC_COMMIT="$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
BUILD_TIME="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "  appid=$APP_ID version=$VERSION arch=$TARGET_ARCH commit=${SRC_COMMIT:0:12}"

# ============================== 1. fetch ==============================
say "1/4 fetch（运行时与工具，按 sha256 pin 校验）"
fetch_verified "$NODE_URL" "$WORK/$NODE_TARBALL" "$NODE_SHA256_EXPECTED" "node ${NODE_VERSION}"
tar -xJf "$WORK/$NODE_TARBALL" -C "$WORK"
cp "$WORK/node-v${NODE_VERSION}-linux-${NODE_ASSET_ARCH}/bin/node" "$BIN_DIR/node"
chmod 0755 "$BIN_DIR/node"

fetch_verified "$RG_URL" "$WORK/$RG_TARBALL" "$RG_SHA256_EXPECTED" "ripgrep ${RIPGREP_VERSION}"
tar -xzf "$WORK/$RG_TARBALL" -C "$WORK"
cp "$(find "$WORK" -name rg -type f -path "*${RG_ASSET_ARCH}*" | head -1)" "$VENDOR_BIN_DIR/rg"
chmod 0755 "$VENDOR_BIN_DIR/rg"

fetch_verified "$FD_URL" "$WORK/$FD_TARBALL" "$FD_SHA256_EXPECTED" "fd ${FD_VERSION}"
tar -xzf "$WORK/$FD_TARBALL" -C "$WORK"
cp "$(find "$WORK" -name fd -type f -path "*${FD_ASSET_ARCH}*" | head -1)" "$VENDOR_BIN_DIR/fd"
chmod 0755 "$VENDOR_BIN_DIR/fd"

# 应用本体：外部传入，或现场构建（Linux）
if [ "$BUILD_STANDALONE" = 1 ]; then
  say "1b/4 现场构建应用本体（Node 应用；需已 npm ci）"
  ( cd "$REPO_DIR" && TOS_BASE_PATH="/$APP_ID" npm run build:standalone )
  STANDALONE="$REPO_DIR/.next/standalone"
fi
if [ -z "$STANDALONE" ] || [ ! -d "$STANDALONE" ]; then
  echo "❌ 缺少应用本体：--standalone 指向的目录不存在" >&2
  echo "   解析后路径: ${STANDALONE:-（未提供）}" >&2
  echo "   当前工作目录: $PWD（调用方: $CALLER_PWD）" >&2
  echo "   请用 --standalone <dir>（相对调用方 cwd 或绝对路径）或 --build-standalone" >&2
  exit 1
fi
echo "  应用本体: $STANDALONE"
cp -R "$STANDALONE" "$APP_DIR/standalone"
# 构建机污染清理（.DS_Store / AppleDouble / 各类缓存）
find "$APP_DIR/standalone" \( -name '.DS_Store' -o -name '._*' -o -name '__MACOSX' \) -prune -exec rm -rf {} + 2>/dev/null || true

# ============================== 2. stage ==============================
say "2/4 stage（组装文件树 + 文本清洗）"

# 文本资产统一 LF、去 BOM
normalize_text() {
  python3 - "$1" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1])
raw = p.read_bytes()
if raw[:3] == b"\xef\xbb\xbf":
    raw = raw[3:]
p.write_bytes(raw.replace(b"\r\n", b"\n"))
PY
}

# 模板变量表（供 makedeb.py 与文本模板使用）
cat > "$WORK/vars.env" <<EOF
APP_ID=$APP_ID
APP_USER=$APP_USER
APP_PORT=$APP_PORT
BASE_PATH=/$APP_ID
VERSION=$VERSION
BUILD_TIME=$BUILD_TIME
SRC_COMMIT=$SRC_COMMIT
NODE_VERSION=$NODE_VERSION
NODE_ASSET_ARCH=$NODE_ASSET_ARCH
NODE_SHA256=$NODE_SHA256_EXPECTED
RIPGREP_VERSION=$RIPGREP_VERSION
RG_SHA256=$RG_SHA256_EXPECTED
FD_VERSION=$FD_VERSION
FD_SHA256=$FD_SHA256_EXPECTED
PLATFORM=$PLATFORM_NAME
STANDALONE_FILES=$(find "$APP_DIR/standalone" -type f | wc -l | tr -d ' ')
STANDALONE_BYTES=$(du -sk "$APP_DIR/standalone" | cut -f1)
EOF

# 模板渲染（config.ini / BUILD-INFO / PROVENANCE）
python3 - <<PY
import pathlib, re
vars_map = {}
for line in pathlib.Path("$WORK/vars.env").read_text().splitlines():
    if "=" in line:
        k, v = line.split("=", 1); vars_map[k.strip()] = v.strip()
vars_map["ARCH"] = "$TARGET_ARCH"
def render(src, dst):
    text = pathlib.Path(src).read_text(encoding="utf-8")
    text = re.sub(r"@@([A-Z0-9_]+)@@", lambda m: vars_map.get(m.group(1), m.group(0)), text)
    pathlib.Path(dst).write_text(text, encoding="utf-8")
render("config.ini.in", "$APP_DIR/config.ini")
render("assets/BUILD-INFO.in", "$APP_DIR/BUILD-INFO")
render("assets/PROVENANCE.md.in", "$APP_DIR/PROVENANCE.md")
print("  ✓ 模板渲染完成（config.ini / BUILD-INFO / PROVENANCE.md）")
PY

# 资产落位
cp assets/piagentfortos.lang "$APP_DIR/$APP_ID.lang"
cp assets/piagentfortos.env.example "$APP_DIR/$APP_ID.env.example"
cp assets/privacy-policy.html "$APP_DIR/privacy-policy.html"
cp assets/index.html "$APP_DIR/index.html"
cp assets/images/icons/$APP_ID.svg "$APP_DIR/images/icons/$APP_ID.svg"
cp assets/init.d/$APP_ID.service "$APP_DIR/init.d/$APP_ID.service"
cp assets/nginx/$APP_ID.conf "$APP_DIR/nginx/$APP_ID.conf"
chmod 0755 "$APP_DIR/init.d/$APP_ID.service"
for f in "$APP_DIR/$APP_ID.lang" "$APP_DIR/$APP_ID.env.example" "$APP_DIR/privacy-policy.html" \
         "$APP_DIR/index.html" "$APP_DIR/config.ini" "$APP_DIR/npm-placeholder"; do
  [ -f "$f" ] && normalize_text "$f"
done

# webui.bz2（tar.bz2，解压得到可打开的 index.html —— 官方结构要求）
tar -cjf "$APP_DIR/webui.bz2" -C "$APP_DIR" index.html

# dpkg 实体文件双落盘（不依赖 postinst 拷贝即可生效）
mkdir -p "$PKGROOT/etc/systemd/system" "$PKGROOT/etc/nginx/conf.d"
cp "$APP_DIR/init.d/$APP_ID.service" "$PKGROOT/etc/systemd/system/$APP_ID.service"
cp "$APP_DIR/nginx/$APP_ID.conf" "$PKGROOT/etc/nginx/conf.d/$APP_ID.conf"

# 文本清洗 + 污染清理（整棵树）
find "$PKGROOT" \( -name '.DS_Store' -o -name '._*' -o -name '__MACOSX' \) -prune -exec rm -rf {} + 2>/dev/null || true

# ============================== 3. verify ==============================
say "3/4 verify（规范断言）"
fail=0
assert() { # assert <描述> <命令...>
  local desc="$1"; shift
  if "$@" > /dev/null 2>&1; then echo "  ✓ $desc"; else echo "  ❌ $desc" >&2; fail=1; fi
}
assert_ok() { # assert_ok <描述> <布尔值>
  if [ "$2" = "1" ]; then echo "  ✓ $1"; else echo "  ❌ $1" >&2; fail=1; fi
}

# 1) 单元：ExecStart 无 $、无 Restart=（只查非注释行）
UNIT="$APP_DIR/init.d/$APP_ID.service"
n=$(grep -E '^[[:space:]]*ExecStart' "$UNIT" | grep -c '\$' || true)
assert_ok "ExecStart 不含 \$ 变量（坑 1）" "$([ "$n" = "0" ] && echo 1 || echo 0)"
n=$(grep -E '^[[:space:]]*Restart' "$UNIT" | grep -vc '^[[:space:]]*#' || true)
assert_ok "单元无 Restart=（S05）" "$([ "$n" = "0" ] && echo 1 || echo 0)"
assert "单元 User=$APP_USER" grep -q "^User=$APP_USER" "$UNIT"
assert "单元仅回环监听" grep -q "HOSTNAME=127.0.0.1" "$UNIT"
assert "单元端口与 config.env 一致" grep -q "PORT=$APP_PORT" "$UNIT"

# 2) config.ini：合法 JSON + open_path + 无 type + publisher 正确 + 版本一致
python3 - "$APP_DIR/config.ini" "$VERSION" <<'PY' || fail=1
import json, sys
cfg = json.load(open(sys.argv[1], encoding="utf-8"))
version = sys.argv[2]
checks = [
    (cfg.get("id") == "piagentfortos", "config.ini id=piagentfortos"),
    (cfg.get("open_path") is True, "config.ini open_path=true（新标签页）"),
    ("type" not in cfg, "config.ini 无 type 字段（与 open_path 互斥）"),
    (cfg.get("path") == "/piagentfortos/", "config.ini path=/piagentfortos/"),
    (cfg.get("publisher") == "Moechz", "config.ini publisher=Moechz（坑 49）"),
    (cfg.get("version") == version, f"config.ini version={version}"),
    (cfg.get("recommend") is False and cfg.get("beta") is False, "recommend/beta=false（V11）"),
    (cfg.get("user") == "piagentfortos", "config.ini user 与运行用户一致"),
]
ok = True
for good, desc in checks:
    print(("  ✓ " if good else "  ❌ ") + desc)
    ok = ok and good
sys.exit(0 if ok else 1)
PY

# 3) 语言文件：23 语、六节点齐全、无 BOM/CRLF
python3 - "$APP_DIR/$APP_ID.lang" <<'PY' || fail=1
import re, sys
raw = open(sys.argv[1], "rb").read()
text = raw.decode("utf-8")
langs = re.findall(r"^\[([a-z-]+)\]$", text, re.M)
required = {"zh-cn","zh-hk","en-us","fr-fr","de-de","it-it","es-es","hu-hu","ja-jp","ko-kr","pl-pl","ru-ru","tr-tr","pt-pt"}
ok = len(langs) >= 14 and required.issubset(set(langs))
for key in ("name","auth","version","descript","release_note","important"):
    ok = ok and len(re.findall(rf"^{key}\s*=", text, re.M)) == len(langs)
ok = ok and raw[:3] != b"\xef\xbb\xbf" and b"\r\n" not in raw
print(("  ✓ " if ok else "  ❌ ") + f"语言文件（{len(langs)} 语、六节点齐全、LF/无 BOM）")
sys.exit(0 if ok else 1)
PY

# 4) 图标：viewBox + 元素/锚点 ≤ 50
python3 - "$APP_DIR/images/icons/$APP_ID.svg" <<'PY' || fail=1
import re, sys
s = open(sys.argv[1], encoding="utf-8").read()
tags = len(re.findall(r"<[a-zA-Z]", s))
anchors = sum(len(re.findall(r"[-0-9.]+[, ]+[-0-9.]+", d)) or 1 for d in re.findall(r'\sd="([^"]+)"', s))
ok = ("viewBox=" in s) and (tags + anchors <= 50)
print(("  ✓ " if ok else "  ❌ ") + f"图标（viewBox 存在，元素 {tags} + 锚点 {anchors} = {tags+anchors} ≤ 50）")
sys.exit(0 if ok else 1)
PY

# 5) 二进制架构防呆（坑 28：绝不允许异构二进制混入）
if command -v file > /dev/null 2>&1; then
  for bin in "$BIN_DIR/node" "$VENDOR_BIN_DIR/rg" "$VENDOR_BIN_DIR/fd"; do
    desc="$(file -b "$bin")"
    case "$TARGET_ARCH" in
      amd64) ok=$(echo "$desc" | grep -qE 'x86-64|x86_64' && echo 1 || echo 0) ;;
      arm64) ok=$(echo "$desc" | grep -qE 'aarch64|ARM aarch64' && echo 1 || echo 0) ;;
    esac
    assert_ok "$(basename "$bin") 架构=$TARGET_ARCH（$desc 截断）" "$ok"
  done
else
  echo "  ⚠️ 本机无 file 命令，跳过二进制架构断言"
fi

# 6) 应用本体存在且含 server.js（standalone 入口）
assert "应用本体含 server.js" test -f "$APP_DIR/standalone/server.js"
assert "应用本体含 .next" test -d "$APP_DIR/standalone/.next"
assert "实例自带 node 运行时" test -x "$BIN_DIR/node"

# 7) 污染清理确认
n=$(find "$PKGROOT" \( -name '.DS_Store' -o -name '._*' \) | wc -l | tr -d ' ')
assert_ok "无 .DS_Store/._* 残留（坑 8）" "$([ "$n" = "0" ] && echo 1 || echo 0)"

# 7b) glibc 上限门禁（TOS 7 基座 = Ubuntu 22.04 / glibc 2.35）
#     arm64 包若在 ubuntu-24.04 runner（glibc 2.39）上构建，这道门禁是最后一道防线；
#     本机缺 objdump（如 macOS）时脚本自行跳过并提示。
bash scripts/check-glibc.sh "$PKGROOT" 2.35

# 8) control 模板必填字段（真正渲染由 makedeb.py 完成）
assert "control 模板声明 Depends: git（本地提交需 git，且不在脚本里联网装）" grep -q '^Depends: .*git' "$TOS_DIR/control.in"
assert "control 模板含 Maintainer" grep -q '^Maintainer: @@MAINTAINER@@' "$TOS_DIR/control.in"
assert "control 模板版本占位符" grep -q '^Version: @@VERSION@@' "$TOS_DIR/control.in"
n=$(grep -cE '@[A-Z0-9_]+@' "$TOS_DIR/assets/postinst" "$TOS_DIR/assets/preinst" "$TOS_DIR/assets/prerm" "$TOS_DIR/assets/postrm" 2>/dev/null | awk -F: '{s+=$2} END{print s+0}')
assert_ok "脚本中的占位符风格可被打包器替换（@KEY@ / @@KEY@@）" "$([ "$n" = "0" ] || [ "$n" -gt 0 ] && echo 1 || echo 0)"
n=$(grep -c '^#' "$TOS_DIR/control.in" || true)
assert_ok "control 模板无 # 注释行（dpkg 会当非法字段）" "$([ "$n" = "0" ] && echo 1 || echo 0)"
[ "$fail" = "0" ] || { echo; echo "❌ verify 失败，构建中止" >&2; exit 1; }

# ============================== 4. deb ==============================
say "4/4 deb（ar + tar，不依赖 dpkg）"
DEB="$DIST/${APP_ID}_${VERSION}_${TARGET_ARCH}.deb"
python3 ./makedeb.py \
  --pkgroot "$PKGROOT" \
  --assets "$TOS_DIR/assets" \
  --out "$DEB" \
  --version "$VERSION" \
  --arch "$TARGET_ARCH" \
  --maintainer "$MAINTAINER_NAME <$MAINTAINER_EMAIL>" \
  --control-template "$TOS_DIR/control.in" \
  --vars "$WORK/vars.env"

# 校验文件（商店要求必须附 .sha256）
sha256_of "$DEB" > "$DEB.sha256"
echo "  ✓ 已写校验文件 $(basename "$DEB").sha256"

say "完成"
echo "  产物: $DEB"
echo "  校验: $(basename "$DEB").sha256"
echo "  体积: $(du -h "$DEB" | cut -f1)  安装后: $(du -sh "$PKGROOT" | cut -f1)"
