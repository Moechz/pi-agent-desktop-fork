import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { versionedIconUrl } from "./app-icons.ts";

function tempIcons(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-icons-"));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body);
  }
  return dir;
}

test("图标 URL 带内容哈希，且内容不同则 URL 不同", () => {
  // 背景：Safari 会按站点长期缓存网站图标（重启浏览器都不刷新）。
  // 用内容哈希做 URL 版本，才能保证图标一改、浏览器必然重新拉取。
  const dir = tempIcons({ "a.png": "AAA", "b.png": "BBB" });
  const a = versionedIconUrl({ file: "a.png", publicDir: dir });
  const b = versionedIconUrl({ file: "b.png", publicDir: dir });
  assert.match(a, /^\/a\.png\?v=[0-9a-f]{8}$/);
  assert.notEqual(a, b, "内容不同必须得到不同的 URL");
});

test("内容不变则 URL 稳定（避免每次构建都强迫用户重下图标）", () => {
  const dir = tempIcons({ "a.png": "SAME" });
  assert.equal(
    versionedIconUrl({ file: "a.png", publicDir: dir }),
    versionedIconUrl({ file: "a.png", publicDir: dir }),
  );
});

test("子路径部署时带上站点前缀（TOS）", () => {
  const dir = tempIcons({ "a.png": "AAA" });
  const url = versionedIconUrl({ file: "a.png", publicDir: dir, basePath: "/piagentfortos" });
  assert.match(url, /^\/piagentfortos\/a\.png\?v=[0-9a-f]{8}$/);
});

test("仓库里三个图标文件齐备且能算出 URL", () => {
  for (const file of ["pi-agent-icon.png", "pi-agent-touch-icon.png", "pi-agent-favicon.ico"]) {
    assert.ok(existsSync(join(process.cwd(), "public", file)), `${file} 应存在于 public/`);
    assert.match(
      versionedIconUrl({ file, basePath: "/piagentfortos" }),
      new RegExp(`^/piagentfortos/${file.replace(".", "\\.")}\\?v=[0-9a-f]{8}$`),
    );
  }
});
