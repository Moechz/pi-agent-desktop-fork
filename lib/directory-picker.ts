/**
 * 目录选择器控制器（Promise 化的"打开弹窗并等待选择"）。
 *
 * 用途：`pickDirectoryFromHost()` 是普通函数（非组件），无法直接渲染弹窗。
 * 由 <DirectoryPickerHost/> 在 App 根部注册 handler，函数侧调用 requestDirectoryPick()
 * 拿到一个 Promise，弹窗确认/取消时 resolve。
 */

export interface DirectoryPickerRequest {
  /** 打开时的起始目录（TOS 绝对路径）；缺省由弹窗决定 */
  initialPath?: string;
}

export type DirectoryPickerResolver = (path: string | null) => void;
export type DirectoryPickerHandler = (
  request: DirectoryPickerRequest,
  resolve: DirectoryPickerResolver,
) => void;

let handler: DirectoryPickerHandler | null = null;

/** 由 <DirectoryPickerHost/> 挂载时注册（卸载时传 null） */
export function setDirectoryPickerHandler(next: DirectoryPickerHandler | null): void {
  handler = next;
}

/** 是否已有可用的应用内目录选择器（TOS 环境且 Host 已挂载） */
export function isDirectoryPickerAvailable(): boolean {
  return handler !== null;
}

/** 打开目录选择弹窗；无 handler 时立即返回 null（调用方自行回退） */
export function requestDirectoryPick(
  request: DirectoryPickerRequest = {},
): Promise<string | null> {
  if (!handler) return Promise.resolve(null);
  return new Promise<string | null>((resolve) => {
    handler?.(request, resolve);
  });
}
