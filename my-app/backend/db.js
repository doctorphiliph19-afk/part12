// ============================================================
// Pure-JS JSON-file data store (zero native deps).
// Models collections with simple query helpers and atomic writes.
// ============================================================
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// ------------------------------------------------------------
// Collection factory
// ------------------------------------------------------------
function loadCollection(name) {
  const file = path.join(DATA_DIR, `${name}.json`);
  let rows;
  try {
    rows = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
  } catch {
    rows = [];
  }
  // Track auto-increment id
  let nextId = rows.reduce((m, r) => Math.max(m, r.id || 0), 0) + 1;

  function persist() {
    fs.writeFileSync(file, JSON.stringify(rows, null, 2));
  }

  return {
    all: () => rows.slice(),
    find: (pred) => rows.find(pred),
    filter: (pred) => rows.filter(pred),
    findById: (id) => rows.find(r => r.id === Number(id)),
    insert(row) {
      const created = { id: nextId++, createdAt: new Date().toISOString(), ...row };
      rows.push(created);
      persist();
      return created;
    },
    update(id, patch) {
      const idx = rows.findIndex(r => r.id === Number(id));
      if (idx === -1) return null;
      rows[idx] = { ...rows[idx], ...patch };
      persist();
      return rows[idx];
    },
    upsert(predicate, row) {
      const idx = rows.findIndex(predicate);
      if (idx === -1) return this.insert(row);
      rows[idx] = { ...rows[idx], ...row };
      persist();
      return rows[idx];
    },
    remove(pred) {
      const before = rows.length;
      rows = rows.filter(r => !pred(r));
      if (rows.length !== before) persist();
    },
    count: (pred) => pred ? rows.filter(pred).length : rows.length
  };
}

// ------------------------------------------------------------
// DB
// ------------------------------------------------------------
const db = {
  users:        loadCollection("users"),
  creators:     loadCollection("creators"),
  posts:        loadCollection("posts"),
  postLikes:    loadCollection("post_likes"),
  comments:     loadCollection("comments"),
  jobs:         loadCollection("jobs"),
  applications: loadCollection("applications"),
  messages:     loadCollection("messages"),
  events:       loadCollection("events"),
  contacts:     loadCollection("contacts"),
  donations:    loadCollection("donations")
};

// ------------------------------------------------------------
// Seed (only on empty DB)
// ------------------------------------------------------------
const SEED_PASSWORD = "demo1234";

