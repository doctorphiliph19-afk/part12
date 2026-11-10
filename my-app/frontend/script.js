/* ============================================================
   Kakuma Creative Zone — Frontend (Elite NGO)
   - Pure vanilla JS, no build step
   - Wires hero/stats/people/events/jobs/contact/newsletter to /api
   ============================================================ */

/* Keep this a regular website (no PWA). Clear any prior SW/caches. */
(async () => {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch (_) { /* ignore */ }
})();

const API = "/api";

/* ---------- Tiny helpers ---------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
const initials = (name = "") =>
  name.trim().split(/\s+/).slice(0,2).map(w => w[0] || "").join("").toUpperCase() || "?";

async function getJSON(path) {
  const r = await fetch(API + path, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

/* ---------- Session / auth ---------- */
const SESSION_KEY = "kcz-session";

function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.token && s.user ? s : null;
  } catch { return null; }
}
function setSession(token, user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user }));
  renderAuthUI();
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  renderAuthUI();
}
async function refreshSession() {
  const s = getSession();
  if (!s) return null;
  try {
    const r = await fetch(API + "/auth/me", {
      headers: { Authorization: `Bearer ${s.token}`, Accept: "application/json" }
    });
    if (r.status === 401) { clearSession(); return null; }
    if (!r.ok) return s;
    const data = await r.json();
    if (data?.user) setSession(s.token, data.user);
    return getSession();
  } catch { return s; }
}

function renderAuthUI() {
  const cta = document.querySelector(".header-cta");
  if (!cta) return;
  const session = getSession();
  const joinBtn = cta.querySelector("[data-open-join]");
  const existingPill = cta.querySelector(".user-pill");

  if (session) {
    if (joinBtn) joinBtn.hidden = true;
    if (!existingPill) {
      const pill = document.createElement("div");
      pill.className = "user-pill";
      pill.innerHTML = `
        <button type="button" class="user-pill-trigger" aria-haspopup="true" aria-expanded="false">
          <span class="user-pill-avatar" aria-hidden="true">${esc(initials(session.user.name))}</span>
          <span class="user-pill-name">${esc(session.user.name || "Member")}</span>
          ${session.user.isAdmin ? `<span class="user-pill-badge" title="Admin">🛡️</span>` : ""}
          <span class="user-pill-caret" aria-hidden="true">▾</span>
        </button>
        <div class="user-pill-menu" hidden role="menu">
          <p class="user-pill-meta">
            Signed in as<br>
            <strong>${esc(session.user.email || session.user.name || "")}</strong>
          </p>
          ${session.user.isAdmin ? `<button type="button" class="user-pill-admin" role="menuitem">🛡️ Open admin dashboard</button>` : ""}
          <button type="button" class="user-pill-logout" role="menuitem">Log out</button>
        </div>`;
      const trigger = pill.querySelector(".user-pill-trigger");
      const menu = pill.querySelector(".user-pill-menu");
      const closeMenu = () => { menu.hidden = true; trigger.setAttribute("aria-expanded", "false"); };
      const openMenu  = () => { menu.hidden = false; trigger.setAttribute("aria-expanded", "true"); };
      trigger.addEventListener("click", e => {
        e.stopPropagation();
        menu.hidden ? openMenu() : closeMenu();
      });
      document.addEventListener("click", e => {
        if (!pill.contains(e.target)) closeMenu();
      });
      document.addEventListener("keydown", e => {
        if (e.key === "Escape") closeMenu();
      });
      pill.querySelector(".user-pill-logout").addEventListener("click", () => {
        closeMenu();
        clearSession();
        toast(`You've been logged out. See you soon, ${session.user.name.split(" ")[0]}!`);
      });
      const adminBtn = pill.querySelector(".user-pill-admin");
      if (adminBtn) adminBtn.addEventListener("click", () => { closeMenu(); openAdminDashboard(); });
      const toggleBtn = cta.querySelector(".nav-toggle");
      cta.insertBefore(pill, toggleBtn || null);
    }
  } else {
    if (joinBtn) joinBtn.hidden = false;
    if (existingPill) existingPill.remove();
  }

  const navAdmin = document.getElementById("navAdminLink");
  if (navAdmin) {
    const isAdmin = !!(session && session.user && session.user.isAdmin);
    navAdmin.hidden = !isAdmin;
    if (isAdmin && !navAdmin.dataset.bound) {
      navAdmin.dataset.bound = "1";
      navAdmin.addEventListener("click", (e) => {
        e.preventDefault();
        openAdminDashboard();
      });
    }
  }
}

function toast(msg) {
  let t = document.querySelector(".kcz-toast");
  if (t) t.remove();
  t = document.createElement("div");
  t.className = "kcz-toast";
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("is-open"));
  setTimeout(() => {
    t.classList.remove("is-open");
    setTimeout(() => t.remove(), 350);
  }, 3200);
}

const GRADIENTS = [
  "linear-gradient(135deg,#c8202b,#e95d4d)",
  "linear-gradient(135deg,#0d2545,#13335f)",
  "linear-gradient(135deg,#f5b921,#f4a522)",
  "linear-gradient(135deg,#2c5d3f,#3e8b5d)",
  "linear-gradient(135deg,#5d2d7a,#8e44ad)",
  "linear-gradient(135deg,#1f6f8b,#2596be)",
  "linear-gradient(135deg,#a4161a,#d62828)",
  "linear-gradient(135deg,#264653,#2a9d8f)"
];
const pickGradient = (seed = 0) => GRADIENTS[Math.abs(seed) % GRADIENTS.length];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/* ---------- Scroll progress + sticky header ---------- */
function initScrollChrome() {
  const bar    = $("#scrollProgress");
  const header = $("#siteHeader");
  const update = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
    if (bar) bar.style.width = pct + "%";
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 24);
  };
  window.addEventListener("scroll", update, { passive: true });
  update();
}

/* ---------- Mobile nav ---------- */
function initMobileNav() {
  const toggle = $("#navToggle");
  const nav    = $("#mainNav");
  if (!toggle || !nav) return;

  let backdrop = $(".nav-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "nav-backdrop";
    document.body.appendChild(backdrop);
  }

  const close = () => {
    nav.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  };
  const open = () => {
    nav.classList.add("is-open");
    backdrop.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  };

  toggle.addEventListener("click", () => {
    nav.classList.contains("is-open") ? close() : open();
  });
  backdrop.addEventListener("click", close);
  nav.addEventListener("click", e => {
    if (e.target.tagName === "A") close();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) close();
  });
}

/* ---------- Active-link highlight via IntersectionObserver ---------- */
function initScrollSpy() {
  const links = $$("#mainNav a[href^='#']");
  if (!links.length) return;
  const map = new Map();
  links.forEach(a => {
    const id = a.getAttribute("href").slice(1);
    const sec = id && document.getElementById(id);
    if (sec) map.set(sec, a);
  });
  if (!map.size) return;

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const link = map.get(e.target);
      if (!link) return;
      if (e.isIntersecting && e.intersectionRatio > 0.25) {
        links.forEach(l => l.classList.remove("is-active"));
        link.classList.add("is-active");
      }
    });
  }, { rootMargin: "-40% 0px -50% 0px", threshold: [0, 0.25, 0.6] });

  map.forEach((_l, sec) => io.observe(sec));
}

/* ---------- Reveal-on-scroll ---------- */
function initReveals() {
  const items = $$(".reveal, .reveal-stagger");
  if (!items.length || !("IntersectionObserver" in window)) {
    items.forEach(el => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  items.forEach(el => io.observe(el));
}

/* ---------- Animated counters ---------- */
function animateNumber(el, target, dur = 1400) {
  const start = performance.now();
  const from  = 0;
  const ease  = t => 1 - Math.pow(1 - t, 3);
  function step(now) {
    const p = Math.min(1, (now - start) / dur);
    const val = Math.round(from + (target - from) * ease(p));
    el.textContent = val.toLocaleString();
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = target.toLocaleString();
  }
  requestAnimationFrame(step);
}

async function loadStats() {
  const targets = $$("[data-stat]");
  if (!targets.length) return;
  let data;
  try { data = await getJSON("/stats"); }
  catch { targets.forEach(t => t.textContent = "—"); return; }

  const trigger = () => targets.forEach(t => {
    const key = t.dataset.stat;
    const v = Number(data[key] ?? 0);
    animateNumber(t, v);
  });

  // Mirror selected numbers into the Join card
  const jc = $("#joinCountCreators"); if (jc) jc.textContent = (data.creators ?? "—");
  const jz = $("#joinCountZones");    if (jz) jz.textContent = (data.zones    ?? "—");

  // Live-state pills (events + volunteers)
  const le = $("#liveEventCount");     if (le) animateNumber(le, Number(data.events     ?? 0));
  const lv = $("#liveVolunteerCount"); if (lv) animateNumber(lv, Number(data.volunteers ?? 0));
  const lp = $("#livePartnerCount");   if (lp) animateNumber(lp, $$(".partner-logo").length);

  const strip = $(".impact-strip") || targets[0]?.closest("section");
  if (!strip || !("IntersectionObserver" in window)) { trigger(); return; }

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { trigger(); io.disconnect(); }
    });
  }, { threshold: 0.3 });
  io.observe(strip);
}

