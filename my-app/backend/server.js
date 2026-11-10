// ============================================================
// Kakuma Creative Zone — production-grade server
//   • Express + JSON-file store (pure JS)
//   • JWT auth + bcrypt
//   • Helmet security headers · compression · rate-limit · access log
//   • Multer file uploads (8MB images)
//   • REST API: auth, creators, posts, comments, likes,
//               jobs, applications, messages, events, stats,
//               notifications, AI match, contact, avatar upload
// ============================================================
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");

const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString("hex");
const IS_PROD = process.env.NODE_ENV === "production";

// ------------------------------------------------------------
// Security / perf middleware
// ------------------------------------------------------------
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
      "img-src": ["'self'", "data:", "blob:"],
      "connect-src": ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      "frame-ancestors": ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "same-origin" }
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Tiny request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    if (!req.path.startsWith("/uploads") && req.path !== "/favicon.ico") {
      console.log(`${req.method.padEnd(6)} ${res.statusCode} ${req.path} ${ms}ms`);
    }
  });
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many auth attempts — please wait a few minutes." }
});
const writeLimiter = rateLimit({
  windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false,
  message: { error: "Slow down — try again shortly." }
});

// ------------------------------------------------------------
// Static + uploads
// ------------------------------------------------------------
app.use(express.static(__dirname, {
  maxAge: IS_PROD ? "7d" : 0,
  setHeaders: (res, p) => {
    if (p.endsWith("sw.js")) res.setHeader("Cache-Control", "no-cache");
  }
}));

const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "30d", immutable: true }));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safe}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(png|jpe?g|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only PNG, JPG, GIF, or WebP images allowed"));
  }
});

// ------------------------------------------------------------
// Auth helpers
// ------------------------------------------------------------
function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET, { expiresIn: "7d" });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function authOptional(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) { try { req.user = jwt.verify(token, JWT_SECRET); } catch { /* ignore */ } }
  next();
}

// Admin: matches user.role === "admin" or env-listed email
const ADMIN_EMAILS = new Set(
  String(process.env.ADMIN_EMAILS || "admin@kcz.dev,amani@kcz.dev,chuol@kcz.dev,halima@kcz.dev")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
);
function isAdmin(u) {
  if (!u) return false;
  return String(u.role || "").toLowerCase() === "admin"
      || ADMIN_EMAILS.has(String(u.email || "").toLowerCase());
}
function adminRequired(req, res, next) {
  return authRequired(req, res, () => {
    const user = db.users.findById(req.user.id);
    if (!isAdmin(user)) return res.status(403).json({ error: "Admin access required" });
    req.adminUser = user;
    next();
  });
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, email: u.email, name: u.name, role: u.role,
    avatarColor: u.avatarColor, avatarUrl: u.avatarUrl,
    bio: u.bio || "", createdAt: u.createdAt,
    isAdmin: isAdmin(u)
  };
}

function publicCreator(c) {
  const user = db.users.findById(c.userId);
  return {
    id: c.id, userId: c.userId,
    name: user?.name, email: user?.email, role: user?.role,
    avatarColor: user?.avatarColor, avatarUrl: user?.avatarUrl,
    category: c.category, location: c.location, rating: c.rating,
    bio: c.bio, tagline: c.tagline, story: c.story, quote: c.quote,
    tags: c.tags || [], createdAt: c.createdAt
  };
}

const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ""));

// ============================================================
// AUTH
// ============================================================
app.use("/api/auth", authLimiter);

app.post("/api/auth/signup", (req, res) => {
  const { email, password, name, role } = req.body || {};
  if (!email || !password || !name) return res.status(400).json({ error: "email, password, and name are required" });
  if (!isEmail(email)) return res.status(400).json({ error: "invalid email" });
  if (String(password).length < 6) return res.status(400).json({ error: "password must be at least 6 characters" });
  if (String(name).trim().length < 2) return res.status(400).json({ error: "name too short" });

  const emailLower = String(email).toLowerCase();
  if (db.users.find(u => u.email === emailLower)) {
    return res.status(409).json({ error: "An account with that email already exists" });
  }

  const colors = [
    "linear-gradient(135deg,#7c3aed,#ec4899)",
    "linear-gradient(135deg,#06b6d4,#3b82f6)",
    "linear-gradient(135deg,#f59e0b,#ef4444)",
    "linear-gradient(135deg,#10b981,#06b6d4)",
    "linear-gradient(135deg,#ec4899,#f43f5e)"
  ];

  const user = db.users.insert({
    email: emailLower,
    passwordHash: bcrypt.hashSync(password, 10),
    name: String(name).trim(),
    role: role || "member",
    avatarColor: colors[Math.floor(Math.random() * colors.length)],
    avatarUrl: null,
    bio: ""
  });

  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });

  const user = db.users.find(u => u.email === String(email).toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get("/api/auth/me", authRequired, (req, res) => {
  const user = db.users.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "Not found" });
  const creator = db.creators.find(c => c.userId === user.id);
  res.json({ user: publicUser(user), creator: creator ? publicCreator(creator) : null });
});

