/** Windows 窗口按钮（最小化/最大化/关闭）覆盖层高度：与页面顶栏等高，视觉上并入顶栏 */
export const TITLE_BAR_OVERLAY_HEIGHT = 36;

/**
 * Windows 原生窗口按钮覆盖层（Window Controls Overlay）配色 —— 跟随主题，
 * 与 `--material-toolbar`（亮 `rgba(250,251,253,.78)` / 暗 `rgba(12,15,20,.8)`）尽量贴合
 * （覆盖层只能是纯色，做不到半透明 blur）。
 */
export function titleBarOverlayOptions(isDark: boolean): {
  color: string;
  symbolColor: string;
  height: number;
} {
  return {
    color: isDark ? "#0c1118" : "#ffffff",
    symbolColor: isDark ? "#d9deea" : "#364152",
    height: TITLE_BAR_OVERLAY_HEIGHT,
  };
}

/**
 * 创建窗口时的 title bar 相关选项。
 *
 * - **macOS**：`titleBarStyle: "hidden"`，红绿灯直接悬浮在内容之上（P22，不需 overlay）；
 * - **Windows**：同样 `hidden`，但 Windows 没有红绿灯 —— 必须开 `titleBarOverlay`，
 *   否则窗口既没有原生标题栏、也没有自绘按钮 → **最小化/最大化/关闭全缺失**
 *   （2026-09-29 用户反馈）。页面顶栏已用 `.w-titlebar { width: env(titlebar-area-width) }`
 *   预留了那块宽度，开启后按钮就落在内容右上角。
 * - **Linux**：标题栏由窗口管理器提供，保持 `hidden` 语义即可（不额外开 overlay）。
 */
export function titleBarWindowOptions(
  platform: string,
  isDark: boolean,
): { titleBarStyle: "hidden"; titleBarOverlay?: { color: string; symbolColor: string; height: number } } {
  const base = { titleBarStyle: "hidden" as const };
  if (platform !== "win32") return base;
  return { ...base, titleBarOverlay: titleBarOverlayOptions(isDark) };
}

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
      color: titleBarOverlayOptions(isDark).color,
      symbolColor: titleBarOverlayOptions(isDark).symbolColor,
    });
    return true;
  } catch {
    // 窗口未启用 titleBarOverlay（P22 之后是常态，尤其 Windows）—— 记下后静默跳过。
    overlayUnsupported.add(target);
    return false;
  }
}
