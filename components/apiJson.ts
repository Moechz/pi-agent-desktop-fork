import { withBasePath } from "../lib/base-path.ts";

export interface ApiJsonOptions {
  fallback: string;
}

function responseError(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null || !("error" in data)) return undefined;
  const error = (data as { error?: unknown }).error;
  return error ? String(error) : undefined;
}

export async function apiJson<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  options: ApiJsonOptions,
): Promise<T> {
  let response: Response;
  try {
    // TOS 子路径部署：字符串路径统一补 basePath 前缀（无前缀时行为不变）
    response = await fetch(typeof input === "string" ? withBasePath(input) : input, init);
  } catch {
    throw new Error(options.fallback);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(options.fallback);
  }

  if (!response.ok) {
    throw new Error(responseError(data) ?? options.fallback);
  }
  return data as T;
}
