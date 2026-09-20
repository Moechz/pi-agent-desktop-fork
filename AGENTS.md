# Agent Instructions — pi-agent-desktop-fork

## 1. 项目是什么
个人定制的 **Pi Agent Desktop** 源码 fork（上游 [Chasen-Liao/pi-agent-desktop](https://github.com/Chasen-Liao/pi-agent-desktop)，MIT）。
从 **v0.8.8 tag** 分叉，目标：把此前以「编译产物补丁」方式维护的 21 项 UI 定制（P1–P21，详见 `REQUIREMENTS.md`）
移植为**源码级修改**，此后自建自装，不再依赖上游封装的桌面 UI。
目标平台：macOS（Windows 见 D-005，暂不做）。唯一用户：仓库所有者本人。

## 2. 新会话阅读顺序
```
AGENTS.md → HANDOFF.md → REQUIREMENTS.md → docs/TASK_STATE.md
        → docs/DESIGN_DECISIONS.md → docs/MIGRATION-patches-to-source.md → docs/CHANGELOG.md
```

## 3. 架构摘要
- Next.js 16（App Router，standalone 输出）+ React + TypeScript + Tailwind；Electron 壳打包（electron-builder）。
- **Agent 核心是独立 npm 依赖**：`@earendil-works/{pi-agent-core,pi-ai,pi-client,pi-coding-agent,pi-protocol,pi-telemetry,pi-tui}`，当前锁 0.84.3。升核心≠合并上游 UI。
- 渲染进程加载内嵌 Next 服务器（dev 端口 30141）。
- 历史定制原为对编译 chunk 的补丁（旧仓库 `~/Documents/projects/pi-agent-UI-change-memo`，P1–P21 编号沿用）。

## 4. 目录布局与禁止触碰路径
- `app/` 页面与 API 路由；`components/` UI 组件（移植主战场）；`hooks/`、`lib/` 逻辑；`electron/` 主进程；`scripts/` 构建辅助。
- **禁止触碰**：`node_modules/`、`.next/`（构建产物）、`electron/dist/`、`~/.pi/`（agent 运行时数据）、
  `~/Library/Application Support/@chasen-liao/pi-agent-desktop/`（正式应用用户数据）、任何凭据文件。

## 5. 开发约定
- TypeScript，注释与文档用中文；不重命名上游导出符号（降低将来 cherry-pick 冲突面）。
- 每移植一个 P 编号 = 一个 commit，消息格式 `P-XX: 简述（源码落点文件）`。
- 用户可见行为变更必须同步更新 `docs/CHANGELOG.md` 与 `docs/TASK_STATE.md`（同一提交）。
- 网络访问需代理：`export https_proxy=http://127.0.0.1:7890 http_proxy=http://127.0.0.1:7890`。
- ⚠ **会话环境陷阱（在 Pi Agent Desktop 内跑命令时必读）**：
  1. `NODE_ENV=production` 会被继承 → `npm ci` 静默只装 16 个包。任何 npm 命令前先 `export NODE_ENV=development`。
  2. `__NEXT_PRIVATE_STANDALONE_CONFIG` / `__NEXT_PRIVATE_ORIGIN` / `TURBOPACK` 会被继承 →
     `next dev/build` 优先读宿主应用的编译期配置（含 CI 机器绝对路径 `/Users/runner/...`），
     启动即扇 `failed to canonicalize path` 。任何 next 命令前先
     `unset __NEXT_PRIVATE_STANDALONE_CONFIG __NEXT_PRIVATE_ORIGIN TURBOPACK NEXT_DEPLOYMENT_ID`。
  （两者均 2026-09-20 实踩；dev/npm 一句话版：先 `unset __NEXT_PRIVATE_STANDALONE_CONFIG __NEXT_PRIVATE_ORIGIN TURBOPACK NEXT_DEPLOYMENT_ID && export NODE_ENV=development`）
  3. **`next build` 例外：必须不带 NODE_ENV=development**（2026-09-20 实踩：
     prerender `/_global-error` 扇 `useContext null` 直接挂）。打包链用
     `env -u NODE_ENV -u __NEXT_PRIVATE_* … npm run dist:mac`；且 electron-builder
     下载 universal 二进制需代理（否则 `read ETIMEDOUT`），加 `https_proxy=http://127.0.0.1:7890`。

## 6. 如何跑测试
```bash
npm ci                # 首次安装（需代理）
npx tsc --noEmit      # 类型检查
npm test              # 仓库自带 node --test 套件
```

## 7. 如何构建/打包
```bash
npm run dev           # 开发模式（Next dev :30141，与已装正式应用共存，移植期一律先在此验证）
npm run build         # standalone 构建（链尾自动跑 smoke-standalone-server）
npx electron-builder --mac   # 出 DMG（详见 electron-builder.yml；appId 保持 com.agegr.pi-agent-desktop）
```

## 8. Git 规则
- 工作分支 `custom/main`（当前）；`main` 跟随上游不直接提交；`upstream` remote 指上游仓库。
- 里程碑打 tag：`baseline-v0.8.8`、`port-css`、`port-logic`、`switch-v1` …
- 不 push 到 upstream；自有远端建立后 push `custom/main` 与 tags。

## 9. 硬性技术约束
- 移植完成前**不得升级** `@earendil-works/*` 依赖版本（D-003）。
- 不得改动 appId/productName（D-004，切换日数据无缝）。
- 端口 30141 为 dev 固定端口，勿占用。
- 每次打包的 DMG 归档到 `~/Documents/projects/pi-agent-UI-change-memo/backup/installer/`（沿用旧习惯，回滚用）。

## 10. 已定决策要点索引
见 `docs/DESIGN_DECISIONS.md`：D-001 分叉点 / D-002 不换栈 / D-003 升级模式 B / D-004 保 appId /
D-005 暂不做 Windows / D-006 旧补丁体系保留至切换日 / D-007 移植顺序。

## 11. 版本同步清单
一次用户可见改动需同时更新：`package.json` version → `docs/CHANGELOG.md` → 设置页显示版本（如涉及）→ `docs/TASK_STATE.md`。
