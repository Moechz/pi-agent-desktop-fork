import React from "react";
import type { AgentMessage, ToolResultMessage } from "@/lib/types";
import { MessageView } from "./MessageView.tsx";

interface MessageListProps {
  messages: AgentMessage[];
  entryIds: Array<string | undefined>;
  toolResultsMap: Map<string, ToolResultMessage>;
  nextUserIdx: number[];
  nextAssistantIdx: number[];
  isStreaming: boolean;
  streamingMessage: Partial<AgentMessage> | null;
  isNew: boolean;
  agentRunning: boolean;
  forkingEntryId: string | null;
  onFork: (entryId: string) => void;
  onNavigate: (entryId: string) => void;
  onBranchMessage?: (entryId: string) => void;
  onEditContent: (content: string) => void;
  messageRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  modelNames: Record<string, string>;
  activeAgentIndicator?: React.ReactNode;
}

export const MessageList = React.memo(function MessageList({
  messages, entryIds, toolResultsMap, nextUserIdx, nextAssistantIdx,
  isStreaming, streamingMessage, isNew, agentRunning, forkingEntryId,
  onFork, onNavigate, onBranchMessage, onEditContent, messageRefs,
  modelNames, activeAgentIndicator,
}: MessageListProps) {
  let refIdx = 0;
  return (
    <>
      {messages.map((msg, idx) => {
        // P1（列表级）：非运行中，assistant 消息后（跳过 toolResult/custom）还有更晚的
        // assistant → 本条是轮次中间叙述 → 隐藏（错误消息例外，由 MessageView 红条接管）
        const piHiddenNarrative =
          !agentRunning &&
          msg.role === "assistant" &&
          !(msg as { errorMessage?: string }).errorMessage &&
          (() => {
            for (let j = idx + 1; j < messages.length; j++) {
              const r = messages[j].role;
              if (r === "user") return false;
              if (r === "assistant") return true;
              // toolResult / custom 等中间角色跳过
            }
            return false;
          })();
        if (piHiddenNarrative) return null;
        const isFirstUserMessage = idx === 0 && msg.role === "user";
        const canFork = !agentRunning && !isNew && !isFirstUserMessage;
        const canNavigate = !agentRunning;
        const isUserOrAssistant = msg.role === "user" || msg.role === "assistant";
        const showTimestamp = msg.role !== "assistant"
          || nextUserIdx[idx] !== -1
          || nextAssistantIdx[idx] === -1;
        const finalShowTimestamp = showTimestamp && !(isStreaming && idx === messages.length - 1);
        const prevAssistantEntryId = msg.role === "user" && idx > 0 && messages[idx - 1].role === "assistant"
          ? entryIds[idx - 1]
          : undefined;
        const prevTimestamp = idx > 0
          ? (messages[idx - 1] as AgentMessage & { timestamp?: number }).timestamp
          : undefined;

        const view = (
          <MessageView
            key={entryIds[idx] ?? `idx-${idx}`}
            message={msg}
            toolResults={toolResultsMap}
            modelNames={modelNames}
            entryId={entryIds[idx]}
            onFork={canFork ? onFork : undefined}
            forking={forkingEntryId === entryIds[idx]}
            onNavigate={canNavigate ? onNavigate : undefined}
            onBranchMessage={canNavigate ? onBranchMessage : undefined}
            prevAssistantEntryId={prevAssistantEntryId}
            onEditContent={onEditContent}
            showTimestamp={finalShowTimestamp}
            prevTimestamp={prevTimestamp}
          />
        );

        if (!isUserOrAssistant) return view;
        const currentRefIdx = refIdx++;
        return (
          <div
            key={entryIds[idx] ?? `idx-${idx}`}
            ref={(el) => {
              messageRefs.current[currentRefIdx] = el;
            }}
            style={{ contentVisibility: "auto", containIntrinsicSize: "auto 150px" }}
          >
            {view}
          </div>
        );
      })}
      {activeAgentIndicator}
      {isStreaming && streamingMessage && (
        <MessageView message={streamingMessage as AgentMessage} isStreaming modelNames={modelNames} />
      )}
    </>
  );
});
