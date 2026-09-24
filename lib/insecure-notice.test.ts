import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHttpsUrl,
  shouldShowInsecureNotice,
  DEFAULT_TOS_HTTPS_PORT,
} from "./insecure-notice.ts";

test("buildHttpsUrl：TOS 明文地址 → 同路径的 HTTPS 地址", () => {
  // 真机实测：https://<NAS>:5443/<appid>/ → 200（443 会 301 到这里）
  assert.equal(
    buildHttpsUrl({
      protocol: "http:",
      hostname: "192.168.124.57",
      port: "8181",
      pathname: "/piagentfortos/",
    }),
    `https://192.168.124.57:${DEFAULT_TOS_HTTPS_PORT}/piagentfortos/`,
  );
});

test("buildHttpsUrl：已是 HTTPS → 不提示（null）", () => {
  assert.equal(
    buildHttpsUrl({
      protocol: "https:",
      hostname: "nas.local",
      port: "5443",
      pathname: "/piagentfortos/",
    }),
    null,
  );
});

test("buildHttpsUrl：回环地址 → null（本身即安全上下文）", () => {
  for (const hostname of ["localhost", "127.0.0.1", "[::1]", "::1"]) {
    assert.equal(
      buildHttpsUrl({ protocol: "http:", hostname, port: "30141", pathname: "/" }),
      null,
      hostname,
    );
  }
});

test("buildHttpsUrl：空 hostname → null（畸形 location 不该生成坏链接）", () => {
  assert.equal(
    buildHttpsUrl({ protocol: "http:", hostname: "", port: "", pathname: "/" }),
    null,
  );
});

test("buildHttpsUrl：端口可覆盖，且空端口不产生多余冒号", () => {
  const loc = {
    protocol: "http:",
    hostname: "192.168.124.57",
    port: "8181",
    pathname: "/piagentfortos/",
  };
  assert.equal(buildHttpsUrl(loc, "8443"), "https://192.168.124.57:8443/piagentfortos/");
  assert.equal(buildHttpsUrl(loc, ""), "https://192.168.124.57/piagentfortos/");
});

test("shouldShowInsecureNotice：明文 HTTP + 未关闭 → 展示", () => {
  assert.equal(
    shouldShowInsecureNotice({ secureContext: false, runtimeTag: "tos", dismissed: false }),
    true,
  );
});

test("shouldShowInsecureNotice：安全上下文 / 桌面版 / 已关闭 → 都不展示", () => {
  assert.equal(
    shouldShowInsecureNotice({ secureContext: true, runtimeTag: "tos", dismissed: false }),
    false,
  );
  assert.equal(
    shouldShowInsecureNotice({ secureContext: false, runtimeTag: "electron", dismissed: false }),
    false,
  );
  assert.equal(
    shouldShowInsecureNotice({ secureContext: false, runtimeTag: "tos", dismissed: true }),
    false,
  );
});
