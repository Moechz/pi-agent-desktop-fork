import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const preloadSource = readFileSync(new URL("../electron/preload.ts", import.meta.url), "utf8");
// 注：原 components/session-sidebar/PiAgentTitle.tsx 已在 P 系迁移中并入 SidebarHeader.tsx，
// 标题改为 pi-title-light / pi-title-dark 双 span（按暗色模式切换）
const headerSource = readFileSync(
  new URL("../components/session-sidebar/SidebarHeader.tsx", import.meta.url),
  "utf8",
);
const appShellSource = readFileSync(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
const globalStyles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("macOS Electron title bar keeps sidebar controls clear of the traffic lights", () => {
  assert.match(preloadSource, /dataset\.electronPlatform\s*=\s*process\.platform/);
  assert.match(headerSource, /sidebar-title-row/);
  assert.match(headerSource, /flex items-center justify-end/); // P16：四钮行整行右对齐（原 ml-auto）
  assert.match(headerSource, /pi-title-light/);
  assert.match(headerSource, /pi-title-dark/);
  assert.match(globalStyles, /html\.dark\s+\.pi-title-light\s*\{\s*display:\s*none/);
});

test("sidebar title bar actions use the compact toolbar scale", () => {
  assert.match(headerSource, /sidebar-new-session-button[^`]*h-7[^`]*text-\[13px\]/s); // P20 字号五档：正文 13px
  assert.match(headerSource, /sidebar-refresh-button[^`]*h-7[^`]*w-7/s);
  assert.match(headerSource, /<svg width="11" height="11" viewBox="0 0 12 12"/);
  assert.equal(
    [...headerSource.matchAll(/<svg width="13" height="13" viewBox="0 0 24 24"/g)].length,
    2,
  );
});

test("collapsed macOS sidebar reserves the traffic-light area in the main toolbar", () => {
  assert.match(appShellSource, /macos-titlebar-leading-safe-area/);
  assert.match(appShellSource, /sidebarOpen\s*\?\s*""\s*:\s*" is-active"/);
  assert.match(
    globalStyles,
    /html\[data-electron-platform="darwin"\]\s+\.macos-titlebar-leading-safe-area\.is-active\s*\{[^}]*width:\s*80px/s,
  );
  assert.match(
    globalStyles,
    /\.macos-titlebar-leading-safe-area\s*\{[^}]*transition:\s*width var\(--duration-fast\) var\(--ease-smooth-out\)/s,
  );
});

/** 菜单自身的类列表（非贪婪匹配，避免把文件里后续元素的类（如 chevron 的 absolute）算进来） */
const menuClass = (() => {
  const match = /id="workbench-menu"[^]*?className="([^"]*)"/.exec(appShellSource);
  return match ? match[1] : "";
})();

test("workbench menu escapes the clipped chat column", () => {
  assert.match(appShellSource, /const \[shellMenuPosition, setShellMenuPosition\]/);
  assert.match(appShellSource, /shellMenuButtonRef\.current[^]*getBoundingClientRect\(\)/);
  assert.ok(menuClass.includes("fixed"), "菜单必须用 fixed 定位（参考系是视口）");
  assert.ok(menuClass.includes("z-[1000]"), "菜单层级必须高于内容面板");
  assert.ok(!menuClass.includes("absolute"), "菜单不能用 absolute（会被聊天列裁剪）");
  // 真机反馈补充：仅靠 fixed 不够 —— 祖先元素一旦成为“固定定位包含块”
  // （transform / filter / backdrop-filter，Safari 对此尤其敏感），坐标会被错误解释、
  // 层叠上下文也被限制在祖先内，弹窗就会跑到下层或跑到很下面。必须 portal 到 body。
  assert.match(appShellSource, /createPortal\(\s*<div\s+ref=\{shellMenuPanelRef\}/);
  assert.match(appShellSource, /<\/div>,\s*document\.body,\s*\)\}/);
  assert.match(appShellSource, /useDismissOnOutsideClick\(\[shellMenuRef, shellMenuPanelRef\]/);
});

test("language row cannot push the select outside the menu", () => {
  // 真机截图：中文切英文后 “Language” 变长，原生 select 固有宽度又大，两者叠加把选择框顶出弹窗。
  // 修法：① 弹窗宽度内容自适应（w-max + 上下限），英文变长时自然变宽而不是挤压控件；
  //      ② flex 子项加 min-w-0 以允许收缩；③ 面板 overflow-hidden 兜底。
  assert.match(appShellSource, /<label className="flex w-full min-w-0 items-center gap-2/);
  assert.match(
    appShellSource,
    /<span className="min-w-0 flex-1 truncate">\{t\("language\.label"\)\}<\/span>/,
  );
  assert.match(appShellSource, /<span className="relative flex min-w-0 max-w-\[58%\] shrink items-center">/);
  assert.ok(menuClass.includes("w-max"), "弹窗宽度应内容自适应");
  assert.ok(menuClass.includes("min-w-52"), "弹窗应有最小宽度");
  assert.ok(menuClass.includes("max-w-"), "弹窗应有最大宽度上限");
  assert.ok(menuClass.includes("overflow-hidden"), "面板需兜底，极端长文案不溢出弹窗");
});

test("language select uses a self-styled appearance", () => {
  // 原生 select 外观随引擎/平台差异极大（真机反馈“样式太老”）：显式接管外观，三端一致。
  assert.match(appShellSource, /appearance-none/);
  assert.match(appShellSource, /<path d="m6 9 6 6 6-6" \/>/);
});