/* ---------- People (creators) ---------- */
function personCard(c, i) {
  const grad = pickGradient(c.id || i);
  const storyParas = (c.story || c.bio || "")
    .split(/\n{2,}|\\n\\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(p => `<p>${esc(p)}</p>`)
    .join("");
  const tagline = c.tagline ? `<p class="person-tagline">${esc(c.tagline)}</p>` : "";
  const quote = c.quote ? `<blockquote class="person-quote">${esc(c.quote)}</blockquote>` : "";
  return `
    <article class="person-card reveal">
      <div class="person-photo" style="background:${grad}">
        <span class="person-cat">${esc(c.category || "Artist")}</span>
        ${esc(initials(c.name))}
      </div>
      <div class="person-body">
        <h3>${esc(c.name || "Unknown")}</h3>
        ${tagline}
        <p class="person-loc">📍 ${esc(c.location || "Kakuma")}</p>
        <div class="person-story">${storyParas}</div>
        ${quote}
        <div class="tag-row">
          ${(c.tags || []).slice(0, 4).map(t => `<span class="tag">${esc(t)}</span>`).join("")}
        </div>
      </div>
    </article>`;
}

async function loadPeople() {
  const grid = $("#peopleGrid");
  if (!grid) return;
  try {
    const data = await getJSON("/creators");
    const list = (data.results || []).slice(0, 6);
    if (!list.length) {
      grid.innerHTML = `<p class="muted">No creators yet. Be the first to join.</p>`;
      return;
    }
    grid.innerHTML = list.map(personCard).join("");
    initReveals();
  } catch {
    grid.innerHTML = `<p class="muted">Couldn't load stories right now.</p>`;
  }
}

/* ---------- Events ---------- */
function eventCard(e) {
  let day = "—", mon = "TBA", yr = "";
  if (e.eventDate) {
    const d = new Date(e.eventDate);
    if (!isNaN(d)) {
      day = String(d.getDate()).padStart(2, "0");
      mon = MONTHS[d.getMonth()];
      yr  = String(d.getFullYear());
    }
  }
  return `
    <article class="event-card reveal">
      <div class="event-date">
        <strong class="event-day">${day}</strong>
        <span class="event-mon">${mon}</span>
        <span class="event-yr">${yr}</span>
      </div>
      <div class="event-body">
        <h3>${esc(e.title || "Event")}</h3>
        <p class="event-meta">
          <span>${esc(e.category || "Event")}</span>
          <span>${esc(e.location || "Kakuma")}</span>
        </p>
        <p class="event-desc">${esc(e.description || "")}</p>
      </div>
      <div class="event-cta"><a class="btn btn-ghost" href="#contact">RSVP</a></div>
    </article>`;
}

async function loadEvents() {
  const list = $("#eventList");
  if (!list) return;
  try {
    const data = await getJSON("/events");
    const arr = (data.results || []).slice(0, 5);
    if (!arr.length) { list.innerHTML = `<p class="muted">No upcoming events.</p>`; return; }
    list.innerHTML = arr.map(eventCard).join("");
    initReveals();
  } catch {
    list.innerHTML = `<p class="muted">Couldn't load events.</p>`;
  }
}

/* ---------- Opportunities (jobs) ---------- */
function jobCard(j) {
  const pay = j.pay ? `KSh ${Number(j.pay).toLocaleString()}` : "Stipend";
  return `
    <article class="job-card reveal">
      <div class="job-head">
        <div>
          <span class="job-cat">${esc(j.category || "Opportunity")}</span>
          <h3 class="job-title">${esc(j.title || "Open role")}</h3>
        </div>
        <span class="job-pay">${esc(pay)}</span>
      </div>
      <p class="job-meta">
        <span>📍 ${esc(j.location || "Kakuma")}</span>
        ${j.eventDate ? `<span>🗓 ${esc(j.eventDate)}</span>` : ""}
      </p>
      <p class="job-desc">${esc(j.description || "")}</p>
      <div class="job-foot">
        <span class="job-applicants">${j.applicationCount || 0} applicant${j.applicationCount === 1 ? "" : "s"}</span>
        <a class="btn btn-ghost" href="#contact">Apply</a>
      </div>
    </article>`;
}

async function loadJobs() {
  const list = $("#jobList");
  if (!list) return;
  try {
    const data = await getJSON("/jobs");
    const arr = (data.results || []).slice(0, 6);
    if (!arr.length) { list.innerHTML = `<p class="muted">No open opportunities right now.</p>`; return; }
    list.innerHTML = arr.map(jobCard).join("");
    initReveals();
  } catch {
    list.innerHTML = `<p class="muted">Couldn't load opportunities.</p>`;
  }
}

/* ---------- Forms ---------- */
function showFeedback(el, msg, ok = true) {
  if (!el) return;
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle("is-ok", ok);
  el.classList.toggle("is-err", !ok);
  if (ok) setTimeout(() => { el.hidden = true; }, 4500);
}

async function postContact(payload) {
  const r = await fetch(API + "/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Could not send");
  return data;
}

function initContactForm() {
  const form = $("#contactForm");
  const fb   = $("#contactFeedback");
  if (!form) return;
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const email = form.email.value.trim();
    const message = form.message.value.trim();
    if (!email || !message) { showFeedback(fb, "Please fill in both fields.", false); return; }
    const btn = form.querySelector("button[type=submit]");
    const prev = btn.textContent;
    btn.disabled = true; btn.textContent = "Sending…";
    try {
      await postContact({ email, message });
      showFeedback(fb, "Thanks — we'll be in touch shortly.");
      form.reset();
    } catch (err) {
      showFeedback(fb, err.message || "Could not send.", false);
    } finally {
      btn.disabled = false; btn.textContent = prev;
    }
  });
}

function initNewsletterForm() {
  const form = $("#newsletterForm");
  const fb   = $("#newsletterFeedback");
  if (!form) return;
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const email = form.email.value.trim();
    if (!email) { showFeedback(fb, "Email required.", false); return; }
    const btn = form.querySelector("button[type=submit]");
    const prev = btn.textContent;
    btn.disabled = true; btn.textContent = "…";
    try {
      await postContact({ email, message: "Newsletter signup" });
      showFeedback(fb, "Subscribed. Thank you.");
      form.reset();
    } catch (err) {
      showFeedback(fb, err.message || "Could not subscribe.", false);
    } finally {
      btn.disabled = false; btn.textContent = prev;
    }
  });
}

/* ---------- Misc: current year ---------- */
function initYear() {
  const el = $("#currentYear");
  if (el) el.textContent = new Date().getFullYear();
}

