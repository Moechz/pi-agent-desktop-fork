import { NextResponse } from "next/server";
import { forwardToTosApi } from "@/lib/tos-proxy";
import { isPlausibleTosPath } from "@/lib/tos-path";

export const dynamic = "force-dynamic";

/**
 * GET /api/tos/fs/list?path=/Volume1/Public
 * 经服务端代理转发到 TOS 官方文件管理 API（/fileManage/list）。
 * 用于应用内目录选择器：不依赖前端可读的 Cookie（TOS 会话 Cookie 多为 HttpOnly）。
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (path === null) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }
  if (!isPlausibleTosPath(path)) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }

  const result = await forwardToTosApi({
    action: "/list",
    method: "GET",
    query: { path },
    inboundHeaders: req.headers,
  });

  return new NextResponse(result.body, {
    status: result.status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
