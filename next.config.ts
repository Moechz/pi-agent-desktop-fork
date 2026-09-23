import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { join } from "path";

const { version } = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8")) as { version: string };
let piVersion = "unknown";
try {
  const piPkgPath = join(__dirname, "node_modules/@earendil-works/pi-coding-agent/package.json");
  piVersion = (JSON.parse(readFileSync(piPkgPath, "utf8")) as { version: string }).version;
} catch { /* package not found, use default */ }

// TOS 子路径部署：TOS 应用通过 /<appid>/ 访问（前缀保留反代），
// 构建期传入 TOS_BASE_PATH 即给整站加 basePath；桌面构建不传 → 根路径行为不变
const tosBasePath = (process.env.TOS_BASE_PATH ?? "").trim().replace(/\/+$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  ...(tosBasePath ? { basePath: tosBasePath, assetPrefix: tosBasePath } : {}),
  turbopack: {},
  serverExternalPackages: ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai"],
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.*.*"],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/@earendil-works/pi-ai/**/*"],
  },
  outputFileTracingExcludes: {
    '*': [
      'release/**/*',
      '.git/**/*',
      // 随包搜索工具由 extraResources 落到 resources/bin；不要被追踪进 standalone（避免重复 + universal 合并冲突）
      'vendor/**/*',
      'dist/**/*',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.test.mjs',
      '**/*.test.js',
      'middleware.test.ts',
      'package.test.ts',
    ],
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: tosBasePath,
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_PI_VERSION: piVersion,
  },
};

export default nextConfig;
