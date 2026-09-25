import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 图标 URL（哈希放在**文件名**里，URL 不带查询串）。
 *
 * 两条真机教训叠加后的做法：
 *  ① Safari 不认带查询串的图标（`?v=xxx`），会回退去取站点根 `/favicon.ico` ——
 *    那个地址属于平台（TOS）而非本应用，实测 404 → Safari 显示通用图标；
 *  ② 但去掉查询串又会被浏览器按“站点”长期缓存（重启浏览器都不刷新）。
 * 于是把**内容哈希写进文件名**：URL 干净（Safari 认），内容一变文件名就变（缓存自然失效）。
 *
 * 文件名与内容的一致性由 lib/app-icons.test.ts 守护：改了图标却没改名，测试直接失败。
 */

/** public/ 下的图标基名（实际文件名形如 `<base>-<hash8>.<ext>`） */
export const ICON_BASES = {
  icon: { base: "pi-agent-icon", ext: "png" },
  favicon: { base: "pi-agent-favicon", ext: "ico" },
  apple: { base: "pi-agent-touch-icon", ext: "png" },
} as const;

function publicDirOf(publicDir?: string): string {
  return publicDir ?? join(process.cwd(), "public");
}

/** 解析出唯一的图标文件名（少了或多了都视为错误，避免静默用错图） */
export function resolveIconFile(base: string, ext: string, publicDir?: string): string {
  const dir = publicDirOf(publicDir);
  const matches = readdirSync(dir).filter((n) => n.startsWith(`${base}-`) && n.endsWith(`.${ext}`));
  if (matches.length !== 1) {
    throw new Error(`图标文件应恰好一个：${base}-*.${ext}（实际 ${matches.length} 个）`);
  }
  return matches[0];
}

/** 文件名里的哈希是否与文件内容一致（测试用守卫） */
export function iconHashMatches(file: string, publicDir?: string): boolean {
  const dir = publicDirOf(publicDir);
  const matched = /-([0-9a-f]{8})\.(png|ico)$/.exec(file);
  if (!matched) return false;
  let body: Buffer;
  try {
    body = readFileSync(join(dir, file));
  } catch {
    return false; // 文件名与内容不符时可能指向不存在的文件：按“不匹配”处理
  }
  const digest = createHash("sha256").update(body).digest("hex").slice(0, 8);
  return digest === matched[1];
}

/** 生成站内图标 URL（带站点前缀，无查询串） */
export function iconUrl(input: {
  base: string;
  ext: string;
  basePath?: string;
  publicDir?: string;
}): string {
  const prefix = (input.basePath ?? "").replace(/\/+$/, "");
  return `${prefix}/${resolveIconFile(input.base, input.ext, input.publicDir)}`;
}
