import test from "node:test";
import assert from "node:assert/strict";
import { randomId } from "./random-id.ts";

test("randomId：优先用 crypto.randomUUID（安全上下文）", () => {
  const id = randomId({ randomUUID: () => "11111111-2222-4333-8444-555555555555" });
  assert.equal(id, "11111111-2222-4333-8444-555555555555");
});

test("randomId：无 randomUUID 时退化到 getRandomValues（明文 HTTP 可用）", () => {
  const id = randomId({ getRandomValues: (arr) => { arr.fill(0xab); return arr; } });
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("randomId：crypto 完全不可用也不抛（TOS 明文 HTTP 场景）", () => {
  const id = randomId(undefined);
  assert.ok(id.length > 8);
  assert.notEqual(id, randomId(undefined), "两次调用不应相同");
});

test("randomId：randomUUID 抛异常时自动兜底", () => {
  const id = randomId({ randomUUID: () => { throw new Error("blocked by policy"); } });
  assert.ok(id.length > 8);
});