app.patch("/api/auth/me", authRequired, (req, res) => {
  const allowed = ["name", "role", "bio"];
  const patch = {};
  for (const k of allowed) if (req.body?.[k] !== undefined) patch[k] = String(req.body[k]).trim();
  if (patch.name !== undefined && patch.name.length < 2) return res.status(400).json({ error: "name too short" });
  const updated = db.users.update(req.user.id, patch);
  if (!updated) return res.status(404).json({ error: "user not found" });
  res.json({ user: publicUser(updated) });
});

app.post("/api/auth/password", authRequired, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: "current and new password required" });
  if (String(newPassword).length < 6) return res.status(400).json({ error: "new password must be at least 6 characters" });
  const user = db.users.findById(req.user.id);
  if (!user || !bcrypt.compareSync(currentPassword, user.passwordHash)) {
    return res.status(401).json({ error: "current password is wrong" });
  }
  db.users.update(user.id, { passwordHash: bcrypt.hashSync(newPassword, 10) });
  res.json({ ok: true });
});

// ============================================================
// CREATORS
// ============================================================
app.get("/api/creators", (req, res) => {
  const { category, q } = req.query;
  let list = db.creators.filter(c => c.visible !== false);

  if (category && category !== "All") list = list.filter(c => c.category === category);

  if (q) {
    const term = String(q).toLowerCase();
    list = list.filter(c => {
      const u = db.users.findById(c.userId);
      const hay = [u?.name, c.bio, c.location, ...(c.tags || [])].join(" ").toLowerCase();
      return hay.includes(term);
    });
  }

  list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  res.json({ count: list.length, results: list.map(publicCreator) });
});

app.get("/api/creators/:id", (req, res) => {
  const c = db.creators.findById(req.params.id);
  if (!c) return res.status(404).json({ error: "Creator not found" });
  res.json(publicCreator(c));
});

app.post("/api/creators", authRequired, writeLimiter, (req, res) => {
  const { category, location, bio, tags } = req.body || {};
  if (!category) return res.status(400).json({ error: "category is required" });
  const tagArr = Array.isArray(tags)
    ? tags.map(t => String(t).trim()).filter(Boolean).slice(0, 12)
    : String(tags || "").split(",").map(t => t.trim()).filter(Boolean).slice(0, 12);

  const row = db.creators.upsert(c => c.userId === req.user.id, {
    userId: req.user.id, category, location: String(location || ""),
    bio: String(bio || ""), tags: tagArr, visible: true, rating: 5.0
  });
  res.json(publicCreator(row));
});

