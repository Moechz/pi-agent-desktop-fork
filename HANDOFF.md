# Project handoff

交接日期：2026-09-20 ｜ 当前版本：0.8.8-fork.0（零修改基线）｜ 分支：`custom/main`（自 v0.8.8）｜ 与远端：origin=upstream 未 push（自有远端待建）

## 1. 必读顺序
`AGENTS.md → REQUIREMENTS.md → docs/TASK_STATE.md → docs/DESIGN_DECISIONS.md → docs/MIGRATION-patches-to-source.md`

## 2. 仓库布局说明
上游原结构未动；本项目新增：`AGENTS.md`、`HANDOFF.md`、`REQUIREMENTS.md`、`docs/`（五文档）。

## 3. 当前状态速览
- 代码零修改；文档骨架已提交。
- 依赖未安装、基线未构建（**接手第一件事**：见 TASK_STATE §7 恢复顺序）。
- 正式机上有补丁版官方应用在跑（对照基准 + 回滚兜底），移植期间不得卸载。

## 4. 最重要的开放问题
见 `docs/TASK_STATE.md` §5（Node 版本待定 / P14 落点待查）。

## 5. 发布闸门
Phase 1 切换闸门：A+B 批验收全过 + DMG 构建成功 + 覆盖安装 + 7 天稳定（详见 TASK_STATE §6）。

## 6. 交接清理检查
- 无临时进程/文件；无进行中的半成品提交（工作区干净）。
- 凭据：本仓库不持有任何凭据；GitHub 凭据位置见 `~/Documents/projects/GITHUB-TOKEN.md`（不入库）。

## 7. 构建与测试快速上手
```bash
export https_proxy=http://127.0.0.1:7890 http_proxy=http://127.0.0.1:7890
npm ci && npx tsc --noEmit && npm test
npm run dev   # :30141，与正式应用共存
```

## 8. 版本同步清单
见 `AGENTS.md` §11。
