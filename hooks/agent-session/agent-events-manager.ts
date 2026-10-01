import { withBasePath } from "../../lib/base-path.ts";
import type { AgentMessage } from "@/lib/types";

/**
 * Events pushed from server to client via SSE. Each variant is discriminated
 * by `type`, so `switch (event.type)` narrows automatically — no `as` casts
 * needed at call sites.
 *
 * Note: the server-side `AgentEvent` in `lib/rpc-manager.ts` is intentionally
 * a separate, broader type — the server only forwards pi's events without
 * narrowing, and the two runtimes should not share a type.
 */
export type ExtensionUiRequestEvent = {
  type: "extension_ui_request";
  id: string;
  method: "confirm" | "select" | "input" | "editor";
  title: string;
  message?: string;
  options?: string[];
  placeholder?: string;
  prefill?: string;
  timeout?: number;
};

export type ExtensionUiNotifyEvent = {
  type: "extension_ui_notify";
  message: string;
  notifyType?: "info" | "warning" | "error";
};

export type AgentEvent =
  | { type: "connected"; sessionId: string }
  | { type: "agent_start" }
  | { type: "agent_end" }
  | { type: "agent_settled" }
  | { type: "agent_error"; errorMessage: string }
  | { type: "message_start"; message: Partial<AgentMessage> }
  | { type: "message_update"; message: Partial<AgentMessage> }
  | { type: "message_end"; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string }
  | { type: "tool_execution_end"; toolCallId: string }
  | { type: "auto_retry_start"; attempt: number; maxAttempts: number; errorMessage?: string }
  | { type: "auto_retry_end" }
  | { type: "auto_compaction_start" }
  | { type: "compaction_start" }
  | { type: "auto_compaction_end"; errorMessage?: string; aborted?: boolean }
  | { type: "compaction_end"; errorMessage?: string; aborted?: boolean }
  | { type: "queue_update"; steering: readonly string[]; followUp: readonly string[] }
  | {
      type: "follow_up_queue_update";
      revision: number;
      items: Array<{ id: string; message: string; attachmentCount: number; createdAt: number }>;
    }
  | ExtensionUiRequestEvent
  | ExtensionUiNotifyEvent;

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "failed";

export class AgentEventsManager {
  /**
   * 重连上限与延迟封顶。
   *
   * 2026-10-01 真机教训（TNAS.online relay 场景）：用户**切换网络**时那条 SSE 长连接会断，
   * 旧实现两个缺陷让它彻底失联 ——
   *   ① `reconnectAttempts > 5` 就置 failed、不再重连（切网络后 5 次重试 ≈ 31s 内就放弃）；
   *   ② onerror 里**只有 `agentRunning` 为真才重连**，否则直接 disconnected。
   * 现在：只要还有会话 id 就持续重连（延迟封顶 30s），并在页面回到前台 / 网络恢复时立即重连。
   */
  private static readonly MAX_RECONNECT_ATTEMPTS = 60;
  private static readonly MAX_RECONNECT_DELAY_MS = 30_000;

  private eventSource: EventSource | null = null;
  private wakeListenersAttached = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private agentRunning = false;
  private handleAgentEvent: ((event: AgentEvent) => void) | null = null;
  private statusChangeHandler: ((status: ConnectionStatus) => void) | null = null;
  private sid: string | null = null;
  private reconnectDelay: number;
  private reconnectAttempts = 0;
  private status: ConnectionStatus = "disconnected";

  constructor(reconnectDelay = 1000) {
    this.reconnectDelay = reconnectDelay;
  }

  private setStatus(newStatus: ConnectionStatus) {
    this.status = newStatus;
    this.statusChangeHandler?.(newStatus);
  }

  setStatusChangeHandler(handler: ((status: ConnectionStatus) => void) | null) {
    this.statusChangeHandler = handler;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  setAgentRunning(running: boolean) {
    this.agentRunning = running;
    if (!running) {
      this.disconnect();
      this.setStatus("disconnected");
    }
  }

  getAgentRunning() {
    return this.agentRunning;
  }

  setEventHandler(handler: (event: AgentEvent) => void) {
    this.handleAgentEvent = handler;
  }

  getEventSource() {
    return this.eventSource;
  }

  /**
   * 页面回到前台 / 网络恢复时立即重连（不等退避计时器）。
   * 依据：切 Wi‑Fi、休眠唤醒、relay 侧链路抖动后，浏览器往往**不会**主动重开这条 SSE；
   * “页面回到前台”是最强的“我还在用”信号（2026-10-01 relay 场景实测缺口）。
   */
  private wakeReconnect() {
    if (!this.sid) return;
    if (this.getStatus() === "connected") return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.connect(this.sid, true, this.agentRunning);
  }

  private attachWakeListeners() {
    if (this.wakeListenersAttached) return;
    if (typeof document === "undefined" || typeof window === "undefined") return;
    this.wakeListenersAttached = true;
    document.addEventListener("visibilitychange", this.onWake);
    window.addEventListener("online", this.onWake);
  }

  private detachWakeListeners() {
    if (!this.wakeListenersAttached) return;
    this.wakeListenersAttached = false;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onWake);
    if (typeof window !== "undefined") window.removeEventListener("online", this.onWake);
  }

  private onWake = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    this.wakeReconnect();
  };

  connect(sid: string, resetAttempts = true, expectRunning?: boolean) {
    this.sid = sid;
    if (resetAttempts) {
      this.reconnectAttempts = 0;
    }
    // Callers (use-agent-events.connectEvents) may fire connect() before the
    // React [agentRunning] effect has propagated setAgentRunning(true). Pass
    // expectRunning to express intent synchronously so an early onerror takes
    // the reconnect path instead of silently disconnecting (which left the UI
    // stuck on "Waiting for model…").
    if (expectRunning !== undefined) this.agentRunning = expectRunning;
    this.disconnect();
    this.setStatus("connecting");

    this.attachWakeListeners();
    const es = new EventSource(withBasePath(`/api/agent/${encodeURIComponent(sid)}/events`));
    this.eventSource = es;

    es.onopen = () => {
      if (this.eventSource === es) {
        this.reconnectAttempts = 0;
        this.setStatus("connected");
      }
    };

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as AgentEvent;
        this.handleAgentEvent?.(event);
      } catch (err) {
        console.error("Failed to parse agent event", { data: e.data, error: err });
      }
    };

    es.onerror = () => {
      if (this.eventSource !== es) return;
      this.disconnect();
      if (!this.sid) {
        this.setStatus("disconnected");
        return;
      }
      this.reconnectAttempts++;
      if (this.reconnectAttempts > AgentEventsManager.MAX_RECONNECT_ATTEMPTS) {
        this.setStatus("failed");
        return;
      }
      this.setStatus("connecting");
      // Exponential backoff: base, 2x, 4x …，延迟封顶 30s
      const delay = Math.min(
        AgentEventsManager.MAX_RECONNECT_DELAY_MS,
        this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      );
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (this.sid) {
          this.connect(this.sid, false, this.agentRunning);
        }
      }, delay);
    };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  cleanup() {
    this.detachWakeListeners();
    this.disconnect();
    this.sid = null;
    this.handleAgentEvent = null;
    this.setStatus("disconnected");
  }
}
