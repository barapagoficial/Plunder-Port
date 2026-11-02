'use strict';
// ===== Estado y simulación =====
const rnd = Math.random;
let S = null;          // datos persistentes (partida guardada)
const G = {
  ship: { x: 0, y: 0, angle: -Math.PI / 4, speed: 0 },
  path: null, keys: {}, enemies: [], shots: [], loot: [], fx: [], texts: [], storms: [], slams: [],
  boss: null, raid: null, raidTimer: 360, wind: 0, windTarget: 0, windTimer: 0, time: 0,
  paused: false, revealed: null, fogDirty: true, nearby: null, msgCooldown: {},
  spawnTimer: 0, lootTimer: 0, saveTimer: 0, leakTimer: 0, carpTimer: 0, reefTimer: 0, zoneTimer: 0,
  stormTimer: 0, reload: 0, fireHeld: false, hitFlash: 0, flash: 0, rockCd: 0, curZone: 0, shake: 0,
};

function newSave() {
  return {
    v: 1, gold: 50, stage: 0, parts: { casco: 0, velas: 0, bodega: 0, canones: 0, timon: 0 },
    crew: [], planks: 4, cargo: { coins: 0, chest: 0, ruby: 0, diamond: 0, rare: 0 },
    hp: SHIPS[0].hp, holes: 0, water: 0, morale: 100, lastPort: 0, revealed: '',
    pieces: [0, 0, 0], xDug: [false, false, false], legends: {}, trophies: {}, decor: {}, house: false,
    taverns: {}, wrecks: {}, caves: {}, bosses: {}, stats: { earned: 0, loot: 0, sunk: 0, enemies: 0, time: 0 },
    tutorial: false, ended: false, sound: true, discovered: {},
  };
}

function hasCrew(n) { return S.crew.includes(n); }
function stats() {
  const sh = SHIPS[S.stage], p = S.parts;
  return {
    maxHp: Math.round(sh.hp * (1 + 0.2 * p.casco)),
    speed: 125 * sh.speed * (1 + 0.1 * p.velas),
    hold: Math.round(sh.hold * (1 + 0.2 * p.bodega)),
    dmg: 8 * (1 + 0.2 * p.canones) * (hasCrew('artillero') ? 1.3 : 1),
    cannons: sh.cannons,
    reload: hasCrew('artillero') ? 1.05 : 1.45,
    turn: 1.8 * sh.turn * (1 + 0.15 * p.timon),
    leak: sh.leak ? sh.leak * (1 + 0.3 * p.casco) : 0,
    waterRate: 0.32 * (1 - 0.07 * p.casco),
    reveal: 4.5 + S.stage * 0.5 + (hasCrew('vigia') ? 3 : 0) + (S.legends.pearl ? 1 : 0),
    crewSlots: sh.crew, maxPlanks: sh.planks, range: 290 + S.stage * 25,
  };
}
function cargoUsed() { let n = 0; for (const k of ITEM_ORDER) n += S.cargo[k] * ITEMS[k].size; return n; }
function cargoValue() { let n = 0; for (const k of ITEM_ORDER) n += S.cargo[k] * ITEMS[k].value; return n; }
function addGold(n) { S.gold += Math.round(n); if (n > 0) S.stats.earned += Math.round(n); }

function priceAt(portId, item) {
  const p = PORTS[portId];
  const wobble = 1 + 0.08 * Math.sin(G.time / 90 + portId * 1.7 + ITEM_ORDER.indexOf(item) * 2.3);
  return Math.max(1, Math.round(ITEMS[item].value * p.mult[item] * wobble * (S.legends.skull ? 1.1 : 1)));
}

// ===== Niebla de guerra =====
function initFog() {
  G.revealed = new Uint8Array(WW * WH);
  if (S.revealed) {
    try {
      const bin = atob(S.revealed);
      for (let i = 0; i < WW * WH; i++) if (bin.charCodeAt(i >> 3) & (1 << (i & 7))) G.revealed[i] = 1;
    } catch (e) { /* partida vieja */ }
  }
  G.fogDirty = true;
}
function encodeFog() {
  const bytes = new Uint8Array(Math.ceil(WW * WH / 8));
  for (let i = 0; i < WW * WH; i++) if (G.revealed[i]) bytes[i >> 3] |= 1 << (i & 7);
  let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function revealAround(px, py, r) {
  const cx = px / TILE, cy = py / TILE;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(WW - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(WH - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * WW + x;
    if (G.revealed[i]) continue;
    if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) { G.revealed[i] = 1; Render.fogClear(x, y); }
  }
}
function isRevealedWorld(px, py) {
  const x = Math.floor(px / TILE), y = Math.floor(py / TILE);
  if (x < 0 || y < 0 || x >= WW || y >= WH) return false;
  return G.revealed[y * WW + x] === 1;
}

// ===== Guardado =====
const SAVE_KEY = 'plunderport_save_v1';
function saveGame() {
  if (!S) return;
  S.revealed = encodeFog();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    const base = newSave();
    for (const k in base) if (d[k] === undefined) d[k] = base[k];
    return d;
  } catch (e) { return null; }
}
function resetGame() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } location.reload(); }

// ===== Tabernas =====
function tavernRate(portId) {
  const t = S.taverns[portId]; if (!t) return 0;
  const z = World.ports[portId].zone;
  return TAVERN.income[z] * t.level * (t.keeper ? 1.5 : 1) * (S.legends.crown ? 1.25 : 1);
}
function tavernTick() {
  const now = Date.now();
  let gained = 0;
  for (const id in S.taverns) {
    const t = S.taverns[id];
    const mins = Math.max(0, (now - t.last) / 60000);
    const rate = tavernRate(id), cap = rate * TAVERN.capMinutes;
    const before = t.stored;
    if (t.closedUntil && now < t.closedUntil) { t.last = now; continue; }
    t.stored = Math.min(cap, t.stored + mins * rate);
    gained += t.stored - before;
    t.last = now;
  }
  return gained;
}
function zoneHasTavern(z) { return Object.keys(S.taverns).some(id => World.ports[id].zone === z); }

