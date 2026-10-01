import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedOrigin, isSameOriginRequest, validateProviderName, validateRequestOrigin } from "./auth-policy.ts";

test("validateProviderName: allows typical provider slugs", () => {
  for (const p of ["anthropic", "openai", "google", "openrouter"]) {
    assert.equal(validateProviderName(p), null, `${p} should be allowed`);
  }
});

test("validateProviderName: allows hyphens after first letter", () => {
  assert.equal(validateProviderName("provider-1"), null);
  assert.equal(validateProviderName("a-b-c"), null);
});

test("validateProviderName: rejects empty string", () => {
  assert.match(validateProviderName("")!, /required/);
});

test("validateProviderName: rejects path traversal attempts", () => {
  assert.match(validateProviderName("../etc")!, /Invalid provider name/);
  assert.match(validateProviderName("..")!, /Invalid provider name/);
  assert.match(validateProviderName("/")!, /Invalid provider name/);
  assert.match(validateProviderName("\\")!, /Invalid provider name/);
});

test("validateProviderName: rejects uppercase", () => {
  assert.match(validateProviderName("ANTHROPIC")!, /Invalid provider name/);
  assert.match(validateProviderName("Anthropic")!, /Invalid provider name/);
});

test("validateProviderName: rejects leading hyphen", () => {
  assert.match(validateProviderName("-foo")!, /Invalid provider name/);
});

test("validateProviderName: rejects leading digit", () => {
  assert.match(validateProviderName("1foo")!, /Invalid provider name/);
});

test("validateProviderName: rejects internal whitespace", () => {
  assert.match(validateProviderName("foo bar")!, /Invalid provider name/);
});

test("validateProviderName: rejects shell metacharacters", () => {
  assert.match(validateProviderName("foo;rm -rf")!, /Invalid provider name/);
  assert.match(validateProviderName("foo|cat")!, /Invalid provider name/);
  assert.match(validateProviderName("foo&bar")!, /Invalid provider name/);
  assert.match(validateProviderName("foo`whoami`")!, /Invalid provider name/);
});

test("validateProviderName: rejects names exceeding 64 chars", () => {
  const tooLong = "a".repeat(65);
  assert.match(validateProviderName(tooLong)!, /too long/);
});

test("validateProviderName: allows exactly 64 chars", () => {
  const exact = "a".repeat(64);
  assert.equal(validateProviderName(exact), null);
});
test("isAllowedOrigin and validateRequestOrigin: allows localhost and loopback origins", () => {
  assert.equal(isAllowedOrigin("http://localhost:3000"), true);
  assert.equal(isAllowedOrigin("http://127.0.0.1:8080"), true);
  assert.equal(isAllowedOrigin("https://localhost"), true);

  const validReq = new Request("http://localhost:3000/api/mcp/test", {
    headers: { origin: "http://localhost:3000" },
  });
  assert.equal(validateRequestOrigin(validReq), null);
});

test("validateRequestOrigin: rejects forbidden origin", () => {
  const invalidReq = new Request("http://localhost:3000/api/mcp/test", {
    headers: { origin: "https://evil.com" },
  });
  assert.equal(validateRequestOrigin(invalidReq), "forbidden origin");
});

test("validateRequestOrigin: allows request without origin header", () => {
  const noOriginReq = new Request("http://localhost:3000/api/mcp/test");
  assert.equal(validateRequestOrigin(noOriginReq), null);
});

// ── 反代部署（TOS）：同源放行 ────────────────────────────────────────────
test("同源判定：Origin 与 Host 一致时放行（含端口严格比较）", () => {
  // TOS：浏览器在 http://<nas>:8181/<appid>/ 发起的同源请求
  assert.equal(isSameOriginRequest("http://192.168.124.57:8181", "192.168.124.57:8181"), true);
  // HTTPS 默认端口
  assert.equal(isSameOriginRequest("https://nas.example.com", "nas.example.com"), true);
  assert.equal(isSameOriginRequest("http://nas.example.com", "nas.example.com"), true);
  // 同主机不同端口 → 仍然拒绝（跨端口即跨源）
  assert.equal(isSameOriginRequest("http://nas:9999", "nas:8181"), false);
  // 不同主机 / 缺 Host / 非 http(s) 协议 → 拒绝
  assert.equal(isSameOriginRequest("http://evil.example", "nas:8181"), false);
  assert.equal(isSameOriginRequest("http://nas:8181", null), false);
  assert.equal(isSameOriginRequest("ftp://nas:8181", "nas:8181"), false);
});

