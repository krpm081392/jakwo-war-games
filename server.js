// =====================================================================
// JAKWO WARZONE - Server
// 24/7 endless meme war pixel multiplayer browser game
// Express + Socket.IO, server-authoritative simulation
// =====================================================================

const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------
const WORLD_SIZE = 5000;
const MAX_PLAYERS = 100;
const MAX_BOTS = 50;
const TICK_RATE = 30; // simulation ticks per second
const BROADCAST_RATE = 12; // state broadcasts per second
const SPAWN_PROTECTION_MS = 10000;
const MAX_LIVES = 3;
const BASE_SPEED = 165; // px/sec
const DASH_DISTANCE = 130;
const DASH_COOLDOWN_MS = 3000;
const MAX_HP = 100;
const PICKUP_RADIUS = 72; // easier pickup for phones/PC
const TRAP_RADIUS = 22;
const BOSS_MIN_INTERVAL = 2 * 60 * 1000; // test build: boss appears fast
const BOSS_MAX_INTERVAL = 4 * 60 * 1000;
const BOSS_MAX_HP = 5000;
const SUPER_MODE_MS = 60000;
const EVENT_MIN_GAP = 3 * 60 * 1000;
const EVENT_MAX_GAP = 6 * 60 * 1000;

function now() { return Date.now(); }
function rid() { return crypto.randomBytes(6).toString("hex"); }
function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function angleDiff(a, b) {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}
function randomPos() {
  return { x: rand(80, WORLD_SIZE - 80), y: rand(80, WORLD_SIZE - 80) };
}

// ---------------------------------------------------------------------
// WEAPON DEFINITIONS
// ---------------------------------------------------------------------
const WEAPONS = {
  fists:     { name: "Fists",         dmg: 5,  range: 55,  cone: 80,  cooldown: 450,  ammo: null, aoe: 0 },
  sword:     { name: "Sword",         dmg: 13, range: 68,  cone: 95,  cooldown: 480,  ammo: null, aoe: 0 },
  knife:     { name: "Knife",         dmg: 9,  range: 58,  cone: 90,  cooldown: 330,  ammo: null, aoe: 0 },
  scythe:    { name: "Dark Scythe",   dmg: 18, range: 82,  cone: 110, cooldown: 760,  ammo: null, aoe: 0 },
  pistol:    { name: "Pistol",        dmg: 9,  range: 210, cone: 18,  cooldown: 480,  ammo: 14,   aoe: 0 },
  revolver:  { name: "Revolver",      dmg: 14, range: 230, cone: 16,  cooldown: 620,  ammo: 6,    aoe: 0 },
  rifle:     { name: "Rifle",         dmg: 11, range: 310, cone: 12,  cooldown: 430,  ammo: 25,   aoe: 0 },
  shotgun:   { name: "Shotgun",       dmg: 16, range: 130, cone: 46,  cooldown: 760,  ammo: 6,    aoe: 0 },
  bow:       { name: "Bow",           dmg: 13, range: 270, cone: 10,  cooldown: 620,  ammo: 10,   aoe: 0 },
  grenade:   { name: "Grenade",       dmg: 24, range: 200, cone: 360, cooldown: 1600, ammo: 3,    aoe: 90 },
  fireball:  { name: "Fireball",      dmg: 18, range: 210, cone: 24,  cooldown: 850,  ammo: 8,    aoe: 0 },
  shockwave: { name: "Shockwave",     dmg: 11, range: 110, cone: 360, cooldown: 1300, ammo: 5,    aoe: 0 },
  gloves:    { name: "Boxing Gloves", dmg: 12, range: 56,  cone: 80,  cooldown: 380,  ammo: null, aoe: 0 },
  board:     { name: "Flying Board",  dmg: 0,  range: 0,   cone: 0,   cooldown: 0,    ammo: null, aoe: 0, mobility: true }
};
const SUPER_ATTACK = { name: "Energy Blast", dmg: 22, range: 260, cone: 30, cooldown: 400, ammo: null, aoe: 0 };
const GROUND_WEAPON_POOL = ["sword", "knife", "scythe", "pistol", "revolver", "rifle", "shotgun", "bow", "grenade", "fireball", "shockwave", "gloves", "board"];

const BOT_NAMES = [
  "MemeLord420", "DogeWarrior", "PixelPepe", "ChadBoyo", "SadCatGen", "GigaChad99",
  "FrogKing", "WojakWanderer", "ChonkyBoi", "RizzMaster", "SigmaGremlin", "BasedBandit",
  "CringeSlayer", "GoblinMode", "SkibidiSnipe", "OhioOutlaw", "RatioKing", "BrainrotBoss",
  "NPCNumber9", "CapybaraCrew", "TrollFace2", "VibeChecker", "DripGoblin", "AuraFarmer",
  "MidWestEmu", "FanumTaxer", "GyattGuard", "ShrekIsLove", "DoomerDude", "BloxyFruit"
];
const BOT_FACES = ["🐸", "🐶", "🐱", "🦊", "🐵", "🤖", "👽", "💀", "🐼", "🦄", "🐯", "🐔", "🐹", "🦝", "🐙"];
const BOT_CHAT = [
  "skibidi rizz fr fr", "ratio + L + you fell off", "this map mid ngl", "GG EZ", "lowkey sus",
  "no cap that hurt", "sigma grindset activated", "bro thinks he's him", "certified meme moment",
  "where loot at", "bush camping is crime", "rip bozo", "touch grass lol", "W gameplay", "L take"
];

