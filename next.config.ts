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
      // 打包临时区与产物：Next 的「整项目追踪」（见 lib/bundled-tools.ts 的动态 fs 访问）
      // 会把 tos/build —— 上一次 build.sh 留下的完整 stage，可达 400MB+ —— 扫进
      // standalone，deb 凭空胖一倍（实测 120MB → 268MB，安装后 437MB → 853MB）。
      'tos/build/**/*',
      'tos/dist/**/*',
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
  /**
   * 缓存策略 —— 升级后“界面还是旧的”就出在这里（真机 tnas-57 实证）。
   *
   * 现象：TOS 应用从 0.8.8.9-24 升到 -25（含输入法回车修复），服务端产物已确认是新代码
   * （chunk 里能看到 onCompositionStart/onCompositionEnd），但用户浏览器里行为照旧。
   * 原因：Next 对预渲染页面默认下发 `Cache-Control: s-maxage=31536000`（+ `x-nextjs-cache: HIT`），
   * 浏览器把旧 HTML（引用旧 chunk 名）长期留着；旧 chunk 又被标成 `immutable` 一年，
   * 于是一直跑升级前的 JS。
   *
   * 规则：
   * - 文档/接口：`no-cache, must-revalidate` —— 允许条件请求（304，成本极低），但每次回源校验；
   * - 带内容哈希的构建产物（/_next/static/*）：保持 immutable 长期缓存（文件名变了自然会重取）。
   */
  async headers() {
    // dev 下不能给 hashed 资源发 immutable：否则浏览器把 dev chunk 缓存一年，
    // 改代码后刷新拿到的仍是旧 bundle（2026-09-28 实测：改完 UI 刷新看不到，误判为“没重载”）。
    // 生产才用 immutable —— 那时文件名带内容哈希，天然 cache busting。
    const staticAssetCacheControl =
      process.env.NODE_ENV === "production"
        ? "public, max-age=31536000, immutable"
        : "no-store, must-revalidate";
    return [
      // 注意顺序：Next 对同一响应按数组顺序应用，**后面的规则覆盖前面的**，
      // 所以「兜底不缓存」必须在前、「hashed 资源」规则必须在后（真机实测反了会失效）。
      {
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "no-cache, must-revalidate" },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: staticAssetCacheControl },
        ],
      },
    ];
  },
};

export default nextConfig;
