import { register } from "node:module";
// 仅类型：运行时由下方 loader stub 提供 next/server
import type { NextRequest } from "next/server";
import test from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Loader stub for `next/server` + tsconfig `@/*` path alias
// ---------------------------------------------------------------------------
// node 24's ESM resolver does not auto-append `.js` for packages without an
// `exports` map (next 16 has none), so `import "next/server"` fails under
// `node --test`. We register an inline resolve hook that redirects
// `next/server` to a minimal stub, letting us load the *real* middleware.ts
// and exercise its actual `isAllowedOrigin` function. The hook also rewrites
// the `@/*` path alias (middleware.ts imports `@/lib/csp` and
// `@/lib/auth-policy`) to real files under the repo root — node's ESM loader
// does not read tsconfig paths. The middleware() function itself depends on
// NextRequest and is intentionally not unit-tested here (per task spec).
const LOADER_SOURCE = `
export function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    // 可用的最小实现：中间件本身也要被测（此前是空壳，导致 middleware.ts 里
    // 复制的一份 Origin 判断长期没被覆盖 —— TOS 上所有写操作 403 的根因）
    const stub =
      "export class NextResponse extends Response { static next() { return new NextResponse(null); } }" +
      "export class NextRequest {" +
      "  constructor(input, init = {}) {" +
      "    this.url = String(input);" +
      "    this.method = init.method || 'GET';" +
      "    this.headers = new Headers(init.headers || {});" +
      "    this.nextUrl = new URL(this.url);" +
      "  }" +
      "}";
    return {
      url: "data:text/javascript," + encodeURIComponent(stub),
      shortCircuit: true,
    };
  }
  if (specifier.startsWith("@/") && context.parentURL) {
    const parentDir = new URL("./", context.parentURL);
    return {
      url: new URL(specifier.slice(2) + ".ts", parentDir).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
`;
register(
  "data:text/javascript," + encodeURIComponent(LOADER_SOURCE),
  import.meta.url,
);

const { isAllowedOrigin, shouldApplyOriginCheck } = await import("./middleware.ts");

// ---------------------------------------------------------------------------
// isAllowedOrigin — loopback / localhost allowlist
// ---------------------------------------------------------------------------

test("isAllowedOrigin: http://localhost with port is allowed", () => {
  assert.equal(isAllowedOrigin("http://localhost:30141"), true);
});

test("isAllowedOrigin: http://127.0.0.1 with port is allowed", () => {
  assert.equal(isAllowedOrigin("http://127.0.0.1:30141"), true);
});

test("isAllowedOrigin: https://localhost / https://127.0.0.1 with port are allowed", () => {
  assert.equal(isAllowedOrigin("https://localhost:30141"), true);
  assert.equal(isAllowedOrigin("https://127.0.0.1:30141"), true);
});

test("isAllowedOrigin: loopback without port is allowed (dev convenience)", () => {
  assert.equal(isAllowedOrigin("http://localhost"), true);
  assert.equal(isAllowedOrigin("http://127.0.0.1"), true);
});

test("isAllowedOrigin: cross-origin host is rejected", () => {
  assert.equal(isAllowedOrigin("https://evil.com"), false);
});

test("isAllowedOrigin: LAN IP is rejected (only loopback allowed)", () => {
  assert.equal(isAllowedOrigin("http://192.168.1.1:30141"), false);
  assert.equal(isAllowedOrigin("http://10.0.0.1:30141"), false);
});

test("isAllowedOrigin: empty string is rejected", () => {
  assert.equal(isAllowedOrigin(""), false);
});

test("isAllowedOrigin: missing scheme / malformed values are rejected", () => {
  assert.equal(isAllowedOrigin("localhost:30141"), false);
  assert.equal(isAllowedOrigin("//localhost:30141"), false);
  assert.equal(isAllowedOrigin("file:///etc/passwd"), false);
});

