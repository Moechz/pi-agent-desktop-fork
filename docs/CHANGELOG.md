## 2026-09-21 — 正式版 official-v1 切换

| 类别 | 内容 |
|---|---|
| 里程碑 | 补丁系统退役，源码 fork 全面接管 `/Applications` |
| 最终态 | logo 30×30 + 标题 Pi Agent Desktop 18px/500 双 span 明暗；顶部留白 21px（原生遮盖条已移除，红绿灯悬浮与标题同排）；新会话 150px 右对齐组；底部 模型/技能 缩短靠左 |
| 退役 | launchd `com.user.pi-ui-patch` 卸载、`~/.pi-ui-patches` → 旧仓 `backup/patches-retired/` |
| 归档 | DMG `389416f7…` 存于旧仓 `backup/installer/` |

# Changelog

## 2026-10-01 — TOS 0.8.8.9-39：SSE 自愈重连（relay/切网络场景根治）+ retry 提示

| 类别 | 内容 |
|---|---|
| 实测定位 | 从外网经 relay 直接打应用接口（curl）：首页 200 ✓、`/api/sessions` 200 ✓、`POST prompt` 200 ✓、SSE 收到 **151 个事件**跑完整轮对话 ✓、relay 给的前端 chunk 就是最新构建 ✓ ⇒ **后端/relay/客户端代码全都没问题**，问题在**浏览器那个页面实例的事件订阅**：用户切网络时 SSE 长连接断掉，而客户端没有自愈 |
| 客户端缺陷（`hooks/agent-session/agent-events-manager.ts`） | ① `reconnectAttempts > 5` 就置 `failed` **不再重连**（切网络后 5 次重试 ≈ 31s 内放弃）；② `onerror` 里**只有 `agentRunning` 为真才重连**，否则直接 `disconnected` |
| 修复 | ① 持续重连（上限 60 次、延迟封顶 30s）；② **不再依赖 `agentRunning`**（有会话 id 就重连）；③ 新增 **`visibilitychange` / `online` 唤醒重连**（切网络、休眠唤醒、回到页面时立即重连，不等退避）；④ 服务端 SSE 首帧发 **`retry: 3000`**，让 `EventSource` 断线后 3s 就重试 |
| 测试 | `agent-events-manager.test.ts`：旧的「5 次后 failed」与「agent 未运行就不重连」两条断言按新语义重写，并新增「连续 10 次仍重连」「agentRunning=false 也重连」「回到前台立即重连」三例 → 该文件 10/10；全套 `npm test` 735/732 pass / 0 fail |

## 2026-10-01 — TOS 0.8.8.9-38：relay 排障诊断日志（行为不变）

| 类别 | 内容 |
|---|---|
| 背景 | 用户反馈：经 **TNAS.online relay** 打开应用后，会话仍无任何响应（-36/-37 的「防缓冲头 + 15s 心跳」未解决）。relay 很可能是**非 nginx 的自研代理**，不理会 `X-Accel-Buffering`，或直接改写 Host / 掐断长连接 —— 需要证据才能定方案 |
| 新增诊断（不改行为） | ① `middleware.ts`：Origin 校验拒绝时打 `[origin-check] 拒绝 …`（含 origin / host / x-forwarded-host / x-forwarded-proto，**不含任何凭据**）② `POST /api/agent/<id>`：打 `[agent-api] POST 到达 …`（命令是否真到服务端）③ `app/api/agent/<id>/events`：连接建立 / 结束（含**已发送事件数**与存活毫秒） |
| 判读方式 | `connected` 但 `已发送事件=0` ⇒ 事件被中间层缓冲/吞掉；**连 `connected` 都没有** ⇒ SSE 请求根本没到服务端；出现 `[origin-check] 拒绝` ⇒ 前置代理改写 Host（需配 `PI_ALLOWED_ORIGINS`） |
| 说明 | 纯诊断版本，无功能变化；定位后再做对应修复（配置项 or 轮询兜底兼容模式） |

## 2026-09-30 — 修 Windows 客户端启动即「启动失败」（0.8.8-13，同事实锤）

| 类别 | 内容 |
|---|---|
| 现象 | Windows 0.8.8-11 打开即显示「启动失败」，错误 `Next server exited before ready: code=2147483651`；重装/换目录/清数据均无效 |
| 根因 | 主进程给内置服务固定传 `--stack-size=16384`（16MB）。Windows/Linux 主线程栈保留仅 8MB（PE `SizeOfStackReserve`）→ V8 初始化阶段越界终止，子进程**静默退出无 stderr**，退出码 `0x80000003`（STATUS_BREAKPOINT）。macOS 走 `utilityProcess.fork` 故未能复现 |
| 修复 | 新增 `electron/server-stack.ts`：栈大小收敛为 **10240（10MB）**、全平台统一（V8 默认 ~984KB 的 10 倍）；`main.ts` 三处调用同源 |
| 门禁 | `electron/server-stack.test.ts`：断言 ≤ 安全上界 12288、禁止 16384、且 ≥4096（保住原防爆栈收益） |
| CI 补强 | `scripts/smoke-standalone-server.mjs` 之前**不带 `--stack-size`**（所以 Windows CI 一路绿灯）→ 现改为从 `electron/server-stack.ts` 读同一常量、用与主进程一致的 argv 起服务并以 HTTP 200 判定就绪 |
| 说明 | 已手工热补丁 10240 的机器直接装本版即可（安装包覆盖 app.asar）；安装包仍未代码签名（自用构建，无证书） |

## 2026-09-30 — TOS 0.8.8.9-37：把 `no-transform` 从兜底规则里救回来（-36 的实测补刀）

| 类别 | 内容 |
|---|---|
| 实测发现 | 装 -36 到 .57 后用真实会话 id 打活 SSE：`content-type: text/event-stream` ✓、`x-accel-buffering: no` ✓、心跳 `:` ✓，**但 `Cache-Control` 是 `no-cache, must-revalidate`** ✗ —— 路由里写的 `no-cache, no-transform` 被 `next.config.ts` 的**兜底规则覆盖**了（`headers()` 后者覆盖前者） |
| 修复 | `next.config.ts` 在**最后**加三条流式路径规则（`/api/agent/:id/events`、`/api/auth/login/:provider`、`/api/files/:path*`）→ `Cache-Control: no-cache, no-transform`（最后 = 优先级最高，实测生效） |
| 门禁 | `package.test.ts` 加断言：三条规则存在、且必须排在 `/_next/static` 规则之后 |
| 意义 | `no-transform` 是给中转/relay/CDN 的信号（别压缩/改写响应体，否则事件被缓冲）——正是 TNAS.online relay 场景需要的（指南坑 67）；`X-Accel-Buffering` 未被覆盖，-36 已生效 |

## 2026-09-30 — TOS 0.8.8.9-36：流式响应补齐「防中转缓冲」头 + 心跳收紧到 15s

