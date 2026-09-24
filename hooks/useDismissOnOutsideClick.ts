import { useEffect, useRef, type RefObject } from "react";

export type DismissReason = "outside" | "escape";

type ElementRef = RefObject<HTMLElement | null>;

/**
 * 点击外部 / 按 Esc 时关闭浮层。
 *
 * 支持传入**多个**“内部元素”引用：浮层用 portal 渲染到 `document.body` 时，
 * 触发它的按钮容器与浮层本身分处两棵子树，只看其中一个会把浮层内部点击误判为外部点击。
 */
export function useDismissOnOutsideClick(
  ref: ElementRef | ReadonlyArray<ElementRef>,
  open: boolean,
  onClose: (reason: DismissReason) => void,
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const refsRef = useRef<ReadonlyArray<ElementRef>>(Array.isArray(ref) ? ref : [ref]);
  refsRef.current = Array.isArray(ref) ? ref : [ref];

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const inside = refsRef.current.some((item) => item.current?.contains(target));
      if (!inside) {
        onCloseRef.current("outside");
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current("escape");
    };

    document.addEventListener("pointerdown", handlePointerDown);
    // Capture so a nested picker/menu consumes Escape before a parent dialog
    // that still listens on bubble (backdrop click / input onKeyDown).
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);
}
