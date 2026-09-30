> ## 修复状态（2026-09-30 更新）
>
> | # | 问题 | 状态 | 说明 |
> |---|---|---|---|
> | 1 | **Windows 启动即报「启动失败」**（`Next server exited before ready: code=2147483651`） | ✅ **0.8.8-13 已修** | 主进程固定传 `--stack-size=16384`（16MB）> Windows 主线程栈保留 8MB → 子进程 V8 初始化阶段静默越界（`0x80000003`）。改为 `10240` 并加单测/CI 冒烟门禁（`electron/server-stack.ts`）。详见 `docs/releases/v0.8.8-13.md` |
> | 2 | **Windows Titlebar overlay 报错**（`TypeError: Titlebar overlay is not enabled`） | ✅ **已修**（`title-bar-overlay.ts` 捕异常兜底；0.8.8-12 起 Windows 直接启用原生窗口按钮覆盖层） | 见本文「问题 2」 |
> | 3 | **NewAPI + DeepSeek 返回 422（`role: developer` 不被支持）** | ⏳ **未处理**（属 OpenAI-compatible 兼容性，需在模型请求层做 role 回退） | 见本文「问题 1」；如需可在应用侧加「developer → system」兼容开关 |
> | 4 | **安装包未代码签名** | ⏳ 未处理 | 自用构建，未购买代码签名证书；企业终端可能需手动放行 |
>
> （下方为最初的问题报告原文，保留以便追溯。）

# NewAPI / DeepSeek 兼容性问题及 Windows Titlebar Overlay 报错

## 问题描述

在 Windows 上使用 Pi Agent Desktop 时，目前遇到两个问题：

1.  通过 NewAPI 调用 DeepSeek 模型时返回 `422`
2.  Windows 客户端偶尔出现 `Titlebar overlay is not enabled` JavaScript
    错误

------------------------------------------------------------------------

## 问题 1：NewAPI + DeepSeek 请求返回 422

Pi Agent Desktop 连接 NewAPI，并通过 NewAPI 调用 DeepSeek
模型时，请求失败。

### 错误信息

``` text
模型请求失败: 422:

{
  "message": "Failed to deserialize the JSON body into the target type:
  messages[0].role: unknown variant `developer`,
  expected one of `system`, `user`, `assistant`, `tool`, `latest_reminder`
  at line 1 column 60",
  "type": "invalid_request_error",
  "param": "",
  "code": "invalid_request_error"
}
```

### 初步判断

从报错来看，Pi Agent Desktop 发出的 `messages` 中包含：

``` json
{
  "role": "developer"
}
```

但当前 NewAPI / DeepSeek 接口只接受：

``` text
system
user
assistant
tool
latest_reminder
```

因此怀疑 Pi Agent Desktop 在 OpenAI-compatible API 下使用了 `developer`
role，而部分兼容接口并不支持该 role，最终导致
`422 invalid_request_error`。

### 建议

希望可以考虑增加兼容处理，例如：

-   对 OpenAI-compatible Provider 增加 role 兼容机制；
-   当目标接口不支持 `developer` 时，自动转换为 `system`；
-   或提供配置项，让用户自行选择是否使用 `developer` role。

例如：

``` text
developer → system
```

这样应该可以提高 NewAPI、DeepSeek 以及其他 OpenAI-compatible API
的兼容性。

------------------------------------------------------------------------

## 问题 2：Windows Titlebar Overlay JavaScript Error

Pi Agent Desktop 在 Windows 下偶尔会弹出 Electron 主进程错误。

### 错误信息

``` text
A JavaScript error occurred in the main process

Uncaught Exception:
TypeError: Titlebar overlay is not enabled
    at applyTitleBarOverlayTheme
    (...\Pi Agent Desktop\resources\app.asar\electron\dist\title-bar-overlay.js:12:12)
    at IpcMainImpl.<anonymous>
    (...\electron\dist\main.js:514:59)
    at IpcMainImpl.emit
    (node:events:509:28)
    at Session.<anonymous>
    (node:electron/js2c/browser_init:2:117721)
    at Session.emit
    (node:events:509:28)
```

安装路径类似：

``` text
C:\Users\<username>\AppData\Local\Programs\Pi Agent Desktop\
```

### 初步判断

看起来程序调用：

``` text
applyTitleBarOverlayTheme()
```

时，当前 BrowserWindow 并没有启用 `titleBarOverlay`，因此 Electron
抛出：

``` text
TypeError: Titlebar overlay is not enabled
```

建议在调用相关 API 前检查当前窗口是否已经启用
`titleBarOverlay`，或者仅在支持该功能的窗口配置下执行主题更新。

------------------------------------------------------------------------

## 环境

``` text
OS: Windows
Client: Pi Agent Desktop
API Gateway: NewAPI
Model Provider: DeepSeek / OpenAI-compatible API
```

------------------------------------------------------------------------

## 期望行为

1.  使用 NewAPI + DeepSeek 时能够正常发送请求，不因 `developer` role
    导致 422。
2.  如果目标 OpenAI-compatible API 不支持 `developer` role，可以自动
    fallback 到 `system`。
3.  Windows 下初始化窗口或切换主题时，不应因为 Titlebar Overlay
    未启用而导致主进程 JavaScript 异常。

------------------------------------------------------------------------

## 补充说明

两个问题均有截图可以提供。

其中第一个问题会直接导致模型无法调用。

从目前错误信息来看，主要兼容点是：

``` text
Pi Agent Desktop
        ↓
role: developer
        ↓
NewAPI / DeepSeek OpenAI-compatible API
        ↓
不支持 developer role
        ↓
422 invalid_request_error
```

第二个问题更像是 Pi Agent Desktop 自身 Electron 窗口 / Titlebar Overlay
处理逻辑的问题。
