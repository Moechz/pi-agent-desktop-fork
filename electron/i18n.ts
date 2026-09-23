/**
 * 主进程侧文案（托盘菜单 / 原生对话框）。
 *
 * 渲染进程通过 `set-locale` IPC 同步当前界面语言（见 components/I18nProvider.tsx）；
 * 首帧尚未来得及同步时用系统语言（app.getLocale()）兜底。
 *
 * 注意：electron/tsconfig.json 的 rootDir 限定为 electron/，此处不能直接复用
 * lib/i18n 的字典，故主进程维护一份最小键集（键名与 lib/i18n 保持一致，便于对照）。
 */
export type MainLocale = "en" | "zh-CN";

const STRINGS = {
  "tray.showWindow": { en: "Show window", "zh-CN": "显示窗口" },
  "tray.quit": { en: "Quit", "zh-CN": "退出" },
  "update.availableTitle": { en: "Update Available", "zh-CN": "有可用更新" },
  "update.availableMessage": {
    en: "A new version ({version}) is available.",
    "zh-CN": "新版本（{version}）已可用。",
  },
  "update.availableDetail": {
    en: "Download and install now? The app will restart after the download completes.",
    "zh-CN": "现在下载并安装？下载完成后应用会重启。",
  },
  "update.download": { en: "Download", "zh-CN": "下载" },
  "update.later": { en: "Later", "zh-CN": "稍后" },
  "update.downloadedTitle": { en: "Update Downloaded", "zh-CN": "更新已下载" },
  "update.downloadedMessage": {
    en: "Version {version} has been downloaded. Restart to install the update.",
    "zh-CN": "版本 {version} 已下载，重启即可安装更新。",
  },
  "update.restartNow": { en: "Restart Now", "zh-CN": "立即重启" },
} as const;

export type MainStringKey = keyof typeof STRINGS;

export function normalizeMainLocale(value: string | null | undefined): MainLocale {
  return typeof value === "string" && value.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function mainT(
  key: MainStringKey,
  locale: MainLocale,
  values?: Record<string, string | number>,
): string {
  const template = STRINGS[key][locale] ?? STRINGS[key].en;
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}
