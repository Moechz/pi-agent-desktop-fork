/**
 * 迭代式 JSON 序列化（无递归），等价于 JSON.stringify 的常用语义。
 *
 * 为什么需要它：会话 API 返回的 `tree` 按 parentId 嵌套，线性会话的嵌套深度
 * 等于条目数（实测 2613 层）。JSON.stringify 逐层递归，在栈较小的运行时
 * （macOS 上应用用 Electron utilityProcess 起 server）会抛
 * `RangeError: Maximum call stack size exceeded` → 接口 500。
 * 这里用显式栈代替调用栈，深度不再受限。
 *
 * 语义对齐 JSON.stringify：
 * - 对象中值为 undefined 的键被跳过；数组中的 undefined 输出 null
 * - NaN / Infinity → null（交给内部 JSON.stringify 处理原生值）
 * - 支持 toJSON()（调用一次）
 * - 返回 string（与 JSON.stringify 不同，顶层 undefined 输出 "null"）
 */
export function stringifyDeep(root: unknown): string {
  type Frame = { kind: "value"; v: unknown } | { kind: "text"; s: string };

  const parts: string[] = [];
  const stack: Frame[] = [{ kind: "value", v: root }];

  const pushPrimitive = (v: unknown): void => {
    if (v === undefined) {
      parts.push("null");
      return;
    }
    const s = JSON.stringify(v);
    parts.push(s === undefined ? "null" : s);
  };

  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.kind === "text") {
      parts.push(frame.s);
      continue;
    }

    let v = frame.v;

    // toJSON 支持（Date / 自定义对象），只调用一次
    if (v !== null && typeof v === "object") {
      const toJSON = (v as { toJSON?: unknown }).toJSON;
      if (typeof toJSON === "function") {
        v = (toJSON as () => unknown).call(v);
      }
    }

    if (v === null || typeof v !== "object") {
      pushPrimitive(v);
      continue;
    }

    if (Array.isArray(v)) {
      if (v.length === 0) {
        parts.push("[]");
        continue;
      }
      stack.push({ kind: "text", s: "]" });
      for (let i = v.length - 1; i >= 0; i--) {
        stack.push({ kind: "value", v: v[i] });
        if (i > 0) stack.push({ kind: "text", s: "," });
      }
      stack.push({ kind: "text", s: "[" });
      continue;
    }

    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
    if (keys.length === 0) {
      parts.push("{}");
      continue;
    }
    stack.push({ kind: "text", s: "}" });
    for (let i = keys.length - 1; i >= 0; i--) {
      const k = keys[i];
      stack.push({ kind: "value", v: obj[k] });
      stack.push({ kind: "text", s: `${JSON.stringify(k)}:` });
      if (i > 0) stack.push({ kind: "text", s: "," });
    }
    stack.push({ kind: "text", s: "{" });
  }

  return parts.join("");
}

/** 与 NextResponse.json 等价，但用迭代式序列化（深树安全）。 */
export function jsonResponseDeep(payload: unknown, status = 200): Response {
  return new Response(stringifyDeep(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
