const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 1e6 });

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

const PORT = process.env.PORT || 3000;
const WORLD = { w: 5000, h: 5000 };
const MAX_PLAYERS = 100;
const BOT_COUNT = 50;
const TICK = 1000 / 20;
const PLAYER_RADIUS = 22;
const BASE_SPEED = 190;
const SPAWN_PROTECTION_MS = 10000;
const rings = [
  {id:'ring1', x:1250, y:1200, r:230},
  {id:'ring2', x:3700, y:1600, r:230},
  {id:'ring3', x:2500, y:3850, r:230}
];

const players = new Map();
const bots = new Map();
const loot = new Map();
const projectiles = new Map();
const traps = new Map();
const zombies = new Map();
let boss = null;
let worldEvent = null;
let nextEventAt = now() + 35000;
let lastHillAward = 0;
let nextId = 1;
let announcements = [];

const botFaces = ['😭','🐸','🐕','😎','🤡','😡','🥲','👽','🗿','😈','🤓','💀','🐵','🦊','🐻','🐼','🐷','🐱','🦆','🧟'];
const botNames = ['BushCamper','CryBaby','PepeSniper','DogeKing','NoobMaster','LagLord','TrollFace','BoxHunter','ShotgunJoe','SnailVictim','RagePepe','WojakNPC','BugStepper','RunBro','LastBraincell','SkillIssue','FrogLord','HideInBush','LootGoblin','DashSpam'];
const trashTalk = ['ez 😂','come bush bro','skill issue','HAHA noob','where u running?','box is mine','dont step frog','lag saved you','I am bot but better','free kill soon'];

const weaponDefs = {
  pistol: { name:'Pistol', dmg:18, range:360, speed:700, cd:500, spread:0.05, pellets:1, life:520, icon:'🔫' },
  shotgun: { name:'Shotgun', dmg:14, range:220, speed:650, cd:800, spread:0.36, pellets:5, life:330, icon:'🟫' },
  rifle: { name:'Rifle', dmg:14, range:430, speed:850, cd:500, spread:0.03, pellets:1, life:520, icon:'🛠️' },
  bow: { name:'Bow', dmg:28, range:380, speed:560, cd:700, spread:0.02, pellets:1, life:680, icon:'🏹' },
  fireball: { name:'Fireball', dmg:32, range:300, speed:430, cd:1000, spread:0.04, pellets:1, life:700, icon:'🔥', radius:40 },
  shockwave: { name:'Shockwave', dmg:30, range:180, speed:0, cd:1200, spread:0, pellets:1, instant:true, icon:'⚡' },
  gloves: { name:'Boxing Gloves', dmg:9, range:58, speed:0, cd:360, spread:0, pellets:1, melee:true, icon:'🥊' },
  grenade: { name:'Grenade', dmg:45, range:260, speed:380, cd:1200, spread:0.1, pellets:1, life:700, icon:'💣', radius:90 },
  super: { name:'SUPER BLAST', dmg:55, range:420, speed:900, cd:500, spread:0.02, pellets:1, life:500, icon:'🌈', radius:45 }
};

function rid(prefix='id'){ return prefix + '_' + (nextId++); }
function rand(min,max){ return Math.random()*(max-min)+min; }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function dist(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.hypot(dx,dy); }
function randomPos(){ return { x: rand(80,WORLD.w-80), y: rand(80,WORLD.h-80) }; }
function safeSpawn(){
  for(let i=0;i<30;i++){
    const p = randomPos();
    let ok = true;
    for(const pl of allActors()) if(dist(p,pl)<260) { ok=false; break; }
    if(ok) return p;
  }
  return randomPos();
}
function now(){ return Date.now(); }
function say(text){ announcements.push({text, t: now()}); if(announcements.length>8) announcements.shift(); io.emit('announce', text); }
function allActors(){ return [...players.values(), ...bots.values()].filter(a=>!a.dead); }
function actorById(id){ return players.get(id) || bots.get(id); }
function clearEvent(){ worldEvent=null; zombies.clear(); nextEventAt = now() + rand(65000,95000); }
function ringOf(a){ return rings.find(r => Math.hypot(a.x-r.x, a.y-r.y) < r.r); }
function ringOccupants(r){ return allActors().filter(a => Math.hypot(a.x-r.x, a.y-r.y) < r.r); }
function canDamage(attacker, target){
  if(!attacker || !target) return true;
  const ar = ringOf(attacker), tr = ringOf(target);
  if(ar || tr) return ar && tr && ar.id === tr.id;
  return true;
}

