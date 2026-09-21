# Changelog


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