// ---------------------------------------------------------------------
// WORLD STATE
// ---------------------------------------------------------------------
const players = new Map();   // socketId -> player
const bots = new Map();      // botId -> bot
const groundWeapons = new Map();
const mysteryBoxes = new Map();
const traps = new Map();
const zombies = new Map();
const bossFireballs = new Map();

let boss = null;
let nextBossAt = now() + 30000; // first boss fast for testing
let activeEvent = null;
let nextEventAt = now() + randInt(EVENT_MIN_GAP, EVENT_MAX_GAP);

// ---- static decorations (generated once, sent to clients) ----
const decorations = { trees: [], bushes: [], rocks: [], ponds: [] };
for (let i = 0; i < 320; i++) decorations.trees.push({ x: rand(0, WORLD_SIZE), y: rand(0, WORLD_SIZE), s: rand(0.8, 1.4) });
for (let i = 0; i < 130; i++) decorations.bushes.push({ id: rid(), x: rand(0, WORLD_SIZE), y: rand(0, WORLD_SIZE), r: rand(45, 75) });
for (let i = 0; i < 90; i++) decorations.rocks.push({ x: rand(0, WORLD_SIZE), y: rand(0, WORLD_SIZE), s: rand(0.7, 1.3) });
for (let i = 0; i < 10; i++) decorations.ponds.push({ x: rand(0, WORLD_SIZE), y: rand(0, WORLD_SIZE), rx: rand(55, 125), ry: rand(35, 85) });

// ---- boxing rings (fixed locations) ----
const rings = [0, 1, 2, 3].map(() => ({ id: rid(), x: rand(600, WORLD_SIZE - 600), y: rand(600, WORLD_SIZE - 600), radius: 180, occupants: [] }));

// Static map objects drawn by the client and blocked by the server.
// Keep this list small for performance. Trees/rocks use circle collision below.
const setPieces = [
  { name: "mushroom_falls", x: 2450, y: 900, w: 380, h: 380, blockR: 160 },
  { name: "island_home2", x: 780, y: 2550, w: 360, h: 260, blockR: 130 },
  { name: "bridge_river", x: 1700, y: 2500, w: 420, h: 290, blockR: 115 },
  { name: "frog_pond", x: 3800, y: 2200, w: 260, h: 220, blockR: 95 },
  { name: "pond2", x: 3300, y: 3600, w: 250, h: 160, blockR: 90 },
  { name: "castle_ruin", x: 4300, y: 650, w: 300, h: 270, blockR: 135 },
  { name: "island_house", x: 740, y: 760, w: 250, h: 175, blockR: 105 },
  { name: "bridge_scene", x: 1250, y: 760, w: 260, h: 195, blockR: 70 },
  { name: "mushroom_island", x: 4000, y: 820, w: 170, h: 250, blockR: 90 },
  { name: "sheep_patch", x: 1180, y: 4100, w: 230, h: 230, blockR: 90 },
  { name: "house", x: 870, y: 1050, w: 120, h: 95, blockR: 58 },
  { name: "mushroom", x: 1140, y: 1170, w: 105, h: 125, blockR: 55 },
  { name: "shop", x: 4200, y: 3900, w: 150, h: 110, blockR: 70 },
  { name: "campfire", x: 1020, y: 820, w: 52, h: 52, blockR: 24 },
  { name: "castle", x: 4300, y: 720, w: 230, h: 205, blockR: 115 },
  { name: "bossisland", x: 2500, y: 2500, w: 310, h: 230, blockR: 135 },
  { name: "skulls", x: 2750, y: 2560, w: 80, h: 62, blockR: 38 },
  { name: "tree_fallen", x: 1600, y: 1220, w: 120, h: 80, blockR: 42 },
  { name: "tree_fallen", x: 3300, y: 3150, w: 120, h: 80, blockR: 42 },
  { name: "tree_old", x: 3650, y: 1700, w: 170, h: 145, blockR: 70 },
  { name: "tree_big", x: 2050, y: 3650, w: 170, h: 165, blockR: 70 },
  { name: "tree_pink", x: 850, y: 3100, w: 155, h: 155, blockR: 65 },
  { name: "tree_autumn", x: 3000, y: 900, w: 140, h: 175, blockR: 65 }
];

// =====================================================================
// HELPERS: entity creation
// =====================================================================
function freshEffects() {
  return {
    slowUntil: 0, tinyUntil: 0, reverseUntil: 0, jumpyUntil: 0,
    shieldUntil: 0, doubleDmgUntil: 0, speedBoostUntil: 0, boardUntil: 0, superModeUntil: 0
  };
}

function createPlayer(socketId, name, face, isMobile) {
  const pos = randomPos();
  return {
    id: socketId, socketId, isBot: false, isMobile: !!isMobile,
    name: (name || "Player").slice(0, 16),
    face: face || "emoji:🙂",
    x: pos.x, y: pos.y, aimAngle: 0,
    hp: MAX_HP, maxHp: MAX_HP, lives: 1, alive: true,
    weapon: "fists", ammo: null,
    kills: 0, deaths: 0, streak: 0,
    lastAttackTime: 0, dashCooldownUntil: 0,
    spawnProtectedUntil: now() + SPAWN_PROTECTION_MS,
    effects: freshEffects(),
    inBush: false, inRing: null, superMode: false,
    input: { mx: 0, my: 0 },
    lastChat: "", lastChatTime: 0,
    lastKothHeal: 0
  };
}

