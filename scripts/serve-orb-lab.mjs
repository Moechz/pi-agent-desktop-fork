#!/usr/bin/env node
/**
 * 把 public/orb-lab.html 端到局域网上（TOS 运行时的 public 目录是 root 所有，
 * 当前进程写不进去，所以用临时静态服务代替）。
 *
 * 用法：
 *   node scripts/serve-orb-lab.mjs [port]        # 默认 18080
 *
 * 只是给「看一眼球」用的临时服务，看完 Ctrl-C / kill 即可；不写任何文件。
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve, normalize, extname, sep } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(here, "../public");
const PORT = Number(process.argv[2] || 18080);
const HOST = "0.0.0.0";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/" || rel === "") rel = "/orb-lab.html";

    // 只允许 public 目录内的文件
    const target = resolve(PUBLIC, "." + normalize(rel));
    if (target !== PUBLIC && !target.startsWith(PUBLIC + sep)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const info = await stat(target);
    if (!info.isFile()) {
      res.writeHead(404).end("not found");
      return;
    }
    const body = await readFile(target);
    res.writeHead(200, {
      "content-type": TYPES[extname(target).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
      "content-length": body.length,
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`思考球实验室：http://<本机IP>:${PORT}/orb-lab.html`);
  console.log(`目录：${PUBLIC}`);
  console.log("（临时服务，看完 kill 掉即可）");
});
