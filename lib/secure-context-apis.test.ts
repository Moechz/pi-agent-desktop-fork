import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 防回归：**安全上下文专属**的浏览器 API 必须“探测后用”，不能直接硬调。
 *
 * 背景（TOS 真机实测，同类问题已踩两次）：
 * TOS 默认以 `http://<NAS>:8181/<appid>/` 部署 —— 明文 HTTP **不是安全上下文**，
 * 下列 API 直接**不存在**（不是报错，而是 undefined / 拒绝）：
 *   - crypto.randomUUID  → 曾导致发送消息整体崩溃（"is not a function"）
 *   - navigator.gpu      → 导致思考球退化成静止圆圈（用户可见的外观差异）
 *   - navigator.clipboard、Notification、serviceWorker 同理
 * 桌面版因为跑在 http://127.0.0.1（回环地址算安全上下文）而一切正常，
 * 于是问题只在 TOS 暴露 —— 排查成本极高。
 *
 * 规则：这些 API 只允许出现在**统一封装**（内部做能力探测并降级）或**能力探测**处，
 * 其余位置一律视为违规。新增封装请登记到 ALLOWLIST 并附上降级策略说明。
 */

const SECURE_CONTEXT_APIS = [
  "navigator.gpu",
  "crypto.randomUUID",
  "globalThis.crypto.randomUUID",
  "navigator.clipboard",
  "Notification",
  "navigator.serviceWorker",
  "navigator.mediaDevices",
  "navigator.wakeLock",
];

/** 允许出现的位置（附降级策略） */
const ALLOWLIST = new Map<string, string>([
  ["lib/random-id.ts", "统一封装 randomUUID/剪贴板：内部探测能力并降级到 getRandomValues / execCommand"],
  [
    "components/LiquidOrbCanvas.tsx",
    "navigator.gpu 作为能力探测：缺失即 webGpuFailed，降级到 CSS 动画球",
  ],
]);

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*/")
  );
}

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collect(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")) out.push(full);
  }
  return out;
}

test("安全上下文专属 API 均已封装或探测（TOS 明文 HTTP 下不致失效）", () => {
  const offenders: string[] = [];

  for (const file of ["components", "hooks", "lib", "app"].flatMap((dir) => collect(dir))) {
    if (ALLOWLIST.has(file)) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (isCommentLine(line)) return;
        for (const api of SECURE_CONTEXT_APIS) {
          if (line.includes(api)) offenders.push(`${file}:${index + 1}  [${api}]  ${line.trim()}`);
        }
      });
  }

  assert.equal(
    offenders.length,
    0,
    `以下位置直接使用了“仅安全上下文可用”的 API（明文 HTTP 部署下会失效/崩溃）：\n  ${offenders.join("\n  ")}\n` +
      "请改为探测后用并降级，或登记到本测试的 ALLOWLIST（附降级策略说明）。",
  );
});