// ===== Inicio de partida =====
function placeAtPort(id) {
  const p = World.ports[id];
  // busca agua cerca del puerto
  for (let r = 2; r < 6; r++) for (let a = 0; a < 16; a++) {
    const ang = a / 16 * Math.PI * 2;
    const x = p.x + Math.cos(ang) * r * TILE, y = p.y + Math.sin(ang) * r * TILE;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (World.reach[ty * WW + tx] && World.tileAt(tx, ty) === W_WATER) {
      G.ship.x = x; G.ship.y = y; G.ship.speed = 0; G.ship.angle = ang; G.path = null; return;
    }
  }
  G.ship.x = p.x + 3 * TILE; G.ship.y = p.y;
}

function startGame(fresh) {
  S = (!fresh && loadGame()) || newSave();
  initFog();
  placeAtPort(S.lastPort);
  G.enemies = []; G.shots = []; G.loot = []; G.storms = []; G.slams = []; G.boss = null; G.raid = null;
  G.wind = rnd() * Math.PI * 2; G.windTarget = G.wind;
  for (let z = 0; z < 4; z++) for (let k = 0; k < lootTarget(z); k++) spawnLoot(z, true);
  const off = tavernTick();
  revealAround(G.ship.x, G.ship.y, stats().reveal);
  if (S.legends.compass) revealSecrets();
  return off;
}

// ===== Botín =====
function lootTarget(z) { return [30, 34, 34, 34][z]; }
function rollItem(z) {
  const w = LOOT_WEIGHTS[z]; let tot = 0; for (const k in w) tot += w[k];
  let r = rnd() * tot; for (const k of ITEM_ORDER) { r -= w[k]; if (r < 0) return k; }
  return 'coins';
}
function spawnLoot(z, initial, at) {
  let pos = at;
  if (!pos) {
    for (let k = 0; k < 20; k++) {
      const p = World.randomWaterInZone(z, rnd); if (!p) return;
      const d = Math.hypot(p.x - G.ship.x, p.y - G.ship.y);
      if (!initial && d < 700) continue;
      if (World.ports.some(pp => Math.hypot(pp.x - p.x, pp.y - p.y) < 200)) continue;
      pos = p; break;
    }
  }
  if (!pos) return;
  const kind = rollItem(z);
  const qty = kind === 'coins' ? 1 + Math.floor(rnd() * (2 + z)) : 1;
  G.loot.push({ x: pos.x + (rnd() - 0.5) * 16, y: pos.y + (rnd() - 0.5) * 16, kind, qty, zone: z, bob: rnd() * 6 });
}
function tryCollect(l) {
  const st = stats();
  if (l.kind === 'piece') { givePiece(l.map); return true; }
  const size = ITEMS[l.kind].size;
  let taken = 0;
  while (taken < l.qty && cargoUsed() + size <= st.hold) { S.cargo[l.kind]++; taken++; }
  if (taken === 0) { msgOnce('full', '¡Bodega llena! Vuelve a puerto a vender.', 5); return false; }
  l.qty -= taken;
  S.stats.loot += taken;
  Sfx.play('coin');
  floatText(l.x, l.y - 10, '+' + taken + ' ' + ITEMS[l.kind].name, ITEMS[l.kind].color);
  if ((l.kind === 'chest' || l.kind === 'rare') && l.zone >= 0) maybePiece(l.zone, l.kind === 'rare' ? 0.25 : 0.1);
  return l.qty <= 0;
}
function maybePiece(zone, chance) {
  const m = Math.min(2, Math.max(0, zone - (zone >= 1 ? 1 : 0)));
  if (S.pieces[m] < 3 && rnd() < chance) givePiece(m);
}
function givePiece(m) {
  if (S.pieces[m] >= 3) { addGold(100); return; }
  S.pieces[m]++;
  UI.toast('🗺️ ¡Pedazo de mapa! ' + MAP_NAMES[m] + ' (' + S.pieces[m] + '/3)');
  if (S.pieces[m] === 3) {
    const x = World.xmarks[m];
    revealAround(x.x, x.y, 3);
    UI.toast('❌ ¡Mapa completo! Una X apareció en tu mapa.', 4);
  }
}
function lootBurst(x, y, z, n) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = 20 + rnd() * 40;
    let px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (World.blocked(px, py)) { px = x; py = y; }
    G.loot.push({ x: px, y: py, kind: rollItem(z), qty: 1, zone: -1, bob: rnd() * 6 });
  }
}
function revealSecrets() {
  for (const w of World.wrecks) revealAround(w.x, w.y, 1.5);
  for (const c of World.caves) revealAround(c.x, c.y, 1.5);
}

// ===== Mensajes y efectos =====
function floatText(x, y, text, color) { G.texts.push({ x, y, text, color: color || '#fff', life: 1.6 }); }
function msgOnce(key, text, cd) {
  if ((G.msgCooldown[key] || 0) > G.time) return;
  G.msgCooldown[key] = G.time + (cd || 4);
  UI.toast(text);
}
function addFx(type, x, y, n, color) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, s = 20 + rnd() * 90;
    G.fx.push({ type, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + rnd() * 0.6, max: 1.1, color, r: 2 + rnd() * 4 });
  }
}
function damagePlayer(dmg, holeChance, holes) {
  if (G.paused) return;
  S.hp -= dmg;
  G.hitFlash = 0.25; G.shake = Math.min(12, G.shake + dmg * 0.6);
  if (rnd() < (holeChance || 0)) addHole(holes || 1);
  Sfx.play('hit');
  if (S.hp <= 0) sinkPlayer();
}
function addHole(n) {
  const before = S.holes;
  S.holes = Math.min(12, S.holes + n);
  if (S.holes > before) { floatText(G.ship.x, G.ship.y - 30, '¡Nuevo hueco!', '#ff7b7b'); }
}

function sinkPlayer() {
  S.hp = 0;
  S.stats.sunk++;
  const lost = cargoValue();
  for (const k of ITEM_ORDER) S.cargo[k] = 0;
  G.paused = true;
  UI.dialog('☠️ ¡Te hundieron!', 'Perdiste todo el botín de la bodega' + (lost ? ' (≈' + lost + ' de oro)' : '') +
    '.<br>Unos pescadores te remolcaron hasta ' + PORTS[S.lastPort].name + '. Tu oro está a salvo.', [
    { label: 'Volver a puerto', fn: () => { respawn(); } }]);
}
function respawn() {
  const st = stats();
  S.hp = Math.round(st.maxHp * 0.5); S.holes = 0; S.water = 0; S.morale = 100;
  G.enemies = G.enemies.filter(e => e.raid); G.shots = []; G.slams = []; G.boss = null;
  placeAtPort(S.lastPort);
  G.paused = false;
  saveGame();
}
function floodPlayer() {
  let lostUnits = 0;
  for (const k of ITEM_ORDER) { const l = Math.ceil(S.cargo[k] / 2); S.cargo[k] -= l; lostUnits += l; }
  S.water = 40;
  Sfx.play('splash');
  UI.dialog('🌊 ¡El barco se llenó de agua!', 'Tuviste que tirar la mitad del botín por la borda para no hundirte' +
    (lostUnits ? ' (' + lostUnits + ' objetos)' : '') + '.<br><b>Tapa los huecos con tablas</b> o vuelve a puerto a reparar.', [{ label: 'Seguir', fn: () => { G.paused = false; } }]);
  G.paused = true;
}

