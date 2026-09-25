"use client";

import { useEffect, useRef, useState, useCallback, useMemo, RefObject } from "react";
import type { AgentMessage, AssistantMessage, TextContent } from "@/lib/types";
import {
  buildRackLayout,
  entryIndexForTick,
  groupTurnsByUser,
  ratioForTick,
  tickIndexAtY,
  tickTopPx,
  type TurnGroup,
} from "../lib/minimap-ticks.ts";
import { useI18n } from "./I18nProvider";

interface Props {
  messages: AgentMessage[];
  streamingMessage: Partial<AgentMessage> | null;
  scrollContainer: RefObject<HTMLDivElement | null>;
  /** 保留以兼容调用方；刻度布局不再依赖 DOM 测量 */
  messageRefs?: RefObject<(HTMLDivElement | null)[]>;
}

const MINIMAP_WIDTH = 30;
const TOOLTIP_HEIGHT = 92; // 三行：用户一行 + 助手两行
const TOOLTIP_WIDTH = 260;

function getMessagePreview(msg: AgentMessage | Partial<AgentMessage>): string {
  if (msg.role === "user") {
    const content = msg.content;
    if (typeof content === "string") return content.slice(0, 200);
    if (Array.isArray(content)) {
      return (content as { type: string; text?: string }[])
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text!)
        .join("\n")
        .slice(0, 200);
    }
    return "";
  }
  if (msg.role === "assistant") {
    const blocks = (msg as Partial<AssistantMessage>).content ?? [];
    const text = blocks
      .filter((b): b is TextContent => b.type === "text")
      .map((b) => b.text)
      .join(" ");
    if (text) return text.slice(0, 200);
    const toolNames = blocks
      .filter((b) => b.type === "toolCall")
      .map((b) => (b as { type: string; toolName: string }).toolName);
    if (toolNames.length) return toolNames.join(", ");
    return "";
  }
  return "";
}

/** 一轮的提示内容：用户问的（一行）+ 助手答的（两行） */
function buildTurnPreview(
  all: (AgentMessage | Partial<AgentMessage>)[],
  turn: TurnGroup,
): { ask: string; reply: string } {
  let ask = "";
  let reply = "";
  for (const index of turn.indices) {
    const msg = all[index];
    if (!msg) continue;
    const text = getMessagePreview(msg);
    if (msg.role === "user" && !ask) ask = text;
    else if (msg.role === "assistant" && !reply) reply = text;
  }
  return { ask, reply: reply || ask };
}

/** 刻度颜色：用户消息用品牌色系，助手消息用中性色系 */
function getTickColor(msg: AgentMessage | Partial<AgentMessage>, hovered: boolean): string {
  if (msg.role === "user") return hovered ? "var(--accent)" : "var(--user-border)";
  return hovered ? "var(--text)" : "var(--border)";
}

function hasTextContent(msg: AgentMessage | Partial<AgentMessage>): boolean {
  if (msg.role === "user") return true;
  if (msg.role === "assistant") {
    const blocks = (msg as Partial<AssistantMessage>).content ?? [];
    return blocks.some((b) => b.type === "text");
  }
  return false;
}