test("validateRequestOrigin：同源放行、跨域仍 403", async () => {
  const same = new Request("http://192.168.124.57:8181/piagentfortos/api/models-config", {
    method: "PUT",
    headers: { origin: "http://192.168.124.57:8181", host: "192.168.124.57:8181" },
  });
  assert.equal(validateRequestOrigin(same), null, "同源请求应放行（TOS 上否则所有配置保存 403）");

  const cross = new Request("http://192.168.124.57:8181/piagentfortos/api/models-config", {
    method: "PUT",
    headers: { origin: "http://evil.example", host: "192.168.124.57:8181" },
  });
  assert.equal(validateRequestOrigin(cross), "forbidden origin", "跨域写入必须继续拦截");

  const noOrigin = new Request("http://192.168.124.57:8181/piagentfortos/api/models-config", { method: "PUT" });
  assert.equal(validateRequestOrigin(noOrigin), null, "无 Origin 头（curl/桌面）保持兼容");
});

test("PI_ALLOWED_ORIGINS 白名单放行自定义域名", () => {
  assert.equal(isAllowedOrigin("http://custom.example.com:8181", ["http://custom.example.com:8181"]), true);
  assert.equal(isAllowedOrigin("http://custom.example.com:8181/", ["http://custom.example.com:8181"]), true);
  assert.equal(isAllowedOrigin("http://other.example.com", ["http://custom.example.com:8181"]), false);
  // 回环始终放行（桌面版/本地开发）
  assert.equal(isAllowedOrigin("http://127.0.0.1:30141"), true);
});

test("反代改写 Host 时：Origin 与 x-forwarded-host 一致 → 放行（2026-10-01 relay 实锤）", () => {
  // 场景：浏览器在 https://cavenhome3.t3.tnas.link，relay 把 Host 改写为内网地址
  const req = new Request("http://127.0.0.1:18141/piagentfortos/api/agent/abc", {
    method: "POST",
    headers: {
      origin: "https://cavenhome3.t3.tnas.link",
      host: "192.168.124.57:18141", // 与 Origin 不一致（旧实现因此 403 forbidden origin）
      "x-forwarded-host": "cavenhome3.t3.tnas.link",
    },
  });
  assert.equal(validateRequestOrigin(req), null, "应信任反代写入的 x-forwarded-host");
});

test("x-forwarded-host 是逗号链时取第一段", () => {
  const req = new Request("http://127.0.0.1:18141/x", {
    method: "POST",
    headers: {
      origin: "https://relay.example",
      host: "127.0.0.1:18141",
      "x-forwarded-host": "relay.example, inner.example",
    },
  });
  assert.equal(validateRequestOrigin(req), null);
});

test("Sec-Fetch-Site: same-origin 放行；same-site / cross-site 仍拦截", () => {
  const base = { origin: "https://relay.example", host: "127.0.0.1:18141" };
  const sameOrigin = new Request("http://127.0.0.1:18141/x", {
    method: "POST",
    headers: { ...base, "sec-fetch-site": "same-origin" },
  });
  assert.equal(validateRequestOrigin(sameOrigin), null, "浏览器自报同源应放行");

  const sameSite = new Request("http://127.0.0.1:18141/x", {
    method: "POST",
    headers: { ...base, "sec-fetch-site": "same-site" },
  });
  assert.equal(
    validateRequestOrigin(sameSite),
    "forbidden origin",
    "same-site 不放行（*.tnas.link 同 site，攻击者可借同 site 子域发命令）",
  );

  const crossSite = new Request("http://127.0.0.1:18141/x", {
    method: "POST",
    headers: { ...base, "sec-fetch-site": "cross-site" },
  });
  assert.equal(validateRequestOrigin(crossSite), "forbidden origin");
});

test("既无 x-forwarded-host 也无 same-origin 信号时，跨域仍被拦", () => {
  const req = new Request("http://127.0.0.1:18141/x", {
    method: "POST",
    headers: { origin: "https://evil.example", host: "127.0.0.1:18141" },
  });
  assert.equal(validateRequestOrigin(req), "forbidden origin");
});
