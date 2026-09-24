/**
 * 聊天右侧「会话刻度」的纯布局计算（与 DOM 无关，便于单测）。
 *
 * 设计（真机反馈后重做）：
 *  - **固定节距**：每根刻度占固定像素高度（TICK_PITCH），不再把间距拉伸到铺满容器。
 *    条目越多 → 刻度越多、刻度架越长，而刻度疏密永远不变（旧版“均匀分配”会让
 *    会话越多越密，读起来很难受）。
 *  - **放得下就居中**：整条刻度架在轨道里垂直居中，而不是从顶到底铺满。
 *  - **放不下就跟随**：让“当前阅读位置”始终停在轨道中心（像代码缩略图那样滑动），
 *    两端用钳制保证不会滑出空白。
 *  - **只渲染可见刻度**：条目上千时 DOM 仍然只有几十个节点。
 */

/** 固定节距（像素）：任意会话条数下刻度间距一致 */
export const TICK_PITCH = 9;

export interface RackLayout {
  /** 刻度总数（= 可显示条目数，一一对应，不再采样） */
  count: number;
  /** 固定节距 */
  pitch: number;
  /** 刻度架总高度 = count * pitch */
  totalHeight: number;
  /** 刻度架顶部相对轨道顶部的位移（px，可为负 = 向上滑出） */
  offset: number;
  /** 可见刻度区间（闭区间，渲染用） */
  firstVisible: number;
  lastVisible: number;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export interface RackInput {
  /** 可显示条目数 */
  entryCount: number;
  /** 轨道高度（px） */
  railHeight: number;
  /** 当前阅读位置：视口中心在整篇中的比例（0-1）；轨道放得下时忽略 */
  activeRatio?: number;
  pitch?: number;
}

export function buildRackLayout(input: RackInput): RackLayout {
  const count = Math.max(0, Math.floor(finite(input.entryCount, 0)));
  const pitch = Math.max(1, finite(input.pitch, TICK_PITCH));
  const railHeight = Math.max(0, Math.floor(finite(input.railHeight, 0)));
  const totalHeight = count * pitch;

  if (count === 0 || railHeight === 0) {
    return { count, pitch, totalHeight, offset: 0, firstVisible: 0, lastVisible: -1 };
  }

  let offset: number;
  if (totalHeight <= railHeight) {
    // 放得下：整条刻度架垂直居中（关键区别于旧版“拉伸铺满”）
    offset = Math.round((railHeight - totalHeight) / 2);
  } else {
    // 放不下：让当前阅读位置落在轨道中心，两端钳制避免滑出空白
    const activeRatio = clamp(finite(input.activeRatio, 0.5), 0, 1);
    const activeIndex = activeRatio * (count - 1);
    offset = Math.round(railHeight / 2 - (activeIndex + 0.5) * pitch);
    offset = clamp(offset, railHeight - totalHeight, 0);
  }

  return {
    count,
    pitch,
    totalHeight,
    offset,
    firstVisible: clamp(Math.floor(-offset / pitch), 0, count - 1),
    lastVisible: clamp(Math.ceil((railHeight - offset) / pitch), 0, count - 1),
  };
}

/** 刻度中心的纵向像素位置（相对轨道顶部） */
export function tickTopPx(index: number, layout: RackLayout): number {
  return layout.offset + index * layout.pitch;
}

/** 鼠标纵向像素位置 → 刻度序号（越界钳制；无刻度或非法输入返回 null） */
export function tickIndexAtY(y: number, layout: RackLayout): number | null {
  if (layout.count === 0 || !Number.isFinite(y)) return null;
  return clamp(Math.floor((y - layout.offset) / layout.pitch), 0, layout.count - 1);
}

/** 刻度序号 → 消息条目序号（现在一一对应，保留函数以隔离调用方与几何细节） */
export function entryIndexForTick(tick: number, layout: RackLayout): number {
  if (layout.count === 0) return 0;
  return clamp(Math.floor(tick), 0, layout.count - 1);
}

/** 刻度序号 → 对应的阅读位置比例（用于点击/拖动跳转） */
export function ratioForTick(tick: number, layout: RackLayout): number {
  if (layout.count <= 1) return 0;
  return entryIndexForTick(tick, layout) / (layout.count - 1);
}
