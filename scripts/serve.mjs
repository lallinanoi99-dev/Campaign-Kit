// Local static server that behaves like GitHub Pages: unknown paths get 404.html (status 404).
// node scripts/serve.mjs [port] [base]   e.g. node scripts/serve.mjs 5174 /Campaign-Kit  (like user.github.io/Campaign-Kit/)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv[2] || process.env.PORT || 5173);
const base = (process.argv[3] || "").replace(/\/$/, "");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".ico": "image/x-icon" };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let rel = decodeURIComponent(url.pathname);
  if (base) {
    if (rel === base) { res.writeHead(301, { Location: base + "/" }).end(); return; }
    rel = rel.startsWith(base + "/") ? rel.slice(base.length) : "/__outside__";
  }
  let file = path.join(root, rel);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  let status = 200;
  if (!fs.existsSync(file) || /[\\/](worker|contracts|node_modules|\.git)[\\/]/.test(file)) { file = path.join(root, "404.html"); status = 404; }
  res.writeHead(status, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Campaign Kit → http://localhost:${port}${base}/`));
