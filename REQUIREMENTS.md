# 需求文档：P1–P21 补丁 → 源码移植清单

> 每条的权威行为描述在旧仓库 `~/Documents/projects/pi-agent-UI-change-memo/PATCHES.md`（含截图式细节与踩坑记录）。
> 本文是源码移植的作战地图：**行为 → 源码落点（初步定位，移植时核实）→ 验收标准**。
> 落点标注 ❓ 的需先定位再动手。

## 移植总原则
1. 语义等价优先：先做到「与补丁版行为一致」，再谈源码层面的更优雅写法。
2. 每条移植完成即在开发模式（`npm run dev`）人工验收，全部完成后打包 DMG 再过一遍。
3. 验收时以**补丁版正式应用**为对照基准（它还在机器上跑着）。

## A 批：CSS / 配置类（先做，半天量级）

| # | 行为 | 源码落点（实际） | 验收 |
|---|---|---|---|
| P2 | 输入框边框用 `--text 24%` 替代 `--border 70%` | ChatInput 样式 / theme 色板 | 边框颜色与补丁版一致 |
| P3 | ~~去光晕~~ **不移植（上游本无光晕，光晕是补丁时代自注入后移除的）** | 无 | 无需动作 |
| P6 | 弹窗/面板背景不透明 | globals.css `t-dropdown` 类 | 弹窗背后内容不可透见 |
| P8 | DSH 主题层（DSH 字体栈+neutral-bluish 色板+正文/标题排版）+ P8b button 13px | globals.css 文末定制层 | dev CSS 已验证 |
| P8c+P20 | 字号五档制（12→13、11→12、10/9/9.5/10.5/12.5 归并，类与内联同步） | 全 TSX 扫掠（33 文件） | 11×18/12×54/13×96/14×6/15×2 |
| P15 | ✅ 会话行 40px + 21px 圆点槽 + now/Nm/Nh/Nd + tabular-nums + 运行绿点轮询（modified 变化启发式） | SessionSidebar（分组+轮询）+ SessionTree | E2E：rowH 40px/时间 1m/24 行 |
| P19 | ~~no-cache 响应头~~ **不移植（D-008）** | 无需改 | fork 每次构建换哈希文件名，immutable 反而最优 |
| P20 | 字号五档制 11/12/13/14/15（含散档归并 21 处） | 全局 token + 组件内联清理 | 全 UI 无 9/9.5/10/10.5/12.5 散档 |

## B 批：组件逻辑类（✅ 2026-09-20 全部移植完成，tag `port-logic`）

> P3-2 分组组头（按 cwd 分组/文件夹图标折叠/点击选项目）随 P15 一并移植；P3 运行点光晕上游本无、无需移植；P19 不移植（D-008）。

| # | 行为 | 源码落点（实际） | 验收 |
|---|---|---|---|
| P1 | ✅ 会话轮次完成后只保留最后一个文本块（流式期间全显） | MessageView（块级末 text/消息级无 text 隐藏）+ MessageList（列表级中间叙述隐藏，!agentRunning 门控） | E2E：thinkingUI=0、assistant 块收拢 |
| P5/P13 | ✅ 错误条渲染（P5 字体部分已在 A 批 DSH 层完成） | MessageView assistant 分支：errorMessage 红条 | 结构就绪，等真实失败触发 |
| P7 | ✅ 输入区图标组 18px（附件/更多/思考 14/发送×2/停止/喇叭×2/模型/模式/预设） | ChatInput + ModelSelector/AgentMode/PresetSelector | E2E：7×18px 图标 |
| P10/P10b | ✅ 思考面板默认展开 | AgentThinkingOrb expanded useState(true) | 代码级验收 |
| P11 | ✅ 模型配置保存前过滤空 id 模型 | ModelsConfig handleSave（Record 结构适配） | tsc+结构 |
| P12 | ✅ 模型按钮显示当前模型名（maxWidth 180 省略） | ModelSelector 触发钮 | E2E：按钮显示 GLM-5.3… |
| P14 | ✅ deepseek 目录仅留 V4.1 Flash（UI 层过滤，不动 core 包） | app/api/models/route.ts | 下拉仅 deepseek-flash |
| P16 | ✅ 侧栏顶部四钮（新建目录 folder-plus + ▾ 历史下拉 + 新会话 + 刷新，右对齐 marginTop 24） | SidebarHeader | E2E：四钮齐、下拉 7 行 |
| P17 | ✅ 新会话目录行+▾弹窗（会话目录∪__piDirs cap50/默认目录/其他目录…） | ChatInput（行+弹窗）→ ChatWindow → AppShell.handleNewSession 链路 | E2E：打勾/切换/回切/持久化全通 |
| P18 | ✅ 资源管理器默认收起（不持久化） | SessionSidebar explorerOpen useState(false) | E2E：无文件树 |
| P21 | ✅ 硬编码英文中文化 21 处 + P15 圆点「运行中」2 处 | FileExplorer/ChatWindow/models-config×5/McpConfigModal | tsc+文本替换断言 |

## C 批：切换与收尾
- [ ] 全量打包 DMG（macOS，adhoc 签名）
- [ ] 覆盖安装到 /Applications（appId 不变，数据无缝）
- [ ] 稳定运行 7 天 → 旧补丁体系退役（launchd watcher 卸载、`~/.pi-ui-patches` 归档）
- [ ] 旧仓库 README 顶部加「已迁移至 fork」横幅

## 里程碑 tag 计划
`baseline-v0.8.8`（克隆即打）→ `port-css`（A 批完）→ `port-logic`（B 批完）→ `switch-v1`（C 批完）