function createBot(id) {
  const pos = randomPos();
  return {
    id, isBot: true,
    name: BOT_NAMES[randInt(0, BOT_NAMES.length - 1)] + randInt(1, 99),
    face: "emoji:" + BOT_FACES[randInt(0, BOT_FACES.length - 1)],
    x: pos.x, y: pos.y, aimAngle: 0,
    hp: MAX_HP, maxHp: MAX_HP, lives: 1, alive: true,
    weapon: "fists", ammo: null,
    kills: 0, deaths: 0, streak: 0,
    lastAttackTime: 0, dashCooldownUntil: 0,
    spawnProtectedUntil: now() + SPAWN_PROTECTION_MS,
    effects: freshEffects(),
    inBush: false, inRing: null, superMode: false,
    input: { mx: 0, my: 0 },
    lastChat: "", lastChatTime: 0,
    lastKothHeal: 0,
    aiState: "wander", wanderDir: rand(0, Math.PI * 2), nextWanderChange: 0,
    nextThinkAt: 0, nextChatAt: now() + randInt(8000, 20000)
  };
}

for (let i = 0; i < MAX_BOTS; i++) {
  const b = createBot(rid());
  bots.set(b.id, b);
}

function spawnGroundWeapon() {
  if (groundWeapons.size >= 40) return;
  const type = GROUND_WEAPON_POOL[randInt(0, GROUND_WEAPON_POOL.length - 1)];
  const pos = randomPos();
  const id = rid();
  groundWeapons.set(id, { id, type, x: pos.x, y: pos.y, expireAt: now() + randInt(15000, 30000) });
}
function spawnMysteryBox() {
  if (mysteryBoxes.size >= 25) return;
  const pos = randomPos();
  const id = rid();
  mysteryBoxes.set(id, { id, x: pos.x, y: pos.y, expireAt: now() + randInt(15000, 30000) });
}
const TRAP_TYPES = ["worm", "bug", "frog", "snail"];
function spawnTrap() {
  if (traps.size >= 32) return;
  const type = TRAP_TYPES[randInt(0, TRAP_TYPES.length - 1)];
  const pos = randomPos();
  const id = rid();
  traps.set(id, { id, type, x: pos.x, y: pos.y, dir: rand(0, Math.PI * 2), nextTurn: now() + randInt(1000, 3000) });
}
for (let i = 0; i < 30; i++) spawnGroundWeapon();
for (let i = 0; i < 18; i++) spawnMysteryBox();
for (let i = 0; i < 28; i++) spawnTrap();

// =====================================================================
// COMBAT
// =====================================================================
function ringCompatible(a, b) {
  if (a.inRing || b.inRing) return a.inRing && b.inRing && a.inRing === b.inRing;
  return true;
}

function allTargets() {
  const arr = [];
  for (const p of players.values()) arr.push(p);
  for (const b of bots.values()) arr.push(b);
  for (const z of zombies.values()) arr.push(z);
  if (boss) arr.push(boss);
  return arr;
}

function applyDamage(attacker, target, baseDmg) {
  let dmg = baseDmg;
  if (attacker.effects && now() < attacker.effects.doubleDmgUntil) dmg *= 2;
  if (target.effects && now() < target.effects.shieldUntil) dmg *= 0.5;
  if (target.superMode) dmg *= 0.5;
  target.hp -= dmg;
  if (target.hp > 0) return;
  target.hp = 0;

  if (target.isBoss) {
    if (attacker.kills !== undefined && attacker !== target) attacker.kills++;
    handleBossDeath();
    return;
  }

  if (target.isZombie) {
    zombies.delete(target.id);
    if (attacker.kills !== undefined && attacker !== target) attacker.kills++;
    return;
  }

  target.lives -= 1;
  target.deaths = (target.deaths || 0) + 1;
  if (attacker !== target && attacker.kills !== undefined) {
    attacker.kills++;
    attacker.streak = (attacker.streak || 0) + 1;
  }
  leaveRing(target);

  if (target.lives > 0) {
    respawnEntity(target);
  } else {
    target.alive = false;
    target.streak = 0;
    if (target.isBot) {
      bots.delete(target.id);
      setTimeout(() => {
        if (bots.size < MAX_BOTS) {
          const nb = createBot(rid());
          bots.set(nb.id, nb);
        }
      }, randInt(3000, 8000));
    } else {
      const sock = io.sockets.sockets.get(target.socketId);
      if (sock) sock.emit("eliminated", { kills: target.kills, deaths: target.deaths });
      players.delete(target.socketId);
    }
  }
}

function respawnEntity(e) {
  const pos = randomPos();
  e.x = pos.x; e.y = pos.y;
  e.hp = e.maxHp;
  e.alive = true;
  e.weapon = "fists";
  e.ammo = null;
  e.effects = freshEffects();
  e.superMode = false;
  e.spawnProtectedUntil = now() + SPAWN_PROTECTION_MS;
  leaveRing(e);
}

function leaveRing(e) {
  if (e.inRing) {
    const ring = rings.find(r => r.id === e.inRing);
    if (ring) ring.occupants = ring.occupants.filter(id => id !== e.id && id !== e.socketId);
    e.inRing = null;
  }
}

