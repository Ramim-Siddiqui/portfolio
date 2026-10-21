// Page behaviour: light/dark mode, navigation, reading progress, side rail,
// reveal-on-scroll, live system status and the inline support-agent console.

const root = document.documentElement;
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Light / dark mode ---------- */
const modeBtn = $("#edition");
const modeLabel = $("#edition-label");
function paintModeLabel() {
  modeLabel.textContent = root.dataset.theme === "dark" ? "Light mode" : "Dark mode";
}
paintModeLabel();
modeBtn.addEventListener("click", () => {
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  try { localStorage.setItem("edition", next); } catch (e) { /* ignore */ }
  paintModeLabel();
  window.dispatchEvent(new CustomEvent("editionchange", { detail: next }));
});

/* ---------- Mobile menu ---------- */
const menuBtn = $("#menu");
const navLinks = $("#nav-links");
function closeMenu() {
  navLinks.classList.remove("open");
  menuBtn.setAttribute("aria-expanded", "false");
  menuBtn.textContent = "Menu";
}
menuBtn.addEventListener("click", () => {
  const open = navLinks.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.textContent = open ? "Close" : "Menu";
});
navLinks.addEventListener("click", (e) => { if (e.target.closest("a")) closeMenu(); });

/* ---------- Side rail (built from data-toc) ---------- */
const railTargets = $$("[data-toc]");
const rail = $("#toc");
const railList = document.createElement("ol");
railTargets.forEach((el) => {
  const li = document.createElement("li");
  const a = document.createElement("a");
  a.href = `#${el.id}`;
  const tick = document.createElement("span");
  tick.className = "tick";
  const label = document.createElement("span");
  label.className = "t-label";
  label.textContent = el.dataset.toc;
  a.append(tick, label);
  li.append(a);
  railList.append(li);
});
rail.append(railList);
const railLinks = $$("a", rail);
const navAnchors = $$(".nav-links a");
const NAV_FOR = { "work": "work", "voice-agent": "work", "support-agent": "work", "mcq-studio": "work", "attendance": "work", "portraitpass": "work", "gnn": "work", "form-filler": "work", "crawler": "work", "lab": "work", "enrollment": "work", "experience": "experience", "skills": "skills", "about": "about", "contact": "contact" };

/* ---------- Scroll: progress, nav state, active section ---------- */
const progress = $("#progress");
const nav = $("#nav");
let ticking = false;
function onScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  progress.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
  nav.classList.toggle("scrolled", scrollY > 40);

  const mid = innerHeight * 0.45;
  let current = null;
  for (const el of railTargets) {
    const r = el.getBoundingClientRect();
    if (r.top <= mid && r.bottom > mid) current = el.id;
  }
  railLinks.forEach((a) => a.classList.toggle("active", a.hash === `#${current}`));
  const top = NAV_FOR[current] || null;
  navAnchors.forEach((a) => a.classList.toggle("active", a.hash === `#${top}`));
  ticking = false;
}
addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
addEventListener("resize", onScroll);
onScroll();

/* ---------- Reveal on scroll ---------- */
if ("IntersectionObserver" in window && !reducedMotion) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  $$(".reveal").forEach((el) => io.observe(el));
} else {
  $$(".reveal").forEach((el) => el.classList.add("in"));
}

/* ---------- Live system status ---------- */
const rows = $$("#status-rows tr");
async function ping(url) {
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    // no-cors: we only need to know that the server answered, not what it said.
    await fetch(url, { mode: "no-cors", cache: "no-store", signal: ctrl.signal });
    return { ok: true, ms: Math.round(performance.now() - started) };
  } catch (e) {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}
