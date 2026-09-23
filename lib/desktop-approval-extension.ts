/**
 * Inline pi extension: Ask-mode confirms for bash/write/edit.
 */
import type { ExtensionAPI, ExtensionFactory, InlineExtension } from "@earendil-works/pi-coding-agent";
import {
  askBlockResult,
  needsAskConfirm,
  summarizeToolCall,
  type AgentMode,
} from "./approval-policy.ts";

export type AgentModeRef = { current: AgentMode };

export function createDesktopApprovalFactory(modeRef: AgentModeRef): ExtensionFactory {
  return (pi: ExtensionAPI) => {
    pi.on("tool_call", async (event, ctx) => {
      if (!needsAskConfirm(modeRef.current, event.toolName)) return;
      // 标题用 i18n key 约定传给界面（服务端不知道界面语言）：i18n:<key>|<参数>
      const ok = await ctx.ui.confirm(
        `i18n:approval.confirmToolTitle|${event.toolName}`,
        summarizeToolCall(event.toolName, event.input)
      );
      if (!ok) return askBlockResult();
    });
  };
}

export function desktopApprovalInlineExtension(modeRef: AgentModeRef): InlineExtension {
  return {
    name: "desktop-approval",
    factory: createDesktopApprovalFactory(modeRef),
  };
}
