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

test("workbench menu escapes the clipped chat column", () => {
  assert.match(appShellSource, /const \[shellMenuPosition, setShellMenuPosition\]/);
  assert.match(appShellSource, /shellMenuButtonRef\.current[^]*getBoundingClientRect\(\)/);
  assert.match(
    appShellSource,
    /id="workbench-menu"[^]*className="[^"]*fixed z-\[1000\][^"]*"[^]*style=\{shellMenuPosition\}/,
  );
  assert.doesNotMatch(
    appShellSource,
    /id="workbench-menu"[^]*className="[^"]*absolute[^"]*"/,
  );
  // 真机反馈补充：仅靠 fixed 不够 —— 祖先元素一旦成为“固定定位包含块”
  // （transform / filter / backdrop-filter，Safari 对此尤其敏感），
  // 坐标会被错误解释、层叠上下文也被限制在祖先内，弹窗就会跑到下层/跑到很下面。
  // 必须 portal 到 body，彻底脱离祖先影响；同时关闭逻辑要认识浮层本体（shellMenuPanelRef）。
  assert.match(appShellSource, /createPortal\(\s*<div\s+ref=\{shellMenuPanelRef\}/);
  assert.match(appShellSource, /<\/div>,\s*document\.body,\s*\)\}/);
  assert.match(
    appShellSource,
    /useDismissOnOutsideClick\(\[shellMenuRef, shellMenuPanelRef\]/,
  );
});