export function ChatMinimap({ messages, streamingMessage, scrollContainer, messageRefs }: Props) {
  const { t } = useI18n();
  const [scrollRatio, setScrollRatio] = useState(0);
  const [viewportRatio, setViewportRatio] = useState(1);
  const [visible, setVisible] = useState(false);
  const [hoveredTick, setHoveredTick] = useState<number | null>(null);
  const [minimapHeightPx, setMinimapHeightPx] = useState(600);
  const draggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const allMessages = useMemo(
    () =>
      (streamingMessage
        ? [...messages, streamingMessage]
        : messages) as (AgentMessage | Partial<AgentMessage>)[],
    [messages, streamingMessage],
  );

  // 每个可显示条目 → 一根刻度（不再依赖 DOM 位置，故渲染顺序即分布顺序）
  // 刻度单位 = 一轮对话（以用户消息为界）：比“每条消息一根”少一半，且更好筛选（真机反馈）
  const turns = useMemo(() => {
    const groups = groupTurnsByUser(allMessages.map((msg) => msg.role));
    return groups.filter((group) => group.indices.some((index) => hasTextContent(allMessages[index])));
  }, [allMessages]);
  // 固定节距的刻度架：放得下就整条居中，放不下就让当前阅读位置停在中心。
  // activeRatio 取视口中心在整篇中的比例（不再把间距拉伸铺满容器）。
  const layout = useMemo(
    () =>
      buildRackLayout({
        entryCount: turns.length,
        railHeight: minimapHeightPx,
        activeRatio: scrollRatio + viewportRatio / 2,
      }),
    [turns.length, minimapHeightPx, scrollRatio, viewportRatio],
  );

  const allMessagesRef = useRef(allMessages);
  allMessagesRef.current = allMessages;

  const updatePositionsRef = useRef<() => void>(null!);
  updatePositionsRef.current = () => {
    const scrollEl = scrollContainer.current;
    if (!scrollEl) return;

    const totalH = scrollEl.scrollHeight;
    const clientH = scrollEl.clientHeight;
    const scrollable = totalH - clientH;

    setVisible(scrollable > 20);
    if (scrollable <= 0) {
      setScrollRatio(0);
      setViewportRatio(1);
    } else {
      setScrollRatio(scrollEl.scrollTop / scrollable);
      setViewportRatio(clientH / totalH);
    }
  };

  const updatePositions = useCallback(() => updatePositionsRef.current(), []);

  useEffect(() => {
    const el = scrollContainer.current;
    if (!el) return;
    el.addEventListener("scroll", updatePositions, { passive: true });
    const ro = new ResizeObserver(updatePositions);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    updatePositions();
    return () => {
      el.removeEventListener("scroll", updatePositions);
      ro.disconnect();
    };
  }, [scrollContainer, updatePositions]);

  useEffect(() => {
    const timeout = setTimeout(updatePositions, 50);
    return () => clearTimeout(timeout);
  }, [messages.length, updatePositions]);

  // 量取容器高度（提示条位置需要像素值；首次挂载读到 null 会算错 → 用 state + ResizeObserver）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setMinimapHeightPx(el.clientHeight);
    const observer = new ResizeObserver((records) => {
      for (const record of records) {
        const height = record.contentRect.height;
        if (height > 0) setMinimapHeightPx(height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollToMinimapRatio = useCallback(
    (viewportTopRatio: number) => {
      const el = scrollContainer.current;
      if (!el) return;
      const scrollable = el.scrollHeight - el.clientHeight;
      if (scrollable <= 0) return;
      const clamped = Math.max(0, Math.min(1 - viewportRatio, viewportTopRatio));
      el.scrollTop = (clamped / (1 - viewportRatio)) * scrollable;
    },
    [scrollContainer, viewportRatio],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!visible || layout.count === 0) return;

      draggingRef.current = true;
      const rect = e.currentTarget.getBoundingClientRect();

      // 点击/拖动的语义：把命中的条目转到视口中心（刻度是离散的，这样最可预测）
      const jumpTo = (clientY: number) => {
        const tick = tickIndexAtY(clientY - rect.top, layout);
        if (tick === null) return;
        const turn = turns[entryIndexForTick(tick, layout)];
        const anchor = turn ? messageRefs?.current?.[turn.anchorIndex] : null;
        if (anchor && typeof anchor.scrollIntoView === "function") {
          anchor.scrollIntoView({ block: "start", behavior: "auto" });
          return;
        }
        scrollToMinimapRatio(ratioForTick(tick, layout) - viewportRatio / 2);
      };

      jumpTo(e.clientY);

      const onMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        jumpTo(ev.clientY);
      };
      const onUp = () => {
        draggingRef.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [visible, layout, turns, viewportRatio, scrollToMinimapRatio, messageRefs],
  );

  if (!visible) return null;

  // 视口指示框：映射到刻度架上（与跟随逻辑同一坐标系，不会出现“框在 60%、当前刻度在中心”的矛盾）
  const totalForBox = Math.max(1, turns.length);
  const boxFrom = Math.floor(scrollRatio * totalForBox);
  const boxTo = Math.ceil((scrollRatio + viewportRatio) * totalForBox);
  const rawBoxTop = tickTopPx(boxFrom, layout);
  const rawBoxHeight = Math.max(layout.pitch, (boxTo - boxFrom) * layout.pitch);
  const viewportBoxTop = Math.max(0, Math.min(minimapHeightPx, rawBoxTop));
  const viewportBoxHeight = Math.max(
    4,
    Math.min(minimapHeightPx - viewportBoxTop, rawBoxTop + rawBoxHeight - viewportBoxTop),
  );

  const hoveredTurn =
    hoveredTick !== null && layout.count > 0
      ? turns[entryIndexForTick(hoveredTick, layout)]
      : undefined;
  const hoveredPreview = hoveredTurn ? buildTurnPreview(allMessages, hoveredTurn) : null;
  const tooltipTop =
    hoveredTick !== null
      ? Math.max(
          0,
          Math.min(
            minimapHeightPx - TOOLTIP_HEIGHT,
            tickTopPx(hoveredTick, layout) + layout.pitch / 2 - TOOLTIP_HEIGHT / 2,
          ),
        )
      : 0;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseLeave={() => setHoveredTick(null)}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setHoveredTick(tickIndexAtY(e.clientY - rect.top, layout));
      }}
      style={{
        width: MINIMAP_WIDTH,
        flexShrink: 0,
        position: "relative",
        cursor: "default",
        userSelect: "none",
        borderLeft: "1px solid var(--divider)",
        background: "var(--bg-elevated)",
        overflow: "visible",
      }}
    >
      {/* 视口指示框（拖动滚动） */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: viewportBoxTop,
          height: viewportBoxHeight,
          background: "var(--bg-subtle)",
          borderTop: "1px solid var(--border-subtle)",
          borderBottom: "1px solid var(--border-subtle)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* 中轴线：刻度挂在它上面，像一把纵向标尺 */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          bottom: 0,
          width: 1,
          background: "var(--border)",
          transform: "translateX(-50%)",
          zIndex: 0,
        }}
      />

      {/* 会话刻度：固定节距，只渲染轨道内的那些（条目上千时 DOM 也只有几十个节点） */}
      {layout.count > 0 &&
        Array.from({ length: layout.lastVisible - layout.firstVisible + 1 }, (_, offset) => {
          const tick = layout.firstVisible + offset;
          const turn = turns[entryIndexForTick(tick, layout)];
          const entry = turn ? allMessages[turn.anchorIndex] : undefined;
          if (!entry) return null;
          const isUser = entry.role === "user";
          const isHovered = hoveredTick === tick;
          return (
            <div
              key={tick}
              style={{
                position: "absolute",
                top: tickTopPx(tick, layout),
                height: layout.pitch,
                left: 0,
                right: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none", // 命中判定由容器 mousemove 统一做，避免子元素抢事件
                zIndex: 2,
              }}
            >
              <div
                style={{
                  width: isHovered ? (isUser ? 20 : 15) : isUser ? 14 : 9,
                  height: isHovered ? 3 : 2,
                  borderRadius: 2,
                  background: getTickColor(entry, isHovered),
                  transition: "width 0.1s, height 0.1s, background 0.1s",
                }}
              />
            </div>
          );
        })}

      {/* 只渲染悬停那一条的简要（不再全部渲染后互相避让） */}
      {hoveredPreview && (
        <div
          style={{
            position: "absolute",
            top: tooltipTop,
            right: "100%",
            marginRight: 6,
            background: "var(--bg)",
            borderTop: "1px solid var(--border)",
            borderRight: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
            borderLeft: `2px solid ${
              hoveredTurn && allMessages[hoveredTurn.anchorIndex]?.role === "user"
                ? "var(--user-border)"
                : "var(--border)"
            }`,
            borderRadius: "var(--radius-control)",
            padding: "4px 8px",
            width: TOOLTIP_WIDTH,
            zIndex: 100,
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.2, marginBottom: 2 }}>
            {t("minimap.you")}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text)",
              lineHeight: 1.35,
              whiteSpace: "normal",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 1,
              WebkitBoxOrient: "vertical",
            }}
          >
            {hoveredPreview.ask}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.2, marginTop: 4, marginBottom: 2 }}>
            {t("minimap.assistant")}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text)",
              lineHeight: 1.35,
              whiteSpace: "normal",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {hoveredPreview.reply}
          </div>
        </div>
      )}
    </div>
  );
}

// Hook to create a stable array of refs for messages
export function useMessageRefs(count: number): RefObject<(HTMLDivElement | null)[]> {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  refs.current = Array(count).fill(null).map((_, i) => refs.current[i] ?? null);
  return refs;
}
