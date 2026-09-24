import { NextResponse } from "next/server";
import { forwardToTosApi } from "@/lib/tos-proxy";
import { isPlausibleTosPath } from "@/lib/tos-path";

export const dynamic = "force-dynamic";

/**
 * GET /api/tos/fs/info?path=/Volume1/Public
 * 代理 TOS /fileManage/folderInfoAll —— 目录详情，含 is_only_read（可写性预检）。
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (path === null) return NextResponse.json({ error: "path is required" }, { status: 400 });
  if (!isPlausibleTosPath(path)) return NextResponse.json({ error: "invalid path" }, { status: 400 });

  const result = await forwardToTosApi({
    action: "/folderInfoAll",
    method: "GET",
    query: { path },
    inboundHeaders: req.headers,
  });
  return new NextResponse(result.body, {
    status: result.status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
