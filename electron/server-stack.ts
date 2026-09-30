/**
 * 内置服务（Next standalone / next dev）的 V8 栈大小参数。
 *
 * ★ 为什么**不能**用 16384（16MB）：
 *   Windows / Linux 下进程主线程的栈保留是 **8MB**（PE 头 `SizeOfStackReserve` = 8MB），
 *   而 `--stack-size=16384`（KB，即 16MB）会让 V8 在**运行时初始化阶段**直接越界终止 ——
 *   子进程静默退出、**不输出任何 stderr**，退出码 `0x80000003`（STATUS_BREAKPOINT /
 *   十进制的 2147483651）。主进程只能看到一个约 36ms 的无输出退出，于是判定
 *   `Next server exited before ready` 并显示"启动失败"页面，内置服务从未启动。
 *
 *   同事在 Windows 23H2 + Node 24 + 0.8.8-11 上实测边界：
 *     `node --stack-size=16384 -e 1` → 无输出、立即退出（0xC0000005 / 0x80000003）
 *     `--stack-size=12288` / `10240` / `8192` → 正常
 *   macOS 分支原先走 `utilityProcess.fork`（栈由 Electron 准备）所以作者未能复现。
 *
 * 取值：**10240（10MB）** —— 是 V8 默认（约 984KB）的 ~10 倍，深树序列化/超长会话足够，
 * 同时稳稳低于实测崩溃阈值（12288 是当时能通过的上界，留出余量）。所有平台统一取值，
 * 避免"某个平台能跑、另一个平台秒崩"这类只在特定机器上暴露的问题。
 */
export const SERVER_STACK_SIZE_KB = 10240;

/** 传给内置服务进程的 V8 栈参数 */
export const SERVER_STACK_SIZE_ARG = `--stack-size=${SERVER_STACK_SIZE_KB}`;

/**
 * 安全上界（KB）：超过这个值在栈保留 8MB 的平台上必崩（Windows 实测 16384 必崩、
 * 12288 可过）。留作回归门禁：任何把该值调大的改动都会被单测拦下。
 */
export const SERVER_STACK_SIZE_MAX_SAFE_KB = 12288;