/* ---------- Join / signup modal ---------- */
function openJoinModal() {
  const modal = $("#joinModal");
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  const focusables = $$('input,select,textarea,button', modal);
  setTimeout(() => focusables.find(f => !f.disabled)?.focus(), 60);
  document.addEventListener("keydown", joinKeyHandler);
}
function closeJoinModal() {
  const modal = $("#joinModal");
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  document.removeEventListener("keydown", joinKeyHandler);
}
function joinKeyHandler(e) {
  if (e.key === "Escape") closeJoinModal();
  if (e.key === "Tab") {
    const modal = $("#joinModal");
    if (!modal || modal.hidden) return;
    const focusables = $$('input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])', modal);
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

async function submitJoin(form, fb) {
  const fd = new FormData(form);
  const name     = String(fd.get("name")    || "").trim();
  const email    = String(fd.get("email")   || "").trim();
  const password = String(fd.get("password") || "");
  const confirm  = String(fd.get("confirmPassword") || "");
  const category = String(fd.get("category") || "").trim();
  const location = String(fd.get("location") || "").trim();
  const bio      = String(fd.get("bio")      || "").trim();
  const tagsRaw  = String(fd.get("tags")     || "");
  const consent  = fd.get("consent");

  const languages = fd.getAll("languages").map(String);
  const otherLang = String(fd.get("languagesOther") || "").trim();
  if (otherLang) languages.push(otherLang);
  const langTags = languages.map(l => `Lang: ${l}`).join(", ");
  const mergedTags = [tagsRaw.trim(), langTags].filter(Boolean).join(", ");

  if (!name || name.length < 2) return showFeedback(fb, "Please enter your full name.", false);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showFeedback(fb, "Please enter a valid email.", false);
  if (password.length < 6) return showFeedback(fb, "Password must be at least 6 characters.", false);
  if (password !== confirm) return showFeedback(fb, "Passwords don't match.", false);
  if (!category) return showFeedback(fb, "Pick a creative discipline.", false);
  if (!languages.length) return showFeedback(fb, "Pick at least one language you speak.", false);
  if (!consent) return showFeedback(fb, "Please confirm the consent box to continue.", false);

  // 1. signup
  const signupRes = await fetch(API + "/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ name, email, password, role: category.replace(/s$/, "") })
  });
  const signupData = await signupRes.json().catch(() => ({}));
  if (!signupRes.ok) throw new Error(signupData.error || "Could not create account");

  // 2. creator profile (auth required)
  const profileRes = await fetch(API + "/creators", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${signupData.token}`
    },
    body: JSON.stringify({ category, location, bio, tags: mergedTags, languages })
  });
  if (!profileRes.ok) {
    const e = await profileRes.json().catch(() => ({}));
    throw new Error(e.error || "Account created but profile failed");
  }
  return signupData;
}

function initJoinModal() {
  const form = $("#joinForm");
  const fb   = $("#joinFeedback");
  if (!form) return;

  $$("[data-open-join]").forEach(el =>
    el.addEventListener("click", e => { e.preventDefault(); openJoinModal(); }));
  $$("[data-close-join]").forEach(el =>
    el.addEventListener("click", e => { e.preventDefault(); closeJoinModal(); }));

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    const prev = btn.textContent;
    btn.disabled = true; btn.textContent = "Creating…";
    try {
      const data = await submitJoin(form, fb);
      if (!data) { btn.disabled = false; btn.textContent = prev; return; }
      setSession(data.token, data.user);
      showFeedback(fb, `Welcome, ${data.user.name}! Your profile is live.`);
      form.reset();
      // Refresh the public people grid + stats
      loadPeople();
      loadStats();
      const joinedName = data.user.name;
      const joinedRole = data.user.role || "creator";
      setTimeout(() => {
        closeJoinModal();
        showJoinCelebration(joinedName, joinedRole);
      }, 1200);
    } catch (err) {
      showFeedback(fb, err.message || "Could not sign up.", false);
    } finally {
      btn.disabled = false; btn.textContent = prev;
    }
  });
}

/* ---------- Join celebration ---------- */
function showJoinCelebration(name, role) {
  document.querySelectorAll(".join-celebration").forEach(n => n.remove());

  const safeName = String(name || "Friend");
  const safeRole = String(role || "creator");

  const overlay = document.createElement("div");
  overlay.className = "join-celebration";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.innerHTML = `
    <div class="join-celebration-card">
      <div class="join-celebration-emoji" aria-hidden="true">🎉</div>
      <h3>${esc(safeName)} has joined!</h3>
      <p class="join-celebration-sub">Welcome to <strong>Kakuma Creative Zone</strong> as a <strong>${esc(safeRole)}</strong>.</p>
      <p class="join-celebration-tag">Your voice is now part of ours. ✨</p>
      <div class="join-celebration-confetti" aria-hidden="true">
        <span>🎊</span><span>🎈</span><span>🌟</span><span>🎶</span>
        <span>🎤</span><span>🎨</span><span>📸</span><span>🥳</span>
      </div>
      <button type="button" class="btn btn-primary join-celebration-close">See the community</button>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("is-open"));

  const dismiss = () => {
    overlay.classList.remove("is-open");
    setTimeout(() => overlay.remove(), 400);
    const stories = document.getElementById("stories");
    if (stories) stories.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  overlay.querySelector(".join-celebration-close").addEventListener("click", dismiss);
  overlay.addEventListener("click", e => { if (e.target === overlay) dismiss(); });
  setTimeout(dismiss, 5200);
}

/* ---------- Sign-in (existing members) ---------- */
function setModalMode(mode) {
  const modal = $("#joinModal");
  if (!modal) return;
  const join   = $("#joinForm", modal);
  const signin = $("#signinForm", modal);
  const title  = $("#joinModalTitle", modal);
  const eyebrow = $(".modal-head .eyebrow", modal);
  if (mode === "signin") {
    if (join)   join.hidden = true;
    if (signin) signin.hidden = false;
    if (title)   title.textContent = "Welcome back";
    if (eyebrow) eyebrow.textContent = "Sign in";
  } else {
    if (join)   join.hidden = false;
    if (signin) signin.hidden = true;
    if (title)   title.textContent = "Create your participant profile";
    if (eyebrow) eyebrow.textContent = "Join the Zone";
  }
}

function initSigninForm() {
  const modal = $("#joinModal");
  if (!modal) return;
  $$("[data-modal-mode]", modal).forEach(el =>
    el.addEventListener("click", e => {
      e.preventDefault();
      setModalMode(el.getAttribute("data-modal-mode"));
    }));

  const form = $("#signinForm", modal);
  if (!form) return;
  const fb = $("#signinFeedback", modal);
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    const prev = btn.textContent;
    btn.disabled = true; btn.textContent = "Signing in…";
    try {
      const fd = new FormData(form);
      const email = String(fd.get("email") || "").trim();
      const password = String(fd.get("password") || "");
      if (!email || !password) { showFeedback(fb, "Email and password required.", false); return; }
      const r = await fetch(API + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Sign in failed");
      setSession(data.token, data.user);
      showFeedback(fb, `Welcome back, ${data.user.name}!`);
      form.reset();
      setTimeout(() => { closeJoinModal(); setModalMode("join"); }, 900);
    } catch (err) {
      showFeedback(fb, err.message || "Could not sign in.", false);
    } finally {
      btn.disabled = false; btn.textContent = prev;
    }
  });
}

/* ---------- Donate modal ---------- */
function openDonateModal() {
  const m = $("#donateModal");
  if (!m) return;
  m.hidden = false;
  document.body.classList.add("modal-open");
  setTimeout(() => $("input[name=email]", m)?.focus(), 50);
}
function closeDonateModal() {
  const m = $("#donateModal");
  if (!m) return;
  m.hidden = true;
  document.body.classList.remove("modal-open");
}
function initDonateModal() {
  const modal = $("#donateModal");
  if (!modal) return;
  const form = $("#donateForm", modal);
  const fb = $("#donateFeedback", modal);

  $$("[data-open-donate]").forEach(el =>
    el.addEventListener("click", e => { e.preventDefault(); openDonateModal(); }));
  $$("[data-close-donate]", document).forEach(el =>
    el.addEventListener("click", e => { e.preventDefault(); closeDonateModal(); }));
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !modal.hidden) closeDonateModal();
  });

  const presets = $$("input[name=presetAmount]", form);
  const custom = form.querySelector("input[name=amount]");
  presets.forEach(r => r.addEventListener("change", () => { if (r.checked) custom.value = ""; }));
  custom.addEventListener("input", () => { presets.forEach(r => r.checked = false); });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    const prev = btn.textContent;
    btn.disabled = true; btn.textContent = "Sending…";
    try {
      const fd = new FormData(form);
      const email = String(fd.get("email") || "").trim();
      const customAmt = String(fd.get("amount") || "").trim();
      const presetAmt = String(fd.get("presetAmount") || "").trim();
      const amount = Number(customAmt || presetAmt);
      if (!email) { showFeedback(fb, "Email is required.", false); return; }
      if (!Number.isFinite(amount) || amount <= 0) { showFeedback(fb, "Please choose or enter a valid amount.", false); return; }

      const r = await fetch(API + "/donations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: String(fd.get("name") || "").trim(),
          email,
          amount,
          currency: String(fd.get("currency") || "USD"),
          message: String(fd.get("message") || "").trim(),
          anonymous: !!fd.get("anonymous")
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Donation failed");

      showFeedback(fb, `💛 Thank you! Your ${fd.get("currency") || "USD"} ${amount} gift has been recorded.`);
      form.reset();
      const def = form.querySelector('input[name=presetAmount][value="25"]');
      if (def) def.checked = true;
      setTimeout(closeDonateModal, 1600);
      loadStats();
    } catch (err) {
      showFeedback(fb, err.message || "Could not record donation.", false);
    } finally {
      btn.disabled = false; btn.textContent = prev;
    }
  });
}

