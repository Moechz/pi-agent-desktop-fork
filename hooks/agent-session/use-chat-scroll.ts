"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseChatScrollOptions {
  messageCount: number;
  agentRunning: boolean;
  streamingMessage?: unknown;
  /** 当前会话 id：变化时复位“初次定位”标记并重新滚到底部 */
  sessionKey?: string | null;
}

export function useChatScroll({
  messageCount,
  agentRunning,
  streamingMessage,
  sessionKey,
}: UseChatScrollOptions) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(null);
  const pendingScrollToUserRef = useRef(false);
  const initialScrollDoneRef = useRef(false);
  const isAtBottomRef = useRef(true);

  const setScrollContainer = useCallback((node: HTMLDivElement | null) => {
    scrollContainerRef.current = node;
    setContainerNode(node);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const handleScroll = useCallback(() => {
    const container = containerNode;
    if (!container) return;
    const distanceToBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    // Consider user at bottom if within 80px of bottom
    isAtBottomRef.current = distanceToBottom < 80;
  }, [containerNode]);

  // Track user scroll position on the active container node
  useEffect(() => {
    if (!containerNode) return;
    handleScroll();
    containerNode.addEventListener("scroll", handleScroll, { passive: true });
    return () => containerNode.removeEventListener("scroll", handleScroll);
  }, [containerNode, handleScroll]);

  // 切换会话：复位定位状态并立即跳到底部（否则新打开的会话停在最早的历史，需手动下滑）
  // initialScrollDoneRef 原先置 true 后永不复位 → 换会话时“初次定位”不再执行，即本 bug 根因
  useEffect(() => {
    initialScrollDoneRef.current = false;
    isAtBottomRef.current = true;
    pendingScrollToUserRef.current = false;
    if (sessionKey === undefined || sessionKey === null) return;
    // 消息异步加载：多次尝试兼顾“内容尚未渲染完成”的时序
    const timers = [0, 120, 400].map((delay) =>
      window.setTimeout(() => {
        isAtBottomRef.current = true;
        scrollToBottom("auto");
      }, delay),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [sessionKey, scrollToBottom]);

  // Initial load scroll to bottom once container mounts
  useEffect(() => {
    if (messageCount <= 0 || !containerNode) return;
    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      isAtBottomRef.current = true;
      scrollToBottom("auto");
    }
  }, [messageCount, containerNode, scrollToBottom]);

  // When user sends a message, scroll down and lock to bottom
  useEffect(() => {
    if (pendingScrollToUserRef.current) {
      pendingScrollToUserRef.current = false;
      initialScrollDoneRef.current = true;
      isAtBottomRef.current = true;
      scrollToBottom("smooth");
    }
  }, [messageCount, scrollToBottom]);

  // During streaming/thinking/tool execution, auto-scroll to bottom if user is at bottom
  useEffect(() => {
    if (agentRunning && isAtBottomRef.current) {
      scrollToBottom("auto");
    }
  }, [streamingMessage, messageCount, agentRunning, scrollToBottom]);

  // When the agent settles or the transcript changes while at the bottom,
  // smoothly follow the new context without interrupting manual history review.
  useEffect(() => {
    if (!agentRunning && initialScrollDoneRef.current && isAtBottomRef.current) {
      scrollToBottom("smooth");
    }
  }, [agentRunning, messageCount, scrollToBottom]);

  return {
    messagesEndRef,
    scrollContainerRef,
    setScrollContainer,
    pendingScrollToUserRef,
    initialScrollDoneRef,
    scrollToBottom,
  };
}
