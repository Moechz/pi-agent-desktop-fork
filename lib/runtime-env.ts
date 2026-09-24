/**
 * 运行时环境标记。
 *
 * 背景：同一份代码要跑在三种宿主里 —— Electron 桌面窗口、TOS 子路径 Web 部署、
 * 普通浏览器直连。三者差异（安全上下文是否存在、有哪些浏览器能力、滚动条是否占位）
 * 过去散落在各组件里各自判断，结果就是"TOS 上不少地方不一样，只能一点一点调"。
 *
 * 现在统一在 `<html>` 上打两个标记，所有差异收敛到一处 CSS/分支：
 *   data-runtime="electron | tos | web"  —— 宿主类型
 *   data-secure="true | false"           —— 是否安全上下文（HTTPS 或 localhost）
 *
 * `data-secure` 是"能力缺失"类差异的总开关：明文 HTTP 下 WebGPU、剪贴板、
 * crypto.randomUUID、通知等**一整类** API 直接不存在（真机实测过两次：
 * randomUUID 崩溃、思考球退化成静止圆圈）。
 */

/** `<html>` 上的运行时类型属性名 */
export const RUNTIME_ATTRIBUTE = "data-runtime";
/** `<html>` 上的安全上下文属性名（"true" / "false"） */
export const SECURE_ATTRIBUTE = "data-secure";

export type RuntimeTag = "electron" | "tos" | "web";

export interface RuntimeSignals {
  /** UserAgent 里带 Electron 标识 */
  electronUserAgent: boolean;
  /** 存在 Electron preload 暴露的桥对象 */
  electronBridge: boolean;
  /** 构建期注入了 basePath（即 TOS 子路径部署） */
  tosBasePath: boolean;
}

/**
 * 由各项信号判定宿主类型。
 * Electron 优先：桌面版内部页面也是普通 HTTP，但它是 localhost（安全上下文），
 * 与 TOS 的明文 HTTP 完全不同，必须区分开。
 */
export function resolveRuntimeTag(signals: RuntimeSignals): RuntimeTag {
  if (signals.electronUserAgent || signals.electronBridge) return "electron";
  return signals.tosBasePath ? "tos" : "web";
}

/**
 * 生成 `<head>` 里内联的引导脚本。
 *
 * 必须在首帧渲染前执行（否则 CSS 会以一帧的错误标记先渲染一次），
 * 因此保持极小、无依赖、且**绝不抛错**（任何异常都会拖垮整个页面脚本执行）。
 *
 * @param defaultTag 服务端按构建期信息判定的默认值（Electron 无法在服务端识别，
 *                   故桌面构建这里传 "web"，由客户端脚本改写为 "electron"）
 */
export function runtimeBootstrapScript(defaultTag: RuntimeTag): string {
  return (
    "(function(){try{" +
    "var d=document.documentElement;" +
    `var r=${JSON.stringify(defaultTag)};` +
    'try{if(navigator.userAgent.indexOf("Electron")>=0||!!window.electronAPI){r="electron"}}catch(e){}' +
    `d.setAttribute(${JSON.stringify(RUNTIME_ATTRIBUTE)},r);` +
    `d.setAttribute(${JSON.stringify(SECURE_ATTRIBUTE)},window.isSecureContext===true?"true":"false");` +
    "}catch(e){}})();"
  );
}
