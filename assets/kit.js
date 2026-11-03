// Campaign Kit — pure helpers: kit validation, channel caps, template kits, exports, dates.
// No DOM here, so it can be tested in Node: node scripts/test-kit.mjs

export const CHANNELS = ["X", "Instagram", "LinkedIn", "TikTok", "Email", "Community"];
export const CHANNEL_LABEL = { X: "X", Instagram: "Instagram", LinkedIn: "LinkedIn", TikTok: "TikTok (script)", Email: "Email", Community: "Community" };
export const LIMITS = { X: 280, LinkedIn: 3000, Instagram: 2200, TikTok: 2200, Email: 5000, Community: 2000 };
export const WEEK_CAPS = { X: 7, Instagram: 4, LinkedIn: 3, TikTok: 3, Email: 2, Community: 4 };
export const DEFAULT_TIME = { X: "09:00", Instagram: "18:00", LinkedIn: "08:30", TikTok: "19:00", Email: "10:00", Community: "17:00" };
export const TONES = ["Friendly", "Bold", "Professional", "Playful", "Inspiring"];
export const BUDGETS = ["$0 (organic only)", "Small", "Medium"];
export const PARTS = ["positioning", "personas", "calendar", "ads", "hashtags", "checklist"];
export const AD_LIMITS = { headline: 40, description: 125, cta: 20 };
export const MAX_MILESTONES = 30;

const str = (v, n = 2000) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const strs = (v, max, n = 200) => (Array.isArray(v) ? v.map((x) => str(x, n)).filter(Boolean).slice(0, max) : []);
const tag = (t) => { const s = str(t, 40).replace(/\s+/g, ""); return s ? (s.startsWith("#") ? s : "#" + s) : ""; };
let _uid = 0;
export const uid = () => Date.now().toString(36) + (++_uid).toString(36) + Math.random().toString(36).slice(2, 6);

// ---------- validation ----------
// Returns { kit, missing[] }. Each part is cleaned on its own; a part that's missing or empty is listed so the
// browser can ask the Worker for just that part.
export function normalizeKit(raw, brief) {
  const k = raw && typeof raw === "object" ? raw : {};
  const missing = [];
  const out = {};

  const p = k.positioning || {};
  out.positioning = {
    oneLiner: str(p.oneLiner, 200), pitch: str(p.pitch, 600),
    messages: strs(p.messages, 3), proofToGather: strs(p.proofToGather, 3),
    useWords: strs(p.useWords, 10, 40), avoidWords: strs(p.avoidWords, 8, 40),
  };
  if (!out.positioning.oneLiner || !out.positioning.pitch || out.positioning.messages.length < 2) missing.push("positioning");

  out.personas = (Array.isArray(k.personas) ? k.personas : []).slice(0, 3).map((x) => ({
    id: uid(), name: str(x?.name, 60), emoji: str(x?.emoji, 8) || "🙂", who: str(x?.who, 240),
    pains: strs(x?.pains, 4, 120), wants: strs(x?.wants, 4, 120), hangouts: strs(x?.hangouts, 5, 80), bestMessage: str(x?.bestMessage, 240),
  })).filter((x) => x.name && x.who);
  if (out.personas.length < 2) missing.push("personas");

  const channels = brief?.channels?.length ? brief.channels : CHANNELS;
  out.calendar = capCalendar((Array.isArray(k.calendar) ? k.calendar : []).map((x) => cleanPost(x, channels)).filter(Boolean), channels);
  if (out.calendar.length < 4) missing.push("calendar");

  out.ads = (Array.isArray(k.ads) ? k.ads : []).slice(0, 3).map((a) => ({
    id: uid(), angle: str(a?.angle, 20) || "Angle", headline: str(a?.headline, 80), description: str(a?.description, 200), cta: str(a?.cta, 30),
  })).filter((a) => a.headline);
  if (out.ads.length < 3) missing.push("ads");

  const h = k.hashtags || {};
  out.hashtags = { core: strs(h.core, 6, 40).map(tag).filter(Boolean), niche: strs(h.niche, 10, 40).map(tag).filter(Boolean) };
  if (!out.hashtags.core.length) missing.push("hashtags");

  const c = k.checklist || {};
  const mk = (arr) => strs(arr, 12, 120).map((text) => ({ id: uid(), text }));
  out.checklist = { before: mk(c.before), launch: mk(c.launch), after: mk(c.after) };
  trimChecklist(out.checklist);
  if (!out.checklist.before.length || !out.checklist.launch.length || !out.checklist.after.length) missing.push("checklist");

  return { kit: out, missing };
}