| 类别 | 内容 |
|---|---|
| 反馈 | 启用 **TNAS.online 远程访问**后，经 relay 打开 TOS 网页 → 打开 Pi Agent for TOS → 输入的会话**收不到模型回复**（同一台机器走 LAN 正常） |
| 分析 | 聊天 = POST 发送 + `GET /api/agent/<id>/events` 的 **SSE 长连接**接收。模型服务端照常跑，坏的是事件回流。两类原因：① 中间层**缓冲/空闲超时**（relay 常见）② 应用 **Origin 校验 403**（relay 改写 Host → Origin ≠ Host，需 `PI_ALLOWED_ORIGINS`）。**判定法：刷新页面——回复出现 ⇒ 第 ① 类；仍没有 ⇒ 第 ② 类**；DevTools 看 `/api/agent/...` 是 403 还是 200-pending |
| 修复 | 三条流式路由（聊天 SSE / OAuth 登录流 / 文件流）统一补 `Cache-Control: no-cache, **no-transform**` + **`X-Accel-Buffering: no`**（本应用 nginx 片段有 `proxy_buffering off`，但中转/relay 不受我们控制，只能靠响应头）；聊天 SSE 心跳 **30s → 15s**（relay 空闲超时常见 30-60s） |
| 门禁 | `package.test.ts` 新增断言：三条流式路由必须同时含 `no-transform` 与 `X-Accel-Buffering` |
| 文档 | 打包指南新增**坑 67**（判定法 / 修复 / 轮询兜底的取舍 / 推荐改用 VPN 或自有域名反代） |
| 局限 | 若 relay 本身不支持流式，补响应头也无济于事 → 只能做轮询兜底，或改用 VPN / 自有反代 |

## 2026-09-30 — TOS 0.8.8.9-35：修 -34 的自愈没生效（fetch 自动跟随 301 吞掉了 Location）

| 类别 | 内容 |
|---|---|
| 发现 | 装 -34 到 .57 后按「清缓存 + Host 不含端口」实测：仍 502，日志只有 `http://127.0.0.1:8181 不可达：fetch failed` —— **自愈分支从未执行** |
| 根因 | Node/Next 的 `fetch` **默认自动跟随重定向**：HTTP 候选收到的 301 被自动跟随到自签 HTTPS → TLS 校验失败 → 整个 fetch 抛错，代码拿不到 301 响应、自然也读不到 `Location`。实测 `redirect:"manual"` 时返回的仍是**真实响应**（`status=301, type=basic, location=https://127.0.0.1:6443/...`） |
| 修复 | 代理里所有 fetch 调用加 `redirect: "manual"`（主候选 + 自愈跟随各一处），并加测试断言该选项存在 |
| 验证 | .57 上（已开强制 HTTPS、HTTPS 端口 6443）：清掉 `data/tos-api-base` 缓存 + `Host: nas`（不含端口）→ 期望 **403** 且日志出现 `[tos-proxy] 经重定向自愈：使用 TOS API 地址 https://127.0.0.1:6443` |
| 说明 | -34 已发布但从未提交商店（本轮直接以 -35 覆盖） |

## 2026-09-30 — TOS 0.8.8.9-34：重定向自愈（从 301 的 Location 学出 HTTPS 端口）

| 类别 | 内容 |
|---|---|
| 背景 | 用户定位到根因的另一半：**TOS 设置里开启「强制将 HTTP 重定向到 HTTPS 连接」**（已在 tnas-57 复现）。此时 HTTP 端口对所有路径只回 **301**（实测 `http://127.0.0.1:8181/fileManage/list` → 301 + HTML），真正的 API 只在 HTTPS 端口（.57 实测 = **6443**，同事机器 = 5449）。-33 已能走回环 HTTPS，但端口靠入站 Host 推导 —— Host 被前置代理改写/缺失时仍会全灭 |
| 修复 | `lib/tos-proxy.ts`：候选返回 301/302/303/307/308 且有 `Location` 时，用 `loopbackUrlFromLocation()` 取 scheme + 端口 + 路径、主机强制改写为 `127.0.0.1` 再试一次（HTTPS 走放宽证书实现，HTTP 走 fetch）；成功即缓存该地址并记日志 `经重定向自愈` |
| 安全 | 仍**只对回环**（127.0.0.1 / localhost）放宽证书；非回环地址不变 |
| 测试 | `lib/tos-proxy.test.ts` +2 例（`loopbackUrlFromLocation` 各形态；**端到端**：Host 无端口 + HTTP 回 301 到 `https://192.168.124.57:6443/...` → 自愈拿到 403 且 base=6443）→ 该文件 15 例全过 |
| 真机 | -33 已在 tnas-57（该机已开「强制 HTTPS」，HTTPS 端口 = 6443）验证：`Host: <ip>:6443` → **403**（通），日志 `[tos-proxy] 使用 TOS API 地址 https://127.0.0.1:6443` |
| 指南 | 坑 66 补「强制 HTTPS」触发场景与重定向自愈说明 |

## 2026-09-29 — TOS 0.8.8.9-33：支持回环 HTTPS（自签证书）→ 修「只改 HTTPS 端口后加不了目录」

| 类别 | 内容 |
|---|---|
| 反馈 | 用户只改了 TOS 的 **HTTPS 端口**（10.18.15.57:**5449**）→ 应用能打开，但一「添加目录」就报 `无法连接 TOS 文件管理 API（已尝试：https://127.0.0.1:5449 / http://127.0.0.1:5449 / http://127.0.0.1:8181 / http://127.0.0.1:80）` |
| 根因 | 端口推导是对的（`https://127.0.0.1:5449` ✓），但 **TOS 的 HTTPS 用自签证书**，Node/Next 的 `fetch` 默认校验证书 → TLS 握手被拒；同端口降级 HTTP 也不行（TLS 端口）；8181/80 因端口被改而不通 → 候选全灭。（-30 的自适应只覆盖 HTTP 候选，当时为不引依赖跳过了 HTTPS 证书放宽） |
| 修复 | `lib/tos-proxy.ts` 新增 `loopbackHttpsRequest`（`node:https` + `rejectUnauthorized: false`）与 `isLoopbackHttpsUrl()`：凡命中**回环 HTTPS** 的候选改用该实现，其余仍走 fetch；`httpsImpl` 可注入便于单测 |
| 安全边界 | **只对 `127.0.0.1`/`localhost` 放宽**（目标是本机 TOS、不过网络），且仅用于固定路径 `/fileManage/*`；非回环地址永不放宽（有单测断言） |
| 测试 | `lib/tos-proxy.test.ts` +3 例（回环判定 / HTTPS 候选走放宽实现且不走 fetch / 回环 HTTPS 也失败时继续回落并给提示）→ 该文件 13 例全过 |
| 指南 | 新增**坑 66**（现象/根因/修法/安全边界/复现命令/应急） |

