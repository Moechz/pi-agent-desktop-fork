import test from "node:test";
import assert from "node:assert/strict";

import {
  ADDED_DIRS_KEY,
  ADDED_DIRS_CAP,
  HIDDEN_DIRS_KEY,
  readStringList,
  writeStringList,
  mergeAddedDirs,
  rememberAddedDir,
  forgetAddedDir,
  persistRemembered,
  persistForgotten,
  type StorageLike,
} from "./added-dirs.ts";

/** 测试用内存存储 */
function fakeStorage(init: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

test("readStringList：无值/损坏 JSON/非数组/混入非字符串都能安全降级", () => {
  const s = fakeStorage({
    empty: "[]",
    broken: "{not json",
    notArray: '{"a":1}',
    mixed: '["/a", 3, null, "", "/b"]',
  });
  assert.deepEqual(readStringList(s, "missing"), []);
  assert.deepEqual(readStringList(s, "empty"), []);
  assert.deepEqual(readStringList(s, "broken"), []);
  assert.deepEqual(readStringList(s, "notArray"), []);
  assert.deepEqual(readStringList(s, "mixed"), ["/a", "/b"]);
  assert.deepEqual(readStringList(null, "anything"), []);
});

test("writeStringList：null 存储时静默、setItem 抛错也不冒泡", () => {
  writeStringList(null, "k", ["/a"]);
  const throwing: StorageLike = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  writeStringList(throwing, "k", ["/a"]); // 不应抛出
  const s = fakeStorage();
  writeStringList(s, "k", ["/a", "/b"]);
  assert.equal(s.data.k, '["/a","/b"]');
});

test("mergeAddedDirs：手动添加在前、会话目录在后，去重且剔除已移除项", () => {
  const merged = mergeAddedDirs({
    stored: ["/manual/one", "/shared"],
    sessionDirs: ["/session/recent", "/shared", "/session/old"],
    hidden: [],
  });
  assert.deepEqual(merged, ["/manual/one", "/shared", "/session/recent", "/session/old"]);

  const withHidden = mergeAddedDirs({
    stored: ["/manual/one", "/shared"],
    sessionDirs: ["/session/recent", "/shared"],
    hidden: ["/shared", "/session/recent"],
  });
  assert.deepEqual(withHidden, ["/manual/one"]);
});

test("mergeAddedDirs：cap 截断且不产生空项", () => {
  const stored = Array.from({ length: 5 }, (_, i) => `/s${i}`);
  const sessionDirs = Array.from({ length: 5 }, (_, i) => `/d${i}`);
  assert.deepEqual(mergeAddedDirs({ stored, sessionDirs, hidden: [], cap: 3 }), ["/s0", "/s1", "/s2"]);
  assert.equal(mergeAddedDirs({ stored, sessionDirs, hidden: [] }).length, 10);
  assert.deepEqual(mergeAddedDirs({ stored: ["", "/a"], sessionDirs: [""], hidden: [] }), ["/a"]);
  assert.equal(ADDED_DIRS_CAP, 50);
});

test("rememberAddedDir：追加不重复、超出上限丢最旧、并解除隐藏", () => {
  assert.deepEqual(rememberAddedDir(["/a"], [], "/b"), { stored: ["/a", "/b"], hidden: [] });
  assert.deepEqual(rememberAddedDir(["/a"], [], "/a"), { stored: ["/a"], hidden: [] });
  const trimmed = rememberAddedDir(["/a", "/b"], [], "/c", 2);
  assert.deepEqual(trimmed.stored, ["/b", "/c"]);
  assert.deepEqual(rememberAddedDir(["/a"], ["/a", "/x"], "/a").hidden, ["/x"]);
  assert.deepEqual(rememberAddedDir(["/a"], [], "").stored, ["/a"]);
});

test("forgetAddedDir：从手动表删除并记入隐藏表（幂等、有上限）", () => {
  assert.deepEqual(forgetAddedDir(["/a", "/b"], [], "/a"), { stored: ["/b"], hidden: ["/a"] });
  assert.deepEqual(forgetAddedDir(["/b"], ["/a"], "/a"), { stored: ["/b"], hidden: ["/a"] });
  const capped = forgetAddedDir([], ["/1", "/2"], "/3", 2);
  assert.deepEqual(capped.hidden, ["/2", "/3"]);
});

test("典型用户流程：移除后列表不再显示（即便它来自会话目录），重新选中后恢复", () => {
  const s = fakeStorage();
  const sessionDirs = ["/proj/keep", "/proj/unwanted"];

  // 用户此前添加过两个目录
  persistRemembered(s, "/proj/keep");
  persistRemembered(s, "/proj/unwanted");
  const before = mergeAddedDirs({
    stored: readStringList(s, ADDED_DIRS_KEY),
    sessionDirs,
    hidden: readStringList(s, HIDDEN_DIRS_KEY),
  });
  assert.deepEqual(before, ["/proj/keep", "/proj/unwanted"]);

  // 移除 /proj/unwanted
  persistForgotten(s, "/proj/unwanted");
  const after = mergeAddedDirs({
    stored: readStringList(s, ADDED_DIRS_KEY),
    sessionDirs,
    hidden: readStringList(s, HIDDEN_DIRS_KEY),
  });
  assert.deepEqual(after, ["/proj/keep"]);
  assert.deepEqual(readStringList(s, ADDED_DIRS_KEY), ["/proj/keep"]);
  assert.deepEqual(readStringList(s, HIDDEN_DIRS_KEY), ["/proj/unwanted"]);

  // 它仍然有会话目录来源，但不显示 → 关键断言
  assert.ok(sessionDirs.includes("/proj/unwanted"));
  assert.ok(!after.includes("/proj/unwanted"));

  // 用户再次主动选中它 → 隐藏解除、重新出现在列表
  persistRemembered(s, "/proj/unwanted");
  const restored = mergeAddedDirs({
    stored: readStringList(s, ADDED_DIRS_KEY),
    sessionDirs,
    hidden: readStringList(s, HIDDEN_DIRS_KEY),
  });
  assert.deepEqual(restored, ["/proj/keep", "/proj/unwanted"]);
  assert.deepEqual(readStringList(s, HIDDEN_DIRS_KEY), []);
});

test("持久化对 null 存储（SSR/隐私模式）不抛错", () => {
  persistRemembered(null, "/a");
  persistForgotten(null, "/a");
});
