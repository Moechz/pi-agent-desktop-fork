import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  scripts: Record<string, string>;
};

test("build scripts name the standalone Next.js build explicitly", () => {
  assert.match(pkg.scripts["build:standalone"], /^next build\b/);
  assert.match(
    pkg.scripts["build:standalone"],
    /ensure-standalone-next-runtimes\.mjs/
  );
  assert.match(
    pkg.scripts["build:standalone"],
    /smoke-standalone-server\.mjs/
  );
  assert.match(
    pkg.scripts["build:standalone"],
    /ensure-standalone-pi-runtime\.mjs/
  );
  assert.match(
    pkg.scripts["build:standalone"],
    /ensure-standalone-macos-universal-runtimes\.mjs/
  );
  assert.match(
    pkg.scripts["build:standalone"],
    /dereference-standalone-symlinks\.mjs/
  );
  assert.equal(pkg.scripts.build, "npm run build:standalone");
});

test("packaging and release scripts call build:standalone", () => {
  assert.match(pkg.scripts.release, /npm run build:standalone/);
  assert.match(pkg.scripts.pack, /^npm run build:standalone &&/);
  assert.match(pkg.scripts.dist, /^npm run build:standalone &&/);
  for (const scriptName of ["pack", "dist"]) {
    assert.match(
      pkg.scripts[scriptName],
      /electron-builder.+&& node scripts\/smoke-packaged-standalone\.mjs/
    );
  }
  assert.match(pkg.scripts["pack:mac"], /electron-builder --mac --universal --dir/);
  assert.match(pkg.scripts["dist:mac"], /electron-builder --mac --universal --publish never/);
  for (const scriptName of ["pack:mac", "dist:mac"]) {
    assert.match(pkg.scripts[scriptName], /^npm run build:standalone &&/);
    assert.match(pkg.scripts[scriptName], /&& node scripts\/smoke-packaged-standalone\.mjs$/);
  }
  for (const scriptName of ["pack", "pack:mac", "dist", "dist:mac"]) {
    assert.doesNotMatch(
      pkg.scripts[scriptName],
      /@electron\/rebuild/,
      "electron-builder already rebuilds native dependencies",
    );
  }
});

test("test scripts cover middleware and scope platform-specific desktop subsets", () => {
  // node:test does not exit after passing (open sqlite/server handles), so both
  // scripts keep --test-force-exit. Removing it hangs the suite.
  assert.match(pkg.scripts.test, /--test-force-exit/);
  assert.match(
    pkg.scripts.test,
    /"middleware\.test\.ts"/,
    "full suite must run root middleware.test.ts"
  );
  const windowsScript = pkg.scripts["test:windows"];
  assert.ok(windowsScript, "test:windows script must exist");
  assert.match(windowsScript, /^node --test --test-force-exit /);
  assert.match(
    windowsScript,
    /"electron\/\*\*\/\*\.test\.ts"/,
    "Windows subset must include electron/**/*.test.ts"
  );
  // middleware.test.ts is a Next.js web-server concern, not a Windows-path
  // concern — it is covered by the full suite and must not run twice.
  assert.doesNotMatch(windowsScript, /middleware\.test\.ts/);

  const macosScript = pkg.scripts["test:macos"];
  assert.ok(macosScript, "test:macos script must exist");
  assert.match(macosScript, /^node --test --test-force-exit /);
  assert.match(macosScript, /"electron\/\*\*\/\*\.test\.ts"/);
  assert.match(macosScript, /"lib\/electron-\*\.test\.mjs"/);
  assert.match(
    macosScript,
    /ensure-standalone-macos-universal-runtimes\.test\.mjs/,
  );
  assert.doesNotMatch(macosScript, /middleware\.test\.ts/);
});

