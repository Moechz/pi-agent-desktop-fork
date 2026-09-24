import test from "node:test";
import assert from "node:assert/strict";
import {
  TICK_PITCH,
  buildRackLayout,
  entryIndexForTick,
  ratioForTick,
  tickIndexAtY,
  tickTopPx,
} from "./minimap-ticks.ts";

test("固定节距：条目越多刻度越多，间距恒定不变（旧版“均匀分配”已废弃）", () => {
  const few = buildRackLayout({ entryCount: 4, railHeight: 200 });
  const many = buildRackLayout({ entryCount: 400, railHeight: 200 });

  assert.equal(few.pitch, TICK_PITCH);
  assert.equal(many.pitch, TICK_PITCH);
  assert.equal(few.pitch, many.pitch, "节距必须与条目数无关");

  // 相邻刻度中心间距恒等于节距（无论条目多少）
  for (const layout of [few, many]) {
    assert.equal(tickTopPx(1, layout) - tickTopPx(0, layout), TICK_PITCH);
    assert.equal(tickTopPx(3, layout) - tickTopPx(2, layout), TICK_PITCH);
  }

  assert.equal(few.totalHeight, 4 * TICK_PITCH);
  assert.equal(many.count, 400, "刻度数随后条目增加（不采样、不压缩）");
  assert.equal(many.totalHeight, 400 * TICK_PITCH);
});

test("放得下时整条刻度架垂直居中（而不是从顶部铺满）", () => {
  const layout = buildRackLayout({ entryCount: 4, railHeight: 200 }); // 总高 36
  assert.equal(layout.offset, Math.round((200 - 36) / 2)); // 82
  const firstCenter = tickTopPx(0, layout) + layout.pitch / 2;
  const lastCenter = tickTopPx(3, layout) + layout.pitch / 2;
  assert.equal(firstCenter, 200 - lastCenter, "上下留白对称 = 居中");
});

test("放不下时跟随阅读位置：当前刻度始终靠近轨道中心", () => {
  const railHeight = 200;
  const count = 400;
  for (const activeRatio of [0, 0.25, 0.5, 0.75, 1]) {
    const layout = buildRackLayout({ entryCount: count, railHeight, activeRatio });
    const activeIndex = Math.round(activeRatio * (count - 1));
    const center = tickTopPx(activeIndex, layout) + layout.pitch / 2;
    if (activeRatio > 0 && activeRatio < 1) {
      assert.ok(
        Math.abs(center - railHeight / 2) <= layout.pitch,
        `activeRatio=${activeRatio} 时当前刻度应靠近中心，实际 ${center}`,
      );
    }
    // 两端不得滑出空白
    assert.ok(layout.offset <= 0, "偏移不得为正（顶部不留空）");
    assert.ok(
      layout.offset >= railHeight - layout.totalHeight,
      "偏移不得超界（底部不留空）",
    );
  }
});

test("可见区间：只渲染轨道内的刻度，且覆盖整条轨道", () => {
  const layout = buildRackLayout({ entryCount: 400, railHeight: 200, activeRatio: 0.5 });
  assert.ok(layout.firstVisible >= 0 && layout.lastVisible < layout.count);
  assert.ok(layout.firstVisible < layout.lastVisible, "可见区间非空");
  // 区间必须完整覆盖轨道（否则会看到空档）
  assert.ok(tickTopPx(layout.firstVisible, layout) <= 0 + layout.pitch);
  assert.ok(
    tickTopPx(layout.lastVisible, layout) >= 200 - 2 * layout.pitch,
    "最后一个可见刻度必须贴近轨道底部",
  );
  // 极端比例下区间仍在合法范围内
  const top = buildRackLayout({ entryCount: 400, railHeight: 200, activeRatio: 0 });
  assert.ok(top.firstVisible >= 0 && top.lastVisible < 400);
});

test("命中判定：刻度中心命中自己，越界钳制，非法输入返回 null", () => {
  const layout = buildRackLayout({ entryCount: 400, railHeight: 200, activeRatio: 0.5 });
  for (const index of [layout.firstVisible, layout.lastVisible]) {
    const y = tickTopPx(index, layout) + layout.pitch / 2;
    assert.equal(tickIndexAtY(y, layout), index);
  }
  assert.equal(tickIndexAtY(-9999, layout), 0, "上越界钳到第一根");
  assert.equal(tickIndexAtY(9999, layout), layout.count - 1, "下越界钳到最后一根");
  assert.equal(tickIndexAtY(Number.NaN, layout), null);
  const empty = buildRackLayout({ entryCount: 0, railHeight: 200 });
  assert.equal(tickIndexAtY(10, empty), null);
});

test("空会话与非法入参不崩", () => {
  const empty = buildRackLayout({ entryCount: 0, railHeight: 200 });
  assert.deepEqual(empty, {
    count: 0,
    pitch: TICK_PITCH,
    totalHeight: 0,
    offset: 0,
    firstVisible: 0,
    lastVisible: -1,
  });
  const noRail = buildRackLayout({ entryCount: 10, railHeight: 0 });
  assert.equal(noRail.count, 10);
  assert.equal(noRail.offset, 0);
  const bogus = buildRackLayout({ entryCount: Number.NaN, railHeight: Number.NaN });
  assert.equal(bogus.count, 0);
  assert.equal(buildRackLayout({ entryCount: -5, railHeight: 100 }).count, 0);
});

test("刻度 ↔ 条目 ↔ 跳转比例的一一映射", () => {
  const layout = buildRackLayout({ entryCount: 11, railHeight: 200 });
  assert.equal(entryIndexForTick(0, layout), 0);
  assert.equal(entryIndexForTick(10, layout), 10);
  assert.equal(entryIndexForTick(99, layout), 10, "越界刻度钳到最后一个条目");
  assert.equal(ratioForTick(0, layout), 0);
  assert.equal(ratioForTick(10, layout), 1);
  assert.equal(ratioForTick(5, layout), 0.5);
});
