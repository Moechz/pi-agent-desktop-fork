"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ModalSurface } from "./ModalSurface";
import { useI18n } from "./I18nProvider";
import {
  setDirectoryPickerHandler,
  type DirectoryPickerRequest,
  type DirectoryPickerResolver,
} from "../lib/directory-picker.ts";
import { tosCreateFolder, tosErrorKey, tosFolderInfo, tosListDirectory, type TosDirEntry } from "../lib/tos-api.ts";
import { breadcrumbTosPath, isPlausibleTosPath, joinTosPath, normalizeTosPath, parentTosPath } from "../lib/tos-path.ts";

const DEFAULT_START_PATH = "/Volume1";

/**
 * TOS 环境下的目录选择弹窗（数据来自 TOS 官方文件管理 API，权限由 TOS 统一管控）。
 * 桌面版不显示：Electron 原生弹窗优先级更高（见 pickDirectoryFromHost）。
 */
export function DirectoryPickerHost() {
  const { t } = useI18n();
  const [request, setRequest] = useState<DirectoryPickerRequest | null>(null);
  const resolverRef = useRef<DirectoryPickerResolver | null>(null);
  const [currentPath, setCurrentPath] = useState(DEFAULT_START_PATH);
  const [entries, setEntries] = useState<TosDirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [pathDraft, setPathDraft] = useState(DEFAULT_START_PATH);

  useEffect(() => {
    setDirectoryPickerHandler((nextRequest, resolve) => {
      resolverRef.current = resolve;
      setRequest(nextRequest);
      setErrorKey(null);
      setErrorText(null);
      setNewFolderName("");
      const start = nextRequest.initialPath ? normalizeTosPath(nextRequest.initialPath) : DEFAULT_START_PATH;
      setCurrentPath(start);
      setPathDraft(start);
    });
    return () => setDirectoryPickerHandler(null);
  }, []);

  const close = useCallback((picked: string | null) => {
    resolverRef.current?.(picked);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  const load = useCallback(async (path: string) => {
    setLoading(true);
    setErrorKey(null);
    setErrorText(null);
    try {
      const [list, info] = await Promise.all([tosListDirectory(path), tosFolderInfo(path)]);
      setEntries(list.filter((entry) => entry.fType === "folder"));
      setReadOnly(info.isOnlyRead);
      setCurrentPath(path);
      setPathDraft(path);
    } catch (error) {
      setEntries([]);
      setReadOnly(false);
      const key = tosErrorKey(error);
      setErrorKey(key);
      setErrorText(key ? null : error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!request) return;
    const start = request.initialPath ? normalizeTosPath(request.initialPath) : DEFAULT_START_PATH;
    void load(start);
  }, [request, load]);

  const navigate = useCallback(
    (path: string) => {
      const normalized = normalizeTosPath(path);
      if (!isPlausibleTosPath(normalized)) {
        setErrorKey("tos.invalidArgument");
        setErrorText(null);
        return;
      }
      void load(normalized);
    },
    [load],
  );

  const createFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setCreating(true);
    setErrorKey(null);
    setErrorText(null);
    try {
      await tosCreateFolder(joinTosPath(currentPath, name));
      setNewFolderName("");
      await load(currentPath);
    } catch (error) {
      const key = tosErrorKey(error);
      setErrorKey(key);
      setErrorText(key ? null : error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  }, [currentPath, load, newFolderName]);

  if (!request) return null;

  const crumbs = breadcrumbTosPath(currentPath);
  const errorMessage = errorKey ? t(errorKey as never) : errorText;

  return (
    <ModalSurface panelClassName="t-modal is-open ui-dialog-surface" ariaLabelledBy="directory-picker-title">
      <div style={{ width: 560, maxWidth: "92vw", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div id="directory-picker-title" style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
          {t("tos.pickerTitle")}
        </div>

        {/* 面包屑 + 上一级 */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 12 }}>
          <button
            type="button"
            onClick={() => navigate(parentTosPath(currentPath))}
            className="rounded-control border border-border bg-chrome-button-bg px-2 py-1 text-text-muted hover:text-accent"
            title={t("tos.up")}
          >
            ↑ {t("tos.up")}
          </button>
          {crumbs.map((crumb, index) => (
            <span key={crumb.path} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {index > 0 && <span style={{ color: "var(--text-dim)" }}>/</span>}
              <button
                type="button"
                onClick={() => navigate(crumb.path)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  color: index === crumbs.length - 1 ? "var(--text)" : "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {crumb.label === "/" ? t("tos.root") : crumb.label}
              </button>
            </span>
          ))}
        </div>

        {/* 手输路径直达 */}
        <input
          value={pathDraft}
          onChange={(event) => setPathDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") navigate(pathDraft);
          }}
          placeholder={t("tos.pathPlaceholder")}
          spellCheck={false}
          className="w-full rounded-control border border-border bg-bg px-2.5 py-1.5 text-[13px] text-text focus:border-accent focus:outline-none"
          style={{ fontFamily: "var(--font-mono)" }}
        />

        {(errorMessage || readOnly) && (
          <div
            style={{
              fontSize: 12,
              padding: "6px 8px",
              borderRadius: 6,
              color: errorMessage ? "var(--danger)" : "var(--text-muted)",
              background: errorMessage ? "var(--danger-bg)" : "var(--bg-subtle)",
              border: `1px solid ${errorMessage ? "var(--danger-border)" : "var(--border-subtle)"}`,
            }}
          >
            {errorMessage ?? t("tos.readOnly")}
          </div>
        )}

        {/* 目录列表 */}
        <div
          style={{
            height: 260,
            overflowY: "auto",
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "var(--bg)",
          }}
        >
          {loading && (
            <div style={{ padding: "10px 12px", fontSize: 13, color: "var(--text-muted)" }}>
              {t("common.loading")}
            </div>
          )}
          {!loading && entries.length === 0 && (
            <div style={{ padding: "10px 12px", fontSize: 13, color: "var(--text-dim)" }}>{t("tos.empty")}</div>
          )}
          {!loading &&
            entries.map((entry) => (
              <button
                key={entry.path}
                type="button"
                onClick={() => navigate(entry.path)}
                className="flex w-full items-center gap-2 border-none bg-transparent px-3 py-2 text-left text-[13px] text-text hover:bg-bg-hover"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)", flexShrink: 0 }}>
                  <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 0-1.69.9L9.6 8.9a2 2 0 0 1-1.69.9H4a2 2 0 0 0-2 2v6.2a2 2 0 0 0 2 2Z" />
                </svg>
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{entry.name}</span>
                {entry.permission && (
                  <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                    {entry.permission}
                  </span>
                )}
              </button>
            ))}
        </div>

        {/* 新建文件夹 */}
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void createFolder();
            }}
            placeholder={t("tos.newFolderName")}
            spellCheck={false}
            className="flex-1 rounded-control border border-border bg-bg px-2.5 py-1.5 text-[13px] text-text focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void createFolder()}
            disabled={creating || !newFolderName.trim()}
            className="rounded-control border border-border bg-chrome-button-bg px-3 py-1.5 text-[13px] text-text-muted hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("tos.create")}
          </button>
        </div>

        {/* 底部操作 */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 2 }}>
          <button
            type="button"
            onClick={() => close(null)}
            className="rounded-control border border-border bg-transparent px-3 py-1.5 text-[13px] text-text-muted hover:text-text"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => close(currentPath)}
            className="rounded-control border-none bg-accent px-3 py-1.5 text-[13px] font-semibold text-white"
          >
            {t("tos.selectCurrent")}
          </button>
        </div>

        <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{currentPath}</div>
      </div>
    </ModalSurface>
  );
}
