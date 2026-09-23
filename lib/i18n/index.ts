import { en, zhCN, type TranslationKey, type TranslationValues } from "./dictionaries.ts";

export const SUPPORTED_LOCALES = ["en", "zh-CN"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type LocalePreference = Locale | "system";

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "pi-locale";

export function normalizeLocale(locale: string | null | undefined): Locale | null {
  if (!locale) return null;
  const normalized = locale.toLowerCase();
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh-CN";
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
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
  const dictionary = locale === "zh-CN" ? zhCN : en;
  return interpolate(dictionary[key] ?? en[key], values);
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
  return Object.prototype.hasOwnProperty.call(en, key);
}

export type { TranslationKey, TranslationValues } from "./dictionaries.ts";
