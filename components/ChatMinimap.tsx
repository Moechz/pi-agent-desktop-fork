"use client";

import { useEffect, useRef, useState, useCallback, useMemo, RefObject } from "react";
import type { AgentMessage, AssistantMessage, TextContent } from "@/lib/types";
import { buildTickLayout, entryIndexFor, tickIndexAt, tickTopPct } from "../lib/minimap-ticks.ts";
import { useI18n } from "./I18nProvider";

interface Props {
  messages: AgentMessage[];
  streamingMessage: Partial<AgentMessage> | null;
  scrollContainer: RefObject<HTMLDivElement | null>;
  /** 保留以兼容调用方；刻度布局不再依赖 DOM 测量 */
  messageRefs?: RefObject<(HTMLDivElement | null)[]>;
}

const MINIMAP_WIDTH = 30;
const TOOLTIP_HEIGHT = 26;

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

export function ChatMinimap({ messages, streamingMessage, scrollContainer }: Props) {
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
  const entries = useMemo(
    () => allMessages.filter((msg) => hasTextContent(msg)),
    [allMessages],
  );
  const layout = useMemo(() => buildTickLayout(entries.length), [entries.length]);

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
      if (!visible) return;

      draggingRef.current = true;
      const rect = e.currentTarget.getBoundingClientRect();
      const clickRatio = (e.clientY - rect.top) / rect.height;
      const grabOffset = clickRatio - scrollRatio * (1 - viewportRatio);
      const insideBox = grabOffset >= 0 && grabOffset <= viewportRatio;
      const offset = insideBox ? grabOffset : viewportRatio / 2;

      scrollToMinimapRatio(clickRatio - offset);

      const onMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        const r = (ev.clientY - rect.top) / rect.height;
        scrollToMinimapRatio(r - offset);
      };
      const onUp = () => {
        draggingRef.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [visible, viewportRatio, scrollRatio, scrollToMinimapRatio],
  );

  if (!visible) return null;

  const viewportBoxTop = scrollRatio * (1 - viewportRatio) * 100;
  const viewportBoxHeight = viewportRatio * 100;

  const hoveredEntry =
    hoveredTick !== null && layout.count > 0
      ? entries[entryIndexFor(hoveredTick, layout, entries.length)]
      : undefined;
  const hoveredPreview = hoveredEntry ? getMessagePreview(hoveredEntry) : "";
  const tooltipTop =
    hoveredTick !== null
      ? Math.max(
          0,
          Math.min(
            minimapHeightPx - TOOLTIP_HEIGHT,
            (tickTopPct(hoveredTick, layout) / 100) * minimapHeightPx - TOOLTIP_HEIGHT / 2,
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
        const ratio = (e.clientY - rect.top) / rect.height;
        setHoveredTick(tickIndexAt(ratio, layout));
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
          top: `${viewportBoxTop}%`,
          height: `${viewportBoxHeight}%`,
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

      {/* 会话刻度：等分槽位，刻度画在槽中心（均匀分布 + 命中唯一） */}
      {layout.count > 0 &&
        Array.from({ length: layout.count }, (_, tick) => {
          const entry = entries[entryIndexFor(tick, layout, entries.length)];
          if (!entry) return null;
          const isUser = entry.role === "user";
          const isHovered = hoveredTick === tick;
          return (
            <div
              key={tick}
              style={{
                position: "absolute",
                top: `${tick * layout.slotPct}%`,
                height: `${layout.slotPct}%`,
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
      {hoveredEntry && hoveredPreview && (
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
              hoveredEntry.role === "user" ? "var(--user-border)" : "var(--border)"
            }`,
            borderRadius: "var(--radius-control)",
            padding: "2px 7px",
            width: 220,
            zIndex: 100,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "var(--text-dim)",
              lineHeight: 1.2,
              marginBottom: 1,
            }}
          >
            {hoveredEntry.role === "user" ? t("minimap.you") : t("minimap.assistant")}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text)",
              lineHeight: 1.4,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {hoveredPreview}
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
