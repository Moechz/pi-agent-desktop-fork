# 需求文档：P1–P21 补丁 → 源码移植清单

> 每条的权威行为描述在旧仓库 `~/Documents/projects/pi-agent-UI-change-memo/PATCHES.md`（含截图式细节与踩坑记录）。
> 本文是源码移植的作战地图：**行为 → 源码落点（初步定位，移植时核实）→ 验收标准**。
> 落点标注 ❓ 的需先定位再动手。

## 移植总原则
1. 语义等价优先：先做到「与补丁版行为一致」，再谈源码层面的更优雅写法。
2. 每条移植完成即在开发模式（`npm run dev`）人工验收，全部完成后打包 DMG 再过一遍。
3. 验收时以**补丁版正式应用**为对照基准（它还在机器上跑着）。

## A 批：CSS / 配置类（先做，半天量级）

| # | 行为 | 源码落点（初步） | 验收 |
|---|---|---|---|
| P2 | 输入框边框用 `--text 24%` 替代 `--border 70%` | ChatInput 样式 / theme 色板 | 边框颜色与补丁版一致 |
| P3 | 运行状态点：实体圆点无光晕 | ❓（orb/状态点组件 CSS） | 无 boxShadow 光晕 |
| P6 | 弹窗/面板背景不透明 | globals.css `t-dropdown` 类 | 弹窗背后内容不可透见 |
| P8 | 字号阶梯 12→13、11→12（原 P8/P8b/P8c） | 全局字号 token / 组件内联 | 与补丁版字号一致 |
| P15 | 会话行高 40px + 相对时间 + tabular-nums | 会话列表组件样式 | 行高 40，时间右对齐等宽数字 |
| P19 | `/_next/static/*` 响应头 no-cache（替代 immutable） | `next.config.ts` 的 `headers()` | curl -I 显示 `Cache-Control: no-cache` |
| P20 | 字号五档制 11/12/13/14/15（含散档归并 21 处） | 全局 token + 组件内联清理 | 全 UI 无 9/9.5/10/10.5/12.5 散档 |

## B 批：组件逻辑类（核心，逐条移植 + 验收）

| # | 行为 | 源码落点（初步） | 验收 |
|---|---|---|---|
| P1 | 会话轮次完成后只保留最后一个文本块（流式期间全显） | ChatWindow / MessageList 渲染逻辑 | 与补丁版一致：完成后旧块隐藏 |
| P5/P13 | 消息隐藏规则 + 错误条渲染 | 同上 | 错误以红条显示 |
| P7 | 输入区图标组（附件/发送/停止/喇叭）18px 1.8 描边 | ChatInput 图标 | 图标样式一致 |
| P10/P10b | 思考面板默认展开（流式实时可见） | thinking 组件 useState 默认值 | 思考过程实时展示 |
| P11 | 模型配置保存前过滤空 id 模型 | 设置页保存逻辑 | 空 id 模型不落盘 |
| P12 | 模型按钮显示当前模型名 | ModelSelector / ChatInput | 按钮文本=当前模型 |
| P14 | deepseek 目录仅留 V4.1 Flash | ❓（provider 目录来源，可能在 core 侧——若在 core 则改为 UI 层过滤） | deepseek 列表仅 1 项 |
| P16 | 侧栏顶部四钮：新会话/新目录/▾目录弹窗/刷新（统一样式右对齐） | AppShell 侧栏区 | 四钮排布与补丁版一致 |
| P17 | 新会话顶部目录名 + ▾ 弹窗（会话目录∪自选目录，localStorage `__piDirs`） | ChatInput / AppShell cwd 链路 | 弹窗全量目录、切换生效、记录持久 |
| P18 | 资源管理器默认收起（不持久化） | 侧栏 explorer useState 默认值 | 重启默认收起 |
| P21 | 硬编码英文中文化 22 处（OAuth 句/加载态/占位符/兼容 label 等） | 各组件字面量 | 全 UI 无 stray 英文（专名除外） |

## C 批：切换与收尾
- [ ] 全量打包 DMG（macOS，adhoc 签名）
- [ ] 覆盖安装到 /Applications（appId 不变，数据无缝）
- [ ] 稳定运行 7 天 → 旧补丁体系退役（launchd watcher 卸载、`~/.pi-ui-patches` 归档）
- [ ] 旧仓库 README 顶部加「已迁移至 fork」横幅

## 里程碑 tag 计划
`baseline-v0.8.8`（克隆即打）→ `port-css`（A 批完）→ `port-logic`（B 批完）→ `switch-v1`（C 批完）
