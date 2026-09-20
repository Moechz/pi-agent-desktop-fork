"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import type { SessionInfo } from "@/lib/types";
import { FileExplorer } from "./FileExplorer";
import { SidebarHeader } from "./session-sidebar/SidebarHeader";
import { SessionTreeItem } from "./session-sidebar/SessionTree";
import { buildSessionTree, getRecentCwds } from "./session-sidebar/helpers";
import { useI18n } from "./I18nProvider";
import { apiJson } from "./apiJson";

interface Props {
  selectedSessionId: string | null;
  onSelectSession: (session: SessionInfo, isRestore?: boolean) => void;
  onNewSession?: (sessionId: string, cwd: string) => void;
  initialSessionId?: string | null;
  onInitialRestoreDone?: () => void;
  refreshKey?: number;
  onSessionDeleted?: (sessionId: string) => void;
  onBranchSession?: (session: SessionInfo) => void;
  onCloneSession?: (session: SessionInfo) => void;
  onExportSession?: (session: SessionInfo) => void;
  selectedCwd?: string | null;
  onCwdChange?: (cwd: string | null) => void;
  onOpenFile?: (filePath: string, fileName: string) => void;
  explorerRefreshKey?: number;
  onAtMention?: (relativePath: string) => void;
}

export function SessionSidebar({
  selectedSessionId,
  onSelectSession,
  onNewSession,
  initialSessionId,
  onInitialRestoreDone,
  refreshKey,
  onSessionDeleted,
  onBranchSession,
  onCloneSession,
  onExportSession,
  selectedCwd: selectedCwdProp,
  onCwdChange,
  onOpenFile,
  explorerRefreshKey,
  onAtMention,
}: Props) {
  const { t } = useI18n();
  const [allSessions, setAllSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedCwd = selectedCwdProp ?? null;
  const [explorerOpen, setExplorerOpen] = useState(false); // P18：默认收起（不持久化，重启回默认）
  const [explorerKey, setExplorerKey] = useState(0);
  const [sessionRefreshDone, setSessionRefreshDone] = useState(false);
  const [explorerRefreshDone, setExplorerRefreshDone] = useState(false);
  
  const sessionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const explorerRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSessions = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const data = await apiJson<{ sessions: SessionInfo[] }>(
        "/api/sessions",
        undefined,
        { fallback: t("common.failed") },
      );
      setAllSessions(data.sessions);
      setError(null);
      if (!showLoading) {
        setSessionRefreshDone(true);
        if (sessionRefreshTimerRef.current) clearTimeout(sessionRefreshTimerRef.current);
        sessionRefreshTimerRef.current = setTimeout(() => setSessionRefreshDone(false), 2000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.failed"));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [t]);

  const initialLoadDone = useRef(false);
  useEffect(() => {
    const isFirst = !initialLoadDone.current;
    initialLoadDone.current = true;
    loadSessions(isFirst);
  }, [loadSessions, refreshKey]);

  useEffect(() => {
    if (explorerRefreshKey !== undefined) setExplorerKey((k) => k + 1);
  }, [explorerRefreshKey]);

  const restoredRef = useRef(false);

  // Auto-select cwd and restore session from URL on first load
  useEffect(() => {
    if (allSessions.length === 0) return;

    if (selectedCwd === null) {
      // If restoring a session, set cwd to match that session
      if (initialSessionId && !restoredRef.current) {
        restoredRef.current = true;
        const target = allSessions.find((s) => s.id === initialSessionId);
        if (target) {
          onSelectSession(target, true);
          return;
        }
        // Session not found — notify parent so it can show the placeholder
        onInitialRestoreDone?.();
      }
      const cwds = getRecentCwds(allSessions);
      if (cwds.length > 0) onCwdChange?.(cwds[0]);
    }
  }, [allSessions, selectedCwd, initialSessionId, onCwdChange, onSelectSession, onInitialRestoreDone]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (sessionRefreshTimerRef.current) clearTimeout(sessionRefreshTimerRef.current);
      if (explorerRefreshTimerRef.current) clearTimeout(explorerRefreshTimerRef.current);
    };
  }, []);

  // P3-2 定制：不按 selectedCwd 过滤，改为按目录分组展示全部会话（最新活跃组在前）
  const groups = useMemo(() => {
    const byCwd = new Map<string, SessionInfo[]>();
    for (const s of allSessions) {
      const arr = byCwd.get(s.cwd);
      if (arr) arr.push(s);
      else byCwd.set(s.cwd, [s]);
    }
    // 组内按 modified 降序：活跃会话自动浮到组顶（对齐生产版 P15 递归排序语义）
    for (const arr of byCwd.values()) {
      arr.sort((a, b) => (new Date(b.modified).getTime() || 0) - (new Date(a.modified).getTime() || 0));
    }
    const list = Array.from(byCwd.entries()).map(([cwd, sessions]) => ({
      cwd,
      sessions,
      latest: Math.max(...sessions.map((s) => new Date(s.modified).getTime() || 0)),
    }));
    list.sort((a, b) => b.latest - a.latest);
    return list;
  }, [allSessions]);

  // P3-2：组折叠状态（cwd→收起；默认全展开，不持久化）
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // P3 运行点：轮询 /api/agent/{id} 的 running+state.isStreaming（实时真值；
  // modified-diff 方案不可行——流式期间 modified 只在块落盘时变，长时间工具执行会误判空闲）
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/sessions");
        if (!r.ok) return;
        const d = (await r.json()) as { sessions?: { id: string }[] };
        const ids = (d.sessions ?? []).map((s) => s.id);
        const results = await Promise.all(
          ids.map(async (id) => {
            try {
              const a = await fetch(`/api/agent/${encodeURIComponent(id)}`);
              if (!a.ok) return [id, false] as const;
              const j = (await a.json()) as { running?: boolean; state?: { isStreaming?: boolean } };
              return [id, !!(j.running && j.state?.isStreaming)] as const;
            } catch {
              return [id, false] as const;
            }
          }),
        );
        if (alive) setRunningIds(new Set(results.filter(([, run]) => run).map(([id]) => id)));
      } catch {
        /* 轮询失败忽略，下轮重试 */
      }
    };
    tick();
    const iv = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <SidebarHeader
        selectedCwd={selectedCwd}
        onCwdChange={onCwdChange}
        onNewSession={onNewSession}
        allSessions={allSessions}
        loadSessions={loadSessions}
        sessionRefreshDone={sessionRefreshDone}
        initialSessionId={initialSessionId}
        restoredRef={restoredRef}
      />

      {/* Session list */}
      <div
        style={{
          flex: explorerOpen && (selectedCwdProp || selectedCwd) ? "1 1 0" : "1 1 auto",
          overflowY: "auto",
          padding: "0",
          minHeight: 80,
        }}
      >
        {loading && (
          <div style={{ padding: "16px 14px", color: "var(--text-muted)", fontSize: 13 }}>
            {t("common.loading")}
          </div>
        )}
        {error && (
          <div style={{ padding: "12px 14px", color: "var(--danger)", fontSize: 13 }}>
            {error}
          </div>
        )}
        {!loading && !error && allSessions.length === 0 && (
          <div style={{ padding: "16px 14px", color: "var(--text-muted)", fontSize: 13 }}>
            {t("sidebar.noSessions")}
          </div>
        )}
        {groups.map((g) => {
          const groupTree = buildSessionTree(g.sessions);
          const collapsed = !!collapsedGroups[g.cwd];
          const lastSegs = g.cwd.split("/").filter(Boolean).slice(-2).join("/");
          return (
            <div key={g.cwd}>
              {/* P3-2 组头：文件夹图标（收起=闭合/展开=打开）+ 目录末两段（uppercase）
                  + 运行中计数胶囊「N ▶」（run>0 才显示）；点图标切折叠，点正文选为当前项目 */}
              <button
                onClick={() => onCwdChange?.(g.cwd)}
                title={g.cwd}
                className={`flex w-full items-center gap-1.5 border-none bg-transparent text-left cursor-pointer transition-colors duration-150 hover:bg-bg-hover ${
                  selectedCwd === g.cwd ? "text-accent" : "text-text-muted hover:text-text"
                }`}
                style={{ padding: "8px 12px 4px" }}
              >
                <span
                  role="button"
                  aria-label={collapsed ? "展开分组" : "收起分组"}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCollapsedGroups((m) => ({ ...m, [g.cwd]: !m[g.cwd] }));
                  }}
                  className="flex shrink-0 cursor-pointer items-center justify-center bg-transparent p-0.5"
                  style={{
                    color: collapsed ? "var(--accent)" : "var(--text-muted)",
                    marginRight: 2,
                  }}
                >
                  {collapsed ? (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 0-1.69.9L9.6 8.9a2 2 0 0 1-1.69.9H4a2 2 0 0 0-2 2v6.2a2 2 0 0 0 2 2Z" />
                    </svg>
                  ) : (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 14l1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2" />
                    </svg>
                  )}
                </span>
                <span
                  className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
                  style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase" }}
                >
                  {lastSegs}
                </span>
                {(() => {
                  const run = g.sessions.filter((s) => runningIds.has(s.id)).length;
                  return run > 0 ? (
                    <span
                      title="运行中"
                      className="shrink-0"
                      style={{
                        fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 9999,
                        background: "var(--success-bg)", color: "var(--success)",
                        border: "1px solid var(--success-border)",
                      }}
                    >
                      {run} ▶
                    </span>
                  ) : null;
                })()}
              </button>
              {!collapsed && (
                <div style={{ paddingLeft: 0 }}>
                  {groupTree.map((node) => (
                    <SessionTreeItem
                      key={node.session.id}
                      node={node}
                      selectedSessionId={selectedSessionId}
                      onSelectSession={onSelectSession}
                      onRenamed={loadSessions}
                      onSessionDeleted={(id) => {
                        onSessionDeleted?.(id);
                        loadSessions();
                      }}
                      onBranchSession={onBranchSession}
                      onCloneSession={onCloneSession}
                      onExportSession={onExportSession}
                      depth={0}
                      isRunning={runningIds.has(node.session.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* File Explorer section */}
      {(selectedCwdProp || selectedCwd) && (
        <div
          style={{
            borderTop: "1px solid var(--divider)",
            display: "flex",
            flexDirection: "column",
            flex: explorerOpen ? "1 1 0" : "0 0 auto",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <button
              onClick={() => setExplorerOpen((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flex: 1,
                padding: "6px 10px",
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                textAlign: "left",
              }}
            >
              <svg
                width="9"
                height="9"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform: explorerOpen ? "rotate(90deg)" : "none",
                  transition: "transform 0.15s",
                  flexShrink: 0,
                }}
              >
                <polyline points="3 2 7 5 3 8" />
              </svg>
              {t("sidebar.explorer")}
            </button>
            <button
              onClick={() => {
                setExplorerKey((k) => k + 1);
                setExplorerRefreshDone(true);
                if (explorerRefreshTimerRef.current) clearTimeout(explorerRefreshTimerRef.current);
                explorerRefreshTimerRef.current = setTimeout(() => setExplorerRefreshDone(false), 2000);
              }}
              title={t("sidebar.refreshExplorer")}
              aria-label={t("sidebar.refreshExplorer")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 26,
                height: 26,
                padding: 0,
                marginRight: 6,
                background: explorerRefreshDone ? "var(--success-bg)" : "none",
                border: "none",
                color: explorerRefreshDone ? "var(--success)" : "var(--text-dim)",
                cursor: "pointer",
                borderRadius: "var(--radius-control)",
                flexShrink: 0,
                transition: "color 0.3s, background 0.3s",
              }}
              onMouseEnter={(e) => {
                if (explorerRefreshDone) return;
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.background = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (explorerRefreshDone) return;
                e.currentTarget.style.color = "var(--text-dim)";
                e.currentTarget.style.background = "none";
              }}
            >
              {explorerRefreshDone ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              )}
            </button>
          </div>
          {explorerOpen && (
            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
              <FileExplorer
                cwd={selectedCwdProp ?? selectedCwd!}
                onOpenFile={onOpenFile ?? (() => {})}
                refreshKey={explorerKey}
                onAtMention={onAtMention}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
