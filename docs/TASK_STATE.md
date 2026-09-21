# Task state

快照日期：2026-09-20 ｜ 当前版本：v0.8.8（上游 tag，未做任何源码修改）｜ 分支：`custom/main`


## ✅ 里程碑（2026-09-21 16:30）：正式版切换完成

- `official-v1`（b93ec66）= 验收终版，已安装于 `/Applications`，用户宣布转正
- 验收期共 41 项改动全部落地：P1–P21 移植 + 深度审计 7 修 + 逐条验收微调
- 补丁系统同日退役：launchd `com.user.pi-ui-patch` 卸载，`~/.pi-ui-patches` 归档至旧仓 `backup/patches-retired/`
- 后续唯一定制入口 = 本仓库；更新流程 = 改码 → commit → 干净重建 → Cmd+Q 换装
## 🚀 发布（2026-09-21）：v0.8.8-2

- 版本号 `package.json` = `0.8.8-2`；推 tag `v0.8.8-2` → `.github/workflows/desktop-packages.yml` 打包三平台
- 发布说明 `docs/releases/v0.8.8-2.md`；仓库已转 public
- 更新源指向本仓库；后续发版 = 改码 → commit → 推 tag（CI 全自动打包）


## 1. 仓库状态
- 全量克隆自 upstream，`custom/main` 自 v0.8.8 分叉；remotes：origin=upstream（自有远端待建）。
- 文档骨架已提交；**代码零修改**。

## 2. 完成情况
- [x] 立项决策与六文档骨架
- [x] 关键前提验证：源码公开(MIT) / 核心依赖在公共 npm(0.84.3 锁定版可装，最新 0.86.0) / electron-builder 双平台目标现成
- [x] `npm ci` 依赖安装：1319 包 / 1.3G（⚠ 必须 `NODE_ENV=development`，否则只装 16 个）
- [x] `npx tsc --noEmit` 零错误（基线健康）
- [x] 基线运行：`npx next dev -p 30199` HTTP 200（30141 被正式应用占用；须先 unset 宿主注入的 __NEXT_PRIVATE_* 环境变量）
- [~] A 批 CSS/配置移植：已完成 P6（globals.css 四变量）、P2（ChatInput.tsx:562）、P19（决策不移植，D-008）；剩 P3/P8/P15/P20
- [ ] B 批组件逻辑移植（P1/P5/P13/P7/P10/P11/P12/P14/P16/P17/P18/P21）
- [ ] C 批打包切换

## 3. 最近一次验证
2026-09-20：`NODE_ENV=development npm ci` → added 1319 packages；`npx tsc --noEmit` 零错误。
2026-09-20：dev 服务器跑通（HTTP 200）；P6/P2 已移植并经 dev CSS 输出验证（--material-popover: var(--bg) 等）。⚠ dev 的 Turbopack 文件缓存偶发不热更 CSS：改样式没生效就 rm -rf .next 重启。

## 4. 测试环境状态
macOS（Apple Silicon）；Node v24.21.0（仓库无版本声明，暂用系统版，tsc 已通过）；
⚠ 本仓所有 npm 命令必须在 `NODE_ENV=development` 下跑（宿主应用环境传下来的是 production，会静默跳过 devDependencies）；
正式应用 v0.8.8（补丁版）仍在 /Applications 正常运行，作为对照基准与回滚兜底。

## 5. 开放问题
| 现象 → 已知 | 下一步 |
|---|---|
| ~~仓库无 Node 版本声明~~ 已用系统 Node v24，tsc 通过 | 跑 build 时若遇引擎问题再锁版本 |
| Electron 二进制下载需代理 | 安装/构建前 `export https_proxy=http://127.0.0.1:7890 http_proxy=http://127.0.0.1:7890`（AGENTS.md §5） |
| npm 装不全（16 包）/ next dev 崩（canonicalize /Users/runner） | **均已解**：宿主注入 NODE_ENV=production 与 __NEXT_PRIVATE_STANDALONE_CONFIG 等；一次性 unset+export 公式见 AGENTS.md §5 |
| P14 deepseek 目录过滤落点未知（可能在 core 包） | 移植 P14 时先查数据来源；若在 core 侧，改为 UI 层过滤并在 DESIGN_DECISIONS 记录 |

## 6. 发布闸门
Phase 1（切换）闸门 = A+B 批全过验收 + DMG 构建成功 + 覆盖安装后 7 天稳定。

## 7. 建议的恢复顺序
1. `cd ~/Documents/projects/pi-agent-desktop-fork && export NODE_ENV=development https_proxy=http://127.0.0.1:7890 http_proxy=http://127.0.0.1:7890`
2. `npm run dev` 验证基线可跑（:30141；Electron 壳另查 package.json scripts）
3. 按 REQUIREMENTS.md A 批顺序移植，每条一 commit
4. 移植遇行为不明 → 对照旧仓库 PATCHES.md 或直接看已装补丁版应用

## 8. 常用命令
见 `AGENTS.md` §6/§7（测试/构建/开发命令均可复制执行）。

## 2026-09-20 快照（B 批完成）

- **A 批（CSS/排版）✅ tag `port-css`**：P8/P8b/P8b2/P6/P2/P8c+P20/P15(样式) 全部入源码
- **B 批（组件逻辑）✅ tag `port-logic`**：
  - 侧栏集群：P3-2 分组组头 + P15 紧凑行/运行点 + P16 四钮 + P17 编写器目录弹窗 + P18 默认收起
  - 消息集群：P1 三层只留结果 + P13 错误红条
  - 输入/设置：P7 图标 18px + P10b 思考面板默认展开 + P11 保存过滤 + P12 模型名 + P14 deepseek 过滤（/api/models）
  - i18n：P21 21 处中文硬编码
- **验证**：tsc 零错误；dev 30199 浏览器 E2E（DOM 断言）——分组/折叠/切换链路/弹窗/40px 行/紧凑时间/18px 图标/模型名/P1 收拢全通过
- **下一步**：C 批——`npm run build` + electron-builder DMG → 归档 → 切换 → 7 天稳定期
