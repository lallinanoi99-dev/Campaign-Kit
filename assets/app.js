// The Campaign Kit app: /app (brief → kit), /app?c=<id>, /app?example=<id>, /app/campaigns, /app/plan/<id> (public).
import { CONFIG, NET, CONTRACT, IS_DEPLOYED, GOALS } from "./config.js";
import {
  CHANNELS, CHANNEL_LABEL, LIMITS, AD_LIMITS, TONES, BUDGETS, DEFAULT_TIME, PARTS, MAX_MILESTONES,
  normalizeKit, templateKit, altPost, altText, briefProblems, heroMissing, cleanPost, milestoneList, trimChecklist,
  todayISO, dayDate, isoOf, fmtDay, fmtLong, dayLabel, launchUnix, clipBytes, canonicalPlan,
  toCSV, toICS, allPostsText, sortedPosts, uid,
} from "./kit.js";
import { $, $$, esc, toast, modal, closeModal, confirmBox, confetti, download, loadScript, nav, isMobile, reduced } from "./ui.js";
import { wallet, onWallet, connect, ensureChain, hasMetaMask, short, explorerAddr, explorerTx, readContract, writeContract, txError, keccakText } from "./chain.js";
import { exampleCampaign, EXAMPLE_IDS } from "./examples.js";

const ICON = { X: "x", Instagram: "instagram", LinkedIn: "linkedin", TikTok: "tiktok", Email: "email", Community: "community" };
// AI rewrites only when a Worker is connected; otherwise the offline tools (Shorter, Another version)
const AI = !!CONFIG.WORKER_URL;
const TOOLS = AI ? [["shorter", "✨ Shorter"], ["punchier", "✨ Punchier"], ["angle", "✨ Another angle"]] : [["shorter", "✂️ Shorter"], ["alt", "🔄 Another version"]];
const LANGS = ["Spanish", "French", "German", "Portuguese", "Italian", "Indonesian", "Thai", "Japanese", "Chinese (Simplified)", "Korean", "Vietnamese", "English"];
const STEPS = [["positioning", "Positioning"], ["personas", "Personas"], ["calendar", "Calendar"], ["ads", "Ads"], ["checklist", "Checklist"]];
const TABS = [["positioning", "Positioning"], ["personas", "Personas"], ["calendar", "Calendar"], ["ads", "Ads"], ["checklist", "Checklist"]];
const icon = (ch) => `<svg aria-hidden="true"><use href="#i-${ICON[ch]}"/></svg>`;
const buzzSvg = (cls = "") => `<svg class="${cls}" viewBox="0 0 72 64" aria-hidden="true"><use href="#buzz"/></svg>`;
const isPhone = () => matchMedia("(max-width: 700px)").matches; // no drag on phones: "Move to day" instead
const len = (s) => [...String(s || "")].length;
const postLen = (p) => len(p.text) + (p.hashtags.length ? 1 + len(p.hashtags.join(" ")) : 0);

// ================= storage (this browser only) =================
const KEY = "ck.v1.campaigns";
const DRAFT = "ck.v1.draft";
function loadAll() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; } }
function persistAll(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); return true; }
  catch { toast("Couldn't save — browser storage is full or blocked. Export to keep a copy."); return false; }
}
const getCampaign = (id) => loadAll()[id] || null;
const campaigns = () => Object.values(loadAll()).sort((a, b) => b.updatedAt - a.updatedAt);
function saveCampaign(c) {
  const all = loadAll();
  c.updatedAt = Date.now();
  all[c.id] = c;
  persistAll(all);
}
function deleteCampaign(id) { const all = loadAll(); delete all[id]; persistAll(all); }
function loadDraft() { try { return JSON.parse(localStorage.getItem(DRAFT) || "null"); } catch { return null; } }
function saveDraft(b) { try { localStorage.setItem(DRAFT, JSON.stringify(b)); } catch { /* ignore */ } }
const emptyBrief = () => ({ name: "", what: "", audience: "", goal: "", channels: [], budget: "", tone: "", launchDate: "", website: "", facts: ["", "", ""] });

export function appSearchItems() {
  return campaigns().slice(0, 20).map((c) => ({ t: c.brief.name, s: "Your campaign", href: `/app?c=${c.id}` }));
}

// ================= state =================
const S = { c: null, tab: "positioning", drawer: null, brief: null, touched: false, building: false, hash: null, onchain: null, busy: {} };
let root;
let sortables = [];

// ================= router entry =================
export function renderApp() {
  root = $("#app");
  if (!root.dataset.bound) bindRoot();
  closeDrawer(true);
  const u = new URL(location.href);
  const parts = u.pathname.split("/").filter(Boolean); // ["app", ...]
  const planId = parts[1] === "plan" ? parts[2] : u.searchParams.get("plan");
  document.body.classList.remove("has-bar");

  if (planId != null) return renderPublic(planId);
  if (parts[1] === "campaigns") return shell(renderCampaigns);
  const cid = u.searchParams.get("c");
  if (cid) {
    const c = getCampaign(cid);
    if (!c) return shell(() => notFoundLocal());
    S.c = c;
    return shell(renderKit);
  }
  const ex = u.searchParams.get("example");
  if (ex) {
    const c = exampleCampaign(ex);
    if (!c) return nav.go("/app", { replace: true });
    S.c = { id: null, ...c, mode: "example", createdAt: Date.now(), updatedAt: Date.now() };
    return shell(renderKit);
  }
  S.c = null;
  shell(renderBrief);
}

function shell(fn) {
  root.innerHTML = `<div class="app-shell"><aside class="sidebar" id="sidebar"></aside><div class="main" id="main"></div></div>`;
  renderSidebar();
  fn();
  updateWalletUI();
}

function renderSidebar() {
  const list = campaigns().slice(0, 8);
  const cur = S.c?.id;
  $("#sidebar").innerHTML = `
    <div class="side-card"><a class="btn primary side-new" href="/app?new=1" data-link>+ New campaign</a></div>
    <div class="side-card side-recent">
      <h4>My campaigns</h4>
      <div class="side-list">${list.length ? list.map((c) => `<a href="/app?c=${c.id}" data-link class="${c.id === cur ? "on" : ""}">${esc(c.brief.name)}<small>${esc(c.brief.goal)} · ${fmtDay(dayDate(c.brief.launchDate, 0))}</small></a>`).join("") : `<div class="side-empty">No campaigns yet.</div>`}</div>
      <div class="side-chips"><a class="btn ghost sm" href="/app/campaigns" data-link>My campaigns${list.length ? ` (${campaigns().length})` : ""}</a></div>
      ${list.length ? `<a class="side-list-all" href="/app/campaigns" data-link style="display:block;padding:8px 10px;font-size:13px;font-weight:600;color:var(--muted);text-decoration:none">See all →</a>` : ""}
    </div>
    <div class="side-card"><h4>Wallet</h4><div class="side-wallet" id="sideWallet"></div></div>`;
  updateWalletUI();
}

// ================= wallet UI =================
function walletLabel() {
  if (!hasMetaMask()) return { text: "Install MetaMask", cls: "" };
  if (!wallet.address) return { text: "Connect wallet", cls: "" };
  if (!wallet.chainOk) return { text: "Switch to BOT Chain", cls: "warn" };
  return { text: short(wallet.address), cls: "ok" };
}
function updateWalletUI() {
  const b = $("#walletBtn");
  const l = walletLabel();
  b.className = "btn wallet-btn " + l.cls;
  b.innerHTML = l.cls === "ok" ? `<span class="dot"></span>${esc(l.text)}` : esc(l.text);
  const sw = $("#sideWallet");
  if (sw) {
    sw.innerHTML = l.cls === "ok"
      ? `<span class="addr">● ${esc(short(wallet.address))}</span><small style="color:var(--muted)">${esc(NET.chainName)} · chain ${NET.chainId}</small>`
      : `<button class="btn ${l.cls === "warn" ? "white" : "dark"} sm" data-act="wallet">${esc(l.text)}</button><small style="color:var(--muted)">Only needed to stamp and tick milestones.</small>`;
  }
}
onWallet(() => {
  updateWalletUI();
  if (S.c && $("#main")) renderStampBits();
});
async function walletAction() {
  try {
    if (!hasMetaMask()) return window.open("https://metamask.io/download/", "_blank", "noopener");
    if (!wallet.address) await connect();
    else if (!wallet.chainOk) await ensureChain();
  } catch (e) { toast(e?.code === 4001 ? "Request rejected in MetaMask." : "Couldn't connect to MetaMask."); }
}
$("#walletBtn").addEventListener("click", walletAction);