/* ---------- Admin dashboard ---------- */
let adminCache = { messages: [], donations: [], jobs: [], events: [], posts: [], people: [], creators: [], comments: [] };

function openAdminDashboard() {
  const m = $("#adminModal");
  if (!m) return;
  m.hidden = false;
  document.body.classList.add("modal-open");
  loadAdminData();
}
function closeAdminDashboard() {
  const m = $("#adminModal");
  if (!m) return;
  m.hidden = true;
  document.body.classList.remove("modal-open");
}
async function adminFetch(path) {
  const s = getSession();
  if (!s) throw new Error("Not signed in");
  const r = await fetch(API + path, {
    headers: { Authorization: `Bearer ${s.token}`, Accept: "application/json" }
  });
  if (r.status === 401 || r.status === 403) throw new Error("Admin access required");
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}
async function adminAction(method, path, body) {
  const s = getSession();
  if (!s) throw new Error("Not signed in");
  const opts = {
    method,
    headers: { Authorization: `Bearer ${s.token}`, Accept: "application/json" }
  };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(API + path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `${method} ${path} → ${r.status}`);
  return data;
}
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
function fmtMoney(amount, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}

/* ---------- Admin detail dialog ---------- */
function openAdminDetail(title, html) {
  const detail = $("#adminDetail");
  if (!detail) return;
  $("#adminDetailTitle").textContent = title;
  $("#adminDetailBody").innerHTML = html;
  detail.hidden = false;
  setTimeout(() => detail.querySelector("textarea, button, input")?.focus(), 50);
}
function closeAdminDetail() {
  const detail = $("#adminDetail");
  if (detail) detail.hidden = true;
}
function detailRow(label, value) {
  if (value === undefined || value === null || value === "") return "";
  return `<div class="ad-row"><span class="ad-label">${esc(label)}</span><span class="ad-value">${value}</span></div>`;
}
function detailRowText(label, text) {
  return detailRow(label, esc(text));
}
function detailBlock(label, text) {
  if (!text) return "";
  return `<div class="ad-block"><span class="ad-label">${esc(label)}</span><p>${esc(text).replace(/\n/g, "<br>")}</p></div>`;
}

function viewMessageDetail(id) {
  const m = adminCache.messages.find(x => x.id === Number(id));
  if (!m) return toast("Message not found");
  const replies = Array.isArray(m.replies) ? m.replies : [];
  const repliesHtml = replies.length ? `
    <div class="ad-thread">
      <h4>Replies (${replies.length})</h4>
      ${replies.map(r => `
        <div class="ad-thread-item">
          <div class="ad-thread-meta"><strong>${esc(r.by || "Admin")}</strong> · ${esc(fmtDate(r.at))}</div>
          <p>${esc(r.body || "").replace(/\n/g, "<br>")}</p>
        </div>`).join("")}
    </div>` : "";
  const subject = encodeURIComponent("Re: your message to Kakuma Creative Zone");
  const body = encodeURIComponent(`Hi,\n\nThanks for getting in touch with Kakuma Creative Zone.\n\nYour message:\n"${(m.message || "").trim()}"\n\n— KCZ Team`);
  const mailto = `mailto:${encodeURIComponent(m.email || "")}?subject=${subject}&body=${body}`;
  const html = `
    ${detailRow("From", `<a href="mailto:${esc(m.email || "")}">${esc(m.email || "—")}</a>`)}
    ${detailRowText("Received", fmtDate(m.createdAt))}
    ${detailBlock("Original message", m.message || "(empty)")}
    ${repliesHtml}
    <form class="ad-reply" id="adminReplyForm" data-id="${m.id}">
      <h4>Send a reply</h4>
      <textarea name="body" rows="5" placeholder="Type your reply to ${esc(m.email || "the sender")}…" required></textarea>
      <p class="muted small">Saved on the platform <em>and</em> opens your email client to actually send it.</p>
      <div class="ad-reply-actions">
        <a class="btn btn-ghost" href="${mailto}" target="_blank" rel="noopener">📧 Open in email app</a>
        <button type="submit" class="btn btn-primary">Save &amp; send reply</button>
      </div>
      <p class="form-feedback" id="adminReplyFeedback" hidden></p>
    </form>`;
  openAdminDetail(`Message from ${m.email || "—"}`, html);

  const form = $("#adminReplyForm");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const fb = $("#adminReplyFeedback");
    const btn = form.querySelector("button[type=submit]");
    const body = form.body.value.trim();
    if (!body) return showFeedback(fb, "Reply can't be empty.", false);
    const prev = btn.textContent;
    btn.disabled = true; btn.textContent = "Sending…";
    try {
      await adminAction("POST", `/admin/messages/${id}/reply`, { body });
      showFeedback(fb, "Reply saved. Opening your email app…");
      // Open the mailto with the actual reply body filled in
      const finalMailto = `mailto:${encodeURIComponent(m.email || "")}?subject=${subject}&body=${encodeURIComponent(body)}`;
      window.open(finalMailto, "_blank");
      toast("Reply saved.");
      await loadAdminData();
      // Refresh dialog with the new reply visible
      setTimeout(() => viewMessageDetail(id), 400);
    } catch (err) {
      showFeedback(fb, err.message || "Could not save reply.", false);
    } finally {
      btn.disabled = false; btn.textContent = prev;
    }
  });
}

function viewDonationDetail(id) {
  const d = adminCache.donations.find(x => x.id === Number(id));
  if (!d) return toast("Donation not found");
  const subject = encodeURIComponent("Thank you for your donation to Kakuma Creative Zone");
  const body = encodeURIComponent(`Hi ${d.name || ""},\n\nThank you so much for your generous gift of ${fmtMoney(d.amount, d.currency)}. Your support directly funds workshops, instruments and stipends for our refugee and host-community creatives.\n\nWith gratitude,\n— KCZ Team`);
  const mailto = `mailto:${encodeURIComponent(d.email || "")}?subject=${subject}&body=${body}`;
  const html = `
    ${detailRowText("Donor", d.anonymous ? "(Anonymous)" : (d.name || "—"))}
    ${detailRow("Email", `<a href="mailto:${esc(d.email || "")}">${esc(d.email || "—")}</a>`)}
    ${detailRowText("Amount", fmtMoney(d.amount, d.currency))}
    ${detailRowText("Currency", d.currency)}
    ${detailRowText("Anonymous", d.anonymous ? "Yes" : "No")}
    ${detailRowText("Received", fmtDate(d.createdAt))}
    ${detailBlock("Donor message", d.message || "(none)")}
    <div class="ad-reply-actions">
      <a class="btn btn-primary" href="${mailto}" target="_blank" rel="noopener">📧 Send a thank-you email</a>
    </div>`;
  openAdminDetail(`Donation #${d.id}`, html);
}

function viewJobDetail(id) {
  const j = adminCache.jobs.find(x => x.id === Number(id));
  if (!j) return toast("Job not found");
  const html = `
    ${detailRowText("Title", j.title)}
    ${detailRowText("Organisation", j.organisation || j.org)}
    ${detailRowText("Type", j.category || j.type)}
    ${detailRowText("Location", j.location)}
    ${detailRowText("Status", j.open === false ? "Closed" : "Open")}
    ${detailRowText("Pay / Stipend", j.pay || j.stipend)}
    ${detailRowText("Deadline", j.deadline)}
    ${detailRowText("Posted", fmtDate(j.createdAt))}
    ${detailBlock("Description", j.description || j.body || "")}
    ${detailBlock("Requirements", Array.isArray(j.requirements) ? j.requirements.join("\n• ") : j.requirements)}
    ${detailBlock("How to apply", j.howToApply || j.apply)}`;
  openAdminDetail(j.title || "Opportunity", html);
}

