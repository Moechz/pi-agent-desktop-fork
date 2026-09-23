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
