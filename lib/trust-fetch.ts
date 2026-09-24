import { withBasePath } from "./base-path.ts";
/**
 * Retry helper for agent APIs that may return 409 needsTrust.
 */
import type { NeedsTrustPayload } from "@/lib/trust-types";

export async function ensureTrustThenFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  promptTrust: (payload: NeedsTrustPayload) => Promise<string | null>
): Promise<Response> {
  // 子路径部署（TOS basePath）时，调用方传进来的是站内路径字面量（如 "/api/agent/new"），
  // 必须在入口统一补前缀 —— 否则请求会打到根路径 404，表现为"消息发出去了但没有会话、
  // 模型也无响应"（真机实测）。
  const target: RequestInfo | URL = typeof input === "string" ? withBasePath(input) : input;

  // Avoid infinite loops if trust keep failing
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(target, init);
    if (res.status !== 409) return res;
    let body: NeedsTrustPayload;
    try {
      body = (await res.json()) as NeedsTrustPayload;
    } catch {
      return res;
    }
    if (!body?.needsTrust || !body.cwd) return res;
    const optionId = await promptTrust(body);
    if (!optionId) {
      // cancelled
      return new Response(JSON.stringify({ error: "Trust cancelled" }), {
        status: 499,
        headers: { "Content-Type": "application/json" },
      });
    }
    const trustRes = await fetch(withBasePath("/api/trust"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd: body.cwd, optionId }),
    });
    if (!trustRes.ok) {
      return trustRes;
    }
  }
  return fetch(target, init);
}