if (db.users.count() === 0) {
  const hash = bcrypt.hashSync(SEED_PASSWORD, 10);

  const SEED = [
    { name: "Chuol Mabiel", email: "chuol@kcz.dev", role: "Artist", color: "linear-gradient(135deg,#f59e0b,#ef4444)",
      creator: { category: "Musicians", location: "Kakuma 2, Zone 3", rating: 4.9,
        bio: "Talented South Sudanese recording artist mixing traditional Nuer instruments with modern Afrobeat rhythms about peace, unity, and resilience.",
        tags: ["Afrobeat", "Songwriting", "Vocals", "Nuer Folk", "Live Performance"] } },
    { name: "Amani Bahati", email: "amani@kcz.dev", role: "Artist", color: "linear-gradient(135deg,#10b981,#06b6d4)",
      creator: { category: "Dancers", location: "Kakuma 1, Zone 1", rating: 4.8,
        bio: "Energetic dancer, choreographer, and founder of the 'Let's Dance Kakuma' collective from Kivu, DR Congo.",
        tags: ["Choreography", "Soukous", "Afro-House", "Rumba", "Mutuashi", "Workshops"] } },
    { name: "Halima Yusuf", email: "halima@kcz.dev", role: "Artist", color: "linear-gradient(135deg,#f59e0b,#ec4899)",
      creator: { category: "Poets", location: "Kakuma 3, Zone 2", rating: 5.0,
        bio: "Vibrant young Somali poet and spoken word storyteller preserving Somali heritage in Kakuma through verse.",
        tags: ["Spoken Word Poetry", "Buraanbur (Somali Women's Poetry)", "Storytelling", "Heritage", "Migration"] } },
    { name: "Dj Casper", email: "casper@kcz.dev", role: "Brand", color: "linear-gradient(135deg,#6366f1,#8b5cf6)",
      creator: { category: "Photographers", location: "Kakuma Town (Host Community)", rating: 4.7,
        bio: "Visual artist and photographer from the Turkana Host Community bridging host & refugee narratives through Canon and storytelling.",
        tags: ["Portrait Photography", "Event Photography", "Video Editing", "Landscape", "Fashion"] } },
    { name: "MC Nicnamy", email: "nicnamy@kcz.dev", role: "Comedian", color: "linear-gradient(135deg,#ec4899,#f43f5e)",
      creator: { category: "Comedians", location: "Kakuma 4, Zone 1", rating: 4.9,
        bio: "Hilarious stand-up comedian performing in Swahili, Kirundi, and French about daily camp life and survival adaptations.",
        tags: ["Standup Comedy", "Improv", "Event Emceeing", "Swahili", "Kirundi"] } },
    { name: "Kakuma Stars Cultural Group", email: "stars@kcz.dev", role: "Cultural Group", color: "linear-gradient(135deg,#7c3aed,#06b6d4)",
      creator: { category: "Cultural Groups", location: "Kakuma 4, Zone 1", rating: 4.9,
        bio: "Multi-national troupe of 17 dancers and musicians from Burundi, Rwanda, South Sudan, Sudan, and Somalia preserving indigenous rhythms.",
        tags: ["Traditional Drumming", "Cultural Dance Troupe", "Theatrical Storytelling", "Welcome Dances"] } },
    { name: "Nyaboth Deng", email: "nyaboth@kcz.dev", role: "Artist", color: "linear-gradient(135deg,#d946ef,#8b5cf6)",
      creator: { category: "Models", location: "Kakuma 3, Zone 1", rating: 4.8,
        bio: "High-fashion model and experimental fabric designer crafting sustainable afro-futuristic clothing in her Kakuma 3 atelier.",
        tags: ["Runway Modeling", "Fashion Styling", "Sustainable Textile Design", "Afro-Futurism", "Beadwork"] } },
    { name: "khim shady", email: "khim@kcz.dev", role: "Artist", color: "linear-gradient(135deg,#06b6d4,#3b82f6)",
      creator: { category: "Content Creators", location: "Kakuma 4, Zone 3", rating: 4.9,
        bio: "Digital native and cinematic mobile filmmaker from the Congolese diaspora — shoots vlogs and micro-docs on iPhone 11.",
        tags: ["Mobile Videography", "CapCut Video Editing", "Viral Content Strategy", "Vlogs", "Micro-docs"] } }
  ];

  const userIds = {};
  for (const u of SEED) {
    const user = db.users.insert({
      email: u.email, passwordHash: hash, name: u.name, role: u.role,
      avatarColor: u.color, avatarUrl: null
    });
    userIds[u.name] = user.id;
    db.creators.insert({
      userId: user.id, category: u.creator.category, location: u.creator.location,
      rating: u.creator.rating, bio: u.creator.bio, tags: u.creator.tags, visible: true
    });
  }

  db.posts.insert({ userId: userIds["Amani Bahati"],
    body: "Wrapped up an electric Soukous workshop with 40 youth in Kakuma 1 today! Energy was off the charts. 🔥💃", imageUrl: null });
  db.posts.insert({ userId: userIds["Chuol Mabiel"],
    body: "New single 'Hope on the Horizon' drops this Friday. Recorded right here in Kakuma 2 with a borrowed mic and a whole lot of heart. 🎶", imageUrl: null });
  db.posts.insert({ userId: userIds["Halima Yusuf"],
    body: "'We are the daughters of the wind, of borders crossed and stories kept.' A line from tonight's open mic in Kakuma 3. 🌙", imageUrl: null });
  db.posts.insert({ userId: userIds["khim shady"],
    body: "Dropped a new mini-doc on the rising fashion scene in Kakuma 4. Watch link in bio. Filmed entirely on iPhone 11. 🎬", imageUrl: null });

  db.jobs.insert({ postedBy: userIds["Dj Casper"],    title: "Event Photographer — UNHCR World Refugee Day", category: "Photography", location: "Kakuma Main Office",      eventDate: "2026-06-20", pay: 18000, description: "Cover World Refugee Day events. Deliver edited gallery within 72 hours.", open: true });
  db.jobs.insert({ postedBy: userIds["Dj Casper"],    title: "Live Performer — Cultural Exchange Night",     category: "Music",       location: "Turkana County Hall",     eventDate: "2026-07-05", pay: 25000, description: "Open performance slot for a 30-minute live set.", open: true });
  db.jobs.insert({ postedBy: userIds["Nyaboth Deng"], title: "Documentary Editor — 5-min NGO short",         category: "Video",       location: "Remote (Kakuma-based)",   eventDate: "Rolling",    pay: 35000, description: "Edit raw footage into a 5-minute documentary short.", open: true });
  db.jobs.insert({ postedBy: userIds["Nyaboth Deng"], title: "Lookbook Model — Sustainable Fashion Brand",   category: "Modeling",    location: "Kakuma 3 Atelier",        eventDate: "2026-08-02", pay: 22000, description: "Half-day lookbook shoot for the Spring '26 collection.", open: true });

  db.events.insert({ title: "Kakuma Unity Music Festival", category: "Concert",  location: "Kakuma 2 Open Grounds",     eventDate: "2026-06-21", description: "Headlined by Chuol Mabiel + 6 other camp artists. Free entry." });
  db.events.insert({ title: "Soukous Dance Masterclass",   category: "Workshop", location: "Kakuma 1, Zone 1 Hall",     eventDate: "2026-07-04", description: "Led by Amani Bahati. Beginner-friendly. Bring water." });
  db.events.insert({ title: "Spoken Word Night",           category: "Open Mic", location: "Kakuma 3 Community Library", eventDate: "2026-07-12", description: "Hosted by Halima Yusuf. Poets, storytellers and listeners welcome." });

  console.log(`✅ Seeded ${SEED.length} creators (demo password: ${SEED_PASSWORD})`);
}

module.exports = db;