// ============================================================
// POSTS (feed)
// ============================================================
app.get("/api/posts", authOptional, (req, res) => {
  const me = req.user?.id || 0;
  const tag = req.query.tag ? String(req.query.tag).toLowerCase().replace(/^#/, "") : null;
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const before = req.query.before ? new Date(req.query.before) : null;

  let posts = db.posts.all().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (tag) posts = posts.filter(p => (p.body || "").toLowerCase().includes("#" + tag));
  if (before) posts = posts.filter(p => new Date(p.createdAt) < before);
  posts = posts.slice(0, limit);

  const results = posts.map(p => {
    const author = db.users.findById(p.userId);
    const likes = db.postLikes.filter(l => l.postId === p.id);
    const commentCount = db.comments.count(c => c.postId === p.id);
    return {
      id: p.id, body: p.body, imageUrl: p.imageUrl, createdAt: p.createdAt,
      author: author ? {
        id: author.id, name: author.name, role: author.role,
        avatarColor: author.avatarColor, avatarUrl: author.avatarUrl
      } : null,
      likeCount: likes.length, commentCount,
      liked: !!likes.find(l => l.userId === me),
      mine: author?.id === me
    };
  });
  res.json({ count: results.length, results });
});

app.post("/api/posts", authRequired, writeLimiter, upload.single("image"), (req, res) => {
  const body = String(req.body.body || "").trim();
  if (!body) return res.status(400).json({ error: "Post body is required" });
  if (body.length > 1000) return res.status(400).json({ error: "post too long (max 1000 chars)" });
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const post = db.posts.insert({ userId: req.user.id, body, imageUrl });
  res.status(201).json({ id: post.id, body, imageUrl, createdAt: post.createdAt });
});

app.delete("/api/posts/:id", authRequired, (req, res) => {
  const post = db.posts.findById(req.params.id);
  if (!post) return res.status(404).json({ error: "post not found" });
  if (post.userId !== req.user.id) return res.status(403).json({ error: "not your post" });
  db.posts.remove(p => p.id === post.id);
  db.postLikes.remove(l => l.postId === post.id);
  db.comments.remove(c => c.postId === post.id);
  res.json({ ok: true });
});

app.post("/api/posts/:id/like", authRequired, writeLimiter, (req, res) => {
  const postId = Number(req.params.id);
  if (!db.posts.findById(postId)) return res.status(404).json({ error: "Post not found" });

  const existing = db.postLikes.find(l => l.postId === postId && l.userId === req.user.id);
  if (existing) {
    db.postLikes.remove(l => l.postId === postId && l.userId === req.user.id);
  } else {
    db.postLikes.insert({ postId, userId: req.user.id });
  }
  const count = db.postLikes.count(l => l.postId === postId);
  res.json({ liked: !existing, likeCount: count });
});

// ============================================================
// COMMENTS
// ============================================================
app.get("/api/posts/:id/comments", (req, res) => {
  const postId = Number(req.params.id);
  const comments = db.comments.filter(c => c.postId === postId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map(c => {
      const u = db.users.findById(c.userId);
      return {
        id: c.id, body: c.body, createdAt: c.createdAt,
        author: u ? { id: u.id, name: u.name, avatarColor: u.avatarColor, avatarUrl: u.avatarUrl } : null
      };
    });
  res.json({ count: comments.length, results: comments });
});

app.post("/api/posts/:id/comments", authRequired, writeLimiter, (req, res) => {
  const postId = Number(req.params.id);
  if (!db.posts.findById(postId)) return res.status(404).json({ error: "post not found" });
  const body = String(req.body?.body || "").trim();
  if (!body) return res.status(400).json({ error: "comment body required" });
  if (body.length > 500) return res.status(400).json({ error: "comment too long" });
  const c = db.comments.insert({ postId, userId: req.user.id, body });
  const u = db.users.findById(req.user.id);
  res.status(201).json({
    id: c.id, body, createdAt: c.createdAt,
    author: { id: u.id, name: u.name, avatarColor: u.avatarColor, avatarUrl: u.avatarUrl }
  });
});

app.delete("/api/comments/:id", authRequired, (req, res) => {
  const c = db.comments.findById(req.params.id);
  if (!c) return res.status(404).json({ error: "not found" });
  if (c.userId !== req.user.id) return res.status(403).json({ error: "not your comment" });
  db.comments.remove(x => x.id === c.id);
  res.json({ ok: true });
});

// ============================================================
// JOBS
// ============================================================
app.get("/api/jobs", (_req, res) => {
  const jobs = db.jobs.filter(j => j.open !== false)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ count: jobs.length, results: jobs.map(j => {
    const u = db.users.findById(j.postedBy);
    return {
      id: j.id, title: j.title, category: j.category, location: j.location,
      eventDate: j.eventDate, pay: j.pay, description: j.description,
      postedBy: u ? { id: u.id, name: u.name } : { id: 0, name: "Unknown" },
      createdAt: j.createdAt,
      applicationCount: db.applications.count(a => a.jobId === j.id)
    };
  }) });
});

