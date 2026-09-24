import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 防回归：客户端请求路径必须 basePath 安全。
 *
 * 背景（TOS 真机实测）：应用以 `basePath=/<appid>` 部署时，任何**未补前缀**的站内请求
 * 都会打到站点根路径 → 404。踩过的真实故障：
 *   - ensureTrustThenFetch 直接用传入的 "/api/agent/new"（发消息 → 请求 404 → 无会话）
 *   - session-loader-api 的 fetch(url)（加载会话消息 → 404 → 看不到回复）
 * 表现都是"前端看起来成功、后端毫无记录"，极难排查。
 *
 * 规则：客户端（components/hooks/lib）里 fetch / new EventSource 的参数若不是字符串字面量，
 * 就必须已经过 withBasePath / apiJson 包装；外部 URL（用户配置的 MCP 地址）登记在豁免表。
 */

/** 豁免：外部 URL —— 用户填写的外部地址不能加应用前缀 */
const ALLOWLIST = [
  // mcp-config 里的 url 是用户填的外部 MCP SSE 地址
  { file: "lib/mcp-config.ts", snippet: "fetch(url" },
  // trust-fetch 内部：入口处已把入参 withBasePath 后存为 target
  { file: "lib/trust-fetch.ts", snippet: "fetch(target" },
];

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collect(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")) out.push(full);
  }
  return out;
}

test("客户端 fetch / EventSource 路径均已 basePath 安全", () => {
  const pattern = /(fetch|new EventSource)\(\s*([A-Za-z_$][\w$.]*)\s*[,)]/g;
  const offenders: string[] = [];

  for (const file of ["components", "hooks", "lib"].flatMap((dir) => collect(dir))) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      for (const match of line.matchAll(pattern)) {
        const [raw, , identifier] = match;
        if (identifier === "withBasePath" || identifier === "apiJson") continue;
        const allowed = ALLOWLIST.some(
          (entry) => file === entry.file && raw.startsWith(entry.snippet),
        );
        if (!allowed) offenders.push(`${file}:${index + 1}  ${line.trim()}`);
      }
    });
  }

  assert.equal(
    offenders.length,
    0,
    `以下请求未补 basePath（TOS 子路径部署会 404，表现为“前端成功、后端无记录”）：\n  ${offenders.join("\n  ")}`,
  );
});
