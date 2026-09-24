/**
 * 应用对外名称（构建期决定）。
 *
 * 同一份代码有两种身份：
 *   - 桌面版（Electron）：Pi Agent Desktop（窗口标题、侧边栏品牌名）
 *   - TOS 应用商店版（子路径部署）：Pi Agent for TOS
 *     —— 必须与 `config.ini` / `<appid>.lang` / 落地页 / 隐私政策保持一致
 *
 * 背景（用户反馈）：TOS 版浏览器标签页与侧边栏仍显示桌面版的 "Pi Agent Desktop"，
 * 与应用中心里登记的名字不一致。名称随 basePath 这个**构建期常量**自动切换，
 * 避免两套部署形态各自硬编码。
 */

import { BASE_PATH } from "./base-path.ts";

export const DESKTOP_APP_NAME = "Pi Agent Desktop";
export const TOS_APP_NAME = "Pi Agent for TOS";

/** 按部署形态解析名称（纯函数，便于测试） */
export function resolveAppName(basePath: string): string {
  return basePath ? TOS_APP_NAME : DESKTOP_APP_NAME;
}

/** 当前构建的应用名称 */
export const APP_NAME = resolveAppName(BASE_PATH);