app.post("/api/jobs", authRequired, writeLimiter, (req, res) => {
  const { title, category, location, eventDate, pay, description } = req.body || {};
  if (!title || !category) return res.status(400).json({ error: "title and category required" });
  const job = db.jobs.insert({
    postedBy: req.user.id, title: String(title).trim(), category,
    location: String(location || ""), eventDate: String(eventDate || ""),
    pay: Number(pay) || 0, description: String(description || ""), open: true
  });
  res.status(201).json({ id: job.id });
});

app.post("/api/jobs/:id/apply", authRequired, writeLimiter, (req, res) => {
  const jobId = Number(req.params.id);
  const job = db.jobs.findById(jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  if (db.applications.find(a => a.jobId === jobId && a.userId === req.user.id)) {
    return res.status(409).json({ error: "You already applied for this job" });
  }

  const { contact, note } = req.body || {};
  db.applications.insert({
    jobId, userId: req.user.id,
    contact: String(contact || ""), note: String(note || "")
  });
  res.status(201).json({ ok: true, jobTitle: job.title });
});

// ============================================================
// MESSAGES (DM threads)
// ============================================================
app.get("/api/messages/threads", authRequired, (req, res) => {
  const me = req.user.id;
  const mine = db.messages.filter(m => m.fromUser === me || m.toUser === me);
  const partnerIds = [...new Set(mine.map(m => m.fromUser === me ? m.toUser : m.fromUser))];

  const threads = partnerIds.map(pid => {
    const partner = db.users.findById(pid);
    const between = mine.filter(m => m.fromUser === pid || m.toUser === pid);
    between.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const last = between[0];
    const unread = between.filter(m => m.fromUser === pid && !m.readAt).length;
    return {
      partner: partner ? {
        id: partner.id, name: partner.name, role: partner.role,
        avatarColor: partner.avatarColor, avatarUrl: partner.avatarUrl
      } : null,
      lastMessage: last?.body, lastAt: last?.createdAt, unread
    };
  }).filter(t => t.partner).sort((a, b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0));

  res.json({ count: threads.length, results: threads });
});

app.get("/api/messages/with/:userId", authRequired, (req, res) => {
  const other = Number(req.params.userId);
  const me = req.user.id;
  const msgs = db.messages.filter(m =>
    (m.fromUser === me && m.toUser === other) ||
    (m.fromUser === other && m.toUser === me)
  ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // Mark incoming as read
  msgs.forEach(m => {
    if (m.fromUser === other && !m.readAt) {
      db.messages.update(m.id, { readAt: new Date().toISOString() });
    }
  });

  res.json({ count: msgs.length, results: msgs.map(m => ({
    id: m.id, fromUser: m.fromUser, toUser: m.toUser,
    body: m.body, createdAt: m.createdAt, mine: m.fromUser === me
  })) });
});

app.post("/api/messages", authRequired, writeLimiter, (req, res) => {
  const { toUserId, body } = req.body || {};
  if (!toUserId || !body) return res.status(400).json({ error: "toUserId and body required" });
  const recipient = db.users.findById(Number(toUserId));
  if (!recipient) return res.status(404).json({ error: "Recipient not found" });
  if (recipient.id === req.user.id) return res.status(400).json({ error: "can't message yourself" });
  if (String(body).length > 2000) return res.status(400).json({ error: "message too long" });

  const msg = db.messages.insert({
    fromUser: req.user.id, toUser: Number(toUserId), body: String(body), readAt: null
  });
  res.status(201).json({ id: msg.id, ok: true, createdAt: msg.createdAt });
});

// ============================================================
// NOTIFICATIONS (lightweight: unread DM count + recent activity)
// ============================================================
app.get("/api/notifications", authRequired, (req, res) => {
  const me = req.user.id;
  const unreadDms = db.messages.count(m => m.toUser === me && !m.readAt);

  const myPostIds = db.posts.filter(p => p.userId === me).map(p => p.id);
  const recentLikes = db.postLikes.filter(l => myPostIds.includes(l.postId) && l.userId !== me)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  const recentComments = db.comments.filter(c => myPostIds.includes(c.postId) && c.userId !== me)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

  res.json({
    unreadDms,
    likes: recentLikes.map(l => {
      const u = db.users.findById(l.userId);
      return { postId: l.postId, by: u?.name || "Someone", at: l.createdAt };
    }),
    comments: recentComments.map(c => {
      const u = db.users.findById(c.userId);
      return { postId: c.postId, by: u?.name || "Someone", at: c.createdAt, snippet: String(c.body).slice(0, 60) };
    })
  });
});

// ============================================================
// EVENTS
// ============================================================
app.get("/api/events", (_req, res) => {
  const evs = db.events.all().sort((a, b) =>
    String(a.eventDate || "").localeCompare(String(b.eventDate || "")));
  res.json({ count: evs.length, results: evs.map(e => ({
    id: e.id, title: e.title, category: e.category, location: e.location,
    eventDate: e.eventDate, description: e.description
  })) });
});

// ============================================================
// SITE STATS
// ============================================================
app.get("/api/stats", (_req, res) => {
  const creators = db.creators.all();
  const ratings = creators.map(c => Number(c.rating) || 0).filter(Boolean);
  const avg = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : 0;
  const categories = new Set(creators.map(c => c.category)).size;
  const zones = new Set(creators.map(c => (c.location || "").split(",")[0].trim()).filter(Boolean)).size;

  res.json({
    creators: creators.length,
    categories,
    zones,
    avgRating: Number(avg.toFixed(1)),
    posts: db.posts.count(),
    jobs: db.jobs.count(j => j.open !== false),
    events: db.events.count(),
    users: db.users.count(),
    volunteers: db.contacts.count()
  });
});

// ============================================================
// AI SCOUT MATCH
// ============================================================
const KEYWORD_MAP = [
  { keys: ["dance", "dancer", "choreograph", "soukous", "rumba"],                cat: "Dancers" },
  { keys: ["sing", "singer", "music", "afrobeat", "vocal", "song"],              cat: "Musicians" },
  { keys: ["comed", "joke", "laugh", "funny", "stand-up", "standup", "emcee"],   cat: "Comedians" },
  { keys: ["poet", "poem", "spoken word", "verse", "recite"],                    cat: "Poets" },
  { keys: ["photo", "camera", "portrait", "shoot"],                              cat: "Photographers" },
  { keys: ["model", "fashion", "runway", "styling"],                             cat: "Models" },
  { keys: ["actor", "actress", "drama", "theatre", "theater"],                   cat: "Actors" },
  { keys: ["vlog", "tiktok", "influencer", "content", "filmmaker", "video"],     cat: "Content Creators" },
  { keys: ["cultural", "drum", "traditional", "troupe", "heritage"],             cat: "Cultural Groups" }
];

app.post("/api/match", (req, res) => {
  const prompt = String(req.body?.prompt || "").trim();
  if (!prompt) return res.status(400).json({ error: "prompt is required" });
  const t = prompt.toLowerCase();
  const hit = KEYWORD_MAP.find(e => e.keys.some(k => t.includes(k)));
  res.json({
    prompt, matchedCategory: hit?.cat || null,
    message: hit ? `Matched category: ${hit.cat}` : "No category detected — showing all creators"
  });
});

// ============================================================
// CONTACT / NEWSLETTER
// ============================================================
app.post("/api/contact", writeLimiter, (req, res) => {
  const { email, message } = req.body || {};
  if (!isEmail(email)) return res.status(400).json({ error: "valid email required" });
  db.contacts.insert({ email: String(email).toLowerCase(), message: String(message || "") });
  res.status(201).json({ ok: true });
});

// ============================================================
// DONATIONS
// ============================================================
app.post("/api/donations", writeLimiter, (req, res) => {
  const { name, email, amount, currency, message, anonymous } = req.body || {};
  const amt = Number(amount);
  if (!isEmail(email)) return res.status(400).json({ error: "valid email required" });
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: "amount must be a positive number" });
  const row = db.donations.insert({
    name: String(name || "").trim().slice(0, 80) || "Anonymous",
    email: String(email).toLowerCase(),
    amount: Math.round(amt * 100) / 100,
    currency: String(currency || "USD").toUpperCase().slice(0, 6),
    message: String(message || "").slice(0, 500),
    anonymous: !!anonymous
  });
  res.status(201).json({ ok: true, id: row.id });
});

