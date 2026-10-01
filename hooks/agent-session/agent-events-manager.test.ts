import test, { describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { AgentEventsManager, type AgentEvent } from "./agent-events-manager.ts";

class MockEventSource {
  url: string;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  static instances: MockEventSource[] = [];
}

describe("AgentEventsManager", () => {
  let originalEventSource: typeof globalThis.EventSource;

  beforeEach(() => {
    originalEventSource = globalThis.EventSource;
    (globalThis as unknown as { EventSource: typeof MockEventSource }).EventSource = MockEventSource;
    MockEventSource.instances = [];
  });

  afterEach(() => {
    (globalThis as unknown as { EventSource: typeof globalThis.EventSource }).EventSource = originalEventSource;
  });

  test("connects to the correct URL and parses incoming JSON messages", () => {
    const manager = new AgentEventsManager();
    const events: AgentEvent[] = [];
    manager.setEventHandler((e) => events.push(e));

    manager.connect("session-123");

    assert.equal(MockEventSource.instances.length, 1);
    const es = MockEventSource.instances[0];
    assert.equal(es.url, "/api/agent/session-123/events");
    assert.equal(es.closed, false);
    assert.equal(manager.getStatus(), "connecting");

    // Trigger onopen
    es.onopen!();
    assert.equal(manager.getStatus(), "connected");

    // Send a message
    assert.ok(es.onmessage);
    es.onmessage({ data: JSON.stringify({ type: "agent_start", foo: "bar" }) });

    assert.equal(events.length, 1);
    assert.deepEqual(events[0], { type: "agent_start", foo: "bar" });
  });

  test("handles JSON parsing errors gracefully", () => {
    const manager = new AgentEventsManager();
    const events: AgentEvent[] = [];
    manager.setEventHandler((e) => events.push(e));

    manager.connect("session-123");
    const es = MockEventSource.instances[0];

    // Mock console.error to avoid polluting output
    const originalConsoleError = console.error;
    let loggedError = false;
    console.error = () => { loggedError = true; };

    try {
      es.onmessage!({ data: "invalid json" });
      assert.equal(events.length, 0);
      assert.equal(loggedError, true);
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("disconnects and cleans up EventSource on cleanup", () => {
    const manager = new AgentEventsManager();
    manager.connect("session-123");

    const es = MockEventSource.instances[0];
    assert.equal(es.closed, false);

    manager.cleanup();
    assert.equal(es.closed, true);
    assert.equal(manager.getEventSource(), null);
    assert.equal(manager.getStatus(), "disconnected");
  });

  // Reconnect/backoff tests drive the mocked clock instead of sleeping: the
  // production reconnect timer uses global setTimeout, which mock.timers
  // intercepts (same pattern as lib/rpc-manager.test.ts). The reconnect
  // callback runs synchronously inside tick(), so instance counts can be
  // asserted immediately afterwards.
  test("auto-reconnects when onerror is triggered and agent is running", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const manager = new AgentEventsManager(10); // 10ms reconnect delay
      manager.setAgentRunning(true);
      manager.connect("session-123");

      assert.equal(MockEventSource.instances.length, 1);
      const es1 = MockEventSource.instances[0];

      // Trigger error — schedules a (mocked) reconnect timer
      es1.onerror!();

      assert.equal(es1.closed, true);
      assert.equal(manager.getEventSource(), null);
      assert.equal(manager.getStatus(), "connecting");

      // Advance the mocked clock past the reconnect delay
      mock.timers.tick(15);

      assert.equal(MockEventSource.instances.length, 2);
      const es2 = MockEventSource.instances[1];
      assert.equal(es2.url, "/api/agent/session-123/events");
      assert.equal(es2.closed, false);

      manager.cleanup();
    } finally {
      mock.timers.reset();
    }
  });

  test("agent 未运行时也重连（旧行为是直接 disconnected → 切网络后永久失联，已改）", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const manager = new AgentEventsManager(10);
      manager.setAgentRunning(false);
      manager.connect("session-123");

      assert.equal(MockEventSource.instances.length, 1);
      const es1 = MockEventSource.instances[0];

      es1.onerror!();

      assert.equal(es1.closed, true);
      // 不再是 disconnected；而是进入 connecting 并按退避重连
      assert.equal(manager.getStatus(), "connecting");
      mock.timers.tick(15);

      assert.equal(MockEventSource.instances.length, 2, "应已建立新的 EventSource");
      manager.cleanup();
    } finally {
      mock.timers.reset();
    }
  });

  test("connect expectRunning=true reconnects on an early onerror without a prior setAgentRunning (M4)", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const manager = new AgentEventsManager(10);
      // Reproduces the handleSend timing: connectEvents() fires before the
      // [agentRunning] effect has propagated manager.setAgentRunning(true),
      // so agentRunning is still false when onerror arrives. The stream is
      // expected, so an early onerror must reconnect — not silently
      // disconnect and leave the UI stuck on "Waiting for model…".
      manager.connect("session-123", true, true);

      const es1 = MockEventSource.instances[0];
      es1.onerror!();

      assert.equal(es1.closed, true);
      assert.equal(manager.getStatus(), "connecting");

      mock.timers.tick(15);
      assert.equal(MockEventSource.instances.length, 2);
      manager.cleanup();
    } finally {
      mock.timers.reset();
    }
  });

  test("exponential backoff delay doubles on consecutive errors", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const manager = new AgentEventsManager(10); // 10ms base delay
      manager.setAgentRunning(true);
      manager.connect("session-123");

      const es1 = MockEventSource.instances[0];
      es1.onerror!(); // 1st failure -> reconnectAttempts = 1 -> delay 10ms
      assert.equal(manager.getReconnectAttempts(), 1);

      mock.timers.tick(10);
      assert.equal(MockEventSource.instances.length, 2);

      const es2 = MockEventSource.instances[1];
      es2.onerror!(); // 2nd failure -> reconnectAttempts = 2 -> delay 20ms
      assert.equal(manager.getReconnectAttempts(), 2);

      // Advance 12ms (not enough for the 20ms delay)
      mock.timers.tick(12);
      assert.equal(MockEventSource.instances.length, 2);

      // Advance another 12ms (total 24ms, enough for the 20ms delay)
      mock.timers.tick(12);
      assert.equal(MockEventSource.instances.length, 3);

      manager.cleanup();
    } finally {
      mock.timers.reset();
    }
  });

  test("持续重连：超过上限才 failed（不再 5 次就放弃）", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const manager = new AgentEventsManager(5); // 5ms base delay
      manager.setAgentRunning(true);
      manager.connect("session-123");

      // 连续 10 次错误（旧实现在第 6 次就 failed —— 切网络场景因此彻底失联）
      for (let i = 0; i < 10; i++) {
        const es = MockEventSource.instances[i];
        assert.ok(es);
        es.onerror!();
        assert.notEqual(manager.getStatus(), "failed", `第 ${i + 1} 次错误不应放弃重连`);
        mock.timers.tick(5 * Math.pow(2, i) + 10);
      }
      assert.equal(MockEventSource.instances.length, 11); // 1 原始 + 10 次重连
      assert.equal(manager.getReconnectAttempts(), 10);
      manager.cleanup();
    } finally {
      mock.timers.reset();
    }
  });

  test("agentRunning=false 时也重连（切网络后 agent 看似空闲，旧实现会直接断开）", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const manager = new AgentEventsManager(10);
      manager.setAgentRunning(false);
      manager.connect("session-123");

      const es1 = MockEventSource.instances[0];
      es1.onerror!();
      assert.equal(manager.getStatus(), "connecting");
      mock.timers.tick(15);
      assert.equal(MockEventSource.instances.length, 2, "应已重连");
      manager.cleanup();
    } finally {
      mock.timers.reset();
    }
  });

  test("页面回到前台（visibilitychange）立即重连", () => {
    const listeners: Record<string, () => void> = {};
    const fakeDoc = {
      visibilityState: "visible" as string,
      addEventListener: (n: string, h: () => void) => { listeners[n] = h; },
      removeEventListener: (n: string) => { delete listeners[n]; },
    };
    (globalThis as unknown as { document?: unknown }).document = fakeDoc;
    (globalThis as unknown as { window?: unknown }).window = {
      addEventListener: (n: string, h: () => void) => { listeners[n] = h; },
      removeEventListener: (n: string) => { delete listeners[n]; },
    };
    try {
      const manager = new AgentEventsManager(10_000); // 退避很长：若靠计时器不会立刻重连
      manager.connect("session-123");
      assert.equal(MockEventSource.instances.length, 1);
      assert.ok(listeners["visibilitychange"], "应已注册 visibilitychange");
      listeners["visibilitychange"]();
      assert.equal(MockEventSource.instances.length, 2, "回到前台应立刻重连（不等退避）");
      manager.cleanup();
    } finally {
      delete (globalThis as unknown as { document?: unknown }).document;
      delete (globalThis as unknown as { window?: unknown }).window;
    }
  });
});
