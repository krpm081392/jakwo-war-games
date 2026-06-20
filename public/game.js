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
  let latest = { players: [], bots: [], zombies: [], weapons: [], boxes: [], traps: [], rings: [], boss: null, event: null, playerCount: 0, bossTimer: 0 };
  let me = null; // my entity from latest snapshot
  let camera = { x: 2500, y: 2500 };
  let keys = {};
  let mouse = { x: 0, y: 0 };
  let aimAngle = 0;
  let chatting = false;
  let socket = null;
  let joined = false;

  const FACE_IMG_CACHE = new Map();

  // ---------------- MENU: FACE UPLOAD ----------------
  faceUploadBtn.addEventListener("click", () => faceInput.click());
  faceInput.addEventListener("change", () => {
    const file = faceInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const size = 96;
        const c = document.createElement("canvas");
        c.width = size; c.height = size;
        const cctx = c.getContext("2d");
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale, h = img.height * scale;
        cctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        faceDataUrl = c.toDataURL("image/jpeg", 0.72);
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
      me = data.players.find(p => p.id === myId) || null;
      updateHUD();
    });

    socket.on("eliminated", (stats) => {
      joined = false;
      myId = null;
      me = null;
      deathStats.textContent = `Kills: ${stats.kills}   Deaths: ${stats.deaths}`;
      gameScreen.classList.add("hidden");
      deathScreen.classList.remove("hidden");
    });

    socket.on("disconnect", () => {
      joined = false;
    });
  }

  function doJoin() {
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
    if (e.target === canvas && socket && joined) socket.emit("attack");
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
  bindHold(btnAttack, () => { if (socket && joined) socket.emit("attack"); });
  bindHold(btnDash, () => { if (socket && joined) socket.emit("dash"); });
  bindHold(btnSkill, () => { if (socket && joined) socket.emit("attack"); });
  bindHold(btnPickupMobile, () => { if (socket && joined) socket.emit("pickup"); });
  btnChatMobile.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const text = prompt("Chat message:");
    if (text && socket && joined) socket.emit("chat", { text: text.slice(0, 80) });
  });

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
    ctx.fillStyle = "#2d5a3a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGrid();

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
    if (!onScreen(p.x, p.y, 250)) return;
    const s = w2s(p.x, p.y);
    ctx.fillStyle = "rgba(60,140,210,0.75)";
    ctx.beginPath(); ctx.ellipse(s.x, s.y, p.rx, p.ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(30,90,150,0.9)"; ctx.lineWidth = 3; ctx.stroke();
  }
  function drawRock(r) {
    if (!onScreen(r.x, r.y, 60)) return;
    const s = w2s(r.x, r.y);
    ctx.fillStyle = "#7c7c74";
    ctx.beginPath(); ctx.ellipse(s.x, s.y, 16 * r.s, 12 * r.s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#5e5e57";
    ctx.beginPath(); ctx.ellipse(s.x - 4, s.y - 3, 7 * r.s, 5 * r.s, 0, 0, Math.PI * 2); ctx.fill();
  }
  function drawTree(t) {
    if (!onScreen(t.x, t.y, 80)) return;
    const s = w2s(t.x, t.y);
    ctx.fillStyle = "#5a3b22";
    ctx.fillRect(s.x - 4 * t.s, s.y - 4 * t.s, 8 * t.s, 18 * t.s);
    ctx.fillStyle = "#2f6b3a";
    ctx.beginPath(); ctx.arc(s.x, s.y - 18 * t.s, 22 * t.s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3a8048";
    ctx.beginPath(); ctx.arc(s.x - 8 * t.s, s.y - 24 * t.s, 14 * t.s, 0, Math.PI * 2); ctx.fill();
  }
  function drawBush(b, fgPass) {
    if (!onScreen(b.x, b.y, 100)) return;
    const s = w2s(b.x, b.y);
    if (!fgPass) {
      ctx.fillStyle = "#2a6336";
      ctx.beginPath(); ctx.arc(s.x, s.y, b.r * 0.55, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = "rgba(46,120,62,0.55)";
      ctx.beginPath(); ctx.arc(s.x, s.y, b.r * 0.62, 0, Math.PI * 2); ctx.fill();
    }
  }
  function drawRing(r) {
    if (!onScreen(r.x, r.y, r.radius + 30)) return;
    const s = w2s(r.x, r.y);
    ctx.strokeStyle = "#ffd95d"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(s.x, s.y, r.radius, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(255,217,93,0.08)";
    ctx.beginPath(); ctx.arc(s.x, s.y, r.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffd95d"; ctx.font = "10px monospace"; ctx.textAlign = "center";
    ctx.fillText("BOXING RING", s.x, s.y - r.radius - 10);
  }
  const TRAP_EMOJI = { worm: "🪱", bug: "🐛", frog: "🐸", snail: "🐌" };
  function drawTrap(t) {
    if (!onScreen(t.x, t.y, 40)) return;
    const s = w2s(t.x, t.y);
    ctx.font = "20px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(TRAP_EMOJI[t.type] || "🐛", s.x, s.y);
  }
  function drawBox(b) {
    if (!onScreen(b.x, b.y, 40)) return;
    const s = w2s(b.x, b.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(Math.sin(Date.now() / 300) * 0.15);
    ctx.font = "24px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🎁", 0, 0);
    ctx.restore();
  }
  const WEAPON_EMOJI = { pistol: "🔫", shotgun: "💥", bow: "🏹", grenade: "💣", fireball: "🔥", shockwave: "⚡", gloves: "🥊", board: "🛹", legendary: "✨" };
  function drawGroundWeapon(w) {
    if (!onScreen(w.x, w.y, 40)) return;
    const s = w2s(w.x, w.y);
    if (w.type === "legendary") {
      ctx.save();
      ctx.shadowColor = "#ffd95d"; ctx.shadowBlur = 18;
      ctx.font = "28px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("✨", s.x, s.y);
      ctx.restore();
      return;
    }
    ctx.font = "20px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(WEAPON_EMOJI[w.type] || "❔", s.x, s.y);
  }

  function drawHealthBar(sx, sy, ratio, width) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(sx - width / 2, sy, width, 5);
    ctx.fillStyle = ratio > 0.5 ? "#5dff8d" : ratio > 0.25 ? "#ffd95d" : "#ff6b6b";
    ctx.fillRect(sx - width / 2, sy, width * Math.max(0, ratio), 5);
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

    // body (tiny pixel body)
    let bodyScale = 1;
    if (e.fx && e.fx.tiny) bodyScale = 0.6;
    ctx.fillStyle = e.isBot ? "#c97b3d" : "#4a90d9";
    ctx.fillRect(s.x - 7 * bodyScale, s.y - 4, 14 * bodyScale, 16 * bodyScale);

    // weapon indicator line (aim direction)
    ctx.strokeStyle = "#ffd95d"; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + Math.cos(e.a) * 22, s.y + Math.sin(e.a) * 22);
    ctx.stroke();

    // head (meme face)
    const headR = 16 * bodyScale;
    const img = getFaceImage(e.face);
    ctx.save();
    ctx.beginPath();
    ctx.arc(s.x, s.y - 16 * bodyScale, headR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, s.x - headR, s.y - 16 * bodyScale - headR, headR * 2, headR * 2);
    } else {
      ctx.fillStyle = "#ffe2b8";
      ctx.fillRect(s.x - headR, s.y - 16 * bodyScale - headR, headR * 2, headR * 2);
    }
    ctx.restore();
    ctx.strokeStyle = "#0a2412"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y - 16 * bodyScale, headR, 0, Math.PI * 2); ctx.stroke();

    if (e.face && e.face.startsWith("emoji:")) {
      ctx.font = `${headR * 1.4}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(e.face.slice(6), s.x, s.y - 16 * bodyScale);
    }

    // name + hp (hidden if in bush and far, unless self)
    if (!e.inBush || isSelf || alpha > 0.5) {
      ctx.font = "9px 'Press Start 2P', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = isSelf ? "#5dff8d" : (e.isBot ? "#ffb347" : "#eafff0");
      ctx.fillText(e.name + (e.inRing ? " 🥊" : ""), s.x, s.y - 16 * bodyScale - headR - 10);
      drawHealthBar(s.x, s.y - 16 * bodyScale - headR - 7, e.hp / e.maxHp, 34);

      if (e.chat) {
        ctx.font = "9px monospace";
        const padding = 6;
        const w = Math.min(180, ctx.measureText(e.chat).width + padding * 2);
        const bx = s.x - w / 2, by = s.y - 16 * bodyScale - headR - 32;
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

  function drawZombie(z) {
    if (!onScreen(z.x, z.y, 60)) return;
    const s = w2s(z.x, z.y);
    ctx.fillStyle = "#5fae5f";
    ctx.fillRect(s.x - 9, s.y - 6, 18, 20);
    ctx.font = "20px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🧟", s.x, s.y - 16);
    drawHealthBar(s.x, s.y - 30, z.hp / z.maxHp, 30);
  }

  function drawBoss(b) {
    if (!onScreen(b.x, b.y, 200)) return;
    const s = w2s(b.x, b.y);
    ctx.save();
    ctx.shadowColor = "#ff6b6b"; ctx.shadowBlur = 25;
    ctx.fillStyle = "#7a2222";
    ctx.beginPath(); ctx.arc(s.x, s.y, 64, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.font = "56px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("👹", s.x, s.y);
    ctx.font = "12px monospace";
    ctx.fillStyle = "#ff6b6b";
    ctx.fillText("WARLORD MEME BOSS", s.x, s.y - 84);
    drawHealthBar(s.x, s.y - 76, b.hp / b.maxHp, 120);
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
    g.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

})();
