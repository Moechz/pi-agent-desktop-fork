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
 * 目标地址（2026-09-29 起自适应，见 `tosApiBaseCandidates`）：
 *   - 以前写死 `http://127.0.0.1:8181` → 用户一改 TOS 网页端口（如 8181 → 8282）
 *     目录选择就全失败（真机反馈："改端口后获取 TOS 目录失败"）；
 *   - 现在按优先级尝试：显式 `TOS_API_BASE` → 从入站请求的 Host/scheme 推导回环地址
 *     （浏览器就是从那个端口进来的，端口必然正确）→ 上次成功过的地址 → 8181 → 80；
 *     首个返回"像 TOS"的响应者胜出并缓存（10 分钟），全部失败则写日志 + 回 502。
 *
 * 安全：
 *   - 主机恒为回环（推导只取端口，不取入站 Host 里的主机名），路径固定为 /fileManage/*，
 *     用户提供的 path 只作为 query 参数（encodeURIComponent 后 append），不存在 SSRF 面；
 *   - 权限完全沿用 TOS 自身模型：代理只是"带着当前用户 Cookie 再问一次 TOS"，
 *     不会获得任何用户本身没有的权限。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { dirname, join } from "node:path";

export const TOS_API_PATH_PREFIX = "/fileManage";

/** 官方默认的 TOS 网页（回环）端口 */
export const TOS_DEFAULT_HTTP_PORT = 8181;

/** 成功地址的缓存时长（毫秒） */
const BASE_CACHE_TTL_MS = 10 * 60 * 1000;

/** 单次尝试的超时（毫秒）——候选有好几个，单个不能拖太久 */
const ATTEMPT_TIMEOUT_MS = 2500;

export function tosApiBase(env: Record<string, string | undefined> = process.env): string {
  const configured = env.TOS_API_BASE?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return `http://127.0.0.1:${TOS_DEFAULT_HTTP_PORT}`;
}

/** 从 Host 头取端口：`nas:8282` / `[fe80::1]:8282` / `nas`（无端口 → null） */
export function portFromHostHeader(host: string | null | undefined): string | null {
  if (!host) return null;
  const value = host.trim();
  if (!value) return null;
  if (value.startsWith("[")) {
    const close = value.indexOf("]");
    const rest = close >= 0 ? value.slice(close + 1) : "";
    return rest.startsWith(":") && rest.length > 1 ? rest.slice(1) : null;
  }
  const idx = value.lastIndexOf(":");
  if (idx < 0) return null;
  const port = value.slice(idx + 1);
  return /^\d{1,5}$/.test(port) ? port : null;
}

/** 上次成功过的地址（进程内缓存 + 数据目录落盘，供重启后仍然生效） */
let cachedBase: { base: string; at: number } | null = null;

function cacheFile(env: Record<string, string | undefined>): string | null {
  const home = env.HOME?.trim();
  return home ? join(home, "tos-api-base") : null;
}

function readPersistedBase(env: Record<string, string | undefined>): string | null {
  const file = cacheFile(env);
  if (!file || !existsSync(file)) return null;
  try {
    const value = readFileSync(file, "utf8").trim();
    return /^https?:\/\/\S+$/.test(value) ? value.replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}

function persistBase(env: Record<string, string | undefined>, base: string): void {
  const file = cacheFile(env);
  if (!file) return;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${base}\n`, "utf8");
  } catch {
    /* 只读或无权限：忽略，进程内缓存仍生效 */
  }
}

/** 测试用：重置进程内缓存（不影响落盘） */
export function resetTosProxyCache(): void {
  cachedBase = null;
}

/**
 * 候选 API 地址（按优先级、去重）。
 * 纯函数（除读缓存/落盘），便于测试。
 */
export function tosApiBaseCandidates(
  inbound?: { headers?: Headers } | null,
  env: Record<string, string | undefined> = process.env,
): string[] {
  const out: string[] = [];
  const push = (value?: string | null) => {
    const trimmed = value?.trim().replace(/\/+$/, "");
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
  };

  // 0) 管理员显式指定（或上次成功过的地址，命中即不再试其它）
  if (cachedBase && Date.now() - cachedBase.at < BASE_CACHE_TTL_MS) push(cachedBase.base);
  push(env.TOS_API_BASE);

  // 1) 从入站请求推导：只取端口（主机恒为回环），浏览器访问的端口必然正确
  const headers = inbound?.headers;
  const port = portFromHostHeader(headers?.get("host") ?? null);
  if (port) {
    const proto = (headers?.get("x-forwarded-proto") ?? "http")
      .split(",")[0]
      .trim()
      .toLowerCase();
    if (proto === "https") push(`https://127.0.0.1:${port}`);
    push(`http://127.0.0.1:${port}`);
  }

  // 2) 上次成功过的地址（落盘，重启后仍生效）
  push(readPersistedBase(env));

  // 3) 官方默认与常见回落
  push(`http://127.0.0.1:${TOS_DEFAULT_HTTP_PORT}`);
  push("http://127.0.0.1:80");
  return out;
}

