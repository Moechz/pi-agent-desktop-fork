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

test("系统提示词面板：打开时按需拉一次（includeState / peekState，无副作用）", () => {
  // 背景：提示词是运行期产物、不落盘；原先只在「每轮跑完」或「打开时恰好在跑」才有内容 →
  // 空闲会话点开常空白（用户反馈）。补充：用 ?includeState 拉一次（peekState 不重置空闲回收计时）。
  assert.ok(src.includes("fetchSession(sid, true)"), "打开面板应触发一次 ?includeState 拉取");
  assert.ok(src.includes('activeTopPanel !== "system"'), "该拉取应限定在「系统提示词」面板");
});

test("系统提示词面板：冷会话提供显式「载入」按钮（有副作用，必须由用户点击触发）", () => {
  assert.ok(src.includes('t("shell.systemPromptLoad")'), "需要「载入」按钮（新 i18n 键，21 语已同步）");
  assert.ok(src.includes('{ type: "get_state" }'), "载入 = 显式唤醒 agent（get_state），而不是打开面板时偷偷启动");
  assert.ok(src.includes("loadSystemPrompt"), "应有独立的 loadSystemPrompt 回调");
});
