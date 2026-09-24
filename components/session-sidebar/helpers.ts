import { withBasePath } from "../../lib/base-path.ts";
import { isDirectoryPickerAvailable, requestDirectoryPick } from "../../lib/directory-picker.ts";
import { probeTosAvailability } from "../../lib/tos-api.ts";
import type { SessionInfo } from "@/lib/types";
import { normalizeLocale, translate, type Locale } from "@/lib/i18n";

export interface SessionTreeNode {
  session: SessionInfo;
  children: SessionTreeNode[];
}

export function formatRelativeTime(dateStr: string, locale: Locale | string = "en"): string {
  const loc: Locale = normalizeLocale(typeof locale === "string" ? locale : "en") ?? "en";
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return translate(loc, "sidebar.time.justNow");
  if (mins < 60) return translate(loc, "sidebar.time.minutesAgo", { count: mins });
  if (hours < 24) return translate(loc, "sidebar.time.hoursAgo", { count: hours });
  if (days < 7) return translate(loc, "sidebar.time.daysAgo", { count: days });
  return date.toLocaleDateString(loc);
}

/** Return the 5 most recently active cwds across all sessions */
export function getRecentCwds(sessions: SessionInfo[]): string[] {
  const latestByCwd = new Map<string, string>(); // cwd -> most recent modified
  for (const s of sessions) {
    if (!s.cwd) continue;
    const prev = latestByCwd.get(s.cwd);
    if (!prev || s.modified > prev) {
      latestByCwd.set(s.cwd, s.modified);
    }
  }
  return [...latestByCwd.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .slice(0, 5)
    .map(([cwd]) => cwd);
}

export function shortenCwd(cwd: string, homeDir?: string): string {
  const path = (homeDir && cwd.startsWith(homeDir)) ? "~" + cwd.slice(homeDir.length) : cwd;
  const sep = path.includes("/") ? "/" : "\\";
  const parts = path.split(sep).filter(Boolean);
  if (parts.length <= 2) return path;
  return "…/" + parts.slice(-2).join(sep);
}

type ElectronAPI = {
  selectDirectory?: () => Promise<string | null>;
};

export async function pickDirectoryFromHost(): Promise<string | null> {
  const electronAPI = (window as Window & { electronAPI?: ElectronAPI }).electronAPI;
  if (electronAPI?.selectDirectory) {
    return electronAPI.selectDirectory();
  }

  // TOS（浏览器）环境：用 TOS 官方文件管理 API 的应用内目录选择器
  // 可用性经服务端代理探测（TOS 会话 Cookie 多为 HttpOnly，前端读不到）。
  if (isDirectoryPickerAvailable()) {
    if (await probeTosAvailability()) {
      return requestDirectoryPick();
    }
    // 浏览器里但没有可用的 TOS 会话：给出明确指引，而不是回落到"仅 Windows"的报错
    const locale = normalizeLocale(document.documentElement.lang) ?? "en";
    throw new Error(translate(locale, "tos.sessionMissing"));
  }

  const res = await fetch(withBasePath("/api/select-directory"), { method: "POST" });
  let data: { path?: string | null; error?: string };
  try {
    data = await res.json();
  } catch {
    throw new Error(`Invalid JSON response (HTTP ${res.status})`);
  }
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data.path ?? null;
}

export function buildSessionTree(sessions: SessionInfo[]): SessionTreeNode[] {
  const byId = new Map<string, SessionTreeNode>();
  for (const s of sessions) {
    byId.set(s.id, { session: s, children: [] });
  }

  // Build a map of parentSessionId chains so we can resolve missing ancestors
  const parentOf = new Map<string, string>();
  for (const s of sessions) {
    if (s.parentSessionId) parentOf.set(s.id, s.parentSessionId);
  }

  // Walk up the parentSessionId chain to find the nearest ancestor that exists in byId
  function resolveAncestor(id: string): string | null {
    let cur = parentOf.get(id);
    const visited = new Set<string>();
    while (cur) {
      if (visited.has(cur)) return null; // cycle guard
      visited.add(cur);
      if (byId.has(cur)) return cur;
      cur = parentOf.get(cur);
    }
    return null;
  }

  const roots: SessionTreeNode[] = [];
  for (const node of byId.values()) {
    const ancestor = resolveAncestor(node.session.id);
    if (ancestor) {
      byId.get(ancestor)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort each level by modified desc
  const sort = (nodes: SessionTreeNode[]) => {
    nodes.sort((a, b) => b.session.modified.localeCompare(a.session.modified));
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}
