import { SettingsManager, getAgentDir } from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { createPiRuntime } from "@/lib/pi-runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const nameMap = new Map<string, string>();
  let modelList: { id: string; name: string; provider: string }[] = [];
  let defaultModel: { provider: string; modelId: string } | null = null;
  const thinkingLevels: Record<string, string[]> = {};
  const thinkingLevelMaps: Record<string, Record<string, string | null>> = {};

  try {
    const agentDir = getAgentDir();
    const { registry } = await createPiRuntime();
    const available = registry.getAvailable();
    // P14：deepseek 目录只留 V4.1 Flash（id: deepseek-flash，即 DeepSeek V4.1 Flash）；
    // 旧 id deepseek-v4-flash 与 v4-pro 一律隐藏。目录数据由 scripts/patch-model-catalog.mjs
    // 在构建期对齐上游（0.86.1 已把 v4-flash 改名为 deepseek-flash，v4-pro 保留但不上榜）
    const filtered = available.filter(
      (m: { id: string; provider: string }) =>
        !(m.provider === "deepseek" && m.id !== "deepseek-flash"),
    );
    modelList = filtered.map((m: { id: string; name: string; provider: string }) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
    }));
    for (const m of filtered) {
      const key = `${m.provider}:${m.id}`;
      nameMap.set(key, m.name);
      thinkingLevels[key] = getSupportedThinkingLevels(m);
      if (m.thinkingLevelMap) thinkingLevelMaps[key] = m.thinkingLevelMap;
    }

    const settings = SettingsManager.create(process.cwd(), agentDir);
    const provider = settings.getDefaultProvider();
    const modelId = settings.getDefaultModel();
    if (provider) {
      defaultModel = { provider, modelId: modelId ?? available[0]?.id ?? "" };
    }
  } catch { /* return empty */ }

  return Response.json({ models: Object.fromEntries(nameMap), modelList, defaultModel, thinkingLevels, thinkingLevelMaps });
}