// ================= brief =================
function renderBrief() {
  document.title = "New campaign — Campaign Kit";
  S.brief = { ...emptyBrief(), ...(loadDraft() || {}) };
  S.brief.facts = [...(S.brief.facts || []), "", "", ""].slice(0, 3);
  S.touched = false;
  const b = S.brief;
  const seg = (field, opts, multi = false) => `<div class="seg" role="${multi ? "group" : "radiogroup"}" data-field="${field}">${opts.map((o) => {
    const v = Array.isArray(o) ? o[0] : o, label = Array.isArray(o) ? o[1] : o;
    const on = multi ? b[field].includes(v) : b[field] === v;
    return `<button type="button" data-act="seg" data-field="${field}" data-val="${esc(v)}" aria-pressed="${on}">${label}</button>`;
  }).join("")}</div>`;
  $("#main").innerHTML = `
  <div class="brief">
    <h1 class="page-title">Tell us about your launch</h1>
    <p class="page-sub">One short brief → a whole campaign: positioning, personas, a 2-week calendar with drafts, ads and a checklist.</p>
    <form class="card" id="briefForm" novalidate>
      <div class="brief-grid">
        <div class="field" data-f="name"><label for="f-name">Product name</label><input class="input" id="f-name" name="name" maxlength="48" placeholder="e.g. Brewly" value="${esc(b.name)}"><span class="hint"></span></div>
        <div class="field" data-f="what"><label for="f-what">What is it? <span class="opt">(one line)</span></label><input class="input" id="f-what" name="what" maxlength="160" placeholder="A coffee subscription with fresh beans every week" value="${esc(b.what)}"><span class="hint"></span></div>
        <div class="field full" data-f="audience"><label for="f-aud">Who is it for?</label><input class="input" id="f-aud" name="audience" maxlength="160" placeholder="busy students who want to save money" value="${esc(b.audience)}"><span class="hint"></span></div>
        <div class="field full" data-f="goal"><span class="lbl">Goal</span>${seg("goal", GOALS)}<span class="hint"></span></div>
        <div class="field full" data-f="channels"><span class="lbl">Channels <span class="opt">(pick any)</span></span>${seg("channels", CHANNELS.map((c) => [c, `${icon(c)}${CHANNEL_LABEL[c]}`]), true)}<span class="hint"></span></div>
        <div class="field" data-f="budget"><span class="lbl">Budget</span>${seg("budget", BUDGETS)}<span class="hint"></span></div>
        <div class="field" data-f="tone"><span class="lbl">Tone</span>${seg("tone", TONES)}<span class="hint"></span></div>
        <div class="field" data-f="launchDate"><label for="f-date">Launch date</label><input class="input" type="date" id="f-date" name="launchDate" min="${todayISO()}" value="${esc(b.launchDate)}"><span class="hint"></span><small style="color:var(--muted)">Your calendar runs from 7 days before to 7 days after.</small></div>
        ${AI ? `<div class="field" data-f="website"><label for="f-web">Website <span class="opt">(optional)</span></label><input class="input" id="f-web" name="website" type="url" inputmode="url" placeholder="https://…" value="${esc(b.website)}"><span class="hint"></span><small style="color:var(--muted)">We'll read it for context.</small></div>` : ""}
        <div class="field full"><span class="lbl">Facts to include <span class="opt">(optional, 1–3 — your drafts only state facts you give)</span></span>
          <div class="facts">${b.facts.map((f, i) => `<input class="input" name="fact${i}" maxlength="140" placeholder="${["e.g. 50% off the first month", "e.g. Free shipping in the UK", "e.g. Built by two nurses"][i]}" value="${esc(f)}">`).join("")}</div></div>
      </div>
      <div class="brief-foot">
        <button class="btn primary lg" type="submit" id="buildBtn">Build my campaign →</button>
        <span class="muted" id="briefHint"></span>
        <button class="btn ghost sm" type="button" data-act="clear-brief" style="margin-left:auto">Clear</button>
      </div>
    </form>
  </div>`;
  briefCheck();
}

function readBriefForm() {
  const f = $("#briefForm");
  if (!f) return S.brief;
  const b = S.brief;
  b.name = f.name.value; b.what = f.what.value; b.audience = f.audience.value; b.launchDate = f.launchDate.value; b.website = f.website ? f.website.value : "";
  b.facts = [f.fact0.value, f.fact1.value, f.fact2.value];
  saveDraft(b);
  return b;
}
function briefCheck(show = S.touched) {
  const b = readBriefForm();
  const probs = briefProblems(b);
  $$("#briefForm .field[data-f]").forEach((el) => {
    const p = probs[el.dataset.f];
    const vis = p && (show || (el.dataset.f === "launchDate" && b.launchDate) || (el.dataset.f === "website" && b.website));
    el.classList.toggle("bad", !!vis);
    $(".hint", el).textContent = vis ? p : "";
  });
  const keys = Object.keys(probs);
  const btn = $("#buildBtn");
  btn.classList.toggle("is-disabled", keys.length > 0);
  btn.setAttribute("aria-disabled", String(keys.length > 0));
  $("#briefHint").textContent = keys.length ? "Still needed: " + keys.map((k) => ({ name: "product name", what: "what it is", audience: "audience", goal: "goal", channels: "channels", budget: "budget", tone: "tone", launchDate: probs.launchDate === "Pick a launch date" ? "launch date" : "a future launch date", website: "a valid website link" }[k])).join(", ") : "Takes about 30 seconds.";
  return probs;
}

// ================= building =================
async function workerPost(path, body, timeout = 120000) {
  const r = await fetch(CONFIG.WORKER_URL.replace(/\/$/, "") + path, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || "ai_error"), { status: r.status });
  return j;
}

function cleanBrief(b) {
  return {
    name: b.name.trim(), what: b.what.trim(), audience: b.audience.trim(), goal: b.goal, channels: CHANNELS.filter((c) => b.channels.includes(c)),
    budget: b.budget, tone: b.tone, launchDate: b.launchDate, website: b.website.trim(), facts: b.facts.map((f) => f.trim()).filter(Boolean),
  };
}

async function build(useTemplate = false) {
  const brief = cleanBrief(readBriefForm());
  S.building = true;
  showBuilding(brief);
  const progress = startBuildAnim();
  let kit, missing, mode = "ai", notes = [];
  try {
    if (!CONFIG.WORKER_URL || useTemplate) {
      mode = "template";
      await new Promise((r) => setTimeout(r, reduced() ? 200 : 1600));
      ({ kit } = normalizeKit(templateKit(brief), brief));
    } else {
      let siteText = "";
      if (brief.website) {
        try { siteText = (await workerPost("/extract-url", { url: brief.website }, 12000)).text || ""; }
        catch { notes.push("We couldn't read your website, so we continued without it."); }
      }
      const req = { ...brief, siteText };
      const res = await workerPost("/kit/plan", { brief: req });
      ({ kit, missing } = normalizeKit(res.kit, brief));
      // invalid / missing parts → regenerate just that part (once), then fall back to the template for that part
      for (const part of missing) {
        try {
          const one = await workerPost("/kit/plan", { brief: req, part }, 90000);
          const fixed = normalizeKit({ ...kit, ...rawify(kit), [part]: one.kit?.[part] }, brief);
          if (!fixed.missing.includes(part)) { kit[part] = fixed.kit[part]; continue; }
        } catch { /* fall through */ }
        kit[part] = normalizeKit(templateKit(brief), brief).kit[part];
        notes.push(`The ${part} part used a template — try "Another angle" to rewrite it.`);
      }
    }
    // launch day gets a hero post on every channel
    const lacking = heroMissing(kit, brief.channels);
    if (lacking.length) {
      const t = normalizeKit(templateKit(brief), brief).kit.calendar.filter((p) => p.day === 0 && lacking.includes(p.channel));
      kit.calendar.push(...t);
    }
  } catch (e) {
    progress.stop();
    S.building = false;
    return showBuildError(e, brief);
  }
  await progress.finish();
  const c = { id: uid(), brief, kit, mode, notes, createdAt: Date.now(), updatedAt: Date.now() };
  saveCampaign(c);
  try { localStorage.removeItem(DRAFT); } catch { /* ignore */ }
  S.c = c; S.tab = "positioning"; S.building = false;
  history.replaceState(null, "", `/app?c=${c.id}`);
  const flyFrom = $$(".build-steps li").map((li) => li.getBoundingClientRect());
  shell(renderKit);
  flyCards(flyFrom);
}
// turn a normalized kit back into raw-ish shape for re-normalizing (ids are regenerated, which is fine)
const rawify = (k) => ({ checklist: { before: k.checklist.before.map((x) => x.text), launch: k.checklist.launch.map((x) => x.text), after: k.checklist.after.map((x) => x.text) } });

function showBuilding(brief) {
  scrollTo({ top: 0 });
  $("#main").innerHTML = `<div class="building">
    ${buzzSvg("buzz-big")}
    <h1 class="page-title">Building ${esc(brief.name)}…</h1>
    <p class="page-sub">${CONFIG.WORKER_URL ? "Writing your positioning, personas and every post. This takes about 30–60 seconds." : "Putting your kit together."}</p>
    <ul class="build-steps">${STEPS.map(([k, l]) => `<li data-k="${k}"><span class="st"></span>${l}</li>`).join("")}</ul>
  </div>`;
}
function startBuildAnim() {
  const lis = $$(".build-steps li");
  let i = 0, stopped = false;
  lis[0]?.classList.add("active");
  const slow = CONFIG.WORKER_URL ? 6500 : 300;
  const t = setInterval(() => {
    if (i < lis.length - 2) { lis[i].classList.replace("active", "done"); lis[i].querySelector(".st").textContent = "✓"; lis[++i].classList.add("active"); }
  }, slow);
  return {
    stop() { stopped = true; clearInterval(t); },
    async finish() {
      clearInterval(t);
      for (; i < lis.length && !stopped; i++) {
        lis[i].classList.remove("active"); lis[i].classList.add("done"); lis[i].querySelector(".st").textContent = "✓";
        if (lis[i + 1]) lis[i + 1].classList.add("active");
        await new Promise((r) => setTimeout(r, reduced() ? 0 : 260));
      }
      await new Promise((r) => setTimeout(r, reduced() ? 0 : 250));
    },
  };
}
function showBuildError(e, brief) {
  const msg = e.status === 429 ? "You've built a lot of kits today — the daily AI limit is reached. Try again tomorrow, or use a template kit now."
    : e.name === "TimeoutError" ? "The AI took too long to answer."
      : "The AI couldn't finish your kit.";
  $("#main").innerHTML = `<div class="building">
    ${buzzSvg("buzz-big")}
    <h1 class="page-title">Hmm, that didn't work</h1>
    <p class="page-sub">${esc(msg)}</p>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
      ${e.status === 429 ? "" : `<button class="btn primary lg" data-act="retry">Try again</button>`}
      <button class="btn white lg" data-act="use-template">Use a template kit instead</button>
      <button class="btn ghost lg" data-act="back-brief">Edit brief</button>
    </div></div>`;
  S.brief = { ...emptyBrief(), ...brief, facts: [...brief.facts, "", "", ""].slice(0, 3) };
  saveDraft(S.brief);
}
function flyCards(rects) {
  if (reduced() || !rects.length) return;
  const tabs = $$(".tabs button");
  STEPS.forEach(([k, label], i) => {
    const from = rects[i], to = tabs.find((t) => t.dataset.tab === k)?.getBoundingClientRect();
    if (!from || !to) return;
    const el = document.createElement("div");
    el.className = "fly-card";
    el.textContent = "✓ " + label;
    el.style.left = from.left + "px"; el.style.top = from.top + "px"; el.style.width = from.width + "px"; el.style.height = from.height + "px";
    document.body.appendChild(el);
    el.animate([
      { transform: "none", opacity: 1 },
      { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})`, opacity: .2 },
    ], { duration: 650, delay: i * 90, easing: "cubic-bezier(.5,0,.2,1)", fill: "forwards" }).onfinish = () => el.remove();
  });
  $$(".tabs button").forEach((t, i) => t.animate([{ transform: "scale(.6)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: 450, delay: 500 + i * 90, easing: "cubic-bezier(.34,1.56,.64,1)", fill: "backwards" }));
  $$("#tabPanel > *").forEach((el, i) => el.animate([{ transform: "translateY(30px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 500, delay: 650 + i * 70, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }));
}

// ================= kit view =================
const stamped = (c) => c.chain && c.chain.network === CONFIG.NETWORK && c.chain.contract?.toLowerCase() === CONTRACT.toLowerCase();

function renderKit() {
  const c = S.c;
  document.title = `${c.brief.name} — Campaign Kit`;
  const b = c.brief;
  const posts = c.kit.calendar.length, ms = milestoneList(c.kit.checklist).length;
  $("#main").innerHTML = `
    <div id="banners"></div>
    <div class="kit-head">
      <div>
        <h1 class="kit-title" contenteditable="plaintext-only" spellcheck="false" data-path="brief.name" data-max="48">${esc(b.name)}</h1>
        <div class="kit-meta">
          ${c.mode === "example" ? `<span class="tag ex">Example</span>` : ""}
          <span class="tag">🎯 ${esc(b.goal)}</span>
          <button class="tag" data-act="change-date" style="border:0" title="Change launch date">🚀 ${esc(fmtDay(dayDate(b.launchDate, 0)))} ✎</button>
          <span class="tag">🗣 ${esc(b.tone)}</span>
          <span class="tag">${b.channels.map((ch) => esc(ch)).join(" · ")}</span>
          <span id="stampTag"></span>
        </div>
      </div>
      <div class="kit-actions desk" id="kitActions">
        <button class="btn white" data-act="export">Export ⌄</button>
        <span id="stampBtnWrap"></span>
      </div>
    </div>
    <div class="tabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" data-act="tab" data-tab="${k}" aria-selected="${S.tab === k}">${l}${k === "calendar" ? `<span class="count">${posts}</span>` : k === "checklist" ? `<span class="count">${ms}</span>` : ""}</button>`).join("")}</div>
    <div id="tabPanel" role="tabpanel"></div>
    <div class="m-bar"><button class="btn white" data-act="export">Export</button><span id="stampBtnM" style="flex:1;display:flex"></span></div>`;
  document.body.classList.add("has-bar");
  renderTab();
  renderBanners();
  renderStampBits();
  syncChain();
}

function renderBanners() {
  const c = S.c, el = $("#banners");
  if (!el) return;
  const out = [];
  if (c.mode === "example") out.push(`<div class="notice info">✨ <span>This is an <b>example kit</b> for a made-up product. Edit anything — we'll save a copy to My campaigns.</span><a class="btn primary sm" href="/app?new=1" data-link>Start your own</a></div>`);
  (c.notes || []).forEach((n) => out.push(`<div class="notice">ℹ️ <span>${esc(n)}</span></div>`));
  if (b_past(c)) out.push(`<div class="notice">📅 <span>The launch date has passed. Duplicating as a template? <button class="btn white sm" data-act="change-date">Pick a new date</button></span></div>`);
  if (stamped(c) && S.hash && S.onchain && S.hash !== S.onchain.planHash) {
    const owner = wallet.address && S.onchain.owner.toLowerCase() === wallet.address.toLowerCase();
    out.push(`<div class="notice">✏️ <span><b>Edited since stamp.</b> Your plan changed after it was stamped on BOT Chain.</span>${owner || !wallet.address ? `<button class="btn dark sm" data-act="update-hash" ${S.busy.hash ? "disabled" : ""}>${S.busy.hash ? "Updating…" : "Update fingerprint"}</button>` : ""}</div>`);
  }
  el.innerHTML = out.join("");
}
const b_past = (c) => c.mode !== "example" && c.brief.launchDate && isoOf(dayDate(c.brief.launchDate, 7)) < todayISO();

function renderStampBits() {
  const c = S.c;
  if (!c || !$("#stampBtnWrap")) return;
  let btn;
  if (stamped(c)) {
    btn = `<a class="btn primary" href="/app/plan/${c.chain.id}" data-link>Public page ↗</a>`;
    $("#stampTag").innerHTML = `<span class="tag ok">✓ Stamped #${c.chain.id}</span>`;
  } else {
    $("#stampTag").innerHTML = c.mode === "example" ? "" : `<span class="tag">Not stamped yet</span>`;
    if (!IS_DEPLOYED) btn = `<button class="btn primary" disabled title="The contract isn't deployed yet">Stamp plan on BOT Chain</button>`;
    else if (!hasMetaMask()) btn = `<a class="btn primary" href="https://metamask.io/download/" target="_blank" rel="noopener">Install MetaMask</a>`;
    else btn = `<button class="btn primary" data-act="stamp" ${S.busy.stamp ? "disabled" : ""}>${S.busy.stamp ? "Stamping…" : wallet.address && !wallet.chainOk ? "Switch to BOT Chain" : "Stamp plan on BOT Chain"}</button>`;
  }
  $("#stampBtnWrap").innerHTML = btn;
  $("#stampBtnM").innerHTML = btn.replace('class="btn primary"', 'class="btn primary" style="flex:1"').replace("Stamp plan on BOT Chain", "Stamp").replace("Public page ↗", "Public page");
  renderBanners();
}

async function currentHash() {
  try { S.hash = await keccakText(canonicalPlan(S.c)); } catch { S.hash = null; }
  return S.hash;
}
async function syncChain() {
  S.onchain = null;
  const c = S.c;
  if (!stamped(c)) return;
  await currentHash();
  try {
    const rc = await readContract();
    const [p, pr] = await Promise.all([rc.getPlan(c.chain.id), rc.progress(c.chain.id)]);
    if (S.c !== c) return;
    S.onchain = { owner: p.owner, planHash: p.planHash, done: Number(pr.done), total: Number(pr.total), mask: Number(pr.mask) };
    c.chain.mask = S.onchain.mask;
    saveCampaign(c);
    renderBanners();
    if (S.tab === "checklist") renderTab();
  } catch { /* offline: use cached mask */ }
}

// ---------- tabs ----------
function renderTab() {
  const p = $("#tabPanel");
  if (!p) return;
  sortables.forEach((s) => s.destroy());
  sortables = [];
  $$(".tabs button").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === S.tab)));
  p.innerHTML = { positioning: tabPositioning, personas: tabPersonas, calendar: tabCalendar, ads: tabAds, checklist: tabChecklist }[S.tab]();
  if (S.tab === "calendar") initSortable();
}
const ed = (path, text, tag = "span", cls = "", max = 0) => `<${tag} class="${cls}" contenteditable="plaintext-only" spellcheck="true" data-path="${path}"${max ? ` data-max="${max}"` : ""}>${esc(text)}</${tag}>`;
const aiChips = (path, extra = "") => `<div class="card-ai">${TOOLS.map(([a, l]) => `<button class="chip-btn ${extra}" data-act="ai-field" data-path="${path}" data-ai="${a}">${l}</button>`).join("")}</div>`;

function tabPositioning() {
  const p = S.c.kit.positioning;
  return `
  <div class="pos-grid">
    <div class="pos-hero">
      <small>Your one-liner</small>
      ${ed("kit.positioning.oneLiner", p.oneLiner, "div", "one")}
      ${aiChips("kit.positioning.oneLiner", "dark")}
      <small style="margin-top:18px">Elevator pitch</small>
      ${ed("kit.positioning.pitch", p.pitch, "div", "pitch")}
      ${aiChips("kit.positioning.pitch", "dark")}
    </div>
    <div class="card"><span class="k-label">3 key messages</span><ol class="k-list">${p.messages.map((m, i) => `<li><span class="n">${i + 1}</span>${ed(`kit.positioning.messages.${i}`, m)}</li>`).join("")}</ol></div>
    <div class="card"><span class="k-label">Proof to gather</span><ul class="k-list">${p.proofToGather.map((m, i) => `<li><span class="n">✓</span>${ed(`kit.positioning.proofToGather.${i}`, m)}</li>`).join("")}</ul>
      <p style="color:var(--muted);font-size:13px;margin:12px 0 0">Swap every <span class="warnmark">⚠ Add proof</span> in your drafts for one of these.</p></div>
    <div class="card"><span class="k-label">Words to use</span><div class="words">${p.useWords.map((w, i) => ed(`kit.positioning.useWords.${i}`, w)).join("")}</div></div>
    <div class="card"><span class="k-label">Words to avoid</span><div class="words avoid">${p.avoidWords.map((w, i) => ed(`kit.positioning.avoidWords.${i}`, w)).join("")}</div></div>
  </div>`;
}

function tabPersonas() {
  const list = (i, key, arr) => `<ul>${arr.map((x, j) => `<li>${ed(`kit.personas.${i}.${key}.${j}`, x)}</li>`).join("")}</ul>`;
  return `<div class="persona-grid">${S.c.kit.personas.map((p, i) => `
    <article class="persona">
      <div class="p-top"><div class="p-emoji">${esc(p.emoji)}</div><div>${ed(`kit.personas.${i}.name`, p.name, "div", "p-name")}</div></div>
      ${ed(`kit.personas.${i}.who`, p.who, "div")}
      <div class="p-sec"><b>Pains</b>${list(i, "pains", p.pains)}</div>
      <div class="p-sec"><b>What they want</b>${list(i, "wants", p.wants)}</div>
      <div class="p-sec"><b>Where they hang out</b>${list(i, "hangouts", p.hangouts)}</div>
      <div class="p-msg"><span class="k-label" style="margin-bottom:4px">Best message</span>${ed(`kit.personas.${i}.bestMessage`, p.bestMessage)}</div>
    </article>`).join("")}</div>`;
}

function postCard(p) {
  const lim = LIMITS[p.channel], n = postLen(p);
  return `<div class="post ch-${p.channel} ${S.drawer === p.id ? "sel" : ""}" data-id="${p.id}" data-act="open-post" tabindex="0" role="button" aria-label="${esc(p.channel)} post at ${p.time}: ${esc(p.hook)}">
    <div class="post-top">${icon(p.channel)}<span>${esc(p.time)}</span>${n > lim ? `<span class="over">${n}/${lim}</span>` : ""}</div>
    <div class="post-hook">${esc(p.hook)}</div>
    <div class="post-text">${esc(previewText(p))}</div>
    ${p.hashtags.length ? `<div class="post-tags">${esc(p.hashtags.join(" "))}</div>` : ""}
  </div>`;
}
// card preview: skip the first line when it just repeats the hook (and the "Subject:" line for emails)
function previewText(p) {
  const lines = p.text.split("\n").filter((l) => l.trim());
  const first = (lines[0] || "").replace(/^Subject:\s*/i, "").replace(/^\[[^\]]+\]\s*/, "").trim();
  if (lines.length > 1 && (first === p.hook.trim() || /^Subject:/i.test(lines[0]))) lines.shift();
  return lines.join(" ");
}
function dayCol(d) {
  const L = S.c.brief.launchDate, date = dayDate(L, d);
  const posts = S.c.kit.calendar.filter((p) => p.day === d).sort((a, b) => a.time.localeCompare(b.time));
  return `<div class="day ${d === 0 ? "launch" : ""} ${isoOf(date) < todayISO() ? "past" : ""}" data-day="${d}">
    <div class="day-head"><b>${d === 0 ? "🚀 Launch day" : dayLabel(d)}</b><small>${fmtDay(date)}</small></div>
    <div class="day-list" data-day="${d}">${posts.map(postCard).join("")}</div>
    <button class="day-add" data-act="add-post" data-day="${d}">+ Add post</button>
  </div>`;
}
function tabCalendar() {
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const counts = CHANNELS.filter((ch) => S.c.brief.channels.includes(ch) || S.c.kit.calendar.some((p) => p.channel === ch))
    .map((ch) => `<span class="tag">${icon(ch).replace("<svg", '<svg style="width:14px;height:14px"')} ${S.c.kit.calendar.filter((p) => p.channel === ch).length}</span>`).join("");
  return `<div class="cal-wrap">
    <div class="cal-legend">${counts}<span>${isPhone() ? "Tap a post to edit or move it." : "Drag posts between days · click one to edit."}</span></div>
    <div class="cal-week"><h4>Countdown — the 7 days before launch</h4><div class="cal-grid">${range(-7, -1).map(dayCol).join("")}</div></div>
    <div class="cal-week cal-launch">${dayCol(0)}</div>
    <div class="cal-week"><h4>Launch week — the 7 days after</h4><div class="cal-grid">${range(1, 7).map(dayCol).join("")}</div></div>
  </div>`;
}
function initSortable() {
  if (!window.Sortable || isPhone()) return;
  $$("#tabPanel .day-list").forEach((el) => {
    sortables.push(window.Sortable.create(el, {
      group: "posts", animation: reduced() ? 0 : 260, easing: "cubic-bezier(.34,1.56,.64,1)", ghostClass: "sortable-ghost", chosenClass: "sortable-chosen", dragClass: "sortable-drag", forceFallback: true, fallbackOnBody: true,
      onMove: (evt) => { $$(".day.drop-hover").forEach((d) => d.classList.remove("drop-hover")); evt.to.closest(".day")?.classList.add("drop-hover"); },
      onEnd: (evt) => {
        $$(".day.drop-hover").forEach((d) => d.classList.remove("drop-hover"));
        const p = S.c.kit.calendar.find((x) => x.id === evt.item.dataset.id);
        const day = Number(evt.to.dataset.day);
        if (p && p.day !== day) { p.day = day; commit(); toast(`Moved to ${dayLabel(day)}`); }
        renderTab();
      },
    }));
  });
}

function tabAds() {
  const k = S.c.kit;
  const field = (i, key, cls) => {
    const v = k.ads[i][key], lim = AD_LIMITS[key], n = len(v);
    return `<div class="ad-field"><small class="${n > lim ? "over" : ""}" data-counter="kit.ads.${i}.${key}" data-lim="${lim}"><span>${key === "cta" ? "Call to action" : key}</span><span>${n}/${lim}</span></small>${ed(`kit.ads.${i}.${key}`, v, "div", cls)}</div>`;
  };
  return `<div class="ads-grid">${k.ads.map((a, i) => `
    <article class="ad">
      <span class="ad-angle">${esc(a.angle)}</span>
      ${field(i, "headline", "ad-h")}
      ${field(i, "description", "")}
      <div class="ad-field"><small data-counter="kit.ads.${i}.cta" data-lim="${AD_LIMITS.cta}" class="${len(a.cta) > AD_LIMITS.cta ? "over" : ""}"><span>Call to action</span><span>${len(a.cta)}/${AD_LIMITS.cta}</span></small><span class="ad-cta">${ed(`kit.ads.${i}.cta`, a.cta)}</span></div>
      <div class="card-ai">${TOOLS.map(([x, l]) => `<button class="chip-btn" data-act="ai-ad" data-i="${i}" data-ai="${x}">${l}</button>`).join("")}</div>
    </article>`).join("")}</div>
    <div class="card tags-card"><span class="k-label">Hashtags</span>
      <div style="display:grid;gap:12px"><div><b style="font-size:13px">Core</b><div class="words" style="margin-top:6px">${k.hashtags.core.map((t, i) => ed(`kit.hashtags.core.${i}`, t)).join("")}</div></div>
      <div><b style="font-size:13px">Niche</b><div class="words" style="margin-top:6px">${k.hashtags.niche.map((t, i) => ed(`kit.hashtags.niche.${i}`, t)).join("")}</div></div></div>
      <div style="margin-top:12px"><button class="chip-btn" data-act="copy-tags">📋 Copy all hashtags</button></div>
    </div>`;
}

function tabChecklist() {
  const c = S.c, cl = c.kit.checklist, isSt = stamped(c);
  const mask = isSt ? (S.onchain?.mask ?? c.chain.mask ?? 0) : 0;
  const all = milestoneList(cl), total = all.length;
  const done = isSt ? all.filter((_, i) => mask & (1 << i)).length : 0;
  const owner = isSt && wallet.address && c.chain.owner?.toLowerCase() === wallet.address.toLowerCase();
  let idx = 0;
  const col = (g, title) => `<div class="check-col"><h3>${title}<small>${cl[g].length}</small></h3>
    ${cl[g].map((m) => {
      const i = idx++, d = !!(mask & (1 << i));
      return `<div class="ms-item ${d ? "done" : ""}"><span class="num">${i + 1}</span>${ed(`kit.checklist.${g}.${cl[g].indexOf(m)}.text`, m.text, "span", "txt")}
        ${isSt ? `<button class="tick-btn ${d ? "done" : ""} ${S.busy["t" + i] ? "pending" : ""}" data-act="tick" data-i="${i}" ${d ? "disabled" : ""} title="${owner || d ? "" : "Connect the wallet that stamped this plan"}">${d ? "✓ Done" : S.busy["t" + i] ? "…" : "✓ Done"}</button>` : `<button class="ms-del" data-act="ms-del" data-g="${g}" data-id="${m.id}" aria-label="Delete">×</button>`}
      </div>`;
    }).join("")}
    ${isSt ? "" : `<div class="add-row"><button class="chip-btn" data-act="ms-add" data-g="${g}" ${total >= MAX_MILESTONES ? "disabled" : ""}>+ Add</button></div>`}
  </div>`;
  return `
    ${isSt ? `<div class="progress-card"><b>${done} of ${total} milestones done</b><div class="bar"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div><a class="btn white sm" href="/app/plan/${c.chain.id}" data-link>Public page ↗</a><button class="btn ghost sm" data-act="copy-link">Copy link</button></div>` : ""}
    <div class="check-grid">${col("before", "Before launch")}${col("launch", "Launch day")}${col("after", "After launch")}</div>
    ${isSt ? `<p style="color:var(--muted);font-size:13px">Milestones are fixed once a plan is stamped. Ticking one sends a small transaction — only "milestone #n is done" goes on-chain, never the text.</p>` : `
    <div class="stamp-card">
      <b style="font-size:20px">Stamp this plan on BOT Chain</b>
      <p>Saves a fingerprint of your plan with its title, goal, launch date and ${total} milestones. Then tick milestones as you go — anyone with the link sees your progress, never your drafts.</p>
      <div class="row">${IS_DEPLOYED ? (hasMetaMask() ? `<button class="btn white" data-act="stamp" ${S.busy.stamp ? "disabled" : ""}>${S.busy.stamp ? "Stamping…" : "Stamp plan on BOT Chain"}</button>` : `<a class="btn white" href="https://metamask.io/download/" target="_blank" rel="noopener">Install MetaMask</a>`) : `<span class="tag warn">Contract not deployed yet</span>`}<small style="opacity:.75">Network: ${esc(NET.chainName)} · chain ${NET.chainId}</small></div>
    </div>`}`;
}

// ================= editing =================
function setPath(obj, path, val) {
  const ks = path.split(".");
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) o = o[/^\d+$/.test(ks[i]) ? +ks[i] : ks[i]];
  const last = ks.at(-1);
  o[/^\d+$/.test(last) ? +last : last] = val;
}
function getPath(obj, path) { return path.split(".").reduce((o, k) => o?.[/^\d+$/.test(k) ? +k : k], obj); }