function newActor(id, name, face, isBot=false){
  const p = safeSpawn();
  return { id, name, face, isBot, x:p.x, y:p.y, vx:0, vy:0, angle:0, hp:100, maxHp:100, lives:1, maxLives:3,
    kills:0, deaths:0, streak:0, weapon:'pistol', ammo:{grenade:1}, lastShot:0, dead:false, typing:false,
    bubble:'', bubbleUntil:0, effects:{}, invuln: now()+SPAWN_PROTECTION_MS, dashUntil:0, dashCd:0, superUntil:0, boardUntil:0, target:null, botTalkAt: now()+rand(3000,12000)
  };
}
function serializeActor(a){
  return {id:a.id,n:a.name,f:a.face,b:a.isBot,x:Math.round(a.x),y:Math.round(a.y),ang:a.angle,hp:a.hp,mh:a.maxHp,l:a.lives,k:a.kills,d:a.deaths,w:a.weapon,typ:a.typing,bb:a.bubbleUntil>now()?a.bubble:'',sup:a.superUntil>now(),brd:a.boardUntil>now(),dead:a.dead};
}
function spawnLoot(type=null){
  const types = ['pistol','shotgun','rifle','bow','gloves','grenade','fireball','shockwave','mystery','life','heal','board'];
  const t = type || types[Math.floor(Math.random()*types.length)];
  const p = randomPos();
  const id = rid('loot');
  loot.set(id,{id,type:t,x:p.x,y:p.y,spawned:now(),expires:now()+rand(15000,30000),blink:false});
}
function refillLoot(){ while(loot.size < 130) spawnLoot(); }
function spawnTrap(){
  const types=['worm','bug','frog','snail']; const p=randomPos(); const id=rid('trap');
  traps.set(id,{id,type:types[Math.floor(Math.random()*types.length)],x:p.x,y:p.y,expires:now()+rand(30000,55000)});
}
function refillTraps(){ while(traps.size < 80) spawnTrap(); }