export function cleanPost(x, channels = CHANNELS) {
  if (!x || typeof x !== "object") return null;
  const day = Math.round(Number(x.day));
  if (!Number.isFinite(day) || day < -7 || day > 7) return null;
  const channel = CHANNELS.find((c) => c.toLowerCase() === String(x.channel || "").toLowerCase().replace(/^twitter$/, "x"));
  if (!channel || !channels.includes(channel)) return null;
  const text = str(x.text, 4000);
  if (!text) return null;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(x.time) ? x.time : DEFAULT_TIME[channel];
  return {
    id: uid(), day, channel, time, hook: str(x.hook, 160) || text.split("\n")[0].slice(0, 80), text,
    hashtags: channel === "Email" ? [] : strs(x.hashtags, 6, 40).map(tag).filter(Boolean), imageIdea: str(x.imageIdea, 240),
  };
}

// Keep the plan realistic: weekly caps per channel, at most one post per channel per day,
// and a hero post on every channel on launch day (the hero is never dropped).
export function capCalendar(posts, channels) {
  const seen = new Set();
  const count = {};
  const sorted = [...posts].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
  const kept = [];
  for (const p of sorted) {
    const dayKey = `${p.day}|${p.channel}`;
    if (seen.has(dayKey)) continue;
    const week = p.day < 0 ? "pre" : p.day > 0 ? "post" : "launch";
    const wk = `${week}|${p.channel}`;
    if (week !== "launch") {
      count[wk] = (count[wk] || 0) + 1;
      if (count[wk] > WEEK_CAPS[p.channel]) continue;
    }
    seen.add(dayKey);
    kept.push(p);
  }
  return kept;
}

export function trimChecklist(c) {
  // the contract allows 1..30 milestones
  let total = c.before.length + c.launch.length + c.after.length;
  for (const g of ["after", "before", "launch"]) while (total > MAX_MILESTONES && c[g].length > 1) { c[g].pop(); total--; }
  return c;
}
export const milestoneList = (c) => [...c.before, ...c.launch, ...c.after];

export function heroMissing(kit, channels) {
  const have = new Set(kit.calendar.filter((p) => p.day === 0).map((p) => p.channel));
  return channels.filter((c) => !have.has(c));
}

// ---------- brief ----------
export function briefProblems(b, today = todayISO()) {
  const p = {};
  if (!str(b.name)) p.name = "Add your product name";
  if (!str(b.what)) p.what = "Say what it is in one line";
  if (!str(b.audience)) p.audience = "Who is it for?";
  if (!b.goal) p.goal = "Pick a goal";
  if (!b.channels?.length) p.channels = "Pick at least one channel";
  if (!b.budget) p.budget = "Pick a budget";
  if (!b.tone) p.tone = "Pick a tone";
  if (!b.launchDate) p.launchDate = "Pick a launch date";
  else if (b.launchDate < today) p.launchDate = "Pick a future date (or today)";
  if (b.website && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(b.website.trim())) p.website = "Use a full link like https://example.com";
  return p;
}

// ---------- dates ----------
export const todayISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function dayDate(launchISO, offset) {
  const [y, m, d] = launchISO.split("-").map(Number);
  return new Date(y, m - 1, d + offset);
}
export const isoOf = (date) => todayISO(date);
export const fmtDay = (date) => date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
export const fmtLong = (date) => date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
export const dayLabel = (n) => (n === 0 ? "Launch day" : n < 0 ? `Day −${-n}` : `Day +${n}`);
export const launchUnix = (launchISO) => Math.floor(Date.UTC(...launchISO.split("-").map((v, i) => Number(v) - (i === 1 ? 1 : 0))) / 1000);

// ---------- byte-safe title for the contract (≤ 48 UTF-8 bytes) ----------
export function clipBytes(s, max = 48) {
  const enc = new TextEncoder();
  let out = "";
  for (const ch of String(s).trim()) {
    if (enc.encode(out + ch).length > max) break;
    out += ch;
  }
  return out.trim() || "Campaign";
}