function viewEventDetail(id) {
  const ev = adminCache.events.find(x => x.id === Number(id));
  if (!ev) return toast("Event not found");
  const html = `
    ${detailRowText("Title", ev.title)}
    ${detailRowText("Date", fmtDate(ev.eventDate || ev.createdAt))}
    ${detailRowText("Location", ev.location)}
    ${detailRowText("Category", ev.category)}
    ${detailRowText("Created", fmtDate(ev.createdAt))}
    ${detailBlock("Description", ev.description || ev.body || "")}`;
  openAdminDetail(ev.title || "Event", html);
}

function viewPostDetail(id) {
  const p = adminCache.posts.find(x => x.id === Number(id));
  if (!p) return toast("Post not found");
  const html = `
    ${detailRowText("Author", p.authorName)}
    ${detailRow("Email", `<a href="mailto:${esc(p.authorEmail || "")}">${esc(p.authorEmail || "—")}</a>`)}
    ${detailRowText("Posted", fmtDate(p.createdAt))}
    ${p.imageUrl ? `<div class="ad-block"><span class="ad-label">Image</span><img src="${esc(p.imageUrl)}" alt="" class="ad-image"></div>` : ""}
    ${detailBlock("Content", p.content || p.body || "")}`;
  openAdminDetail(`Post by ${p.authorName || "—"}`, html);
}

/* ---------- Admin: edit / create forms ---------- */
function adminFormFields(fields, values = {}) {
  return fields.map(f => {
    const v = values[f.name];
    const val = v === undefined || v === null ? "" : v;
    if (f.type === "textarea") {
      return `<label class="ad-field"><span>${esc(f.label)}</span>
        <textarea name="${esc(f.name)}" rows="${f.rows || 4}"${f.required ? " required" : ""} placeholder="${esc(f.placeholder || "")}">${esc(String(val))}</textarea>
      </label>`;
    }
    if (f.type === "select") {
      const opts = (f.options || []).map(o => {
        const ov = typeof o === "string" ? o : o.value;
        const ol = typeof o === "string" ? o : o.label;
        return `<option value="${esc(ov)}"${String(val) === String(ov) ? " selected" : ""}>${esc(ol)}</option>`;
      }).join("");
      return `<label class="ad-field"><span>${esc(f.label)}</span>
        <select name="${esc(f.name)}"${f.required ? " required" : ""}>${opts}</select>
      </label>`;
    }
    if (f.type === "checkbox") {
      return `<label class="ad-field ad-field-check">
        <input type="checkbox" name="${esc(f.name)}"${val ? " checked" : ""} />
        <span>${esc(f.label)}</span>
      </label>`;
    }
    return `<label class="ad-field"><span>${esc(f.label)}</span>
      <input type="${esc(f.type || "text")}" name="${esc(f.name)}" value="${esc(String(val))}"${f.required ? " required" : ""} placeholder="${esc(f.placeholder || "")}" />
    </label>`;
  }).join("");
}

function openAdminForm({ title, fields, values, submitLabel, onSubmit }) {
  const formId = "adminEditForm";
  const html = `
    <form class="ad-form" id="${formId}">
      ${adminFormFields(fields, values || {})}
      <p class="form-feedback" id="adminEditFeedback" hidden></p>
      <div class="ad-reply-actions">
        <button type="button" class="btn btn-ghost" data-close-detail>Cancel</button>
        <button type="submit" class="btn btn-primary">${esc(submitLabel || "Save")}</button>
      </div>
    </form>`;
  openAdminDetail(title, html);
  const form = document.getElementById(formId);
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const fb = document.getElementById("adminEditFeedback");
    const btn = form.querySelector("button[type=submit]");
    const data = {};
    fields.forEach(f => {
      if (f.type === "checkbox") data[f.name] = !!form.elements[f.name]?.checked;
      else data[f.name] = form.elements[f.name]?.value ?? "";
    });
    const prev = btn.textContent;
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      await onSubmit(data);
      closeAdminDetail();
      toast("Saved.");
      await loadAdminData();
      if (typeof loadJobs === "function") loadJobs();
      if (typeof loadEvents === "function") loadEvents();
      if (typeof loadPeople === "function") loadPeople();
      if (typeof loadStats === "function") loadStats();
    } catch (err) {
      showFeedback(fb, err.message || "Could not save.", false);
      btn.disabled = false; btn.textContent = prev;
    }
  });
}

function editUserForm(id) {
  const u = adminCache.people.find(x => x.id === Number(id));
  if (!u) return toast("User not found");
  openAdminForm({
    title: `Edit user — ${u.name || u.email}`,
    submitLabel: "Save user",
    values: { name: u.name, email: u.email, role: u.role, bio: u.bio || "" },
    fields: [
      { name: "name", label: "Name", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "role", label: "Role", placeholder: "Artist, admin, etc." },
      { name: "bio", label: "Bio", type: "textarea", rows: 4 }
    ],
    onSubmit: (data) => adminAction("PATCH", `/admin/users/${id}`, data)
  });
}

function jobFormFields() {
  return [
    { name: "title", label: "Title", required: true },
    { name: "category", label: "Type / Category", required: true, placeholder: "e.g. Workshop, Internship, Gig" },
    { name: "location", label: "Location" },
    { name: "eventDate", label: "Date / Deadline", type: "date" },
    { name: "pay", label: "Pay (USD)", type: "number" },
    { name: "description", label: "Description", type: "textarea", rows: 5 },
    { name: "open", label: "Open for applications", type: "checkbox" }
  ];
}

function newJobForm() {
  openAdminForm({
    title: "+ New job / opportunity",
    submitLabel: "Create job",
    values: { open: true },
    fields: jobFormFields(),
    onSubmit: (data) => adminAction("POST", "/admin/jobs", data)
  });
}

function editJobForm(id) {
  const j = adminCache.jobs.find(x => x.id === Number(id));
  if (!j) return toast("Job not found");
  openAdminForm({
    title: `Edit job — ${j.title || ""}`,
    submitLabel: "Save job",
    values: { ...j, open: j.open !== false },
    fields: jobFormFields(),
    onSubmit: (data) => adminAction("PATCH", `/admin/jobs/${id}`, data)
  });
}

function eventFormFields() {
  return [
    { name: "title", label: "Title", required: true },
    { name: "category", label: "Category", placeholder: "Concert, Workshop, Open Mic…" },
    { name: "location", label: "Location" },
    { name: "eventDate", label: "Event date", type: "date" },
    { name: "description", label: "Description", type: "textarea", rows: 5 }
  ];
}

function newEventForm() {
  openAdminForm({
    title: "+ New event",
    submitLabel: "Create event",
    values: {},
    fields: eventFormFields(),
    onSubmit: (data) => adminAction("POST", "/admin/events", data)
  });
}

function editEventForm(id) {
  const ev = adminCache.events.find(x => x.id === Number(id));
  if (!ev) return toast("Event not found");
  openAdminForm({
    title: `Edit event — ${ev.title || ""}`,
    submitLabel: "Save event",
    values: ev,
    fields: eventFormFields(),
    onSubmit: (data) => adminAction("PATCH", `/admin/events/${id}`, data)
  });
}

function editPostForm(id) {
  const p = adminCache.posts.find(x => x.id === Number(id));
  if (!p) return toast("Post not found");
  openAdminForm({
    title: `Edit post by ${p.authorName || "—"}`,
    submitLabel: "Save post",
    values: { body: p.content || p.body || "", imageUrl: p.imageUrl || "" },
    fields: [
      { name: "body", label: "Content", type: "textarea", rows: 6, required: true },
      { name: "imageUrl", label: "Image URL (optional)", placeholder: "/uploads/…" }
    ],
    onSubmit: (data) => adminAction("PATCH", `/admin/posts/${id}`, data)
  });
}

