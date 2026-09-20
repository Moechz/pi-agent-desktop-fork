# Task state

快照日期：2026-09-20 ｜ 当前版本：v0.8.8（上游 tag，未做任何源码修改）｜ 分支：`custom/main`

## 1. 仓库状态
- 全量克隆自 upstream，`custom/main` 自 v0.8.8 分叉；remotes：origin=upstream（自有远端待建）。
- 文档骨架已提交；**代码零修改**。

## 2. 完成情况
- [x] 立项决策与六文档骨架（本提交）
- [x] 关键前提验证：源码公开(MIT) / 核心依赖在公共 npm(0.84.3 锁定版可装，最新 0.86.0) / electron-builder 双平台目标现成
- [ ] `npm ci` 依赖安装（**进行中/未开始**，见恢复顺序第 1 步）
- [ ] 基线构建：`npm run build` + dev 模式启动无修改跑通
- [ ] A 批 CSS/配置移植（P2/P3/P6/P8/P15/P19/P20）
- [ ] B 批组件逻辑移植（P1/P5/P13/P7/P10/P11/P12/P14/P16/P17/P18/P21）
- [ ] C 批打包切换

## 3. 最近一次验证
2026-09-20：`git ls-remote`/克隆/分支成功；`npm view @earendil-works/pi-ai` 返回 0.86.0（公共源可达，走代理）。
基线构建尚未执行。

## 4. 测试环境状态
macOS（Apple Silicon）；Node/Electron 构建链版本**待确认**（仓库无 engines/.nvmrc，以系统 node 试跑）；
正式应用 v0.8.8（补丁版）仍在 /Applications 正常运行，作为对照基准与回滚兜底。

## 5. 开放问题
| 现象 → 已知 | 下一步 |
|---|---|
| 仓库无 Node 版本声明 | npm ci 时若报引擎错，按报错装对应 Node（nvm），并回写本表 |
| Electron 二进制下载需代理 | 安装/构建前 `export https_proxy=http://127.0.0.1:7890 http_proxy=...`（已写入 AGENTS.md §5） |
| P14 deepseek 目录过滤落点未知（可能在 core 包） | 移植 P14 时先查数据来源；若在 core 侧，改为 UI 层过滤并在 DESIGN_DECISIONS 记录 |

## 6. 发布闸门
Phase 1（切换）闸门 = A+B 批全过验收 + DMG 构建成功 + 覆盖安装后 7 天稳定。

## 7. 建议的恢复顺序
1. `cd ~/Documents/projects/pi-agent-desktop-fork && npm ci`（代理开）
2. `npm run dev` 验证基线可跑 → 打 tag `baseline-v0.8.8`（若未打）
3. 按 REQUIREMENTS.md A 批顺序移植，每条一 commit
4. 移植遇行为不明 → 对照旧仓库 PATCHES.md 或直接看已装补丁版应用

## 8. 常用命令
见 `AGENTS.md` §6/§7（测试/构建/开发命令均可复制执行）。
