/**
 * 聊天右侧「会话刻度」的纯布局计算（与 DOM 无关，便于单测）。
 *
 * 设计：每条消息占一个**等高槽位**，刻度线画在槽中心。
 *  - 均匀分布：不再按真实 DOM 高度比例（那样会疏密不均、刻度重叠）
 *  - 命中唯一：每个槽位只对应一根刻度 → 鼠标位置可精确映射到一个条目，
 *    悬停提示只需要显示这一条（不再全部渲染后互相避让）
 *  - 条目过多时按 step 采样，保证刻度仍可辨认（每根刻度代表该组最后一条，信息最新）
 */

export interface TickLayout {
  /** 刻度总数（= 槽位数） */
  count: number;
  /** 采样步长：条目多时每隔 step 条画一根（>= 1） */
  step: number;
  /** 每个槽位占的高度百分比（0-100） */
  slotPct: number;
}

export function buildTickLayout(total: number, maxTicks = 120): TickLayout {
  const n = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  if (n === 0) return { count: 0, step: 1, slotPct: 100 };
  const step = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(maxTicks))));
  const count = Math.ceil(n / step);
  return { count, step, slotPct: 100 / count };
}

/** 刻度线中心的纵向百分比位置（槽位中心 → 均匀分布） */
export function tickTopPct(index: number, layout: TickLayout): number {
  return (index + 0.5) * layout.slotPct;
}

/** 鼠标纵向比例（0-1）→ 刻度序号；越界钳制；无刻度时返回 null */
export function tickIndexAt(ratio: number, layout: TickLayout): number | null {
  if (layout.count === 0 || !Number.isFinite(ratio)) return null;
  const index = Math.floor(ratio * layout.count);
  return Math.max(0, Math.min(layout.count - 1, index));
}

/** 刻度序号 → 对应的消息条目序号（采样时取该组最后一条） */
export function entryIndexFor(tickIndex: number, layout: TickLayout, total: number): number {
  if (total <= 0) return 0;
  const clampedTick = Math.max(0, Math.min(layout.count - 1, tickIndex));
  const last = (clampedTick + 1) * layout.step - 1;
  return Math.max(0, Math.min(total - 1, last));
}
