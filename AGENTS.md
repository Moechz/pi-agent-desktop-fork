# Agent Instructions — pi-agent-desktop-fork


## 版本号规则（2026-09-21 确立）

- 格式：`0.8.8-N`（上游版本-本地序号），写在 `package.json` 的 `version`
- **每次功能性提交必须同步 +1**：0.8.8-1（= official-v1）→ 0.8.8-2 → …
- 纯文档/注释提交不占号；DMG 文件名自动带版本，便于归档比对
## 1. 项目是什么
个人定制的 **Pi Agent Desktop** 源码 fork（基于上游官方项目，MIT）。
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
- 历史定制原为对编译 chunk 的补丁（旧仓库 `~/Documents/projects/pi-agent-desktop-archive`，P1–P21 编号沿用）。

## 4. 目录布局与禁止触碰路径
- `app/` 页面与 API 路由；`components/` UI 组件（移植主战场）；`hooks/`、`lib/` 逻辑；`electron/` 主进程；`scripts/` 构建辅助。
- `tos/` **TOS 应用中心 deb 封装**（打包链 + 资产 + 商店提交，详见 `tos/README.md`）。
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

## 8b. 两处工作副本 + 两条版本线（★ 一个仓库、两份 clone；并行会话必读）

**只有一个仓库**：`Moechz/pi-agent-desktop-fork`（分支 `custom/main`）——
桌面端与 TOS 封装都在其中（TOS 相关在 `tos/` 子目录）。不是两个仓库。

但**同时存在两份 clone**，且可能各有会话在改（2026-09-28 实测撞过一次推送被拒）：

| 工作副本 | 路径 | 主要职责 | 远端可用性 |
|---|---|---|---|
| macOS 侧 | `~/Documents/projects/pi-agent-desktop-fork` | 桌面端（Electron/Next、`app/`、`components/`、`lib/`）、桌面发版 | SSH `git@github.com` 可用，**可 push** |
| NAS 侧 | `/Volume1/projects/pi-agent-desktop-fork`（Mac 上即 `/Volumes/projects/pi-agent-desktop-fork`，SMB） | TOS 封装与商店提交（`tos/`、`tos-v*`） | **无 GitHub 密钥**（`Permission denied (publickey)`），`origin` 已改为 **https**；需要 push 时去 macOS 侧 |

**两条版本线 = 同仓库里的两个字段，编号空间互不干扰**：

| 线 | 版本字段 | 格式 | tag（触发 CI） | 产物 |
|---|---|---|---|---|
| 桌面端 | `package.json` → `version` | `0.8.8-N` | `v0.8.8-N` | DMG / ZIP / EXE / deb（`desktop-packages.yml`） |
| TOS 包 | `tos/config.env` → `PKG_RELEASE`/`VERSION` | `0.8.8.9-M` | `tos-v0.8.8.9-M` | deb 双架构（`tos-packages.yml`）+ 商店 Agent API 提交 |

**同步规则（避免“推送被拒 / 版本撞号”）**：

1. **开工先拉**：`git pull --rebase origin custom/main`（NAS 侧直接 `git pull --rebase`，origin 已是 https）。
2. **收工即推**；被拒 = 另一处推过 → `git pull --rebase` 后再推（按上两个 commit 的既有做法）。
3. **永不 `--force`**：会抹掉另一处（可能是另一个会话）的提交。
4. **bump 版本号前必须已是最新**：两条线各自 +1，落笔前先 pull。
5. **分工**：
   - 桌面端改动（`app/`、`components/`、`electron/`、桌面 tag）→ **macOS 侧**；
   - TOS 封装 / 商店提交（`tos/`、`tos-v*`、真机构建）→ **NAS 侧**。
   - **公共代码**（`lib/`、`components/`、`public/` 等两边都用）**一次只由一侧改**，
     改完推送、另一侧 `pull --rebase` 后再动。（例：21 语 UI、输入法回车、缓存策略都在 macOS 侧改完，
     NAS 侧拉取后才构建 TOS 包。）
6. **避免两边同时改同一文件**：`package.json`、`tos/config.env`、`docs/CHANGELOG.md`、`tos/README.md`
   是最容易撞的四个。

## 8c. 多人协作约定（2026-10-01 起仓库有协作者）

- **外部改动一律走 PR → `custom/main`**，不要直接往 `custom/main` 推；合并前 **CI 必须全绿**
  （`ci.yml`：linux lint·typecheck·test / windows test / macOS test + next build）。
  ⚠️ `ci.yml` 的触发分支**必须包含 `custom/main`**（2026-10-01 前只写 `main`，导致这套 CI
  从未在开发分支上跑过，Windows 专属测试失败被漏了很久 —— 见 PR #1）。
- **版本线仍由维护者独占 bump**（协作者 PR 不应改）：
  桌面端 `package.json` 的 `0.8.8-N`（tag `v0.8.8-N`）／TOS `tos/config.env` 的 `0.8.8.9-M`（tag `tos-v0.8.8.9-M`）。
  若 PR 里带了版本号改动，合并时手动回退到维护者的值，避免两条线并行 +1 撞号。
- **发版入口唯一**：打 tag 与商店提交由维护者执行（CI 由 tag 触发）。
- **Windows 专属测试**：`npm run test:windows`（CI windows job 已自动跑）；
  在 Windows 上跑全量 `npm test` 亦可，但要注意本仓库无 `.gitattributes`，
  Git for Windows 默认 `core.autocrlf=true` → 检出是 CRLF（测试里读文件请归一化，见 PR #1 的做法）。
- 合并后两边工作副本（macOS / NAS）都要 `git pull --rebase`（见 §8b）。

## 9. 硬性技术约束
- 移植完成前**不得升级** `@earendil-works/*` 依赖版本（D-003）。
- 不得改动 appId/productName（D-004，切换日数据无缝）。
- 端口 30141 为 dev 固定端口，勿占用。
- 每次打包的 DMG 归档到 `~/Documents/projects/pi-agent-desktop-archive/backup/installer/`（沿用旧习惯，回滚用）。

## 10. 已定决策要点索引
见 `docs/DESIGN_DECISIONS.md`：D-001 分叉点 / D-002 不换栈 / D-003 升级模式 B / D-004 保 appId /
D-005 暂不做 Windows / D-006 旧补丁体系保留至切换日 / D-007 移植顺序。

## 11. 版本同步清单
一次用户可见改动需同时更新：`package.json` version → `docs/CHANGELOG.md` → 设置页显示版本（如涉及）→ `docs/TASK_STATE.md`。
