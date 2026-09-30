import test from "node:test";
import assert from "node:assert/strict";
import {
  buildForwardHeaders,
  isLoopbackHttpsUrl,
  loopbackUrlFromLocation,
  csrfTokenFromCookie,
  forwardToTosApi,
  looksLikeTosResponse,
  portFromHostHeader,
  resetTosProxyCache,
  tosApiBase,
  tosApiBaseCandidates,
  tosUnreachableHint,
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
  assert.match(result.body, /无法连接 TOS 文件管理 API/);
  assert.ok(result.attempts && result.attempts.length >= 1, "应报告尝试过的地址");
});

test("portFromHostHeader：普通主机、IPv6、无端口", () => {
  assert.equal(portFromHostHeader("nas:8282"), "8282");
  assert.equal(portFromHostHeader("192.168.124.57:8181"), "8181");
  assert.equal(portFromHostHeader("[fe80::1]:6443"), "6443");
  assert.equal(portFromHostHeader("nas"), null);
  assert.equal(portFromHostHeader("[fe80::1]"), null);
  assert.equal(portFromHostHeader(null), null);
});

test("tosApiBaseCandidates：显式配置 → 从请求端口推导 → 默认 8181/80（主机恒为回环）", () => {
  resetTosProxyCache();
  const headers = new Headers({ host: "192.168.124.57:8282" });

  // 无配置：推导优先于默认值
  assert.deepEqual(tosApiBaseCandidates({ headers }, {}), [
    "http://127.0.0.1:8282",
    "http://127.0.0.1:8181",
    "http://127.0.0.1:80",
  ]);

  // 显式配置排第一
  assert.deepEqual(
    tosApiBaseCandidates({ headers }, { TOS_API_BASE: "http://nas:9999/" }),
    ["http://nas:9999", "http://127.0.0.1:8282", "http://127.0.0.1:8181", "http://127.0.0.1:80"],
  );

  // HTTPS 入口：先试同端口的 https，再试 http
  assert.deepEqual(
    tosApiBaseCandidates({ headers: new Headers({ host: "nas:6443", "x-forwarded-proto": "https" }) }, {}),
    ["https://127.0.0.1:6443", "http://127.0.0.1:6443", "http://127.0.0.1:8181", "http://127.0.0.1:80"],
  );

  // 没有 Host 头（本机 curl / 内部调用）：只剩默认回落
  assert.deepEqual(tosApiBaseCandidates(null, {}), ["http://127.0.0.1:8181", "http://127.0.0.1:80"]);
});

test("looksLikeTosResponse：只认 TOS 风格的响应，避免把别的服务当成功", () => {
  assert.equal(looksLikeTosResponse(200, JSON.stringify({ code: true, code_num: 0 })), true);
  assert.equal(looksLikeTosResponse(403, "<html>forbidden</html>"), true, "未登录：TOS 会回 403/401");
  assert.equal(looksLikeTosResponse(401, ""), true);
  assert.equal(looksLikeTosResponse(200, "<!DOCTYPE html><title>Nginx Proxy Manager</title>"), false);
  assert.equal(looksLikeTosResponse(404, "<html>404 Not Found</html>"), false);
});

test("forwardToTosApi：候选逐个尝试，跳过“不像 TOS”的端口，命中后缓存", async () => {
  resetTosProxyCache();
  const headers = new Headers({ host: "nas:8282", cookie: "TMSESSNAME=s" });
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    if (url.startsWith("http://127.0.0.1:8282")) {
      // 该端口活着但不是 TOS（典型：NPM 的 HTML 404）
      return new Response("<!DOCTYPE html><title>Nginx Proxy Manager</title>", { status: 404 });
    }
    return new Response(JSON.stringify({ code: true, code_num: 0, data: { data: [] } }), { status: 200 });
  }) as unknown as typeof fetch;

  const first = await forwardToTosApi({
    action: "/list",
    method: "GET",
    query: { path: "/" },
    inboundHeaders: headers,
    fetchImpl,
    timeoutMs: 200,
    env: {},
  });
  assert.equal(first.status, 200);
  assert.equal(first.base, "http://127.0.0.1:8181");
  assert.equal(calls.length, 2, "应先试 8282（不像 TOS）再试 8181");

  // 第二次：缓存命中，直接打 8181
  const second = await forwardToTosApi({
    action: "/list",
    method: "GET",
    query: { path: "/" },
    inboundHeaders: headers,
    fetchImpl,
    timeoutMs: 200,
    env: {},
  });
  assert.equal(second.base, "http://127.0.0.1:8181");
  assert.equal(calls.length, 3, "第二次不应再试 8282");
  resetTosProxyCache();
});