function performAttack(attacker) {
  const t = now();
  if (!attacker.alive) return;
  if (t < attacker.spawnProtectedUntil) return;
  const def = attacker.superMode ? SUPER_ATTACK : WEAPONS[attacker.weapon];
  if (!def || def.mobility) return;
  if (t - attacker.lastAttackTime < def.cooldown) return;
  attacker.lastAttackTime = t;

  let aoePoint = null;
  if (def.aoe) {
    aoePoint = { x: attacker.x + Math.cos(attacker.aimAngle) * def.range, y: attacker.y + Math.sin(attacker.aimAngle) * def.range };
  }

  for (const target of allTargets()) {
    if (target === attacker) continue;
    if (!target.alive) continue;
    if (target.spawnProtectedUntil && t < target.spawnProtectedUntil) continue;
    if (!ringCompatible(attacker, target)) continue;

    let inRange = false;
    if (aoePoint) {
      inRange = dist(target, aoePoint) <= def.aoe;
    } else {
      const d = dist(attacker, target);
      if (d <= def.range) {
        if (def.cone >= 360) {
          inRange = true;
        } else {
          const ang = Math.atan2(target.y - attacker.y, target.x - attacker.x);
          inRange = angleDiff(attacker.aimAngle, ang) <= (def.cone / 2) * (Math.PI / 180);
        }
      }
    }
    if (!inRange) continue;
    applyDamage(attacker, target, def.dmg);
  }

  if (!attacker.superMode && def.ammo != null) {
    attacker.ammo--;
    if (attacker.ammo <= 0) { attacker.weapon = "fists"; attacker.ammo = null; }
  }
}

function performDash(e) {
  const t = now();
  if (!e.alive) return;
  if (t < e.dashCooldownUntil) return;
  e.dashCooldownUntil = t + DASH_COOLDOWN_MS;
  let dx = e.input.mx, dy = e.input.my;
  if (!dx && !dy) { dx = Math.cos(e.aimAngle); dy = Math.sin(e.aimAngle); }
  const len = Math.hypot(dx, dy) || 1;
  e.x = clamp(e.x + (dx / len) * DASH_DISTANCE, 0, WORLD_SIZE);
  e.y = clamp(e.y + (dy / len) * DASH_DISTANCE, 0, WORLD_SIZE);
  resolveWorldCollisions(e);
}

// =====================================================================
// COLLISION
// =====================================================================
function pushOutCircle(e, ox, oy, radius) {
  const dx = e.x - ox, dy = e.y - oy;
  const d = Math.hypot(dx, dy) || 0.0001;
  if (d >= radius) return false;
  e.x = clamp(ox + (dx / d) * radius, 0, WORLD_SIZE);
  e.y = clamp(oy + (dy / d) * radius, 0, WORLD_SIZE);
  return true;
}

function resolveWorldCollisions(e) {
  // Collide with tree trunks/crowns. Not every tree needs perfect physics; this keeps it feeling solid.
  for (const tr of decorations.trees) {
    if (Math.abs(e.x - tr.x) > 60 || Math.abs(e.y - tr.y) > 70) continue;
    pushOutCircle(e, tr.x, tr.y, 28 * (tr.s || 1));
  }
  // Rocks block movement.
  for (const rk of decorations.rocks) {
    if (Math.abs(e.x - rk.x) > 55 || Math.abs(e.y - rk.y) > 55) continue;
    pushOutCircle(e, rk.x, rk.y, 22 * (rk.s || 1));
  }
  // Buildings/castles/logs/campfires block movement.
  for (const ob of setPieces) {
    if (Math.abs(e.x - ob.x) > ob.blockR + 40 || Math.abs(e.y - ob.y) > ob.blockR + 40) continue;
    pushOutCircle(e, ob.x, ob.y, ob.blockR);
  }
}

// =====================================================================
// MOVEMENT
// =====================================================================
function inWater(x, y) {
  for (const p of decorations.ponds) {
    const dx = (x - p.x) / p.rx, dy = (y - p.y) / p.ry;
    if (dx * dx + dy * dy <= 1) return true;
  }
  return false;
}

function speedMultiplier(e) {
  const t = now();
  let mult = 1;
  if (t < e.effects.slowUntil) mult *= 0.3;
  if (t < e.effects.tinyUntil) mult *= 0.45;
  if (t < e.effects.speedBoostUntil) mult *= 1.6;
  if (t < e.effects.boardUntil) mult *= 1.85;
  if (t < e.effects.superModeUntil) mult *= 1.35;
  if (inWater(e.x, e.y)) mult *= 0.6;
  return mult;
}

function updateMovement(e, dt) {
  if (!e.alive) return;
  const t = now();
  let mx = e.input.mx || 0, my = e.input.my || 0;
  if (t < e.effects.reverseUntil) { mx = -mx; my = -my; }
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  const mult = speedMultiplier(e);
  let nx = e.x + mx * BASE_SPEED * mult * dt;
  let ny = e.y + my * BASE_SPEED * mult * dt;
  if (t < e.effects.jumpyUntil) {
    nx += rand(-3, 3);
    ny += rand(-3, 3);
  }
  e.x = clamp(nx, 0, WORLD_SIZE);
  e.y = clamp(ny, 0, WORLD_SIZE);
  resolveWorldCollisions(e);
}

