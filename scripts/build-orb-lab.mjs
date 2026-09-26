#!/usr/bin/env node
/**
 * 生成「思考球实验室」静态页 public/orb-lab.html。
 *
 * 存在的理由：调球这件事是「看」出来的，不是想出来的。改一次 seed → build → 换装 → 刷新，
 * 一轮好几分钟，眼睛还记不住上一版。所以把真球（WebGPU）与降级球（CSS）并排放进一个页面，
 * 参数可实时拖动，满意了再把 seed / CSS 抄回源码。
 *
 * 关键：着色器与 seed **不复制**，一律从 components/liquid-orb-source.ts 抽取，
 * 保证实验页永远等于线上那份（源码一改，重新跑本脚本即可）。
 *
 * 用法：
 *   node scripts/build-orb-lab.mjs            # 生成 public/orb-lab.html
 *   node scripts/build-orb-lab.mjs --deploy   # 生成并复制到 TOS 运行时 public/
 *
 * 页面访问：<你的 TOS 地址>/piagentfortos/orb-lab.html
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const SOURCE = resolve(root, "components/liquid-orb-source.ts");
const GLOBALS_CSS = resolve(root, "app/globals.css");
const TEMPLATE = resolve(here, "orb-lab.template.html");
const OUT = resolve(root, "public/orb-lab.html");

/** 运行时 public 目录（TOS 部署）。--deploy 时才写。 */
const RUNTIME_PUBLIC = "/Volume1/@apps/piagentfortos/standalone/public";

const SHADER_RE = /export const LIQUID_ORB_SHADER = \/\* wgsl \*\/ `([\s\S]*?)`;/;
const SEED_RE = /export const LIQUID_ORB_UNIFORM_SEED = new Float32Array\(\[([\s\S]*?)\]\);/;

/** 从 globals.css 抽取降级球那段真实规则（从「降级球」注释到「运行时差异收敛区」前）。 */
function extractFallbackCss() {
  const css = readFileSync(GLOBALS_CSS, "utf8");
  const ruleAt = css.indexOf(".liquid-thinking-fallback {");
  if (ruleAt < 0) throw new Error("app/globals.css 里找不到 .liquid-thinking-fallback 规则");

  const endAnchor = css.indexOf("运行时差异收敛区", ruleAt);
  if (endAnchor < 0) throw new Error("app/globals.css 里找不到「运行时差异收敛区」锚点");
  // 锚点在注释里，往回退到该注释的开头，否则会切出一个没闭合的 /*
  const commentOpen = css.lastIndexOf("/*", endAnchor);
  const to = commentOpen > ruleAt ? commentOpen : endAnchor;

  // 顺带把规则上方那段说明注释一起带上（回退不超过 1200 字符）
  const commentStart = css.lastIndexOf("/*", ruleAt);
  const from = commentStart >= 0 && ruleAt - commentStart < 1200 ? commentStart : ruleAt;

  const block = css.slice(from, to).trim();
  if (!block.includes(".liquid-thinking-fallback .rim")) {
    throw new Error("抽出的降级球 CSS 不完整（缺少 .rim 层）——锚点或文件结构可能变了");
  }
  return block;
}

/** seed 的 float 数量由 WGSL 的 Uniforms 结构决定：32 标量 + 24 个 vec4。 */
const EXPECTED_FLOATS = 128;

function extract() {
  const source = readFileSync(SOURCE, "utf8");
  const shaderMatch = source.match(SHADER_RE);
  if (!shaderMatch) {
    throw new Error(`未能从 ${SOURCE} 抽出 LIQUID_ORB_SHADER（模板字面量格式变了？）`);
  }

  const seedMatch = source.match(SEED_RE);
  if (!seedMatch) {
    throw new Error(`未能从 ${SOURCE} 抽出 LIQUID_ORB_UNIFORM_SEED（格式变了？）`);
  }

  const numbers = seedMatch[1].match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? [];
  const seed = numbers.map(Number);
  if (seed.length !== EXPECTED_FLOATS) {
    throw new Error(
      `LIQUID_ORB_UNIFORM_SEED 解析出 ${seed.length} 个 float，期望 ${EXPECTED_FLOATS} 个。` +
        `若 Uniforms 结构变了，请同步更新 EXPECTED_FLOATS 与模板里的字段索引表。`,
    );
  }
  if (seed.some((n) => !Number.isFinite(n))) {
    throw new Error("LIQUID_ORB_UNIFORM_SEED 里出现了非数字值");
  }

  return { shader: shaderMatch[1], seed };
}

function build() {
  const { shader, seed } = extract();
  const fallbackCss = extractFallbackCss();
  const template = readFileSync(TEMPLATE, "utf8");

  // 用函数式替换：WGSL / CSS 里可能含 `$&` 之类会被当成替换模式的序列。
  const html = template
    .replace("__ORB_SHADER__", () => shader.trim())
    .replace("__ORB_SEED__", () => seed.join(","))
    .replace("__ORB_CSS__", () => fallbackCss);

  writeFileSync(OUT, html, "utf8");
  console.log(
    `✓ 生成 ${OUT}（shader ${shader.length} 字符，seed ${seed.length} float，降级球 CSS ${fallbackCss.length} 字符）`,
  );

  if (process.argv.includes("--deploy")) {
    if (!existsSync(RUNTIME_PUBLIC)) {
      console.warn(`！运行时 public 目录不存在，跳过部署：${RUNTIME_PUBLIC}`);
      return;
    }
    const target = resolve(RUNTIME_PUBLIC, "orb-lab.html");
    try {
      copyFileSync(OUT, target);
      console.log(`✓ 已部署 ${target}`);
      console.log(`  打开：<TOS 地址>/piagentfortos/orb-lab.html`);
    } catch (error) {
      // 运行时 public 是 root 所有（安装包解出来的），当前账号通常写不进去。
      console.warn(`！复制到运行时失败（${error.code || error.message}），改用临时静态服务：`);
      console.warn(`  node scripts/serve-orb-lab.mjs 18080`);
    }
  }
}

build();
