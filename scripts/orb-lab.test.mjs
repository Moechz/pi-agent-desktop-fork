/**
 * orb-lab（思考球实验室）冒烟测试。
 *
 * 守两件事：
 *  1. scripts/build-orb-lab.mjs 能继续从 components/liquid-orb-source.ts 抽出
 *     着色器与 128 个 uniform（源码一改形状，这里先红，而不是等用户打开页面白屏）；
 *  2. 生成出来的页面在「没有 WebGPU」这条分支下能跑通——也就是 TOS 明文 HTTP 上
 *     用户真实走的那条路：脚本不抛错、seed 导出是 128 个数、CSS 导出成形、
 *     所有滑块/取色器的 input 回调都能执行。
 *
 * 用一个最小 DOM 桩执行内联脚本，不引入 jsdom 依赖。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const GENERATOR = resolve(here, "build-orb-lab.mjs");
const OUT = resolve(root, "public/orb-lab.html");

function buildLab() {
  const result = spawnSync(process.execPath, [GENERATOR], { encoding: "utf8" });
  assert.equal(result.status, 0, `生成器退出码非 0：${result.stderr || result.stdout}`);
  assert.ok(existsSync(OUT), "未生成 public/orb-lab.html");
  return readFileSync(OUT, "utf8");
}

/** 最小 DOM 桩：够执行内联脚本，不追求还原浏览器。 */
function makeDom() {
  const created = [];
  const makeEl = (tag) => {
    const node = {
      tagName: String(tag).toUpperCase(),
      children: [], listeners: {}, dataset: {}, value: "", type: "", hidden: false, className: "",
      _text: "", _html: "",
      style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
      classList: {
        _s: new Set(),
        toggle(c, force) {
          const on = force === undefined ? !this._s.has(c) : Boolean(force);
          if (on) this._s.add(c); else this._s.delete(c);
          return on;
        },
        add(c) { this._s.add(c); },
        remove(c) { this._s.delete(c); },
        contains(c) { return this._s.has(c); },
      },
      get textContent() { return this._text; },
      set textContent(v) { this._text = String(v); this.children.length = 0; },
      get innerHTML() { return this._html; },
      set innerHTML(v) { this._html = String(v); },
      appendChild(c) { this.children.push(c); c.parent = this; return c; },
      append(...cs) { for (const c of cs) { this.children.push(c); c.parent = this; } },
      replaceWith(c) {
        if (this.parent) {
          const i = this.parent.children.indexOf(this);
          if (i >= 0) this.parent.children[i] = c;
        }
        c.parent = this.parent;
      },
      addEventListener(ev, fn) { (this.listeners[ev] ||= []).push(fn); },
      select() {},
    };
    created.push(node);
    return node;
  };

  const byId = {};
  const register = (id, node) => { byId[id] = node; return node; };
  register("gpuBanner", makeEl("div"));
  register("gpuGrid", makeEl("div"));
  register("gpuSliders", makeEl("div"));
  register("gpuColors", makeEl("div"));
  register("gpuTarget", makeEl("span"));
  register("seedOut", makeEl("textarea"));
  register("cssGrid", makeEl("div"));
  register("cssSliders", makeEl("div"));
  register("cssTarget", makeEl("span"));
  register("cssOut", makeEl("textarea"));
  register("sizeRange", Object.assign(makeEl("input"), { type: "range", value: "46" }));
  register("sizeOut", makeEl("output"));
  register("fpsCap", Object.assign(makeEl("input"), { type: "checkbox", checked: true }));
  register("themeBtn", makeEl("button"));
  register("gpuReset", makeEl("button"));
  register("copySeed", makeEl("button"));
  register("copyCss", makeEl("button"));

  const documentElement = makeEl("html");
  const body = makeEl("body");

  return { created, byId, documentElement, body, makeEl };
}

