import { withBasePath } from "./base-path.ts";
/**
 * TOS 官方「文件管理 API」客户端（TOS 7）—— 经本应用服务端代理调用。
 *
 * TOS 侧接口（文档：help.terra-master.com/developer/api/overview/）：
 *   GET  /fileManage/list?path=/Volume1/Public     列目录
 *   GET  /fileManage/folderInfoAll?path=…          目录详情（含 is_only_read）
 *   POST /fileManage/CreateFolder                  新建目录
 *
 * 为什么前端不直连 TOS：TOS 的会话 Cookie（TMSESSNAME）很可能是 HttpOnly，
 * 前端既读不到"是否已登录"，也取不到 CSRF 令牌 → 直连会静默失败。
 * 改由服务端代理：`/api/tos/fs/{list,info,mkdir}` 把浏览器 Cookie 原样带给 TOS，
 * 并把 X-Csrf-Token 从 Cookie 取出回填到头里（服务端能读到 HttpOnly Cookie）。
 *
 * 这些代理路径属于本应用，必须带 basePath（withBasePath）。
 */

const TOS_API_ROOT = "/fileManage";

export interface TosDirEntry {
  name: string;
  path: string;
  fType: "folder" | "file";
  permission?: string;
  owner?: string;
  mTime?: string;
}

export interface TosFolderInfo {
  path: string;
  /** 只读目录（TOS 明确给出，用于选择前预检） */
  isOnlyRead: boolean;
  permission?: string;
}

export class TosApiError extends Error {
  readonly codeNum: number;
  constructor(message: string, codeNum: number) {
    super(message);
    this.name = "TosApiError";
    this.codeNum = codeNum;
  }
}

/** 从 Cookie 串里取 CSRF 令牌（TOS 把令牌也写进 Cookie） */
export function parseCsrfToken(cookieString: string): string | null {
  for (const part of (cookieString ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (key === "X-Csrf-Token" || key.toLowerCase() === "x-csrf-token") {
      const value = part.slice(eq + 1).trim();
      if (value) return decodeURIComponent(value);
    }
  }
  return null;
}

/** 是否处于已登录的 TOS 会话（用于判断能否用官方 API 选目录） */
export function parseTosSession(cookieString: string): boolean {
  return /(^|;\s*)TMSESSNAME=/.test(cookieString ?? "");
}

function currentCookieString(): string {
  return typeof document === "undefined" ? "" : document.cookie;
}

/**
 * 是否可用 = 代理能否打通 TOS API（不依赖 JS 可读 Cookie）。
 * 探测一次 /api/tos/fs/list?path=/ ：200 → 可用；403/4xx → 会话缺失或未授权。
 */
export async function probeTosAvailability(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(withBasePath(`${PROXY_ROOT}/list?path=%2F`), {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** 代理路由（属于本应用，需要 basePath 前缀） */
const PROXY_ROOT = "/api/tos/fs";

function apiUrl(_origin: string, action: string, query?: Record<string, string>): string {
  const params = new URLSearchParams(query ?? {});
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return withBasePath(`${PROXY_ROOT}${action}${suffix}`);
}

function authHeaders(cookieString: string): Record<string, string> {
  const token = parseCsrfToken(cookieString);
  return token ? { "X-Csrf-Token": token } : {};
}

interface TosEnvelope<T> {
  code?: boolean;
  code_num?: number;
  code_msg?: string;
  msg?: string;
  data?: T;
}

async function readEnvelope<T>(response: Response): Promise<T> {
  let payload: TosEnvelope<T>;
  try {
    payload = (await response.json()) as TosEnvelope<T>;
  } catch {
    throw new TosApiError(`Invalid JSON response (HTTP ${response.status})`, response.status);
  }
  if (payload.code !== true) {
    const message = payload.code_msg || payload.msg || `HTTP ${response.status}`;
    throw new TosApiError(message, typeof payload.code_num === "number" ? payload.code_num : response.status);
  }
  if (payload.data === undefined) {
    throw new TosApiError("Empty response data", 0);
  }
  return payload.data;
}

export interface TosApiOptions {
  /** 便于测试注入 */
  origin?: string;
  cookieString?: string;
  fetchImpl?: typeof fetch;
}

export async function tosListDirectory(path: string, options: TosApiOptions = {}): Promise<TosDirEntry[]> {
  const origin = options.origin ?? (typeof location === "undefined" ? "" : location.origin);
  const cookieString = options.cookieString ?? currentCookieString();
  const fetchImpl = options.fetchImpl ?? fetch;

  const response = await fetchImpl(apiUrl(origin, "/list", { path }), {
    method: "GET",
    credentials: "same-origin",
    headers: authHeaders(cookieString),
  });
  const data = await readEnvelope<{ data?: unknown[] }>(response);
  const rows = Array.isArray(data.data) ? data.data : [];
  return rows
    .map((row) => row as Record<string, unknown>)
    .filter((row) => typeof row.name === "string" && typeof row.path === "string")
    .map((row) => ({
      name: String(row.name),
      path: String(row.path),
      fType: row.f_type === "folder" ? "folder" : "file",
      permission: typeof row.permission === "string" ? row.permission : undefined,
      owner: typeof row.owner === "string" ? row.owner : undefined,
      mTime: typeof row.m_time === "string" ? row.m_time : undefined,
    }));
}

export async function tosFolderInfo(path: string, options: TosApiOptions = {}): Promise<TosFolderInfo> {
  const origin = options.origin ?? (typeof location === "undefined" ? "" : location.origin);
  const cookieString = options.cookieString ?? currentCookieString();
  const fetchImpl = options.fetchImpl ?? fetch;

  const response = await fetchImpl(apiUrl(origin, "/info", { path }), {
    method: "GET",
    credentials: "same-origin",
    headers: authHeaders(cookieString),
  });
  const data = await readEnvelope<Record<string, unknown>>(response);
  return {
    path: typeof data.path === "string" ? data.path : path,
    isOnlyRead: data.is_only_read === true,
    permission: typeof data.permission === "string" ? data.permission : undefined,
  };
}

export async function tosCreateFolder(path: string, options: TosApiOptions = {}): Promise<void> {
  const origin = options.origin ?? (typeof location === "undefined" ? "" : location.origin);
  const cookieString = options.cookieString ?? currentCookieString();
  const fetchImpl = options.fetchImpl ?? fetch;

  const response = await fetchImpl(apiUrl(origin, "/mkdir"), {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...authHeaders(cookieString) },
    body: JSON.stringify({ path }),
  });
  await readEnvelope<unknown>(response);
}

/** 业务错误码 → i18n 键（界面侧翻译） */
export function tosErrorKey(error: unknown): string | null {
  if (!(error instanceof TosApiError)) return null;
  if (error.codeNum === 24) return "tos.sessionMissing";
  if (error.codeNum === 21) return "tos.invalidArgument";
  return null;
}