## 2026-09-29 — TOS 0.8.8.9-32：nginx location 升为 `^~`（修「应用永远打不开」，坑 65）

| 类别 | 内容 |
|---|---|
| 现象 | 用户反馈：改端口后 `http://<nas>:8282/piagentfortos/` **一直打不开**，刷新无效。访问日志显示 `GET /piagentfortos/ → 200 912 bytes`（= 落地页），且**没有任何 `/_next/static/*` 请求** ⇒ 其实从没进应用 |
| 根因 | TOS「应用访问控制」为应用生成了 `location ~ ^/piagentfortos/(.*) { auth_request …; try_files $uri $uri/ =404; }`（**正则**、无 proxy_pass）；nginx 顺序「`=` → `^~` → 正则 → 普通前缀」⇒ **正则赢**，包里的普通前缀反代永不被选中：未登录 302 桌面、已登录 `try_files` 命中 `/usr/www/piagentfortos/` 的落地页 → 200 落地页 |
| 修复 | `tos/assets/nginx/piagentfortos.conf`：`location /piagentfortos/` → **`location ^~ /piagentfortos/`**（`^~` 优先级高于正则，且以后平台再生成访问控制文件也不会被挡）；`tos/build.sh` 加门禁断言必须存在 `^~ /<appid>/` |
| 安全姿态 | 加 `^~` 后本应用**不再要求 TOS 登录**（用户确认「暂时不要求登录」）；团队其余 7 个应用本就是裸前缀反代、同样不要求登录。若将来要求登录保护，平台模板与本反代无法共存（指南坑 65 有说明） |
| 应急（已验证） | 挪开平台那份 `AppAccessControl-<appid>.conf` + `nginx -s reload` 即可立刻恢复（可逆）——用户已实测有效 |
| 指南 | 新增**坑 65**（含定位命令、`^~` 修法、代价与前提、应急步骤） |

## 2026-09-29 — TOS 0.8.8.9-31：修复升级后落地页不刷新（webui/ 那份漏同步）

| 类别 | 内容 |
|---|---|
| 发现方式 | -30 装到真机 tnas-57 后逐项验证：**代理自适应生效 ✓**（带 `Host: nas:8282` → 403，即已按新端口打通 TOS），但**落地页仍是相对链接** ✗ |
| 根因 | 包内 `/usr/local/piagentfortos/index.html` 已是绝对路由 ✓，但浏览器实际取的是 `/usr/www/<appid>/webui/index.html`（软链 → `/Volume1/@apps/<appid>/webui/`），而 postinst 只同步了 `@apps/<appid>/index.html` **漏了 `webui/` 那份** → 那份还是首装（9-24）时的旧文件 |
| 修复 | `tos/assets/postinst`：`@apps/<appid>/{index.html,webui/index.html}` **两处都同步**（webui 目录不存在则创建），并保持可读 |
| 附带 | `lib/tos-proxy.ts`：选中的 API 地址与默认值不同时打一条一次性 info 日志（`[tos-proxy] 使用 TOS API 地址 …`），真机排查"改过端口"时日志里能直接看到实际地址 |
| 验证方式 | 三处真机自测：① 带 `Host: nas:8282` 请求 `/piagentfortos/api/tos/fs/list` → **403**（≠502，说明自适应生效）② 反例 Host 指旧端口 → 走缓存/回落 ③ 装 -31 后 `webui/index.html` 应是绝对路由 |
| 备注 | 坑 64 补一句：**升级类改动若涉及落地页，务必确认平台那份 `@apps/<appid>/webui/` 也被刷新** |

## 2026-09-29 — TOS 包 0.8.8.9-30：端口自适应 + 落地页绝对路由 + 坑 63/64

| 类别 | 内容 |
|---|---|
| 触发 | 用户把 TOS HTTP 端口 8181 → 8282 后：① `pi agent for tos` 入口 404（`/piagentfortos/piagentfortos/`）② 目录选择失败 |
| 查清 | ① 入口 404 是**平台级**问题：改端口后平台重建 nginx 时所有应用的入口反代都丢了（同刻 metube/alist/navidrome/sftpgo/audiobookshelf 全 404，kavita 只剩认证跳转，beszelmonitor 只剩落地页）→ 指南坑 63；② 目录选择失败是应用侧**写死 8181**（`lib/tos-proxy.ts`）→ 本版自适应 |
| 修复 1 | `lib/tos-proxy.ts`：候选地址自适应 —— 显式 `TOS_API_BASE` → 从入站 Host/scheme **推导回环端口** → 上次成功地址（落盘 `data/tos-api-base`）→ 8181 → 80；首个"像 TOS"的响应（JSON 带 code/code_num 或 401/403）胜出并缓存 10 分钟；全部失败 **写日志（含实测 URL）+ 回 502 带可操作提示** |
| 修复 2 | 落地页 `tos/assets/index.html`：按钮/隐私政策链接由相对 `./piagentfortos/` 改**绝对路由** `/piagentfortos/`（对齐 Beszel）—— 原来在 `/piagentfortos/` 下会解析成 `/piagentfortos/piagentfortos/` → 那条 404；`tos/build.sh` 加**打包期门禁**（出现自指相对链接即失败） |
| 修复 3 | `probeTosAvailabilityDetail()`：就绪探测遇到 502 时把服务端提示带出来，UI 直接显示原因（不再误报"TOS 会话缺失"） |
| 测试 | `lib/tos-proxy.test.ts` 10 例（候选顺序/端口解析/像不像 TOS/跳过非 TOS 端口/缓存命中/提示文案）+ `lib/tos-api.test.ts` 补 1 例 |
| 平台侧 | 改端口后入口失效需重启平台或应用中心「停用→启用」重建（平台行为，非包缺陷）→ 指南坑 63/64 |

## 2026-09-29 — 修复 Windows 客户端缺少窗口按钮（0.8.8-12）

| 类别 | 内容 |
|---|---|
| 反馈 | Windows 版页面右上角**没有最小化/最大化/关闭按钮**，只能 Alt+F4 |
| 根因 | 窗口用 `titleBarStyle: "hidden"`（macOS 靠悬浮红绿灯），而 P22 把 `titleBarOverlay` 也关了；Windows 没有红绿灯 → 三个按钮全缺 |
| 修复 | 新增 `titleBarWindowOptions(platform, isDark)`：**仅 `win32` 启用 `titleBarOverlay`**（原生按钮回到内容右上角）；配色随主题（窗口创建用系统主题打底，之后由既有 `set-theme` 校正）；高度 36px 与顶栏等高；页面顶栏两端早有 `.w-titlebar { width: env(titlebar-area-width) }` 留位，按钮不会遮挡标签栏/文件面板按钮 |
| 不变 | macOS（悬浮红绿灯）、Linux（WM 自带）选项不变 |
| 测试 | `electron/title-bar-overlay.test.ts` +2 例（win32 有 overlay 且 36px；darwin/linux 无）；electron 与根 tsc 均通过 |
| 发布 | tag `v0.8.8-12`（仅桌面端；TOS 包是网页应用，无窗口按钮问题，不发新包） |