function editCreatorForm(id) {
  const c = adminCache.creators.find(x => x.id === Number(id));
  if (!c) return toast("Creator not found");
  openAdminForm({
    title: `Edit creator — ${c.authorName || ""}`,
    submitLabel: "Save profile",
    values: {
      category: c.category || "",
      location: c.location || "",
      tagline: c.tagline || "",
      bio: c.bio || "",
      story: c.story || "",
      quote: c.quote || "",
      rating: c.rating ?? "",
      visible: c.visible !== false
    },
    fields: [
      { name: "category", label: "Category", placeholder: "Music, Dance, Photography…" },
      { name: "location", label: "Location" },
      { name: "tagline", label: "Tagline" },
      { name: "bio", label: "Bio", type: "textarea", rows: 3 },
      { name: "story", label: "Story", type: "textarea", rows: 5 },
      { name: "quote", label: "Quote" },
      { name: "rating", label: "Rating (0–5)", type: "number" },
      { name: "visible", label: "Visible on the public site", type: "checkbox" }
    ],
    onSubmit: (data) => {
      if (data.rating === "" || data.rating === null) delete data.rating;
      else data.rating = Number(data.rating);
      return adminAction("PATCH", `/admin/creators/${id}`, data);
    }
  });
}

function editCommentForm(id) {
  const c = adminCache.comments.find(x => x.id === Number(id));
  if (!c) return toast("Comment not found");
  openAdminForm({
    title: `Edit comment by ${c.authorName || "—"}`,
    submitLabel: "Save comment",
    values: { body: c.body || "" },
    fields: [
      { name: "body", label: "Comment", type: "textarea", rows: 4, required: true }
    ],
    onSubmit: (data) => adminAction("PATCH", `/admin/comments/${id}`, data)
  });
}
async function loadAdminData() {
  const peopleBody = $("#adminPeopleBody");
  const msgBody    = $("#adminMessagesBody");
  const donBody    = $("#adminDonationsBody");
  const jobsBody   = $("#adminJobsBody");
  const eventsBody = $("#adminEventsBody");
  const postsBody  = $("#adminPostsBody");
  const creatorsBody = $("#adminCreatorsBody");
  const commentsBody = $("#adminCommentsBody");
  const setLoading = (el, cols) => el && (el.innerHTML = `<tr><td colspan="${cols}" class="muted center">Loading…</td></tr>`);
  setLoading(peopleBody, 7); setLoading(msgBody, 4); setLoading(donBody, 6);
  setLoading(jobsBody, 6); setLoading(eventsBody, 5); setLoading(postsBody, 4);
  setLoading(creatorsBody, 6); setLoading(commentsBody, 5);

  const me = getSession()?.user;

  try {
    const [summary, people, messages, donations, content, comments] = await Promise.all([
      adminFetch("/admin/summary"),
      adminFetch("/admin/people"),
      adminFetch("/admin/messages"),
      adminFetch("/admin/donations"),
      adminFetch("/admin/content"),
      adminFetch("/admin/comments"),
    ]);

    adminCache = {
      people: people.results || [],
      messages: messages.results || [],
      donations: donations.results || [],
      jobs: content.jobs || [],
      events: content.events || [],
      posts: content.posts || [],
      creators: content.creators || [],
      comments: comments.results || []
    };

    $("#adminStatPeople").textContent    = summary.users;
    $("#adminStatCreators").textContent  = summary.creators;
    $("#adminStatMessages").textContent  = summary.messages;
    $("#adminStatDonations").textContent = summary.donations;
    $("#adminStatRaised").textContent    = fmtMoney(summary.donationTotal || 0, "USD");

    peopleBody.innerHTML = people.results.length ? people.results.map(p => {
      const self = me && p.id === me.id;
      const adminBtnLabel = p.isAdmin ? "Remove admin" : "Make admin";
      const adminBtnRole  = p.isAdmin ? "Artist" : "admin";
      const adminBtn = self
        ? `<button class="admin-btn admin-btn-ghost" disabled title="You can't change your own role">${esc(p.isAdmin ? "You (admin)" : "You")}</button>`
        : `<button class="admin-btn admin-btn-ghost" data-admin-action="setRole" data-id="${p.id}" data-role="${esc(adminBtnRole)}">${esc(adminBtnLabel)}</button>`;
      const delBtn = self
        ? `<button class="admin-btn admin-btn-danger" disabled title="You can't delete your own account">Delete</button>`
        : `<button class="admin-btn admin-btn-danger" data-admin-action="deleteUser" data-id="${p.id}" data-name="${esc(p.name || p.email || "this user")}">Delete</button>`;
      const editBtn = `<button class="admin-btn admin-btn-ghost" data-admin-action="editUser" data-id="${p.id}">Edit</button>`;
      return `
      <tr>
        <td>${esc(p.name || "—")} ${p.isAdmin ? '<span class="admin-pill-tag">admin</span>' : ""}</td>
        <td><a href="mailto:${esc(p.email || "")}">${esc(p.email || "—")}</a></td>
        <td>${esc(p.role || "—")}</td>
        <td>${esc(p.creator?.category || "—")}</td>
        <td>${esc(p.creator?.location || "—")}</td>
        <td>${esc(fmtDate(p.createdAt))}</td>
        <td class="admin-col-actions">${editBtn} ${adminBtn} ${delBtn}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="7" class="muted center">No users yet.</td></tr>`;

    msgBody.innerHTML = messages.results.length ? messages.results.map(m => {
      const replyCount = Array.isArray(m.replies) ? m.replies.length : 0;
      const status = replyCount ? `<span class="admin-pill-tag admin-pill-replied">replied</span>` : "";
      return `
      <tr>
        <td><a href="mailto:${esc(m.email || "")}">${esc(m.email || "—")}</a> ${status}</td>
        <td class="admin-cell-msg">${esc((m.message || "").slice(0, 200))}${(m.message || "").length > 200 ? "…" : ""}</td>
        <td>${esc(fmtDate(m.createdAt))}</td>
        <td class="admin-col-actions">
          <button class="admin-btn admin-btn-ghost" data-admin-action="viewMessage" data-id="${m.id}">View${replyCount ? ` (${replyCount})` : ""}</button>
          <button class="admin-btn admin-btn-danger" data-admin-action="deleteMessage" data-id="${m.id}">Delete</button>
        </td>
      </tr>`;
    }).join("") : `<tr><td colspan="4" class="muted center">No messages yet.</td></tr>`;

    donBody.innerHTML = donations.results.length ? donations.results.map(d => `
      <tr>
        <td>${esc(d.anonymous ? "(Anonymous)" : (d.name || "—"))}</td>
        <td><a href="mailto:${esc(d.email || "")}">${esc(d.email || "—")}</a></td>
        <td><strong>${esc(fmtMoney(d.amount, d.currency))}</strong></td>
        <td class="admin-cell-msg">${esc((d.message || "").slice(0, 120))}${(d.message || "").length > 120 ? "…" : ""}</td>
        <td>${esc(fmtDate(d.createdAt))}</td>
        <td class="admin-col-actions">
          <button class="admin-btn admin-btn-ghost" data-admin-action="viewDonation" data-id="${d.id}">View</button>
          <button class="admin-btn admin-btn-danger" data-admin-action="deleteDonation" data-id="${d.id}">Delete</button>
        </td>
      </tr>`).join("") : `<tr><td colspan="6" class="muted center">No donations yet.</td></tr>`;

    jobsBody.innerHTML = (content.jobs || []).length ? content.jobs.map(j => `
      <tr>
        <td>${esc(j.title || "—")}</td>
        <td>${esc(j.organisation || j.org || "—")}</td>
        <td>${esc(j.category || j.type || "—")}</td>
        <td>${esc(j.location || "—")}</td>
        <td>${j.open === false ? "Closed" : "Open"}</td>
        <td class="admin-col-actions">
          <button class="admin-btn admin-btn-ghost" data-admin-action="viewJob" data-id="${j.id}">View</button>
          <button class="admin-btn admin-btn-ghost" data-admin-action="editJob" data-id="${j.id}">Edit</button>
          <button class="admin-btn admin-btn-danger" data-admin-action="deleteJob" data-id="${j.id}" data-name="${esc(j.title || "this job")}">Delete</button>
        </td>
      </tr>`).join("") : `<tr><td colspan="6" class="muted center">No jobs yet.</td></tr>`;

    eventsBody.innerHTML = (content.events || []).length ? content.events.map(ev => `
      <tr>
        <td>${esc(ev.title || "—")}</td>
        <td>${esc(fmtDate(ev.eventDate || ev.createdAt))}</td>
        <td>${esc(ev.location || "—")}</td>
        <td>${esc(ev.category || "—")}</td>
        <td class="admin-col-actions">
          <button class="admin-btn admin-btn-ghost" data-admin-action="viewEvent" data-id="${ev.id}">View</button>
          <button class="admin-btn admin-btn-ghost" data-admin-action="editEvent" data-id="${ev.id}">Edit</button>
          <button class="admin-btn admin-btn-danger" data-admin-action="deleteEvent" data-id="${ev.id}" data-name="${esc(ev.title || "this event")}">Delete</button>
        </td>
      </tr>`).join("") : `<tr><td colspan="5" class="muted center">No events yet.</td></tr>`;

    postsBody.innerHTML = (content.posts || []).length ? content.posts.map(p => `
      <tr>
        <td>${esc(p.authorName || "—")}<br><span class="muted small">${esc(p.authorEmail || "")}</span></td>
        <td class="admin-cell-msg">${esc((p.content || p.body || "").slice(0, 200))}${((p.content || p.body || "").length > 200) ? "…" : ""}</td>
        <td>${esc(fmtDate(p.createdAt))}</td>
        <td class="admin-col-actions">
          <button class="admin-btn admin-btn-ghost" data-admin-action="viewPost" data-id="${p.id}">View</button>
          <button class="admin-btn admin-btn-ghost" data-admin-action="editPost" data-id="${p.id}">Edit</button>
          <button class="admin-btn admin-btn-danger" data-admin-action="deletePost" data-id="${p.id}">Delete</button>
        </td>
      </tr>`).join("") : `<tr><td colspan="4" class="muted center">No community posts yet.</td></tr>`;

    if (creatorsBody) {
      creatorsBody.innerHTML = (content.creators || []).length ? content.creators.map(c => `
      <tr>
        <td>${esc(c.authorName || "—")}<br><span class="muted small">${esc(c.authorEmail || "")}</span></td>
        <td>${esc(c.category || "—")}</td>
        <td>${esc(c.location || "—")}</td>
        <td>${c.rating != null ? esc(String(c.rating)) : "—"}</td>
        <td>${c.visible === false ? '<span class="admin-pill-tag" style="background:#94a3b8">hidden</span>' : '<span class="admin-pill-tag admin-pill-replied">visible</span>'}</td>
        <td class="admin-col-actions">
          <button class="admin-btn admin-btn-ghost" data-admin-action="editCreator" data-id="${c.id}">Edit</button>
          <button class="admin-btn admin-btn-ghost" data-admin-action="toggleCreator" data-id="${c.id}" data-visible="${c.visible === false ? "show" : "hide"}">${c.visible === false ? "Show" : "Hide"}</button>
          <button class="admin-btn admin-btn-danger" data-admin-action="deleteCreator" data-id="${c.id}" data-name="${esc(c.authorName || "this profile")}">Delete</button>
        </td>
      </tr>`).join("") : `<tr><td colspan="6" class="muted center">No creator profiles yet.</td></tr>`;
    }

    if (commentsBody) {
      const cmts = comments.results || [];
      commentsBody.innerHTML = cmts.length ? cmts.map(c => `
      <tr>
        <td>${esc(c.authorName || "—")}<br><span class="muted small">${esc(c.authorEmail || "")}</span></td>
        <td class="admin-cell-msg">${esc((c.body || "").slice(0, 200))}${(c.body || "").length > 200 ? "…" : ""}</td>
        <td><span class="muted small">${c.postAuthor ? esc(c.postAuthor) + " · " : ""}</span>${esc((c.postSnippet || "(post)").slice(0, 60))}${(c.postSnippet || "").length > 60 ? "…" : ""}</td>
        <td>${esc(fmtDate(c.createdAt))}</td>
        <td class="admin-col-actions">
          <button class="admin-btn admin-btn-ghost" data-admin-action="editComment" data-id="${c.id}">Edit</button>
          <button class="admin-btn admin-btn-danger" data-admin-action="deleteComment" data-id="${c.id}">Delete</button>
        </td>
      </tr>`).join("") : `<tr><td colspan="5" class="muted center">No comments yet.</td></tr>`;
    }
  } catch (err) {
    const msg = `<tr><td colspan="7" class="muted center">${esc(err.message || "Could not load admin data.")}</td></tr>`;
    if (peopleBody) peopleBody.innerHTML = msg;
    if (msgBody)    msgBody.innerHTML    = msg.replace('colspan="7"', 'colspan="4"');
    if (donBody)    donBody.innerHTML    = msg.replace('colspan="7"', 'colspan="6"');
    if (jobsBody)   jobsBody.innerHTML   = msg.replace('colspan="7"', 'colspan="6"');
    if (eventsBody) eventsBody.innerHTML = msg.replace('colspan="7"', 'colspan="5"');
    if (postsBody)  postsBody.innerHTML  = msg.replace('colspan="7"', 'colspan="4"');
    if (creatorsBody) creatorsBody.innerHTML = msg.replace('colspan="7"', 'colspan="6"');
    if (commentsBody) commentsBody.innerHTML = msg.replace('colspan="7"', 'colspan="5"');
  }
}
function initAdminDashboard() {
  const modal = $("#adminModal");
  if (!modal) return;
  $$("[data-close-admin]").forEach(el =>
    el.addEventListener("click", e => { e.preventDefault(); closeAdminDashboard(); }));
  $$("[data-close-detail]", modal).forEach(el =>
    el.addEventListener("click", e => { e.preventDefault(); closeAdminDetail(); }));
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    const detail = $("#adminDetail");
    if (detail && !detail.hidden) { closeAdminDetail(); return; }
    if (!modal.hidden) closeAdminDashboard();
  });
  $$(".admin-tab", modal).forEach(tab => {
    tab.addEventListener("click", () => {
      const key = tab.getAttribute("data-admin-tab");
      $$(".admin-tab", modal).forEach(t => {
        const active = t === tab;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-selected", active ? "true" : "false");
      });
      $$(".admin-panel", modal).forEach(p => {
        const match = p.getAttribute("data-admin-panel") === key;
        p.classList.toggle("is-active", match);
        p.hidden = !match;
      });
    });
  });

  modal.addEventListener("click", async e => {
    const btn = e.target.closest("[data-admin-action]");
    if (!btn || btn.disabled) return;
    const action = btn.getAttribute("data-admin-action");
    const id = btn.getAttribute("data-id");
    const name = btn.getAttribute("data-name") || "this item";

    // View actions don't need confirm/network
    switch (action) {
      case "viewMessage":  return viewMessageDetail(id);
      case "viewDonation": return viewDonationDetail(id);
      case "viewJob":      return viewJobDetail(id);
      case "viewEvent":    return viewEventDetail(id);
      case "viewPost":     return viewPostDetail(id);
      case "editUser":     return editUserForm(id);
      case "editJob":      return editJobForm(id);
      case "editEvent":    return editEventForm(id);
      case "editPost":     return editPostForm(id);
      case "editCreator":  return editCreatorForm(id);
      case "editComment":  return editCommentForm(id);
      case "newJob":       return newJobForm();
      case "newEvent":     return newEventForm();
    }

    try {
      let confirmMsg = "";
      let request = null;
      let successMsg = "";
      switch (action) {
        case "deleteUser":
          confirmMsg = `Permanently delete ${name}?\n\nThis also removes their profile, posts, comments, applications and messages. This cannot be undone.`;
          request = () => adminAction("DELETE", `/admin/users/${id}`);
          successMsg = `Deleted ${name}.`;
          break;
        case "setRole":
          {
            const role = btn.getAttribute("data-role");
            const isPromote = role.toLowerCase() === "admin";
            confirmMsg = isPromote
              ? `Promote this user to admin? They'll get full dashboard access.`
              : `Remove admin rights from this user?`;
            request = () => adminAction("PATCH", `/admin/users/${id}`, { role });
            successMsg = isPromote ? "User promoted to admin." : "Admin rights removed.";
          }
          break;
        case "deleteMessage":
          confirmMsg = "Delete this message?";
          request = () => adminAction("DELETE", `/admin/messages/${id}`);
          successMsg = "Message deleted.";
          break;
        case "deleteDonation":
          confirmMsg = "Delete this donation record?";
          request = () => adminAction("DELETE", `/admin/donations/${id}`);
          successMsg = "Donation deleted.";
          break;
        case "deletePost":
          confirmMsg = "Delete this post (and its likes/comments)?";
          request = () => adminAction("DELETE", `/admin/posts/${id}`);
          successMsg = "Post deleted.";
          break;
        case "deleteJob":
          confirmMsg = `Delete "${name}" and all its applications?`;
          request = () => adminAction("DELETE", `/admin/jobs/${id}`);
          successMsg = "Job deleted.";
          break;
        case "deleteEvent":
          confirmMsg = `Delete "${name}"?`;
          request = () => adminAction("DELETE", `/admin/events/${id}`);
          successMsg = "Event deleted.";
          break;
        case "deleteCreator":
          confirmMsg = `Delete creator profile "${name}"? Their user account stays, but their public profile will be removed.`;
          request = () => adminAction("DELETE", `/admin/creators/${id}`);
          successMsg = "Creator profile deleted.";
          break;
        case "toggleCreator":
          {
            const op = btn.getAttribute("data-visible"); // "show" or "hide"
            const makeVisible = op === "show";
            confirmMsg = makeVisible
              ? "Make this creator profile visible on the public site?"
              : "Hide this creator profile from the public site?";
            request = () => adminAction("PATCH", `/admin/creators/${id}`, { visible: makeVisible });
            successMsg = makeVisible ? "Profile is now visible." : "Profile hidden.";
          }
          break;
        case "deleteComment":
          confirmMsg = "Delete this comment?";
          request = () => adminAction("DELETE", `/admin/comments/${id}`);
          successMsg = "Comment deleted.";
          break;
        default:
          return;
      }
      if (!confirm(confirmMsg)) return;
      btn.disabled = true;
      const prev = btn.textContent;
      btn.textContent = "Working…";
      await request();
      toast(successMsg);
      await loadAdminData();
      // Public lists may be affected
      if (typeof loadPeople === "function") loadPeople();
      if (typeof loadJobs === "function") loadJobs();
      if (typeof loadEvents === "function") loadEvents();
      if (typeof loadStats === "function") loadStats();
      btn.textContent = prev;
    } catch (err) {
      btn.disabled = false;
      toast(err.message || "Action failed.");
    }
  });
}

