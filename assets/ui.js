// Small shared UI helpers: escaping, toast, modal, confetti, navigation.
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const isMobile = () => matchMedia("(max-width: 860px)").matches;

let toastT;
export function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), ms);
}

let lastFocus = null;
export function modal(html) {
  const m = $("#modal");
  lastFocus = document.activeElement;
  $("#modalBody").innerHTML = html;
  m.hidden = false;
  setTimeout(() => ($("#modalBody [autofocus]") || $(".modal-x", m)).focus(), 20);
  return m;
}
export function closeModal() {
  $("#modal").hidden = true;
  lastFocus?.focus?.();
}
export function confirmBox(title, text, okLabel = "OK") {
  return new Promise((resolve) => {
    modal(`<h3>${esc(title)}</h3><p>${esc(text)}</p><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px"><button class="btn ghost" data-r="0">Cancel</button><button class="btn primary" data-r="1" autofocus>${esc(okLabel)}</button></div>`);
    const body = $("#modalBody");
    const done = (v) => { closeModal(); body.removeEventListener("click", on); resolve(v); };
    const on = (e) => { const b = e.target.closest("[data-r]"); if (b) done(b.dataset.r === "1"); };
    body.addEventListener("click", on);
  });
}
export function initModal() {
  const m = $("#modal");
  m.addEventListener("click", (e) => { if (e.target === m || e.target.closest(".modal-x")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !m.hidden) closeModal(); });
}

// blue / yellow / green confetti
export function confetti(x = innerWidth / 2, y = innerHeight / 2) {
  if (reduced()) return;
  const c = $("#confetti");
  const ctx = c.getContext("2d");
  const dpr = devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const colors = ["#2D8CFF", "#FDD03D", "#2ABD86", "#0E2A4D", "#FCD1D3"];
  const parts = Array.from({ length: 90 }, () => ({
    x, y, vx: (Math.random() - .5) * 12, vy: -Math.random() * 12 - 4, r: Math.random() * 6 + 4,
    rot: Math.random() * 6, vr: (Math.random() - .5) * .4, c: colors[(Math.random() * colors.length) | 0], life: 0,
  }));
  let raf;
  const step = () => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    let alive = 0;
    for (const p of parts) {
      p.life++; p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (p.y < innerHeight + 20 && p.life < 160) alive++;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.max(0, 1 - p.life / 160);
      ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
    }
    if (alive) raf = requestAnimationFrame(step); else ctx.clearRect(0, 0, innerWidth, innerHeight);
  };
  cancelAnimationFrame(raf);
  step();
}

export function download(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function loadScript(src) {
  return new Promise((res, rej) => {
    if ([...document.scripts].some((s) => s.src === src)) return res();
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = () => rej(new Error("load_failed"));
    document.head.appendChild(s);
  });
}

// router hook set by main.js
export const nav = { go: (url) => { location.href = url; } };
