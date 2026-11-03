// Router + shared chrome (navbar, search, footer, legal pages).
import { CONFIG, NET, CONTRACT, IS_DEPLOYED } from "./config.js";
import { $, $$, esc, modal, initModal, nav, reduced } from "./ui.js";
import { initWallet, rpcBlockNumber, short, explorerAddr } from "./chain.js";
import { initSite, teardownSite } from "./site.js";
import { renderApp, appSearchItems } from "./app.js";

// GitHub Pages 404 redirect: /?p=/app/plan/7&q=... → /app/plan/7?...
(function restore() {
  const u = new URL(location.href);
  const p = u.searchParams.get("p");
  if (p && p.startsWith("/")) {
    const q = u.searchParams.get("q");
    history.replaceState(null, "", p + (q ? "?" + q : "") + u.hash);
  }
})();

let current = null;
function route() {
  const { pathname, searchParams, hash } = new URL(location.href);
  const inApp = pathname.startsWith("/app") || searchParams.has("plan");
  document.body.classList.toggle("in-app", inApp);
  $("#site").hidden = inApp;
  $("#app").hidden = !inApp;
  $("#walletBtn").hidden = !inApp;
  $("#navCta").hidden = inApp;
  $$(".app-links .nav-link").forEach((a) => a.classList.toggle("active", inApp && new URL(a.href).pathname === pathname && !(pathname === "/app" && searchParams.size)));
  if (inApp) {
    if (current === "site") teardownSite();
    current = "app";
    document.body.style.backgroundColor = "";
    renderApp();
  } else {
    if (current !== "site") { current = "site"; initSite(); }
    const id = hash.slice(1);
    if (["terms", "privacy", "tips"].includes(id)) showLegal(id);
    else if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth" }), 60);
    else if (!hash) scrollTo(0, 0);
  }
  moveHover(null);
}

nav.go = (url, { replace = false } = {}) => {
  const u = new URL(url, location.href);
  if (u.origin !== location.origin) { location.href = url; return; }
  const samePage = u.pathname === location.pathname && u.search === location.search;
  if (replace) history.replaceState(null, "", u.pathname + u.search + u.hash);
  else history.pushState(null, "", u.pathname + u.search + u.hash);
  if (samePage && u.hash && !u.pathname.startsWith("/app")) {
    const id = u.hash.slice(1);
    if (["terms", "privacy", "tips"].includes(id)) return showLegal(id);
    return document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth" });
  }
  if (!u.hash) scrollTo(0, 0);
  route();
};

document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-link]");
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === "_blank") return;
  e.preventDefault();
  closeDropdown();
  nav.go(a.getAttribute("href") + (a.hasAttribute("data-new") && a.getAttribute("href") === "/app" ? "?new=1" : ""));
});
addEventListener("popstate", route);

// ---------- navbar hover pill ----------
const pill = $("#navPill");
const hover = $(".nav-hover", pill);
function moveHover(el) {
  if (!el || matchMedia("(hover: none)").matches) { hover.style.opacity = "0"; return; }
  const pr = pill.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  hover.style.width = r.width + "px";
  hover.style.transform = `translateX(${r.left - pr.left}px)`;
  hover.style.opacity = "1";
}
pill.addEventListener("pointerover", (e) => { const l = e.target.closest(".nav-link"); if (l) moveHover(l); });
pill.addEventListener("pointerleave", () => moveHover(null));

// Features dropdown
const dd = $(".dd");
const featBtn = $("#featBtn");
function closeDropdown() { dd.classList.remove("open"); featBtn.setAttribute("aria-expanded", "false"); }
featBtn.addEventListener("click", (e) => { e.stopPropagation(); const o = !dd.classList.contains("open"); dd.classList.toggle("open", o); featBtn.setAttribute("aria-expanded", String(o)); });
dd.addEventListener("mouseenter", () => matchMedia("(hover: hover)").matches && (dd.classList.add("open"), featBtn.setAttribute("aria-expanded", "true")));
dd.addEventListener("mouseleave", () => matchMedia("(hover: hover)").matches && closeDropdown());
document.addEventListener("click", (e) => { if (!e.target.closest(".dd")) closeDropdown(); });

