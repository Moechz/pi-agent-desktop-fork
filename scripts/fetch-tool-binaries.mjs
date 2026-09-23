#!/usr/bin/env node
/**
 * 按平台拉取 pi 搜索工具二进制（ripgrep / fd），供打包进安装包离线使用。
 *
 * 背景：pi 的 grep / find 工具依赖 `rg` / `fd`，缺失时会**运行时从 GitHub 下载**到
 * `~/.pi/agent/bin`；国内网络基本下不动 → 同事端「没有 grep/find，不能列目录搜索」。
 * 本脚本在构建期把对应平台二进制放到 `vendor/bin/<platform>-<arch>/`，
 * 由 electron-builder 打进 `resources/bin`，应用启动时复制到 `~/.pi/agent/bin`
 * （pi 的 ensureTool 先查该目录，命中即不再联网下载）。
 *
 * 用法：
 *   node scripts/fetch-tool-binaries.mjs              # 当前平台（darwin 默认 arm64+x64 双架构）
 *   node scripts/fetch-tool-binaries.mjs win32-x64    # 指定目标
 * 已存在则跳过（本地重复构建不重复下载）。下载走 curl，自动沿用 HTTPS_PROXY。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// 固定版本（上游 release tag）
const RIPGREP_VERSION = "15.2.0";
const FD_VERSION = "10.5.0";

const TARGETS = {
  "win32-x64": {
    rg: `ripgrep-${RIPGREP_VERSION}-x86_64-pc-windows-msvc.zip`,
    fd: `fd-v${FD_VERSION}-x86_64-pc-windows-msvc.zip`,
    ext: ".exe",
  },
  "win32-arm64": {
    rg: `ripgrep-${RIPGREP_VERSION}-aarch64-pc-windows-msvc.zip`,
    fd: `fd-v${FD_VERSION}-aarch64-pc-windows-msvc.zip`,
    ext: ".exe",
  },
  "darwin-arm64": {
    rg: `ripgrep-${RIPGREP_VERSION}-aarch64-apple-darwin.tar.gz`,
    fd: `fd-v${FD_VERSION}-aarch64-apple-darwin.tar.gz`,
    ext: "",
  },
  "darwin-x64": {
    rg: `ripgrep-${RIPGREP_VERSION}-x86_64-apple-darwin.tar.gz`,
    fd: `fd-v${FD_VERSION}-x86_64-apple-darwin.tar.gz`,
    ext: "",
  },
  "linux-x64": {
    rg: `ripgrep-${RIPGREP_VERSION}-x86_64-unknown-linux-musl.tar.gz`,
    fd: `fd-v${FD_VERSION}-x86_64-unknown-linux-gnu.tar.gz`,
    ext: "",
  },
  "linux-arm64": {
    rg: `ripgrep-${RIPGREP_VERSION}-aarch64-unknown-linux-gnu.tar.gz`,
    fd: `fd-v${FD_VERSION}-aarch64-unknown-linux-gnu.tar.gz`,
    ext: "",
  },
};

const BASE = {
  rg: `https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/`,
  fd: `https://github.com/sharkdp/fd/releases/download/v${FD_VERSION}/`,
};

function resolveTargets(argv) {
  if (argv.length > 0) return argv;
  const plat = process.platform;
  if (plat === "darwin") return ["darwin-arm64", "darwin-x64"]; // universal 包两种架构都要
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return [`${plat}-${arch}`];
}

function curl(url, out) {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY;
  const args = ["-sSL", "--fail", "-m", "600", url, "-o", out];
  if (proxy) args.unshift("-x", proxy);
  execFileSync("curl", args, { stdio: ["ignore", "ignore", "inherit"] });
}

function extractArchive(archive, into) {
  mkdirSync(into, { recursive: true });
  const isZip = archive.endsWith(".zip");
  try {
    execFileSync(isZip ? "unzip" : "tar", isZip ? ["-o", "-q", archive, "-d", into] : ["-xzf", archive, "-C", into], {
      stdio: ["ignore", "ignore", "inherit"],
    });
  } catch {
    // Windows 无 unzip：bsdtar 也能解 zip
    execFileSync("tar", ["-xf", archive, "-C", into], { stdio: ["ignore", "ignore", "inherit"] });
  }
}

function findBinary(dir, name) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      const hit = findBinary(full, name);
      if (hit) return hit;
    } else if (entry === name) {
      return full;
    }
  }
  return null;
}

function fetchOne(tool, target, config) {
  const outDir = join(ROOT, "vendor/bin", target);
  const binaryName = `${tool}${config.ext}`;
  const dest = join(outDir, binaryName);
  if (existsSync(dest)) {
    console.log(`fetch-tool-binaries: ${target}/${binaryName} 已存在，跳过`);
    return;
  }
  const asset = config[tool];
  const url = BASE[tool] + asset;
  const tmpDir = join(ROOT, ".tmp-tool-binaries", target);
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });
  const archive = join(tmpDir, asset);
  console.log(`fetch-tool-binaries: 下载 ${tool} (${target}) ← ${url}`);
  curl(url, archive);
  extractArchive(archive, tmpDir);
  const found = findBinary(tmpDir, binaryName);
  if (!found) throw new Error(`未在压缩包中找到 ${binaryName}`);
  mkdirSync(outDir, { recursive: true });
  copyFileSync(found, dest);
  if (config.ext === "") execFileSync("chmod", ["755", dest]);
  rmSync(tmpDir, { recursive: true, force: true });
  console.log(`fetch-tool-binaries: ✅ ${target}/${binaryName} (${statSync(dest).size} 字节)`);
}

const targets = resolveTargets(process.argv.slice(2)).filter((t) => {
  if (TARGETS[t]) return true;
  console.log(`fetch-tool-binaries: 跳过未知目标 ${t}`);
  return false;
});

for (const target of targets) {
  const config = TARGETS[target];
  for (const tool of ["rg", "fd"]) {
    try {
      fetchOne(tool, target, config);
    } catch (error) {
      // 不阻断构建：失败时留运行时下载兜底（与原行为一致）
      console.error(`fetch-tool-binaries: ⚠️ ${tool} (${target}) 拉取失败：${error instanceof Error ? error.message : error}`);
    }
  }
}
