#!/usr/bin/env node
/**
 * 内置模型目录补丁（构建期执行，幂等）
 *
 * 背景：@earendil-works/pi-ai 0.84.3 的 deepseek 目录仍是旧 id `deepseek-v4-flash`；
 * 上游 0.86.1 已改名 `deepseek-flash`（DeepSeek V4.1 Flash）。本脚本把仓库内固化的
 * 上游目录数据（vendor/pi-ai/deepseek-0.86.1.json）写入 pi-ai 的运行时数据文件，
 * 使内置目录与线上一致（应用侧 app/api/models/route.ts 只保留 deepseek-flash）。
 *
 * 幂等：目标已含 deepseek-flash 时不做改动 → 将来升级 pi-ai 后本脚本自动失效（可删）。
 *
 * 用法：
 *   node scripts/patch-model-catalog.mjs                    # 打当前仓库的 node_modules
 *   node scripts/patch-model-catalog.mjs <standalone 根目录>  # 给已安装应用热打（免重编译）
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? process.cwd();
const target = join(
  root,
  "node_modules/@earendil-works/pi-ai/dist/providers/data/deepseek.json",
);
const source = join(here, "../vendor/pi-ai/deepseek-0.86.1.json");

if (!existsSync(target)) {
  console.log("patch-model-catalog: 目标无 pi-ai 目录文件，跳过");
  process.exit(0);
}
if (!existsSync(source)) {
  console.error("patch-model-catalog: 缺少 vendor/pi-ai/deepseek-0.86.1.json");
  process.exit(1);
}

const cur = JSON.parse(readFileSync(target, "utf8"));
const src = JSON.parse(readFileSync(source, "utf8"));
const group = cur["openai-completions"] ?? {};
const want = src["openai-completions"];

if (group["deepseek-flash"]) {
  console.log("patch-model-catalog: 已是新目录（含 deepseek-flash），跳过");
  process.exit(0);
}

cur["openai-completions"] = { ...want };
writeFileSync(target, `${JSON.stringify(cur, null, 2)}\n`);
console.log(`patch-model-catalog: 已更新 → ${Object.keys(want).join(", ")}`);