let saveT;
function commit({ now = false } = {}) {
  const c = S.c;
  if (c.mode === "example" && !c.id) {
    c.id = uid(); c.mode = "template"; c.example = c.example || true; c.notes = [];
    saveCampaign(c);
    history.replaceState(null, "", `/app?c=${c.id}`);
    toast("Saved a copy to My campaigns ✓");
    renderSidebar();
    renderBanners();
    $$(".tag.ex").forEach((t) => t.remove());
    return;
  }
  clearTimeout(saveT);
  const run = () => { saveCampaign(c); if (stamped(c)) currentHash().then(renderBanners); };
  now ? run() : (saveT = setTimeout(run, 400));
}

function onEditInput(el) {
  let v = el.innerText.replace(/\n{3,}/g, "\n\n");
  const max = +el.dataset.max;
  if (max && len(v) > max) { v = [...v].slice(0, max).join(""); el.innerText = v; }
  const path = el.dataset.path;
  if (path === "brief.name") { S.c.brief.name = v.trim() || "Untitled"; document.title = `${S.c.brief.name} — Campaign Kit`; }
  else setPath(S.c, path, v.trim());
  const ctr = $(`[data-counter="${path}"]`);
  if (ctr) { const n = len(v.trim()), lim = +ctr.dataset.lim; ctr.lastElementChild.textContent = `${n}/${lim}`; ctr.classList.toggle("over", n > lim); }
  commit();
}

