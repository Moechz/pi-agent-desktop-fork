import { NextRequest, NextResponse } from "next/server";
import { buildWebCspHeader } from "@/lib/csp";
import { isAllowedOrigin, validateRequestOrigin } from "@/lib/auth-policy";

export { isAllowedOrigin };

// CSP for HTML page responses — shared builder with Electron (lib/csp.ts).
// API responses skip CSP (JSON; CSP is meaningless there).
const CSP_HEADER = buildWebCspHeader();

/**
 * Decides whether the middleware should run the Origin check for a given
 * request. All /api/* requests are checked regardless of HTTP method:
 * sensitive GET endpoints (session data, file reads) are also vulnerable
 * to DNS-rebinding attacks, not just write operations.
 *
 * Exported for unit testing.
 */
export function shouldApplyOriginCheck(pathname: string, _method: string): boolean {
  // 用「段边界」匹配 /api：路径可能是 /api/... 或子路径部署下的 /<appid>/api/...，
  // 且不应误伤 /api-docs 这类同前缀页面路由。此前只判断 startsWith("/api")，
  // 在 TOS（basePath=/piagentfortos）下会漏检所有 API 请求 —— 安全漏洞，勿回退。
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");
  const effective =
    basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`))
      ? pathname.slice(basePath.length)
      : pathname;
  return /(^|\/)api(\/|$)/.test(effective);
}

/**
 * Next.js middleware. Two responsibilities, dispatched by pathname:
 *
 *   - /api/* requests: run the Origin check on non-GET methods (blocks DNS
 *     rebinding / cross-origin writes against the dev server). CSP is NOT
 *     injected — API responses are JSON and CSP is meaningless there.
 *   - page requests (anything else): inject the Content-Security-Policy
 *     header. No Origin check — pages are mostly GET and CSP is the
 *     page-level defense.
 *
 * Requests without an Origin header (e.g. curl, some Electron renderer
 * fetches) bypass the check for backward compatibility — browsers always
 * send Origin on cross-origin writes.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (shouldApplyOriginCheck(pathname, request.method)) {
    // 单一事实源：Origin 策略全部走 lib/auth-policy.ts 的 validateRequestOrigin
    // （回环 + PI_ALLOWED_ORIGINS + **同源放行**）。此处曾复制一份"仅回环"的判断，
    // 导致 TOS 反代部署（Origin=http://<nas>:8181）所有写操作 403 —— 勿再分叉。
    const rejection = validateRequestOrigin(request);
    if (rejection !== null) {
      return new NextResponse(JSON.stringify({ error: rejection }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }
    return NextResponse.next();
  }

  // Page request: inject CSP.
  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", CSP_HEADER);
  return response;
}

// Matcher includes /api so that the Origin check actually runs on API write
// requests (POST /api/agent/[id], etc.) — the previous matcher excluded /api
// entirely, which defeated the entire point of the Origin check. Only
// Next.js internal static assets and the favicon are bypassed.
export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
