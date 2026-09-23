## 2026-09-21 — 正式版 official-v1 切换

| 类别 | 内容 |
|---|---|
| 里程碑 | 补丁系统退役，源码 fork 全面接管 `/Applications` |
| 最终态 | logo 30×30 + 标题 Pi Agent Desktop 18px/500 双 span 明暗；顶部留白 21px（原生遮盖条已移除，红绿灯悬浮与标题同排）；新会话 150px 右对齐组；底部 模型/技能 缩短靠左 |
| 退役 | launchd `com.user.pi-ui-patch` 卸载、`~/.pi-ui-patches` → 旧仓 `backup/patches-retired/` |
| 归档 | DMG `389416f7…` 存于旧仓 `backup/installer/` |

# Changelog

## 2026-09-23 — 发布 v0.8.8-6（替代未产出资产的 v0.8.8-5）

| 类别 | 内容 |
|---|---|
| 背景 | v0.8.8-5 的 Release 由某轮工作流提前建为空壳（created 09:11），上传 job 走「已存在」分支后 `gh release upload` 两次均报成功但资产始终为 0；重跑单 job 仍复现 → 改为切全新 tag |
| 处置 | 删除空 Release 与 v0.8.8-5 tag，版本升至 0.8.8-6，内容与 0.8.8-5 一致（Windows 工具能力补齐 + 中断提示文案） |
| 备注 | 经验：Release 若被提前创建，后续上传可能静默失效；发版保持「全新 tag → 工作流 create+upload」路径最稳 |


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
