import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { BOTTOM_THRESHOLD_PX, bottomScrollTop, isNearBottom } from "./chat-scroll-metrics.ts";

const scrollSource = readFileSync(new URL("./use-chat-scroll.ts", import.meta.url), "utf8");

test("isNearBottom：容差内的距离算“在底部”", () => {
  // 正好贴底
  assert.equal(isNearBottom({ scrollHeight: 2000, scrollTop: 1400, clientHeight: 600 }), true);
  // 差一点点（1px）仍算贴底
  assert.equal(isNearBottom({ scrollHeight: 2000, scrollTop: 1399, clientHeight: 600 }), true);
  // 容差边界：恰好 80px 不算
  assert.equal(isNearBottom({ scrollHeight: 2000, scrollTop: 1320, clientHeight: 600 }), false);
  // 差一整屏
  assert.equal(isNearBottom({ scrollHeight: 5000, scrollTop: 0, clientHeight: 600 }), false);
});

test("isNearBottom：内容不足一屏时恒为贴底", () => {
  assert.equal(isNearBottom({ scrollHeight: 300, scrollTop: 0, clientHeight: 600 }), true);
});

test("isNearBottom：阈值可覆盖（自定义容差）", () => {
  const metrics = { scrollHeight: 2000, scrollTop: 1300, clientHeight: 600 }; // 距底 100
  assert.equal(isNearBottom(metrics, 150), true);
  assert.equal(isNearBottom(metrics, 50), false);
  assert.equal(BOTTOM_THRESHOLD_PX, 80);
});

test("bottomScrollTop：贴底位置不为负", () => {
  assert.equal(bottomScrollTop({ scrollHeight: 2000, clientHeight: 600 }), 1400);
  assert.equal(bottomScrollTop({ scrollHeight: 300, clientHeight: 600 }), 0);
});

test("打开会话必须靠内容高度观察贴底，不能再用固定延时猜时机", () => {
  // 根因（用户反馈 2026-10-01）：长会话的消息是异步、分批渲染的，原先 [0, 120, 400]ms
  // 三个定时器在长会话上必然猜不中 → 视图停在中途，得往下滚好几屏才看到最新内容。
  assert.ok(
    scrollSource.includes("new ResizeObserver"),
    "必须用 ResizeObserver 跟随内容高度变化（固定延时在长会话上必然失效）",
  );
  assert.ok(
    scrollSource.includes("pinToBottomRef"),
    "需要“钉底”状态：会话打开后持续贴底，直到用户主动往上滚",
  );
  assert.ok(
    !/\[\s*0\s*,\s*120\s*,\s*400\s*\]/.test(scrollSource),
    "不要退回固定延时数组的写法",
  );
  assert.ok(
    scrollSource.includes("container.scrollTop = container.scrollHeight"),
    "一次性定位应直接写 scrollTop（scrollIntoView 会顺带滚动祖先且可被打断）",
  );
});
