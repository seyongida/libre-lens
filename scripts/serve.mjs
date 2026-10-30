import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve("dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".gz": "application/gzip",
};
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      let file = resolve(root, "." + decodeURIComponent(url.pathname));
      if (file !== root && !file.startsWith(root + sep)) throw Error();
      if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
      res.setHeader(
        "Content-Type",
        types[extname(file)] || "application/octet-stream",
      );
      res.setHeader("Cache-Control", "no-cache");
      res.end(await readFile(file));
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(4173, "0.0.0.0", () => console.log("Local: http://localhost:4173"));
