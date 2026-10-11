import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./AppShell.tsx", import.meta.url), "utf8");

/** 取「顶层面板」那段 JSX（系统提示词 / 分支面板） */
function topPanelBlock(): string {
  const start = src.indexOf("Top panel dropdown");
  assert.ok(start > 0, "找不到顶层面板注释锚点");
  return src.slice(start, start + 5000);
}

test("顶层面板必须 portal 到 body（否则被 backdrop-filter 祖先『包含』→ 弹窗透明、与会话内容交织）", () => {
  const block = topPanelBlock();
  // 根因（2026-10-01 用户反馈）：面板原先渲染在工具条子树里，而 .material-toolbar 有
  // backdrop-filter: blur(22px) —— 按规范它会成为 fixed 后代的包含块，把面板压在工具条
  // 那个 36px 的层叠/裁剪上下文里。修法与工作台菜单同因同治：portal 到 document.body。
  assert.ok(block.includes("createPortal("), "顶层面板必须 portal");
  assert.ok(block.includes("document.body"), "portal 目标应为 document.body");
});

test("顶层面板底色必须显式内联（不依赖 material-popover 类；仓库多处同样兜底）", () => {
  const block = topPanelBlock();
  assert.ok(block.includes('background: "var(--bg)"'), "底色应显式内联，避免“看起来透明”");
  assert.ok(
    !/className="t-dropdown is-open material-popover/.test(block),
    "不要再回到只靠 material-popover 类的写法（本项目多处以显式背景兜底）",
  );
  assert.ok(block.includes("break-words"), "系统提示词长行需 break-words（此前横向溢出）");
});

test("顶层面板必须接统一关闭机制：点外部 / Esc 关闭 + 面板内关闭按钮", () => {
  assert.ok(
    /useDismissOnOutsideClick\(\[topPanelRef, topBarRef\], activeTopPanel !== null/.test(src),
    "顶层面板必须接 useDismissOnOutsideClick（点外部 / Esc）；topBarRef 也算内部，避免“按下就关、点击又开”",
  );
  assert.ok(src.includes("onClick={() => setActiveTopPanel(null)}"), "面板头部需有关闭按钮");
  assert.ok(src.includes('t("common.close")'), "关闭按钮复用已有 common.close 文案（19 语已具备）");
});