// ===== Navegación (A*) =====
function findPath(sx, sy, ex, ey) {
  let tx = Math.floor(ex / TILE), ty = Math.floor(ey / TILE);
  const fx = Math.floor(sx / TILE), fy = Math.floor(sy / TILE);
  // destino en tierra: busca agua cercana
  if (!World.reach[ty * WW + tx] || World.tileAt(tx, ty) === W_ROCK) {
    let best = null, bd = 1e9;
    for (let r = 1; r <= 6 && !best; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = tx + dx, y = ty + dy;
      if (x < 0 || y < 0 || x >= WW || y >= WH) continue;
      if (World.reach[y * WW + x] && World.tileAt(x, y) !== W_ROCK) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = [x, y]; } }
    }
    if (!best) return null;
    [tx, ty] = best;
  }
  if (fx === tx && fy === ty) return [{ x: ex, y: ey }];
  const N = WW * WH, goal = ty * WW + tx, start = fy * WW + fx;
  const gS = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const heap = []; const push = (i, f) => { heap.push([f, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  gS[start] = 0; push(start, 0);
  const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  let iter = 0, found = false;
  while (heap.length && iter++ < 40000) {
    const [, i] = pop();
    if (closed[i]) continue; closed[i] = 1;
    if (i === goal) { found = true; break; }
    const x = i % WW, y = (i / WW) | 0;
    for (const [dx, dy, c] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= WW || ny >= WH) continue;
      const j = ny * WW + nx;
      const t = World.tiles[j];
      if (t === W_LAND || t === W_ROCK) continue;
      if (dx && dy) { const a = World.tiles[y * WW + nx], b = World.tiles[ny * WW + x]; if (a === W_LAND || a === W_ROCK || b === W_LAND || b === W_ROCK) continue; }
      let cost = c * (t === W_REEF ? 4 : 1);
      // evita pegarse a la costa
      const g = gS[i] + cost;
      if (g < gS[j]) { gS[j] = g; from[j] = i; push(j, g + Math.hypot(nx - tx, ny - ty)); }
    }
  }
  if (!found) return null;
  const pts = [];
  for (let i = goal; i !== -1 && i !== start; i = from[i]) pts.push({ x: (i % WW + 0.5) * TILE, y: (((i / WW) | 0) + 0.5) * TILE });
  pts.reverse();
  if (pts.length) { pts[pts.length - 1] = World.reach[Math.floor(ey / TILE) * WW + Math.floor(ex / TILE)] ? { x: ex, y: ey } : pts[pts.length - 1]; }
  // suavizado por línea de visión
  const out = []; let cur = { x: sx, y: sy }, k = 0;
  while (k < pts.length) {
    let far = k;
    for (let m = pts.length - 1; m > k; m--) if (lineClear(cur.x, cur.y, pts[m].x, pts[m].y)) { far = m; break; }
    out.push(pts[far]); cur = pts[far]; k = far + 1;
  }
  return out;
}
function lineClear(x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 10);
  for (let i = 1; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
    for (const [ox, oy] of [[0, 0], [9, 0], [-9, 0], [0, 9], [0, -9]]) {
      const t = World.tileAtWorld(x + ox, y + oy);
      if (t === W_LAND || t === W_ROCK || t === W_REEF) return false;
    }
  }
  return true;
}
function setDestination(wx, wy) {
  G.manualMode = false; G.ship.speedFrac = 0;
  const p = findPath(G.ship.x, G.ship.y, wx, wy);
  G.path = p && p.length ? p : null;
  G.destMark = G.path ? { x: G.path[G.path.length - 1].x, y: G.path[G.path.length - 1].y, t: 1 } : null;
}

// ===== Actualización =====
function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

