import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCsrfToken,
  parseTosSession,
  tosCreateFolder,
  tosErrorKey,
  tosFolderInfo,
  tosListDirectory,
  TosApiError,
} from "./tos-api.ts";

const COOKIES = "userName=admin; TMSESSNAME=abc123; X-Csrf-Token=xyz789; other=1";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("从 Cookie 解析 CSRF 令牌与会话标记", () => {
  assert.equal(parseCsrfToken(COOKIES), "xyz789");
  assert.equal(parseCsrfToken("foo=1"), null);
  assert.equal(parseCsrfToken(""), null);
  assert.equal(parseCsrfToken("X-Csrf-Token=needs%20decode"), "needs decode");
  assert.equal(parseTosSession(COOKIES), true);
  assert.equal(parseTosSession("userName=admin"), false);
});

test("tosListDirectory：请求同源根路径 + 带 CSRF 头，并规范化返回", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return jsonResponse({
      code: true,
      code_num: 0,
      data: {
        data: [
          { name: "Music", path: "/Volume1/public/Music", f_type: "folder", permission: "rwxr-xr-x" },
          { name: "a.txt", path: "/Volume1/public/a.txt", f_type: "file", m_time: "2026-01-01" },
          { bad: true },
        ],
      },
    });
  }) as unknown as typeof fetch;

  const entries = await tosListDirectory("/Volume1/public", {
    origin: "http://nas:8181",
    cookieString: COOKIES,
    fetchImpl,
  });

  assert.equal(calls.length, 1);
  // 必须是 TOS 根路径（不能被应用 basePath 前缀污染）
  assert.equal(
    calls[0].url,
    "http://nas:8181/fileManage/list?path=%2FVolume1%2Fpublic",
  );
  assert.deepEqual((calls[0].init?.headers as Record<string, string>)["X-Csrf-Token"], "xyz789");
  assert.equal(entries.length, 2, "缺少必要字段的行应被过滤");
  assert.deepEqual(entries[0], {
    name: "Music",
    path: "/Volume1/public/Music",
    fType: "folder",
    permission: "rwxr-xr-x",
    owner: undefined,
    mTime: undefined,
  });
  assert.equal(entries[1].fType, "file");
});

test("tosFolderInfo：解析 is_only_read 供可写性预检", async () => {
  const fetchImpl = (async () =>
    jsonResponse({
      code: true,
      code_num: 0,
      data: { path: "/Volume1/public", permission: "rwxr-xr-x", is_only_read: true },
    })) as unknown as typeof fetch;

  const info = await tosFolderInfo("/Volume1/public", { origin: "http://nas:8181", fetchImpl });
  assert.equal(info.isOnlyRead, true);
  assert.equal(info.permission, "rwxr-xr-x");
});

test("tosCreateFolder：POST JSON body type=2", async () => {
  const calls: RequestInit[] = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    calls.push(init ?? {});
    return jsonResponse({ code: true, code_num: 0, data: { path: "/Volume1/public/New" } });
  }) as unknown as typeof fetch;

  await tosCreateFolder("/Volume1/public/New", {
    origin: "http://nas:8181",
    cookieString: COOKIES,
    fetchImpl,
  });

  assert.equal(calls[0].method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].body)), { path: "/Volume1/public/New", type: 2 });
  assert.equal((calls[0].headers as Record<string, string>)["Content-Type"], "application/json");
  assert.equal((calls[0].headers as Record<string, string>)["X-Csrf-Token"], "xyz789");
});

test("业务失败（code=false）抛出带错误码的 TosApiError，并可映射 i18n 键", async () => {
  const fetchImpl = (async () =>
    jsonResponse({ code: false, code_num: 24, code_msg: "missing session" })) as unknown as typeof fetch;

  await assert.rejects(
    () => tosListDirectory("/Volume1", { origin: "http://nas:8181", fetchImpl }),
    (error: unknown) => {
      assert.ok(error instanceof TosApiError);
      assert.equal((error as TosApiError).codeNum, 24);
      assert.equal(tosErrorKey(error), "tos.sessionMissing");
      return true;
    },
  );
});

test("非 JSON 响应与未知错误码不崩", async () => {
  const fetchImpl = (async () => new Response("<html>403</html>", { status: 403 })) as unknown as typeof fetch;

  await assert.rejects(
    () => tosFolderInfo("/Volume1", { origin: "http://nas:8181", fetchImpl }),
    (error: unknown) => {
      assert.ok(error instanceof TosApiError);
      assert.equal(tosErrorKey(error), null);
      return true;
    },
  );
});
