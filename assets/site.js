// Home page: carousels, living illustrations, GSAP scroll reveals, Buzz following the cursor.
import { $, $$, esc, reduced, isMobile } from "./ui.js";
import { CONFIG } from "./config.js";
import { readContract } from "./chain.js";
import { EXAMPLE_IDS, exampleMeta } from "./examples.js";

let started = false;
let mm = null; // gsap.matchMedia
const timers = [];
const cleanups = [];

export function initSite() {
  document.title = "Campaign Kit — your whole campaign in one click";
  if (!started) {
    started = true;
    buildMiniGrid();
    buildExamples();
    $$(".carousel").forEach(initCarousel);
    initTilt();
    initBuzzEyes();
    liveCount();
  }
  startLiving();
  waitGsap().then(initScroll);
}

export function teardownSite() {
  timers.splice(0).forEach(clearInterval);
  cleanups.splice(0).forEach((f) => f());
  mm?.revert();
  mm = null;
  document.body.style.backgroundColor = "";
  document.body.classList.remove("on-sky");
}

async function waitGsap() {
  for (let i = 0; i < 60 && !(window.gsap && window.ScrollTrigger); i++) await new Promise((r) => setTimeout(r, 50));
  return !!window.gsap;
}

// ---------- hero laptop calendar ----------
function buildMiniGrid() {
  const g = $("#miniGrid");
  const days = ["−3", "−2", "−1", "Launch", "+1", "+2", "+3"];
  const counts = [2, 1, 2, 4, 2, 1, 2];
  g.innerHTML = days.map((d, i) => `<div class="mini-day ${d === "Launch" ? "launch" : ""}"><small>${d}</small>${Array.from({ length: counts[i] }, (_, j) => `<i class="mini-post c${(i + j) % 5}"></i>`).join("")}</div>`).join("");
}

// ---------- example kits ----------
function buildExamples() {
  $("#exampleCarousel").innerHTML = EXAMPLE_IDS.map((id) => {
    const m = exampleMeta(id);
    const strip = Array.from({ length: 7 }, (_, i) => `<span class="${i === 3 ? "launch" : ""}">${"<i></i>".repeat(i === 3 ? m.channels.length : 1 + ((i + id.length) % 2))}</span>`).join("");
    return `<a class="fcard ex-card" href="/app?example=${id}" data-link>
      <span class="ex-tag">Example</span>
      <div class="ex-emoji" style="background:${m.color}">${m.emoji}</div>
      <h3>${esc(m.name)}</h3>
      <p>${esc(m.oneLiner)}</p>
      <div class="ex-meta"><span>🎯 ${esc(m.goal)}</span><span>🗣 ${esc(m.tone)}</span>${m.channels.map((c) => `<span>${esc(c)}</span>`).join("")}</div>
      <div class="ex-strip">${strip}</div>
      <span class="btn primary sm ex-open">Open example kit →</span>
    </a>`;
  }).join("");
}

// ---------- carousels: arrows + mouse drag (touch uses native swipe + snap) ----------
function initCarousel(track) {
  const sec = track.closest(".sec-body");
  const [prev, next] = $$(".arrow", sec);
  const step = () => (track.querySelector(".fcard")?.getBoundingClientRect().width || 300) + 18;
  const update = () => {
    if (!prev) return;
    prev.disabled = track.scrollLeft < 8;
    next.disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 8;
  };
  prev?.addEventListener("click", () => track.scrollBy({ left: -step(), behavior: reduced() ? "auto" : "smooth" }));
  next?.addEventListener("click", () => track.scrollBy({ left: step(), behavior: reduced() ? "auto" : "smooth" }));
  track.addEventListener("scroll", update, { passive: true });
  addEventListener("resize", update);
  update();

  let down = null, moved = false;
  track.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    down = { x: e.clientX, left: track.scrollLeft };
    moved = false;
  });
  addEventListener("pointermove", (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    if (!moved && Math.abs(dx) > 6) { moved = true; track.classList.add("dragging"); }
    if (moved) track.scrollLeft = down.left - dx;
  });
  addEventListener("pointerup", () => {
    if (!down) return;
    down = null;
    if (moved) {
      track.classList.remove("dragging");
      // snap to the nearest card
      const s = step();
      track.scrollTo({ left: Math.round(track.scrollLeft / s) * s, behavior: "smooth" });
    }
  });
  track.addEventListener("click", (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
}

// ---------- card hover tilt + illustration parallax ----------
function initTilt() {
  if (!matchMedia("(hover: hover)").matches) return;
  document.addEventListener("pointermove", (e) => {
    const card = e.target.closest?.(".fcard");
    if (!card || reduced() || card.closest(".dragging")) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
    card.style.transform = `translateY(-4px) rotateX(${(-py * 4).toFixed(2)}deg) rotateY(${(px * 5).toFixed(2)}deg)`;
    const il = card.querySelector(".illu");
    if (il) il.style.transform = `translate(${(px * 10).toFixed(1)}px, ${(py * 8).toFixed(1)}px)`;
  });
  document.addEventListener("pointerout", (e) => {
    const card = e.target.closest?.(".fcard");
    if (card && !card.contains(e.relatedTarget)) {
      card.style.transform = "";
      const il = card.querySelector(".illu");
      if (il) il.style.transform = "";
    }
  });
}

// ---------- Buzz looks + tilts toward the cursor ----------
function initBuzzEyes() {
  let raf = 0, mx = innerWidth / 2, my = innerHeight / 2;
  addEventListener("pointermove", (e) => {
    mx = e.clientX; my = e.clientY;
    if (raf || reduced()) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (document.body.classList.contains("in-app")) return;
      $$(".buzz-inline").forEach((b) => {
        const r = b.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) return;
        const dx = mx - (r.left + r.width / 2), dy = my - (r.top + r.height / 2);
        const ang = Math.max(-14, Math.min(14, dx / 30));
        b.style.transform = `rotate(${ang.toFixed(1)}deg)`;
        const d = Math.hypot(dx, dy) || 1;
        $$(".bz-pupil", b).forEach((p) => p.setAttribute("transform", `translate(${(dx / d * 1.6).toFixed(2)} ${(dy / d * 1.6).toFixed(2)})`));
      });
    });
  });
}

