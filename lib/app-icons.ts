/**
 * 应用图标（文件名里带内容哈希）。
 *
 * 真机两条教训叠加后的做法：
 *  ① Safari 不认带查询串的图标（`icon.png?icon.<hash>.png`），会回退去取**站点根**
 *     `/favicon.ico` —— 那个地址属于平台（TOS）而非本应用（实测 404）→ 显示通用图标；
 *  ② 去掉查询串又会被浏览器按“站点”长期缓存（连重启浏览器都不刷新）。
 * 于是把内容哈希写进**文件名**：URL 干净（Safari 认），内容一变文件名就变（缓存自然失效）。
 *
 * ⚠️ 本模块**不得**引入 node:fs / node:crypto：Next 的动态文件系统访问会把整个项目
 * 纳入 tracing，导致构建产物异常（CI 实测）。文件名与内容的绑定关系改由
 * lib/app-icons.test.ts 在测试期校验 —— 改了图标却没改名，测试直接失败。
 */

export const ICON_FILES = {
  /** 主图标（512 PNG） */
  icon: "pi-agent-icon-4f515d78.png",
  /** 多尺寸 .ico：Safari 对它能稳定识别，故在 <link> 中排在最前 */
  favicon: "pi-agent-favicon-b6c856be.ico",
  /** iOS/书签用 */
  apple: "pi-agent-touch-icon-294692c0.png",
} as const;

export type IconKind = keyof typeof ICON_FILES;

/** 站内图标 URL（带站点前缀，无查询串） */
export function iconUrl(kind: IconKind, basePath = ""): string {
  return `${basePath.replace(/\/+$/, "")}/${ICON_FILES[kind]}`;
}