// =====================================================================
// BOTS AI
// =====================================================================
function nearestThreat(bot, range) {
  let best = null, bestD = range;
  for (const arr of [players, bots]) {
    for (const e of arr.values()) {
      if (e === bot || !e.alive) continue;
      if (now() < e.spawnProtectedUntil) continue;
      const d = dist(bot, e);
      if (d < bestD) { best = e; bestD = d; }
    }
  }
  return best;
}

function nearestBush(bot) {
  let best = null, bestD = 600;
  for (const b of decorations.bushes) {
    const d = Math.hypot(bot.x - b.x, bot.y - b.y);
    if (d < bestD) { best = b; bestD = d; }
  }
  return best;
}

function updateBotAI(bot) {
  const t = now();
  if (!bot.alive) return;
  if (t < bot.nextThinkAt) return;
  bot.nextThinkAt = t + randInt(180, 320);

  if (t > bot.nextChatAt && Math.random() < 0.5) {
    bot.lastChat = BOT_CHAT[randInt(0, BOT_CHAT.length - 1)];
    bot.lastChatTime = t;
    bot.nextChatAt = t + randInt(10000, 25000);
  }

  const hpRatio = bot.hp / bot.maxHp;
  const threat = nearestThreat(bot, 320);

  if (hpRatio < 0.3 && threat) {
    bot.aiState = "flee";
  } else if (threat) {
    bot.aiState = "chase";
  } else {
    if (Math.random() < 0.04 && bot.weapon === "fists") bot.aiState = "loot";
    else if (bot.aiState !== "loot" || Math.random() < 0.02) bot.aiState = "wander";
  }

  if (bot.aiState === "flee" && threat) {
    const ang = Math.atan2(bot.y - threat.y, bot.x - threat.x);
    bot.input.mx = Math.cos(ang); bot.input.my = Math.sin(ang);
    bot.aimAngle = ang;
    if (Math.random() < 0.05) performDash(bot);
  } else if (bot.aiState === "chase" && threat) {
    const ang = Math.atan2(threat.y - bot.y, threat.x - bot.x);
    bot.aimAngle = ang;
    const d = dist(bot, threat);
    const def = WEAPONS[bot.weapon];
    if (d > def.range * 0.7) {
      bot.input.mx = Math.cos(ang); bot.input.my = Math.sin(ang);
    } else {
      bot.input.mx = 0; bot.input.my = 0;
      performAttack(bot);
    }
  } else if (bot.aiState === "loot") {
    let nearest = null, bd = 1e9;
    for (const w of groundWeapons.values()) {
      const d = dist(bot, w);
      if (d < bd) { bd = d; nearest = w; }
    }
    if (nearest) {
      const ang = Math.atan2(nearest.y - bot.y, nearest.x - bot.x);
      bot.aimAngle = ang;
      bot.input.mx = Math.cos(ang); bot.input.my = Math.sin(ang);
    } else {
      bot.aiState = "wander";
    }
  } else {
    if (t > bot.nextWanderChange) {
      if (Math.random() < 0.15) {
        const bush = nearestBush(bot);
        if (bush) bot.wanderDir = Math.atan2(bush.y - bot.y, bush.x - bot.x);
        else bot.wanderDir = rand(0, Math.PI * 2);
      } else {
        bot.wanderDir = rand(0, Math.PI * 2);
      }
      bot.nextWanderChange = t + randInt(1500, 4000);
    }
    bot.input.mx = Math.cos(bot.wanderDir) * 0.6;
    bot.input.my = Math.sin(bot.wanderDir) * 0.6;
    bot.aimAngle = bot.wanderDir;
  }
}

// =====================================================================
// ZOMBIES (event mobs)
// =====================================================================
function updateZombie(z) {
  if (!z.alive) return;
  let target = null, bd = 260;
  for (const arr of [players, bots]) {
    for (const e of arr.values()) {
      if (!e.alive || now() < e.spawnProtectedUntil) continue;
      const d = dist(z, e);
      if (d < bd) { bd = d; target = e; }
    }
  }
  if (target) {
    const ang = Math.atan2(target.y - z.y, target.x - z.x);
    if (bd > 40) {
      z.x = clamp(z.x + Math.cos(ang) * 95 * (1 / TICK_RATE), 0, WORLD_SIZE);
      z.y = clamp(z.y + Math.sin(ang) * 95 * (1 / TICK_RATE), 0, WORLD_SIZE);
    } else if (now() - z.lastAttackTime > 1000) {
      z.lastAttackTime = now();
      applyDamage(z, target, 6);
    }
  }
}

