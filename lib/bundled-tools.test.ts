import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installBundledTools, platformDirName } from "./bundled-tools.ts";

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

const binaryName = (tool: string) => (process.platform === "win32" ? `${tool}.exe` : tool);

test("installBundledTools 把当前平台二进制复制到 pi 工具目录", () => {
  const src = tempDir("pi-bundled-src-");
  const dst = tempDir("pi-bundled-dst-");
  const dir = join(src, platformDirName());
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, binaryName("rg")), "fake-rg");
  writeFileSync(join(dir, binaryName("fd")), "fake-fd");

  const result = installBundledTools(dst, [src]);

  assert.deepEqual(result.installed.sort(), [binaryName("fd"), binaryName("rg")].sort());
  assert.equal(readFileSync(join(dst, binaryName("rg")), "utf8"), "fake-rg");
  assert.equal(readFileSync(join(dst, binaryName("fd")), "utf8"), "fake-fd");
  if (process.platform !== "win32") {
    assert.ok((statSync(join(dst, binaryName("rg"))).mode & 0o100) !== 0, "应设置可执行位");
  }
});

test("installBundledTools 幂等：不覆盖用户已升级的二进制", () => {
  const src = tempDir("pi-bundled-src-");
  const dst = tempDir("pi-bundled-dst-");
  const dir = join(src, platformDirName());
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, binaryName("rg")), "bundled-v1");

  assert.deepEqual(installBundledTools(dst, [src]).installed, [binaryName("rg")]);

  writeFileSync(join(dst, binaryName("rg")), "user-newer");
  assert.deepEqual(installBundledTools(dst, [src]).installed, []);
  assert.equal(readFileSync(join(dst, binaryName("rg")), "utf8"), "user-newer");
});

test("installBundledTools 忽略不含当前平台目录的来源", () => {
  const src = tempDir("pi-bundled-src-");
  const dst = tempDir("pi-bundled-dst-");
  mkdirSync(join(src, "plan9-mips"), { recursive: true });
  assert.deepEqual(installBundledTools(dst, [src]).installed, []);
  assert.equal(existsSync(join(dst, binaryName("rg"))), false);
});

test("installBundledTools 命中多个来源时只用第一个含该平台目录者", () => {
  const first = tempDir("pi-bundled-first-");
  const second = tempDir("pi-bundled-second-");
  const dst = tempDir("pi-bundled-dst-");
  mkdirSync(join(second, platformDirName()), { recursive: true });
  writeFileSync(join(second, platformDirName(), binaryName("rg")), "from-second");

  const result = installBundledTools(dst, [first, second]);
  assert.deepEqual(result.installed, [binaryName("rg")]);
  assert.equal(readFileSync(join(dst, binaryName("rg")), "utf8"), "from-second");
});
