import test from "node:test";
import assert from "node:assert/strict";
import {
  buildForwardHeaders,
  csrfTokenFromCookie,
  forwardToTosApi,
  tosApiBase,
} from "./tos-proxy.ts";

test("csrfTokenFromCookie：从 Cookie 串取令牌（大小写不敏感、支持 URL 编码）", () => {
  assert.equal(csrfTokenFromCookie("userName=admin; X-Csrf-Token=abc123"), "abc123");
  assert.equal(csrfTokenFromCookie("x-csrf-token=needs%20decode"), "needs decode");
  assert.equal(csrfTokenFromCookie("userName=admin; TMSESSNAME=s"), null);
  assert.equal(csrfTokenFromCookie(null), null);
});

test("buildForwardHeaders：Cookie 原样透传，CSRF 头由入站头或 Cookie 补齐", () => {
  const inbound = new Headers({ cookie: "userName=admin; TMSESSNAME=s; X-Csrf-Token=tok", host: "nas:8181" });
  const get = buildForwardHeaders(inbound, "GET");
  assert.equal(get.cookie, "userName=admin; TMSESSNAME=s; X-Csrf-Token=tok");
  assert.equal(get["X-Csrf-Token"], "tok");
  assert.equal(get["Content-Type"], undefined, "GET 不带 Content-Type");

  const post = buildForwardHeaders(new Headers({ cookie: "X-Csrf-Token=tok" }), "POST");
  assert.equal(post["Content-Type"], "application/json");

  // 入站头优先（前端可显式传）
  const explicit = buildForwardHeaders(
    new Headers({ cookie: "X-Csrf-Token=fromCookie", "x-csrf-token": "fromHeader" }),
    "GET",
  );
  assert.equal(explicit["X-Csrf-Token"], "fromHeader");
});

test("tosApiBase：默认回环 web 端口，可用 TOS_API_BASE 覆盖", () => {
  assert.equal(tosApiBase({}), "http://127.0.0.1:8181");
  assert.equal(tosApiBase({ TOS_API_BASE: "http://nas:8181/" }), "http://nas:8181");
});

test("forwardToTosApi：目标固定为 /fileManage/*，path 只作为 query 参数（无 SSRF 面）", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ code: true, code_num: 0, data: { data: [] } }), { status: 200 });
  }) as unknown as typeof fetch;

  const result = await forwardToTosApi({
    action: "/list",
    method: "GET",
    query: { path: "/Volume1/Public" },
    inboundHeaders: new Headers({ cookie: "TMSESSNAME=s; X-Csrf-Token=t" }),
    fetchImpl,
    base: "http://127.0.0.1:8181",
  });

  assert.equal(calls[0].url, "http://127.0.0.1:8181/fileManage/list?path=%2FVolume1%2FPublic");
  assert.equal((calls[0].init.headers as Record<string, string>)["X-Csrf-Token"], "t");
  assert.equal(result.status, 200);
  assert.match(result.body, /"code":true/);
});

test("forwardToTosApi：TOS 不可达时返回 502 而不是抛错", async () => {
  const fetchImpl = (async () => {
    throw new Error("connect ECONNREFUSED");
  }) as unknown as typeof fetch;
  const result = await forwardToTosApi({
    action: "/list",
    method: "GET",
    query: { path: "/" },
    inboundHeaders: new Headers(),
    fetchImpl,
  });
  assert.equal(result.status, 502);
  assert.match(result.body, /TOS API unreachable/);
});
