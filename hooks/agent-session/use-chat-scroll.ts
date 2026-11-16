"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isNearBottom } from "./chat-scroll-metrics";

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
  /**
   * 是否把视图“钉”在底部。会话刚打开时为 true（内容随后异步长出来也要一直贴底），
   * 用户往上滚即解除，滚回底部再恢复。
   */
  const pinToBottomRef = useRef(true);

  const setScrollContainer = useCallback((node: HTMLDivElement | null) => {
    scrollContainerRef.current = node;
    setContainerNode(node);
  }, []);

  /**
   * 直接改 scrollTop（而不是 scrollIntoView）：
   * - 不会顺带滚动祖先/页面；
   * - 无动画可被后续渲染打断，适合“打开会话立刻贴底”这种必须到位的一次性定位。
   */
  const jumpToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    isAtBottomRef.current = true;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const handleScroll = useCallback(() => {
    const container = containerNode;
    if (!container) return;
    const atBottom = isNearBottom({
      scrollHeight: container.scrollHeight,
      scrollTop: container.scrollTop,
      clientHeight: container.clientHeight,
    });
    isAtBottomRef.current = atBottom;
    // 用户往上滚 → 解除钉底；滚回底部 → 恢复跟随
    pinToBottomRef.current = atBottom;
  }, [containerNode]);

  // Track user scroll position on the active container node
  useEffect(() => {
    if (!containerNode) return;
    handleScroll();
    containerNode.addEventListener("scroll", handleScroll, { passive: true });
    return () => containerNode.removeEventListener("scroll", handleScroll);
  }, [containerNode, handleScroll]);

  // 切换会话：复位定位状态并立即贴底（否则新打开的会话停在最早的历史，需手动下滑）
  // initialScrollDoneRef 原先置 true 后永不复位 → 换会话时“初次定位”不再执行，即本 bug 根因
  useEffect(() => {
    initialScrollDoneRef.current = false;
    isAtBottomRef.current = true;
    pinToBottomRef.current = true;
    pendingScrollToUserRef.current = false;
    if (sessionKey === undefined || sessionKey === null) return;
    // 此刻容器里通常还是空的：先跳一次，再在下一帧补一次（消息多半还没到，见下面的 ResizeObserver）
    jumpToBottom();
    const raf = window.requestAnimationFrame(() => jumpToBottom());
    return () => window.cancelAnimationFrame(raf);
  }, [sessionKey, jumpToBottom]);

  /**
   * ★ 打开会话后内容会分多次“长”出来：长会话的 markdown 渲染、代码高亮、字体/图片回流，
   *   都发生在消息数据到达之后。原先靠 0/120/400ms 三个定时器猜时机 —— 长会话必然猜不中，
   *   于是视图停在中途，用户要往下滚好几屏。改为观察内容容器的高度变化：只要仍处于“钉底”状态
   *   就继续贴底，直到用户自己往上滚（handleScroll 会解除钉底）。
   *   内容容器 = 末尾哨兵（messagesEndRef）的父节点，即消息列表的外层 wrapper。
   */
  useEffect(() => {
    if (!containerNode) return;
    const content = messagesEndRef.current?.parentElement;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      if (pinToBottomRef.current) jumpToBottom();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [containerNode, jumpToBottom]);

  // Initial load scroll to bottom once container mounts
  useEffect(() => {
    if (messageCount <= 0 || !containerNode) return;
    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      isAtBottomRef.current = true;
      jumpToBottom();
    }
  }, [messageCount, containerNode, jumpToBottom]);

  // When user sends a message, scroll down and lock to bottom
  useEffect(() => {
    if (pendingScrollToUserRef.current) {
      pendingScrollToUserRef.current = false;
      initialScrollDoneRef.current = true;
      isAtBottomRef.current = true;
      pinToBottomRef.current = true;
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