// =====================================================================
// BOSS
// =====================================================================
function maybeSpawnBoss() {
  if (boss || now() < nextBossAt) return;
  const pos = randomPos();
  boss = {
    id: rid(), isBoss: true, name: "WARLORD MEME BOSS",
    x: pos.x, y: pos.y, aimAngle: 0,
    hp: BOSS_MAX_HP, maxHp: BOSS_MAX_HP, alive: true,
    lastAttackTime: 0, spawnProtectedUntil: 0,
    effects: freshEffects(), inRing: null
  };
}
function updateBoss(dt) {
  if (!boss) return;
  let target = null, bd = 850;
  for (const arr of [players, bots]) {
    for (const e of arr.values()) {
      if (!e.alive || now() < e.spawnProtectedUntil) continue;
      const d = dist(boss, e);
      if (d < bd) { bd = d; target = e; }
    }
  }
  if (target) {
    const ang = Math.atan2(target.y - boss.y, target.x - boss.x);
    boss.aimAngle = ang;
    if (bd > 160) {
      boss.x = clamp(boss.x + Math.cos(ang) * 85 * dt, 0, WORLD_SIZE);
      boss.y = clamp(boss.y + Math.sin(ang) * 85 * dt, 0, WORLD_SIZE);
      resolveWorldCollisions(boss);
    }
    // Dragon breath / fireball attack every few seconds.
    if (now() - boss.lastAttackTime > 3800) {
      boss.lastAttackTime = now();
      const id = rid();
      bossFireballs.set(id, {
        id, x: boss.x, y: boss.y,
        vx: Math.cos(ang) * 360, vy: Math.sin(ang) * 360,
        expireAt: now() + 1800, hit: false
      });
    }
  }
}

function updateBossFireballs(dt) {
  const t = now();
  for (const fb of [...bossFireballs.values()]) {
    fb.x += fb.vx * dt;
    fb.y += fb.vy * dt;
    if (t > fb.expireAt || fb.x < 0 || fb.y < 0 || fb.x > WORLD_SIZE || fb.y > WORLD_SIZE) {
      bossFireballs.delete(fb.id); continue;
    }
    for (const e of [...players.values(), ...bots.values()]) {
      if (!e.alive || t < e.spawnProtectedUntil) continue;
      if (Math.hypot(e.x - fb.x, e.y - fb.y) < 42) {
        applyDamage(boss || fb, e, 18);
        e.effects.slowUntil = Math.max(e.effects.slowUntil, t + 1200);
        bossFireballs.delete(fb.id);
        break;
      }
    }
  }
}

function handleBossDeath() {
  const dropX = boss.x, dropY = boss.y;
  boss = null;
  nextBossAt = now() + randInt(BOSS_MIN_INTERVAL, BOSS_MAX_INTERVAL);
  const id = rid();
  groundWeapons.set(id, { id, type: "legendary", x: dropX, y: dropY, expireAt: now() + 120000 });
}

// =====================================================================
// DYNAMIC EVENTS
// =====================================================================
const EVENT_TYPES = ["storm", "koth", "zombies", "dance"];
function maybeStartEvent() {
  if (activeEvent || now() < nextEventAt) return;
  const type = EVENT_TYPES[randInt(0, EVENT_TYPES.length - 1)];
  const pos = randomPos();
  const duration = randInt(30000, 60000);
  activeEvent = { type, x: pos.x, y: pos.y, radius: 260, startAt: now(), endAt: now() + duration, nextPulseAt: now() + 5000 };

  if (type === "zombies") {
    for (let i = 0; i < 15; i++) {
      const ang = rand(0, Math.PI * 2), r = rand(0, 200);
      const id = rid();
      zombies.set(id, {
        id, isZombie: true, x: clamp(pos.x + Math.cos(ang) * r, 0, WORLD_SIZE), y: clamp(pos.y + Math.sin(ang) * r, 0, WORLD_SIZE),
        hp: 40, maxHp: 40, alive: true, lastAttackTime: 0, spawnProtectedUntil: 0, effects: freshEffects(), inRing: null
      });
    }
  }
}
function updateEvent() {
  if (!activeEvent) return;
  const t = now();
  if (t >= activeEvent.endAt) {
    if (activeEvent.type === "zombies") zombies.clear();
    activeEvent = null;
    nextEventAt = now() + randInt(EVENT_MIN_GAP, EVENT_MAX_GAP);
    return;
  }
  if (activeEvent.type === "koth") {
    for (const arr of [players, bots]) {
      for (const e of arr.values()) {
        if (!e.alive) continue;
        if (dist(e, activeEvent) <= activeEvent.radius) {
          e.effects.speedBoostUntil = t + 1000;
          if (t - e.lastKothHeal > 1000) { e.lastKothHeal = t; e.hp = Math.min(e.maxHp, e.hp + 2); }
        }
      }
    }
  } else if (activeEvent.type === "dance") {
    if (t >= activeEvent.nextPulseAt) {
      activeEvent.nextPulseAt = t + 5000;
      for (const arr of [players, bots]) {
        for (const e of arr.values()) {
          if (!e.alive) continue;
          if (dist(e, activeEvent) <= activeEvent.radius) {
            const recentlyDanced = e.lastChat && e.lastChat.toLowerCase().includes("dance") && (t - e.lastChatTime < 6000);
            if (!recentlyDanced) e.effects.reverseUntil = t + 2500;
          }
        }
      }
    }
  }
}

// =====================================================================
// BUSH / RING / PICKUPS / TRAPS
// =====================================================================
function updateBush(e) {
  let inside = false;
  for (const b of decorations.bushes) {
    if (Math.hypot(e.x - b.x, e.y - b.y) <= b.r) { inside = true; break; }
  }
  e.inBush = inside;
}

function updateRingMembership(e) {
  const eid = e.socketId || e.id;
  if (e.inRing) {
    const ring = rings.find(r => r.id === e.inRing);
    if (!ring || Math.hypot(e.x - ring.x, e.y - ring.y) > ring.radius + 25) leaveRing(e);
    return;
  }
  for (const ring of rings) {
    if (ring.occupants.length >= 2) continue;
    if (Math.hypot(e.x - ring.x, e.y - ring.y) <= ring.radius) {
      ring.occupants.push(eid);
      e.inRing = ring.id;
      break;
    }
  }
}