function update(dt) {
  G.time += dt;
  if (G.paused) return;
  S.stats.time += dt;
  const st = stats();
  const sh = G.ship;
  const zone = World.zoneAtWorld(sh.x, sh.y);
  if (zone !== G.curZone) {
    G.curZone = zone;
    UI.toast('🧭 ' + ZONES[zone].name + (S.stage + 1 < ZONES[zone].req ? ' — ⚠️ peligroso para tu barco' : ''), 3);
  }

  // --- viento ---
  G.windTimer -= dt;
  if (G.windTimer <= 0) { G.windTimer = 30 + rnd() * 30; G.windTarget = G.wind + (rnd() - 0.5) * 2.4; }
  G.wind += angDiff(G.wind, G.windTarget) * dt * 0.1;

  // --- control ---
  const k = G.keys;
  let throttle = 0, steer = 0, manual = false;
  if (k.ArrowLeft || k.a || k.A) { steer = -1; manual = true; }
  if (k.ArrowRight || k.d || k.D) { steer = 1; manual = true; }
  if (k.ArrowUp || k.w || k.W) { throttle = 1; manual = true; }
  if (k.ArrowDown || k.s || k.S) { throttle = -1; manual = true; }
  let wantSpeed = 0;
  if (manual) {
    G.path = null; G.destMark = null; G.manualMode = true;
    sh.angle += steer * st.turn * dt;
    if (throttle > 0) sh.speedFrac = Math.min(1, (sh.speedFrac || 0) + dt * 1.5);
    if (throttle < 0) sh.speedFrac = Math.max(0, (sh.speedFrac || 0) - dt * 1.5);
  }
  if (G.path) {
    const wp = G.path[0];
    const dx = wp.x - sh.x, dy = wp.y - sh.y, dist = Math.hypot(dx, dy);
    const last = G.path.length === 1;
    if (dist < 22) { G.path.shift(); if (!G.path.length) { G.path = null; G.destMark = null; } }
    const target = Math.atan2(dy, dx);
    const d = angDiff(sh.angle, target);
    sh.angle += Math.max(-st.turn * dt, Math.min(st.turn * dt, d));
    wantSpeed = Math.abs(d) > 1.6 ? 0.35 : 1;
    if (last && dist < 90) wantSpeed = Math.min(wantSpeed, 0.3 + dist / 130);
  } else if (G.manualMode) wantSpeed = sh.speedFrac || 0;

  // velocidad
  let maxV = st.speed;
  maxV *= 1 + 0.18 * Math.cos(angDiff(sh.angle, G.wind));
  maxV *= 1 - S.water / 220;
  if (S.morale < 15) maxV *= 0.65; else if (S.morale < 40) maxV *= 0.8;
  if (World.tileAtWorld(sh.x, sh.y) === W_REEF) maxV *= 0.75;
  const target = wantSpeed * maxV;
  sh.speed += (target - sh.speed) * Math.min(1, dt * (target > sh.speed ? 0.9 : 1.6));
  // movimiento + colisión
  const nx = sh.x + Math.cos(sh.angle) * sh.speed * dt, ny = sh.y + Math.sin(sh.angle) * sh.speed * dt;
  const len = SHIPS[S.stage].len * 0.45;
  const bowX = nx + Math.cos(sh.angle) * len, bowY = ny + Math.sin(sh.angle) * len;
  const tb = World.tileAtWorld(bowX, bowY), tc = World.tileAtWorld(nx, ny);
  if (tb === W_LAND || tc === W_LAND || tb === W_ROCK || tc === W_ROCK) {
    if ((tb === W_ROCK || tc === W_ROCK) && sh.speed > 50 && G.rockCd <= 0) {
      G.rockCd = 1.2; damagePlayer(5, 0.8, 1); floatText(sh.x, sh.y - 20, '¡Rocas!', '#ffb07b');
    }
    sh.speed *= -0.25;
    if (G.path) { const p = G.path[G.path.length - 1]; setDestination(p.x, p.y); }
  } else { sh.x = nx; sh.y = ny; }
  G.rockCd -= dt;
  sh.x = Math.max(TILE * 2, Math.min((WW - 2) * TILE, sh.x));
  sh.y = Math.max(TILE * 2, Math.min((WH - 2) * TILE, sh.y));

  // estela
  if (Math.abs(sh.speed) > 20 && rnd() < dt * 30) {
    G.fx.push({ type: 'wake', x: sh.x - Math.cos(sh.angle) * len, y: sh.y - Math.sin(sh.angle) * len, vx: 0, vy: 0, life: 1.2, max: 1.2, r: 3 + S.stage });
  }

  // --- arrecifes ---
  G.reefTimer -= dt;
  if (World.tileAtWorld(sh.x, sh.y) === W_REEF && Math.abs(sh.speed) > 30 && G.reefTimer <= 0) {
    G.reefTimer = 0.8;
    let ch = 0.45 * (1 - 0.12 * S.parts.timon) * (S.stage >= 1 ? 0.45 : 1);
    if (rnd() < ch) { damagePlayer(2, 1, 1); msgOnce('reef', '🪸 ¡Los arrecifes rasgan el casco! (mejora el Timón o el barco)', 6); }
  }
  // --- zona peligrosa para el barco ---
  G.zoneTimer -= dt;
  const diff = ZONES[zone].req - (S.stage + 1);
  if (diff > 0 && G.zoneTimer <= 0) {
    G.zoneTimer = 1;
    damagePlayer(1.2 * diff + (zone === 3 ? 2 : 0), 0.12 * diff, 1);
    msgOnce('zonereq', '⚠️ ¡Tu barco no aguanta ' + ZONES[zone].name + '! Necesitas: ' + SHIPS[ZONES[zone].req - 1].name + ' o mejor (Astillero).', 7);
  }

  // --- huecos y agua ---
  if (st.leak > 0) {
    G.leakTimer += dt;
    if (G.leakTimer >= st.leak) { G.leakTimer = 0; addHole(1); msgOnce('leak', '💧 El bote hace agua: ¡apareció un hueco!', 10); }
  }
  if (hasCrew('carpintero') && S.holes > 0) {
    G.carpTimer += dt;
    if (G.carpTimer >= 18) { G.carpTimer = 0; S.holes--; floatText(sh.x, sh.y - 30, '🔨 Carpintero tapó un hueco', '#9fe39f'); }
  }
  if (S.holes > 0) S.water += S.holes * st.waterRate * dt;
  else S.water = Math.max(0, S.water - 1.2 * dt);
  if (S.water >= 100) floodPlayer();

  // --- moral ---
  const nearPort = World.ports.some(p => Math.hypot(p.x - sh.x, p.y - sh.y) < 160);
  if (nearPort) S.morale = Math.min(100, S.morale + dt * 10);
  else S.morale = Math.max(0, S.morale - dt * (100 / 360) * (hasCrew('cocinero') ? 0.45 : 1) * (S.legends.chalice ? 0.7 : 1));

  // --- niebla ---
  revealAround(sh.x, sh.y, st.reveal);

  // --- botín ---
  for (let i = G.loot.length - 1; i >= 0; i--) {
    const l = G.loot[i];
    if (Math.hypot(l.x - sh.x, l.y - sh.y) < 34 + S.stage * 3) {
      if (tryCollect(l)) G.loot.splice(i, 1);
    }
  }
  G.lootTimer -= dt;
  if (G.lootTimer <= 0) {
    G.lootTimer = 2;
    const counts = [0, 0, 0, 0];
    for (const l of G.loot) if (l.zone >= 0) counts[l.zone]++;
    for (let z = 0; z < 4; z++) if (counts[z] < lootTarget(z)) spawnLoot(z, false);
  }

  updateEnemies(dt, st, zone);
  updateBoss(dt, st);
  updateStorms(dt, zone);
  updateRaid(dt);
  updateShots(dt, st);

  // tabernas
  G.tavTimer = (G.tavTimer || 0) - dt;
  if (G.tavTimer <= 0) { G.tavTimer = 5; tavernTick(); }

  // --- disparo ---
  G.reload -= dt;
  if (G.fireHeld) fire();

  // --- objetos cercanos (botón de acción) ---
  G.nearby = findNearby();

  // efectos
  for (let i = G.fx.length - 1; i >= 0; i--) {
    const f = G.fx[i]; f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.94; f.vy *= 0.94;
    if (f.life <= 0) G.fx.splice(i, 1);
  }
  if (G.fx.length > 400) G.fx.splice(0, G.fx.length - 400);
  for (let i = G.texts.length - 1; i >= 0; i--) { const t = G.texts[i]; t.life -= dt; t.y -= 22 * dt; if (t.life <= 0) G.texts.splice(i, 1); }
  G.hitFlash = Math.max(0, G.hitFlash - dt); G.flash = Math.max(0, G.flash - dt * 2); G.shake = Math.max(0, G.shake - dt * 30);
  if (G.destMark) G.destMark.t += dt;

  G.saveTimer += dt;
  if (G.saveTimer > 20) { G.saveTimer = 0; saveGame(); }
}

