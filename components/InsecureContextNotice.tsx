"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import {
  buildHttpsUrl,
  INSECURE_NOTICE_DISMISS_KEY,
  shouldShowInsecureNotice,
} from "@/lib/insecure-notice";

/**
 * 明文 HTTP 部署下的一次性提示（可永久关闭）。
 *
 * 为什么需要它：TOS 默认走 `http://<NAS>:8181/<appid>/`，非安全上下文会让
 * WebGPU（思考球动画）、剪贴板、crypto.randomUUID、通知等能力整体不可用 ——
 * 用户只会看到"有些地方不一样"，无从判断是 bug 还是环境限制。
 * 这里直接给出同站点的 HTTPS 地址，一步换回去。
 */
export function InsecureContextNotice() {
  const { t } = useI18n();
  const [httpsUrl, setHttpsUrl] = useState<string | null>(null);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(INSECURE_NOTICE_DISMISS_KEY) === "1";
    } catch {
      // 隐私模式等场景下 storage 不可用：按未关闭处理
    }

    const runtimeTag = document.documentElement.getAttribute("data-runtime") ?? "web";
    const visible = shouldShowInsecureNotice({
      secureContext: window.isSecureContext === true,
      runtimeTag,
      dismissed,
    });

    setHttpsUrl(visible ? buildHttpsUrl(window.location) : null);
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(INSECURE_NOTICE_DISMISS_KEY, "1");
    } catch {
      // 存不下也只是下次再来一次提示，不值得打断用户
    }
    setHttpsUrl(null);
  }, []);

  if (!httpsUrl) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-40 flex w-max max-w-[min(92vw,46rem)] -translate-x-1/2 items-start gap-3 rounded-panel border border-warning-border bg-bg-elevated px-3 py-2 shadow-popover backdrop-blur"
    >
      <span className="text-xs leading-relaxed text-text-muted">{t("insecureNotice.body")}</span>
      <a
        href={httpsUrl}
        className="shrink-0 cursor-pointer rounded-control px-1.5 py-0.5 text-xs font-medium text-text-strong underline transition-colors hover:text-text-muted"
      >
        {t("insecureNotice.action")}
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("insecureNotice.dismiss")}
        className="shrink-0 cursor-pointer rounded-control px-1 text-sm leading-none text-text-muted transition-colors hover:text-text-strong"
      >
        ×
      </button>
    </div>
  );
}
