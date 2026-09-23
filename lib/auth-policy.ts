/**
 * Validate an auth provider identifier from URL path parameters.
 *
 * Provider names are used by pi-coding-agent's AuthStorage as config keys
 * (and potentially as file names on disk). This rejects path traversal,
 * shell metacharacters, and other characters that could be misinterpreted
 * by downstream layers.
 *
 * Allowed: lowercase letters, digits, hyphens (e.g. "anthropic", "openai",
 * "google", "openrouter"). Matches typical OAuth provider slugs.
 *
 * Returns an error message string if rejected, or null if allowed.
 */
export function validateProviderName(provider: string): string | null {
  if (!provider) return "provider is required";
  // Reasonable length cap to prevent pathological inputs
  if (provider.length > 64) return "provider name too long (max 64 chars)";
  // Allowed: lowercase alpha, digits, hyphens. Must start with a letter.
  if (!/^[a-z][a-z0-9-]*$/.test(provider)) {
    return "Invalid provider name (allowed: lowercase letters, digits, hyphens; must start with a letter)";
  }
  return null;
}
const ALLOWED_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

/** 额外放行的 Origin（逗号分隔，如反向代理/自定义域名部署）。
 *  TOS 包由 piagentfortos.env 提供：PI_ALLOWED_ORIGINS=http://nas.example.com:8181 */
function extraAllowedOrigins(): string[] {
  return (process.env.PI_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim().replace(/\/+$/, "").toLowerCase())
    .filter(Boolean);
}

/**
 * Returns true if the given Origin header value is allowed to call the API:
 *   1) 回环来源（桌面版与本地开发）
 *   2) 配置白名单（PI_ALLOWED_ORIGINS）
 * 同源请求（Origin 与 Host 一致，见 isSameOriginRequest）另行放行。
 */
export function isAllowedOrigin(origin: string, extra: string[] = extraAllowedOrigins()): boolean {
  if (ALLOWED_ORIGIN_RE.test(origin)) return true;
  const normalized = origin.trim().replace(/\/+$/, "").toLowerCase();
  return extra.some((entry) => entry === normalized);
}

/** 拆 `host[:port]`（兼容 IPv6 方括号写法） */
function splitHostPort(value: string): { host: string; port: string | null } | null {
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  const bracketed = raw.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (bracketed) return { host: bracketed[1], port: bracketed[2] ?? null };
  const plain = raw.match(/^([^:]+)(?::(\d+))?$/);
  if (!plain) return null;
  return { host: plain[1], port: plain[2] ?? null };
}

/**
 * 同源判定：Origin 的 host:port 与请求的 Host 头一致。
 *
 * 这是反向代理部署（TOS 应用挂在 http://<nas>:8181/<appid>/）下的正解：
 * 请求确实同源，只是主机名不是回环地址。规则保持严格——
 *   - Host 带端口 → Origin 端口必须完全相同（同主机不同端口仍被拒）
 *   - Host 不带端口 → Origin 端口必须是 80/443（协议默认）
 */
export function isSameOriginRequest(origin: string, hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const originHost = url.hostname.toLowerCase();
  const originPort = url.port || (url.protocol === "https:" ? "443" : "80");
  const target = splitHostPort(hostHeader);
  if (!target || target.host !== originHost) return false;
  if (target.port === null) return originPort === "80" || originPort === "443";
  return target.port === originPort;
}

/**
 * Validates the Origin header on incoming API requests. Blocks cross-origin
 * writes (DNS-rebinding / CSRF), while allowing:
 *   - 回环来源与 PI_ALLOWED_ORIGINS 白名单
 *   - 同源请求（Origin == Host，反代部署必需；TOS 上缺此条会导致所有配置保存 403）
 * Returns an error message string if rejected (403), or null if allowed.
 */
export function validateRequestOrigin(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (origin === null) return null;
  if (isAllowedOrigin(origin)) return null;
  if (isSameOriginRequest(origin, req.headers.get("host"))) return null;
  return "forbidden origin";
}
