import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyGatewayDeveloperRoleCompat } from "./gateway-compat.ts";

function withModelsJson(config: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-gateway-compat-"));
  const path = join(dir, "models.json");
  writeFileSync(path, JSON.stringify(config, null, 2), "utf8");
  return path;
}

const read = (path: string) => JSON.parse(readFileSync(path, "utf8")) as {
  providers: Record<string, { compat?: Record<string, unknown> }>;
};

test("网关兼容兜底：自定义 openai-completions provider 未声明时补写 supportsDeveloperRole=false", () => {
  const path = withModelsJson({
    providers: {
      newapi: {
        baseUrl: "https://newapi.example.com/v1",
        api: "openai-completions",
        models: [{ id: "deepseek-v4.1-flash" }],
      },
    },
  });

  assert.deepEqual(applyGatewayDeveloperRoleCompat(path), ["newapi"]);
  assert.equal(read(path).providers.newapi.compat?.supportsDeveloperRole, false);
});

test("网关兼容兜底：显式声明 supportsDeveloperRole=true 时完全不干预", () => {
  const path = withModelsJson({
    providers: {
      gw: {
        baseUrl: "https://gw.example.com/v1",
        api: "openai-completions",
        compat: { supportsDeveloperRole: true },
        models: [{ id: "m" }],
      },
    },
  });

  assert.deepEqual(applyGatewayDeveloperRoleCompat(path), []);
  assert.equal(read(path).providers.gw.compat?.supportsDeveloperRole, true);
});

test("网关兼容兜底：官方 OpenAI / Azure 端点跳过", () => {
  const path = withModelsJson({
    providers: {
      openaiCustom: { baseUrl: "https://api.openai.com/v1", api: "openai-completions", models: [{ id: "gpt-5" }] },
      azure: { baseUrl: "https://my-res.openai.azure.com/openai/v1", api: "openai-completions", models: [{ id: "gpt-5" }] },
    },
  });

  assert.deepEqual(applyGatewayDeveloperRoleCompat(path), []);
  assert.equal(read(path).providers.openaiCustom.compat, undefined);
});

test("网关兼容兜底：非 openai-completions 与 model 级 api 的判定", () => {
  const path = withModelsJson({
    providers: {
      anthropic: { baseUrl: "https://api.anthropic.com", api: "anthropic-messages", models: [{ id: "claude" }] },
      gatewayNoApi: { baseUrl: "https://gw.example.com/v1", models: [{ id: "m", api: "openai-completions" }] },
    },
  });

  // provider 无 api 但 model 声明 openai-completions → 兜底；anthropic-messages → 跳过
  assert.deepEqual(applyGatewayDeveloperRoleCompat(path), ["gatewayNoApi"]);
  assert.equal(read(path).providers.anthropic.compat, undefined);
});

test("网关兼容兜底：幂等（第二次无改动、文件字节不变）", () => {
  const path = withModelsJson({
    providers: { gw: { baseUrl: "https://gw.example.com/v1", api: "openai-completions", models: [{ id: "m" }] } },
  });

  assert.deepEqual(applyGatewayDeveloperRoleCompat(path), ["gw"]);
  const after = readFileSync(path, "utf8");
  assert.deepEqual(applyGatewayDeveloperRoleCompat(path), []);
  assert.equal(readFileSync(path, "utf8"), after);
});

test("网关兼容兜底：保留 provider 上其它 compat 字段", () => {
  const path = withModelsJson({
    providers: {
      gw: {
        baseUrl: "https://gw.example.com/v1",
        api: "openai-completions",
        compat: { supportsReasoningEffort: false, supportsStore: false },
        models: [{ id: "m" }],
      },
    },
  });

  applyGatewayDeveloperRoleCompat(path);
  const compat = read(path).providers.gw.compat;
  assert.equal(compat?.supportsDeveloperRole, false);
  assert.equal(compat?.supportsReasoningEffort, false);
  assert.equal(compat?.supportsStore, false);
});