// ============================================================
// ADMIN — overview + records (admin role / ADMIN_EMAILS only)
// ============================================================
app.get("/api/admin/summary", adminRequired, (_req, res) => {
  const total = db.donations.all().reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  res.json({
    users: db.users.count(),
    creators: db.creators.count(c => c.visible !== false),
    messages: db.contacts.count(),
    donations: db.donations.count(),
    donationTotal: Math.round(total * 100) / 100
  });
});

app.get("/api/admin/messages", adminRequired, (_req, res) => {
  const list = db.contacts.all()
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  res.json({ count: list.length, results: list });
});

app.get("/api/admin/people", adminRequired, (_req, res) => {
  const list = db.users.all().slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .map(u => {
      const creator = db.creators.find(c => c.userId === u.id);
      return {
        id: u.id, name: u.name, email: u.email, role: u.role,
        createdAt: u.createdAt, isAdmin: isAdmin(u),
        creator: creator ? {
          id: creator.id, category: creator.category,
          location: creator.location, tags: creator.tags || [],
          rating: creator.rating, visible: creator.visible !== false
        } : null
      };
    });
  res.json({ count: list.length, results: list });
});

app.get("/api/admin/donations", adminRequired, (_req, res) => {
  const list = db.donations.all().slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const total = list.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  res.json({
    count: list.length,
    total: Math.round(total * 100) / 100,
    results: list
  });
});