function findNearby() {
  const sh = G.ship;
  for (const p of World.ports) if (Math.hypot(p.x - sh.x, p.y - sh.y) < 120) return { type: 'port', obj: p, label: '⚓ Atracar en ' + p.name };
  for (const c of World.caves) if (!S.caves[c.id] && isRevealedWorld(c.x, c.y) && Math.hypot(c.ix - sh.x, c.iy - sh.y) < 70) return { type: 'cave', obj: c, label: '🕳️ Explorar cueva' };
  for (const w of World.wrecks) if (!S.wrecks[w.id] && Math.hypot(w.x - sh.x, w.y - sh.y) < 60) return { type: 'wreck', obj: w, label: hasCrew('buzo') ? '🤿 Bucear naufragio' : '🤿 Naufragio (necesitas Buzo)' };
  for (const x of World.xmarks) if (S.pieces[x.map] >= 3 && !S.xDug[x.map] && Math.hypot(x.x - sh.x, x.y - sh.y) < 70) return { type: 'x', obj: x, label: '⛏️ Desenterrar tesoro' };
  return null;
}

function doAction() {
  const n = G.nearby; if (!n) return;
  if (n.type === 'port') { UI.openPort(n.obj.id); return; }
  if (n.type === 'cave') {
    const c = n.obj; S.caves[c.id] = true;
    const items = 3 + c.zone; let txt = 'Encontraste un cofre escondido en la cueva.';
    lootBurst(c.ix, c.iy, c.zone, items);
    const g = Math.round((80 + rnd() * 120) * ZONES[c.zone].lootMult); addGold(g); txt += '<br>+' + g + ' de oro.';
    if (c.legend && !S.legends[c.legend]) { S.legends[c.legend] = true; txt += '<br><b>⭐ Objeto legendario: ' + LEGENDS[c.legend].name + '</b><br><i>' + LEGENDS[c.legend].desc + '</i>'; }
    if (rnd() < 0.5) maybePiece(c.zone + 1, 1);
    Sfx.play('treasure'); UI.dialog('🕳️ Cueva secreta', txt, [{ label: '¡Genial!' }]); saveGame(); return;
  }
  if (n.type === 'wreck') {
    if (!hasCrew('buzo')) { UI.toast('Necesitas contratar un 🤿 Buzo en una taberna para bucear aquí.'); return; }
    const w = n.obj; S.wrecks[w.id] = true;
    lootBurst(w.x, w.y, Math.min(3, w.zone + 1), 4 + w.zone);
    const g = Math.round((150 + rnd() * 200) * ZONES[w.zone].lootMult); addGold(g);
    let txt = 'Tu buzo sacó tesoros del naufragio.<br>+' + g + ' de oro y botín flotando alrededor.';
    if (w.legend && !S.legends[w.legend]) { S.legends[w.legend] = true; txt += '<br><b>⭐ Objeto legendario: ' + LEGENDS[w.legend].name + '</b><br><i>' + LEGENDS[w.legend].desc + '</i>'; if (w.legend === 'compass') revealSecrets(); }
    Sfx.play('treasure'); UI.dialog('🤿 Naufragio', txt, [{ label: '¡Genial!' }]); saveGame(); return;
  }
  if (n.type === 'x') {
    const x = n.obj; S.xDug[x.map] = true;
    const g = [1500, 5000, 12000][x.map]; addGold(g);
    const lg = MAP_LEGEND[x.map]; S.legends[lg] = true;
    lootBurst(x.x, x.y, x.zone, 6);
    Sfx.play('treasure');
    UI.dialog('❌ ¡Tesoro desenterrado!', 'Abriste el gran cofre del ' + MAP_NAMES[x.map] + '.<br>+' + g + ' de oro<br><b>⭐ ' + LEGENDS[lg].name + '</b><br><i>' + LEGENDS[lg].desc + '</i><br>Se guardará en las vitrinas de tu sala de tesoros.', [{ label: '¡Soy rico!' }]);
    saveGame();
  }
}

function patchHole() {
  if (S.holes <= 0) { UI.toast('No hay huecos que tapar.'); return; }
  if (S.planks <= 0) { UI.toast('¡No te quedan tablas! Cómpralas en puerto.'); return; }
  S.planks--; S.holes--; Sfx.play('hammer');
  floatText(G.ship.x, G.ship.y - 30, '🪵 Hueco tapado', '#e8c27a');
}

// ===== Disparos =====
function fire() {
  if (G.reload > 0 || G.paused) return;
  const st = stats(), sh = G.ship;
  G.reload = st.reload;
  let target = null, best = st.range;
  const cands = G.enemies.slice(); if (G.boss) cands.push(G.boss);
  for (const e of cands) { const d = Math.hypot(e.x - sh.x, e.y - sh.y); if (d < best) { best = d; target = e; } }
  const n = st.cannons;
  for (let i = 0; i < n; i++) {
    let ang;
    if (target) {
      const tt = best / 420;
      const tx = target.x + (target.vx || 0) * tt, ty = target.y + (target.vy || 0) * tt;
      ang = Math.atan2(ty - sh.y, tx - sh.x) + (rnd() - 0.5) * 0.16;
    } else ang = sh.angle + (i % 2 ? Math.PI / 2 : -Math.PI / 2) + (rnd() - 0.5) * 0.15;
    const off = (i - (n - 1) / 2) * (SHIPS[S.stage].len / Math.max(2, n));
    const ox = sh.x + Math.cos(sh.angle) * off, oy = sh.y + Math.sin(sh.angle) * off;
    G.shots.push({ x: ox, y: oy, vx: Math.cos(ang) * 420, vy: Math.sin(ang) * 420, life: st.range / 420, dmg: st.dmg, enemy: false });
    addFx('smoke', ox + Math.cos(ang) * 10, oy + Math.sin(ang) * 10, 2, '#ddd');
  }
  Sfx.play('cannon');
}

