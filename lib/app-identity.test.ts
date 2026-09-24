import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  APP_NAME,
  DESKTOP_APP_NAME,
  TOS_APP_NAME,
  resolveAppName,
} from "./app-identity.ts";

test("resolveAppName：桌面构建（无 basePath）用桌面名", () => {
  assert.equal(resolveAppName(""), DESKTOP_APP_NAME);
  assert.equal(resolveAppName(""), "Pi Agent Desktop");
});

test("resolveAppName：TOS 构建（有 basePath）用商店名", () => {
  assert.equal(resolveAppName("/piagentfortos"), TOS_APP_NAME);
  assert.equal(resolveAppName("/piagentfortos"), "Pi Agent for TOS");
});

test("当前构建（测试环境无 basePath）取桌面名", () => {
  assert.equal(APP_NAME, DESKTOP_APP_NAME);
});

test("应用内名称与应用中心显示名一致（防再次漂移）", () => {
  // 用户反馈过：TOS 版浏览器标签页/侧边栏仍显示桌面版名字，与应用中心登记名不符。
  // 以 gen-lang.py 的 NAME 作为商店显示名的唯一事实源做交叉校验。
  const genLang = readFileSync("tos/gen-lang.py", "utf8");
  const match = /^NAME\s*=\s*"([^"]+)"/m.exec(genLang);
  assert.ok(match, "tos/gen-lang.py 应定义 NAME 常量");
  assert.equal(TOS_APP_NAME, match[1]);
});
