import assert from "node:assert/strict";
import test from "node:test";
import { IME_COMMIT_GUARD_MS, isImeComposing } from "./ime.ts";

const ime = (over: Partial<Parameters<typeof isImeComposing>[0]> = {}) => ({
  composing: false,
  nativeIsComposing: false,
  keyCode: 13,
  lastCompositionEndAt: 0,
  now: 1000,
  ...over,
});

test("Enter is ignored while the IME is composing (React composition state)", () => {
  assert.equal(isImeComposing(ime({ composing: true })), true);
});

test("Enter is ignored when the browser reports isComposing", () => {
  assert.equal(isImeComposing(ime({ nativeIsComposing: true })), true);
});

test("Enter is ignored on the legacy 229 key code", () => {
  assert.equal(isImeComposing(ime({ keyCode: 229 })), true);
});

test("Safari order (compositionend then keydown) still ignores that Enter", () => {
  // Safari 先 compositionend 再 keydown：此时 composing/isComposing 都已为 false，
  // 只剩「刚结束组合」的宽限期能拦住它 —— 这就是真机上消息被误发的那一次回车。
  assert.equal(isImeComposing(ime({ lastCompositionEndAt: 995, now: 1000 })), true);
});

test("the guard window boundary is exact", () => {
  assert.equal(isImeComposing(ime({ lastCompositionEndAt: 1000 - IME_COMMIT_GUARD_MS + 1, now: 1000 })), true);
  assert.equal(isImeComposing(ime({ lastCompositionEndAt: 1000 - IME_COMMIT_GUARD_MS, now: 1000 })), false);
});

test("Enter works normally right after the guard window", () => {
  assert.equal(isImeComposing(ime({ lastCompositionEndAt: 900, now: 1000 })), false);
});

test("Enter works normally when no composition ever happened", () => {
  assert.equal(isImeComposing(ime()), false);
});
