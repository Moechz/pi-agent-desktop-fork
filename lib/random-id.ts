/**
 * 与「安全上下文」无关的唯一 ID / 剪贴板工具。
 *
 * 背景（TOS 真机实测）：`crypto.randomUUID()` **仅在安全上下文**（HTTPS 或 localhost）
 * 可用；TOS 应用走的是 `http://<nas>:8181/<appid>/`（局域网明文 HTTP）→ 该 API 不存在，
 * 直接调用会让「发送消息 / 新建会话 / 分支会话」抛出
 * `globalThis.crypto.randomUUID is not a function` 而整体失败。
 *
 * 同理 `navigator.clipboard` 也是安全上下文专属，明文 HTTP 下必须退化到
 * 隐藏 textarea + execCommand 的老路子。
 */

type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
};

/** 生成 UUID v4 风格 ID；不依赖安全上下文，浏览器/Node 通用。 */
export function randomId(cryptoLike: CryptoLike | undefined = (globalThis as { crypto?: CryptoLike }).crypto): string {
  if (cryptoLike) {
    if (typeof cryptoLike.randomUUID === "function") {
      try {
        return cryptoLike.randomUUID();
      } catch {
        /* 某些实现下会抛（例如被策略禁用），继续走下面的兜底 */
      }
    }
    if (typeof cryptoLike.getRandomValues === "function") {
      try {
        const bytes = cryptoLike.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      } catch {
        /* 继续兜底 */
      }
    }
  }
  // 最后兜底：时间戳 + 两段随机串（仅用于客户端临时标识，不需要密码学强度）
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand()}-${rand()}`;
}

/**
 * 复制文本到剪贴板。返回是否成功。
 * 明文 HTTP（非安全上下文）下 navigator.clipboard 不可用 → 退化 textarea + execCommand。
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const clipboard = (globalThis as { navigator?: Navigator }).navigator?.clipboard;
  if (clipboard && typeof clipboard.writeText === "function") {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      /* 权限被拒或非安全上下文 → 走兜底 */
    }
  }
  try {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) return false;
    const area = doc.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    doc.body.appendChild(area);
    area.select();
    const ok = doc.execCommand("copy");
    doc.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