// ---------- AI rewrite ----------
async function rewrite({ text, action, channel = "", kind = "social post", limit = 0, tone, lang }) {
  if (!CONFIG.WORKER_URL) {
    if (action === "shorter") return localShorter(text, limit);
    throw Object.assign(new Error("no_ai"), { local: true });
  }
  const j = await workerPost("/kit/rewrite", { text, action, tone: tone || S.c.brief.tone, lang, channel, kind, product: S.c.brief.name, limit }, 45000);
  return j.text;
}
function localShorter(text, limit) {
  const target = limit ? Math.min(limit, Math.ceil(len(text) * .6)) : Math.ceil(len(text) * .6);
  // keep a short first line (the hook) on its own line and shorten the rest
  const m = text.match(/^([^\n]{1,120})\n\n([\s\S]{40,})$/);
  if (m) return m[1] + "\n\n" + localShorter(m[2], Math.max(30, target - len(m[1]) - 2));
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  let out = "";
  for (const s of sentences) { if (len(out + " " + s) > target && out) break; out = out ? out + " " + s : s; }
  // whole sentences came out far too short (or too long) → cut the full text at a word boundary instead
  if (len(out) < target * .5 || len(out) > target) out = [...text.replace(/\s*\n+\s*/g, " ")].slice(0, target - 1).join("").replace(/\s+\S*$/, "") + "…";
  return out;
}
const altCount = new Map();
const nextAlt = (key) => { const n = altCount.get(key) || 0; altCount.set(key, n + 1); return n; };
function aiErr(e) {
  if (e?.local) return "That rewrite isn't available yet — try Shorter or Another version.";
  if (e?.status === 429) return "Daily AI rewrite limit reached — try again tomorrow.";
  return "The AI couldn't rewrite that. Try again.";
}