// ---------- fingerprint input ----------
// Stable JSON of what the plan says (no ids, no UI state). Hashed with keccak256 in the browser.
export function canonicalPlan(c) {
  const k = c.kit;
  const plain = {
    brief: { name: c.brief.name, what: c.brief.what, audience: c.brief.audience, goal: c.brief.goal, channels: c.brief.channels, budget: c.brief.budget, tone: c.brief.tone, launchDate: c.brief.launchDate, facts: c.brief.facts || [] },
    positioning: k.positioning,
    personas: k.personas.map(({ id, ...r }) => r),
    calendar: [...k.calendar].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time) || a.channel.localeCompare(b.channel) || a.text.localeCompare(b.text)).map(({ id, ...r }) => r),
    ads: k.ads.map(({ id, ...r }) => r),
    hashtags: k.hashtags,
    checklist: { before: k.checklist.before.map((x) => x.text), launch: k.checklist.launch.map((x) => x.text), after: k.checklist.after.map((x) => x.text) },
  };
  return stableStringify(plain);
}
export function stableStringify(v) {
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
  return JSON.stringify(v ?? null);
}

// ---------- exports ----------
const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // no formula injection in spreadsheets
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function sortedPosts(kit) {
  return [...kit.calendar].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
}
export function toCSV(c) {
  const rows = [["date", "time", "channel", "day", "hook", "text", "hashtags", "image_idea"]];
  for (const p of sortedPosts(c.kit)) {
    rows.push([isoOf(dayDate(c.brief.launchDate, p.day)), p.time, p.channel, p.day, p.hook, p.text, p.hashtags.join(" "), p.imageIdea]);
  }
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const icsEsc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function icsFold(line) {
  // fold at 74 octets (UTF-8 safe)
  const enc = new TextEncoder();
  const out = [];
  let cur = "";
  for (const ch of line) {
    if (enc.encode(cur + ch).length > 74) { out.push(cur); cur = " " + ch; } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n");
}
const icsStamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
export function toICS(c, now = new Date()) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Campaign Kit//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsEsc(c.brief.name + " campaign")}`];
  for (const p of sortedPosts(c.kit)) {
    const d = dayDate(c.brief.launchDate, p.day);
    const [hh, mm] = p.time.split(":").map(Number);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm);
    const end = new Date(start.getTime() + 30 * 60000);
    const local = (x) => `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, "0")}${String(x.getDate()).padStart(2, "0")}T${String(x.getHours()).padStart(2, "0")}${String(x.getMinutes()).padStart(2, "0")}00`;
    const desc = [p.text, p.hashtags.join(" "), p.imageIdea ? "Image idea: " + p.imageIdea : ""].filter(Boolean).join("\n\n");
    lines.push("BEGIN:VEVENT", `UID:${p.id}@campaignkit`, `DTSTAMP:${icsStamp(now)}`, `DTSTART:${local(start)}`, `DTEND:${local(end)}`,
      `SUMMARY:${icsEsc(`[${p.channel}] ${p.hook}`)}`, `DESCRIPTION:${icsEsc(desc)}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

export function allPostsText(c) {
  let out = `${c.brief.name} — campaign posts\n`;
  let lastDay = null;
  for (const p of sortedPosts(c.kit)) {
    if (p.day !== lastDay) { out += `\n=== ${dayLabel(p.day)} · ${fmtDay(dayDate(c.brief.launchDate, p.day))} ===\n`; lastDay = p.day; }
    out += `\n[${p.channel} · ${p.time}]\n${p.text}${p.hashtags.length ? "\n" + p.hashtags.join(" ") : ""}\n`;
  }
  return out;
}

// ---------- template kit (used when the Worker isn't set up, or as a fallback) ----------
const TONE_WORDS = {
  Friendly: { hi: "Hey friends", cta: "Come say hi", vibe: "simple and kind" },
  Bold: { hi: "Big news", cta: "Get in now", vibe: "loud and clear" },
  Professional: { hi: "Introducing", cta: "Learn more", vibe: "clear and credible" },
  Playful: { hi: "Psst", cta: "Take it for a spin", vibe: "fun and light" },
  Inspiring: { hi: "Imagine this", cta: "Start today", vibe: "hopeful and warm" },
};
const GOAL_CTA = { Launch: "Try it on launch day", Signups: "Sign up free", Sales: "Get yours", Awareness: "Follow along", "Event attendance": "Save your spot" };

// shared words for every template (kit, post variants, field variants)
function tctx(b) {
  const t = TONE_WORDS[b.tone] || TONE_WORDS.Friendly;
  const name = b.name.trim();
  const what = b.what.trim().replace(/\.$/, "");
  const who = b.audience.trim().replace(/\.$/, "");
  const cta = GOAL_CTA[b.goal] || "Learn more";
  const fact = (b.facts || []).find((f) => f && f.trim())?.trim().replace(/\.$/, "");
  const slug = name.replace(/[^\p{L}\p{N}]+/gu, "");
  const core = ["#" + slug, "#" + slug + "Launch", "#LaunchDay"].filter((x) => x.length > 1);
  const niche = who.split(/\s+/).filter((w) => w.length > 4).slice(0, 3).map((w) => "#" + w.replace(/[^\p{L}\p{N}]/gu, ""));
  const tags = (n) => [core[0], ...niche].slice(0, n);
  const lw = what.charAt(0).toLowerCase() + what.slice(1);
  return { t, name, what, lw, who, cta, fact, core, niche, tags };
}
function fmtPost(c, ch, hook, body, day) {
  const { t, name, who, cta } = c;
  const tg = ch === "Email" ? [] : c.tags(ch === "X" ? 2 : 4);
  let text;
  if (ch === "X") text = `${hook}\n\n${body}`.slice(0, 280 - tg.join(" ").length - 2);
  else if (ch === "Instagram") text = `${hook} ✨\n\n${body}\n\n${cta} — link in bio.`;
  else if (ch === "LinkedIn") text = `${hook}\n\n${body}\n\nWe built ${name} for ${who}. ${cta}.`;
  else if (ch === "TikTok") text = `[Scene 1 — face to camera] ${hook}\n[Scene 2 — show the product] ${body}\n[Scene 3 — text on screen] ${cta}`;
  else if (ch === "Email") text = `Subject: ${hook}\n\n${t.hi},\n\n${body}\n\n${cta} →\n\n— The ${name} team`;
  else text = `${t.hi}! ${hook}. ${body}`;
  return { day, channel: ch, time: DEFAULT_TIME[ch], hook, text, hashtags: tg, imageIdea: day === 0 ? `A bright photo of ${name} in use, with the words "Out now"` : `A simple graphic with the line "${hook}"` };
}
function dayIdeas(c) {
  const { name, what, who } = c;
  return [
    { day: -7, hook: `Something new is coming for ${who.split(" ").slice(-2).join(" ")}`, body: `We've been building ${name} — ${what.toLowerCase()}. One week to go. Want a first look?` },
    { day: -6, hook: "The problem we kept running into", body: `Most ${who} we talked to said the same thing: it shouldn't be this hard. That's why we made ${name}.` },
    { day: -5, hook: "Behind the scenes", body: `A peek at how ${name} came together — the late nights, the early sketches, the first version that actually worked.` },
    { day: -4, hook: "3 things you'll be able to do", body: `With ${name} you'll be able to:\n1. Get started in minutes\n2. Do it your way\n3. See results without the hassle\n(⚠ Add proof — swap in your real features)` },
    { day: -3, hook: "Who is this for?", body: `${name} is for ${who}. If that's you, launch day is in 3 days.` },
    { day: -2, hook: "Your questions, answered", body: `What is ${name}? ${what}. When? In 2 days. Ask us anything below 👇` },
    { day: -1, hook: "Tomorrow.", body: `Tomorrow ${name} goes live. Set a reminder — we'd love you to be one of the first.` },
    { day: 1, hook: "Thank you for day one", body: `Yesterday ${name} went live. Thank you to everyone who tried it, shared it and sent feedback.` },
    { day: 2, hook: "What people are saying", body: `[customer quote] ⚠ Add proof — share a real reaction from launch day here.` },
    { day: 3, hook: "How it works in 30 seconds", body: `Step 1: open ${name}. Step 2: tell it what you need. Step 3: done. That's it.` },
    { day: 4, hook: "The question we got most", body: `"Is ${name} right for me?" If you're one of the ${who}, yes — here's why.` },
    { day: 5, hook: "A small story from this week", body: `One of our first users told us how ${name} fit into their week. ⚠ Add proof — ask them if you can share it.` },
    { day: 6, hook: "Tips to get more out of it", body: `Three quick tips for ${name}: start small, make it a habit, and tell us what's missing.` },
    { day: 7, hook: "One week in", body: `One week since launch. Thank you. If you've been waiting, today's a good day to try ${name}.` },
  ];
}
// extra ideas used by "Another version" (no AI needed)
function morePosts(c, day) {
  const { name, what, lw, who, cta, fact, t } = c;
  if (day === 0) return [
    { hook: `${t.hi} — ${name} is live today`, body: `${name} is live! ${what}.${fact ? ` ${fact}.` : ""} Made for ${who}. ${cta}.` },
    { hook: `Today's the day: ${name} is out`, body: `${name} is ${lw} — made for ${who}.${fact ? ` ${fact}.` : ""} ${cta}.` },
    { hook: "It's here.", body: `After weeks of building, ${name} is finally live. ${what}. Be one of the first to try it — ${cta.toLowerCase()}.` },
    { hook: `Launch day for ${name} 🚀`, body: `We made ${name} for ${who}. It's live right now.${fact ? ` ${fact}.` : ""} We'd love to hear what you think.` },
  ];
  if (day === -1) return [
    { hook: "Last day before launch", body: `${name} goes live tomorrow. If you're one of the ${who}, this one's for you.` },
    { hook: "The final countdown", body: `One more sleep until ${name}. ${what}. See you tomorrow 👋` },
  ];
  if (day === 1) return [
    { hook: "Day two", body: `Launch day was a lot — thank you. If you missed it, ${name} is live now. ${cta}.` },
    { hook: "In case you missed it", body: `${name} launched yesterday: ${lw}. ${cta}.` },
  ];
  if (day < 0) return [
    { hook: `Why we built ${name}`, body: `We kept seeing ${who} run into the same problem, so we built ${name}: ${lw}. Launching soon.` },
    { hook: "A sneak peek", body: `Here's a first look at ${name}. More on launch day — stay close.` },
    { hook: "What would make your week easier?", body: `We're building ${name} for ${who}. Tell us the one thing you'd want it to do 👇` },
    { hook: "Mark your calendar", body: `${name} launches in ${-day} day${day === -1 ? "" : "s"}. ${what}. Don't miss day one.` },
    { hook: `Meet the people behind ${name}`, body: `We're a small team who care about ${who}. Say hi — launch is close.` },
  ];
  return [
    { hook: "In case you missed it", body: `${name} is live: ${lw}. ${cta}.` },
    { hook: "Made for you", body: `If you're one of the ${who}, ${name} was built with you in mind. ${cta}.` },
    { hook: "We're listening", body: `Thank you for every message since launch. What should we improve next? 👇` },
    { hook: "Quick demo", body: `See ${name} in action. [short screen recording] ⚠ Add proof — record a real 20-second demo.` },
  ];
}

/** A different template draft for the same post (keeps day, channel, time and hashtags). k = how many times asked. */
export function altPost(b, post, k = 0) {
  const c = tctx(b);
  const own = dayIdeas(c).filter((x) => x.day === post.day);
  const range = post.day < 0 ? [-7, -2] : [2, 7];
  const near = post.day === 0 || Math.abs(post.day) === 1 ? [] : dayIdeas(c).filter((x) => x.day >= range[0] && x.day <= range[1] && x.day !== post.day);
  const pool = [...own, ...morePosts(c, post.day), ...near].filter((x) => x.hook.trim() !== (post.hook || "").trim());
  const pick = pool[k % pool.length];
  const p = fmtPost(c, post.channel, pick.hook, pick.body, post.day);
  return { hook: p.hook, text: p.text, imageIdea: p.imageIdea };
}

/** A different template version of a positioning line or an ad. field: "oneLiner" | "pitch" | "ad:Pain" | "ad:Benefit" | "ad:Social" */
export function altText(b, field, current, k = 0) {
  const { t, name, what, lw, who, cta, fact } = tctx(b);
  const pools = {
    oneLiner: [
      `${name}: ${lw} — made for ${who}.`,
      `${what}, built for ${who}.`,
      `The simple way for ${who} to get more done — that's ${name}.`,
      `${name} helps ${who} skip the hassle and get started today.`,
    ],
    pitch: [
      `${name} is ${lw}, built for ${who}. It keeps things ${t.vibe}, so you can get going on day one.`,
      `We built ${name} because ${who} deserve something simpler. ${what}.${fact ? ` ${fact}.` : ""}`,
      `${what}. No learning curve, no fuss — just open ${name} and start.${fact ? ` ${fact}.` : ""}`,
    ],
    "ad:Pain": [
      { headline: `Tired of the hassle? Try ${name}`, description: `${what}. Made for ${who}.` },
      { headline: `Still doing it the hard way?`, description: `${name} makes it simple. ${what}.` },
      { headline: `There's an easier way`, description: `${name}: ${lw}. Built for ${who}.` },
    ],
    "ad:Benefit": [
      { headline: `${name}: simple from day one`, description: `Get started in minutes. ${fact || "Made to keep things simple."}` },
      { headline: `Get started in minutes`, description: `${what}.${fact ? ` ${fact}.` : ""}` },
      { headline: `Made for ${who.split(" ").slice(-2).join(" ")}`, description: `${name} keeps things ${t.vibe}. ${cta}.` },
    ],
    "ad:Social": [
      { headline: `Why people try ${name}`, description: `[customer quote] ⚠ Add proof — use a real quote from an early user.` },
      { headline: `Hear it from early users`, description: `[customer quote] ⚠ Add proof — share what a real user said.` },
      { headline: `Join the first ${name} users`, description: `[number of users] ⚠ Add proof — use your real signup count.` },
    ],
  };
  const pool = pools[field] || pools.oneLiner;
  const same = (x) => (typeof x === "string" ? x : x.headline) === (typeof current === "string" ? current : current?.headline);
  const opts = pool.filter((x) => !same(x));
  return opts[k % opts.length];
}

export function templateKit(b) {
  const c = tctx(b);
  const { t, name, what, lw, who, cta, fact, core, niche } = c;
  const ideas = dayIdeas(c);
  const fmt = (ch, hook, body, day) => fmtPost(c, ch, hook, body, day);

  const posts = [];
  const plan = { X: [-7, -5, -3, -1, 1, 2, 3, 5, 7], Instagram: [-6, -3, 2, 6], LinkedIn: [-6, -2, 3], TikTok: [-4, 2, 5], Email: [-7, -1, 3], Community: [-5, -2, 1, 4] };
  for (const ch of b.channels) for (const d of plan[ch] || []) {
    const idea = ideas.find((x) => x.day === d) || ideas[0];
    posts.push(fmt(ch, idea.hook, idea.body, d));
  }
  const hero = `${name} is live! ${what}.${fact ? ` ${fact}.` : ""}`;
  for (const ch of b.channels) posts.push(fmt(ch, `${t.hi} — ${name} is live today`, `${hero} Made for ${who}. ${cta}.`, 0));

  return {
    positioning: {
      oneLiner: `${name}: ${what.charAt(0).toLowerCase() + what.slice(1)} — made for ${who}.`,
      pitch: `${name} is ${what.charAt(0).toLowerCase() + what.slice(1)}, built for ${who}. It keeps things ${t.vibe}, so you can get going on day one.`,
      messages: [`Made for ${who}`, `Simple to start — no learning curve`, fact ? fact : `Built around what you actually need`],
      proofToGather: ["Get a quote from an early user", "Screenshot or short video of the product in action", "One number you can stand behind (signups, hours saved…)"],
      useWords: ["simple", "made for you", "start today", "real", "easy"],
      avoidWords: ["revolutionary", "game-changer", "best in the world", "synergy"],
    },
    personas: [
      { name: "Sam, the busy one", emoji: "🧑‍💻", who: `One of the ${who} with too little time.`, pains: ["No time to research", "Too many tools", "Gets overwhelmed"], wants: ["Something that just works", "Quick wins", "Clear next steps"], hangouts: b.channels.slice(0, 3), bestMessage: `${name} gets you there in minutes, not hours.` },
      { name: "Riley, the careful one", emoji: "🧐", who: `Compares options before deciding.`, pains: ["Worried about wasting money", "Hates hidden catches", "Needs to see proof"], wants: ["Honest answers", "Real examples", "Easy to cancel or switch"], hangouts: ["Reviews and forums", ...b.channels.slice(0, 2)], bestMessage: `No catches — see exactly how ${name} works before you commit.` },
    ],
    calendar: posts,
    ads: [
      { angle: "Pain", headline: `Tired of the hassle? Try ${name}`, description: `${what}. Made for ${who}.`, cta: cta },
      { angle: "Benefit", headline: `${name}: simple from day one`, description: `Get started in minutes. ${fact || "Made to keep things simple."}`, cta: cta },
      { angle: "Social", headline: `Why people try ${name}`, description: `[customer quote] ⚠ Add proof — use a real quote from an early user.`, cta: cta },
    ],
    hashtags: { core, niche: niche.length ? niche : ["#SmallBusiness", "#NewLaunch"] },
    checklist: {
      before: ["Finish the landing page", "Collect 1–2 customer quotes", "Make images for the hero posts", "Schedule all pre-launch posts", "Tell friends and early fans the date", "Prepare a launch-day email"],
      launch: ["Publish the hero post on every channel", "Email your list", "Reply to every comment in the first 2 hours", "Share in your communities"],
      after: ["Thank everyone who shared", "Post a real customer reaction", "Answer the top questions in a post", "Review what worked and plan next week"],
    },
  };
}
