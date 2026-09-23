/**
 * AgentMode + tool-preset → effective tools / Ask-confirm membership.
 * Pure policy — no I/O, no React.
 */

export type AgentMode = "plan" | "ask" | "full";
export type ToolPreset = "none" | "default" | "full";

/**
 * 当前平台的 shell 工具名：Windows 上是 pi 的 `powershell` 工具；
 * `bash` 在 Windows 需已安装 Git Bash，否则执行时报「No bash shell found」→ 同事端表现为「不能执行命令」。
 */
export const SHELL_TOOL: string = process.platform === "win32" ? "powershell" : "bash";

/** 只读检索类工具：列目录 / 搜文件名 / 搜内容（预置默认带着，否则「不能列目录、不能搜索」） */
export const READ_SEARCH_TOOLS: readonly string[] = ["grep", "find", "ls"];

export const PLAN_TOOLS: readonly string[] = ["read", "grep", "find", "ls"];
export const ASK_CONFIRM_TOOLS: readonly string[] = [
  SHELL_TOOL,
  "bash",
  "powershell",
  "write",
  "edit",
  // LTM write/delete channels mutate durable project memory; keep them behind
  // the same Ask confirm as filesystem writes.
  "memory_save",
  "memory_forget",
];

export const PRESET_NONE: readonly string[] = [];
export const PRESET_DEFAULT: readonly string[] = ["read", SHELL_TOOL, "edit", "write", ...READ_SEARCH_TOOLS];
export const PRESET_FULL: readonly string[] = [SHELL_TOOL, "read", "edit", "write", ...READ_SEARCH_TOOLS];

export const DEFAULT_AGENT_MODE: AgentMode = "full";
export const DEFAULT_TOOL_PRESET: ToolPreset = "default";

export const EXECUTE_PLAN_PROMPT =
  "请按你刚才的计划开始执行。需要写入文件或运行命令前会请求我确认。";

export function isAgentMode(value: unknown): value is AgentMode {
  return value === "plan" || value === "ask" || value === "full";
}

export function isToolPreset(value: unknown): value is ToolPreset {
  return value === "none" || value === "default" || value === "full";
}

export function toolNamesForPreset(preset: ToolPreset): string[] {
  if (preset === "none") return [...PRESET_NONE];
  if (preset === "full") return [...PRESET_FULL];
  return [...PRESET_DEFAULT];
}

/**
 * Tools actually enabled for the session given mode + preset.
 * Plan always forces the four read-side tools (even if preset is none).
 */
export function effectiveToolsForMode(mode: AgentMode, preset: ToolPreset): string[] {
  if (mode === "plan") return [...PLAN_TOOLS];
  return toolNamesForPreset(preset);
}

/** Whether Ask mode requires a confirm dialog before this tool runs. */
export function needsAskConfirm(mode: AgentMode, toolName: string): boolean {
  if (mode !== "ask") return false;
  return (ASK_CONFIRM_TOOLS as readonly string[]).includes(toolName);
}

export function askBlockResult(): { block: true; reason: string } {
  return { block: true, reason: "Blocked by user (Ask mode)" };
}

/** Short human-readable summary for confirm dialogs. */
export function summarizeToolCall(toolName: string, input: unknown): string {
  if (!input || typeof input !== "object") {
    return `${toolName}(${JSON.stringify(input ?? {})})`;
  }
  const obj = input as Record<string, unknown>;
  if ((toolName === "bash" || toolName === "powershell") && typeof obj.command === "string") {
    const cmd = obj.command.length > 200 ? `${obj.command.slice(0, 200)}…` : obj.command;
    return `${toolName}: ${cmd}`;
  }
  if ((toolName === "write" || toolName === "edit") && typeof obj.path === "string") {
    return `${toolName}: ${obj.path}`;
  }
  if (typeof obj.file_path === "string") {
    return `${toolName}: ${obj.file_path}`;
  }
  try {
    const s = JSON.stringify(obj);
    return s.length > 240 ? `${toolName}: ${s.slice(0, 240)}…` : `${toolName}: ${s}`;
  } catch {
    return toolName;
  }
}
