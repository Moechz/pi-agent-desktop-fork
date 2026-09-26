## 2026-09-21 — 正式版 official-v1 切换

| 类别 | 内容 |
|---|---|
| 里程碑 | 补丁系统退役，源码 fork 全面接管 `/Applications` |
| 最终态 | logo 30×30 + 标题 Pi Agent Desktop 18px/500 双 span 明暗；顶部留白 21px（原生遮盖条已移除，红绿灯悬浮与标题同排）；新会话 150px 右对齐组；底部 模型/技能 缩短靠左 |
| 退役 | launchd `com.user.pi-ui-patch` 卸载、`~/.pi-ui-patches` → 旧仓 `backup/patches-retired/` |
| 归档 | DMG `389416f7…` 存于旧仓 `backup/installer/` |

# Changelog

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
