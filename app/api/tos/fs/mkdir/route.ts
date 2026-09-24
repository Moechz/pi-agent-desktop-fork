import { NextResponse } from "next/server";
import { forwardToTosApi } from "@/lib/tos-proxy";
import { isPlausibleTosPath } from "@/lib/tos-path";

export const dynamic = "force-dynamic";

/**
 * POST /api/tos/fs/mkdir  { path: "/Volume1/Public/NewFolder" }
 * 代理 TOS /fileManage/CreateFolder（type=2 表示目录）。
 */
export async function POST(req: Request) {
  let payload: { path?: unknown };
  try {
    payload = (await req.json()) as { path?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }
  const path = typeof payload.path === "string" ? payload.path : "";
  if (!path) return NextResponse.json({ error: "path is required" }, { status: 400 });
  if (!isPlausibleTosPath(path)) return NextResponse.json({ error: "invalid path" }, { status: 400 });

  const result = await forwardToTosApi({
    action: "/CreateFolder",
    method: "POST",
    body: JSON.stringify({ path, type: 2 }),
    inboundHeaders: req.headers,
  });
  return new NextResponse(result.body, {
    status: result.status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
