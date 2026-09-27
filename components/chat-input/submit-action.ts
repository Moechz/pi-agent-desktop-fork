export type ComposerSubmitAction = "send" | "steer" | "followup" | "slash" | "none";

/**
 * 输入法组合期判定在 `lib/ime.ts`（纯函数 + 单测），React 封装见 `hooks/use-ime-guard.ts`。
 * 这里再导出一次，方便聊天输入相关代码就近取用。
 */
export { IME_COMMIT_GUARD_MS, isImeComposing } from "../../lib/ime.ts";

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