function startWorldEvent(){
  if(worldEvent) return;
  const choices = ['storm','hill','horde','dance'];
  const type = choices[Math.floor(Math.random()*choices.length)];
  const p = randomPos();
  if(type==='storm'){
    worldEvent = {type:'storm', x:p.x, y:p.y, r:1600, until:now()+45000};
    say('🌩️ MEME STORM! Visibility reduced for 45 seconds!');
  } else if(type==='hill'){
    worldEvent = {type:'hill', x:p.x, y:p.y, r:280, until:now()+60000, leader:null};
    say('👑 KING OF THE HILL ZONE APPEARED! Hold it for power!');
  } else if(type==='horde'){
    worldEvent = {type:'horde', x:p.x, y:p.y, r:700, until:now()+50000};
    for(let i=0;i<24;i++){
      const id=rid('zombie');
      zombies.set(id,{id,name:'Zombie Meme',face:'🧟',x:clamp(p.x+rand(-450,450),50,WORLD.w-50),y:clamp(p.y+rand(-450,450),50,WORLD.h-50),hp:55,maxHp:55,lastHit:0});
    }
    say('🧟 ZOMBIE HORDE INVADED THE FIELD!');
  } else {
    worldEvent = {type:'dance', x:p.x, y:p.y, r:520, until:now()+25000};
    say('🕺 DANCE FEVER ZONE! Enter for speed, but everyone can see you!');
  }
}
function updateWorldEvent(dt){
  const t=now();
  if(!worldEvent && t>nextEventAt) startWorldEvent();
  if(worldEvent && t>worldEvent.until){ say('⚠️ World event ended'); clearEvent(); return; }
  if(!worldEvent) return;
  if(worldEvent.type==='hill'){
    const inside = allActors().filter(a=>Math.hypot(a.x-worldEvent.x,a.y-worldEvent.y)<worldEvent.r);
    if(inside.length){
      inside.sort((a,b)=>b.hp-a.hp);
      worldEvent.leader=inside[0].name;
      if(t-lastHillAward>2000){
        for(const a of inside){ a.effects.speed=t+5000; a.hp=Math.min(a.maxHp,a.hp+2); a.bubble='👑 HILL POWER'; a.bubbleUntil=t+1200; }
        lastHillAward=t;
      }
    } else worldEvent.leader=null;
  }
  if(worldEvent.type==='dance'){
    for(const a of allActors()) if(Math.hypot(a.x-worldEvent.x,a.y-worldEvent.y)<worldEvent.r){
      a.effects.speed=t+2500; a.bubble='🕺 DANCE BOOST'; a.bubbleUntil=t+1000;
    }
  }
  if(worldEvent.type==='horde') updateZombies(dt);
}
function serializeZombie(z){ return {id:z.id,x:Math.round(z.x),y:Math.round(z.y),hp:z.hp,mh:z.maxHp}; }
function updateZombies(dt){
  const t=now();
  for(const [id,z] of zombies){
    let target=null, nd=999999;
    for(const a of allActors()){ const d=Math.hypot(a.x-z.x,a.y-z.y); if(d<nd){nd=d; target=a;} }
    if(target){
      const ang=Math.atan2(target.y-z.y,target.x-z.x);
      z.x=clamp(z.x+Math.cos(ang)*120*dt,20,WORLD.w-20);
      z.y=clamp(z.y+Math.sin(ang)*120*dt,20,WORLD.h-20);
      if(nd<44 && t>z.lastHit){ damage(target,{id:z.id,name:'Zombie Meme'},12,'zombie bite'); z.lastHit=t+850; }
    }
  }
}
function damageZombie(z, attacker, amount){
  z.hp -= amount;
  if(z.hp<=0){
    if(attacker){ attacker.kills++; attacker.streak++; }
    const id=rid('loot'); loot.set(id,{id,type:Math.random()<0.5?'heal':'mystery',x:z.x,y:z.y,spawned:now(),expires:now()+rand(12000,22000)});
    zombies.delete(z.id);
  }
}

function spawnBoss(){
  if(boss) return;
  const p=randomPos();
  boss = {id:'boss', name:'GIGA MEME DEMON', x:p.x, y:p.y, hp:1000, maxHp:1000, lastAttack:0, target:null, spawned:now()};
  say('👹 WORLD BOSS APPEARED! 1000 HP!');
}
setInterval(()=>{ if(!boss && Math.random()<0.35) spawnBoss(); }, 60000);
setTimeout(()=>spawnBoss(), 45000);

function initBots(){
  for(let i=0;i<BOT_COUNT;i++){
    const id=rid('bot');
    const name=botNames[i%botNames.length] + (i>=botNames.length?Math.floor(i/botNames.length):'');
    const face=botFaces[i%botFaces.length];
    const b=newActor(id, name, face, true);
    b.weapon = ['pistol','shotgun','bow','rifle','gloves'][i%5];
    bots.set(id,b);
  }
}
initBots(); refillLoot(); refillTraps();

