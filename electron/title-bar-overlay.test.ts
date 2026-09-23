import assert from "node:assert/strict";
import test from "node:test";
import { applyTitleBarOverlayTheme } from "./title-bar-overlay.ts";

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
