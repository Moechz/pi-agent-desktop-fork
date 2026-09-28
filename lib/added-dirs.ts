/**
 * 输入框「已添加目录」列表（P17 ▾ 弹窗）的本地状态与合并逻辑。
 *
 * 背景（2026-09-28 用户报）：该列表 = 手动添加的目录（`localStorage.__piDirs`）
 * ∪ 会话目录（/api/sessions 按最近活动去重降序），但**只有选择、没有移除**，
 * 于是手动添加过的目录永远赖在列表里。
 *
 * 本模块把「读/写/合并/记住/移除」抽成纯函数（storage 通过 StorageLike 注入，便于单测）：
 * - 移除手动添加的目录 → 从 `__piDirs` 删掉，并记入隐藏表 `__piDirsHidden`，
 *   这样即使它同时来自会话目录也不会再出现；
 * - 重新选中同一目录 → 从隐藏表里剔除，重新可见；
 * - 隐藏表只是"不再显示"，不动磁盘上的目录，也不影响已有会话。
 */

export const ADDED_DIRS_KEY = "__piDirs";
export const HIDDEN_DIRS_KEY = "__piDirsHidden";
export const ADDED_DIRS_CAP = 50;
export const HIDDEN_DIRS_CAP = 200;

/** 最小存储接口（浏览器 localStorage 或测试用假对象） */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 取可用的 localStorage；不可用（SSR、隐私模式抛错）时返回 null */
export function safeLocalStorage(): StorageLike | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** 读字符串数组；损坏/非数组/非字符串项一律忽略 */
export function readStringList(storage: StorageLike | null | undefined, key: string): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
  } catch {
    return [];
  }
}

/** 写字符串数组（失败静默：存储满/被禁用不应打断交互） */
export function writeStringList(
  storage: StorageLike | null | undefined,
  key: string,
  list: string[],
): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(list));
  } catch {
    /* 忽略 */
  }
}

/**
 * 合并列表：手动添加的在前（保持添加顺序），会话目录在后（调用方已按最近活动降序），
 * 剔除隐藏项与重复项，最后按 cap 截断。
 */
export function mergeAddedDirs(opts: {
  stored: string[];
  sessionDirs: string[];
  hidden: string[];
  cap?: number;
}): string[] {
  const cap = opts.cap ?? ADDED_DIRS_CAP;
  const hidden = new Set(opts.hidden);
  const out: string[] = [];
  const push = (cwd: string) => {
    if (cwd && !hidden.has(cwd) && !out.includes(cwd)) out.push(cwd);
  };
  for (const cwd of opts.stored) push(cwd);
  for (const cwd of opts.sessionDirs) push(cwd);
  return out.slice(0, cap);
}

/** 记住一个目录（选中时）：加入 `__piDirs`（已在则不重复、保持原位置），并从隐藏表剔除 */
export function rememberAddedDir(
  stored: string[],
  hidden: string[],
  cwd: string,
  cap: number = ADDED_DIRS_CAP,
): { stored: string[]; hidden: string[] } {
  const nextStored = !cwd
    ? stored
    : stored.includes(cwd)
      ? stored
      : [...stored, cwd].slice(-cap);
  return { stored: nextStored, hidden: hidden.filter((h) => h !== cwd) };
}

/** 移除一个目录：从 `__piDirs` 删掉并记入隐藏表（去重，超出上限时丢最旧的隐藏项） */
export function forgetAddedDir(
  stored: string[],
  hidden: string[],
  cwd: string,
  hiddenCap: number = HIDDEN_DIRS_CAP,
): { stored: string[]; hidden: string[] } {
  const nextHidden = hidden.includes(cwd) ? hidden : [...hidden, cwd].slice(-hiddenCap);
  return { stored: stored.filter((s) => s !== cwd), hidden: nextHidden };
}

/** 一次性落盘「记住」结果 */
export function persistRemembered(storage: StorageLike | null | undefined, cwd: string): void {
  const next = rememberAddedDir(
    readStringList(storage, ADDED_DIRS_KEY),
    readStringList(storage, HIDDEN_DIRS_KEY),
    cwd,
  );
  writeStringList(storage, ADDED_DIRS_KEY, next.stored);
  writeStringList(storage, HIDDEN_DIRS_KEY, next.hidden);
}

/** 一次性落盘「移除」结果 */
export function persistForgotten(storage: StorageLike | null | undefined, cwd: string): void {
  const next = forgetAddedDir(
    readStringList(storage, ADDED_DIRS_KEY),
    readStringList(storage, HIDDEN_DIRS_KEY),
    cwd,
  );
  writeStringList(storage, ADDED_DIRS_KEY, next.stored);
  writeStringList(storage, HIDDEN_DIRS_KEY, next.hidden);
}