## 2026-09-28 — 发布 0.8.8-11（桌面端）+ 0.8.8.9-29（TOS 包）

| 类别 | 内容 |
|---|---|
| 桌面端 | tag `v0.8.8-11`（`package.json` 0.8.8-11）→ 三平台 DMG/EXE/deb；说明见 `docs/releases/v0.8.8-11.md` |
| TOS | tag `tos-v0.8.8.9-29`（`tos/config.env` VERSION/PKG_RELEASE）→ x86_64 + aarch64 deb |
| 内容 | 目录移除（组头 … → 移除，含解释文案）、dev chunk 缓存修正；以及 -10 的 21 语界面/输入法回车/升级缓存修复 |
| 备注 | 用户 Mac 客户端当时仍是 0.8.8-9，本次一次补齐到 0.8.8-11 |

## 2026-09-28 — 「已添加目录」支持移除（UI 缺失功能补齐）

| 类别 | 内容 |
|---|---|
| 来源 | 用户反馈：客户端里添加的目录（输入框上方「已添加目录」▾ 弹窗）**没有办法移除** |
| 现状 | 该列表 = `localStorage.__piDirs`（选中即记住，cap 50）∪ 会话目录（`/api/sessions` 按最近活动去重降序）；弹窗里只有选择、「使用默认目录」、「选择其他目录…」，**没有移除入口** → 手动添加过的目录永久滞留（P17 原始设计也没有移除） |
| 方案迭代 | ① 首版在输入框「已添加目录」弹窗里做了 hover 悬浮 **×** → **用户反馈「太隐蔽、设计不好」**；② 改为**左侧目录组头加「…」菜单，菜单项「移除」**（与侧栏会话行「更多操作」同一惯例，常显低不透明度，不再 hover-only）；③ 弹窗里的 × 已撤掉 |
| 机制 | 隐藏表 `localStorage.__piDirsHidden`：移除 = 从 `__piDirs` 删掉 + 记入隐藏表 → **侧栏分组与输入框弹窗同时不再显示**该目录（即使它来自会话目录）；不删会话、不动磁盘 |
| 移除范围 | 侧栏**分组**、侧栏**历史目录列表**、输入框「已添加目录」三处同时不再显示（用户反馈：已移除的目录为啥还留在历史记录里）——判据统一为 `lib/added-dirs.ts` 的 `isDirVisible()` |
| 恢复路径 | **重新添加**：侧栏 folder-plus「新建目录」/ 历史下拉底部「自定义路径…」/ 输入框「选择其他目录…」→ 选中即解除隐藏（用户建议：想恢复重新添加就行，不必从历史里找回） |
| 解除隐藏只认用户点击 | 曾把解除隐藏放在 `AppShell.handleCwdChange`，结果启动时恢复上次目录也走到那里，一刷新就把刚移除的目录拉回来（E2E 实测踩到，已改为只在点击回调里调用 `persistRemembered`） |
| 解释文案 | 「移除」菜单项下方加一行灰色小字 **「仅从列表隐藏，聊天记录保留」**（11.5px `--text-dim`）——用户问「重新添加后聊天记录还在吗」，直接答在 UI 里；新增 1 个 i18n 键 `sidebar.removeDirectoryNote`，已同步 **en + zh + 19 语种**（i18n 门禁 9/9 通过） |
| 跨面板同步 | 新增自定义事件 `pi:dirs-visibility`（`notifyDirsVisibilityChanged`/`onDirsVisibilityChanged`），写入隐藏表后广播 → 侧栏立即重渲染（否则「从历史目录恢复后侧栏分组不出现」，E2E 实测踩到） |
| 实现 | 逻辑抽成纯模块 `lib/added-dirs.ts`（storage 经 `StorageLike` 注入，便于单测）：`mergeAddedDirs` / `rememberAddedDir` / `forgetAddedDir` / `persistRemembered` / `persistForgotten` / `notifyDirsVisibilityChanged` / `onDirsVisibilityChanged`；移除入口落在 `SessionSidebar` 组头（portal 菜单，按视口夹取，避免被侧栏 overflow 裁掉） |
| 测试 | 新增 `lib/added-dirs.test.ts` **9 例**（含「移除后即便有会话目录也不显示、重新选中恢复」的完整流程）；全套 `npm test` **713 tests / 710 pass / 0 fail**（3 skipped）；`npx tsc --noEmit` 通过 |
| E2E（dev :30199 + CDP 实际点击，Puppeteer 脚本） | ①刷新后仍保持已移除（组头 13/14）✓；②点侧栏历史目录 → 恢复显示（14/14，隐藏表清空）✓；③组头 … → 移除 → 分组立即消失（14→13）且隐藏表记录 ✓；④输入框弹窗无 ×、已移除目录被过滤 ✓ |
| 顺带修复（dev 体验） | `next.config.ts`：`/_next/static/*` 的 `immutable` **只在 `NODE_ENV=production` 生效**，dev 改发 `no-store, must-revalidate` —— 否则浏览器把 dev chunk 当 immutable 缓存一年，改完代码刷新仍拿旧 bundle（**本次实测把「改完看不到」误判成没热重载，抓调用栈 4 轮才定位**）；`package.test.ts` 断言同步更新（含 `NODE_ENV==="production"` 门禁检查） |
| 边界说明 | 隐藏只影响该列表显示，**不动磁盘目录、也不影响已有会话**；要让某目录彻底从历史里消失，删除对应会话即可（侧栏 CWD 下拉本就只从会话派生） |

## 2026-09-27 — 修 config.ini 的 platform 随架构生成（arm64 被平台 Platform mismatch 拦下）

| 类别 | 内容 |
|---|---|
| 发现方式 | 用官方 **Agent API** 首次真提交：amd64 包 10 项校验全过（含 `Icon Compliance`），但 arm64 包被 `platform_mismatch` 拦下 |
| 驳回原文 | `Platform mismatch: the platform bound architecture is aarch64, but the package resolves to ARM64. / Please select a package for the aarch64 architecture, or change the platform field in config.ini to aarch64.` |
| 根因 | `tos/build.sh:73` 写的是 `arm64) PLATFORM_NAME="ARM64"` —— 平台侧只认 `x86_64` / `aarch64`，既不是 dpkg 的 `amd64`/`arm64`，也不是 `ARM64`。**这是独立于 deb control `Architecture` 的第三条架构口径**（指南坑 56） |
| 为何一直没暴露 | 之前的 verify 阶段没有任何断言检查 config.ini 的 `platform` 字段，而本地/CI 都只构建 amd64 → 错值一路绿灯到平台 |
| 修复 | ① `PLATFORM_NAME` arm64 → **`aarch64`**；② verify 新增两条断言：`config.ini platform == 目标架构映射值` 与 `platform 属于 {x86_64,aarch64}` |
| 验证 | 断言对四种输入实测：`x86_64` ✓ / `aarch64` ✓ / `ARM64` ✗ / `arm64` ✗（正确拦截） |
| 副作用 | -27 的 arm64 包已发布到 Release 但**不可用**，需以 -28 重发；amd64 的 -27 已提交审核（正确、无需重发，若要保持两平台版本一致则需撤回后重提） |
| 版本 | 0.8.8.9-27 → **0.8.8.9-28** |