test("next.config keeps documents revalidated but hashed assets immutable (prod) / no-store (dev)", () => {
  const config = readFileSync(new URL("./next.config.ts", import.meta.url), "utf8");
  const block = config.slice(config.indexOf("async headers()"), config.indexOf("export default"));
  assert.ok(block.includes("async headers()"), "headers() block expected");
  // 文档必须每次回源校验：否则升级后浏览器用旧 HTML + 旧 chunk，新功能“装上却看不见”
  assert.ok(block.includes('"no-cache, must-revalidate"'), "documents must not be cached long-term");
  // 带内容哈希的产物在生产环境继续长期 immutable
  assert.ok(block.includes('"public, max-age=31536000, immutable"'), "hashed assets stay immutable in production");
  // dev 必须禁用缓存：否则浏览器把 dev chunk 当 immutable 缓存，改完刷新仍拿旧 bundle
  assert.ok(block.includes('"no-store, must-revalidate"'), "dev must bypass the cache for dev chunks");
  assert.ok(
    /process\.env\.NODE_ENV\s*===\s*"production"/.test(block),
    "immutable must be gated on production",
  );
  assert.ok(block.includes('source: "/_next/static/:path*"'), "hashed asset rule expected");
  // 流式路径的 no-transform 规则必须在兜底之后（否则被 must-revalidate 覆盖，真机实测过）
  assert.ok(block.includes('source: "/api/agent/:id/events"'), "SSE route rule expected");
  assert.ok(block.includes('"no-cache, no-transform"'), "streaming routes need no-transform");
  assert.ok(
    block.indexOf('source: "/api/agent/:id/events"') > block.indexOf('source: "/_next/static/:path*"'),
    "streaming rules must come after the fallback rules so they win",
  );
  // 顺序也重要：兜底规则必须在前面，hashed 规则必须在后面（Next 后者覆盖前者）
  assert.ok(
    block.indexOf('source: "/:path*"') < block.indexOf('source: "/_next/static/:path*"'),
    "catch-all rule must come before the hashed-asset rule",
  );
});

test("next.config tracing excludes test files from the standalone output", () => {
  const config = readFileSync(new URL("./next.config.ts", import.meta.url), "utf8");
  const block = config.slice(
    config.indexOf("outputFileTracingExcludes"),
    config.indexOf("env:")
  );
  assert.ok(block.includes("outputFileTracingExcludes"), "tracing excludes block expected");
  for (const pattern of [
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.test.mjs",
    "**/*.test.js",
    "middleware.test.ts",
    "package.test.ts",
  ]) {
    assert.ok(block.includes(pattern), `outputFileTracingExcludes must contain ${pattern}`);
  }
});

test("packaged smoke test targets Windows and architecture-suffixed macOS outputs", () => {
  const script = readFileSync(
    new URL("./scripts/smoke-packaged-standalone.mjs", import.meta.url),
    "utf8"
  );
  assert.match(
    script,
    /join\(outputDir, "resources", "standalone"\)/
  );
  assert.match(
    script,
    /join\(outputDir, "Pi Agent Desktop\.exe"\)/
  );
  assert.match(script, /\^mac\(\?:-\(\?:arm64\|x64\|universal\)\)\?\$/);
  assert.match(script, /join\(appDir, "Resources", "standalone"\)/);
  assert.match(
    readFileSync(
      new URL("./scripts/smoke-standalone-server.mjs", import.meta.url),
      "utf8"
    ),
    /ELECTRON_RUN_AS_NODE/
  );
  assert.match(
    readFileSync(
      new URL("./scripts/smoke-standalone-server.mjs", import.meta.url),
      "utf8"
    ),
    /child\.once\("error"/
  );
});

test("流式路由必须带 no-transform 与 X-Accel-Buffering（中转/relay 场景：防被缓冲）", () => {
  const routes = [
    "app/api/agent/[id]/events/route.ts",
    "app/api/auth/login/[provider]/route.ts",
    "app/api/files/[...path]/route.ts",
  ];
  for (const rel of routes) {
    const src = readFileSync(new URL(`./${rel}`, import.meta.url), "utf8");
    assert.ok(src.includes("text/event-stream"), `${rel} 应是流式路由`);
    assert.ok(src.includes("no-transform"), `${rel} 的 Cache-Control 需要 no-transform`);
    assert.ok(src.includes("X-Accel-Buffering"), `${rel} 需要 X-Accel-Buffering: no`);
  }
});