function updateShots(dt) {
  for (let i = G.shots.length - 1; i >= 0; i--) {
    const s = G.shots[i];
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    let hit = false;
    if (World.blocked(s.x, s.y)) { addFx('dust', s.x, s.y, 4, '#c9a26b'); hit = true; }
    else if (s.enemy) {
      if (Math.hypot(s.x - G.ship.x, s.y - G.ship.y) < SHIPS[S.stage].len * 0.45) {
        hit = true; addFx('spark', s.x, s.y, 6, '#ffb347');
        damagePlayer(s.dmg, 0.3, 1);
      }
    } else {
      const cands = G.enemies.slice(); if (G.boss) cands.push(G.boss);
      for (const e of cands) {
        if (Math.hypot(s.x - e.x, s.y - e.y) < (e.radius || 22)) {
          hit = true; addFx('spark', s.x, s.y, 6, '#ffb347');
          e.hp -= s.dmg; e.hitT = 0.15;
          floatText(e.x, e.y - 25, '-' + Math.round(s.dmg), '#ffd1a1');
          break;
        }
      }
    }
    if (!hit && s.life <= 0) { addFx('splash', s.x, s.y, 5, '#cfefff'); hit = true; }
    if (hit) G.shots.splice(i, 1);
  }
}

// ===== Piratas rivales =====
function inSafeHarbor(x, y) { return World.ports.some(p => Math.hypot(p.x - x, p.y - y) < 280); }
function spawnEnemy(zone, x, y, raid) {
  const es = ENEMY_STATS[zone];
  const e = { x, y, angle: rnd() * 6.28, speed: 0, vx: 0, vy: 0, hp: es.hp, maxHp: es.hp, zone, reload: 1 + rnd() * 2, raid: !!raid,
    radius: 20 + zone * 3, size: zone, turnBias: rnd() < 0.5 ? 1 : -1, stuck: 0 };
  G.enemies.push(e);
  return e;
}
function updateEnemies(dt, st, zone) {
  const sh = G.ship;
  G.spawnTimer -= dt;
  if (G.spawnTimer <= 0) {
    G.spawnTimer = 4;
    const cv = cargoValue();
    const cap = Math.min(6, 1 + zone + Math.floor(cv / 900));
    const wild = G.enemies.filter(e => !e.raid).length;
    const chance = 0.03 + cv / 9000 + zone * 0.05;
    if (wild < cap && rnd() < chance && !inSafeHarbor(sh.x, sh.y)) {
      for (let k = 0; k < 10; k++) {
        const a = rnd() * 6.28, r = 520 + rnd() * 200;
        const x = sh.x + Math.cos(a) * r, y = sh.y + Math.sin(a) * r;
        const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
        if (tx < 0 || ty < 0 || tx >= WW || ty >= WH) continue;
        if (!World.reach[ty * WW + tx] || World.tileAt(tx, ty) !== W_WATER || inSafeHarbor(x, y)) continue;
        spawnEnemy(World.zone[ty * WW + tx], x, y);
        if (cv > 300) msgOnce('pir', '🏴‍☠️ ¡Piratas rivales huelen tu botín!', 15);
        break;
      }
    }
  }
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i]; const es = ENEMY_STATS[e.zone];
    e.hitT = Math.max(0, (e.hitT || 0) - dt);
    const dx = sh.x - e.x, dy = sh.y - e.y, d = Math.hypot(dx, dy);
    if (e.hp <= 0) {
      G.enemies.splice(i, 1);
      addFx('spark', e.x, e.y, 18, '#ff9a3c'); addFx('smoke', e.x, e.y, 10, '#555'); Sfx.play('boom');
      const g = Math.round(es.gold * (0.7 + rnd() * 0.6)); addGold(g); S.stats.enemies++;
      floatText(e.x, e.y - 20, '+' + g + ' oro (recompensa)', '#ffd23f');
      lootBurst(e.x, e.y, e.zone, 1 + Math.floor(rnd() * 3));
      if (rnd() < 0.12) G.loot.push({ x: e.x, y: e.y, kind: 'piece', map: Math.min(2, Math.max(0, e.zone - 1)), qty: 1, zone: -1, bob: 0 });
      if (e.raid && G.raid) G.raid.left--;
      continue;
    }
    if (!e.raid && d > 1400) { G.enemies.splice(i, 1); continue; }
    const safe = inSafeHarbor(sh.x, sh.y) && !e.raid;
    let desired;
    if (e.raid && G.raid && d > 600) {
      const p = World.ports[G.raid.port];
      const a = G.time * 0.3 + i;
      desired = Math.atan2(p.y + Math.sin(a) * 160 - e.y, p.x + Math.cos(a) * 160 - e.x);
    } else if (safe) desired = Math.atan2(-dy, -dx);
    else if (d > 190) desired = Math.atan2(dy, dx);
    else desired = Math.atan2(dy, dx) + e.turnBias * Math.PI / 2;
    // evita tierra mirando adelante
    const look = 50;
    for (let t = 0; t < 6; t++) {
      const lx = e.x + Math.cos(desired) * look, ly = e.y + Math.sin(desired) * look;
      if (!World.blocked(lx, ly)) break;
      desired += e.turnBias * 0.6;
    }
    e.angle += Math.max(-2 * dt, Math.min(2 * dt, angDiff(e.angle, desired)));
    const v = es.speed * (safe ? 1.1 : 1);
    e.speed += (v - e.speed) * dt;
    const nx = e.x + Math.cos(e.angle) * e.speed * dt, ny = e.y + Math.sin(e.angle) * e.speed * dt;
    if (!World.blocked(nx, ny)) { e.vx = (nx - e.x) / dt; e.vy = (ny - e.y) / dt; e.x = nx; e.y = ny; e.stuck = 0; }
    else { e.angle += e.turnBias * 1.5 * dt * 4; e.stuck += dt; e.vx = e.vy = 0; if (e.stuck > 3) e.turnBias *= -1; }
    e.reload -= dt;
    if (!safe && d < 300 && e.reload <= 0 && !G.paused) {
      e.reload = es.reload * (0.85 + rnd() * 0.3);
      const balls = 1 + Math.min(2, e.zone);
      for (let b = 0; b < balls; b++) {
        const tt = d / 360;
        const tx = sh.x + Math.cos(sh.angle) * sh.speed * tt, ty = sh.y + Math.sin(sh.angle) * sh.speed * tt;
        const ang = Math.atan2(ty - e.y, tx - e.x) + (rnd() - 0.5) * 0.3;
        G.shots.push({ x: e.x, y: e.y, vx: Math.cos(ang) * 360, vy: Math.sin(ang) * 360, life: 330 / 360, dmg: es.dmg, enemy: true });
      }
      Sfx.play('cannon2');
    }
  }
}