test("tosUnreachableHint：提示里带出实际尝试过的地址与恢复步骤", () => {
  const hint = tosUnreachableHint(["http://127.0.0.1:8282", "http://127.0.0.1:8181"]);
  assert.match(hint, /127\.0\.0\.1:8282/);
  assert.match(hint, /TOS_API_BASE/);
  assert.match(hint, /停用→启用/);
});

test("isLoopbackHttpsUrl：只把回环 HTTPS 判为需要放宽证书的候选", () => {
  assert.equal(isLoopbackHttpsUrl("https://127.0.0.1:5449/fileManage/list"), true);
  assert.equal(isLoopbackHttpsUrl("https://127.0.0.1/fileManage/list"), true);
  assert.equal(isLoopbackHttpsUrl("https://localhost:5449/x"), true);
  assert.equal(isLoopbackHttpsUrl("http://127.0.0.1:8181/fileManage/list"), false);
  assert.equal(isLoopbackHttpsUrl("https://10.18.15.57:5449/x"), false);
  assert.equal(isLoopbackHttpsUrl("https://nas.example.com:5449/x"), false);
});

test("forwardToTosApi：HTTPS 候选走放宽证书的回环实现（用户改 HTTPS 端口后加不了目录的那个场景）", async () => {
  resetTosProxyCache();
  const headers = new Headers({ host: "10.18.15.57:5449", "x-forwarded-proto": "https", cookie: "TMSESSNAME=s" });
  const httpsCalls: string[] = [];
  const fetchCalls: string[] = [];
  const httpsImpl = (async (url: string) => {
    httpsCalls.push(url);
    if (url.startsWith("https://127.0.0.1:5449")) {
      return { status: 403, body: JSON.stringify({ code: false, code_num: 24 }) }; // 未登录：TOS 正常回应
    }
    throw new Error("unreachable");
  }) as never;
  const fetchImpl = (async (url: string) => {
    fetchCalls.push(url);
    throw new Error("connect ECONNREFUSED");
  }) as unknown as typeof fetch;

  const result = await forwardToTosApi({
    action: "/list",
    method: "GET",
    query: { path: "/" },
    inboundHeaders: headers,
    fetchImpl,
    httpsImpl: httpsImpl as never,
    timeoutMs: 200,
    env: {},
  });

  assert.equal(result.status, 403, "应把回环 HTTPS 的 403 当作可达（不是 502）");
  assert.equal(result.base, "https://127.0.0.1:5449");
  assert.ok(httpsCalls.some((u) => u.startsWith("https://127.0.0.1:5449")), "必须尝试回环 HTTPS");
  assert.equal(fetchCalls.length, 0, "https 候选不该走 fetch（会因自签证书失败）");
  resetTosProxyCache();
});

test("forwardToTosApi：回环 HTTPS 也失败时继续尝试后续候选（最终 502 并给提示）", async () => {
  resetTosProxyCache();
  const httpsImpl = (async () => {
    throw new Error("self-signed certificate in certificate chain");
  }) as never;
  const fetchImpl = (async () => {
    throw new Error("connect ECONNREFUSED");
  }) as unknown as typeof fetch;

  const result = await forwardToTosApi({
    action: "/list",
    method: "GET",
    query: { path: "/" },
    inboundHeaders: new Headers({ host: "nas:5449", "x-forwarded-proto": "https" }),
    fetchImpl,
    httpsImpl: httpsImpl as never,
    timeoutMs: 200,
    env: {},
  });
  assert.equal(result.status, 502);
  assert.match(result.body, /已尝试：https:\/\/127\.0\.0\.1:5449/);
  resetTosProxyCache();
});