## 2026-09-27 — 图标改为真正的矢量 SVG（原为「PNG 内嵌 SVG」，不符商店 clean SVG 要求）

| 类别 | 内容 |
|---|---|
| 背景 | 准备提交 TOS 官方开发者平台，按指南坑 52（Icon Compliance）预检图标时发现：`piagentfortos.svg` 实际是**一张 512×512 PNG 用 base64 内嵌在 SVG 壳里** —— 全文只有 `<svg>` + `<image>` 两个元素、32.5 KB |
| 为何一直没被发现 | 自己 `build.sh` 的图标门禁只数「元素 + 锚点 ≤ 50」，内嵌位图恰好节点最少（2 个）→ **绿灯通过**。审核原文要的是 *"a clean SVG … remove complex paths, filters, and redundant layers"*，位图不是 clean SVG |
| 修复 | **描摹原图轮廓**（不是重画）：白底中性、粉色笔触 → 像素的饱和度差即抗锯齿的 alpha 覆盖率；以 0.5 覆盖率做 marching squares 取亚像素等值线（1310 点）→ Douglas-Peucker 简化到 105 锚点 → Catmull-Rom 转三次贝塞尔平滑；填色取编码核心区实测均色 `#e848a2`。结果：**5371 B / 3 元素 / 105 锚点 / IoU 99.59%**（原：32.5 KB / 2 元素） |
| ★ 方法上的教训 | 第一版选了「看着重画」而不是描摹，上限被自己钉死在 94.5%——**用户直接质疑说得很对：原图本来就能矢量化，为什么要重画**。只要图形是「单色块 + 抗锯齿边缘」，描摹就是精确解：抗锯齿像素的 alpha 恰好就是形状的亚像素边缘信息。只要描摹能把 IoU 做到 99.6%，而手画最多 94.5% |
| 描摹中的真坑 | 一度卡在 96.8% 上不去，且「原图独有 290 / 我独有 299」几乎相等。这是**平移**的特征（不是缩放/阈值）：`sharp` 的 raw 缓冲里像素 (x,y) 的中心在 **(x+0.5, y+0.5)**，而我把它当整数格点采样 → 整个轮廓平移半个像素。修正后直接 96.8% → **99.75%** |
| 两次自作主张的偏差 | ① 原图是**纯色**（按 y 分 8 段采均色几乎一致），我却加了 `#ea4aa4→#d93c8f` 的渐变；② 折行时把数字 `236` 从中间劈成 `2`/`36`，渲染出来 IoU 掉到 12.9%。都已纠正 |
| 门禁口径修正 | 原断言「元素 + 锚点 ≤ 50」既拦不住真正的违规、又会误杀合规件（描摹件 105 锚点）。按指南坑 52 的实测口径——“nodes” = SVG **元素个数**（kavita 160 条路径指令 / 7 元素过审；vaultwarden 62 元素被拒）——改为：viewBox、**元素 ≤ 50**、体积 ≤ 50 KB、禁内嵌位图/filter/use/编辑器冗余、锚点数兑底 ≤ 600。已验证：旧图标报 ❌（抓住 `<image>`），新图标 ✓ |
| 附带修正 | 断言里的 `re.findall(r'\sd="…"')` 必须加 `re.S` —— 路径的 `d` 属性折行后，不带 `S` 会一条都抽不到（锚点恒为 0），门禁形同虚设 |
| 视觉验证 | 新旧并排 512 / 210 / 48 / 24 px + 像素差分双重核对；原图独有的 61 px 全集中在笔锋斜切处的亚像素过渡带 |
| 未改动 | 隐私政策可发现性（当前 UI 无入口、落地页未路由）经确认**本次不加** |
| 版本 | 0.8.8.9-26 → **0.8.8.9-27**（仅图标与门禁，应用代码不变） |

## 2026-09-27 — 修「升级后界面还是旧的」根因：文档不再长期缓存（真机 tnas-57 实证）

| 类别 | 内容 |
|---|---|
| 现象 | TOS 应用升级到 0.8.8.9-25（含输入法回车修复）后，服务端产物确认是新代码（chunk 里能搜到 `onCompositionStart`/`onCompositionEnd` 与宽限逻辑、HTML 引用的 chunk 全在磁盘），但用户浏览器里行为照旧；用户原话「dev 里验证通过了，真机上这个版本又不行了」 |
| 根因 | Next 对预渲染页面默认下发 `Cache-Control: s-maxage=31536000`（+ `x-nextjs-cache: HIT`、`x-nextjs-prerender: 1`），浏览器长期留着旧 HTML（引用旧 chunk 名）；旧 chunk 又带 `immutable, max-age=31536000` → 一直跑升级前的 JS。旧 chunk 文件虽已被 dpkg 删掉，浏览器无需回源 |
| 修复 | `next.config.ts` 新增 `headers()`：文档/接口 → `no-cache, must-revalidate`（可 304，成本极低）；`/_next/static/*` → `public, max-age=31536000, immutable`。**顺序要紧**：Next 后者覆盖前者，兜底必须在前、hashed 在后（实测反了 immutable 会被盖掉） |
| 验证 | 本地按 TOS 形态（`TOS_BASE_PATH=/piagentfortos`）起 standalone 实测三种响应头均正确：文档 `no-cache, must-revalidate` / chunk `immutable` / API `no-cache, must-revalidate` |
| 防回归 | `package.test.ts` 新增断言（含顺序断言）；nginx 反代 conf 加注释「缓存头由应用下发，不要重复 add_header」 |
| 指南 | 新增坑 62（含一条命令定位 + 一线救急：强制刷新） |
| 版本 | 0.8.8.9-25 → **0.8.8.9-26** |
## 2026-09-26 — 修「半成品本体进包」：-21 所有 /api/* 500，界面「无法加载会话」（真机 tnas-57 实证）

