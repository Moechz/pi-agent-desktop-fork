import assert from "node:assert/strict";
import test from "node:test";
import {
  TITLE_BAR_OVERLAY_HEIGHT,
  applyTitleBarOverlayTheme,
  titleBarOverlayOptions,
  titleBarWindowOptions,
} from "./title-bar-overlay.ts";

test("applyTitleBarOverlayTheme ignores runtimes without overlay support", () => {
  assert.equal(applyTitleBarOverlayTheme(null, true), false);
  assert.equal(applyTitleBarOverlayTheme({}, false), false);
});

test("applyTitleBarOverlayTheme applies dark and light window colors", () => {
  const calls: Array<{ color: string; symbolColor: string }> = [];
  const target = {
    setTitleBarOverlay(options: { color: string; symbolColor: string }) {
      calls.push(options);
    },
  };

  assert.equal(applyTitleBarOverlayTheme(target, true), true);
  assert.equal(applyTitleBarOverlayTheme(target, false), true);
  assert.deepEqual(calls, [
    { color: "#0c1118", symbolColor: "#d9deea" },
    { color: "#ffffff", symbolColor: "#364152" },
  ]);
});

test("applyTitleBarOverlayTheme 吞掉 Windows 的 'overlay not enabled' 异常（P22 回归修复）", () => {
  let calls = 0;
  const target = {
    setTitleBarOverlay: () => {
      calls += 1;
      throw new TypeError("Titlebar overlay is not enabled");
    },
  };
  // 首次调用抛异常 → 返回 false 且不外抛
  assert.equal(applyTitleBarOverlayTheme(target, true), false);
  // 同一窗口第二次直接跳过（WeakSet 记忆），不再触发异常
  assert.equal(applyTitleBarOverlayTheme(target, false), false);
  assert.equal(calls, 1);
});

test("titleBarWindowOptions：仅 Windows 启用原生窗口按钮（WCO），macOS/Linux 不启用", () => {
  const win = titleBarWindowOptions("win32", true);
  assert.equal(win.titleBarStyle, "hidden");
  assert.ok(win.titleBarOverlay, "Windows 必须有 titleBarOverlay，否则最小化/最大化/关闭全缺失");
  assert.equal(win.titleBarOverlay.height, TITLE_BAR_OVERLAY_HEIGHT);

  for (const platform of ["darwin", "linux"]) {
    const opts = titleBarWindowOptions(platform, true);
    assert.equal(opts.titleBarStyle, "hidden");
    assert.equal(opts.titleBarOverlay, undefined, `${platform} 不应启用 overlay（红绿灯/WM 自行处理）`);
  }
});

test("titleBarOverlayOptions：配色跟随主题，高度与工具栏一致（36px）", () => {
  const dark = titleBarOverlayOptions(true);
  const light = titleBarOverlayOptions(false);
  assert.deepEqual(dark, { color: "#0c1118", symbolColor: "#d9deea", height: 36 });
  assert.deepEqual(light, { color: "#ffffff", symbolColor: "#364152", height: 36 });
  assert.equal(TITLE_BAR_OVERLAY_HEIGHT, 36);
});