/**
 * 回环（仅 127.0.0.1）HTTPS 请求：**放宽证书校验**。
 *
 * 为什么必须放宽：TOS 的 HTTPS 用的是**自签证书**，而 Node/Next 的 fetch 默认校验证书 →
 * 直接调用会 TLS 握手失败。用户反馈的正是这个组合：只改了 TOS 的 **HTTPS 端口**
 * （如 5449）→ 推导出的 `https://127.0.0.1:5449` 因自签证书被拒 → 四个候选全灭
 * → 应用界面报「无法连接 TOS 文件管理 API」（2026-09-29 用户反馈）。
 *
 * 安全边界：**只对 127.0.0.1 放宽**（连接目标是本机 TOS，不经网络、无中间人面），
 * 且仅用于本应用服务端代理这一条固定路径 `/fileManage/*`。
 */
export interface LoopbackHttpsRequest {
  (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
    timeoutMs: number,
  ): Promise<{ status: number; body: string; location?: string }>;
}

export const loopbackHttpsRequest: LoopbackHttpsRequest = (url, init, timeoutMs) =>
  new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: init.method,
        headers: init.headers,
        rejectUnauthorized: false, // 仅回环：TOS 自签证书
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        const location = Array.isArray(res.headers.location) ? res.headers.location[0] : res.headers.location;
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), location }),
        );
      },
    );
    req.on("timeout", () => req.destroy(new Error(`timeout after ${timeoutMs}ms`)));
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });

/** 该候选是不是"回环 HTTPS"（需要用放宽证书的实现来发） */
export function isLoopbackHttpsUrl(url: string): boolean {
  return /^https:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(url);
}

/**
 * 从重定向的 `Location` 里学出"回环地址"。
 *
 * 为什么需要：TOS 开了「强制 HTTP → HTTPS」后，HTTP 端口只会回 **301**，真正的 API 在
 * HTTPS 端口上（可能是 6443/5449 等任意值）。若只靠入站 Host 头推导端口，一旦 Host 被
 * 前置代理改写或缺失，就找不到真实端口 → 全部候选失败。
 * 这里把 Location 的 **scheme + 端口 + 路径** 保留、**主机强制改写为 127.0.0.1**（只走回环，
 * 不放宽非回环地址的证书校验），从而自愈。
 */
export function loopbackUrlFromLocation(location: string | null | undefined, base: string): string | null {
  if (!location) return null;
  try {
    const target = new URL(location, base);
    if (target.protocol !== "https:" && target.protocol !== "http:") return null;
    const port = target.port || (target.protocol === "https:" ? "443" : "80");
    return `${target.protocol}//127.0.0.1:${port}${target.pathname}${target.search}`;
  } catch {
    return null;
  }
}

/** 响应是否"像 TOS"（避免把别的服务/端口当成功：如 NPM 的 HTML 404） */
export function looksLikeTosResponse(status: number, body: string): boolean {
  if (status === 401 || status === 403) return true; // 未登录/无权限：TOS 正常回应
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return typeof parsed === "object" && parsed !== null && ("code" in parsed || "code_num" in parsed);
  } catch {
    return false;
  }
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
  /** 真正用到的基础地址（诊断用） */
  base?: string;
  /** 尝试过的地址（仅在全部失败时有值） */
  attempts?: string[];
}

/** 全部候选都失败时给用户的可操作提示（会直接显示在目录选择弹窗里） */
export function tosUnreachableHint(attempts: string[]): string {
  return [
    `无法连接 TOS 文件管理 API（已尝试：${attempts.join(" / ")}）。`,
    "常见原因：最近改过 TOS 网页（HTTP/HTTPS）端口。解决办法：①在 TOS 控制面板把端口改回后重启，",
    "或在应用中心把本应用「停用→启用」以重建入口配置；",
    "②若端口就用新的，请在 /usr/local/piagentfortos/piagentfortos.env 里加",
    "TOS_API_BASE=http://127.0.0.1:<你的TOS网页端口> 并 systemctl restart piagentfortos。",
    "详细日志：journalctl -u piagentfortos | tail -50",
    "(TOS file-manage API unreachable; see the hint above / check the service log.)",
  ].join(" ");
}

/** 已记录过的成功地址（避免同一条 info 日志刷屏） */
const loggedBases = new Set<string>();

/** 失败日志（带实测 URL；同一地址 5 分钟内只报一次，避免刷屏） */
const loggedFailures = new Map<string, number>();
function logFailureOnce(key: string, message: string): void {
  const now = Date.now();
  const last = loggedFailures.get(key) ?? 0;
  if (now - last < 5 * 60 * 1000) return;
  loggedFailures.set(key, now);
  console.error(`[tos-proxy] ${message}`);
}

/**
 * 把一次请求转发到 TOS 文件管理 API。
 *
 * 依次尝试 `tosApiBaseCandidates()`（可用 `base` 强制单一地址，测试用）；
 * 首个返回"像 TOS"的响应（JSON 带 code/code_num，或 401/403）胜出并缓存 10 分钟；
 * 全部失败 → 写日志 + 回 502（错误体是给用户看的可操作提示）。
 */
