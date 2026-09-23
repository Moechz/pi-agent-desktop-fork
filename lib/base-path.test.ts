import test from "node:test";
import assert from "node:assert/strict";

/**
 * base-path 模块在导入时读取 env（模拟 Next 构建期注入），
 * 因此用带 query 的动态 import 拿到独立实例；用变量 specifier 避免 tsc 解析失败。
 */
type BasePathModule = typeof import("./base-path.ts");
const loadModule = (tag: string): Promise<BasePathModule> =>
  import(/* webpackIgnore: true */ `./base-path.ts?case=${tag}`) as Promise<BasePathModule>;

test("桌面构建（空前缀）：所有路径行为与改造前一致", async () => {
  delete process.env.NEXT_PUBLIC_BASE_PATH;
  const mod = await loadModule("empty");
  assert.equal(mod.BASE_PATH, "");
  assert.equal(mod.withBasePath("/api/sessions"), "/api/sessions");
  assert.equal(mod.withBasePath("/_next/static/x.js"), "/_next/static/x.js");
  assert.equal(mod.withBasePath("/pi-logo.png"), "/pi-logo.png");
});

test("TOS 构建（有前缀）：补前缀、幂等、绝对 URL 不受影响", async () => {
  process.env.NEXT_PUBLIC_BASE_PATH = "/piagentfortos";
  try {
    const mod = await loadModule("prefix");
    assert.equal(mod.BASE_PATH, "/piagentfortos");
    assert.equal(mod.withBasePath("/api/sessions"), "/piagentfortos/api/sessions");
    assert.equal(mod.withBasePath("/api/files/a%2Fb?type=read"), "/piagentfortos/api/files/a%2Fb?type=read");
    // 幂等：已带前缀不重复添加
    assert.equal(mod.withBasePath("/piagentfortos/api/x"), "/piagentfortos/api/x");
    assert.equal(mod.withBasePath("/piagentfortos"), "/piagentfortos");
    // 非站内路径原样返回
    assert.equal(mod.withBasePath("api/x"), "api/x");
    assert.equal(mod.withBasePath("//cdn.example.com/x"), "//cdn.example.com/x");
    assert.equal(mod.withBasePath("https://example.com/x"), "https://example.com/x");
  } finally {
    delete process.env.NEXT_PUBLIC_BASE_PATH;
  }
});

test("前缀末尾多余斜杠会被规范化", async () => {
  process.env.NEXT_PUBLIC_BASE_PATH = "/piagentfortos/";
  try {
    const mod = await loadModule("trailing");
    assert.equal(mod.BASE_PATH, "/piagentfortos");
    assert.equal(mod.withBasePath("/api/x"), "/piagentfortos/api/x");
  } finally {
    delete process.env.NEXT_PUBLIC_BASE_PATH;
  }
});
