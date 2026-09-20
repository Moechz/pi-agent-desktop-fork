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
    // P14：deepseek 目录仅留 V4 Flash（干净目录真实 id 是 deepseek-v4-flash；
    // 补丁时代曾手工改名 deepseek-flash，两者都兼容；v4-pro 隐藏）
    const filtered = available.filter(
      (m: { id: string; provider: string }) =>
        !(m.provider === "deepseek" && m.id !== "deepseek-v4-flash" && m.id !== "deepseek-flash"),
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