export async function forwardToTosApi(options: {
  action: string;
  method: "GET" | "POST";
  /** query 参数（已解码值；内部会做 URL 编码） */
  query?: Record<string, string | undefined>;
  /** POST body（JSON 字符串） */
  body?: string;
  inboundHeaders: Headers;
  fetchImpl?: typeof fetch;
  /** 强制指定单一地址（测试/诊断用） */
  base?: string;
  /** 单次尝试超时（毫秒） */
  timeoutMs?: number;
  /** 回环 HTTPS 实现（测试注入用；默认放宽证书校验的 node:https） */
  httpsImpl?: LoopbackHttpsRequest;
  env?: Record<string, string | undefined>;
}): Promise<TosProxyResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const candidates = options.base
    ? [options.base.replace(/\/+$/, "")]
    : tosApiBaseCandidates({ headers: options.inboundHeaders }, options.env ?? process.env);

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") params.set(key, value);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const headers = buildForwardHeaders(options.inboundHeaders, options.method);
  const timeoutMs = options.timeoutMs ?? ATTEMPT_TIMEOUT_MS;
  const attempts: string[] = [];

  for (const base of candidates) {
    const url = `${base}${TOS_API_PATH_PREFIX}${options.action}${suffix}`;
    attempts.push(base);
    try {
      // 回环 HTTPS 候选（TOS 自签证书）用放宽证书的实现；其余走 fetch
      const httpsImpl = options.httpsImpl ?? loopbackHttpsRequest;
      const response = isLoopbackHttpsUrl(url)
        ? await (async () => {
            const r = await httpsImpl(url, { method: options.method, headers, body: options.body }, timeoutMs);
            return { status: r.status, text: async () => r.body };
          })()
        : await fetchImpl(url, {
            method: options.method,
            headers,
            body: options.body,
            cache: "no-store",
            signal: AbortSignal.timeout(timeoutMs),
          });
      const body = await response.text();
      if (!looksLikeTosResponse(response.status, body)) {
        // 301/302/307/308：多半是「强制 HTTP → HTTPS」的重定向 → 从 Location 学出真实端口
        const location = "headers" in response && response.headers
          ? response.headers.get("location")
          : (response as { location?: string }).location;
        if ([301, 302, 303, 307, 308].includes(response.status) && location) {
          const follow = loopbackUrlFromLocation(location, url);
          if (follow) {
            const followBase = follow.slice(0, follow.indexOf(TOS_API_PATH_PREFIX));
            if (!attempts.includes(followBase)) attempts.push(followBase);
            try {
              const impl = options.httpsImpl ?? loopbackHttpsRequest;
              const r = isLoopbackHttpsUrl(follow)
                ? await impl(follow, { method: options.method, headers, body: options.body }, timeoutMs)
                : await (async () => {
                    const resp = await fetchImpl(follow, {
                      method: options.method,
                      headers,
                      body: options.body,
                      cache: "no-store",
                      signal: AbortSignal.timeout(timeoutMs),
                    });
                    return { status: resp.status, body: await resp.text(), location: resp.headers.get("location") ?? undefined };
                  })();
              if (looksLikeTosResponse(r.status, r.body)) {
                cachedBase = { base: followBase, at: Date.now() };
                const env = options.env ?? process.env;
                persistBase(env, followBase);
                console.log(`[tos-proxy] 经重定向自愈：使用 TOS API 地址 ${followBase}（源自 Location）`);
                return { status: r.status, body: r.body, base: followBase };
              }
              logFailureOnce(`follow:${followBase}`, `${followBase}（重定向目标）响应不像 TOS（HTTP ${r.status}）`);
            } catch (error) {
              logFailureOnce(
                `followerr:${followBase}`,
                `${followBase}（重定向目标）不可达：${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
        }
        // 那个端口上活着但不是 TOS（如 NPM 的 HTML 404）→ 换下一个候选
        logFailureOnce(
          `implausible:${base}`,
          `${base} 响应不像 TOS（HTTP ${response.status}）→ 尝试下一个候选地址`,
        );
        continue;
      }
      cachedBase = { base, at: Date.now() };
      const env = options.env ?? process.env;
      persistBase(env, base);
      // 首次用到非默认地址时记一条（排查"改了端口"这类问题时，日志里能直接看到实际地址）
      const fallback = tosApiBase(env);
      if (base !== fallback && !loggedBases.has(base)) {
        loggedBases.add(base);
        console.log(`[tos-proxy] 使用 TOS API 地址 ${base}（默认 ${fallback} 未命中：可能已改过 TOS 网页端口）`);
      }
      return { status: response.status, body, base };
    } catch (error) {
      logFailureOnce(
        `error:${base}`,
        `${base} 不可达：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  cachedBase = null;
  console.error(
    `[tos-proxy] 所有候选地址均失败，已尝试：${attempts.join(" / ")}；${options.action}`,
  );
  return {
    status: 502,
    body: JSON.stringify({ error: tosUnreachableHint(attempts) }),
    attempts,
  };
}
