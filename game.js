// =====================================================================
// JAKWO WARZONE - Client
// =====================================================================
(function () {
  "use strict";

  // ---------------- DOM ----------------
  const menuScreen = document.getElementById("menuScreen");
  const rotateScreen = document.getElementById("rotateScreen");
  const deathScreen = document.getElementById("deathScreen");
  const gameScreen = document.getElementById("gameScreen");
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const faceUploadBtn = document.getElementById("faceUploadBtn");
  const faceInput = document.getElementById("faceInput");
  const facePreview = document.getElementById("facePreview");
  const faceUploadLabel = document.getElementById("faceUploadLabel");
  const nameInput = document.getElementById("nameInput");
  const playBtn = document.getElementById("playBtn");
  const menuError = document.getElementById("menuError");
  const playAgainBtn = document.getElementById("playAgainBtn");
  const deathStats = document.getElementById("deathStats");

  const chatInput = document.getElementById("chatInput");
  const hudPlayers = document.getElementById("hudPlayers");
  const hudKills = document.getElementById("hudKills");
  const hudLives = document.getElementById("hudLives");
  const hudEvent = document.getElementById("hudEvent");
  const hudBoss = document.getElementById("hudBoss");
  const hpBarFill = document.getElementById("hpBarFill");
  const hpText = document.getElementById("hpText");
  const weaponName = document.getElementById("weaponName");
  const weaponAmmo = document.getElementById("weaponAmmo");

  const mobileControls = document.getElementById("mobileControls");
  const joyMove = document.getElementById("joyMove");
  const joyAim = document.getElementById("joyAim");
  const btnAttack = document.getElementById("btnAttack");
  const btnDash = document.getElementById("btnDash");
  const btnSkill = document.getElementById("btnSkill");
  const btnChatMobile = document.getElementById("btnChatMobile");
  const btnPickupMobile = document.getElementById("btnPickupMobile");
  const touchHint = document.getElementById("touchHint");

  // ---------------- STATE ----------------
  const IS_TOUCH = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
  let faceDataUrl = null;
  let myId = null;
  let world = null; // { worldSize, decorations, rings, weapons }
  let latest = { players: [], bots: [], zombies: [], weapons: [], boxes: [], traps: [], rings: [], boss: null, fires: [], event: null, playerCount: 0, bossTimer: 0 };
  let me = null; // my entity from latest snapshot
  let camera = { x: 2500, y: 2500 };
  let keys = {};
  let mouse = { x: 0, y: 0 };
  let aimAngle = 0;
  let chatting = false;
  let socket = null;
  let joined = false;

  const FACE_IMG_CACHE = new Map();


  // ---------------- ASSET LOADER ----------------
  // Fix: previous build called assetReady()/drawAsset() but never defined them,
  // so the render loop crashed and showed only a dark green screen.
  const ASSET_PATHS = {
    'board': '/assets/board.png',
    'body': '/assets/body.png',
    'bomb': '/assets/bomb.png',
    'boss': '/assets/boss.png',
    'boss_island2': '/assets/boss_island2.jpg',
    'bossisland': '/assets/bossisland.png',
    'bow': '/assets/bow.png',
    'box': '/assets/box.png',
    'boxing_gloves2': '/assets/boxing_gloves2.jpg',
    'boxing_ring_big': '/assets/boxing_ring_big.jpg',
    'bridge_river': '/assets/bridge_river.jpg',
    'bridge_scene': '/assets/bridge_scene.png',
    'bush': '/assets/bush.png',
    'campfire': '/assets/campfire.png',
    'castle': '/assets/castle.png',
    'castle_ruin': '/assets/castle_ruin.jpg',
    'chest': '/assets/chest.png',
    'dragon': '/assets/dragon.png',
    'dragonboss': '/assets/dragonboss.gif',
    'fireball': '/assets/fireball.png',
    'frog_pond': '/assets/frog_pond.jpg',
    'ghost': '/assets/ghost.png',
    'gloves': '/assets/gloves.png',
    'goldensword': '/assets/goldensword.png',
    'ground': '/assets/ground.png',
    'heart': '/assets/heart.png',
    'house': '/assets/house.png',
    'island_home2': '/assets/island_home2.jpg',
    'island_house': '/assets/island_house.png',
    'knife': '/assets/knife.png',
    'lightning': '/assets/lightning.png',
    'log': '/assets/log.png',
    'mushroom': '/assets/mushroom.png',
    'mushroom_falls': '/assets/mushroom_falls.jpg',
    'mushroom_island': '/assets/mushroom_island.png',
    'player_run': '/assets/player_run.gif',
    'pond2': '/assets/pond2.jpg',
    'potion': '/assets/potion.jpg',
    'revolver': '/assets/revolver.png',
    'rifle': '/assets/rifle.png',
    'rock1': '/assets/rock1.png',
    'rock2': '/assets/rock2.png',
    'scythe': '/assets/scythe.png',
    'sheep_patch': '/assets/sheep_patch.png',
    'shop': '/assets/shop.png',
    'skulls': '/assets/skulls.png',
    'slime': '/assets/slime.png',
    'snakeboss': '/assets/snakeboss.png',
    'stoneground': '/assets/stoneground.png',
    'sword': '/assets/sword.png',
    'tree': '/assets/tree.png',
    'tree_autumn': '/assets/tree_autumn.png',
    'tree_big': '/assets/tree_big.png',
    'tree_fallen': '/assets/tree_fallen.png',
    'tree_old': '/assets/tree_old.png',
    'tree_pink': '/assets/tree_pink.png',
    'zeus': '/assets/zeus.png',
    'zombie': '/assets/zombie.png',
    'zombie_walk': '/assets/zombie_walk.gif'
  };

  const ASSETS = {};
  for (const [name, src] of Object.entries(ASSET_PATHS)) {
    const im = new Image();
    im.src = src;
    ASSETS[name] = im;
  }
  function assetReady(name) {
    const im = ASSETS[name];
    return !!(im && im.complete && im.naturalWidth > 0 && im.naturalHeight > 0);
  }
  function drawAsset(name, x, y, w, h, ax = 0.5, ay = 0.5) {
    const im = ASSETS[name];
    if (!im || !im.complete || im.naturalWidth <= 0 || im.naturalHeight <= 0) return false;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(im, x - w * ax, y - h * ay, w, h);
    ctx.restore();
    return true;
  }
  function pickAssetBySeed(list, seed) {
    const available = list.filter(assetReady);
    const arr = available.length ? available : list;
    if (!arr.length) return null;
    const n = Math.abs(Math.floor(seed || 0)) % arr.length;
    return arr[n];
  }
  let audioUnlocked = false;
  let ambientAudio = null;
  let prevMeState = null;
  let prevBossAlive = false;
  const AUDIO_FILES = {
    pickup: '/assets/audio/pickup.mp3', switch: '/assets/audio/switch.mp3', slash: '/assets/audio/slash.mp3',
    death: '/assets/audio/death.mp3', hit: '/assets/audio/hit.mp3', fire: '/assets/audio/fire.wav', gun: '/assets/audio/gun.mp3',
    laser: '/assets/audio/laser.wav', alarm: '/assets/audio/alarm.wav', roar: '/assets/audio/roar.wav',
    boom: '/assets/audio/boom.mp3', music: '/assets/audio/music.mp3', birds: '/assets/audio/birds.mp3'
  };
  function unlockAudio() {
    audioUnlocked = true;
    try {
      if (!ambientAudio) {
        ambientAudio = new Audio(AUDIO_FILES.music || AUDIO_FILES.birds);
        ambientAudio.loop = true;
        ambientAudio.volume = 0.10;
      }
      ambientAudio.play().catch(()=>{});
    } catch(e) {}
  }
  function playGameSound(name, vol = 0.35) {
    if (!audioUnlocked) return;
    try {
      const src = AUDIO_FILES[name] || `/assets/audio/${name}.mp3`;
      const a = new Audio(src);
      a.volume = vol;
      a.play().catch(()=>{});
    } catch(e) {}
  }
  function playSfx(name, vol = 0.35) { playGameSound(name, vol); }


  // ---------------- MENU: FACE UPLOAD ----------------
  faceUploadBtn.addEventListener("click", () => faceInput.click());
  faceInput.addEventListener("change", () => {
    const file = faceInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        // Keep uploaded meme image shape. No circle crop.
        // PNG keeps transparency if the user uploads a transparent meme head.
        const size = 128;
        const c = document.createElement("canvas");
        c.width = size; c.height = size;
        const cctx = c.getContext("2d");
        cctx.clearRect(0, 0, size, size);
        const scale = Math.min(size / img.width, size / img.height);
        const w = img.width * scale, h = img.height * scale;
        cctx.imageSmoothingEnabled = false;
        cctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        faceDataUrl = c.toDataURL("image/png");
        facePreview.src = faceDataUrl;
        facePreview.style.display = "block";
        faceUploadLabel.style.display = "none";
        validateMenu();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
  nameInput.addEventListener("input", validateMenu);
  function validateMenu() {
    playBtn.disabled = !(faceDataUrl && nameInput.value.trim().length > 0);
  }

  // ---------------- ORIENTATION ----------------
  function checkOrientation() {
    if (IS_TOUCH && window.innerHeight > window.innerWidth) {
      rotateScreen.classList.remove("hidden");
    } else {
      rotateScreen.classList.add("hidden");
    }
  }
  window.addEventListener("resize", checkOrientation);
  window.addEventListener("orientationchange", checkOrientation);
  checkOrientation();

  // ---------------- SOCKET ----------------
  function connectSocket() {
    socket = io();

    socket.on("world", (w) => { world = w; });

    socket.on("joined", (data) => {
      myId = data.id;
      joined = true;
      menuScreen.classList.add("hidden");
      deathScreen.classList.add("hidden");
      gameScreen.classList.remove("hidden");
      if (IS_TOUCH) mobileControls.classList.remove("hidden");
    });

    socket.on("joinError", (data) => {
      menuError.textContent = data.message || "Could not join.";
    });

    socket.on("state", (data) => {
      latest = data;
      const newMe = data.players.find(p => p.id === myId) || null;
      if (newMe && prevMeState) {
        if (newMe.weapon !== prevMeState.weapon || newMe.ammo !== prevMeState.ammo) playGameSound("pickup", 0.32);
        if (newMe.lives > prevMeState.lives) playGameSound("pickup", 0.45);
        if (newMe.hp < prevMeState.hp - 8) playGameSound("funny", 0.22);
      }
      me = newMe;
      prevMeState = newMe ? { weapon: newMe.weapon, ammo: newMe.ammo, lives: newMe.lives, hp: newMe.hp } : null;
      updateHUD();
    });

    socket.on("eliminated", (stats) => {
      playGameSound("funny", 0.45);
      joined = false;
      myId = null;
      me = null;
      deathStats.textContent = `Kills: ${stats.kills}   Deaths: ${stats.deaths}`;
      gameScreen.classList.add("hidden");
      deathScreen.classList.remove("hidden");
      playSfx("death", 0.6);
    });

    socket.on("disconnect", () => {
      joined = false;
    });
  }

  function doJoin() {
    unlockAudio();
    menuError.textContent = "";
    if (!socket) connectSocket();
    socket.emit("join", { name: nameInput.value.trim().slice(0, 16), face: faceDataUrl, isMobile: IS_TOUCH });
  }

  playBtn.addEventListener("click", doJoin);
  playAgainBtn.addEventListener("click", () => {
    deathScreen.classList.add("hidden");
    menuScreen.classList.remove("hidden");
  });

  // ---------------- CANVAS SIZING ----------------
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // ---------------- KEYBOARD INPUT (PC) ----------------
  window.addEventListener("keydown", (e) => {
    if (document.activeElement === chatInput) {
      if (e.key === "Enter") {
        sendChat();
        chatInput.blur();
      }
      return;
    }
    keys[e.key.toLowerCase()] = true;
    if (e.key === "Enter") {
      chatInput.focus();
      e.preventDefault();
    }
    if (e.key === " ") {
      if (socket && joined) socket.emit("dash");
      e.preventDefault();
    }
    if (e.key.toLowerCase() === "e") {
      if (socket && joined) socket.emit("pickup");
    }
  });
  window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

  chatInput.addEventListener("blur", () => { chatting = false; });
  chatInput.addEventListener("focus", () => { chatting = true; });

  function sendChat() {
    const text = chatInput.value.trim();
    if (text && socket && joined) socket.emit("chat", { text });
    chatInput.value = "";
  }

  // ---------------- MOUSE INPUT (PC) ----------------
  window.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  window.addEventListener("mousedown", (e) => {
    if (e.target === canvas && socket && joined) { socket.emit("attack"); playAttackSound(); }
  });

  // ---------------- TOUCH JOYSTICKS ----------------
  function setupJoystick(el, onMove, onEnd) {
    let active = false, touchId = null, cx = 0, cy = 0;
    const stick = el.querySelector(".joyStick");
    const radius = 40;

    function start(touch) {
      active = true; touchId = touch.identifier;
      const rect = el.getBoundingClientRect();
      cx = rect.left + rect.width / 2; cy = rect.top + rect.height / 2;
    }
    function move(touch) {
      let dx = touch.clientX - cx, dy = touch.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > radius) { dx = (dx / len) * radius; dy = (dy / len) * radius; }
      stick.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / radius, ny = dy / radius;
      onMove(nx, ny, len > 6);
    }
    function end() {
      active = false; touchId = null;
      stick.style.transform = "translate(0,0)";
      if (onEnd) onEnd();
    }
    el.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      start(t); move(t);
    }, { passive: false });
    el.addEventListener("touchmove", (e) => {
      if (!active) return;
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === touchId) move(t);
    }, { passive: false });
    function touchEndHandler(e) {
      for (const t of e.changedTouches) if (t.identifier === touchId) end();
    }
    el.addEventListener("touchend", touchEndHandler);
    el.addEventListener("touchcancel", touchEndHandler);
  }

  let moveVec = { x: 0, y: 0 };
  let aimVec = { x: 0, y: 0, active: false };

  setupJoystick(joyMove, (nx, ny) => { moveVec.x = nx; moveVec.y = ny; }, () => { moveVec.x = 0; moveVec.y = 0; });
  setupJoystick(joyAim, (nx, ny, active) => { aimVec.x = nx; aimVec.y = ny; aimVec.active = active; }, () => { aimVec.active = false; });

  // ---------------- MOBILE BUTTONS ----------------
  function bindHold(btn, onDown) {
    btn.addEventListener("touchstart", (e) => { e.preventDefault(); onDown(); }, { passive: false });
  }
  bindHold(btnAttack, () => { if (socket && joined) { socket.emit("attack"); playAttackSound(); } });
  bindHold(btnDash, () => { if (socket && joined) socket.emit("dash"); });
  bindHold(btnSkill, () => { if (socket && joined) { socket.emit("attack"); playAttackSound(); } });
  bindHold(btnPickupMobile, () => { if (socket && joined) socket.emit("pickup"); });
  btnChatMobile.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const text = prompt("Chat message:");
    if (text && socket && joined) socket.emit("chat", { text: text.slice(0, 80) });
  });


  function playAttackSound() {
    if (!me) return;
    if (["grenade", "fireball", "shockwave"].includes(me.weapon)) playGameSound("explosion", 0.28);
    else if (["pistol", "shotgun", "rifle", "revolver"].includes(me.weapon)) playGameSound("boom", 0.20);
    else playGameSound("funny", 0.16);
  }

  // ---------------- HUD ----------------
  function updateHUD() {
    hudPlayers.textContent = `${latest.playerCount}/100`;
    if (me) {
      hudKills.textContent = `Kills: ${me.kills}`;
      hudLives.textContent = `❤️ x${me.lives}`;
      hpBarFill.style.width = Math.max(0, (me.hp / me.maxHp) * 100) + "%";
      hpText.textContent = `${me.hp}/${me.maxHp}`;
      weaponName.textContent = me.superMode ? "ENERGY BLAST (SUPER)" : (world && world.weapons[me.weapon] ? world.weapons[me.weapon].name : me.weapon);
      weaponAmmo.textContent = me.ammo != null ? `Ammo: ${me.ammo}` : "";
    }
    if (latest.event) {
      const sec = Math.max(0, Math.round(latest.event.remaining / 1000));
      const labels = { storm: "🌪️ MEME STORM", koth: "👑 KING OF THE HILL", zombies: "🧟 ZOMBIE HORDE", dance: "💃 DANCE FEVER" };
      hudEvent.textContent = `${labels[latest.event.type] || latest.event.type} (${sec}s)`;
    } else {
      hudEvent.textContent = "";
    }
    if (latest.boss) {
      hudBoss.textContent = `👹 BOSS HP: ${latest.boss.hp}/${latest.boss.maxHp}`;
    } else if (latest.bossTimer != null) {
      const m = Math.max(0, Math.floor(latest.bossTimer / 60000));
      hudBoss.textContent = `Boss in ~${m}m`;
    }
  }

  // ---------------- FACE IMAGE CACHE ----------------
  function getFaceImage(face) {
    if (!face || face.startsWith("emoji:")) return null;
    if (FACE_IMG_CACHE.has(face)) return FACE_IMG_CACHE.get(face);
    const img = new Image();
    img.src = face;
    FACE_IMG_CACHE.set(face, img);
    return img;
  }

  // ---------------- RENDER LOOP ----------------
  let lastFrame = performance.now();
  function frame(t) {
    const dt = Math.min(0.1, (t - lastFrame) / 1000);
    lastFrame = t;

    if (joined && me) {
      sendInput();
      camera.x += (me.x - camera.x) * 0.25;
      camera.y += (me.y - camera.y) * 0.25;
      render();
    } else if (world) {
      ctx.fillStyle = "#142819";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function sendInput() {
    if (!socket) return;
    let mx = 0, my = 0;

    if (IS_TOUCH) {
      mx = moveVec.x; my = moveVec.y;
    } else {
      if (keys["w"] || keys["arrowup"]) my -= 1;
      if (keys["s"] || keys["arrowdown"]) my += 1;
      if (keys["a"] || keys["arrowleft"]) mx -= 1;
      if (keys["d"] || keys["arrowright"]) mx += 1;
      if (chatting) { mx = 0; my = 0; }
    }

    let angle;
    if (IS_TOUCH) {
      if (aimVec.active) {
        angle = Math.atan2(aimVec.y, aimVec.x);
      } else if (mx || my) {
        angle = Math.atan2(my, mx);
      } else {
        angle = aimAngle;
      }
    } else {
      const sx = canvas.width / 2, sy = canvas.height / 2;
      angle = Math.atan2(mouse.y - sy, mouse.x - sx);
    }
    aimAngle = angle;

    socket.emit("input", { mx, my, a: angle });
  }

  // ---------------- DRAWING ----------------
  function w2s(x, y) {
    return { x: x - camera.x + canvas.width / 2, y: y - camera.y + canvas.height / 2 };
  }

  function render() {
    drawTerrainBackground();
    drawGrid();
    drawWorldSetPieces();

    if (world) {
      for (const p of world.decorations.ponds) drawPond(p);
      for (const r of world.rings) drawRing(r);
      for (const b of world.decorations.bushes) drawBush(b, false);
      for (const rk of world.decorations.rocks) drawRock(rk);
      for (const tr of world.decorations.trees) drawTree(tr);
    }

    for (const t of latest.traps) drawTrap(t);
    for (const bx of latest.boxes) drawBox(bx);
    for (const wp of latest.weapons) drawGroundWeapon(wp);
    for (const f of (latest.fires || [])) drawFireball(f);

    const allEntities = [...latest.bots, ...latest.players, ...latest.zombies.map(z => ({ ...z, isZombie: true }))];
    allEntities.sort((a, b) => a.y - b.y);
    for (const e of allEntities) {
      if (e.isZombie) drawZombie(e);
      else drawEntity(e);
    }

    if (latest.boss) drawBoss(latest.boss);

    if (world) for (const b of world.decorations.bushes) drawBush(b, true);

    if (latest.event && latest.event.type !== "storm") drawEventZone(latest.event);
    if (latest.event && latest.event.type === "storm") drawStormOverlay();

    drawVignette();
  }

  function drawTerrainBackground() {
    if (assetReady("ground")) {
      const im = ASSETS.ground;
      const tile = 256;
      const offX = -((camera.x % tile) + tile) % tile;
      const offY = -((camera.y % tile) + tile) % tile;
      ctx.imageSmoothingEnabled = false;
      for (let x = offX - tile; x < canvas.width + tile; x += tile) {
        for (let y = offY - tile; y < canvas.height + tile; y += tile) {
          ctx.drawImage(im, x, y, tile, tile);
        }
      }
    } else {
      ctx.fillStyle = "#5da54c";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function drawWorldSetPieces() {
    if (!world) return;
    const pieces = (world.setPieces && world.setPieces.length) ? world.setPieces : [
      {name:"house", x: 760, y: 720, w:110, h:90},
      {name:"mushroom", x: 1160, y: 930, w:95, h:110},
      {name:"shop", x: 4200, y: 3900, w:130, h:95},
      {name:"campfire", x: 1020, y: 820, w:42, h:42},
      {name:"castle", x: 4300, y: 720, w:170, h:150},
      {name:"bossisland", x: 2500, y: 2500, w:230, h:170},
      {name:"skulls", x: 2750, y: 2560, w:70, h:55},
      {name:"log", x: 1600, y: 1220, w:75, h:35},
      {name:"log", x: 3300, y: 3150, w:75, h:35}
    ];
    for (const it of pieces) {
      if (!onScreen(it.x, it.y, Math.max(it.w,it.h)+80)) continue;
      const s = w2s(it.x, it.y);
      drawAsset(it.name, s.x, s.y, it.w, it.h);
    }
  }

  function drawGrid() {
    const s = w2s(0, 0);
    const gridSize = 100;
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    const offX = ((camera.x % gridSize) + gridSize) % gridSize;
    const offY = ((camera.y % gridSize) + gridSize) % gridSize;
    for (let x = -offX; x < canvas.width; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = -offY; y < canvas.height; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
  }

  function onScreen(x, y, margin) {
    const s = w2s(x, y);
    return s.x > -margin && s.x < canvas.width + margin && s.y > -margin && s.y < canvas.height + margin;
  }

  function drawPond(p) {
    if (!onScreen(p.x, p.y, 260)) return;
    const s = w2s(p.x, p.y);
    ctx.save();
    ctx.fillStyle = "rgba(53, 139, 204, 0.82)";
    ctx.beginPath(); ctx.ellipse(s.x, s.y, p.rx, p.ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(30,95,150,0.9)"; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = "rgba(170,230,255,0.12)";
    ctx.beginPath(); ctx.ellipse(s.x - p.rx*0.25, s.y - p.ry*0.2, p.rx*0.35, p.ry*0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawRock(r) {
    if (!onScreen(r.x, r.y, 80)) return;
    const s = w2s(r.x, r.y);
    const nm = pickAssetBySeed(["rock1","rock2"], r.x + r.y);
    if (drawAsset(nm, s.x, s.y + 12, 42 * (r.s || 1), 36 * (r.s || 1))) return;
    ctx.fillStyle = "#777"; ctx.beginPath(); ctx.ellipse(s.x, s.y, 18, 12, 0, 0, Math.PI*2); ctx.fill();
  }
  function drawTree(t) {
    if (!onScreen(t.x, t.y, 170)) return;
    const s = w2s(t.x, t.y);
    const treeList = ["tree", "tree_big", "tree_old", "tree_autumn", "tree_pink"];
    const nm = pickAssetBySeed(treeList, t.x * 11 + t.y * 17);
    const scale = t.s || 1;
    const sizes = { tree:[70,92], tree_big:[105,105], tree_old:[115,100], tree_autumn:[95,120], tree_pink:[105,105] };
    const sz = sizes[nm] || [72,95];
    if (drawAsset(nm, s.x, s.y + 34, sz[0] * scale, sz[1] * scale)) return;
    ctx.fillStyle = "#5a3b22"; ctx.fillRect(s.x - 5, s.y, 10, 22);
    ctx.fillStyle = "#2f6b3a"; ctx.beginPath(); ctx.arc(s.x, s.y - 18, 24, 0, Math.PI * 2); ctx.fill();
  }
  function drawBush(b, fgPass) {
    if (!onScreen(b.x, b.y, 110)) return;
    const s = w2s(b.x, b.y);
    ctx.globalAlpha = fgPass ? 0.45 : 0.9;
    if (!drawAsset("bush", s.x, s.y + 20, b.r * 1.1, b.r * 0.9)) {
      ctx.fillStyle = fgPass ? "rgba(46,120,62,0.55)" : "#2a6336";
      ctx.beginPath(); ctx.arc(s.x, s.y, b.r * 0.55, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function drawRing(r) {
    if (!onScreen(r.x, r.y, r.radius + 120)) return;
    const s = w2s(r.x, r.y);
    // Big readable boxing arena. The old one looked like a ring for ants 😂
    if (assetReady("boxing_ring_big")) {
      drawAsset("boxing_ring_big", s.x, s.y + r.radius * 0.55, r.radius * 2.5, r.radius * 1.65, 0.5, 1);
    } else {
      ctx.strokeStyle = "#ff4848"; ctx.lineWidth = 7;
      ctx.fillStyle = "rgba(65,115,255,0.18)";
      ctx.beginPath(); ctx.rect(s.x-r.radius, s.y-r.radius*0.65, r.radius*2, r.radius*1.3); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 4;
      for (let i=1;i<=3;i++) { ctx.beginPath(); ctx.moveTo(s.x-r.radius, s.y-r.radius*0.65+i*r.radius*0.325); ctx.lineTo(s.x+r.radius, s.y-r.radius*0.65+i*r.radius*0.325); ctx.stroke(); }
    }
    ctx.fillStyle = "#ffd95d"; ctx.font = "12px monospace"; ctx.textAlign = "center"; ctx.fillText("BOXING RING", s.x, s.y - r.radius - 18);
  }

  const TRAP_EMOJI = { worm: "🪱", bug: "🐛", frog: "🐸", snail: "🐌" };
  function drawTrap(t) {
    if (!onScreen(t.x, t.y, 45)) return;
    const s = w2s(t.x, t.y);
    const map = { worm:"slime", bug:"bush", frog:"slime", snail:"rock1" };
    const nm = map[t.type] || "slime";
    if (drawAsset(nm, s.x, s.y + 10, 30, 30)) return;
    ctx.font = "20px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(TRAP_EMOJI[t.type] || "🐛", s.x, s.y);
  }
  function drawBox(b) {
    if (!onScreen(b.x, b.y, 55)) return;
    const s = w2s(b.x, b.y);
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.sin(Date.now()/300)*0.10);
    drawAsset("box", 0, 16, 42, 42, 0.5, 0.5) || drawAsset("chest", 0, 16, 48, 42, 0.5, 0.5);
    ctx.restore();
  }
  const WEAPON_EMOJI = { pistol: "🔫", shotgun: "💥", bow: "🏹", grenade: "💣", fireball: "🔥", shockwave: "⚡", gloves: "🥊", board: "🛹", legendary: "✨" };
  function drawGroundWeapon(w) {
    if (!onScreen(w.x, w.y, 60)) return;
    const s = w2s(w.x, w.y);
    const map = { pistol:"revolver", shotgun:"rifle", bow:"bow", grenade:"bomb", fireball:"fireball", shockwave:"lightning", gloves:"gloves", board:"board", legendary:"goldensword" };
    const nm = map[w.type] || "sword";
    if (w.type === "legendary") { ctx.save(); ctx.shadowColor="#ffd95d"; ctx.shadowBlur=18; drawAsset(nm, s.x, s.y+16, 44, 44, 0.5, 0.5); ctx.restore(); return; }
    if (drawAsset(nm, s.x, s.y + 14, 34, 34, 0.5, 0.5)) return;
    ctx.font = "20px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(WEAPON_EMOJI[w.type] || "❔", s.x, s.y);
  }

  function drawHealthBar(sx, sy, ratio, width) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(sx - width / 2, sy, width, 5);
    ctx.fillStyle = ratio > 0.5 ? "#5dff8d" : ratio > 0.25 ? "#ffd95d" : "#ff6b6b";
    ctx.fillRect(sx - width / 2, sy, width * Math.max(0, ratio), 5);
  }


  function heldWeaponAsset(type) {
    const map = {
      fists: null, pistol: "revolver", shotgun: "rifle", rifle: "rifle", revolver: "revolver",
      bow: "bow", grenade: "bomb", fireball: "fireball", shockwave: "lightning",
      gloves: "gloves", board: "board", sword: "sword", knife: "knife", scythe: "scythe", legendary: "goldensword"
    };
    return map[type] || null;
  }
  function drawHeldWeapon(e, s, bodyScale) {
    const nm = e.superMode ? "lightning" : heldWeaponAsset(e.weapon);
    if (!nm || !assetReady(nm)) return;
    const ang = e.a || 0;
    const ox = Math.cos(ang) * 20 * bodyScale;
    const oy = Math.sin(ang) * 20 * bodyScale - 4;
    ctx.save();
    ctx.translate(s.x + ox, s.y + oy);
    ctx.rotate(ang);
    ctx.imageSmoothingEnabled = false;
    const im = ASSETS[nm];
    const sizeMap = { gloves:[24,24], bomb:[22,22], bow:[32,32], rifle:[40,22], revolver:[30,20], knife:[28,18], scythe:[36,28], sword:[32,22], goldensword:[38,24], fireball:[24,24], lightning:[28,28], board:[34,20] };
    const [w,h] = sizeMap[nm] || [32,22];
    ctx.drawImage(im, -w/2, -h/2, w, h);
    ctx.restore();
  }

  function drawEntity(e) {
    if (!onScreen(e.x, e.y, 80)) return;
    const s = w2s(e.x, e.y);
    const isSelf = e.id === myId;
    let alpha = 1;
    if (e.inBush && !isSelf) {
      const distToMe = me ? Math.hypot(e.x - me.x, e.y - me.y) : 9999;
      alpha = distToMe < 70 ? 0.85 : 0.18;
    }
    ctx.save();
    ctx.globalAlpha = alpha;

    // spawn protection glow
    if (e.protected) {
      ctx.strokeStyle = "rgba(120,200,255,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, 24, 0, Math.PI * 2); ctx.stroke();
    }
    if (e.fx && e.fx.shield) {
      ctx.strokeStyle = "rgba(93,200,255,0.7)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, 22, 0, Math.PI * 2); ctx.stroke();
    }
    if (e.superMode) {
      ctx.shadowColor = "#ffd95d"; ctx.shadowBlur = 20;
    }

    // grounded shadow + body (prevents floating look)
    let bodyScale = 1;
    if (e.fx && e.fx.tiny) bodyScale = 0.6;
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath(); ctx.ellipse(s.x, s.y + 13 * bodyScale, 15 * bodyScale, 6 * bodyScale, 0, 0, Math.PI * 2); ctx.fill();
    drawAsset("player_run", s.x, s.y + 25 * bodyScale, 42 * bodyScale, 52 * bodyScale, 0.5, 1) || drawAsset("body", s.x, s.y + 23 * bodyScale, 34 * bodyScale, 44 * bodyScale, 0.5, 1) || (ctx.fillStyle = e.isBot ? "#c97b3d" : "#4a90d9", ctx.fillRect(s.x - 7 * bodyScale, s.y - 5, 14 * bodyScale, 18 * bodyScale));

    // actual held weapon sprite. No more yellow stick.
    drawHeldWeapon(e, s, bodyScale);

    // uploaded meme face/head: NO circle crop. Keeps PNG transparency / original head shape.
    const headR = 18 * bodyScale;
    const img = getFaceImage(e.face);
    const headW = 34 * bodyScale;
    const headH = 34 * bodyScale;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 2;
      ctx.drawImage(img, s.x - headW / 2, s.y - 39 * bodyScale, headW, headH);
      ctx.restore();
    } else {
      ctx.fillStyle = "#ffe2b8";
      ctx.fillRect(s.x - headW / 2, s.y - 39 * bodyScale, headW, headH);
    }

    if (e.face && e.face.startsWith("emoji:")) {
      ctx.font = `${headR * 1.4}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(e.face.slice(6), s.x, s.y - 23 * bodyScale);
    }

    // name + hp (hidden if in bush and far, unless self)
    if (!e.inBush || isSelf || alpha > 0.5) {
      ctx.font = "9px 'Press Start 2P', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = isSelf ? "#5dff8d" : (e.isBot ? "#ffb347" : "#eafff0");
      ctx.fillText(e.name + (e.inRing ? " 🥊" : ""), s.x, s.y - 40 * bodyScale);
      drawHealthBar(s.x, s.y - 37 * bodyScale, e.hp / e.maxHp, 34);

      if (e.chat) {
        ctx.font = "9px monospace";
        const padding = 6;
        const w = Math.min(180, ctx.measureText(e.chat).width + padding * 2);
        const bx = s.x - w / 2, by = s.y - 64 * bodyScale;
        ctx.fillStyle = "rgba(20,30,20,0.85)";
        ctx.fillRect(bx, by, w, 18);
        ctx.strokeStyle = "#5dff8d"; ctx.lineWidth = 1; ctx.strokeRect(bx, by, w, 18);
        ctx.fillStyle = "#eafff0";
        ctx.fillText(e.chat.slice(0, 22), s.x, by + 12);
      }
    }

    // effect icons
    let iconX = s.x - 20;
    const iconY = s.y + 18 * bodyScale + 8;
    const icons = [];
    if (e.fx) {
      if (e.fx.speed) icons.push("💨");
      if (e.fx.doubleDmg) icons.push("✖2");
      if (e.fx.slow) icons.push("🐌");
      if (e.fx.tiny) icons.push("🪱");
      if (e.fx.reverse) icons.push("🐛");
      if (e.fx.jumpy) icons.push("🐸");
      if (e.fx.board) icons.push("🛹");
    }
    ctx.font = "10px serif";
    for (const ic of icons) { ctx.fillText(ic, iconX, iconY); iconX += 14; }

    ctx.restore();
  }

  function drawFireball(f) {
    if (!onScreen(f.x, f.y, 70)) return;
    const s = w2s(f.x, f.y);
    ctx.save(); ctx.shadowColor = "#ff7b22"; ctx.shadowBlur = 14;
    drawAsset("fireball", s.x, s.y + 8, 42, 42, 0.5, 0.5) || (ctx.font="28px serif", ctx.fillText("🔥", s.x, s.y));
    ctx.restore();
  }


  function drawZombie(z) {
    if (!onScreen(z.x, z.y, 70)) return;
    const s = w2s(z.x, z.y);
    drawAsset("zombie_walk", s.x, s.y + 18, 46, 56) || drawAsset("zombie", s.x, s.y + 16, 42, 52) || (ctx.fillStyle="#5fae5f", ctx.fillRect(s.x-9,s.y-6,18,20));
    drawHealthBar(s.x, s.y - 42, z.hp / z.maxHp, 36);
  }

  function drawBoss(b) {
    if (!onScreen(b.x, b.y, 320)) return;
    const s = w2s(b.x, b.y);
    ctx.save(); ctx.shadowColor = "#ff6b6b"; ctx.shadowBlur = 25;
    if (!drawAsset("dragonboss", s.x, s.y + 95, 210, 210, 0.5, 1)) {
      drawAsset("dragon", s.x, s.y + 90, 180, 180, 0.5, 1) || drawAsset("boss", s.x, s.y + 90, 180, 190, 0.5, 1);
    }
    ctx.restore();
    ctx.font = "13px monospace"; ctx.textAlign = "center";
    ctx.fillStyle = "#ff6b6b"; ctx.fillText("DRAGON BOSS", s.x, s.y - 122);
    drawHealthBar(s.x, s.y - 112, b.hp / b.maxHp, 170);
  }

  function drawEventZone(ev) {
    const s = w2s(ev.x, ev.y);
    const colors = { koth: "rgba(255,217,93,0.18)", zombies: "rgba(95,174,95,0.15)", dance: "rgba(255,107,200,0.18)" };
    ctx.fillStyle = colors[ev.type] || "rgba(255,255,255,0.1)";
    ctx.beginPath(); ctx.arc(s.x, s.y, ev.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 2; ctx.stroke();
  }
  function drawStormOverlay() {
    ctx.fillStyle = "rgba(20,30,25,0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  function drawVignette() {
    const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height / 3, canvas.width / 2, canvas.height / 2, canvas.height);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

})();
