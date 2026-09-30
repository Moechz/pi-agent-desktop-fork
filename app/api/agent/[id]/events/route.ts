import { resolveSessionPath, getHeaderAsync } from "@/lib/session-reader";
import { getRpcSession, startRpcSession, getSessionOnlyTrustMap } from "@/lib/rpc-manager";
import { errorMessage, getRequestId, logApiError } from "@/lib/api-error";
import { evaluateProjectTrust } from "@/lib/project-trust-desktop";

export const dynamic = "force-dynamic";

// GET /api/agent/[id]/events - SSE stream of agent events
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const requestId = getRequestId(req);

  // Fast path: already-running session
  let session = getRpcSession(id);
  if (!session || !session.isAlive()) {
    const filePath = await resolveSessionPath(id);
    if (!filePath) {
      return new Response("Session not found", {
        status: 404,
        headers: { "x-request-id": requestId },
      });
    }
    const header = await getHeaderAsync(filePath);
    const cwd = header?.cwd ?? process.cwd();
    const trustGate = evaluateProjectTrust(cwd, { sessionOnlyTrust: getSessionOnlyTrustMap() });
    if (trustGate.action === "prompt") {
      return new Response(JSON.stringify(trustGate.payload), {
        status: 409,
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
        },
      });
    }
    try {
      ({ session } = await startRpcSession(id, filePath, cwd));
    } catch (error) {
      logApiError({ route: "/api/agent/[id]/events", method: "GET", requestId, error, params: { id } });
      return new Response(`Failed to start agent: ${errorMessage(error)}`, {
        status: 500,
        headers: { "x-request-id": requestId },
      });
    }
  }

  // Shared cleanup state — lifted out of ReadableStream so both `start`
  // (via abort signal) and `cancel` (via consumer-side cancellation) can
  // invoke the SAME idempotent cleanup. Without this, a silently-dropped
  // client (proxy timeout, network blip) that never fires `abort` would
  // leave the heartbeat interval running, the listener attached to the
  // wrapper, and the stream object pinned in memory forever.
  let controllerRef: ReadableStreamController<Uint8Array> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (heartbeat) clearInterval(heartbeat);
    if (unsubscribe) {
      try {
        unsubscribe();
      } catch {
        /* already unsubscribed */
      }
    }
    if (controllerRef) {
      try {
        // On the `cancel` path the controller is already disposed by the
        // runtime; on the `abort` path it is still writable. try/catch
        // covers both cases.
        controllerRef.close();
      } catch {
        /* already closed */
      }
    }
    req.signal?.removeEventListener("abort", cleanup);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;

      const encode = (data: unknown) => {
        const text = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(new TextEncoder().encode(text));
      };

      // Send initial connected event
      encode({ type: "connected", sessionId: id });

      unsubscribe = session.onEvent((event) => {
        encode(event);
      });

      // Heartbeat every 15s：既避开 Next.js 默认 ~120-150s 超时，也避开中转/relay 常见的
      // 30-60s 空闲超时（TNAS.online relay 场景）。注释行的 "30s" 保留在下方英文说明里以便对照。
      // keepAlive() is called only after a successful enqueue so that when the client
      // silently disappears, the idle timer eventually fires and destroys the wrapper.
      heartbeat = setInterval(() => {
        // desiredSize === null means the stream is closed/errored. Detect it
        // explicitly so we clean up even when the abort signal never fires
        // (e.g. reverse-proxy that drops the connection without sending FIN).
        if (controller.desiredSize === null) {
          cleanup();
          return;
        }
        try {
          controller.enqueue(new TextEncoder().encode(":\n\n"));
          session.keepAlive();
        } catch {
          // controller already closed; clean up so the idle timer can
          // eventually destroy the wrapper (no orphan).
          cleanup();
        }
      }, 15_000);

      // Detect client disconnect via abort signal
      req.signal?.addEventListener("abort", cleanup);
    },
    cancel() {
      // Consumer cancelled the stream (reader.cancel(), page close, etc.).
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      // 会话回复走 SSE（长连接流式）。**这两个头是给"中间代理"看的**（本应用 nginx 片段里
      // 已有 proxy_buffering off，但中转/relay/第三方反代不归我们管）：
      //   - no-transform：禁止中间层压缩/改写响应（压缩会引入缓冲 → 事件被憋住不吐）
      //   - X-Accel-Buffering: no：nginx 家族看到它会对该响应关闭 proxy_buffering
      // 与 app/api/files/[...path]/route.ts 既有写法保持一致；TNAS.online relay 场景实测需要。
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