| 类别 | 内容 |
|---|---|
| 现象 | -21 装好后服务 `active`、首页 200，但**每个 API 路由都 500**（`/api/sessions` 500）→ 侧栏「无法加载会话」，同时 TOS 会话探测失败导致提示「未找到 TOS 登录会话，请重新登录 TOS」 |
| 报错 | `Failed to load external module next/dist/compiled/next-server/app-route-turbo.runtime.prod.js: Cannot find module`（服务不崩，只在请求时炸） |
| 根因 | 打包用的 `.next/standalone` 是**「只跑了 next build」的半成品**：包内 `node_modules/next/dist/compiled/next-server/` 只有 3 个 runtime 文件（完整构建有 6 个），且链接农场是空目录。完整本体必须由 `npm run build:standalone:linux` 产出 = `next build` + `ensure-standalone-next-runtimes` + `ensure-standalone-pi-runtime` + `dereference-standalone-symlinks` + smoke **一整条链**；NAS 侧那份 12:24 的产物只有 2683 文件（完整本体 17687），明显是只跑了第一条 |
| 修复 | `build.sh` stage 阶段新增**本体体检**（本体体检三项：① API 路由运行时齐全 ② 无指向树外的符号链接 ③ `.next/node_modules` 链接农场每项都能解析出 package.json），不达标直接 fail 并提示「请用 npm run build:standalone:linux 重新打包」；verify 另加一条 `app-route-turbo.runtime.prod.js` 存在断言 |
| 为什么 CI 没拦住 | CI 本来就走完整 `npm run build:standalone:linux`，本体是好的；坏的是本地/NAS 手工打包路径。**但 CI 也无法替本地把关**，所以门禁加在 `build.sh`（两条路径共用） |
| 验证 | 体检脚本对两个真实树实测：完整本体 pass、12:24 半成品 fail（报缺 2 个 runtime 文件）；真机用 CI 重打的包验证所有 API 恢复 |
| 版本 | 0.8.8.9-21 → **0.8.8.9-22**（应用代码不变） |

## 2026-09-26 — 修「权限随构建环境 umask 进包」：-20 安装后服务秒退（真机 tnas-57 实证）

| 类别 | 内容 |
|---|---|
| 现象 | 安装 `-20` 后卡在应用中心「安装中」，随后应用始终无法启用；`systemctl status` 显示 `failed`，journal 一行 `Error: Cannot read package config /Volume1/@apps/piagentfortos/standalone/package.json: permission denied`（`ERR_INVALID_PACKAGE_CONFIG`） |
| 根因1 | `-20` 包内文件是 **0640 / 目录 0750、属主 root:root**（对比 `-18` 的 0644/0755）。来源：构建环境 umask=027（在 TOS 应用内自建包时 systemd 单元的 `UMask=0027` 会随会话传下来）经 `cp -R` 渗透——`cp` 不带 `-p` 时目标权限 = 源权限 & ~umask |
| 根因2 | `postinst` 的「应用目录属主」那行是**静默 no-op**：`$APP_DIR=/usr/local/piagentfortos` 是指向数据卷的**符号链接**，而 `chown -R` 默认不跟随顶层符号链接 → 代码树一直是 root:root。以前文件是 0644，root:root 照样能跑，所以两年没暴露；一旦是 0640 就当场致命 |
| 修复1 | `build.sh`：开头 `umask 022`；stage 末尾新增 `normalize_modes`（目录 0755；文件按是否可执行给 0755/0644） |
| 修复2 | `makedeb.py`：入 tar 时归一权限（`normalize_mode()`，`--keep-modes` 可关），并把「归一了多少项」打出来——源树不干净要在构建期就看得见 |
| 修复3 | `postinst`：改用 `readlink -f` 取真实路径递归 chown（仅代码树，`data/` 保持 0640 不给 NAS 其它用户读），并在启动前对代码树补读位，作为旧坏包的兜底 |
| 修复4 | `postinst` 就绪检查失败时，直接把 journal 里第一条 `Error` 原样打出来（应用中心只显示「安装中」，用户此前拿不到任何线索） |
| 防回归 | `build.sh` verify 新增两条断言：`包内文件对其它用户可读`、`包内目录可被其它用户遍历` |
| 验证 | 真机 tnas-57：`chmod -R a+rX` 后服务立即 `active`（Next `Ready`）、`/piagentfortos/` 经 nginx 返回 200；本机 `makedeb.py` 单元实测 0640→0644、0750/0750→0755 |
| 版本 | 0.8.8.9-18 → **0.8.8.9-21**（应用代码不变） |

## 2026-09-26 — 打包链修三个真缺陷（本地构建体积翻倍 / public 双拷 / 溯源恒为 unknown）

| 类别 | 内容 |
|---|---|
| 现象1 | 本地出包体积异常：120MB → **268MB**，安装后 437MB → **853MB** |
| 根因1 | `lib/bundled-tools.ts` 的动态 fs 访问触发 Next「整项目追踪」，把 `tos/build`——上一次 `build.sh` 留下的完整 stage（可达 400MB+）——扫进了 `standalone` |
| 修复1 | `next.config.ts` 的 `outputFileTracingExcludes` 补 `tos/build/**/*` 与 `tos/dist/**/*`（原有 `release/**`、`dist/**` 等保持不变） |
| 现象2 | deb 里出现 `standalone/public/public/`，静态资源白多一份（实测 +18MB，`pi.gif` 16MB 存了两份） |
| 根因2 | Next 16 的 standalone **自带 `public/`**，而 `build.sh` 又 `cp -R $APP_ROOT/public .../standalone/public`，目标是已存在目录 → 被拷成了子目录 |
| 修复2 | 改为按内容合并：`cp -R "$APP_ROOT/public/." "$APP_DIR/standalone/public/"`（`public/` 是 Next 自带的，`.next/static` 仍必须自己拷——它也确认没被嵌套） |
| 现象3 | 本地出包的 `BUILD-INFO` 里 `SRC_COMMIT=unknown`，溯源形同虚设 |
| 根因3 | `build.sh` 的 `git -C "$REPO_DIR" rev-parse HEAD` 撞上 git 的 `dubious ownership`（仓库属主与执行账号不同，NAS 上必现；CI runner 是干净用户所以不踩） |
| 修复3 | 加 `-c safe.directory="$REPO_DIR"`，不依赖全局 git 配置 |
| 防回归 | `build.sh` verify 阶段新增两条断言：`standalone 无 public/public 嵌套`、`standalone 未挟带构建临时区 tos/build` |
| 验证 | 见提交说明：先实跱“污染后再构建”验证修复 1 真生效（非纸面推断） |
| 版本 | 0.8.8.9-19 → **0.8.8.9-20**（纯打包链维护，应用代码不变） |

## 2026-09-26 — 降级思考球定版（慢转 + 反向焦散 + 暖色外发光）+ 思考球实验室