io.on('connection', socket => {
  socket.on('join', data => {
    if(players.size >= MAX_PLAYERS){ socket.emit('full'); return; }
    const name = String(data?.name || 'Meme').slice(0,16).replace(/[<>]/g,'');
    const face = String(data?.face || '😭').slice(0,250000);
    const a = newActor(socket.id, name, face, false);
    players.set(socket.id, a);
    socket.emit('joined',{id:socket.id, world:WORLD});
    say(`🎭 ${name} entered the field`);
  });
  socket.on('input', input => {
    const p=players.get(socket.id); if(!p||p.dead) return;
    p.input = input || {};
    if(input?.angle !== undefined) p.angle = input.angle;
    p.typing = !!input?.typing;
  });
  socket.on('shoot', data => { const p=players.get(socket.id); if(p) shoot(p, data?.angle ?? p.angle); });
  socket.on('dash', () => { const p=players.get(socket.id); if(p) dash(p); });
  socket.on('chat', msg => {
    const p=players.get(socket.id); if(!p) return;
    const text=String(msg||'').slice(0,80).replace(/[<>]/g,'');
    p.bubble=text; p.bubbleUntil=now()+4000; p.typing=false;
    io.emit('chat',{name:p.name,text});
  });
  socket.on('disconnect',()=>{ const p=players.get(socket.id); if(p) say(`🚪 ${p.name} left`); players.delete(socket.id); });
});

function dash(a){
  const t=now(); if(t<a.dashCd || a.typing || a.dead) return;
  a.dashUntil=t+170; a.dashCd=t+1700;
}
function shoot(a, angle){
  const t=now(); if(a.dead || a.typing || t<a.lastShot) return;
  const w = weaponDefs[a.superUntil>t?'super':a.weapon] || weaponDefs.pistol;
  a.lastShot = t + w.cd;
  if(w.instant || w.melee){
    for(const target of allActors()){
      if(target.id===a.id) continue;
      const d=dist(a,target);
      const targetAngle = Math.atan2(target.y-a.y,target.x-a.x);
      const facing = Math.abs(Math.atan2(Math.sin(targetAngle-angle), Math.cos(targetAngle-angle))) < 0.9;
      if(d<w.range && facing) damage(target,a,w.dmg,w.melee?'boxing gloves':'shockwave');
    }
    return;
  }
  for(let i=0;i<w.pellets;i++){
    const ang = angle + rand(-w.spread,w.spread);
    const id=rid('pr');
    projectiles.set(id,{id,owner:a.id,x:a.x,y:a.y,vx:Math.cos(ang)*w.speed,vy:Math.sin(ang)*w.speed,dmg:w.dmg,weapon:a.superUntil>t?'super':a.weapon,expires:t+w.life,radius:w.radius||16});
  }
}
function damage(target, attacker, amount, cause){
  if(target.dead || now()<target.invuln) return;
  if(attacker && !canDamage(attacker, target)) return;
  target.hp -= amount;
  if(target.hp <= 0) kill(target, attacker, cause);
}
function kill(victim, attacker, cause){
  victim.deaths++; victim.lives--;
  victim.dead=true;
  victim.hp=0;
  victim.bubble='💀'; victim.bubbleUntil=now()+2000;
  for(let i=0;i<3;i++) spawnDropped(victim.x+rand(-45,45), victim.y+rand(-45,45));
  if(attacker && attacker.id !== victim.id){
    attacker.kills++; attacker.streak++;
    say(`💀 ${victim.name} was eliminated by ${attacker.name}`);
  }
  if(!victim.isBot){
    const sock=io.sockets.sockets.get(victim.id);
    if(sock) sock.emit('eliminated',{reason:'dead', kills:victim.kills});
    players.delete(victim.id);
  } else {
    setTimeout(()=>{
      const b=newActor(victim.id, victim.name, victim.face, true);
      b.weapon=['pistol','shotgun','bow','rifle','gloves'][Math.floor(Math.random()*5)];
      bots.set(victim.id,b);
    }, 2500);
  }
}
function spawnDropped(x,y){
  const items=['pistol','shotgun','rifle','bow','gloves','grenade','mystery','heal'];
  const id=rid('loot');
  loot.set(id,{id,type:items[Math.floor(Math.random()*items.length)],x:clamp(x,50,WORLD.w-50),y:clamp(y,50,WORLD.h-50),spawned:now(),expires:now()+rand(12000,22000)});
}
function pickup(a,l){
  if(l.type in weaponDefs) a.weapon=l.type;
  else if(l.type==='mystery') applyMystery(a);
  else if(l.type==='life') a.lives = Math.min(3, a.lives+1);
  else if(l.type==='heal') a.hp = Math.min(a.maxHp, a.hp+40);
  else if(l.type==='board') { a.boardUntil = now()+60000; a.bubble='FLYING BOARD!'; a.bubbleUntil=now()+2500; }
}
function applyMystery(a){
  const effects=['speed','shield','heal','life','snail','reverse','teleport','boom'];
  const e=effects[Math.floor(Math.random()*effects.length)];
  if(e==='speed') a.effects.speed=now()+30000;
  if(e==='shield') a.invuln=now()+5000;
  if(e==='heal') a.hp=a.maxHp;
  if(e==='life') a.lives=Math.min(3,a.lives+1);
  if(e==='snail') a.effects.snail=now()+30000;
  if(e==='reverse') a.effects.reverse=now()+30000;
  if(e==='teleport'){ const p=randomPos(); a.x=p.x; a.y=p.y; }
  if(e==='boom') damage(a,a,35,'box explosion');
  a.bubble = `📦 ${e.toUpperCase()}!`; a.bubbleUntil=now()+3000;
}
function applyTrap(a,type){
  if(type==='worm') a.effects.snail=now()+30000;
  if(type==='bug') a.effects.reverse=now()+30000;
  if(type==='frog') a.effects.frog=now()+30000;
  if(type==='snail') a.effects.snail=now()+30000;
  a.bubble = `${type} trap!`; a.bubbleUntil=now()+3000;
}

