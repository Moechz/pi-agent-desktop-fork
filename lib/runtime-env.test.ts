import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {
  resolveRuntimeTag,
  runtimeBootstrapScript,
  RUNTIME_ATTRIBUTE,
  SECURE_ATTRIBUTE,
  type RuntimeTag,
} from "./runtime-env.ts";

test("resolveRuntimeTag：Electron 优先于 TOS basePath", () => {
  // 桌面版内部页面也是 http://127.0.0.1（安全上下文），必须与 TOS 明文 HTTP 区分
  assert.equal(
    resolveRuntimeTag({ electronUserAgent: true, electronBridge: false, tosBasePath: true }),
    "electron",
  );
  assert.equal(
    resolveRuntimeTag({ electronUserAgent: false, electronBridge: true, tosBasePath: false }),
    "electron",
  );
});

test("resolveRuntimeTag：区分 TOS 子路径部署与普通浏览器", () => {
  assert.equal(
    resolveRuntimeTag({ electronUserAgent: false, electronBridge: false, tosBasePath: true }),
    "tos",
  );
  assert.equal(
    resolveRuntimeTag({ electronUserAgent: false, electronBridge: false, tosBasePath: false }),
    "web",
  );
});

interface SandboxResult {
  attributes: Record<string, string>;
}

/** 在沙箱里真实执行引导脚本，验证它写出的属性（而不是只做字符串匹配） */
function runBootstrap(
  defaultTag: RuntimeTag,
  env: { userAgent: string; isSecureContext: boolean; electronAPI?: unknown },
): SandboxResult {
  const attributes: Record<string, string> = {};
  const documentElement = {
    setAttribute: (name: string, value: string) => {
      attributes[name] = value;
    },
  };
  const sandbox = {
    document: { documentElement },
    navigator: { userAgent: env.userAgent },
    window: { isSecureContext: env.isSecureContext, electronAPI: env.electronAPI },
  };
  vm.createContext(sandbox);
  new vm.Script(runtimeBootstrapScript(defaultTag)).runInContext(sandbox);
  return { attributes };
}

test("引导脚本：TOS 明文 HTTP → data-runtime=tos + data-secure=false", () => {
  const { attributes } = runBootstrap("tos", {
    userAgent: "Mozilla/5.0 (Macintosh) Chrome/140",
    isSecureContext: false,
  });
  assert.equal(attributes[RUNTIME_ATTRIBUTE], "tos");
  assert.equal(attributes[SECURE_ATTRIBUTE], "false");
});

test("引导脚本：HTTPS 下的 TOS → data-secure=true（能力全部恢复）", () => {
  const { attributes } = runBootstrap("tos", {
    userAgent: "Mozilla/5.0 (Macintosh) Chrome/140",
    isSecureContext: true,
  });
  assert.equal(attributes[RUNTIME_ATTRIBUTE], "tos");
  assert.equal(attributes[SECURE_ATTRIBUTE], "true");
});

test("引导脚本：桌面构建被客户端改写成 electron", () => {
  const { attributes } = runBootstrap("web", {
    userAgent: "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Electron/38.0.0",
    isSecureContext: true,
  });
  assert.equal(attributes[RUNTIME_ATTRIBUTE], "electron");
  assert.equal(attributes[SECURE_ATTRIBUTE], "true");
});

test("引导脚本：无 Electron 标识的桌面环境不会误判（仍为 web）", () => {
  const { attributes } = runBootstrap("web", {
    userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/140",
    isSecureContext: true,
  });
  assert.equal(attributes[RUNTIME_ATTRIBUTE], "web");
});

test("引导脚本：环境异常时静默失败，绝不抛错拖垮页面", () => {
  const sandbox = {
    get document(): never {
      throw new Error("boom");
    },
    navigator: { userAgent: "" },
    window: {},
  };
  vm.createContext(sandbox);
  assert.doesNotThrow(() => {
    new vm.Script(runtimeBootstrapScript("web")).runInContext(sandbox);
  });
});