| 类别 | 内容 |
|---|---|
| 背景 | 降级球（浏览器拿不到 WebGPU 时显示，TOS 明文 HTTP 下就是这颗）此前是「1600ms 单层锥形扫光」，观感像旋转的陀螺而不是液体 |
| 改动 | `app/globals.css`：`.liquid-thinking-fallback` 改为四子层（`.sweep` 扫光 / `.caustic` 反向焦散 / `.hi` Lissajous 游走高光 / `.rim` 边缘光），参数全部提为 `--orb-*` 自定义属性；`components/LiquidOrbCanvas.tsx`：降级分支渲染这四个子层 |
| 定版参数 | 扫光 9.2s、焦散 24s×0.3、高光 7.7s、模糊 7.5px、外发光 0.7（#ff6251）、边缘光关 —— 由仓库所有者在本页的 orb-lab 里拖定 |
| 工具 | 新增 `scripts/build-orb-lab.mjs` + `orb-lab.template.html`：生成 `public/orb-lab.html` 实验页。着色器/seed/降级球 CSS **全部从源码抽取**（不复制），真球 6 组预设 + 12 个 uniform 滑块 + 128 float seed 导出；降级球 5 组预设（含「改版前」对照）+ 参数滑块 + CSS 导出 |
| 测试 | 新增 `scripts/orb-lab.test.mjs`（2 例）：守着「源码改形状 → 生成器先红」与「无 WebGPU 分支 + 26 个滑块全部可跑」 |
| 兼容 | `prefers-reduced-motion`（扫光/焦散停、高光转低幅脉动）与 `prefers-reduced-transparency` / `prefers-contrast` 三处媒体查询同步跟进 |
| 基线 | 基于 `05d5c3c`（= 已发布 0.8.8.9-18）；本改动只碰 `app/globals.css` 与 `LiquidOrbCanvas.tsx`，不涉及 0.8.8-8/-9 的超长会话修复 |
| 验证 | tsc 零错误；693 项测试 685 通过（5 例失败全为 `lib/git-worktree` 依赖 git ≥2.36 的 `-z`，本机 git 2.34.1 的既有环境问题）；版本 0.8.8.9-19 |

## 2026-09-23 — 发布 v0.8.8-6（Windows 工具能力补齐）

| 类别 | 内容 |
|---|---|
| 内容 | Windows 工具能力补齐（preset 用 powershell + 默认带 grep/find/ls + 随包内置 rg/fd）+ NewAPI 网关 422 兼容 + Titlebar Overlay 修复 + 中断提示文案 |
| 发版 | `v0.8.8-6` 全新 tag；三平台打包成功，10 个资产齐全（Windows exe 181MB / macOS DMG 323MB / Linux deb 178MB） |
| 勘误 | 排查期间一度判定「上传静默失效、资产为 0」，实为**代理下 GitHub API 资产列表陈旧**（`/releases` 列表端点与 `/releases/tags/<tag>` 均返回 assets=0，而 `/releases/<id>` 与按 id 的 assets 端点为 10；公网 HEAD 下载亦 200 正常）。教训：**校验资产一律按 release id 查或直接 HEAD 探测下载，不要用列表端点的 assets 字段** |
| 代价 | 因误判删除了内容相同的 v0.8.8-5（其 tag 与 Release 已清理，未对外分发过链接，无影响） |
| 经验 | ① tag 推送后 Release 对象会在工作流启动前若干秒被创建（v0.8.8-4 同样如此且资产正常），属正常现象；② 长任务用后台运行 + 短轮询，避免工具超时中断对话 |

## 2026-09-23 — 发布 v0.8.8-5：Windows 工具能力补齐（同事反馈）

| 类别 | 内容 |
|---|---|
| 根因 | ① 预设只有 `bash`：Windows 上 pi 的 bash 需 Git Bash，缺装即「No bash shell found」→ 不能执行命令；② 默认预置缺 `grep/find/ls` → 不能列目录/搜文件；③ `grep/find` 依赖的 rg/fd 由 pi **运行时**从 GitHub 下载（国内失败）→ 搜索等于不可用 |
| 修复 | `lib/approval-policy.ts`：新增平台感知 `SHELL_TOOL`（win32→powershell，其他→bash），默认/完整预置补 `grep/find/ls`，ASK_CONFIRM 与 summarize 兼容 powershell；新增 `lib/bundled-tools.ts` + `scripts/fetch-tool-binaries.mjs`：构建期按平台拉取 rg/fd → 打包进 `resources/bin` → 首次启动复制到 `~/.pi/agent/bin`（pi 的 ensureTool 命中本地文件即不再联网）；`electron-builder.yml` extraResources 与四个打包脚本接入 |
| 验证 | 单元测试 4 项（复制/幂等/来源选择/平台过滤）+ 真机验证：rg 15.2.0、fd 10.5.0 落位并可执行，pi 的 getToolPath 命中该目录；全量 `npm test` 616 通过 0 失败 |
| 发版 | `0.8.8-5`，发布说明 `docs/releases/v0.8.8-5.md` |


## 2026-09-22 — 发布 v0.8.8-4

| 类别 | 内容 |
|---|---|
| 发版 | `0.8.8-4`；内容 = NewAPI 网关 422 兼容兜底 + Windows Titlebar Overlay 主进程异常修复 + 测试基线修复 |
| 说明 | 发布说明 `docs/releases/v0.8.8-4.md`；本地构建验证通过后推 tag 由 CI 打三平台 |


## 2026-09-22 — 修两处反馈（NewAPI/DeepSeek 422 + Windows Titlebar Overlay 异常）+ 测试基线修复

| 类别 | 内容 |
|---|---|
| 网关兼容 | NewAPI/OneAPI 等第三方网关调 DeepSeek 报 `422 messages[0].role: unknown variant \`developer\`` ← pi 对 reasoning 模型默认用 developer role。新增 `lib/gateway-compat.ts`：对 models.json 中自定义 openai-completions provider 未显式声明 `compat.supportsDeveloperRole` 时自动补写 `false`（改用 system role）；显式声明优先、官方 OpenAI/Azure 跳过、幂等。接入 `lib/pi-runtime.ts`（模型 API 路径）与 `lib/rpc-manager.ts`（agent 会话路径，真正发请求处）。文档依据：pi docs/models.md「Some OpenAI-compatible servers do not understand the developer role」 |
| Windows 崩溃 | 主进程弹「A JavaScript error occurred in the main process / TypeError: Titlebar overlay is not enabled」← **我们的 P22 回归**：窗口已移除 `titleBarOverlay`（原生遮盖条），但 set-theme IPC 仍调用 `setTitleBarOverlay`（Windows 上函数存在→调用即抛）。`electron/title-bar-overlay.ts` 改为 try/catch + 按窗口 WeakSet 记忆，静默降级 |
| 测试基线 | 修 3 处 P 系迁移遗留的陈旧断言：panel-layout 侧栏默认宽 260→347（P5）、electron-titlebar-layout 引用已删除的 `PiAgentTitle.tsx` 与 11px/ml-auto 旧值（改断言 `pi-title-light/dark` 与 13px、右对齐）；顺带移除 globals.css 中已无元素使用的死规则 `.pi-agent-title{display:none}`。`npm test` 612 通过 / 0 失败；`tsc --noEmit` 零错误 |
| 构建脚本 | `build:standalone` 里目录补丁移到 `next build` 之后（package.test.ts 要求以 next build 开头；pi-ai 为运行时依赖，位置不影响生效，且仍在拷贝运行时包之前） |