function applyBoxEffect(e) {
  const GOOD = ["heal", "extralife", "speed", "shield", "doubledmg"];
  const BAD = ["snail", "worm", "frog", "bug", "teleport", "explosion"];
  const pool = Math.random() < 0.5 ? GOOD : BAD;
  const effect = pool[randInt(0, pool.length - 1)];
  const t = now();
  switch (effect) {
    case "heal": e.hp = Math.min(e.maxHp, e.hp + 40); break;
    case "extralife": e.lives = Math.min(MAX_LIVES, e.lives + 1); break;
    case "speed": e.effects.speedBoostUntil = t + 15000; break;
    case "shield": e.effects.shieldUntil = t + 15000; break;
    case "doubledmg": e.effects.doubleDmgUntil = t + 15000; break;
    case "snail": e.effects.slowUntil = t + 30000; break;
    case "worm": e.effects.tinyUntil = t + 30000; break;
    case "frog": e.effects.jumpyUntil = t + 30000; break;
    case "bug": e.effects.reverseUntil = t + 30000; break;
    case "teleport": { const p = randomPos(); e.x = p.x; e.y = p.y; break; }
    case "explosion":
      e.hp = Math.max(1, e.hp - 15);
      for (const target of allTargets()) {
        if (target === e || !target.alive) continue;
        if (now() < (target.spawnProtectedUntil || 0)) continue;
        if (dist(e, target) <= 70) applyDamage(e, target, 10);
      }
      break;
  }
  return effect;
}

function trapEffect(e, type) {
  const t = now();
  if (type === "worm") e.effects.tinyUntil = t + 30000;
  else if (type === "bug") e.effects.reverseUntil = t + 30000;
  else if (type === "frog") e.effects.jumpyUntil = t + 30000;
  else if (type === "snail") e.effects.slowUntil = t + 30000;
}

function handlePickupsAndTraps() {
  const t = now();
  for (const e of [...players.values(), ...bots.values()]) {
    if (!e.alive) continue;

    for (const trap of traps.values()) {
      if (Math.hypot(e.x - trap.x, e.y - trap.y) <= TRAP_RADIUS) {
        trapEffect(e, trap.type);
        traps.delete(trap.id);
        setTimeout(spawnTrap, randInt(15000, 35000));
        break;
      }
    }

    for (const box of mysteryBoxes.values()) {
      if (Math.hypot(e.x - box.x, e.y - box.y) <= PICKUP_RADIUS) {
        applyBoxEffect(e);
        mysteryBoxes.delete(box.id);
        setTimeout(spawnMysteryBox, randInt(4000, 12000));
        break;
      }
    }

    // Auto pickup for everyone. Manual E button still works, but this avoids “standing on item and nothing happens”.
    if (t >= e.spawnProtectedUntil) {
      for (const w of groundWeapons.values()) {
        if (Math.hypot(e.x - w.x, e.y - w.y) <= PICKUP_RADIUS) {
          equipGroundWeapon(e, w);
          break;
        }
      }
    }
  }
}

function equipGroundWeapon(e, w) {
  if (w.type === "legendary") {
    e.superMode = true;
    e.effects.superModeUntil = now() + SUPER_MODE_MS;
    groundWeapons.delete(w.id);
    return;
  }
  if (w.type === "board") {
    e.effects.boardUntil = now() + 20000;
    groundWeapons.delete(w.id);
    setTimeout(spawnGroundWeapon, randInt(5000, 15000));
    return;
  }
  e.weapon = w.type;
  e.ammo = WEAPONS[w.type].ammo;
  groundWeapons.delete(w.id);
  setTimeout(spawnGroundWeapon, randInt(5000, 15000));
}

function tryPickup(e) {
  const t = now();
  if (!e.alive || t < e.spawnProtectedUntil) return;
  for (const w of groundWeapons.values()) {
    if (Math.hypot(e.x - w.x, e.y - w.y) <= PICKUP_RADIUS) {
      equipGroundWeapon(e, w);
      return;
    }
  }
  for (const box of mysteryBoxes.values()) {
    if (Math.hypot(e.x - box.x, e.y - box.y) <= PICKUP_RADIUS) {
      applyBoxEffect(e);
      mysteryBoxes.delete(box.id);
      setTimeout(spawnMysteryBox, randInt(4000, 12000));
      return;
    }
  }
}

function expireGroundItems() {
  const t = now();
  for (const w of groundWeapons.values()) {
    if (t > w.expireAt) {
      groundWeapons.delete(w.id);
      if (w.type !== "legendary") setTimeout(spawnGroundWeapon, randInt(1000, 4000));
    }
  }
  for (const b of mysteryBoxes.values()) {
    if (t > b.expireAt) {
      mysteryBoxes.delete(b.id);
      setTimeout(spawnMysteryBox, randInt(1000, 4000));
    }
  }
}

