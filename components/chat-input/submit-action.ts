export type ComposerSubmitAction = "send" | "steer" | "followup" | "slash" | "none";

/**
 * 输入法（IME）组合期判定。
 *
 * 为什么不能只看 `event.nativeEvent.isComposing`：
 * - **Safari**：按回车确认候选词时，浏览器**先派发 `compositionend`，再派发 `keydown`**，
 *   所以 keydown 里 `isComposing` 已经是 false → 回车被误当成“发送”。
 *   （真机反馈：在 Pi Agent for TOS 里用中文输入法打字，想把拼音原样落盘，回车却把消息发走了）
 * - **部分 Windows 输入法**：确认候选词的回车会带 `keyCode === 229`（“已被输入法消化”），
 *   而 `isComposing` 不一定为 true。
 *
 * 因此用四重判定，任一命中即视为“正在输入法组合中，回车不得提交”：
 * ① React 组合状态（compositionStart 之后、compositionEnd 之前）
 * ② 浏览器给的 `isComposing`
 * ③ 传统信号 `keyCode === 229`
 * ④ **刚结束组合的宽限期**：compositionend 之后 IME_COMMIT_GUARD_MS 毫秒内的回车忽略
 *    （覆盖 Safari 的“先 end 后 keydown”顺序；宽限极短，不会影响“确认后立刻再敲回车发送”）
 */
export const IME_COMMIT_GUARD_MS = 60;

export interface ImeComposingInput {
  /** React 组合状态（compositionStart…compositionEnd 之间） */
  composing: boolean;
  /** event.nativeEvent.isComposing */
  nativeIsComposing: boolean;
  /** event.keyCode（兼容键；229 = 被输入法消化） */
  keyCode?: number;
  /** 最近一次 compositionend 的时间戳（performance.now()），无则 0 */
  lastCompositionEndAt: number;
  /** 当前时间戳（performance.now()） */
  now: number;
}

export function isImeComposing({
  composing,
  nativeIsComposing,
  keyCode,
  lastCompositionEndAt,
  now,
}: ImeComposingInput): boolean {
  if (composing || nativeIsComposing) return true;
  if (keyCode === 229) return true;
  return lastCompositionEndAt > 0 && now - lastCompositionEndAt < IME_COMMIT_GUARD_MS;
}

interface ComposerSubmitContext {
  altKey: boolean;
  shiftKey: boolean;
  /** 是否处于输入法组合期（用 isImeComposing() 计算，别直接用 nativeEvent.isComposing） */
  isComposing: boolean;
  isStreaming: boolean;
  slashMenuOpen: boolean;
  canSteer: boolean;
  canFollowUp: boolean;
}

export function resolveComposerSubmitAction({
  altKey,
  shiftKey,
  isComposing,
  isStreaming,
  slashMenuOpen,
  canSteer,
  canFollowUp,
}: ComposerSubmitContext): ComposerSubmitAction {
  if (shiftKey || isComposing) return "none";
  if (isStreaming && altKey && canFollowUp) return "followup";
  if (slashMenuOpen) return "slash";
  if (isStreaming && canSteer) return "steer";
  if (isStreaming && canFollowUp) return "followup";
  return "send";
}
