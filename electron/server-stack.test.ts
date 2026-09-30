import test from "node:test";
import assert from "node:assert/strict";
import {
  SERVER_STACK_SIZE_ARG,
  SERVER_STACK_SIZE_KB,
  SERVER_STACK_SIZE_MAX_SAFE_KB,
} from "./server-stack.ts";

test("栈参数不超过安全上界（Windows/Linux 栈保留 8MB：16384 会静默秒崩，退出码 0x80000003）", () => {
  assert.ok(
    SERVER_STACK_SIZE_KB <= SERVER_STACK_SIZE_MAX_SAFE_KB,
    `SERVER_STACK_SIZE_KB=${SERVER_STACK_SIZE_KB} 超过安全上界 ${SERVER_STACK_SIZE_MAX_SAFE_KB}：` +
      "Windows/Linux 下会让内置服务在 V8 初始化阶段越界终止（表现为「启动失败」）",
  );
  assert.equal(SERVER_STACK_SIZE_ARG, `--stack-size=${SERVER_STACK_SIZE_KB}`);
});

test("仍显著高于 V8 默认栈（~984KB）—— 保留「深树序列化不爆栈」的初衷", () => {
  assert.ok(SERVER_STACK_SIZE_KB >= 4096, "栈参数过小会丢掉原有的防爆栈收益");
});

test("明确禁止 16384（同事在 Windows 23H2 上实测必崩的那个值）", () => {
  assert.notEqual(SERVER_STACK_SIZE_KB, 16384);
  assert.ok(!SERVER_STACK_SIZE_ARG.endsWith("=16384"));
});