/* ---------- Live stream ---------- */
const LIVE_STREAM_URL = "https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1"; // change to your live stream embed URL
const LIVE_CHAT_KEY = "kcz-live-chat";

function initLiveStream() {
  const section = $("#live");
  if (!section) return;

  const frame       = $("#liveStreamFrame");
  const placeholder = $("#liveStreamPlaceholder");
  const loadBtn     = $("#liveStreamLoadBtn");
  const statusEl    = $("#liveStreamStatus");
  const viewersEl   = $("#liveStreamViewers");

  if (loadBtn) {
    loadBtn.addEventListener("click", () => {
      if (!frame) return;
      frame.src = LIVE_STREAM_URL;
      placeholder.hidden = true;
      statusEl.innerHTML = `🔴 <strong>LIVE</strong>`;
      statusEl.classList.add("is-live");
      const v = 30 + Math.floor(Math.random() * 220);
      viewersEl.textContent = `${v.toLocaleString()} watching`;
    });
  }

  /* ---- Live chat (localStorage-only demo) ---- */
  const form    = $("#liveChatForm");
  const feed    = $("#liveChatFeed");
  const nameIn  = $("#liveChatName");
  const msgIn   = $("#liveChatMessage");
  const countEl = $("#liveChatCount");

  const session = getSession?.();
  if (session && nameIn && !nameIn.value) nameIn.value = session.user.name;

  function loadChat() {
    try { return JSON.parse(localStorage.getItem(LIVE_CHAT_KEY) || "[]"); }
    catch { return []; }
  }
  function saveChat(list) {
    localStorage.setItem(LIVE_CHAT_KEY, JSON.stringify(list.slice(-50)));
  }
  function renderChat() {
    const list = loadChat();
    if (!list.length) {
      feed.innerHTML = `<p class="muted small center">Be the first to say hello.</p>`;
    } else {
      feed.innerHTML = list.map(m => `
        <div class="live-chat-msg">
          <span class="live-chat-msg-avatar" aria-hidden="true">${esc(initials(m.name))}</span>
          <div>
            <div class="live-chat-msg-meta"><strong>${esc(m.name)}</strong> · <span class="muted small">${esc(fmtChatTime(m.at))}</span></div>
            <p>${esc(m.body)}</p>
          </div>
        </div>`).join("");
      feed.scrollTop = feed.scrollHeight;
    }
    const fake = 12 + (list.length * 3);
    countEl.textContent = `${fake} online`;
  }
  function fmtChatTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  if (form) {
    form.addEventListener("submit", e => {
      e.preventDefault();
      const name = (nameIn.value || "Guest").trim().slice(0, 40);
      const body = msgIn.value.trim();
      if (!body) return;
      const list = loadChat();
      list.push({ name, body, at: new Date().toISOString() });
      saveChat(list);
      msgIn.value = "";
      renderChat();
    });
  }
  renderChat();
  setInterval(renderChat, 30000); // refresh relative timestamps + count
}