// ===== Jefes =====
function updateBoss(dt, st) {
  const sh = G.ship;
  if (!G.boss) {
    for (const b in BOSSES) {
      if (S.bosses[b]) continue;
      const l = World.lairs[b];
      if (Math.hypot(l.x - sh.x, l.y - sh.y) < 650) {
        const def = BOSSES[b];
        G.boss = { type: b, x: l.x, y: l.y, hp: def.hp, maxHp: def.hp, angle: 0, t: 0, timer: 3, state: 'idle', radius: b === 'kraken' ? 70 : (b === 'ghost' ? 40 : 34), trail: [], vx: 0, vy: 0, cd: 0, alpha: 1 };
        UI.toast('⚔️ ¡' + def.name + ' aparece!', 4); Sfx.play('roar'); G.shake = 14;
        break;
      }
    }
    return;
  }
  const b = G.boss, def = BOSSES[b.type];
  const l = World.lairs[b.type];
  const dx = sh.x - b.x, dy = sh.y - b.y, d = Math.hypot(dx, dy);
  b.t += dt; b.timer -= dt; b.cd -= dt; b.hitT = Math.max(0, (b.hitT || 0) - dt);
  if (b.hp <= 0) {
    S.bosses[b.type] = true;
    const trophy = b.type; S.trophies[trophy] = true;
    addGold(def.reward);
    addFx('spark', b.x, b.y, 40, '#ffd23f'); addFx('smoke', b.x, b.y, 20, '#444'); Sfx.play('treasure');
    lootBurst(b.x, b.y, Math.min(3, def.zone + 1), 8);
    G.boss = null; G.slams = [];
    UI.dialog('🏆 ¡Derrotaste a ' + def.name + '!', '+' + def.reward + ' de oro<br>Trofeo conseguido: <b>' + TROPHIES[trophy].name + '</b><br>Se colgará en la pared de tu sala de tesoros.', [{ label: '¡Victoria!' }]);
    saveGame();
    return;
  }
  if (Math.hypot(sh.x - l.x, sh.y - l.y) > 1500) { G.boss = null; G.slams = []; return; }
  if (b.type === 'serpent') {
    if (b.state === 'dash') {
      const sp = 360; b.x += Math.cos(b.angle) * sp * dt; b.y += Math.sin(b.angle) * sp * dt;
      if (b.timer <= 0) { b.state = 'circle'; b.timer = 3 + rnd() * 1.5; }
    } else {
      const a = Math.atan2(b.y - sh.y, b.x - sh.x) + dt * 0.9;
      const tx = sh.x + Math.cos(a) * 230, ty = sh.y + Math.sin(a) * 230;
      const want = Math.atan2(ty - b.y, tx - b.x);
      b.angle += angDiff(b.angle, want) * Math.min(1, dt * 3);
      b.x += Math.cos(b.angle) * 170 * dt; b.y += Math.sin(b.angle) * 170 * dt;
      if (b.timer <= 0) { b.state = 'dash'; b.timer = 1.1; b.angle = Math.atan2(dy, dx); UI.toast('🐍 ¡La serpiente embiste!', 1.2); }
    }
    b.vx = Math.cos(b.angle) * 170; b.vy = Math.sin(b.angle) * 170;
    b.trail.unshift({ x: b.x, y: b.y }); if (b.trail.length > 60) b.trail.pop();
    if (d < 45 && b.cd <= 0) { b.cd = 1.2; damagePlayer(14, 1, 2); G.ship.speed *= 0.3; }
  } else if (b.type === 'kraken') {
    const rate = b.hp < b.maxHp / 2 ? 1.5 : 2.3;
    if (b.timer <= 0) {
      b.timer = rate;
      const n = b.hp < b.maxHp / 2 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const lead = 0.9;
        G.slams.push({ x: sh.x + Math.cos(sh.angle) * sh.speed * lead + (rnd() - 0.5) * 80 * k, y: sh.y + Math.sin(sh.angle) * sh.speed * lead + (rnd() - 0.5) * 80 * k, t: 1.3, r: 62 });
      }
    }
    if (d < 130 && b.cd <= 0) { b.cd = 1; damagePlayer(8, 0.5, 1); msgOnce('grab', '🐙 ¡Los tentáculos te agarran! Aléjate.', 3); }
  } else if (b.type === 'ghost') {
    b.alpha = Math.min(1, b.alpha + dt);
    if (b.timer <= 0) {
      b.timer = 7 + rnd() * 3;
      const a = rnd() * 6.28;
      const nx = sh.x + Math.cos(a) * 260, ny = sh.y + Math.sin(a) * 260;
      if (!World.blocked(nx, ny)) { addFx('smoke', b.x, b.y, 14, '#9fffd8'); b.x = nx; b.y = ny; b.alpha = 0.1; }
    }
    let desired = d > 200 ? Math.atan2(dy, dx) : Math.atan2(dy, dx) + Math.PI / 2;
    b.angle += Math.max(-2 * dt, Math.min(2 * dt, angDiff(b.angle, desired)));
    const nx = b.x + Math.cos(b.angle) * 150 * dt, ny = b.y + Math.sin(b.angle) * 150 * dt;
    b.vx = Math.cos(b.angle) * 150; b.vy = Math.sin(b.angle) * 150;
    b.x = nx; b.y = ny; // fantasma: atraviesa todo
    if (b.cd <= 0 && d < 340) {
      b.cd = b.hp < b.maxHp / 2 ? 1.5 : 2.1;
      for (let k = -2; k <= 2; k++) {
        const ang = Math.atan2(dy, dx) + k * 0.13;
        G.shots.push({ x: b.x, y: b.y, vx: Math.cos(ang) * 340, vy: Math.sin(ang) * 340, life: 1.1, dmg: 16, enemy: true, ghost: true });
      }
      Sfx.play('cannon2');
    }
  }
  for (let i = G.slams.length - 1; i >= 0; i--) {
    const s = G.slams[i]; s.t -= dt;
    if (s.t <= 0) {
      G.slams.splice(i, 1); addFx('splash', s.x, s.y, 16, '#d6f3ff'); G.shake = 8; Sfx.play('splash');
      if (Math.hypot(sh.x - s.x, sh.y - s.y) < s.r + 10) damagePlayer(22, 1, 2);
    }
  }
}

