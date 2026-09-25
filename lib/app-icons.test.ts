import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ICON_BASES, iconHashMatches, iconUrl, resolveIconFile } from "./app-icons.ts";

test("图标 URL 不带查询串（Safari 不认带 ? 的图标），且带站点前缀", () => {
  const url = iconUrl({ ...ICON_BASES.favicon, basePath: "/piagentfortos" });
  assert.match(url, /^\/piagentfortos\/pi-agent-favicon-[0-9a-f]{8}\.ico$/);
  assert.ok(!url.includes("?"), "URL 不得带查询串");
});

test("三个图标都能解析出唯一文件，且文件名哈希与内容一致", () => {
  for (const spec of Object.values(ICON_BASES)) {
    const file = resolveIconFile(spec.base, spec.ext);
    assert.match(file, new RegExp(`^${spec.base}-[0-9a-f]{8}\\.${spec.ext}$`));
    assert.ok(iconHashMatches(file), `${file} 的哈希与内容不符：改了图标必须同时改文件名`);
  }
});

test("文件名哈希与内容绑定：换成别的哈希即判为不匹配（守卫生效）", () => {
  const file = resolveIconFile(ICON_BASES.icon.base, ICON_BASES.icon.ext);
  assert.ok(iconHashMatches(file), "真实文件名应与内容匹配");
  const wrong = file.replace(/-([0-9a-f]{8})\./, "-deadbeef.");
  assert.notEqual(wrong, file);
  assert.equal(iconHashMatches(wrong), false, "哈希不符（或文件不存在）必须判为不匹配");
  assert.equal(iconHashMatches("no-hash-here.png"), false, "没有哈希的文件名一律不匹配");
});

test("TOS 落地页引用的图标确实存在（避免落地页显示破图）", () => {
  const html = readFileSync(join(process.cwd(), "tos", "assets", "index.html"), "utf8");
  const href = /<link[^>]+rel="icon"[^>]+href="([^"]+)"/.exec(html)?.[1];
  assert.ok(href, "落地页应声明图标");
  assert.ok(!href.startsWith("/"), "落地页用相对路径，随 APP_ID 前缀自适应");
  assert.ok(
    readFileSync(join(process.cwd(), "public", href)) !== undefined,
    `落地页引用的 ${href} 应存在于 public/`,
  );
});
