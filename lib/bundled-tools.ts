/**
 * 随包预置搜索工具（ripgrep / fd）安装。
 *
 * 背景：pi 的 `grep` / `find` 工具依赖 `rg` / `fd`；两者缺失时 pi 会**运行时从 GitHub 下载**到
 * `~/.pi/agent/bin`，国内网络基本下不动 → 同事端表现为「没有 grep/glob/find，不能按名查找」。
 * 安装包自带对应平台二进制后，pi 的 `ensureTool` 先命中 `~/.pi/agent/bin` 下的文件，不再联网。
 *
 * 二进制由 `scripts/fetch-tool-binaries.mjs` 在构建期放入 `vendor/bin/<platform>-<arch>/`，
 * 经 electron-builder 打到安装包的 `resources/bin/`。本模块在会话/运行时创建前把它们复制过去。
 *
 * 幂等：目标已存在则不覆盖（用户自行升级/替换过的版本优先）。
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const TOOLS = ["rg", "fd"] as const;

export interface InstallBundledToolsResult {
  installed: string[];
  target: string;
}

/** 打包后 = <resources>/bin；开发态 = 仓库 vendor/bin（依次尝试，取第一个存在者）。 */
export function bundledToolRoots(): string[] {
  const roots: string[] = [];
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) roots.push(join(resourcesPath, "bin"));
  roots.push(join(process.cwd(), "vendor/bin"));
  roots.push(join(process.cwd(), "..", "vendor/bin"));
  return roots;
}

export function platformDirName(): string {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return `${process.platform}-${arch}`;
}

export function installBundledTools(
  targetDir: string = join(getAgentDir(), "bin"),
  roots: string[] = bundledToolRoots(),
): InstallBundledToolsResult {
  const platformDir = platformDirName();
  const installed: string[] = [];

  for (const root of roots) {
    const source = join(root, platformDir);
    if (!existsSync(source)) continue;

    mkdirSync(targetDir, { recursive: true });
    for (const tool of TOOLS) {
      const name = process.platform === "win32" ? `${tool}.exe` : tool;
      const from = join(source, name);
      const to = join(targetDir, name);
      if (!existsSync(from) || existsSync(to)) continue;
      copyFileSync(from, to);
      if (process.platform !== "win32") chmodSync(to, 0o755);
      installed.push(name);
    }
    break; // 只使用第一个命中的来源目录
  }

  if (installed.length > 0) {
    console.log(`[bundled-tools] installed bundled search tools: ${installed.join(", ")} -> ${targetDir}`);
  }
  return { installed, target: targetDir };
}
