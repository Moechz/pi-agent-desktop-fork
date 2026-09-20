# 迁移记录：编译产物补丁 → 源码 fork

状态：**进行中**（2026-09-20 立项）

## 决策（迁移目标与完成判据）
目标：把 21 项编译产物补丁（旧仓库 `~/Documents/projects/pi-agent-UI-change-memo`，P1–P21）
全部移植为源码修改，自建 DMG 替代官方包日常使用。
**完成判据**：REQUIREMENTS.md A+B 批全过验收 + `switch-v1` tag + 覆盖安装后稳定 7 天 + 旧补丁体系退役。

## 当前状态
- [x] fork 仓库建立（v0.8.8，custom/main）
- [ ] 基线构建跑通
- [ ] A 批 / B 批 / C 批（见 REQUIREMENTS.md）

## 新旧实现边界
- **旧实现（补丁）**：官方 0.8.8 编译产物 + apply_patches.py 语义锚点注入；运行于 /Applications。
  移植期间继续作为日常驱动与对照基准，**冻结新增补丁**（新定制一律进 fork）。
- **新实现（fork 源码）**：本仓库；验证走 `npm run dev`；打包版在 C 批才覆盖安装。
- 行为冲突时以旧仓库 `PATCHES.md` 的描述为权威语义。

## 构建与验证
命令见 `AGENTS.md` §6/§7。验收基准=并存的补丁版正式应用。

## 迁移顺序
见 `REQUIREMENTS.md`（A→B→C 批）与 D-007。

## 回滚方案
commit 级（git revert）→ 里程碑级（tag）→ 应用级（官方 0.8.8 DMG + revert.sh + ~/.pi-ui-patches 备份，保留至切换日）。

## 收尾动作（老实现删除位置）
1. `launchctl unload ~/Library/LaunchAgents/com.user.pi-ui-patch.plist` 并删除该 plist（看护退役）。
2. `~/.pi-ui-patches/` 整目录 tar 归档至旧仓库 `backup/` 后删除。
3. 旧仓库 README 顶部加「已迁移至 fork」横幅；`/Applications` 若仍想保留官方包则恢复原版 chunk（revert.sh）。