// ---------- search ----------
const PAGES = [
  { t: "Start a campaign", s: "App", href: "/app?new=1" },
  { t: "My campaigns", s: "App", href: "/app/campaigns" },
  { t: "Example: Brewly coffee subscription", s: "Example kit", href: "/app?example=brewly" },
  { t: "Example: StudyBuddy app", s: "Example kit", href: "/app?example=studybuddy" },
  { t: "Example: Sunset Yoga studio", s: "Example kit", href: "/app?example=sunset" },
  { t: "Planning tools", s: "Features", href: "/#plan" },
  { t: "How it works — write, schedule, ship", s: "Features", href: "/#create" },
  { t: "What goes on BOT Chain?", s: "FAQ", href: "/#faq" },
  { t: "Will my drafts make things up?", s: "FAQ", href: "/#faq" },
  { t: "Marketing tips", s: "Resources", href: "/#tips" },
];
const sp = $("#searchPop"), si = $("#searchInput"), sl = $("#searchList");
let sel = 0;
function renderSearch() {
  const q = si.value.trim().toLowerCase();
  const items = [...appSearchItems(), ...PAGES].filter((x) => !q || (x.t + " " + x.s).toLowerCase().includes(q)).slice(0, 9);
  sel = Math.min(sel, Math.max(0, items.length - 1));
  sl.innerHTML = items.length ? items.map((x, i) => `<li><a href="${esc(x.href)}" data-link class="${i === sel ? "sel" : ""}">${esc(x.t)}<small>${esc(x.s)}</small></a></li>`).join("") : `<li style="padding:12px 14px;color:var(--muted)">Nothing found</li>`;
}
$("#searchBtn").addEventListener("click", () => { sp.hidden = false; si.value = ""; sel = 0; renderSearch(); si.focus(); });
sp.addEventListener("click", (e) => { if (e.target === sp || e.target.closest("a")) sp.hidden = true; });
si.addEventListener("input", () => { sel = 0; renderSearch(); });
si.addEventListener("keydown", (e) => {
  const n = $$("a", sl).length;
  if (e.key === "ArrowDown") { sel = (sel + 1) % Math.max(1, n); renderSearch(); e.preventDefault(); }
  if (e.key === "ArrowUp") { sel = (sel - 1 + n) % Math.max(1, n); renderSearch(); e.preventDefault(); }
  if (e.key === "Enter") { const a = $$("a", sl)[sel]; if (a) { sp.hidden = true; nav.go(a.getAttribute("href")); } }
  if (e.key === "Escape") sp.hidden = true;
});
document.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); $("#searchBtn").click(); } });

// ---------- legal / tips ----------
const LEGAL = {
  terms: `<h3>Terms</h3><p>Campaign Kit is a free tool provided as-is. Drafts can be wrong — you're responsible for checking anything you publish. Stamping a plan or ticking a milestone sends a transaction from your own wallet; those are public and permanent on BOT Chain.</p>`,
  privacy: `<h3>Privacy</h3><p>Your campaigns are saved in this browser only (localStorage). We don't have accounts or a database. ${CONFIG.WORKER_URL ? "When you build a kit, the brief is sent to our Worker and on to the AI model to write the drafts; the Worker doesn't log or store it." : "Your kit is built right here in your browser — your brief never leaves your device."} On BOT Chain we only record a fingerprint (hash) of the plan, its title, goal, launch date and milestone count — never your drafts.</p>`,
  tips: `<h3>Marketing tips</h3><ul><li><b>Say one thing.</b> Every post should push one message from your positioning.</li><li><b>Show, don't claim.</b> Swap every "⚠ Add proof" for a real quote, screenshot or number.</li><li><b>Launch day is a conversation.</b> Reply to every comment in the first two hours.</li><li><b>Repeat yourself.</b> Most people see only a fraction of your posts — it's fine to say it again.</li><li><b>Fewer channels, done well</b> beats every channel done badly.</li></ul>`,
};
function showLegal(id) { modal(LEGAL[id]); }

// ---------- footer ----------
function initFooter() {
  $("#fChainId").textContent = NET.chainId;
  $("#fAddr").textContent = IS_DEPLOYED ? short(CONTRACT) : "not deployed yet";
  $("#fAddr").title = CONTRACT;
  $("#fExplorer").href = IS_DEPLOYED ? explorerAddr(CONTRACT) : NET.explorer;
  $("#fGithub").href = CONFIG.GITHUB_URL;
  $("#fX").href = CONFIG.X_URL;
  $("#fIg").href = CONFIG.INSTAGRAM_URL;
  $("#fIn").href = CONFIG.LINKEDIN_URL;
  const st = $("#fStatus");
  const tick = async () => {
    try {
      const n = await rpcBlockNumber();
      if (!Number.isFinite(n)) throw 0;
      st.classList.add("live");
      st.lastElementChild.textContent = `${NET.chainName} live · block #${n.toLocaleString("en-US")}`;
    } catch {
      st.classList.remove("live");
      st.lastElementChild.textContent = `${NET.chainName} · unreachable`;
    }
  };
  tick();
  setInterval(() => document.visibilityState === "visible" && tick(), 15000);
}

initModal();
initFooter();
initWallet();
route();
