# JAKWO WARZONE

24/7 endless meme war pixel multiplayer browser game.
No accounts, no wallet, no login — enter a name, upload a meme face, click PLAY.

Built with **Express + Socket.IO** (server-authoritative simulation) and a vanilla
**HTML5 Canvas** client (no build step, no frameworks).

---

## 1. Run it locally

You need [Node.js](https://nodejs.org) 18+ installed.

```bash
npm install
npm start
```

Then open: **http://localhost:3000**

Open it in two browser tabs (or your phone on the same WiFi using your computer's
local IP, e.g. `http://192.168.1.20:3000`) to test multiplayer with a friend.

---

## 2. Deploy to Render (free tier works)

1. Push this whole folder to a **GitHub repo** (all files included here).
2. Go to [render.com](https://render.com) → **New +** → **Web Service**.
3. Connect your GitHub repo.
4. Settings:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - Leave the Port setting alone — the server already reads `process.env.PORT`.
5. Click **Create Web Service**. Wait for the build to finish.
6. Open the `.onrender.com` URL Render gives you — that's your live game link.

**Important:** This game needs a server that stays running and keeps live
WebSocket connections open (Render's Web Service does this). It will **not**
work on Vercel, since Vercel's serverless functions don't support
persistent Socket.IO connections the way this game needs.

Render's free tier spins down after inactivity and takes ~30-50 seconds to wake
back up on the next visit — normal for free hosting, not a bug.

---

## 3. Controls

**PC (keyboard + mouse):**
- `WASD` — move
- Mouse — aim
- Left click — attack
- `Space` — dash
- `E` — pick up nearby weapon
- `Enter` — open chat / send message

**Phone (landscape only):**
- Left joystick — move
- Right joystick — aim
- ⚔️ button — attack
- DASH button — dash
- 🎁 button — special/skill attack
- 💬 button — chat
- "E" button — pick up nearby weapon

On mobile, weapons and mystery boxes are also picked up automatically just by
walking over them, since phones don't have an E key by default — the E button
is there too if you want manual control.

---

## 4. Everything that's implemented

- 5000×5000 open world with trees, bushes, rocks, ponds (ponds slow you down)
- Up to 100 real players + 50 NPC bots, server never stops/resets
- Random spawns, 10s spawn protection (can't hit or be hit while protected)
- 1 starting life, up to 3 lives (extra lives are looted), elimination + slot reopening
- HP bar, name, and chat bubble above every player; typing disables movement/attack
- 8 weapons (Pistol, Shotgun, Bow, Grenade, Fireball, Shockwave, Boxing Gloves,
  Flying Board) that spawn on the ground, expire in 15-30s, and respawn elsewhere
- No one-shot kills, short attack ranges, ~0.5s attack delay, limited ammo per weapon
- Boxing rings (4 on the map) — 2-player-only zones, outside players can't interfere
- Mystery boxes with 5 good effects (heal, extra life, speed, shield, double damage)
  and 6 bad effects (snail/worm/frog/bug status effects, random teleport, small blast)
- Roaming animal traps (worm/bug/frog/snail) that apply a 30s status effect on contact
- Bush system — hides your name/chat bubble and fades you out to distant players
- 50 bots with meme names/faces that wander, loot, chase, flee, troll-chat, and
  hide in bushes
- World boss every 30-60 min (1000 HP, big), drops a legendary item that grants
  60s of super mode (faster, boosted "Energy Blast" attack, damage resistance —
  but still killable by a focused team)
- 4 rotating dynamic events: Meme Storm (visibility drop), King of the Hill
  (buff zone), Zombie Horde (temporary mob invasion), Dance Fever (type "dance"
  in chat near the zone to avoid getting confused)
- Full HUD (player count, kills, lives, boss timer, event status, weapon/ammo,
  HP bar, chat) plus dedicated mobile control layout with landscape-lock warning

---

## 5. Design notes (simplifications worth knowing about)

This is a huge feature list for one game, so a few things were simplified to keep
the project actually shippable and bug-free instead of half-broken:

- **Combat is server-side "range + aim cone" hit detection**, not physics-simulated
  projectiles. This is what keeps "short range, no one-shot kills, 0.5s delay" fair
  and lag-resistant — bullets/arrows/fireballs land instantly within your weapon's
  range and aim cone instead of flying across the map as separate objects.
- **Trees/rocks are visual only** (not solid collision) — they're cover/decoration,
  not walls. Water ponds do slow you down. Bushes do hide you. This keeps movement
  smooth for 150 simultaneous entities without a full physics engine.
- **Flying Board** is implemented as a 20-second movement speed/flight boost you
  pick up off the ground, rather than a persistent vehicle.
- **Dance Fever**: standing in the event zone, type `dance` in chat every few
  seconds to avoid the confusion pulse — this reuses the existing chat system
  instead of adding a brand-new control just for this one event.
- Bot "meme faces" are emoji-based (not uploaded images) so the server doesn't need
  any image-generation dependency — keeps deployment dependency-free.

If you want any of these upgraded later (e.g. real projectile travel time, solid
obstacle collision, account-based stat saving with a database), just ask — the
code is structured so each system (combat, bots, boss, events, loot) is its own
section in `server.js` and can be extended independently.

---

## 6. File structure

```
jakwo-warzone/
├── package.json
├── server.js          ← all game logic & simulation (Express + Socket.IO)
├── README.md
└── public/
    ├── index.html      ← menu, HUD, mobile controls markup
    ├── style.css        ← pixel/cyberpunk styling
    └── game.js           ← canvas rendering + input + socket client
```
