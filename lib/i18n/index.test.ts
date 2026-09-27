import assert from "node:assert/strict";
import test from "node:test";
import {
  DICTIONARIES,
  LOCALE_ENDONYMS,
  SUPPORTED_LOCALES,
  normalizeLocale,
  normalizePreference,
  resolveLocale,
  resolveI18nTitle,
  translate,
} from "./index.ts";
import { en } from "./dictionaries.ts";

test("normalizes supported browser locales", () => {
  assert.equal(normalizeLocale("zh-Hans-CN"), "zh-CN");
  assert.equal(normalizeLocale("en-US"), "en");
  assert.equal(normalizeLocale(""), null);
  assert.equal(normalizeLocale(null), null);
});

test("every registered locale is recognized by normalizeLocale", () => {
  // 不变式：注册了字典的语言，必须同时能被浏览器标签命中（否则用户永远用不上它）。
  // 这条会逼着新增语种时同步补 LOCALE_ALIASES 里的规则。
  for (const locale of SUPPORTED_LOCALES) {
    assert.equal(normalizeLocale(locale), locale, `${locale} 未被 normalizeLocale 识别`);
  }
});

test("all dictionaries cover exactly the same keys as en", () => {
  const expected = Object.keys(en).sort();
  for (const locale of SUPPORTED_LOCALES) {
    const actual = Object.keys(DICTIONARIES[locale]).sort();
    const missing = expected.filter((key) => !actual.includes(key));
    const extra = actual.filter((key) => !expected.includes(key));
    assert.deepEqual(missing, [], `${locale} 缺少键`);
    assert.deepEqual(extra, [], `${locale} 多出键`);
  }
});

test("all dictionaries keep the same {placeholders} as en", () => {
  const placeholders = (text: string) => (text.match(/\{(\w+)\}/g) ?? []).sort();
  for (const locale of SUPPORTED_LOCALES) {
    for (const [key, value] of Object.entries(en)) {
      const translated = DICTIONARIES[locale][key as keyof typeof en];
      assert.deepEqual(
        placeholders(translated),
        placeholders(value),
        `${locale} 的 ${key} 占位符与英文不一致`,
      );
    }
  }
});

test("every locale has an endonym label for the switcher", () => {
  for (const locale of SUPPORTED_LOCALES) {
    assert.equal(typeof LOCALE_ENDONYMS[locale], "string");
    assert.notEqual(LOCALE_ENDONYMS[locale].trim(), "");
  }
});

test("normalizes stored preferences with a system fallback", () => {
  assert.equal(normalizePreference("zh-CN"), "zh-CN");
  assert.equal(normalizePreference("system"), "system");
  assert.equal(normalizePreference("invalid"), "system");
});

test("resolves system locale from the first supported browser language", () => {
  assert.equal(resolveLocale("system", ["zh-Hans"]), "zh-CN");
  assert.equal(resolveLocale("system", ["xx-YY"]), "en");
  assert.equal(resolveLocale("en", ["zh-CN"]), "en");
});

test("translates and interpolates UI messages", () => {
  assert.equal(translate("zh-CN", "shell.openProject"), "打开项目");
  assert.equal(
    translate("zh-CN", "chat.retrying", { attempt: 2, max: 5 }),
    "正在重试（2/5）…",
  );
  assert.equal(
    translate("en", "sidebar.newSessionIn", { path: "/tmp/project" }),
    "New session in /tmp/project",
  );
  assert.equal(
    translate("zh-CN", "extension.addFailed"),
    "添加扩展或技能失败",
  );
});

test("resolves extension-provided i18n titles and leaves plain titles untouched", () => {
  assert.equal(resolveI18nTitle("i18n:approval.confirmToolTitle", "zh-CN"), "允许执行此工具？");
  assert.equal(resolveI18nTitle("i18n:approval.confirmToolTitle", "en"), "Allow this tool?");
  assert.equal(resolveI18nTitle("Plain title", "zh-CN"), "Plain title");
  assert.equal(resolveI18nTitle("i18n:does.not.exist", "zh-CN"), "i18n:does.not.exist");
});