async function aiField(btn) {
  const path = btn.dataset.path, old = getPath(S.c, path);
  btn.classList.add("busy");
  try {
    const kind = path.endsWith("oneLiner") ? "one-liner" : path.endsWith("pitch") ? "pitch" : "message";
    const v = btn.dataset.ai === "alt" ? altText(S.c.brief, path.endsWith("pitch") ? "pitch" : "oneLiner", old, nextAlt(path)) : await rewrite({ text: old, action: btn.dataset.ai, kind, limit: kind === "one-liner" ? 200 : 600 });
    setPath(S.c, path, v.trim());
    commit();
    renderTab();
    undoToast(() => { setPath(S.c, path, old); commit(); renderTab(); });
  } catch (e) { toast(aiErr(e)); }
  btn.classList.remove("busy");
}
async function aiAd(btn) {
  const i = +btn.dataset.i, ad = S.c.kit.ads[i], old = { ...ad };
  btn.classList.add("busy");
  try {
    const [h, d] = btn.dataset.ai === "alt" ? (({ headline, description }) => [headline, description])(altText(S.c.brief, "ad:" + ad.angle, ad, nextAlt("ad" + i))) : await Promise.all([
      rewrite({ text: ad.headline, action: btn.dataset.ai, kind: "ad headline", limit: AD_LIMITS.headline }),
      rewrite({ text: ad.description, action: btn.dataset.ai, kind: "ad description", limit: AD_LIMITS.description }),
    ]);
    ad.headline = h.trim(); ad.description = d.trim();
    commit(); renderTab();
    undoToast(() => { Object.assign(S.c.kit.ads[i], old); commit(); renderTab(); });
  } catch (e) { toast(aiErr(e)); }
  btn.classList.remove("busy");
}
let undoFn = null;
function undoToast(fn) {
  undoFn = fn;
  const t = $("#toast");
  toast("Updated — press ⌘Z / Ctrl+Z to undo", 4000);
  setTimeout(() => { if (undoFn === fn) undoFn = null; }, 8000);
  return t;
}
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "z" && undoFn && !e.target.closest("[contenteditable], input, textarea")) { e.preventDefault(); const f = undoFn; undoFn = null; f(); toast("Undone"); }
});