// ---------- living illustrations ----------
function startLiving() {
  // ticking checklist
  const items = $$(".tick-list li");
  let i = 0;
  timers.push(setInterval(() => {
    if (i >= items.length) { items.forEach((li) => li.classList.remove("on")); i = 0; return; }
    items[i++].classList.add("on");
  }, 1100));
  // count up + badge when visible
  const io = new IntersectionObserver((ents) => ents.forEach((en) => {
    if (!en.isIntersecting) return;
    const el = en.target, to = +el.dataset.to;
    io.unobserve(el);
    if (reduced()) { el.textContent = to; el.closest(".fcard").querySelector(".check-badge")?.classList.add("pop"); return; }
    let n = 0;
    const t = setInterval(() => {
      el.textContent = ++n;
      if (n >= to) { clearInterval(t); el.closest(".fcard").querySelector(".check-badge")?.classList.add("pop"); }
    }, 70);
  }), { threshold: .6 });
  $$(".count").forEach((c) => { c.textContent = "0"; c.closest(".fcard").querySelector(".check-badge")?.classList.remove("pop"); io.observe(c); });
  cleanups.push(() => io.disconnect());
}

// ---------- GSAP: pinned heading reveal + background colour transitions ----------
function initScroll(ok) {
  if (!ok || document.body.classList.contains("in-app")) return;
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  mm?.revert();
  mm = gsap.matchMedia();

  // section background: pale sky → deep navy → pale sky → sky blue (CTA + footer)
  // One listener picks the section under the middle of the screen (robust to pin spacing).
  let curBg = null;
  const pickBg = () => {
    if (document.body.classList.contains("in-app")) return;
    const y = innerHeight * .55;
    let c = "#EAF4FF";
    for (const s of $$("#site [data-bg]")) { const r = s.getBoundingClientRect(); if (r.top <= y && r.bottom > y) { c = s.dataset.bg; break; } }
    if ($("#footer").getBoundingClientRect().top <= y) c = "#5CB8FF";
    if (c !== curBg) { curBg = c; document.body.classList.toggle("on-sky", c === "#5CB8FF"); gsap.to(document.body, { backgroundColor: c, duration: reduced() ? 0 : .6, overwrite: true }); }
  };
  addEventListener("scroll", pickBg, { passive: true });
  cleanups.push(() => removeEventListener("scroll", pickBg));
  pickBg();

  // desktop, motion OK: pin each section, heading moves up from the centre and the carousel rises in
  mm.add("(min-width: 861px) and (prefers-reduced-motion: no-preference)", () => {
    gsap.from(".hero .fade-up", { y: 30, opacity: 0, duration: .9, stagger: .12, ease: "power3.out" });
    gsap.from("#heroCard", { y: 80, opacity: 0, scale: .96, duration: 1.1, delay: .25, ease: "power3.out" });
    gsap.from(".float-post, .float-chip", { y: 40, opacity: 0, duration: .8, delay: .7, stagger: .12, ease: "back.out(1.6)" });
    $$(".reveal-sec").forEach((sec) => {
      const head = $(".sec-head", sec), body = $(".sec-body", sec);
      const lift = Math.max(0, innerHeight / 2 - head.offsetHeight / 2 - 110);
      const tl = gsap.timeline({ scrollTrigger: { trigger: sec, start: "top top", end: "+=" + Math.round(innerHeight * .7), pin: true, scrub: .6, anticipatePin: 1 } });
      tl.fromTo(head, { y: lift }, { y: 0, ease: "none" }, 0)
        .fromTo(body, { y: innerHeight * .45, opacity: 0 }, { y: 0, opacity: 1, ease: "power2.out" }, .1);
    });
    gsap.from(".faq details", { scrollTrigger: { trigger: ".faq", start: "top 85%" }, y: 30, opacity: 0, stagger: .08, duration: .6, ease: "power2.out" });
    gsap.from(".cta-title", { scrollTrigger: { trigger: ".cta-sec", start: "top 75%" }, y: 60, opacity: 0, duration: .9, ease: "power3.out" });
  });

  // mobile or reduced motion: no pinning, simple fades
  mm.add("(max-width: 860px), (prefers-reduced-motion: reduce)", () => {
    $$(".sec-head, .sec-body, .faq, .cta-title").forEach((el) => {
      gsap.from(el, { scrollTrigger: { trigger: el, start: "top 90%" }, opacity: 0, y: reduced() ? 0 : 24, duration: .6, ease: "power2.out" });
    });
  });
  ScrollTrigger.refresh();
}

// ---------- "Trusted by N campaigns" (hidden until meaningful) ----------
async function liveCount() {
  try {
    const c = await readContract();
    if (!c) return;
    const [plans] = await c.stats();
    const n = Number(plans);
    if (n >= CONFIG.MIN_COUNT_TO_SHOW) {
      $("#ctaN").textContent = n.toLocaleString("en-US");
      $("#ctaCount").hidden = false;
    }
  } catch { /* stays hidden */ }
}

// keep pinned layouts right after fonts/images load
addEventListener("load", () => window.ScrollTrigger?.refresh());
export const _test = { isMobile };
