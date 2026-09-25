import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflow = readFileSync(
  join(root, ".github/workflows/desktop-packages.yml"),
  "utf8",
).replace(/\r\n/g, "\n");

test("desktop package workflow builds three hosts on v* tags", () => {
  assert.match(workflow, /^name: Desktop packages/m);
  assert.match(workflow, /tags:\n\s+- "v\*"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /runner: windows-latest/);
  assert.match(workflow, /runner: ubuntu-latest/);
  assert.match(workflow, /runner: macos-latest/);
  assert.match(workflow, /dist_script: dist\n/);
  assert.match(workflow, /dist_script: dist:mac/);
  assert.match(workflow, /npm run \$\{\{ matrix\.dist_script \}\}/);
  assert.doesNotMatch(workflow, /npm run release/);
  // 不再禁止签名：未签名的 macOS 包会被系统认成通用 “Electron”，
  // 导致 TCC（“访问其他 App 的数据”）授权无法绑定稳定身份、弹窗反复出现（真机实测）。
  assert.doesNotMatch(workflow, /CSC_IDENTITY_AUTO_DISCOVERY:\s*"false"/);
  assert.match(workflow, /ad-hoc/);
  assert.match(workflow, /sudo apt-get install -y fakeroot dpkg/);
});

test("desktop package workflow uploads GitHub Release assets only on tags", () => {
  assert.match(workflow, /if: startsWith\(github\.ref, 'refs\/tags\/v'\)/);
  assert.match(workflow, /gh release upload/);
  assert.match(workflow, /permissions:\n\s+contents: write/);
  assert.match(workflow, /latest-linux\.yml/);
  assert.match(workflow, /latest-mac\.yml/);
  assert.match(workflow, /mac-universal\.dmg/);
  assert.doesNotMatch(workflow, /electron-builder --publish always/);
});

test("macOS 打包必须做稳定身份签名（否则 TCC 授权反复弹窗）", () => {
  const builder = readFileSync("electron-builder.yml", "utf8");
  assert.match(builder, /identity:\s*"-"/, "需 ad-hoc 签名，使身份固定为 appId");
  assert.doesNotMatch(builder, /signAndEditExecutable:\s*false/, "不得禁用可执行文件签名/改名");
});

test("工作流不得出现空的 env 块（GitHub 会因解析失败而不运行该工作流）", () => {
  // 真机教训：把 env 里唯一一行删掉后留下空 `env:` 键，GitHub 报
  // “failed to parse workflow: Unexpected value ''” → v0.8.8-7 的构建根本没被触发。
  for (const name of ["desktop-packages", "tos-packages"]) {
    const text = readFileSync(join(root, ".github/workflows", `${name}.yml`), "utf8");
    const emptyBlock = /^env:\s*$(?!\n\s{2}\S)/m.test(text) || /^\s{2}env:\s*$(?!\n\s{4}\S)/m.test(text);
    assert.ok(!emptyBlock, `${name}.yml 存在空的 env 块`);
  }
});