test("loopbackUrlFromLocation：保留 scheme/端口/路径，主机强制改写为 127.0.0.1", () => {
  assert.equal(
    loopbackUrlFromLocation("https://192.168.124.57:6443/fileManage/list?path=%2F", "http://127.0.0.1:8181/x"),
    "https://127.0.0.1:6443/fileManage/list?path=%2F",
  );
  assert.equal(loopbackUrlFromLocation("https://nas.example.com/fileManage/list", "http://x/"), "https://127.0.0.1:443/fileManage/list");
  assert.equal(loopbackUrlFromLocation("http://10.0.0.1:8080/fileManage/list", "http://x/"), "http://127.0.0.1:8080/fileManage/list");
  assert.equal(loopbackUrlFromLocation(null, "http://x/"), null);
  assert.equal(loopbackUrlFromLocation("ftp://nas/x", "http://x/"), null);
  // 相对 Location（HTTP 允许）按 base 解析，同样是合法行为
  assert.equal(loopbackUrlFromLocation("/fileManage/list", "https://nas:6443/a/b"), "https://127.0.0.1:6443/fileManage/list");
});

test("forwardToTosApi：强制 HTTP→HTTPS 时，从 301 的 Location 学出 HTTPS 端口并自愈（不依赖 Host 头）", async () => {
  resetTosProxyCache();
  // 模拟：Host 头没有端口信息（被前置代理改写），HTTP 端口只回 301 到真实 HTTPS 端口 6443
  const headers = new Headers({ host: "nas", cookie: "TMSESSNAME=s" });
  const httpsCalls: string[] = [];
  const fetchImpl = (async (url: string) => {
    if (url.startsWith("http://127.0.0.1:8181")) {
      return new Response("<html>301 Moved Permanently</html>", {
        status: 301,
        headers: { location: "https://192.168.124.57:6443/fileManage/list?path=%2F" },
      });
    }
    throw new Error("connect ECONNREFUSED");
  }) as unknown as typeof fetch;
  const httpsImpl = (async (url: string) => {
    httpsCalls.push(url);
    if (url.startsWith("https://127.0.0.1:6443")) {
      return { status: 403, body: JSON.stringify({ code: false, code_num: 24 }), location: undefined };
    }
    throw new Error("self-signed certificate in certificate chain");
  }) as never;

  const result = await forwardToTosApi({
    action: "/list",
    method: "GET",
    query: { path: "/" },
    inboundHeaders: headers,
    fetchImpl,
    httpsImpl: httpsImpl as never,
    timeoutMs: 200,
    env: {},
  });

  assert.equal(result.status, 403, "应通过重定向自愈拿到 TOS 的正常回应（不是 502）");
  assert.equal(result.base, "https://127.0.0.1:6443");
  assert.ok(httpsCalls.some((u) => u.startsWith("https://127.0.0.1:6443")), "必须按 Location 学出的端口试回环 HTTPS");
  resetTosProxyCache();
});

test("forwardToTosApi：请求必须带 redirect:\"manual\"（否则 301 会被自动跟随、读不到 Location）", async () => {
  resetTosProxyCache();
  const seen: RequestInit[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    seen.push(init);
    return new Response(JSON.stringify({ code: true, code_num: 0 }), { status: 200 });
  }) as unknown as typeof fetch;
  await forwardToTosApi({
    action: "/list",
    method: "GET",
    query: { path: "/" },
    inboundHeaders: new Headers(),
    fetchImpl,
    timeoutMs: 200,
    env: {},
  });
  assert.equal(seen[0]?.redirect, "manual");
  resetTosProxyCache();
});