/* ---------- Boot ---------- */
function boot() {
  initScrollChrome();
  initMobileNav();
  initScrollSpy();
  initReveals();
  initYear();
  initJoinModal();
  initSigninForm();
  initDonateModal();
  initAdminDashboard();
  renderAuthUI();
  refreshSession();
  initThemeCustomizer();
  loadStats();
  loadPeople();
  loadEvents();
  loadJobs();
  initContactForm();
  initNewsletterForm();
  initLiveStream();
}

/* ---------- Theme Customizer (canvas mode + accent) ---------- */
const TC_KEY = "kcz-theme";
const TC_ACCENTS = ["amber", "emerald", "indigo", "rose", "violet"];
const TC_MODES   = ["light", "dark"];

function tcReadSaved() {
  try { return JSON.parse(localStorage.getItem(TC_KEY) || "{}"); }
  catch { return {}; }
}
function tcApply(prefs) {
  const root = document.documentElement;
  root.classList.add("tc-anim");
  if (prefs.mode && TC_MODES.includes(prefs.mode)) {
    root.setAttribute("data-theme", prefs.mode);
  } else {
    root.removeAttribute("data-theme");
  }
  if (prefs.accent && TC_ACCENTS.includes(prefs.accent)) {
    root.setAttribute("data-accent", prefs.accent);
  } else {
    root.removeAttribute("data-accent");
  }
  setTimeout(() => root.classList.remove("tc-anim"), 400);
}
function tcMarkActive(prefs) {
  const mode = prefs.mode || "light";
  $$("[data-tc-mode]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.tcMode === mode)));
  $$("[data-tc-accent]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.tcAccent === prefs.accent)));
}

function initThemeCustomizer() {
  const launcher = $("#tcLauncher");
  const panel    = $("#tcPanel");
  const closeBtn = $("#tcClose");
  const saveBtn  = $("#tcSave");
  const saveNote = $("#tcSaveNote");
  if (!launcher || !panel) return;

  // session-local working prefs; persisted only on Save
  let working = { ...tcReadSaved() };
  tcApply(working);
  tcMarkActive(working);

  const openPanel = () => {
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
  };
  const closePanel = () => {
    panel.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
  };

  launcher.addEventListener("click", () => {
    panel.hidden ? openPanel() : closePanel();
  });
  closeBtn?.addEventListener("click", closePanel);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) closePanel();
  });
  document.addEventListener("click", (e) => {
    if (panel.hidden) return;
    if (panel.contains(e.target) || launcher.contains(e.target)) return;
    closePanel();
  });

  $$("[data-tc-mode]").forEach(btn => {
    btn.addEventListener("click", () => {
      working.mode = btn.dataset.tcMode;
      tcApply(working);
      tcMarkActive(working);
      saveNote.textContent = "Preview — click Save to persist";
      saveNote.classList.remove("is-saved");
    });
  });
  $$("[data-tc-accent]").forEach(btn => {
    btn.addEventListener("click", () => {
      working.accent = btn.dataset.tcAccent;
      tcApply(working);
      tcMarkActive(working);
      saveNote.textContent = "Preview — click Save to persist";
      saveNote.classList.remove("is-saved");
    });
  });

  saveBtn?.addEventListener("click", () => {
    try {
      localStorage.setItem(TC_KEY, JSON.stringify(working));
      saveNote.textContent = "✓ Custom styles applied universally";
      saveNote.classList.add("is-saved");
    } catch {
      saveNote.textContent = "Couldn't save — storage blocked.";
      saveNote.classList.remove("is-saved");
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
