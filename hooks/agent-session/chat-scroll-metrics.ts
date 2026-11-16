/**
 * 会话视图的滚动判定（纯函数，便于单测）。
 *
 * 背景（用户反馈 2026-10-01）：打开历史会话时视图停在**较早**的位置，要往下滚好几屏
 * 才看得到最新内容。根因不在判定阈值，而在"贴底"的时机 —— 见 use-chat-scroll.ts。
 */

/** 距底部小于该像素数即视为"在底部"（与滚动容器的 padding 无关，纯容差）。 */
export const BOTTOM_THRESHOLD_PX = 80;

export interface ScrollMetrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

/** 是否已贴近底部（可跟随新内容）。 */
export function isNearBottom(
  metrics: ScrollMetrics,
  threshold: number = BOTTOM_THRESHOLD_PX,
): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight < threshold;
}

/** 贴底时应设置的 scrollTop（内容不足一屏时钳到 0，避免负值）。 */
export function bottomScrollTop(metrics: Pick<ScrollMetrics, "scrollHeight" | "clientHeight">): number {
  return Math.max(0, metrics.scrollHeight - metrics.clientHeight);
}
