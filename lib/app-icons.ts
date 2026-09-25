import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 图标 URL 版本化。
 *
 * 背景（Safari 真机反馈）：网站图标会被浏览器按**站点**长期缓存 —— 退出/重启浏览器
 * 都可能不刷新，用户会一直看到旧图标（服务端早已是新图标）。做法是把图标文件内容的
 * 哈希作为 URL 查询参数：**图标一变，URL 就变**，任何浏览器的图标缓存自然失效。
 *
 * 内容哈希在构建期（以及 SSR 时）由文件内容算出，无需手工维护版本号。
 */

export interface IconUrlOptions {
  /** public/ 下的文件名，例如 pi-agent-icon.png */
  file: string;
  /** 站点前缀（TOS 子路径部署时非空，如 /piagentfortos） */
  basePath?: string;
  /** 图标所在目录，默认 <cwd>/public */
  publicDir?: string;
}

/** 生成带内容哈希的图标 URL（同内容 → 同 URL；内容变 → URL 变） */
export function versionedIconUrl({ file, basePath = "", publicDir }: IconUrlOptions): string {
  const dir = publicDir ?? join(process.cwd(), "public");
  const digest = createHash("sha256").update(readFileSync(join(dir, file))).digest("hex").slice(0, 8);
  const prefix = basePath.replace(/\/+$/, "");
  return `${prefix}/${file}?v=${digest}`;
}
