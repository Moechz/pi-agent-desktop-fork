import { en, zhCN, type TranslationKey } from "../dictionaries.ts";
import { jaJP } from "./ja-JP.ts";
import { koKR } from "./ko-KR.ts";
import { zhHK } from "./zh-HK.ts";
import { viVN } from "./vi-VN.ts";
import { idID } from "./id-ID.ts";
import { huHU } from "./hu-HU.ts";
import { csCZ } from "./cs-CZ.ts";
import { svSE } from "./sv-SE.ts";
import { trTR } from "./tr-TR.ts";
import { plPL } from "./pl-PL.ts";
import { nlNL } from "./nl-NL.ts";
import { ruRU } from "./ru-RU.ts";
import { ptPT } from "./pt-PT.ts";
import { itIT } from "./it-IT.ts";
import { esES } from "./es-ES.ts";
import { deDE } from "./de-DE.ts";
import { frFR } from "./fr-FR.ts";

/**
 * 全部语言字典注册表 —— 多语支持的**唯一入口**。
 *
 * 键是 BCP-47 风格的语言标签，与 TOS 应用包 `<appid>.lang` 的段名一一对应
 * （zh-CN ↔ zh-cn、zh-HK ↔ zh-hk、ja-JP ↔ ja-jp …），方便两端对照排查。
 *
 * 新增一个语种 = 三条改动（都受类型检查约束，漏一个编不过）：
 *   1. 在 `lib/i18n/locales/<tag>.ts` 新增字典（`Record<TranslationKey, string>` 强制键齐全）
 *   2. 在此文件的 DICTIONARIES 注册
 *   3. 在 LOCALE_ENDONYMS 填该语言**自身的写法**（endonym，不随界面语言变化）
 * 另外 `lib/i18n/index.test.ts` 会自动校验：键集合与 en 完全一致、占位符 {x} 一致。
 */
export const DICTIONARIES = {
  en,
  "zh-CN": zhCN,
  "zh-HK": zhHK,
  "ja-JP": jaJP,
  "ko-KR": koKR,
  "fr-FR": frFR,
  "de-DE": deDE,
  "es-ES": esES,
  "it-IT": itIT,
  "pt-PT": ptPT,
  "ru-RU": ruRU,
  "nl-NL": nlNL,
  "pl-PL": plPL,
  "tr-TR": trTR,
  "sv-SE": svSE,
  "cs-CZ": csCZ,
  "hu-HU": huHU,
  "id-ID": idID,
  "vi-VN": viVN,
} as const satisfies Record<string, Record<TranslationKey, string>>;

export type Locale = keyof typeof DICTIONARIES;

/** 任何情况下都存在的兜底语言（所有语种缺失键时回落到它） */
export const DEFAULT_FALLBACK_LOCALE: Locale = "en";

/** 界面语言列表（切换器用它渲染；顺序即展示顺序） */
export const SUPPORTED_LOCALES = Object.keys(DICTIONARIES) as Locale[];

/**
 * 语言切换器里的显示名：用该语言自己的写法（endonym），
 * 这样任何界面语言下用户都能认出自己的语言（与 macOS / 浏览器一致的做法）。
 */
export const LOCALE_ENDONYMS: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文",
  "zh-HK": "繁體中文",
  "ja-JP": "日本語",
  "ko-KR": "한국어",
  "fr-FR": "Français",
  "de-DE": "Deutsch",
  "es-ES": "Español",
  "it-IT": "Italiano",
  "pt-PT": "Português",
  "ru-RU": "Русский",
  "nl-NL": "Nederlands",
  "pl-PL": "Polski",
  "tr-TR": "Türkçe",
  "sv-SE": "Svenska",
  "cs-CZ": "Čeština",
  "hu-HU": "Magyar",
  "id-ID": "Bahasa Indonesia",
  "vi-VN": "Tiếng Việt",
};

export type { TranslationKey };