// ================= drawer (post editor) =================
let drawerEl, scrimEl;
function ensureDrawer() {
  if (drawerEl) return;
  scrimEl = document.createElement("div");
  scrimEl.className = "drawer-scrim";
  drawerEl = document.createElement("aside");
  drawerEl.className = "drawer";
  drawerEl.setAttribute("role", "dialog");
  drawerEl.setAttribute("aria-label", "Edit post");
  document.body.append(scrimEl, drawerEl);
  scrimEl.addEventListener("click", () => closeDrawer());
  drawerEl.addEventListener("click", onDrawerClick);
  drawerEl.addEventListener("input", onDrawerInput);
  drawerEl.addEventListener("change", onDrawerChange);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && drawerEl.classList.contains("open")) closeDrawer(); });
}
const curPost = () => S.c?.kit.calendar.find((p) => p.id === S.drawer);
function openDrawer(id) {
  ensureDrawer();
  S.drawer = id;
  $$(".post.sel").forEach((p) => p.classList.remove("sel"));
  $(`.post[data-id="${id}"]`)?.classList.add("sel");
  fillDrawer();
  drawerEl.classList.add("open");
  scrimEl.classList.add("open");
  setTimeout(() => $("#dText", drawerEl)?.focus({ preventScroll: true }), 300);
}
function closeDrawer(silent = false) {
  if (!drawerEl) return;
  drawerEl.classList.remove("open");
  scrimEl.classList.remove("open");
  if (!silent && S.drawer) $(`.post[data-id="${S.drawer}"]`)?.classList.remove("sel");
  S.drawer = null;
}
function fillDrawer(undo) {
  const p = curPost();
  if (!p) return closeDrawer();
  const L = S.c.brief.launchDate;
  const days = Array.from({ length: 15 }, (_, i) => i - 7);
  const lim = LIMITS[p.channel], n = postLen(p);
  drawerEl.innerHTML = `
    <div class="drawer-head">${icon(p.channel).replace("<svg", '<svg style="width:22px;height:22px"')}<h3>${esc(CHANNEL_LABEL[p.channel])} post</h3><button class="icon-btn" data-d="close" aria-label="Close" style="box-shadow:none;background:var(--page)">×</button></div>
    <div class="drawer-body">
      ${undo ? `<div class="undo-bar">✨ Updated <button class="chip-btn" data-d="undo">Undo</button></div>` : ""}
      <div class="row2">
        <div class="field"><label for="dChannel">Channel</label><select class="input select" id="dChannel">${CHANNELS.map((c) => `<option value="${c}" ${c === p.channel ? "selected" : ""}>${CHANNEL_LABEL[c]}</option>`).join("")}</select></div>
        <div class="field"><label for="dTime">Time</label><input class="input" type="time" id="dTime" value="${esc(p.time)}"></div>
      </div>
      <div class="field"><label for="dDay">Move to day ⌄</label><select class="input select" id="dDay">${days.map((d) => `<option value="${d}" ${d === p.day ? "selected" : ""}>${dayLabel(d)} · ${fmtDay(dayDate(L, d))}</option>`).join("")}</select></div>
      <div class="field"><label for="dHook">Hook <span class="opt">(first line)</span></label><input class="input" id="dHook" maxlength="160" value="${esc(p.hook)}"></div>
      <div class="field"><label for="dText">Draft</label><textarea class="input" id="dText" rows="9">${esc(p.text)}</textarea>
        <div class="counter ${n > lim ? "over" : ""}" id="dCount"><span>${n > lim ? `Over the ${p.channel} limit — try Shorter` : p.text.includes("⚠") ? "⚠ Has a claim that needs proof" : "Ready to post"}</span><span>${n.toLocaleString()} / ${lim.toLocaleString()}</span></div></div>
      <div class="ai-row">
        ${TOOLS.map(([a, l]) => `<button class="chip-btn" data-d="ai" data-ai="${a}" ${a === "shorter" && n > lim ? 'style="background:var(--a-red);color:#fff"' : ""}>${l}</button>`).join("")}
        ${AI ? `<select class="chip-btn" id="dTone" aria-label="Change tone"><option value="">Change tone ⌄</option>${TONES.map((t) => `<option>${t}</option>`).join("")}</select>
        <select class="chip-btn" id="dLang" aria-label="Translate"><option value="">Translate ⌄</option>${LANGS.map((t) => `<option>${t}</option>`).join("")}</select>` : ""}
      </div>
      <div class="field"><label for="dTags">Hashtags</label><input class="input" id="dTags" value="${esc(p.hashtags.join(" "))}" placeholder="#launch #coffee" ${p.channel === "Email" ? "disabled" : ""}></div>
      <div class="field"><label for="dImg">Image idea</label><input class="input" id="dImg" maxlength="240" value="${esc(p.imageIdea)}"></div>
    </div>
    <div class="drawer-foot">
      <button class="chip-btn" data-d="copy">📋 Copy</button>
      <button class="chip-btn" data-d="dup">⧉ Duplicate</button>
      <button class="chip-btn danger" data-d="del">🗑 Delete</button>
      <button class="btn primary sm" data-d="close" style="margin-left:auto">Done</button>
    </div>`;
}
function refreshPostCard(p) {
  const old = $(`.post[data-id="${p.id}"]`);
  if (!old) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = postCard(p).trim();
  old.replaceWith(tmp.firstElementChild);
}
function updateCounter() {
  const p = curPost(), lim = LIMITS[p.channel], n = postLen(p);
  const c = $("#dCount", drawerEl);
  c.classList.toggle("over", n > lim);
  c.innerHTML = `<span>${n > lim ? `Over the ${p.channel} limit — try Shorter` : p.text.includes("⚠") ? "⚠ Has a claim that needs proof" : "Ready to post"}</span><span>${n.toLocaleString()} / ${lim.toLocaleString()}</span>`;
  const sb = $('[data-ai="shorter"]', drawerEl);
  sb.style.background = n > lim ? "var(--a-red)" : ""; sb.style.color = n > lim ? "#fff" : "";
}
function onDrawerInput(e) {
  const p = curPost();
  if (!p) return;
  const id = e.target.id;
  if (id === "dText") p.text = e.target.value;
  else if (id === "dHook") p.hook = e.target.value;
  else if (id === "dTags") p.hashtags = e.target.value.split(/[\s,]+/).filter(Boolean).map((t) => (t.startsWith("#") ? t : "#" + t)).slice(0, 8);
  else if (id === "dImg") p.imageIdea = e.target.value;
  else return;
  updateCounter();
  refreshPostCard(p);
  $(`.post[data-id="${p.id}"]`)?.classList.add("sel");
  commit();
}
async function onDrawerChange(e) {
  const p = curPost();
  if (!p) return;
  const id = e.target.id;
  if (id === "dChannel") { p.channel = e.target.value; if (p.channel === "Email") p.hashtags = []; fillDrawer(); }
  else if (id === "dTime") { if (/^\d{2}:\d{2}$/.test(e.target.value)) p.time = e.target.value; }
  else if (id === "dDay") { p.day = +e.target.value; toast(`Moved to ${dayLabel(p.day)}`); }
  else if (id === "dTone" && e.target.value) return drawerAI("tone", { tone: e.target.value });
  else if (id === "dLang" && e.target.value) return drawerAI("translate", { lang: e.target.value });
  else return;
  commit();
  if (S.tab === "calendar") { renderTab(); $(`.post[data-id="${p.id}"]`)?.classList.add("sel"); }
}
let lastText = null;
async function drawerAI(action, extra = {}) {
  const p = curPost();
  const btn = $(`[data-ai="${action}"]`, drawerEl) || $(action === "tone" ? "#dTone" : "#dLang", drawerEl);
  btn?.classList.add("busy");
  const before = { text: p.text, hook: p.hook };
  try {
    const kind = p.channel === "Email" ? "email" : p.channel === "TikTok" ? "video script" : "social post";
    const lim = LIMITS[p.channel] - (p.hashtags.length ? 1 + len(p.hashtags.join(" ")) : 0);
    if (action === "alt") {
      const a = altPost(S.c.brief, p, nextAlt(p.id));
      p.text = a.text; p.hook = a.hook;
      if (!p.imageIdea || /^A (simple graphic|bright photo)/.test(p.imageIdea)) p.imageIdea = a.imageIdea;
    } else {
    const v = await rewrite({ text: p.text, action, channel: p.channel, kind, limit: lim, ...extra });
    p.text = v.trim();
    p.hook = p.text.replace(/^Subject:\s*/i, "").split("\n").find((l) => l.trim())?.slice(0, 120) || p.hook;
    }
    lastText = before;
    commit();
    fillDrawer(true);
    refreshPostCard(p);
    $(`.post[data-id="${p.id}"]`)?.classList.add("sel");
  } catch (e) { toast(aiErr(e)); btn?.classList.remove("busy"); if (btn?.tagName === "SELECT") btn.value = ""; }
}
function onDrawerClick(e) {
  const b = e.target.closest("[data-d]");
  if (!b) return;
  const p = curPost(), act = b.dataset.d;
  if (act === "close") return closeDrawer();
  if (!p) return;
  if (act === "ai") return drawerAI(b.dataset.ai);
  if (act === "undo" && lastText) { Object.assign(p, lastText); lastText = null; commit(); fillDrawer(); refreshPostCard(p); return; }
  if (act === "copy") return copyText(p.text + (p.hashtags.length ? "\n\n" + p.hashtags.join(" ") : ""), "Post copied");
  if (act === "dup") {
    const copy = { ...p, id: uid(), hashtags: [...p.hashtags] };
    S.c.kit.calendar.push(copy);
    commit(); renderTab(); openDrawer(copy.id); toast("Duplicated");
    return;
  }
  if (act === "del") {
    S.c.kit.calendar = S.c.kit.calendar.filter((x) => x.id !== p.id);
    closeDrawer(); commit(); renderTab(); updateTabCounts(); toast("Post deleted");
  }
}
function addPost(day) {
  const ch = S.c.brief.channels[0] || "X";
  const p = cleanPost({ day, channel: ch, time: DEFAULT_TIME[ch], hook: "New post", text: "Write your post here…", hashtags: [], imageIdea: "" }, CHANNELS);
  S.c.kit.calendar.push(p);
  commit(); renderTab(); updateTabCounts(); openDrawer(p.id);
  setTimeout(() => { const t = $("#dText", drawerEl); t?.select(); }, 320);
}
function updateTabCounts() {
  const cnt = (k) => $(`.tabs [data-tab="${k}"] .count`);
  if (cnt("calendar")) cnt("calendar").textContent = S.c.kit.calendar.length;
  if (cnt("checklist")) cnt("checklist").textContent = milestoneList(S.c.kit.checklist).length;
}

