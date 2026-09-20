# Design decisions

## 分叉与架构
### D-001: 从上游 v0.8.8 tag 分叉
**Decision:** `custom/main` 分支自 v0.8.8 tag（与当前机器上运行的补丁版二进制同源）。
**Consequences:**
- 移植期可逐项与运行中的补丁版对照验收，行为等价性有基准。
- v0.8.5–0.8.7 及更早的历史差异无需关心。

### D-002: 保留上游技术栈（Next.js + React + TS + Tailwind + Electron），不重写
**Decision:** 一切定制在现有 TypeScript/TSX 源码内修改，不引入新框架、不做架构重构。
**Consequences:**
- 上游 150 个组件直接可用；将来 cherry-pick 上游新特性冲突面最小。
- 排除了「换 Svelte/Vue/原生」等方案——与低成本维护目标冲突。

### D-003: 升级策略 = 模式 B（冻结 UI 层，只升核心）
**Decision:** UI 代码停在 fork 点；升级 agent 能力 = 提升 `@earendil-works/*` npm 依赖版本并 rebuild（当前锁 0.84.3，上游最新 0.86.0）；上游 UI 新特性按需选择性 cherry-pick。
**Consequences:**
- 升级近乎零源码冲突；tsc 在编译期暴露核心 API 破坏。
- 排除了「每版 merge 上游 UI」（冲突频繁、1–3h/次）。
- 遗留：若上游 UI 出现依赖新核心的特性，需手工评估是否 cherry-pick。

### D-004: 保留 appId（com.agegr.pi-agent-desktop）与 productName
**Decision:** 自建包不改应用标识，切换日覆盖安装。
**Consequences:**
- 用户数据（设置/会话引用）无缝延续。
- 自建版与上游官方版**不能同机共存**——移植期验证一律走 `npm run dev`，不装包。

## 平台与发布
### D-005: Phase 1 仅构建 macOS 包
**Decision:** electron-builder 只出 mac 目标；Windows（nsis）/Linux（deb）配置保留不构建。
**Consequences:**
- 需要时用 GitHub Actions windows runner 出 Windows 包，无需实机。
- 自动更新暂不启用（手动装 DMG）；将来可把 electron-updater 指向自有 GitHub Releases。

## 移植与回滚
### D-006: 旧补丁体系保留至切换日
**Decision:** `/Applications` 的补丁版应用、`~/.pi-ui-patches` 备份/看护、旧仓库 memo 全部保留，直到 `switch-v1` 稳定 7 天后才退役。
**Consequences:**
- 全程有整应用级回滚（revert.sh 仍可用）；对照基准一直在。
- 退役动作（卸 launchd watcher、归档 .pi-ui-patches）写入 REQUIREMENTS C 批清单。

### D-007: 移植顺序 = CSS/配置批 → 组件逻辑批 → 打包切换
**Decision:** 先 P2/P3/P6/P8/P15/P19/P20（低风险快见效），再逐条移植逻辑类，每条一 commit。
**Consequences:**
- 任意时刻失败可 `git revert` 单条；里程碑 tag 提供粗粒度回滚点。

### D-008: P19（服务器 no-cache）不移植——补丁期问题在 fork 架构下自然消失
**Decision:** 不在 next.config.ts 加 headers() 覆写；保留上游对静态资源的 immutable 缓存策略。
**Consequences:**
- 补丁期需要 no-cache 是因为「改内容不改文件名」；fork 每次 `next build` 生成新内容哈希文件名，缓存 busting 天然生效， immutable 反而是最优策略（每次发版零回源开销）。
- 若将来又出现「改了没生效」，检查的是构建/安装链路而非缓存头。
