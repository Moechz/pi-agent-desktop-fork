export interface TitleBarOverlayTarget {
  setTitleBarOverlay?: (options: {
    color: string;
    symbolColor: string;
  }) => void;
}

/** 对已确认不支持 overlay 的窗口做标记（按窗口对象记忆，避免重复抛异常刷日志）。 */
const overlayUnsupported = new WeakSet<object>();

/**
 * Updates window controls where the Electron runtime exposes title-bar overlays.
 * The API is unavailable on macOS and may be absent in some Electron builds.
 *
 * P22 起本项目窗口不再启用 `titleBarOverlay`（原生遮盖条已移除，红绿灯直接悬浮于内容之上），
 * 但 set-theme IPC 仍会调用本函数：Windows 上 `setTitleBarOverlay` 函数存在、窗口却未启用
 * overlay → 调用抛 `TypeError: Titlebar overlay is not enabled`，冒泡为主进程未捕获异常弹窗。
 * 因此这里捕住并降级（调用方无需要处理）。
 */
export function applyTitleBarOverlayTheme(
  target: TitleBarOverlayTarget | null,
  isDark: boolean,
): boolean {
  if (typeof target?.setTitleBarOverlay !== "function") {
    return false;
  }
  if (overlayUnsupported.has(target)) {
    return false;
  }

  try {
    target.setTitleBarOverlay({
      color: isDark ? "#0c1118" : "#ffffff",
      symbolColor: isDark ? "#d9deea" : "#364152",
    });
    return true;
  } catch {
    // 窗口未启用 titleBarOverlay（P22 之后是常态，尤其 Windows）—— 记下后静默跳过。
    overlayUnsupported.add(target);
    return false;
  }
}
