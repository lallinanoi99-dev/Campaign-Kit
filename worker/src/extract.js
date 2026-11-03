// POST /extract-url { url } → { title, text, url } — reused from the Inkprint Worker (BOT09).
// Only public http(s) hosts on default ports; a short readability-style pass keeps headings, paragraphs and list items.
const FETCH_TIMEOUT_MS = 5_000;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const MAX_CHARS = 3_000;

export function blockedHost(url) {
  if (!["http:", "https:"].includes(url.protocol)) return "scheme";
  if (url.username || url.password) return "credentials";
  if (url.port && url.port !== "80" && url.port !== "443") return "port";
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || /\.(localhost|local|internal|lan|home|arpa)$/.test(host) || (!host.includes(".") && !host.includes(":"))) return "private";
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return "private";
    if (a === 169 && b === 254) return "private";
    if (a === 172 && b >= 16 && b <= 31) return "private";
    if (a === 192 && b === 168) return "private";
    if (a === 100 && b >= 64 && b <= 127) return "private";
    if (a === 198 && (b === 18 || b === 19)) return "private";
    return null;
  }
  if (/^(0x[0-9a-f]*|\d+)(\.(0x[0-9a-f]*|\d+)){0,3}$/i.test(host)) return "private";
  if (host.includes(":") && (host === "::" || host === "::1" || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith("::ffff:"))) return "private";
  return null;
}

async function readCapped(res) {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PAGE_BYTES) { await reader.cancel(); throw Object.assign(new Error("too large"), { code: "too_large" }); }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder("utf-8", { fatal: false }).decode(all);
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
const decode = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
const strip = (s) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export function extractArticle(html) {
  const title = strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").slice(0, 200);
  const desc = strip(html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)/i)?.[1] || "");
  let body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe|form|button|select)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|footer|aside)\b[\s\S]*?<\/\1>/gi, " ");
  const pickTag = (tag) => [...body.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))].map((m) => m[1]).sort((a, b) => b.length - a.length)[0];
  body = pickTag("main") || pickTag("article") || body;
  const blocks = [...body.matchAll(/<(h[1-3]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => strip(m[2])).filter((t) => t.length >= 12);
  const text = [desc, ...blocks].filter(Boolean).join("\n").slice(0, MAX_CHARS);
  return { title, text };
}

export async function extractUrl(raw) {
  let url;
  try { url = new URL(String(raw || "").trim()); } catch { return { status: 400, body: { error: "bad_url" } }; }
  try {
    let res;
    for (let hop = 0; ; hop++) {
      if (blockedHost(url)) return { status: 400, body: { error: "blocked" } };
      res = await fetch(url.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "User-Agent": "CampaignKitBot/1.0 (+reads a product page for campaign context)", Accept: "text/html,application/xhtml+xml" },
      });
      if (res.status < 300 || res.status >= 400) break;
      const next = res.headers.get("Location");
      if (!next || hop >= MAX_REDIRECTS) return { status: 502, body: { error: "fetch_failed" } };
      url = new URL(next, url);
    }
    if (!res.ok) return { status: 502, body: { error: "fetch_failed" } };
    if (!/text\/html|application\/xhtml/i.test(res.headers.get("Content-Type") || "")) return { status: 415, body: { error: "not_html" } };
    const out = extractArticle(await readCapped(res));
    if (out.text.length < 40) return { status: 422, body: { error: "no_text" } };
    return { status: 200, body: { ...out, url: url.toString() } };
  } catch (e) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError") return { status: 504, body: { error: "timeout" } };
    return { status: 502, body: { error: "fetch_failed" } };
  }
}
