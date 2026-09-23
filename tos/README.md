# Pi Agent for TOS —— TOS 7 应用中心包（deb）

把 Pi Agent Desktop 作为 TOS 网页应用上架：应用只监听回环，经平台路由
`http://<NAS>:8181/piagentfortos/` 以新标签页打开；后端由随包携带的 Node 运行时驱动。

```
tos/
├── config.env                 # 唯一事实源：appid/user/版本/端口/署名 + 运行期 sha256 pin
├── config.ini.in              # TOS 元数据（open_path + path，无 type；publisher=Moechz）
├── control.in                 # dpkg control 模板（Depends: git, systemd）
├── makedeb.py                 # 不依赖 dpkg 的 deb 打包器（ar + tarfile，属主 root、mtime 归零）
├── build.sh                   # 四阶段：fetch → stage → verify → deb
├── gen-lang.py                # 生成 23 语 piagentfortos.lang
├── scripts/check-glibc.sh     # glibc ≤ 2.35 门禁（TOS 7 基座 = Ubuntu 22.04）
└── assets/                    # 单元 / nginx / 环境模板 / 图标 / 隐私政策 / 落地页 / 溯源模板
```

## 构建

```bash
# 在 Linux（推荐 ubuntu-22.04，glibc 与 TOS 对齐）上：
npm ci
TOS_BASE_PATH=/piagentfortos npm run build:standalone:linux
bash tos/build.sh --standalone .next/standalone --arch amd64     # 或 arm64
# 产物：tos/dist/piagentfortos_<版本>_<架构>.deb(+.sha256)

# 经 GitHub Actions（推荐，产物可复现且公开可审计）：
#   推 tag tos-v* → 自动双架构构建并发布到 Release
#   或手动运行 workflow_dispatch（只产 artifact）
```

`build.sh` 会在 fetch 阶段对 **Node 运行时 / ripgrep / fd** 逐个做 SHA-256 校验（pin 在
`config.env`），在 verify 阶段断言：ExecStart 无 `$`、单元无 `Restart=`、config.ini 合规
（open_path / 无 type / publisher=Moechz / 版本一致）、语言文件 23 语六节点齐全且 LF 无 BOM、
图标 ≤ 50 节点、二进制架构与目标一致、无 `.DS_Store`/`._*`、**全部 ELF 的 glibc 需求 ≤ 2.35**。

## 真机验证清单（TOS 7，web 端口 8181）

```bash
cat tos/dist/piagentfortos_*_amd64.deb | ssh <nas> "cat > /tmp/app.deb"
ssh <nas> "dpkg -i /tmp/app.deb"          # 或走应用中心「手动安装」上传（两条路径都要过）
systemctl is-active piagentfortos         # active
systemctl is-enabled piagentfortos        # enabled（升级后仍须 enabled）
curl -sI http://127.0.0.1:18141/piagentfortos/    # 200（仅回环）
curl -sI http://127.0.0.1:8181/piagentfortos/     # 200（平台路由）
nc -z <NAS_IP> 18141 && echo "⚠️ 端口外泄" || echo "✓ 仅回环"
tail -20 /var/log/piagentfortos-maint.log # 安装/就绪记录
ls /Volume1/@apps/piagentfortos/data      # 数据落数据卷
# 桌面图标 → 新标签页打开；应用内选目录 → TOS 官方文件 API 弹窗
dpkg -r piagentfortos && dpkg --purge piagentfortos   # 数据保留 → 彻底清理
```

## 关键决策（偏离通用模板处均有理由）

| 项 | 决定 | 理由 |
|---|---|---|
| 打开方式 | `open_path` + `path=/piagentfortos/`（**无** `type` 字段） | 新标签页模式零适配；两者互斥 |
| 反代方式 | **前缀保留**（`proxy_pass http://127.0.0.1:18141;` 无尾斜杠） | 应用构建期已注入 `basePath=/piagentfortos`（`TOS_BASE_PATH`），前端资源/API/SSE 全前缀自洽 |
| SSE | `proxy_buffering off` + `chunked_transfer_encoding on` + 3600s 读超时 | 智能体输出是长连接流式，缓冲会导致界面"憋住不吐字" |
| Node 运行时 | **随包内置**（版本 + sha256 pin） | 真机实测 TOS 基座 node/npm/bun/deno **全无** |
| 搜索工具 | 随包内置 ripgrep / fd | pi 的 grep/find 否则会在运行时联网下载（违反 S8） |
| 数据目录 | 默认 `/var/lib`，postinst 探测数据卷后写入 env 覆盖到 `/VolumeN/@apps/<appid>/data` | 真机系统盘仅剩 2.7G，会话/记忆会持续增长 |
| `ProtectSystem` | `full`（**非** strict） | 本应用是编程智能体，必须能写用户项目目录；strict 会整盘只读 |
| `Depends: git` | 硬依赖 | 智能体要在用户项目里提交/分支；**绝不在脚本里联网安装**（S8） |
| 目录选择 | 复用 TOS 官方文件管理 API（`/fileManage/list` `folderInfoAll` `CreateFolder`） | 同源 Cookie + `X-Csrf-Token`，权限由 TOS 统一管控，桌面版自动回落 Electron 原生弹窗 |
| 署名 | `config.ini.publisher` / `control.Maintainer` = Moechz；`.lang` 的 `auth` = 上游项目语义 | 指南坑 49 铁律 |

## 真机发现的坑（已修，勿回退）

1. **前端 JS 全 404**：Next standalone 输出**不含** `.next/static` 与 `public`（桌面版由
   electron-builder 的 extraResources 带入）。TOS 打包必须显式拷贝到
   `standalone/.next/static`、`standalone/public`；`build.sh` 已加断言防回退。
2. **重定向死循环**：应用以 `basePath=/piagentfortos` 运行时，规范形式是**不带尾斜杠**，
   平台路由 `/piagentfortos/` 会被应用 308 到 `/piagentfortos`；若 nginx 只有
   `location /piagentfortos/`，这个不带斜杠的请求会落到平台层补斜杠逻辑 → 二者互相
   308/301 死循环。必须额外写 `location = /piagentfortos`（已在模板中）。
3. **CI 上的 SIGPIPE 假失败**：`set -o pipefail` 下 `tar … | grep -q` 会因 grep 提前
   退出给 tar 发 SIGPIPE（"tar: stdout: write error"）。校验 tar 内容一律先落清单文件。

## 已知限制

- arm64 包**尚未在 arm64 真机验证**（手头测试机为 amd64）；已用 glibc ≤ 2.35 门禁兜底。
- 应用中心「手动安装」上传路径尚未实测（`dpkg -i` 路径已实测通过）；上架前必须补测（含 oexe 生成判据）。
- 依赖 `git`：缺失时智能体的本地提交与会话分支功能不可用（postinst 会提示）。
- 浏览器版没有 Electron 原生能力：目录选择走 TOS 文件 API（已实现），窗口主题跟随浏览器的明暗设置。

## 发版

1. 改内容 → 需要重新打包时把 `config.env` 的 `PKG_RELEASE` +1（**勿零填充**）
2. 版本三处一致由 `build.sh` 断言保证：`config.ini` / `DEBIAN/control` / `.lang`
3. 推 tag `tos-v<版本>`（例如 `tos-v0.8.8.6-1`）→ CI 出双架构 deb 并发布 Release
4. 商店提交：上传 `<appid>_<版本>_<架构>.deb` + `.sha256`，类目 `Utilities`