function updateBot(b,dt){
  const t=now();
  if(t>b.botTalkAt){ b.bubble=trashTalk[Math.floor(Math.random()*trashTalk.length)]; b.bubbleUntil=t+3000; b.botTalkAt=t+rand(8000,22000); io.emit('chat',{name:b.name,text:b.bubble}); }
  let nearest=null, nd=999999;
  for(const a of allActors()) if(a.id!==b.id){ const d=dist(b,a); if(d<nd){nd=d; nearest=a;} }
  let targetLoot=null, ld=999999;
  for(const l of loot.values()){ const d=dist(b,l); if(d<ld){ld=d; targetLoot=l;} }
  let tx=b.x+rand(-1,1)*100, ty=b.y+rand(-1,1)*100;
  if(nearest && nd<430){ tx=nearest.x; ty=nearest.y; b.angle=Math.atan2(nearest.y-b.y,nearest.x-b.x); if(nd<320) shoot(b,b.angle); if(b.hp<35){ tx=b.x-(nearest.x-b.x); ty=b.y-(nearest.y-b.y); } }
  else if(targetLoot){ tx=targetLoot.x; ty=targetLoot.y; }
  b.input={x:Math.sign(tx-b.x),y:Math.sign(ty-b.y)};
}
function updateBoss(dt){
  if(!boss) return;
  let target=null, nd=999999;
  for(const a of allActors()){ const d=dist(boss,a); if(d<nd){nd=d; target=a;} }
  if(target){
    const ang=Math.atan2(target.y-boss.y,target.x-boss.x);
    boss.x += Math.cos(ang)*75*dt; boss.y += Math.sin(ang)*75*dt;
    if(nd<90 && now()>boss.lastAttack){ damage(target,{id:'boss',name:'GIGA MEME DEMON'},28,'boss'); boss.lastAttack=now()+900; }
  }
  if(boss.hp<=0){
    say('🌈 BOSS DEFEATED! SUPER POWER DROPPED!');
    const id=rid('loot'); loot.set(id,{id,type:'superpower',x:boss.x,y:boss.y,spawned:now(),expires:now()+30000});
    boss=null;
  }
}
function updateActor(a,dt){
  if(a.dead) return;
  const oldX=a.x, oldY=a.y;
  if(a.isBot) updateBot(a,dt);
  const inp=a.input||{};
  let ix=inp.x||0, iy=inp.y||0;
  if(a.effects.reverse && a.effects.reverse>now()){ ix=-ix; iy=-iy; }
  let mag=Math.hypot(ix,iy); if(mag>1){ ix/=mag; iy/=mag; }
  let sp=BASE_SPEED;
  if(a.effects.speed && a.effects.speed>now()) sp*=1.5;
  if(a.effects.snail && a.effects.snail>now()) sp*=0.45;
  if(a.effects.frog && a.effects.frog>now()) sp*= (Math.sin(now()/120)>0?1.8:0.3);
  if(a.boardUntil>now()) sp*=1.65;
  if(a.superUntil>now()) sp*=1.35;
  if(a.typing) sp=0;
  if(a.dashUntil>now()) sp*=3.2;
  a.x=clamp(a.x+ix*sp*dt,20,WORLD.w-20); a.y=clamp(a.y+iy*sp*dt,20,WORLD.h-20);
  const rNow = ringOf(a);
  if(rNow){
    const occ = ringOccupants(rNow).filter(o=>o.id!==a.id);
    const wasInside = Math.hypot(oldX-rNow.x, oldY-rNow.y) < rNow.r;
    if(!wasInside && occ.length >= 2){ a.x=oldX; a.y=oldY; a.bubble='Ring full! 2 fighters only'; a.bubbleUntil=now()+1300; }
  }
  for(const [id,l] of loot){ if(dist(a,l)<42){ if(l.type==='superpower'){ a.superUntil=now()+60000; a.maxHp=200; a.hp=200; a.bubble='SUPER MODE!'; a.bubbleUntil=now()+3500; } else pickup(a,l); loot.delete(id); } }
  for(const [id,tr] of traps){ if(dist(a,tr)<28){ applyTrap(a,tr.type); traps.delete(id); } }
}
let last=Date.now();
setInterval(()=>{
  const t=Date.now(); const dt=Math.min(0.05,(t-last)/1000); last=t;
  for(const a of allActors()) updateActor(a,dt);
  for(const [id,p] of projectiles){
    p.x += p.vx*dt; p.y += p.vy*dt;
    if(t>p.expires || p.x<0||p.y<0||p.x>WORLD.w||p.y>WORLD.h){ projectiles.delete(id); continue; }
    for(const a of allActors()){
      if(a.id===p.owner) continue;
      if(dist(a,p)<p.radius){ damage(a,actorById(p.owner),p.dmg,p.weapon); projectiles.delete(id); break; }
    }
    if(boss && dist(boss,p)<70){ boss.hp-=p.dmg; projectiles.delete(id); continue; }
    for(const z of zombies.values()){
      if(Math.hypot(z.x-p.x,z.y-p.y)<36){ damageZombie(z, actorById(p.owner), p.dmg); projectiles.delete(id); break; }
    }
  }
  updateBoss(dt);
  updateWorldEvent(dt);
  for(const [id,l] of loot){ if(t>l.expires) loot.delete(id); }
  for(const [id,tr] of traps){ if(t>tr.expires) traps.delete(id); }
  refillLoot(); refillTraps();
  io.emit('state',{
    selfCount: players.size, maxPlayers:MAX_PLAYERS, bots:bots.size,
    actors: allActors().map(serializeActor),
    loot:[...loot.values()].map(l=>({id:l.id,type:l.type,x:Math.round(l.x),y:Math.round(l.y),ttl:Math.max(0,Math.round((l.expires-t)/1000))})),
    traps:[...traps.values()].map(tr=>({id:tr.id,type:tr.type,x:Math.round(tr.x),y:Math.round(tr.y)})),
    projectiles:[...projectiles.values()].map(p=>({id:p.id,x:Math.round(p.x),y:Math.round(p.y),w:p.weapon})),
    boss: boss?{x:Math.round(boss.x),y:Math.round(boss.y),hp:boss.hp,maxHp:boss.maxHp}:null,
    rings,
    event: worldEvent ? {...worldEvent, ttl:Math.max(0,Math.round((worldEvent.until-t)/1000)), x:Math.round(worldEvent.x), y:Math.round(worldEvent.y)} : null,
    zombies:[...zombies.values()].map(serializeZombie),
    announcements
  });
}, TICK);

server.listen(PORT,()=>console.log(`JAKWO Warzone Pixel Final running on :${PORT}`));