app.get("/api/admin/content", adminRequired, (_req, res) => {
  const sortByDate = (a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  const enrich = (row) => {
    const u = db.users.findById(row.userId);
    return { ...row, authorName: u?.name || null, authorEmail: u?.email || null };
  };
  res.json({
    posts:  db.posts.all().slice().sort(sortByDate).map(enrich),
    jobs:   db.jobs.all().slice().sort(sortByDate),
    events: db.events.all().slice().sort(sortByDate),
    creators: db.creators.all().slice().sort(sortByDate).map(enrich)
  });
});

// ---------- Admin: delete / mutate ----------
function cascadeDeleteUser(userId) {
  const id = Number(userId);
  db.creators.remove(c => c.userId === id);
  db.posts.remove(p => p.userId === id);
  db.postLikes.remove(l => l.userId === id);
  db.comments.remove(c => c.userId === id);
  db.applications.remove(a => a.userId === id);
  db.messages.remove(m => m.fromUserId === id || m.toUserId === id);
  db.users.remove(u => u.id === id);
}

app.delete("/api/admin/users/:id", adminRequired, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
  if (id === req.adminUser.id) return res.status(400).json({ error: "You can't delete your own admin account." });
  const target = db.users.findById(id);
  if (!target) return res.status(404).json({ error: "user not found" });
  cascadeDeleteUser(id);
  res.json({ ok: true, deleted: { id, name: target.name, email: target.email } });
});

app.patch("/api/admin/users/:id", adminRequired, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
  const target = db.users.findById(id);
  if (!target) return res.status(404).json({ error: "user not found" });
  const patch = {};
  const allowed = ["name", "email", "role", "bio"];
  for (const k of allowed) if (req.body?.[k] !== undefined) patch[k] = String(req.body[k]).trim();
  if (patch.email !== undefined) {
    if (!isEmail(patch.email)) return res.status(400).json({ error: "invalid email" });
    patch.email = patch.email.toLowerCase();
    const clash = db.users.find(u => u.email === patch.email && u.id !== id);
    if (clash) return res.status(409).json({ error: "another user already uses that email" });
  }
  if (id === req.adminUser.id && patch.role && patch.role.toLowerCase() !== "admin") {
    return res.status(400).json({ error: "You can't demote your own admin account." });
  }
  const updated = db.users.update(id, patch);
  res.json({ ok: true, user: publicUser(updated) });
});

app.delete("/api/admin/messages/:id", adminRequired, (req, res) => {
  const id = Number(req.params.id);
  if (!db.contacts.findById(id)) return res.status(404).json({ error: "message not found" });
  db.contacts.remove(m => m.id === id);
  res.json({ ok: true, deletedId: id });
});

app.post("/api/admin/messages/:id/reply", adminRequired, (req, res) => {
  const id = Number(req.params.id);
  const target = db.contacts.findById(id);
  if (!target) return res.status(404).json({ error: "message not found" });
  const body = String(req.body?.body || "").trim();
  if (!body) return res.status(400).json({ error: "reply body required" });
  const reply = {
    body: body.slice(0, 4000),
    by: req.adminUser.name || req.adminUser.email,
    at: new Date().toISOString()
  };
  const replies = Array.isArray(target.replies) ? target.replies.slice() : [];
  replies.push(reply);
  const updated = db.contacts.update(id, { replies, status: "replied" });
  res.json({ ok: true, message: updated });
});

