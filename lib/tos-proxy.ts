/**
 * TOS 文件管理 API 的服务端代理。
 *
 * 为什么需要代理（而不是浏览器直接调 TOS API）：
 *   1. TOS 的会话 Cookie（TMSESSNAME）很可能是 **HttpOnly**，前端 JS 读不到 → 无法判断
 *      "是否已登录"，也无法取出 CSRF 令牌（X-Csrf-Token 也以 Cookie 形式下发）；
 *   2. 服务端转发时可以直接把浏览器的 Cookie 原样带上，并把 X-Csrf-Token 从 Cookie
 *      里取出回填到请求头 —— 不依赖任何 JS 可读性；
 *   3. 同源调用，避开 CORS / CSRF 的各种边界情况。
 *
 * 安全：
 *   - 目标固定为 TOS 本机 web 端口（默认 http://127.0.0.1:8181，可用 TOS_API_BASE 覆盖），
 *     路径固定为 /fileManage/*，用户提供的 path 只作为 query 参数（encodeURIComponent 后
 *     append），不存在 SSRF 面；
 *   - 权限完全沿用 TOS 自身模型：代理只是"带着当前用户 Cookie 再问一次 TOS"，
 *     不会获得任何用户本身没有的权限。
 */

export const TOS_API_PATH_PREFIX = "/fileManage";

export function tosApiBase(env: Record<string, string | undefined> = process.env): string {
  const configured = env.TOS_API_BASE?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return "http://127.0.0.1:8181";
}

/** 从 Cookie 串里取 CSRF 令牌（TOS 把它也放在 Cookie 里下发） */
export function csrfTokenFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    if (key === "x-csrf-token") {
      const value = part.slice(eq + 1).trim();
      if (value) return decodeURIComponent(value);
    }
  }
  return null;
}

/** 构造转发请求头：Cookie 原样透传；CSRF 令牌优先取入站头，其次从 Cookie 取 */
export function buildForwardHeaders(
  inbound: Headers,
  method: string,
): Record<string, string> {
  const headers: Record<string, string> = {};
  const cookie = inbound.get("cookie");
  if (cookie) headers.cookie = cookie;
  const csrf = inbound.get("x-csrf-token") ?? csrfTokenFromCookie(cookie);
  if (csrf) headers["X-Csrf-Token"] = csrf;
  if (method !== "GET" && method !== "HEAD") {
    headers["Content-Type"] = inbound.get("content-type") ?? "application/json";
  }
  return headers;
}

export interface TosProxyResult {
  status: number;
  body: string;
}

/** 把一次请求转发到 TOS 文件管理 API */
export async function forwardToTosApi(options: {
  action: string;
  method: "GET" | "POST";
  /** query 参数（已解码值；内部会做 URL 编码） */
  query?: Record<string, string | undefined>;
  /** POST body（JSON 字符串） */
  body?: string;
  inboundHeaders: Headers;
  fetchImpl?: typeof fetch;
  base?: string;
}): Promise<TosProxyResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.base ?? tosApiBase();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") params.set(key, value);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const url = `${base}${TOS_API_PATH_PREFIX}${options.action}${suffix}`;

  try {
    const response = await fetchImpl(url, {
      method: options.method,
      headers: buildForwardHeaders(options.inboundHeaders, options.method),
      body: options.body,
      cache: "no-store",
    });
    const body = await response.text();
    return { status: response.status, body };
  } catch (error) {
    return {
      status: 502,
      body: JSON.stringify({
        error: `TOS API unreachable: ${error instanceof Error ? error.message : String(error)}`,
      }),
    };
  }
}
