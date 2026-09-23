import test from "node:test";
import assert from "node:assert/strict";
import {
  breadcrumbTosPath,
  isPlausibleTosPath,
  isVolumeRoot,
  joinTosPath,
  normalizeTosPath,
  parentTosPath,
} from "./tos-path.ts";

test("normalizeTosPath 折叠斜杠、去尾斜杠、补前导斜杠", () => {
  assert.equal(normalizeTosPath("/Volume1/public"), "/Volume1/public");
  assert.equal(normalizeTosPath("/Volume1/public/"), "/Volume1/public");
  assert.equal(normalizeTosPath("/Volume1///public"), "/Volume1/public");
  assert.equal(normalizeTosPath("Volume1/public"), "/Volume1/public");
  assert.equal(normalizeTosPath("/"), "/");
  assert.equal(normalizeTosPath(""), "/");
  assert.equal(normalizeTosPath("   "), "/");
});

test("parentTosPath 逐级上溯，根处保持根", () => {
  assert.equal(parentTosPath("/Volume1/public/proj"), "/Volume1/public");
  assert.equal(parentTosPath("/Volume1"), "/");
  assert.equal(parentTosPath("/"), "/");
  assert.equal(parentTosPath("/Volume1/public/"), "/Volume1");
});

test("joinTosPath 拼接子项并容错", () => {
  assert.equal(joinTosPath("/Volume1", "public"), "/Volume1/public");
  assert.equal(joinTosPath("/", "Volume1"), "/Volume1");
  assert.equal(joinTosPath("/Volume1/public", "  proj  "), "/Volume1/public/proj");
  assert.equal(joinTosPath("/Volume1/public", "/name"), "/Volume1/public/name");
  assert.equal(joinTosPath("/Volume1/public", ""), "/Volume1/public");
});

test("breadcrumbTosPath 生成从根到当前的层级", () => {
  assert.deepEqual(breadcrumbTosPath("/Volume1/public/proj"), [
    { label: "/", path: "/" },
    { label: "Volume1", path: "/Volume1" },
    { label: "public", path: "/Volume1/public" },
    { label: "proj", path: "/Volume1/public/proj" },
  ]);
  assert.deepEqual(breadcrumbTosPath("/"), [{ label: "/", path: "/" }]);
});

test("isVolumeRoot 与路径合法性粗检", () => {
  assert.equal(isVolumeRoot("/Volume1"), true);
  assert.equal(isVolumeRoot("/Volume1/"), true);
  assert.equal(isVolumeRoot("/Volume1/public"), false);
  assert.equal(isPlausibleTosPath("/Volume1/public"), true);
  assert.equal(isPlausibleTosPath("/Volume1/../etc"), false);
  assert.equal(isPlausibleTosPath("/Volume1/./x"), false);
});