app.delete("/api/admin/donations/:id", adminRequired, (req, res) => {
  const id = Number(req.params.id);
  if (!db.donations.findById(id)) return res.status(404).json({ error: "donation not found" });
  db.donations.remove(d => d.id === id);
  res.json({ ok: true, deletedId: id });
});

app.delete("/api/admin/creators/:id", adminRequired, (req, res) => {
  const id = Number(req.params.id);
  if (!db.creators.findById(id)) return res.status(404).json({ error: "creator not found" });
  db.creators.remove(c => c.id === id);
  res.json({ ok: true, deletedId: id });
});

app.patch("/api/admin/creators/:id", adminRequired, (req, res) => {
  const id = Number(req.params.id);
  const target = db.creators.findById(id);
  if (!target) return res.status(404).json({ error: "creator not found" });
  const patch = {};
  const allowed = ["category", "location", "bio", "tagline", "story", "quote", "rating", "visible"];
  for (const k of allowed) if (req.body?.[k] !== undefined) patch[k] = req.body[k];
  const updated = db.creators.update(id, patch);
  res.json({ ok: true, creator: publicCreator(updated) });
});

app.delete("/api/admin/posts/:id", adminRequired, (req, res) => {
  const id = Number(req.params.id);
  if (!db.posts.findById(id)) return res.status(404).json({ error: "post not found" });
  db.posts.remove(p => p.id === id);
  db.postLikes.remove(l => l.postId === id);
  db.comments.remove(c => c.postId === id);
  res.json({ ok: true, deletedId: id });
});

app.delete("/api/admin/jobs/:id", adminRequired, (req, res) => {
  const id = Number(req.params.id);
  if (!db.jobs.findById(id)) return res.status(404).json({ error: "job not found" });
  db.jobs.remove(j => j.id === id);
  db.applications.remove(a => a.jobId === id);
  res.json({ ok: true, deletedId: id });
});

app.delete("/api/admin/events/:id", adminRequired, (req, res) => {
  const id = Number(req.params.id);
  if (!db.events.findById(id)) return res.status(404).json({ error: "event not found" });
  db.events.remove(e => e.id === id);
  res.json({ ok: true, deletedId: id });
});

// ---------- Admin: create/edit content ----------
app.post("/api/admin/jobs", adminRequired, (req, res) => {
  const { title, category, location, eventDate, pay, description, open } = req.body || {};
  if (!title || !category) return res.status(400).json({ error: "title and category required" });
  const job = db.jobs.insert({
    postedBy: req.adminUser.id,
    title: String(title).trim(),
    category: String(category).trim(),
    location: String(location || "").trim(),
    eventDate: String(eventDate || "").trim(),
    pay: Number(pay) || 0,
    description: String(description || "").trim(),
    open: open === false ? false : true
  });
  res.status(201).json({ ok: true, job });
});

app.patch("/api/admin/jobs/:id", adminRequired, (req, res) => {
  const id = Number(req.params.id);
  const target = db.jobs.findById(id);
  if (!target) return res.status(404).json({ error: "job not found" });
  const patch = {};
  const text = ["title", "category", "location", "eventDate", "description"];
  for (const k of text) if (req.body?.[k] !== undefined) patch[k] = String(req.body[k]).trim();
  if (req.body?.pay !== undefined) patch.pay = Number(req.body.pay) || 0;
  if (req.body?.open !== undefined) patch.open = !!req.body.open;
  const updated = db.jobs.update(id, patch);
  res.json({ ok: true, job: updated });
});

app.post("/api/admin/events", adminRequired, (req, res) => {
  const { title, category, location, eventDate, description } = req.body || {};
  if (!title) return res.status(400).json({ error: "title required" });
  const ev = db.events.insert({
    title: String(title).trim(),
    category: String(category || "").trim(),
    location: String(location || "").trim(),
    eventDate: String(eventDate || "").trim(),
    description: String(description || "").trim()
  });
  res.status(201).json({ ok: true, event: ev });
});