test("isAllowedOrigin: scheme/host are matched case-insensitively", () => {
  // RFC 6454 Origin is scheme://host:port where scheme & host are
  // case-insensitive. The regex's `i` flag must cover uppercase variants
  // so a hypothetical uppercase Origin is still accepted.
  assert.equal(isAllowedOrigin("HTTP://localhost:30141"), true);
  assert.equal(isAllowedOrigin("https://LOCALHOST:30141"), true);
  assert.equal(isAllowedOrigin("Http://127.0.0.1"), true);
});

// ---------------------------------------------------------------------------
// shouldApplyOriginCheck — request routing policy
// ---------------------------------------------------------------------------
// All /api/* requests are checked regardless of HTTP method: sensitive GET
// endpoints (session data, file reads) are also vulnerable to DNS-rebinding.

test("shouldApplyOriginCheck: POST to /api/agent/:id is checked", () => {
  assert.equal(shouldApplyOriginCheck("/api/agent/abc-123", "POST"), true);
});

test("shouldApplyOriginCheck: GET to /api/health is checked", () => {
  assert.equal(shouldApplyOriginCheck("/api/health", "GET"), true);
});

test("shouldApplyOriginCheck: GET to / is NOT checked (page loads)", () => {
  assert.equal(shouldApplyOriginCheck("/", "GET"), false);
});

test("shouldApplyOriginCheck: all methods on /api/* are checked", () => {
  assert.equal(shouldApplyOriginCheck("/api/agent/x", "PUT"), true);
  assert.equal(shouldApplyOriginCheck("/api/agent/x", "DELETE"), true);
  assert.equal(shouldApplyOriginCheck("/api/agent/x", "PATCH"), true);
  assert.equal(shouldApplyOriginCheck("/api/agent/x", "GET"), true);
});

test("shouldApplyOriginCheck: non-API POST is NOT checked (handled by CSP instead)", () => {
  // e.g. a page-level POST route outside /api — pages are protected by CSP,
  // not by the Origin allowlist.
  assert.equal(shouldApplyOriginCheck("/some-page", "POST"), false);
  assert.equal(shouldApplyOriginCheck("/some-page", "GET"), false);
});

test("shouldApplyOriginCheck: all method variants on /api/* are checked", () => {
  assert.equal(shouldApplyOriginCheck("/api/x", "post"), true);
  assert.equal(shouldApplyOriginCheck("/api/x", "get"), true);
});

// ── 中间件级（此前只测策略函数，漏掉了中间件内复制的那份判断，TOS 上因此 403）──
test("middleware: 同源写请求放行（Origin == Host，反代部署）", async () => {
  const { middleware } = await import("./middleware.ts");
  const req = {
    method: "PUT",
    url: "http://192.168.124.57:8181/piagentfortos/api/models-config",
    headers: new Headers({ origin: "http://192.168.124.57:8181", host: "192.168.124.57:8181" }),
    nextUrl: new URL("http://192.168.124.57:8181/piagentfortos/api/models-config"),
  } as unknown as NextRequest;
  const res = middleware(req);
  assert.notEqual(res.status, 403, "同源写请求不得被 middleware 403（TOS 上否则无法保存任何配置）");
});

test("middleware: 跨域写请求仍 403", async () => {
  const { middleware } = await import("./middleware.ts");
  const req = {
    method: "PUT",
    url: "http://192.168.124.57:8181/piagentfortos/api/models-config",
    headers: new Headers({ origin: "http://evil.example", host: "192.168.124.57:8181" }),
    nextUrl: new URL("http://192.168.124.57:8181/piagentfortos/api/models-config"),
  } as unknown as NextRequest;
  assert.equal(middleware(req).status, 403, "跨域写入必须继续拦截");
});

test("shouldApplyOriginCheck：带 basePath 前缀（TOS）也必须检查 /api", () => {
  assert.equal(shouldApplyOriginCheck("/piagentfortos/api/models-config", "PUT"), true);
  assert.equal(shouldApplyOriginCheck("/piagentfortos/page", "PUT"), false);
  assert.equal(shouldApplyOriginCheck("/api/models-config", "PUT"), true);
});
