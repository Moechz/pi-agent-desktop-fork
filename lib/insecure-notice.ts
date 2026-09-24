/**
 * 非安全上下文（明文 HTTP）提示。
 *
 * TOS 默认部署是 `http://<NAS>:8181/<appid>/` —— 明文 HTTP **不是安全上下文**，
 * 于是一整类浏览器能力直接不存在：WebGPU（思考球）、剪贴板、crypto.randomUUID、
 * Notification…… 用户看到的是"同一套代码，TOS 上不少地方不一样"，却不知道原因。
 *
 * 这里只做纯逻辑：判断要不要提示、以及算出可用的 HTTPS 地址（TOS 平台同时开
 * 443/5443，443 会自动跳到 5443；真机实测 `https://<NAS>:5443/<appid>/` 返回 200）。
 */

/** TOS 平台 HTTPS 端口：443 会 301 到它（真机实测） */
export const DEFAULT_TOS_HTTPS_PORT = "5443";

/** 用户关闭提示后写入的标记：只在非安全上下文里有意义，故用专门 key */
export const INSECURE_NOTICE_DISMISS_KEY = "pi-insecure-notice-dismissed";

export interface LocationLike {
  protocol: string;
  hostname: string;
  port: string;
  pathname: string;
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

/**
 * 由当前地址推出同站点可用的 HTTPS 地址。
 *
 * 返回 null 的情况（都不该提示"改用 HTTPS"）：
 * - 已经是 HTTPS
 * - 回环地址（本身就算安全上下文，无需切换）
 * - 拿不到 hostname
 */
export function buildHttpsUrl(
  location: LocationLike,
  httpsPort: string = DEFAULT_TOS_HTTPS_PORT,
): string | null {
  if (location.protocol === "https:") return null;
  const hostname = location.hostname;
  if (!hostname || isLoopbackHost(hostname)) return null;
  const port = httpsPort ? `:${httpsPort}` : "";
  const path = location.pathname && location.pathname !== "" ? location.pathname : "/";
  return `https://${hostname}${port}${path}`;
}

export interface InsecureNoticeInput {
  /** window.isSecureContext */
  secureContext: boolean;
  /** `<html>` 上的 data-runtime 值 */
  runtimeTag: string;
  /** 用户此前是否关闭过该提示 */
  dismissed: boolean;
}

/** 是否展示"当前为明文 HTTP，效果已降级"提示 */
export function shouldShowInsecureNotice(input: InsecureNoticeInput): boolean {
  if (input.secureContext) return false;
  // 桌面版是 localhost（安全上下文），正常不会走到这里；多一道保险，避免误扰桌面用户
  if (input.runtimeTag === "electron") return false;
  return !input.dismissed;
}
