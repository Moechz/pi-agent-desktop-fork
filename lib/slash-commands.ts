import { translate, type TranslationKey, type TranslationValues } from "./i18n/index.ts";

export interface SlashSkill {
  name: string;
  description?: string;
  disableModelInvocation?: boolean;
  sourceInfo?: {
    source?: string;
    scope?: string;
  };
}

export type SlashCommandKind = "command" | "skill";

export interface SlashCommandItem {
  id: string;
  label: string;
  insertText: string;
  description: string;
  kind: SlashCommandKind;
  scope?: string;
}

/** 内置命令用字典键描述，渲染时按当前语言解析（避免硬编码中文/英文） */
interface BuiltinSlashCommandDef {
  id: string;
  label: string;
  insertText: string;
  descriptionKey: TranslationKey;
  kind: SlashCommandKind;
}

export const BUILTIN_SLASH_COMMANDS: BuiltinSlashCommandDef[] = [
  { id: "compact", label: "/compact", insertText: "/compact ", descriptionKey: "slash.compact", kind: "command" },
  { id: "tools", label: "/tools", insertText: "/tools ", descriptionKey: "slash.tools", kind: "command" },
  { id: "skills", label: "/skills", insertText: "/skills ", descriptionKey: "slash.skills", kind: "command" },
  { id: "statusline", label: "/statusline", insertText: "/statusline", descriptionKey: "slash.statusline", kind: "command" },
];

export function getSlashTriggerQuery(value: string, caretIndex: number): string | null {
  if (caretIndex < 1) return null;
  const beforeCaret = value.slice(0, caretIndex);
  if (!beforeCaret.startsWith("/")) return null;
  if (beforeCaret.includes("\n")) return null;
  const query = beforeCaret.slice(1);
  if (/\s/.test(query)) return null;
  return query;
}

export type SlashTranslate = (key: TranslationKey, values?: TranslationValues) => string;

const defaultSlashTranslate: SlashTranslate = (key, values) => translate("en", key, values);

export function buildSlashCommandItems(
  query: string,
  skills: SlashSkill[],
  t: SlashTranslate = defaultSlashTranslate,
): SlashCommandItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  const skillItems = skills
    .filter((skill) => !skill.disableModelInvocation && skill.name.trim())
    .map((skill): SlashCommandItem => ({
      id: `skill:${skill.name}`,
      label: `/${skill.name}`,
      insertText: `/${skill.name} `,
      description: skill.description?.trim() || t("slash.skillDefault"),
      kind: "skill",
      scope: skill.sourceInfo?.scope ?? skill.sourceInfo?.source,
    }));

  const commandItems = BUILTIN_SLASH_COMMANDS.map((def): SlashCommandItem => ({
    id: def.id,
    label: def.label,
    insertText: def.insertText,
    description: t(def.descriptionKey),
    kind: def.kind,
  }));

  return [...commandItems, ...skillItems].filter((item) => {
    if (!normalizedQuery) return true;
    return item.label.slice(1).toLowerCase().includes(normalizedQuery) ||
      item.description.toLowerCase().includes(normalizedQuery) ||
      item.kind.includes(normalizedQuery);
  });
}
