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

> **本体的唯一合法来源 = `npm run build:standalone:linux`**（= `next build` + 三个
> `ensure-*` 补丁 + `dereference-standalone-symlinks` + smoke）。它是**一条命令的组合**，
> 手工只跑 `next build` 得到的 `.next/standalone` 是**半成品**：Next 16 的 Turbopack
> 产物不带 API 路由运行时（每个 `/api/*` 都 500，界面表现是「无法加载会话」），
> 链接农场里还会留下空目录/指向构建树的断链 —— 两种都不会让服务启动失败，极难排查。
> `build.sh` 的**本体体检**（stage 阶段）会拦住这类半成品；真机上若看到 `/api/*` 全 500，
> 先查包内 `standalone/node_modules/next/dist/compiled/next-server/` 是否只有 3 个 runtime 文件。

`build.sh` 会在 fetch 阶段对 **Node 运行时 / ripgrep / fd** 逐个做 SHA-256 校验（pin 在
`config.env`），在 stage 阶段做**本体体检**（API 路由运行时齐全 / 无树外符号链接 /
链接农场可解析）与权限归一（坑 57/58），在 verify 阶段断言：ExecStart 无 `$`、单元无 `Restart=`、
config.ini 合规（open_path / 无 type / publisher=Moechz / 版本一致）、语言文件 23 语六节点
齐全且 LF 无 BOM、图标 ≤ 50 节点、二进制架构与目标一致、包内文件对其它用户可读、
无 `.DS_Store`/`._*`、**全部 ELF 的 glibc 需求 ≤ 2.35**。

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

## 运行用户与目录权限（真机实测）

- 服务以专用低权系统用户 **`piagentfortos`** 运行（preinst 与平台都会创建，同一用户）。
- 智能体的一切读写都受该用户在 TOS 里的实际权限约束。要让它在你的共享目录里干活，
  二选一：
  - **按目录授权**：`setfacl -m u:piagentfortos:rwx /Volume1/Public/<dir>`（真机实测可写）
  - **按组授权**：`usermod -aG <组> piagentfortos && systemctl restart piagentfortos`
  - 或使用应用自有工作区：`/Volume1/@apps/piagentfortos/data/workspace`
- ⚠️ **TOS UI 的「应用用户」列表依赖平台注册**：只有经**应用中心**安装（手动安装页上传 deb）
  才会在 `/Volume1/@apps/<appid>/` 写入 `.userid`/`.groupid`/`ROUTER` 等注册元数据；
  直接 `dpkg -i` 不会注册，因此 UI 里可能看不到该用户（也就无法在 UI 中配权限）。
  两种路径都可用，但**同一台机器只走一条**（切换会 purge 预存注册 → 清数据，见指南坑 16）。

## TOS 目录选择器（应用内）

前端不直连 TOS API（会话 Cookie 多为 HttpOnly，JS 读不到，也取不到 CSRF 令牌），
而是走本应用服务端代理：

```
浏览器 → /api/tos/fs/{list,info,mkdir} → 服务端带 Cookie 转发 → TOS /fileManage/*
```

目标固定 `http://127.0.0.1:8181`（`TOS_API_BASE` 可覆盖），`path` 仅作 query 参数 → 无 SSRF 面；
权限完全沿用 TOS 自身模型（代理只是"带着当前用户 Cookie 再问一次 TOS"）。

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

## 真机验收记录

### 2026-09-24 · `7e2d166`（0.8.8.6-1，tnas-57 amd64）

| 核对项 | 结果 |
| --- | --- |
| 版本 / 提交 | `0.8.8.6-1`，`BUILD-INFO` = `7e2d1668…` |
| 修复指纹（三处 basePath 漏网） | `trust-fetch` 3 处 ✓ / `session-loader-api` 3 处 ✓ / `BranchCloneModal` 2 处 ✓ |
| 服务 | `systemd=active`、`enabled`、仅监听 `127.0.0.1:18141` ✓ |
| 平台路由 | `/piagentfortos/` → 308（基路径规范化）、`/api/models` → 200、`/api/sessions` → 200 ✓ |
| 静态资源 | `_next/static/chunks/*.js` → 200 ✓ |
| 近 25 分钟日志 | `error` / `ENOENT` 出现 **0** 次 ✓ |
| 端到端（发消息 → 读回会话） | 新建会话 → `2+2=?` → 回复 `4`（`stop=stop`、`err=None`）✓ |

**本次修复的故障形态**（排查成本极高，值得记住）：前端看起来发送成功、后端毫无记录。
根因是**参数形式**的站内路径漏补 `basePath`（批量替换只覆盖了字面量），
请求打到站点根 → 404。现已由 `lib/client-basepath.test.ts` 常驻守护。
