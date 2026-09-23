/**
 * P24：OpenAI-compatible 网关的 `developer` role 兼容兜底。
 *
 * 现象：经 NewAPI / OneAPI 等网关调用 DeepSeek 等模型时报
 *   422 `messages[0].role: unknown variant \`developer\`, expected one of \`system\`...`
 *
 * 根因：pi 对 reasoning 模型默认使用 `developer` role（OpenAI 新语义）；多数第三方网关
 * 只接受 system / user / assistant / tool，直接 422。pi 已提供逐 provider 开关
 * `compat.supportsDeveloperRole`（false → 改用 `system`），但自定义 provider 默认不带该声明。
 *
 * 处置：对 `models.json` 中声明的自定义 openai-completions provider，若未显式声明该字段，
 * 补写 `compat.supportsDeveloperRole = false`。规则：
 *  - 显式声明优先（用户写 true 就完全不干预）
 *  - 官方 OpenAI / Azure 端点跳过（它们确实支持 developer role）
 *  - 幂等：已声明者不动、无变化不写盘
 */
import { existsSync, readFileSync, writeFileSync } from "fs";

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** 原生支持 `developer` role 的官方端点（跳过，不做兜底）。 */
const DEVELOPER_ROLE_CAPABLE_HOSTS = ["api.openai.com", "openai.azure.com", "api.azure.com"];

function hostOf(url: unknown): string {
  if (typeof url !== "string" || url.length === 0) return "";
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}

function isDeveloperRoleCapable(...urls: unknown[]): boolean {
  return urls.some((url) => {
    const host = hostOf(url);
    return host !== "" && DEVELOPER_ROLE_CAPABLE_HOSTS.some((safe) => host === safe || host.endsWith(`.${safe}`));
  });
}

function firstModel(value: JsonObject): JsonObject | undefined {
  const models = value.models;
  if (!Array.isArray(models)) return undefined;
  const first = models[0];
  return isObject(first) ? first : undefined;
}

/**
 * 就地为 models.json 补齐网关兼容声明。
 * @returns 本次补写的 provider id（无改动则为空数组）
 */
export function applyGatewayDeveloperRoleCompat(modelsPath: string | null | undefined): string[] {
  if (!modelsPath || !existsSync(modelsPath)) return [];

  let config: JsonObject;
  try {
    config = JSON.parse(readFileSync(modelsPath, "utf8")) as JsonObject;
  } catch {
    return []; // 配置损坏时交给运行时自己报错，这里不掩盖
  }

  const providers = config.providers;
  if (!isObject(providers)) return [];

  const patched: string[] = [];
  for (const [providerId, provider] of Object.entries(providers)) {
    if (!isObject(provider)) continue;

    const model = firstModel(provider);
    const api = typeof provider.api === "string" ? provider.api : model?.api;
    if (api !== "openai-completions") continue;

    const compat = isObject(provider.compat) ? provider.compat : undefined;
    if (compat?.supportsDeveloperRole !== undefined) continue; // 显式声明优先

    if (isDeveloperRoleCapable(provider.baseUrl, model?.baseUrl)) continue;

    provider.compat = { ...(compat ?? {}), supportsDeveloperRole: false };
    patched.push(providerId);
  }

  if (patched.length === 0) return [];

  writeFileSync(modelsPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  console.log(
    `[gateway-compat] 已为 ${patched.join(", ")} 补写 compat.supportsDeveloperRole=false` +
      "（第三方网关多不识别 developer role；如需 developer 请在 models.json 显式写 true）",
  );
  return patched;
}
