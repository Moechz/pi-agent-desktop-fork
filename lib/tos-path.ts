/**
 * TOS 绝对路径工具（纯函数，便于单测）。
 *
 * TOS 的文件路径形如 `/Volume1/public/proj`：以 `/` 开头、卷名首段大写。
 * 这里只做规范化与导航计算，不做权限判断——可见范围由 TOS 官方 API 决定。
 */

/** 规范化：折叠重复斜杠、去掉末尾斜杠（根路径保留 `/`） */
export function normalizeTosPath(path: string): string {
  const trimmed = (path ?? "").trim();
  if (!trimmed) return "/";
  const collapsed = trimmed.replace(/\/{2,}/g, "/");
  const withoutTrailing = collapsed.length > 1 ? collapsed.replace(/\/+$/, "") : collapsed;
  return withoutTrailing.startsWith("/") ? withoutTrailing : `/${withoutTrailing}`;
}

/** 上一级目录；已在根时返回根 */
export function parentTosPath(path: string): string {
  const normalized = normalizeTosPath(path);
  if (normalized === "/") return "/";
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "/" : normalized.slice(0, index);
}

/** 拼接子项（子项名里若误带斜杠会被规范化处理） */
export function joinTosPath(base: string, name: string): string {
  const normalizedBase = normalizeTosPath(base);
  const cleanName = (name ?? "").trim().replace(/^\/+/, "");
  if (!cleanName) return normalizedBase;
  return normalizedBase === "/" ? `/${cleanName}` : `${normalizedBase}/${cleanName}`;
}

/** 面包屑：从卷根到当前路径的每一级 */
export function breadcrumbTosPath(path: string): { label: string; path: string }[] {
  const normalized = normalizeTosPath(path);
  const segments = normalized.split("/").filter(Boolean);
  const crumbs: { label: string; path: string }[] = [{ label: "/", path: "/" }];
  let acc = "";
  for (const segment of segments) {
    acc += `/${segment}`;
    crumbs.push({ label: segment, path: acc });
  }
  return crumbs;
}

/** 是否是卷根级别（`/Volume1`） */
export function isVolumeRoot(path: string): boolean {
  return /^\/[^/]+$/.test(normalizeTosPath(path));
}

/** 合法性粗检：必须是绝对路径且不含 . / .. 这类相对段 */
export function isPlausibleTosPath(path: string): boolean {
  const normalized = normalizeTosPath(path);
  if (!normalized.startsWith("/")) return false;
  return !normalized.split("/").some((segment) => segment === "." || segment === "..");
}
