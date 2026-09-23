import test from "node:test";
import assert from "node:assert/strict";
import { buildTickLayout, entryIndexFor, tickIndexAt, tickTopPct } from "./minimap-ticks.ts";

test("条目少时 1:1 对应，槽位等分且刻度居中", () => {
  const layout = buildTickLayout(4);
  assert.equal(layout.count, 4);
  assert.equal(layout.step, 1);
  assert.equal(layout.slotPct, 25);
  // 均匀分布：相邻刻度的中心间距恒等于槽高
  const tops = [0, 1, 2, 3].map((i) => tickTopPct(i, layout));
  assert.deepEqual(tops, [12.5, 37.5, 62.5, 87.5]);
});

test("条目过多时采样，刻度数不超过上限", () => {
  const layout = buildTickLayout(1000, 120);
  assert.equal(layout.step, 9);           // ceil(1000/120) = 9
  assert.equal(layout.count, 112);        // ceil(1000/9)
  assert.ok(layout.count <= 120, "刻度数必须 <= 上限");
  assert.ok(layout.slotPct > 0);
});

test("鼠标位置 → 刻度序号：每个槽位唯一命中且越界钳制", () => {
  const layout = buildTickLayout(4); // 槽高 25%
  assert.equal(tickIndexAt(0.0, layout), 0);
  assert.equal(tickIndexAt(0.24, layout), 0);
  assert.equal(tickIndexAt(0.26, layout), 1);
  assert.equal(tickIndexAt(0.51, layout), 2);
  assert.equal(tickIndexAt(1, layout), 3);   // 下边界钳到最后一根
  assert.equal(tickIndexAt(-5, layout), 0);  // 上越界
  assert.equal(tickIndexAt(Number.NaN, layout), null);
});

test("空会话与非法入参不崩", () => {
  const empty = buildTickLayout(0);
  assert.deepEqual(empty, { count: 0, step: 1, slotPct: 100 });
  assert.equal(tickIndexAt(0.5, empty), null);
  assert.deepEqual(buildTickLayout(Number.NaN), { count: 0, step: 1, slotPct: 100 });
  assert.equal(buildTickLayout(-3).count, 0);
});

test("刻度序号映射到消息条目：1:1 与采样两种模式", () => {
  const one = buildTickLayout(4);
  assert.equal(entryIndexFor(0, one, 4), 0);
  assert.equal(entryIndexFor(3, one, 4), 3);

  const sampled = buildTickLayout(10, 5);   // step=2, count=5
  assert.equal(sampled.step, 2);
  assert.equal(entryIndexFor(0, sampled, 10), 1);
  assert.equal(entryIndexFor(4, sampled, 10), 9);   // 最后一组取最后一条
  // 越界刻度不会越出消息数组
  assert.equal(entryIndexFor(99, sampled, 10), 9);
});