/** 执行页面内联脚本，返回 DOM 桩与工具句柄。 */
export function runLab(html) {
  const dom = makeDom();
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  const shader = html.match(/id="orb-shader"[^>]*>([\s\S]*?)<\/script>/)[1];
  const seedJson = html.match(/id="orb-seed"[^>]*>\[([\s\S]*?)\]<\/script>/)[1];

  dom.byId["orb-shader"] = Object.assign(dom.makeEl("script"), { _text: shader });
  dom.byId["orb-seed"] = Object.assign(dom.makeEl("script"), { _text: "[" + seedJson + "]" });

  const sandbox = {
    console,
    document: {
      documentElement: dom.documentElement,
      body: dom.body,
      getElementById: (id) => dom.byId[id] || null,
      createElement: dom.makeEl,
      execCommand: () => true,
    },
    navigator: {}, // 故意不给 gpu / clipboard：走无 WebGPU 的降级分支
    window: { isSecureContext: false, devicePixelRatio: 1 },
    performance: { now: () => Date.now() },
    requestAnimationFrame: () => 0,
    IntersectionObserver: class { observe() {} disconnect() {} },
    setTimeout,
    Math, Number, String, Array, Object, JSON, parseFloat, parseInt, Error,
  };
  sandbox.globalThis = sandbox;
  sandbox.window.document = sandbox.document;

  vm.runInNewContext(script, sandbox, { filename: "orb-lab-inline.js" });
  return dom;
}

test("orb-lab：生成器能抽出着色器与 128 个 uniform", () => {
  const html = buildLab();
  assert.match(html, /fn vs_main/, "缺少顶点入口");
  assert.match(html, /fn fs_main/, "缺少片元入口");
  assert.match(html, /struct Uniforms/, "缺少 Uniforms 结构");
  assert.match(html, /\.liquid-thinking-fallback \.rim/, "未注入 globals.css 里的降级球规则");
  assert.match(html, /\.orb-stage \.liquid-thinking-fallback/, "缺少实验用尺寸覆盖");
  assert.doesNotMatch(html, /__ORB_/, "仍有未替换的占位符");

  const seed = html
    .match(/id="orb-seed"[^>]*>\[([\s\S]*?)\]<\/script>/)[1]
    .split(",")
    .map(Number);
  assert.equal(seed.length, 128, "seed 不是 128 个 float（Uniforms 结构可能变了）");
  assert.ok(seed.every(Number.isFinite), "seed 里出现非数字");
});

test("orb-lab：无 WebGPU 分支可执行，滑块全部可用", async () => {
  const html = buildLab();
  const dom = runLab(html);

  await new Promise((r) => setTimeout(r, 20));

  // 降级横幅应出现，并且把真球区换成 CSS 球
  assert.equal(dom.byId.gpuBanner.hidden, false, "未显示 WebGPU 降级提示");
  assert.match(dom.byId.gpuBanner.innerHTML, /拿不到 WebGPU/);

  // 6 个真球预设 + 6 个降级球卡片（5 预设 + 1 调参球）
  assert.equal(dom.byId.gpuGrid.children.length, 6, "真球预设卡片数不对");
  assert.equal(dom.byId.cssGrid.children.length, 6, "降级球卡片数不对");

  const seedNums = dom.byId.seedOut.value.split(/[,\s]+/).filter(Boolean);
  assert.equal(seedNums.length, 128, "seed 导出不是 128 个数");
  assert.match(dom.byId.cssOut.value, /--orb-caustic:/, "CSS 导出缺少焦散强度变量");
  assert.match(dom.byId.cssOut.value, /--orb-spin:\s*\d/, "CSS 导出缺少扫光转速变量");

  // 拖动每一个 range / color 输入，回调都必须能跑完
  let fired = 0;
  for (const node of dom.created) {
    if (node.type !== "range" && node.type !== "color") continue;
    for (const fn of node.listeners.input || []) {
      if (node.type === "range") {
        const min = Number(node.min || 0);
        const max = Number(node.max || 100);
        node.value = String(min + (max - min) * 0.42);
      } else {
        node.value = "#3366cc";
      }
      fn({ target: node, currentTarget: node });
      fired++;
    }
  }
  assert.ok(fired >= 20, `可交互控件太少（${fired}）`);
  assert.equal(
    dom.byId.seedOut.value.split(/[,\s]+/).filter(Boolean).length,
    128,
    "拖动后 seed 导出被破坏",
  );
});