app.patch("/api/admin/events/:id", adminRequired, (req, res) => {
  const id = Number(req.params.id);
  const target = db.events.findById(id);
  if (!target) return res.status(404).json({ error: "event not found" });
  const patch = {};
  const fields = ["title", "category", "location", "eventDate", "description"];
  for (const k of fields) if (req.body?.[k] !== undefined) patch[k] = String(req.body[k]).trim();
  const updated = db.events.update(id, patch);
  res.json({ ok: true, event: updated });
});

app.patch("/api/admin/posts/:id", adminRequired, (req, res) => {
  const id = Number(req.params.id);
  const target = db.posts.findById(id);
  if (!target) return res.status(404).json({ error: "post not found" });
  const patch = {};
  if (req.body?.body !== undefined) patch.body = String(req.body.body).slice(0, 4000);
  if (req.body?.imageUrl !== undefined) patch.imageUrl = req.body.imageUrl ? String(req.body.imageUrl) : null;
  const updated = db.posts.update(id, patch);
  res.json({ ok: true, post: updated });
});

app.get("/api/admin/comments", adminRequired, (_req, res) => {
  const list = db.comments.all().slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .map(c => {
      const u = db.users.findById(c.userId);
      const post = db.posts.findById(c.postId);
      const postAuthor = post ? db.users.findById(post.userId) : null;
      return {
        id: c.id, postId: c.postId, body: c.body, createdAt: c.createdAt,
        authorName: u?.name || null, authorEmail: u?.email || null,
        postSnippet: post ? String(post.body || "").slice(0, 80) : null,
        postAuthor: postAuthor?.name || null
      };
    });
  res.json({ count: list.length, results: list });
});

app.patch("/api/admin/comments/:id", adminRequired, (req, res) => {
  const id = Number(req.params.id);
  const target = db.comments.findById(id);
  if (!target) return res.status(404).json({ error: "comment not found" });
  const body = String(req.body?.body || "").slice(0, 2000);
  if (!body) return res.status(400).json({ error: "body required" });
  const updated = db.comments.update(id, { body });
  res.json({ ok: true, comment: updated });
});

app.delete("/api/admin/comments/:id", adminRequired, (req, res) => {
  const id = Number(req.params.id);
  if (!db.comments.findById(id)) return res.status(404).json({ error: "comment not found" });
  db.comments.remove(c => c.id === id);
  res.json({ ok: true, deletedId: id });
});

// ============================================================
// UPLOAD (avatar)
// ============================================================
app.post("/api/upload/avatar", authRequired, writeLimiter, upload.single("avatar"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "avatar file required" });
  const url = `/uploads/${req.file.filename}`;
  db.users.update(req.user.id, { avatarUrl: url });
  res.json({ ok: true, avatarUrl: url });
});

// ============================================================
// SEO: sitemap
// ============================================================
app.get("/sitemap.xml", (req, res) => {
  const base = `${req.protocol}://${req.get("host")}`;
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: "/",                priority: "1.0", changefreq: "weekly" },
    { loc: "/#about",          priority: "0.8", changefreq: "monthly" },
    { loc: "/#programs",       priority: "0.8", changefreq: "monthly" },
    { loc: "/#stories",        priority: "0.9", changefreq: "weekly" },
    { loc: "/#events",         priority: "0.9", changefreq: "weekly" },
    { loc: "/#opportunities",  priority: "0.9", changefreq: "weekly" },
    { loc: "/#news",           priority: "0.7", changefreq: "weekly" },
    { loc: "/#get-involved",   priority: "0.8", changefreq: "monthly" },
    { loc: "/#contact",        priority: "0.6", changefreq: "monthly" }
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u =>
  `  <url><loc>${base}${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
).join("\n")}
</urlset>`;
  res.type("application/xml").send(xml);
});

// ============================================================
// HEALTH + ERROR HANDLER + 404
// ============================================================
const startedAt = Date.now();
app.get("/api/health", (_req, res) => res.json({
  status: "ok", time: new Date().toISOString(),
  uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
  version: require("./package.json").version
}));

// API 404
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

app.use((err, _req, res, _next) => {
  if (err && /file size|Only PNG/i.test(err.message)) {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

// SPA fallback for unknown non-API GETs
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

// ------------------------------------------------------------
// Start
// ------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n🎨 Kakuma Creative Zone v${require("./package.json").version} running at http://localhost:${PORT}`);
  console.log(`   Demo logins: amani@kcz.dev / chuol@kcz.dev / halima@kcz.dev ...  (password: demo1234)\n`);
});
