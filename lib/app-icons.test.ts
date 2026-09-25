import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ICON_FILES, iconUrl, type IconKind } from "./app-icons.ts";

const PUBLIC = join(process.cwd(), "public");

function contentHash(file: string): string {
  return createHash("sha256").update(readFileSync(join(PUBLIC, file))).digest("hex").slice(0, 8);
}

test("图标 URL 无查询串（Safari 不认带 ? 的图标）并带站点前缀", () => {
  const url = iconUrl("favicon", "/piagentfortos");
  assert.match(url, /^\/piagentfortos\/pi-agent-favicon-[0-9a-f]{8}\.ico$/);
  assert.ok(!url.includes("?"), "URL 不得带查询串");
});

test("每个图标文件都存在，且文件名里的哈希与文件内容一致", () => {
  for (const [kind, file] of Object.entries(ICON_FILES) as [IconKind, string][]) {
    assert.ok(existsSync(join(PUBLIC, file)), `${kind}: public/${file} 不存在`);
    const embedded = /-([0-9a-f]{8})\.(png|ico)$/.exec(file)?.[1];
    assert.ok(embedded, `${kind}: 文件名应含 8 位内容哈希 —— ${file}`);
    assert.equal(
      embedded,
      contentHash(file),
      `${kind}: 图标内容变了必须同时改名（${file}）`,
    );
  }
});

test("TOS 落地页引用的图标真实存在", () => {
  const html = readFileSync(join(process.cwd(), "tos", "assets", "index.html"), "utf8");
  const href = /<link[^>]+rel="icon"[^>]+href="([^"]+)"/.exec(html)?.[1];
  assert.ok(href, "落地页应声明图标");
  assert.ok(!href.startsWith("/"), "落地页用相对路径，随 APP_ID 前缀自适应");
  assert.ok(existsSync(join(PUBLIC, href)), `public/${href} 应存在`);
});
