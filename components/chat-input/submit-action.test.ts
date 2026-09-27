import assert from "node:assert/strict";
import test from "node:test";
import { isImeComposing, resolveComposerSubmitAction } from "./submit-action.ts";

test("Enter steers the running agent", () => {
  assert.equal(resolveComposerSubmitAction({
    altKey: false,
    shiftKey: false,
    isComposing: false,
    isStreaming: true,
    slashMenuOpen: false,
    canSteer: true,
    canFollowUp: true,
  }), "steer");
});

test("Alt+Enter queues a follow-up while the agent is running", () => {
  assert.equal(resolveComposerSubmitAction({
    altKey: true,
    shiftKey: false,
    isComposing: false,
    isStreaming: true,
    slashMenuOpen: true,
    canSteer: true,
    canFollowUp: true,
  }), "followup");
});

test("Shift+Enter keeps the newline behavior", () => {
  assert.equal(resolveComposerSubmitAction({
    altKey: false,
    shiftKey: true,
    isComposing: false,
    isStreaming: true,
    slashMenuOpen: false,
    canSteer: true,
    canFollowUp: true,
  }), "none");
});

test("Enter selects a slash item when the slash menu is open", () => {
  assert.equal(resolveComposerSubmitAction({
    altKey: false,
    shiftKey: false,
    isComposing: false,
    isStreaming: true,
    slashMenuOpen: true,
    canSteer: true,
    canFollowUp: true,
  }), "slash");
});

test("Enter falls back to follow-up when steering is unavailable", () => {
  assert.equal(resolveComposerSubmitAction({
    altKey: false,
    shiftKey: false,
    isComposing: false,
    isStreaming: true,
    slashMenuOpen: false,
    canSteer: false,
    canFollowUp: true,
  }), "followup");
});

// ---- 输入法组合期（真机反馈：中文输入法下回车把消息发走了）----
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
  // 只剩“刚结束组合”的宽限期能拦住它 —— 这就是真机上消息被误发的那一次回车。
  assert.equal(isImeComposing(ime({ lastCompositionEndAt: 995, now: 1000 })), true);
});

test("Enter works normally right after the guard window", () => {
  assert.equal(isImeComposing(ime({ lastCompositionEndAt: 900, now: 1000 })), false);
});

test("Enter works normally when no composition ever happened", () => {
  assert.equal(isImeComposing(ime()), false);
});