## 2026-09-22 — 发布 v0.8.8-3

| 类别 | 内容 |
|---|---|
| 发版 | `0.8.8-3`；推 tag → CI 三平台打包（Windows NSIS / macOS universal / Linux deb） |
| 内容 | 侧栏折叠持久化 + 切会话自动落底 + deepseek 清单只留 V4.1 Flash |
| 说明 | 发布说明 `docs/releases/v0.8.8-3.md`；自动更新源指向本仓库 |


## 2026-09-22 — 修复三则（待发 v0.8.8-3）

| 类别 | 内容 |
|---|---|
| 侧栏折叠 | 目录折叠状态持久化（localStorage `__piCollapsedGroups`）：原先仅组件 state，重挂载/重启即全展开 |
| 会话滚动 | 切会话自动落到最新历史：`useChatScroll` 的 `initialScrollDoneRef` 置 true 后永不复位 → 新会话停在最早历史；现按 `sessionKey` 复位并在 0/120/400ms 兜底跳底 |
| 模型目录 | deepseek 只留 V4.1 Flash：P14 过滤改为只放行 `deepseek-flash`；新增 `scripts/patch-model-catalog.mjs` + `vendor/pi-ai/deepseek-0.86.1.json`（上游已把 `deepseek-v4-flash` 改名 `deepseek-flash`），构建期幂等对齐，接入 `build:standalone`。将来升 pi-ai 至 ≥0.86.1 后该补丁自动失效可删 |
| 构建环境 | electron 下载走 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 更稳（代理传大文件易 TLS/ECONNRESET 中断）；本地重建仍需 `env -u NODE_ENV -u __NEXT_PRIVATE_STANDALONE_CONFIG -u __NEXT_PRIVATE_ORIGIN -u NEXT_DEPLOYMENT_ID` |
| 远端 | fork 远端改 SSH（`git@github.com:Moechz/pi-agent-desktop-fork.git`）：直连 443 现已可用，代理反慢 |


## 2026-09-21 — 发布 0.8.8-2（首个源码 fork 版、公开仓库）

| 类别 | 内容 |
|---|---|
| 发版 | `v0.8.8-2` tag 触发 CI 三平台打包（win NSIS / mac universal / linux deb），发布说明 `docs/releases/v0.8.8-2.md` |
| 图标 | macOS 规范几何：824/1024 居中 + 四角透明（修「比其它 App 大一圈」）；win/linux 保持满幅 |
| 更新源 | `electron-builder.yml` publish 改指本仓库（owner/repo/author/copyright/maintainer 元数据同步为维护者）；**杜绝拉上游版覆盖定制** |
| 公开 | 仓库转 public（CI 免费额度 + 同事免协作即可下载） |
| 署名 | 我方文件去第三方人名（README/AGENTS/electron-builder）；LICENSE 与包名等法律/结构标识保留 |
- `a0eb4f6` 修侧栏不自动重排：4 秒轮询数据回写列表（签名比对）+ 激活后 350ms 静默重取；`tsc --noEmit` 零错误
- 构建环境坑（复现记录）：**宿主注入的 `__NEXT_PRIVATE_*` / `NEXT_DEPLOYMENT_ID` / `NODE_ENV` 会让 `next build` 直接失败**（`TypeError: generate is not a function`）。本地重建必须：
  `env -u NODE_ENV -u __NEXT_PRIVATE_STANDALONE_CONFIG -u __NEXT_PRIVATE_ORIGIN -u NEXT_DEPLOYMENT_ID npm run dist:mac`（CI 无此污染，故 CI 正常）
- `scripts/install-local-mac.sh`：本地换装一键脚本（Terminal 运行；退出应用→覆盖 /Applications→去隔离→重启）



## 2026-09-21 — 用户验收轮：侧栏头部定稿

- `c2c88a9` 新会话按钮靠左 + 选中行左橙边 2→4px
- `caf000c` 组内 modified 降序（活跃会话浮顶，生产版行为找回）
- `b73c9e1` 标题行：红π logo（用户提供 piiconsmall.png 提取透明版）+ 标题
- `fb3c726` 头部下移 40px 避让 titleBarOverlay（36px 原生遮盖条曾盖住标题）
- `b638374`/`150ac0e` 标题可见性攻坚：文字在用户 Electron 中长期不可见，最终方案=内联品牌粉红 #ea46a1 + WebkitTextFillColor + translateZ(0) 独立合成层 + zIndex 999 —— 可见
- logo 尺寸迭代 20→60→50；按钮行 marginTop 68→44→28→0（y88，物理上移极限）
- 烘焙图方案（π+标题合成 PNG）一度可见但侧栏拉伸时 flex 压扁变形，弃用——教训：flex 内 img 必须 flexShrink:0

## 2026-09-20 — 二次全量对齐（生产版产物逐字对照）

- `ba514f7` 绿点判定改 /api/agent isStreaming 轮询、组头运行计数胶囊 N ▶、P10 思考手风琴、P6b 两处弹层
- `512dc24` 侧栏宽度 347、时间 10.5px、组头图标 sw2/双态色、四钮顺序、P17 HDR/弹窗/持久化语义全面对齐
- P4/P9 编号确认从未存在；P8 色板/字体/markdown 标题断言齐全

## 2026-09-20 — C 批：首枚自构建 DMG

- `Pi-Agent-Desktop-0.8.8-mac-universal.dmg`（universal 298MB，含 P1–P21 全部定制）
- 冒烟（smoke-packaged-standalone）通过；归档旧仓库 backup/installer/
- 构建环境坑入档：NODE_ENV=development 不可带入 next build；electron-builder 下载需代理

## 2026-09-20 — B 批组件逻辑移植完成（P1–P21 全量入源码）

- `1e96de3` P15+P3-2+P18：侧边栏按目录分组、40px 紧凑行、运行绿点轮询、explorer 默认收起
- `7a856f0` P17：编写器新会话目录行 + ▾ 弹窗（会话目录 ∪ localStorage __piDirs）
- `6bc519a` P1+P13：轮次级只留结果（块/消息/列表三层）+ errorMessage 红条
- `2e76b47` P16：侧栏标题行四钮（新建目录/历史目录/新会话/刷新）
- `d48e85e` P7+P10b+P11+P12：图标 18px、思考面板默认展开、保存过滤空 id、模型名入按钮
- `54a9e8d` P21：硬编码英文中文化 21 处
- `8b0907c` P14：/api/models deepseek 仅留 V4.1 Flash（UI 层过滤）
## 0.8.8-fork.0 — 2026-09-20
### Added
- 立项：自 v0.8.8 分叉，建立六文档体系与移植需求清单（REQUIREMENTS.md）。
- 本版本为零修改基线，行为与上游 v0.8.8 完全一致。