// ================= exports =================
function exportMenu(btn) {
  $(".menu")?.remove();
  const m = document.createElement("div");
  m.className = "menu";
  m.innerHTML = `<button data-act="export-pdf">📄 Download PDF</button><button data-act="export-csv">📊 Download CSV</button><button data-act="export-ics">📅 Add to calendar (.ics)</button><button data-act="export-copy">📋 Copy all posts</button>`;
  if (isMobile()) {
    modal(`<h3>Export</h3><div style="display:grid;gap:8px;margin-top:10px" class="m-export">${m.innerHTML.replace(/<button/g, '<button class="btn white"')}</div>`);
    return;
  }
  btn.parentElement.appendChild(m);
  setTimeout(() => document.addEventListener("click", function off(ev) { if (!ev.target.closest(".menu")) { m.remove(); document.removeEventListener("click", off); } }), 0);
}
const fileBase = () => (S.c.brief.name || "campaign").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "campaign";
async function copyText(text, msg = "Copied") {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
  }
  toast(msg + " ✓");
}
async function exportPDF() {
  toast("Making your PDF…", 6000);
  try {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js");
    const el = reportEl();
    await window.html2pdf().set({
      margin: [10, 10, 12, 10], filename: fileBase() + "-campaign.pdf",
      image: { type: "jpeg", quality: .95 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }, pagebreak: { mode: ["css", "legacy"], avoid: [".r-post", ".r-box"] },
    }).from(el).save();
    toast("PDF downloaded ✓");
  } catch { toast("Couldn't make the PDF — check your connection and try again."); }
}
function reportEl() {
  const c = S.c, k = c.kit, b = c.brief;
  const el = document.createElement("div");
  el.className = "report";
  let lastDay = null;
  const posts = sortedPosts(k).map((p) => {
    let h = "";
    if (p.day !== lastDay) { h += `<div class="r-day">${dayLabel(p.day)} · ${esc(fmtDay(dayDate(b.launchDate, p.day)))}</div>`; lastDay = p.day; }
    return h + `<div class="r-post"><small>${esc(p.channel)} · ${esc(p.time)}</small>${esc(p.text)}${p.hashtags.length ? "\n" + esc(p.hashtags.join(" ")) : ""}${p.imageIdea ? `\n<i>Image: ${esc(p.imageIdea)}</i>` : ""}</div>`;
  }).join("");
  const li = (a) => `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  el.innerHTML = `
    <h1>${esc(b.name)}</h1>
    <div>${esc(b.what)} · For ${esc(b.audience)}</div>
    <div style="margin-top:4px;color:#5B7090">Goal: ${esc(b.goal)} · Launch: ${esc(fmtLong(dayDate(b.launchDate, 0)))} · Channels: ${esc(b.channels.join(", "))} · Tone: ${esc(b.tone)}</div>
    <div class="r-hero"><b>${esc(k.positioning.oneLiner)}</b><div style="margin-top:6px">${esc(k.positioning.pitch)}</div></div>
    <div class="r-grid">
      <div class="r-box"><b>Key messages</b>${li(k.positioning.messages)}</div>
      <div class="r-box"><b>Proof to gather</b>${li(k.positioning.proofToGather)}</div>
      <div class="r-box"><b>Words to use</b><div>${esc(k.positioning.useWords.join(" · "))}</div></div>
      <div class="r-box"><b>Words to avoid</b><div>${esc(k.positioning.avoidWords.join(" · "))}</div></div>
    </div>
    <h2>Personas</h2>
    <div class="r-grid">${k.personas.map((p) => `<div class="r-box"><b>${esc(p.emoji)} ${esc(p.name)}</b><div>${esc(p.who)}</div><div style="margin-top:6px"><b>Pains:</b> ${esc(p.pains.join("; "))}</div><div><b>Wants:</b> ${esc(p.wants.join("; "))}</div><div><b>Hangs out:</b> ${esc(p.hangouts.join(", "))}</div><div style="margin-top:6px"><i>“${esc(p.bestMessage)}”</i></div></div>`).join("")}</div>
    <h2>Ads</h2>
    <div class="r-grid">${k.ads.map((a) => `<div class="r-box"><small>${esc(a.angle)}</small><div><b>${esc(a.headline)}</b></div><div>${esc(a.description)}</div><div style="margin-top:4px">CTA: <b>${esc(a.cta)}</b></div></div>`).join("")}
      <div class="r-box"><b>Hashtags</b><div>${esc([...k.hashtags.core, ...k.hashtags.niche].join(" "))}</div></div></div>
    <h2>Launch checklist</h2>
    <div class="r-grid" style="grid-template-columns:1fr 1fr 1fr"><div class="r-box"><b>Before</b>${li(k.checklist.before.map((x) => x.text))}</div><div class="r-box"><b>Launch day</b>${li(k.checklist.launch.map((x) => x.text))}</div><div class="r-box"><b>After</b>${li(k.checklist.after.map((x) => x.text))}</div></div>
    <h2 style="break-before:page">Content calendar · ${k.calendar.length} posts</h2>
    ${posts}
    <div class="r-foot">Made with Campaign Kit${stamped(c) ? ` · Stamped on ${esc(NET.chainName)} as plan #${c.chain.id}` : ""} · Drafts — always review before posting.</div>`;
  return el;
}

// ================= on-chain =================
async function stamp() {
  const c = S.c;
  if (c.mode === "example" && !c.id) commit();
  const ms = milestoneList(c.kit.checklist).length;
  if (ms < 1 || ms > MAX_MILESTONES) return toast("Your checklist needs 1–30 items to stamp.");
  if (!c.brief.launchDate) return toast("Pick a launch date first.");
  S.busy.stamp = true; renderStampBits(); if (S.tab === "checklist") renderTab();
  try {
    const contract = await writeContract();
    const hash = await currentHash();
    const title = clipBytes(c.brief.name, 48);
    const goal = Math.max(0, GOALS.indexOf(c.brief.goal));
    toast("Confirm in MetaMask…", 8000);
    const tx = await contract.stampPlan(hash, title, goal, launchUnix(c.brief.launchDate), ms);
    toast("Stamping on BOT Chain…", 20000);
    const rc = await tx.wait();
    const ev = rc.logs.map((l) => { try { return contract.interface.parseLog(l); } catch { return null; } }).find((x) => x?.name === "PlanStamped");
    if (!ev) throw new Error("no_event");
    c.chain = { id: Number(ev.args.id), hash, tx: tx.hash, network: CONFIG.NETWORK, contract: CONTRACT, owner: wallet.address, mask: 0, at: Date.now() };
    saveCampaign(c);
    S.busy.stamp = false;
    S.onchain = { owner: wallet.address, planHash: hash, done: 0, total: ms, mask: 0 };
    confetti(innerWidth / 2, innerHeight / 3);
    toast("Stamped on BOT Chain ✓");
    renderKit();
    const link = location.origin + `/app/plan/${c.chain.id}`;
    modal(`<h3>Stamped on BOT Chain 🎉</h3><p>Your plan is #${c.chain.id}. Share the public progress link — it shows the name, goal, launch date and milestones ticked, never your drafts.</p>
      <div class="input" style="display:flex;align-items:center;margin:12px 0;word-break:break-all">${esc(link)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="copy-link" autofocus>Copy link</button><a class="btn ghost" href="${explorerTx(tx.hash)}" target="_blank" rel="noopener">View transaction ↗</a></div>`);
  } catch (e) {
    S.busy.stamp = false;
    renderStampBits(); if (S.tab === "checklist") renderTab();
    toast(txError(e), 5000);
  }
}
async function tick(i, btn) {
  const c = S.c;
  if (S.busy["t" + i]) return;
  if (wallet.address && c.chain.owner && c.chain.owner.toLowerCase() !== wallet.address.toLowerCase() && S.onchain && S.onchain.owner.toLowerCase() !== wallet.address.toLowerCase()) {
    return toast("Only the wallet that stamped this plan can tick milestones.");
  }
  S.busy["t" + i] = true; renderTab();
  const rect = btn.getBoundingClientRect();
  try {
    const contract = await writeContract();
    toast("Confirm in MetaMask…", 8000);
    const tx = await contract.tick(c.chain.id, i);
    await tx.wait();
    c.chain.mask = (c.chain.mask || 0) | (1 << i);
    if (S.onchain) { S.onchain.mask |= 1 << i; S.onchain.done++; }
    saveCampaign(c);
    confetti(rect.left + rect.width / 2, rect.top);
    toast("Milestone ticked on BOT Chain ✓");
  } catch (e) { toast(txError(e), 5000); }
  S.busy["t" + i] = false;
  renderTab();
}
async function updateHash() {
  const c = S.c;
  S.busy.hash = true; renderBanners();
  try {
    const contract = await writeContract();
    const hash = await currentHash();
    toast("Confirm in MetaMask…", 8000);
    const tx = await contract.updateHash(c.chain.id, hash);
    await tx.wait();
    c.chain.hash = hash;
    if (S.onchain) S.onchain.planHash = hash;
    saveCampaign(c);
    toast("Fingerprint updated ✓");
  } catch (e) { toast(txError(e), 5000); }
  S.busy.hash = false;
  renderBanners();
}

// ================= public progress page =================
async function renderPublic(rawId) {
  document.title = "Campaign progress — Campaign Kit";
  root.innerHTML = `<div class="public"><div class="public-card"><div class="skel" style="height:40px;width:60%"></div><div class="skel" style="height:20px;width:40%"></div><div class="skel" style="height:20px"></div><div class="skel" style="height:90px"></div></div></div>`;
  const id = /^\d+$/.test(String(rawId)) ? Number(rawId) : -1;
  const notFound = (msg = "We couldn't find a campaign with that number on BOT Chain.") => {
    root.innerHTML = `<div class="public"><div class="public-card empty">${buzzSvg()}<h1>Campaign not found</h1><p style="color:var(--muted)">${esc(msg)}</p><div><a class="btn primary" href="/app?new=1" data-link>Start a campaign</a></div></div></div>`;
  };
  if (id < 0) return notFound();
  if (!IS_DEPLOYED) return notFound("The Campaign Kit contract isn't deployed on this network yet.");
  let p, pr;
  try {
    const rc = await readContract();
    [p, pr] = await Promise.all([rc.getPlan(id), rc.progress(id)]);
  } catch (e) {
    if (e?.revert?.name === "NotFound" || /NotFound|0xc5723b51/.test(e?.data || e?.message || "")) return notFound();
    root.innerHTML = `<div class="public"><div class="public-card empty">${buzzSvg()}<h1>Can't reach BOT Chain</h1><p style="color:var(--muted)">Check your connection and try again.</p><div><button class="btn primary" data-act="reload">Try again</button></div></div></div>`;
    return;
  }
  const done = Number(pr.done), total = Number(pr.total), mask = Number(pr.mask);
  const launch = new Date(Number(p.launchDate) * 1000);
  const launchLocal = new Date(launch.getUTCFullYear(), launch.getUTCMonth(), launch.getUTCDate());
  const days = Math.round((launchLocal - new Date(new Date().toDateString())) / 86400000);
  const when = days > 0 ? `Launches in ${days} day${days === 1 ? "" : "s"}` : days === 0 ? "Launches today 🚀" : `Launched ${-days} day${days === -1 ? "" : "s"} ago`;
  const local = campaigns().find((c) => stamped(c) && c.chain.id === id);
  const labels = local ? milestoneList(local.kit.checklist).map((m) => m.text) : null;
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.title = `${p.title} — progress · Campaign Kit`;
  root.innerHTML = `<div class="public"><div class="public-card">
    <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="tag ok">✓ Verified on ${esc(NET.chainName)}</span><span class="tag">Plan #${id}</span></div>
    <h1>${esc(p.title)}</h1>
    <div class="kit-meta"><span class="tag">🎯 ${esc(GOALS[Number(p.goal)] || "Campaign")}</span><span class="tag">🚀 ${esc(fmtLong(launchLocal))}</span><span class="tag">${esc(when)}</span></div>
    <div style="display:flex;justify-content:space-between;font-weight:600;margin-top:8px"><span>${done} of ${total} milestones done</span><span>${pct}%</span></div>
    <div class="big-bar"><i id="pubBar"></i></div>
    ${labels ? `<div class="k-label" style="margin-top:8px">Milestones <span style="text-transform:none;font-weight:500">(names are only visible to you — they're in your browser)</span></div>
      <div style="display:grid;gap:6px">${labels.map((t, i) => `<div class="ms-item ${mask & (1 << i) ? "done" : ""}" style="background:var(--page)"><span class="num" style="${mask & (1 << i) ? "background:var(--a-green);color:#fff" : ""}">${mask & (1 << i) ? "✓" : i + 1}</span><span class="txt">${esc(t)}</span></div>`).join("")}</div>`
      : `<div class="ms-dots">${Array.from({ length: total }, (_, i) => `<span class="${mask & (1 << i) ? "on" : ""}" title="Milestone ${i + 1}${mask & (1 << i) ? " — done" : ""}">${mask & (1 << i) ? "✓" : i + 1}</span>`).join("")}</div>`}
    <dl class="kv" style="margin-top:10px">
      <dt>Owner</dt><dd><a href="${explorerAddr(p.owner)}" target="_blank" rel="noopener">${esc(short(p.owner))} ↗</a></dd>
      <dt>Stamped</dt><dd>${esc(new Date(Number(p[7]) * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }))}</dd>
      <dt>Fingerprint</dt><dd><code>${esc(p.planHash.slice(0, 10) + "…" + p.planHash.slice(-8))}</code></dd>
    </dl>
    <p style="color:var(--muted);font-size:13px;margin:0">Only a fingerprint of the plan is on-chain. The drafts stay private with the owner.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn primary" data-act="copy-link" data-id="${id}">Copy link</button>
      <a class="btn ghost" href="${explorerAddr(CONTRACT)}" target="_blank" rel="noopener">View on explorer ↗</a>
      ${local ? `<a class="btn ghost" href="/app?c=${local.id}" data-link>Open in editor</a>` : `<a class="btn ghost" href="/app?new=1" data-link>Plan your own</a>`}
    </div>
  </div></div>`;
  requestAnimationFrame(() => setTimeout(() => { const b = $("#pubBar"); if (b) b.style.width = pct + "%"; }, 60));
}

// ================= campaigns =================
function renderCampaigns() {
  document.title = "My campaigns — Campaign Kit";
  S.c = null;
  const list = campaigns();
  $("#main").innerHTML = `
    <h1 class="page-title">My campaigns</h1>
    <p class="page-sub">Saved in this browser only. Duplicate one to use it as a template.</p>
    ${list.length ? `<div class="camp-grid">${list.map((c) => {
      const ms = milestoneList(c.kit.checklist).length, st = stamped(c);
      const done = st ? milestoneList(c.kit.checklist).filter((_, i) => (c.chain.mask || 0) & (1 << i)).length : 0;
      return `<div class="camp">
        <a href="/app?c=${c.id}" data-link style="text-decoration:none;display:grid;gap:8px">
          <h3>${esc(c.brief.name)}</h3>
          <div class="row"><span class="tag" style="background:var(--page)">🎯 ${esc(c.brief.goal)}</span><span class="tag" style="background:var(--page)">🚀 ${esc(fmtDay(dayDate(c.brief.launchDate, 0)))}</span>${st ? `<span class="tag ok">✓ #${c.chain.id}</span>` : ""}</div>
          <small style="color:var(--muted)">${c.kit.calendar.length} posts · ${ms} milestones${st ? ` · ${done} done` : ""}</small>
          ${st ? `<div class="mini-bar"><i style="width:${ms ? (done / ms) * 100 : 0}%"></i></div>` : ""}
        </a>
        <div class="row"><a class="chip-btn" href="/app?c=${c.id}" data-link style="text-decoration:none">Open</a><button class="chip-btn" data-act="dup-camp" data-id="${c.id}">⧉ Duplicate</button>${st ? `<a class="chip-btn" href="/app/plan/${c.chain.id}" data-link style="text-decoration:none">Public ↗</a>` : ""}<button class="chip-btn danger" data-act="del-camp" data-id="${c.id}">Delete</button></div>
      </div>`;
    }).join("")}</div>`
      : `<div class="card empty">${buzzSvg()}<h2 style="margin:0 0 6px">No campaigns yet</h2><p style="color:var(--muted)">Fill in a short brief and get a whole kit in one click.</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><a class="btn primary" href="/app?new=1" data-link>Start a campaign</a><a class="btn white" href="/app?example=${EXAMPLE_IDS[0]}" data-link>See an example</a></div></div>`}`;
}
function notFoundLocal() {
  $("#main").innerHTML = `<div class="card empty">${buzzSvg()}<h2 style="margin:0 0 6px">Campaign not found</h2><p style="color:var(--muted)">It isn't saved in this browser. Campaigns live in the browser where you made them.</p><a class="btn primary" href="/app/campaigns" data-link>My campaigns</a></div>`;
}
function duplicate(id) {
  const src = getCampaign(id);
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.brief.name = clipBytes(src.brief.name + " (copy)", 48);
  delete copy.chain;
  copy.notes = [];
  copy.createdAt = Date.now();
  if (copy.brief.launchDate < todayISO()) copy.brief.launchDate = isoOf(dayDate(todayISO(), 7));
  saveCampaign(copy);
  toast("Duplicated — edit away");
  nav.go(`/app?c=${copy.id}`);
}
function changeDate() {
  modal(`<h3>Launch date</h3><p>Your calendar moves with it (7 days before → 7 days after).</p>
    <input class="input" type="date" id="newDate" min="${todayISO()}" value="${esc(S.c.brief.launchDate)}" autofocus>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px"><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="save-date">Save</button></div>`);
}

// ================= events =================
function bindRoot() {
  root.dataset.bound = "1";
  root.addEventListener("click", onClick);
  $("#modal").addEventListener("click", onClick);
  root.addEventListener("input", (e) => {
    if (e.target.closest("#briefForm")) briefCheck();
    const ce = e.target.closest("[contenteditable][data-path]");
    if (ce && S.c) onEditInput(ce);
  });
  root.addEventListener("keydown", (e) => {
    const ce = e.target.closest("[contenteditable][data-path]");
    if (ce && e.key === "Enter" && !e.shiftKey && !ce.classList.contains("pitch")) { e.preventDefault(); ce.blur(); }
    const post = e.target.closest(".post");
    if (post && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openDrawer(post.dataset.id); }
  });
  root.addEventListener("paste", (e) => {
    const ce = e.target.closest("[contenteditable]");
    if (!ce) return;
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  });
  root.addEventListener("focusout", (e) => {
    const ce = e.target.closest?.("[contenteditable][data-path]");
    if (ce && S.c) { if (ce.dataset.path === "brief.name") renderSidebar(); commit({ now: true }); }
    if (e.target.closest?.("#briefForm") && (e.target.name === "launchDate" || e.target.name === "website")) briefCheck();
  });
  root.addEventListener("submit", (e) => {
    e.preventDefault();
    S.touched = true;
    const probs = briefCheck(true);
    if (Object.keys(probs).length) { $("#briefForm .field.bad .input, #briefForm .field.bad button")?.focus(); return; }
    build();
  });
}

async function onClick(e) {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  switch (act) {
    case "seg": {
      const f = b.dataset.field, v = b.dataset.val;
      if (f === "channels") { const s = new Set(S.brief.channels); s.has(v) ? s.delete(v) : s.add(v); S.brief.channels = CHANNELS.filter((c) => s.has(c)); }
      else S.brief[f] = v;
      $$(`.seg[data-field="${f}"] button`).forEach((x) => x.setAttribute("aria-pressed", String(f === "channels" ? S.brief.channels.includes(x.dataset.val) : S.brief[f] === x.dataset.val)));
      saveDraft(S.brief);
      briefCheck();
      break;
    }
    case "clear-brief": try { localStorage.removeItem(DRAFT); } catch { /* ignore */ } renderBrief(); break;
    case "retry": shell(renderBrief); build(); break;
    case "use-template": shell(renderBrief); build(true); break;
    case "back-brief": shell(renderBrief); break;
    case "tab": S.tab = b.dataset.tab; closeDrawer(); renderTab(); break;
    case "open-post": openDrawer(b.dataset.id); break;
    case "add-post": addPost(+b.dataset.day); break;
    case "ai-field": aiField(b); break;
    case "ai-ad": aiAd(b); break;
    case "copy-tags": copyText([...S.c.kit.hashtags.core, ...S.c.kit.hashtags.niche].join(" "), "Hashtags copied"); break;
    case "ms-add": {
      if (milestoneList(S.c.kit.checklist).length >= MAX_MILESTONES) return toast("Max 30 milestones.");
      S.c.kit.checklist[b.dataset.g].push({ id: uid(), text: "New task" });
      commit(); renderTab(); updateTabCounts();
      const items = $$(`#tabPanel [data-path^="kit.checklist.${b.dataset.g}."]`);
      const last = items.at(-1);
      if (last) { last.focus(); document.getSelection().selectAllChildren(last); }
      break;
    }
    case "ms-del": {
      const g = b.dataset.g;
      if (milestoneList(S.c.kit.checklist).length <= 1) return toast("Keep at least one milestone.");
      S.c.kit.checklist[g] = S.c.kit.checklist[g].filter((m) => m.id !== b.dataset.id);
      trimChecklist(S.c.kit.checklist);
      commit(); renderTab(); updateTabCounts();
      break;
    }
    case "export": exportMenu(b); break;
    case "export-pdf": closeModal(); $(".menu")?.remove(); exportPDF(); break;
    case "export-csv": closeModal(); $(".menu")?.remove(); download(fileBase() + "-posts.csv", toCSV(S.c), "text/csv;charset=utf-8"); toast("CSV downloaded ✓"); break;
    case "export-ics": closeModal(); $(".menu")?.remove(); download(fileBase() + "-calendar.ics", toICS(S.c), "text/calendar;charset=utf-8"); toast(`${S.c.kit.calendar.length} calendar events downloaded ✓`); break;
    case "export-copy": closeModal(); $(".menu")?.remove(); copyText(allPostsText(S.c), `${S.c.kit.calendar.length} posts copied`); break;
    case "stamp": if (wallet.address && !wallet.chainOk) { try { await ensureChain(); } catch { toast("Switch to BOT Chain in MetaMask."); } } else stamp(); break;
    case "tick": tick(+b.dataset.i, b); break;
    case "update-hash": updateHash(); break;
    case "wallet": walletAction(); break;
    case "copy-link": {
      const id = b.dataset.id ?? S.c?.chain?.id;
      copyText(location.origin + `/app/plan/${id}`, "Link copied");
      break;
    }
    case "change-date": changeDate(); break;
    case "save-date": {
      const v = $("#newDate").value;
      if (!v || v < todayISO()) return toast("Pick a future date (or today)");
      S.c.brief.launchDate = v;
      closeModal(); commit({ now: true }); renderKit();
      break;
    }
    case "modal-close": closeModal(); break;
    case "dup-camp": duplicate(b.dataset.id); break;
    case "del-camp": {
      const c = getCampaign(b.dataset.id);
      if (c && await confirmBox("Delete this campaign?", `“${c.brief.name}” will be removed from this browser.${stamped(c) ? " Its stamp stays on BOT Chain." : ""}`, "Delete")) {
        deleteCampaign(c.id); renderSidebar(); renderCampaigns(); toast("Deleted");
      }
      break;
    }
    case "reload": renderApp(); break;
  }
}