// ===== Tormentas =====
function updateStorms(dt, zone) {
  const sh = G.ship;
  G.stormTimer -= dt;
  if (G.stormTimer <= 0) {
    G.stormTimer = 5;
    const p = [0.02, 0.05, 0.4, 0.15][zone];
    if (G.storms.length < (zone === 2 ? 4 : 2) && rnd() < p) {
      const a = rnd() * 6.28, r = 500 + rnd() * 400;
      G.storms.push({ x: sh.x + Math.cos(a) * r, y: sh.y + Math.sin(a) * r, r: 170 + rnd() * 170, vx: (rnd() - 0.5) * 40, vy: (rnd() - 0.5) * 40, life: 70 + rnd() * 60, age: 0 });
    }
  }
  let inStorm = false;
  for (let i = G.storms.length - 1; i >= 0; i--) {
    const s = G.storms[i]; s.age += dt; s.life -= dt;
    s.x += (s.vx + Math.cos(G.wind) * 15) * dt; s.y += (s.vy + Math.sin(G.wind) * 15) * dt;
    if (s.life <= 0 || Math.hypot(s.x - sh.x, s.y - sh.y) > 2200) { G.storms.splice(i, 1); continue; }
    if (Math.hypot(s.x - sh.x, s.y - sh.y) < s.r) inStorm = true;
  }
  G.inStorm = inStorm;
  if (inStorm) {
    G.stormDmg = (G.stormDmg || 0) - dt;
    if (G.stormDmg <= 0) {
      G.stormDmg = 1;
      let ch = S.stage >= 2 ? 0.1 : 0.28; if (S.legends.trident) ch *= 0.5;
      ch *= 1 - 0.05 * S.parts.casco;
      if (rnd() < ch) { addHole(1); msgOnce('storm', '⛈️ ¡La tormenta abre huecos en el casco!', 6); }
      G.ship.angle += (rnd() - 0.5) * 0.15;
    }
    if (rnd() < dt * 0.25) { G.flash = 1; Sfx.play('thunder'); }
  }
}

// ===== Ataques a tabernas =====
function updateRaid(dt) {
  const owned = Object.keys(S.taverns);
  if (!owned.length) return;
  if (!G.raid) {
    G.raidTimer -= dt;
    if (G.raidTimer <= 0) {
      G.raidTimer = 300 + rnd() * 300;
      const id = owned[Math.floor(rnd() * owned.length)];
      G.raid = { port: +id, time: 240, spawned: false, left: 3 };
      UI.toast('🔥 ¡Piratas atacan tu taberna en ' + PORTS[id].name + '! Tienes 4 minutos para defenderla.', 6);
    }
    return;
  }
  const r = G.raid, p = World.ports[r.port];
  r.time -= dt;
  if (!r.spawned && Math.hypot(p.x - G.ship.x, p.y - G.ship.y) < 1300) {
    r.spawned = true;
    const z = p.zone;
    for (let k = 0; k < 3; k++) {
      for (let t = 0; t < 20; t++) {
        const a = rnd() * 6.28, x = p.x + Math.cos(a) * 200, y = p.y + Math.sin(a) * 200;
        if (!World.blocked(x, y)) { spawnEnemy(z, x, y, true); break; }
      }
    }
    r.left = G.enemies.filter(e => e.raid).length;
  }
  if (r.spawned && r.left <= 0) {
    const g = 300 * (p.zone + 1); addGold(g);
    UI.dialog('🍺 ¡Taberna defendida!', 'Echaste a los piratas de tu taberna en ' + p.name + '.<br>Los clientes agradecidos te dan +' + g + ' de oro.', [{ label: '¡Salud!' }]);
    G.raid = null; return;
  }
  if (r.time <= 0) {
    const t = S.taverns[r.port];
    if (t) { t.stored = 0; t.closedUntil = Date.now() + 5 * 60000; }
    G.enemies = G.enemies.filter(e => !e.raid);
    UI.toast('💔 Los piratas saquearon tu taberna en ' + p.name + '. Perdiste su caja y estará cerrada 5 min.', 6);
    G.raid = null;
  }
}

// ===== Objetivo actual =====
function objective() {
  const legends = Object.keys(S.legends).length, trophies = Object.keys(S.trophies).length;
  if (!S.stats.loot) return 'Toca el mar para navegar y recoge el botín flotante';
  if (S.stage < 1) {
    if (S.stats.earned < 60 && cargoUsed() > 0) return 'Vuelve a ' + PORTS[0].name + ' y vende en el Mercado';
    if (Object.values(S.parts).every(v => v === 0)) return 'Compra una mejora en la Tienda de partes';
    return 'Junta ' + SHIPS[1].price + ' de oro y compra una Balandra en el Astillero';
  }
  if (!S.crew.length) return 'Contrata tripulación en la Taberna';
  if (!S.xDug[0] && S.stage < 3) return S.pieces[0] < 3 ? 'Junta los 3 pedazos del mapa del tesoro (' + S.pieces[0] + '/3) — Taberna' : 'Sigue la ❌ de tu mapa y desentierra el tesoro';
  if (!Object.keys(S.taverns).length && S.stage < 3) return 'Abre tu propia taberna para ganar oro pasivo';
  if (S.stage < 2) return 'Compra un Bergantín para cruzar las Aguas de Tormenta';
  if (!S.bosses.serpent) return 'Derrota a la Serpiente Marina en los Arrecifes de Coral';
  if (S.stage < 3) return 'Compra una Fragata para entrar al Triángulo Maldito';
  if (!S.bosses.kraken) return 'Derrota al Kraken en las Aguas de Tormenta';
  if (!S.bosses.ghost) return 'Derrota al Barco Fantasma del Triángulo Maldito';
  if (!S.house && S.stage < 4) return 'Compra el Galeón (' + SHIPS[4].price + ') o tu casa (' + HOUSE_PRICE + ') para tener tu sala de tesoros';
  return 'Llena tu sala: leyendas ' + legends + '/6 · trofeos ' + trophies + '/3 · decoración ' + Object.keys(S.decor).length + '/' + DECOR.length;
}
