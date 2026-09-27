import {
  DEFAULT_FALLBACK_LOCALE,
  DICTIONARIES,
  LOCALE_ENDONYMS,
  SUPPORTED_LOCALES,
  type Locale,
  type TranslationKey,
} from "./locales/index.ts";
import type { TranslationValues } from "./dictionaries.ts";

export {
  DICTIONARIES,
  LOCALE_ENDONYMS,
  SUPPORTED_LOCALES,
  type Locale,
} from "./locales/index.ts";

export type LocalePreference = Locale | "system";

export const DEFAULT_LOCALE: Locale = DEFAULT_FALLBACK_LOCALE;
export const LOCALE_STORAGE_KEY = "pi-locale";

/**
 * 浏览器/系统语言标签 → 本应用语言。
 *
 * 顺序敏感：**具体规则在前，宽泛兜底在后**。新增语种时在这里加一行
 * （例如 /^zh-(hk|tw|mo)/i → "zh-HK" 要排在 /^zh/i → "zh-CN" 之前）。
 * 未命中的语言返回 null，由调用方回落到系统默认/英文（即该语种暂未本地化）。
 */
const LOCALE_ALIASES: ReadonlyArray<readonly [RegExp, Locale]> = [
  [/^zh-(hk|tw|mo|hant)/i, "zh-HK"],
  [/^zh-(hans|cn|sg|my)/i, "zh-CN"],
  [/^zh/i, "zh-CN"],
  [/^en/i, "en"],
];

export function normalizeLocale(locale: string | null | undefined): Locale | null {
  if (!locale) return null;
  const normalized = locale.trim().replace(/_/g, "-");
  if (!normalized) return null;
  for (const [pattern, target] of LOCALE_ALIASES) {
    if (pattern.test(normalized)) return target;
  }
  return null;
}

export function normalizePreference(value: string | null | undefined): LocalePreference {
  if (value === "system") return value;
  return normalizeLocale(value) ?? "system";
}

export function resolveLocale(
  preference: LocalePreference,
  browserLanguages: readonly string[] = [],
): Locale {
  if (preference !== "system") return preference;
  for (const language of browserLanguages) {
    const locale = normalizeLocale(language);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

function interpolate(template: string, values?: TranslationValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  values?: TranslationValues,
): string {
  const dictionary: Record<TranslationKey, string> = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  return interpolate(dictionary[key] ?? DICTIONARIES[DEFAULT_LOCALE][key], values);
}

/**
 * 解析服务端（pi 扩展）传来的标题：形如 `i18n:<key>` 时按当前语言翻译。
 * 非该形式、或键不存在时原样返回 —— 保证向后兼容，不会把裸键显示给用户。
 */
export function resolveI18nTitle(title: string, locale: Locale): string {
  const prefix = "i18n:";
  if (!title.startsWith(prefix)) return title;
  const key = title.slice(prefix.length);
  return hasTranslationKey(key) ? translate(locale, key) : title;
}

export function hasTranslationKey(key: string): key is TranslationKey {
  return Object.prototype.hasOwnProperty.call(DICTIONARIES[DEFAULT_LOCALE], key);
}

export type { TranslationKey, TranslationValues } from "./dictionaries.ts";
