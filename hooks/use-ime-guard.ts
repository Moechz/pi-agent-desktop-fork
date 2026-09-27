"use client";

import { useCallback, useRef, type KeyboardEvent } from "react";
import { isImeComposing } from "../lib/ime.ts";

type ImeAwareElement = HTMLInputElement | HTMLTextAreaElement;

interface CompositionHandlers {
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
}

/**
 * 回车/提交键的输入法保护。
 *
 * 用法：
 * ```tsx
 * const { isImeKey, compositionHandlers } = useImeGuard();
 * <input
 *   {...compositionHandlers}
 *   onKeyDown={(e) => { if (e.key === "Enter" && !isImeKey(e)) submit(); }}
 * />
 * ```
 * 判定细节见 `lib/ime.ts`（Safari 会先 compositionend 再 keydown，只靠
 * nativeEvent.isComposing 会把确认候选词的那次回车当成提交）。
 */
export function useImeGuard(): {
  isImeKey: (event: KeyboardEvent<ImeAwareElement>) => boolean;
  compositionHandlers: CompositionHandlers;
} {
  const composingRef = useRef(false);
  const compositionEndedAtRef = useRef(0);

  const compositionHandlers: CompositionHandlers = {
    onCompositionStart: () => {
      composingRef.current = true;
    },
    onCompositionEnd: () => {
      composingRef.current = false;
      compositionEndedAtRef.current = performance.now();
    },
  };

  const isImeKey = useCallback(
    (event: KeyboardEvent<ImeAwareElement>) =>
      isImeComposing({
        composing: composingRef.current,
        nativeIsComposing: event.nativeEvent.isComposing,
        keyCode: event.keyCode,
        lastCompositionEndAt: compositionEndedAtRef.current,
        now: performance.now(),
      }),
    [],
  );

  return { isImeKey, compositionHandlers };
}
