/**
 * TOS 子路径部署支持。
 *
 * TOS 应用挂在 `http://<NAS>:8181/<appid>/` 下（平台 nginx 反代，前缀保留模式），
 * 而 Next.js 的页面、静态资源与 API 默认都是根路径绝对地址 →
 * 必须给整站加 `basePath`，并把客户端所有绝对路径请求补上前缀。
 *
 * 构建期由 `TOS_BASE_PATH=/<appid>` 注入（见 next.config.ts）：
 *   - 桌面构建：不设该环境变量 → BASE_PATH 为空 → 所有路径行为与改造前完全一致
 *   - TOS 构建：BASE_PATH=/<appid> → 资源/API/SSE 全部走子路径
 */

const raw = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** 规范化后的前缀，无前缀时为空串（如 "" 或 "/piagentfortos"） */
export const BASE_PATH = raw.replace(/\/+$/, "");

/**
 * 给以 `/` 开头的站内路径补上前缀。
 * - 绝对 URL（http://、//cdn…）与非 `/` 开头路径原样返回
 * - 已带前缀的路径不会重复添加（幂等）
 */
export function withBasePath(path: string): string {
  // 非站内路径：绝对 URL（https://）与协议相对 URL（//cdn/…）都原样返回
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  if (!BASE_PATH) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  return `${BASE_PATH}${path}`;
}