// =====================================================================
// MAIN SIMULATION LOOP
// =====================================================================
function tick() {
  const dt = 1 / TICK_RATE;
  maybeSpawnBoss();
  updateBoss(dt);
  updateBossFireballs(dt);
  maybeStartEvent();
  updateEvent();
  expireGroundItems();

  for (const p of players.values()) updateMovement(p, dt);
  for (const b of bots.values()) { updateBotAI(b); updateMovement(b, dt); }
  for (const z of zombies.values()) updateZombie(z);

  for (const e of [...players.values(), ...bots.values()]) {
    updateBush(e);
    updateRingMembership(e);
  }
  handlePickupsAndTraps();
}
setInterval(tick, 1000 / TICK_RATE);

function snapshotEntity(e) {
  return {
    id: e.socketId || e.id, name: e.name, face: e.face, isBot: !!e.isBot,
    x: Math.round(e.x), y: Math.round(e.y), a: Math.round(e.aimAngle * 100) / 100,
    hp: Math.round(e.hp), maxHp: e.maxHp, lives: e.lives, alive: e.alive,
    weapon: e.weapon, ammo: e.ammo,
    kills: e.kills, deaths: e.deaths, streak: e.streak,
    inBush: e.inBush, inRing: e.inRing, superMode: e.superMode,
    protected: now() < e.spawnProtectedUntil,
    chat: (now() - e.lastChatTime < 4000) ? e.lastChat : "",
    fx: {
      shield: now() < e.effects.shieldUntil,
      doubleDmg: now() < e.effects.doubleDmgUntil,
      speed: now() < e.effects.speedBoostUntil,
      slow: now() < e.effects.slowUntil,
      tiny: now() < e.effects.tinyUntil,
      reverse: now() < e.effects.reverseUntil,
      jumpy: now() < e.effects.jumpyUntil,
      board: now() < e.effects.boardUntil
    }
  };
}

function broadcastState() {
  const state = {
    players: [...players.values()].map(snapshotEntity),
    bots: [...bots.values()].map(snapshotEntity),
    zombies: [...zombies.values()].map(z => ({ id: z.id, x: Math.round(z.x), y: Math.round(z.y), hp: z.hp, maxHp: z.maxHp })),
    weapons: [...groundWeapons.values()].map(w => ({ id: w.id, type: w.type, x: Math.round(w.x), y: Math.round(w.y) })),
    boxes: [...mysteryBoxes.values()].map(b => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y) })),
    traps: [...traps.values()].map(t => ({ id: t.id, type: t.type, x: Math.round(t.x), y: Math.round(t.y) })),
    rings: rings.map(r => ({ id: r.id, x: r.x, y: r.y, radius: r.radius, occupants: r.occupants.length })),
    boss: boss ? { x: Math.round(boss.x), y: Math.round(boss.y), hp: Math.round(boss.hp), maxHp: boss.maxHp } : null,
    fires: [...bossFireballs.values()].map(f => ({ id:f.id, x:Math.round(f.x), y:Math.round(f.y) })),
    bossTimer: boss ? null : Math.max(0, nextBossAt - now()),
    event: activeEvent ? { type: activeEvent.type, x: activeEvent.x, y: activeEvent.y, radius: activeEvent.radius, remaining: activeEvent.endAt - now() } : null,
    playerCount: players.size
  };
  io.emit("state", state);
}
setInterval(broadcastState, 1000 / BROADCAST_RATE);

// =====================================================================
// SOCKET HANDLERS
// =====================================================================
io.on("connection", (socket) => {
  socket.emit("world", {
    worldSize: WORLD_SIZE,
    decorations,
    setPieces,
    rings: rings.map(r => ({ id: r.id, x: r.x, y: r.y, radius: r.radius })),
    weapons: WEAPONS
  });

  socket.on("join", (data) => {
    if (players.size >= MAX_PLAYERS) {
      socket.emit("joinError", { message: "Server full (100/100). Try again shortly." });
      return;
    }
    const name = (data && data.name ? String(data.name) : "Player").slice(0, 16) || "Player";
    let face = data && data.face ? String(data.face) : "emoji:🙂";
    if (face.length > 60000) face = "emoji:🙂"; // safety cap on payload size
    const isMobile = !!(data && data.isMobile);
    const p = createPlayer(socket.id, name, face, isMobile);
    players.set(socket.id, p);
    socket.emit("joined", { id: socket.id });
  });

  socket.on("input", (data) => {
    const p = players.get(socket.id);
    if (!p || !p.alive || !data) return;
    let mx = Number(data.mx) || 0, my = Number(data.my) || 0;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    p.input.mx = mx; p.input.my = my;
    if (typeof data.a === "number") p.aimAngle = data.a;
  });

  socket.on("attack", () => {
    const p = players.get(socket.id);
    if (p) performAttack(p);
  });

  socket.on("dash", () => {
    const p = players.get(socket.id);
    if (p) performDash(p);
  });

  socket.on("pickup", () => {
    const p = players.get(socket.id);
    if (p) tryPickup(p);
  });

  socket.on("chat", (data) => {
    const p = players.get(socket.id);
    if (!p || !p.alive) return;
    const text = (data && data.text ? String(data.text) : "").slice(0, 80).trim();
    if (!text) return;
    p.lastChat = text;
    p.lastChatTime = now();
  });

  socket.on("disconnect", () => {
    const p = players.get(socket.id);
    if (p) leaveRing(p);
    players.delete(socket.id);
  });
});

server.listen(PORT, () => console.log("JAKWO WARZONE running on " + PORT));
