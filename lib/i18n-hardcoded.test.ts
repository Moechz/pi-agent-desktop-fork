import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { en, zhCN } from "./i18n/dictionaries.ts";

/**
 * i18n 防回归：
 * ① 界面文案一律走字典 —— JSX 文本节点/属性字面量里不得出现中文（英文界面会漏中文）
 * ② 中文界面不得出现硬编码英文散文 —— JSX 文本节点里的多词英文需进白名单（专有名词除外）
 * ③ 英/中字典键必须一一对应
 *
 * 有意的例外（路径、URL、键盘提示、品牌名、文件类型缩写）列在 ALLOWED_TEXT 中。
 */

const CJK = /[\u4e00-\u9fff]/;

/** 允许保留的原文（非散文）：品牌、快捷键提示、路径/文件名、网站名 */
const ALLOWED_TEXT = new Set([
  "Pi Agent Desktop",
  "↑↓ Enter Tab Esc",
  "skills.sh ↗",
  "(~/.pi/agent/mcp.json)",
  "(.pi/mcp.json)",
  "~/.pi/agent/models.json",
  "— inherit / none —",
]);

/** 非文案属性（CSS/行为类，不做自然语言判定） */
const NON_TEXT_ATTRS = new Set([
  "panelClassName",
  "className",
  "class",
  "style",
  "rel",
  "accept",
  "fontFamily",
  "viewBox",
  "d",
  "fill",
  "stroke",
  "id",
  "href",
  "src",
  "role",
  "type",
  "key",
  "name",
  "value",
  "target",
  "htmlFor",
]);

function listTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsxFiles(full));
    else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) out.push(full);
  }
  return out;
}

type Finding = { file: string; line: number; kind: string; text: string };

function scan(files: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node): void => {
      if (ts.isJsxText(node)) {
        const text = node.getText(sf).replace(/\s+/g, " ").trim();
        if (text) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          if (CJK.test(text)) findings.push({ file, line: line + 1, kind: "中文文本", text });
          else if (isEnglishProse(text) && !ALLOWED_TEXT.has(text)) {
            findings.push({ file, line: line + 1, kind: "英文散文未走字典", text });
          }
        }
      } else if (ts.isJsxAttribute(node)) {
        const name = node.name.getText(sf);
        const init = node.initializer;
        if (init && ts.isStringLiteral(init) && !NON_TEXT_ATTRS.has(name) && CJK.test(init.text)) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          findings.push({ file, line: line + 1, kind: `属性 ${name} 含中文`, text: init.text });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return findings;
}

/** 多词英文（含空格/句末标点）且含小写词 → 视为面向用户的散文 */
function isEnglishProse(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  if (!/^[A-Za-z]/.test(text)) return false;
  if (!words.some((w) => /^[a-z]/.test(w))) return false;
  if (/[\\/{}()[\]]/.test(text)) return false; // 路径/命令/占位符
  return true;
}

test("界面 JSX 不出现硬编码中文（英文界面不得漏中文）", () => {
  const files = [...listTsxFiles("components"), ...listTsxFiles("app")];
  assert.ok(files.length > 20, `应扫描到组件文件，实际 ${files.length}`);
  const cjk = scan(files).filter((f) => f.kind.includes("中文"));
  const detail = cjk.map((f) => `  ${f.file}:${f.line} [${f.kind}] ${f.text}`).join("\n");
  assert.equal(cjk.length, 0, `发现硬编码中文，应改用 t("key"):\n${detail}`);
});

test("界面 JSX 不留硬编码英文散文（中文界面不得漏英文）", () => {
  const files = [...listTsxFiles("components"), ...listTsxFiles("app")];
  const english = scan(files).filter((f) => f.kind === "英文散文未走字典");
  const detail = english.map((f) => `  ${f.file}:${f.line} ${f.text}`).join("\n");
  assert.equal(
    english.length,
    0,
    `发现硬编码英文文案，应改用 t("key")（确属专有名词请加入 ALLOWED_TEXT）:\n${detail}`,
  );
});

test("英中字典键一一对应", () => {
  const enKeys = Object.keys(en).sort();
  const zhKeys = Object.keys(zhCN).sort();
  assert.deepEqual(zhKeys, enKeys, "zhCN 与 en 的键集合必须完全一致");
  assert.ok(enKeys.length > 400, `字典键数异常偏少：${enKeys.length}`);
});