function setStatus(row, cls, text, ms) {
  const st = $(".st", row);
  st.className = `st ${cls}`;
  st.textContent = text;
  $(".ms", row).textContent = ms;
}
async function checkAll() {
  await Promise.all(rows.map(async (row) => {
    setStatus(row, "wait", "Checking", "…");
    const slow = setTimeout(() => setStatus(row, "wait", "Waking up", "…"), 2500);
    const res = await ping(row.dataset.url);
    clearTimeout(slow);
    if (res.ok) setStatus(row, "ok", res.ms > 4000 ? "Online (was asleep)" : "Online", `${res.ms.toLocaleString()} ms`);
    else setStatus(row, "bad", "Unreachable", "—");
  }));
}
let statusChecked = false;
const statusTable = $(".status");
if ("IntersectionObserver" in window) {
  const so = new IntersectionObserver((entries) => {
    if (entries.some((en) => en.isIntersecting) && !statusChecked) { statusChecked = true; checkAll(); so.disconnect(); }
  }, { threshold: 0.2 });
  so.observe(statusTable);
} else { checkAll(); }
$("#recheck").addEventListener("click", checkAll);

/* ---------- Inline support-agent console ---------- */
const AGENT_API = "https://support-ticket-agent.vercel.app/api/resolve";
const NODE_INDEX = { classify: 0, retrieval: 1, draft: 2, review: 3, refine: 4, escalate: 5 };
const form = $("#console-form");
const subject = $("#c-subject");
const desc = $("#c-desc");
const runBtn = $("#c-run");
const out = $("#console-out");
const step = (node) => window.dispatchEvent(new CustomEvent("agentstep", { detail: { node } }));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

$$(".console-examples button").forEach((b) => b.addEventListener("click", () => {
  subject.value = b.dataset.s;
  desc.value = b.dataset.d;
  subject.focus();
}));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (subject.value.trim().length < 3 || desc.value.trim().length < 10) {
    out.innerHTML = "<p>Please give a subject (3+ characters) and a description (10+ characters).</p>";
    return;
  }
  runBtn.disabled = true;
  out.innerHTML = '<p class="thinking">The agent is classifying, retrieving, drafting and reviewing</p>';
  // While waiting, walk the figure through the first four graph nodes.
  let k = 0;
  const walker = setInterval(() => step(k++ % 4), 700);
  try {
    const res = await fetch(AGENT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: subject.value.trim(), description: desc.value.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    clearInterval(walker);
    if (!res.ok) {
      const msg = res.status === 429 ? "The demo limit for this hour has been reached. Please try again later." : (typeof data.detail === "string" ? data.detail : "The agent could not process that ticket.");
      out.innerHTML = `<p>${esc(msg)}</p>`;
      return;
    }
    out.innerHTML = '<ol class="trace" id="trace"></ol>';
    const trace = $("#trace");
    for (const h of data.history || []) {
      const [name, ...rest] = h.split(" -> ");
      const li = document.createElement("li");
      li.innerHTML = `<span><b>${esc(name)}</b> ${esc(rest.join(" -> "))}</span>`;
      trace.append(li);
      step(NODE_INDEX[name] ?? 0);
      await sleep(reducedMotion ? 0 : 60);
      li.classList.add("shown");
      await sleep(reducedMotion ? 0 : 420);
    }
    const resolved = data.outcome === "resolved";
    const verdict = document.createElement("p");
    verdict.className = "verdict";
    verdict.innerHTML = `<span class="tag ${resolved ? "ok" : "warn"}">${resolved ? "Resolved" : "Escalated"}</span><span class="muted">category ${esc(data.category)}, ${esc(data.seconds)} s on the server</span>`;
    out.append(verdict);
    if (resolved && data.reply) {
      const reply = document.createElement("blockquote");
      reply.className = "reply";
      reply.textContent = data.reply.replace(/\*\*/g, "");
      out.append(reply);
    } else {
      const p = document.createElement("p");
      p.textContent = `The draft failed review ${data.attempts} times, so the ticket was handed to a human.`;
      out.append(p);
    }
  } catch (err) {
    clearInterval(walker);
    out.innerHTML = 'Could not reach the agent from this page. <a href="https://support-ticket-agent.vercel.app/" target="_blank" rel="noopener">Open the full demo</a> instead.';
  } finally {
    runBtn.disabled = false;
  }
});

/* ---------- Footer year ---------- */
$("#year").textContent = String(new Date().getFullYear());
