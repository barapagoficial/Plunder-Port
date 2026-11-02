'use strict';
// ===== Estado y simulación =====
const rnd = Math.random;
let S = null;
const G = {
  mode: 'sea', ship: { x: 0, y: 0, angle: -Math.PI / 4, speed: 0, speedFrac: 0, heel: 0 },
  path: null, keys: {}, enemies: [], shots: [], loot: [], fx: [], texts: [], storms: [], slams: [], barrels: [],
  sinking: [], gulls: [], dolphins: [], boss: null, raid: null, raidTimer: 360, boarding: null,
  wind: 0, windTarget: 0, windTimer: 0, time: 0, dayT: 0.3,
  paused: false, revealed: null, nearby: null, msgCooldown: {},
  spawnTimer: 0, lootTimer: 0, saveTimer: 0, leakTimer: 0, carpTimer: 0, reefTimer: 0, zoneTimer: 0,
  stormTimer: 0, reload: 0, special: 0, fireHeld: false, hitFlash: 0, flash: 0, rockCd: 0, curZone: 0, shake: 0,
  combatT: 0, offers: {}, demo: false,
};

function newSave() {
  return {
    v: 2, gold: 50, stage: 0, parts: { casco: 0, velas: 0, bodega: 0, canones: 0, timon: 0 },
    crew: [], planks: 4, cargo: { coins: 0, chest: 0, ruby: 0, diamond: 0, rare: 0 },
    hp: SHIPS[0].hp, holes: 0, water: 0, morale: 100, lastPort: 0, revealed: '',
    pieces: [0, 0, 0], xDug: [false, false, false], legends: {}, trophies: {}, decor: {}, house: false,
    taverns: {}, wrecks: {}, caves: {}, bosses: {}, dug: {},
    stats: { earned: 0, loot: 0, sunk: 0, enemies: 0, time: 0, boarded: 0, dug: 0, crits: 0 },
    tutorial: false, ended: false, sound: true, music: true, vibe: true, contract: null, introSeen: false, dayT: 0.3,
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
    crit: hasCrew('artillero') ? 0.2 : 0.1,
    cannons: sh.cannons,
    reload: hasCrew('artillero') ? 1.05 : 1.45,
    turn: 1.8 * sh.turn * (1 + 0.15 * p.timon),
    leak: sh.leak ? sh.leak * (1 + 0.3 * p.casco) : 0,
    waterRate: 0.32 * (1 - 0.07 * p.casco),
    reveal: 4.5 + S.stage * 0.5 + (hasCrew('vigia') ? 3 : 0) + (S.legends.pearl ? 1 : 0) - nightFactor() * 1.2,
    crewSlots: sh.crew, maxPlanks: sh.planks, range: 290 + S.stage * 25,
  };
}
function cargoUsed() { let n = 0; for (const k of ITEM_ORDER) n += S.cargo[k] * ITEMS[k].size; return n; }
function cargoValue() { let n = 0; for (const k of ITEM_ORDER) n += S.cargo[k] * ITEMS[k].value; return n; }
function addGold(n, fromX, fromY) {
  n = Math.round(n);
  S.gold += n; if (n > 0) { S.stats.earned += n; if (UI.coinBurst) UI.coinBurst(n, fromX, fromY); }
}
function priceAt(portId, item) {
  const p = PORTS[portId];
  const wobble = 1 + 0.08 * Math.sin(G.time / 90 + portId * 1.7 + ITEM_ORDER.indexOf(item) * 2.3);
  return Math.max(1, Math.round(ITEMS[item].value * p.mult[item] * wobble * (S.legends.skull ? 1.1 : 1)));
}
// 0 = día, 1 = noche cerrada
function nightFactor() {
  const t = G.dayT; // 0 amanecer, .25 mediodía, .5 atardecer, .75 medianoche
  const sun = Math.sin(t * Math.PI * 2);
  return Math.max(0, Math.min(1, (-0.15 - sun) * 2.2));
}

// ===== Niebla =====
function initFog() {
  G.revealed = new Uint8Array(WW * WH);
  if (S.revealed) {
    try { const bin = atob(S.revealed); for (let i = 0; i < WW * WH; i++) if (bin.charCodeAt(i >> 3) & (1 << (i & 7))) G.revealed[i] = 1; } catch (e) { }
  }
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
const SAVE_KEY = 'plunderport_save_v2';
function saveGame() {
  if (!S || G.demo) return;
  S.revealed = encodeFog(); S.dayT = G.dayT;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY) || localStorage.getItem('plunderport_save_v1');
    if (!raw) return null;
    const d = JSON.parse(raw), base = newSave();
    for (const k in base) if (d[k] === undefined) d[k] = base[k];
    for (const k in base.stats) if (d.stats[k] === undefined) d.stats[k] = 0;
    return d;
  } catch (e) { return null; }
}
function resetGame() { try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem('plunderport_save_v1'); } catch (e) { } location.reload(); }

// ===== Tabernas =====
function tavernRate(portId) {
  const t = S.taverns[portId]; if (!t) return 0;
  const z = World.ports[portId].zone;
  return TAVERN.income[z] * t.level * (t.keeper ? 1.5 : 1) * (S.legends.crown ? 1.25 : 1);
}
function tavernTick() {
  const now = Date.now(); let gained = 0;
  for (const id in S.taverns) {
    const t = S.taverns[id];
    const mins = Math.max(0, (now - t.last) / 60000);
    const rate = tavernRate(id), cap = rate * TAVERN.capMinutes, before = t.stored;
    if (t.closedUntil && now < t.closedUntil) { t.last = now; continue; }
    t.stored = Math.min(cap, t.stored + mins * rate);
    gained += t.stored - before; t.last = now;
  }
  return gained;
}
function zoneHasTavern(z) { return Object.keys(S.taverns).some(id => World.ports[id].zone === z); }

// ===== Inicio =====
function dockSpot(id) { const p = World.ports[id]; return { x: p.x + 6.9 * TILE, y: p.y + 2.15 * TILE }; }
function placeAtPort(id) {
  const d = dockSpot(id);
  G.ship.x = d.x; G.ship.y = d.y; G.ship.speed = 0; G.ship.angle = 0; G.path = null; G.destMark = null;
}
function startGame(fresh, demo) {
  S = (!fresh && !demo && loadGame()) || newSave();
  G.demo = !!demo;
  G.dayT = S.dayT || 0.3;
  initFog();
  placeAtPort(S.lastPort);
  G.mode = 'sea'; G.hero = null;
  G.enemies = []; G.shots = []; G.loot = []; G.storms = []; G.slams = []; G.boss = null; G.raid = null; G.barrels = []; G.sinking = []; G.fx = []; G.texts = [];
  G.wind = rnd() * Math.PI * 2; G.windTarget = G.wind;
  for (let z = 0; z < 4; z++) for (let k = 0; k < lootTarget(z); k++) spawnLoot(z, true);
  const off = demo ? 0 : tavernTick();
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
      if (!initial && Math.hypot(p.x - G.ship.x, p.y - G.ship.y) < 700) continue;
      if (World.ports.some(pp => Math.hypot(pp.x - p.x, pp.y - p.y) < 380)) continue;
      pos = p; break;
    }
  }
  if (!pos) return;
  const r = rnd();
  if (z >= 1 && r < 0.06) { G.barrels.push({ x: pos.x, y: pos.y, bob: rnd() * 6, zone: z }); return; }
  const kind = r < 0.1 ? 'bottle' : rollItem(z);
  const qty = kind === 'coins' ? 1 + Math.floor(rnd() * (2 + z)) : 1;
  G.loot.push({ x: pos.x + (rnd() - 0.5) * 16, y: pos.y + (rnd() - 0.5) * 16, kind, qty, zone: z, bob: rnd() * 6, born: G.time });
}
function addCargo(kind, n) {
  const st = stats(), size = ITEMS[kind].size;
  let taken = 0;
  while (taken < n && cargoUsed() + size <= st.hold) { S.cargo[kind]++; taken++; }
  return taken;
}
function tryCollect(l) {
  if (l.kind === 'piece') { givePiece(l.map); return true; }
  if (l.kind === 'bottle') { openBottle(l); return true; }
  const taken = addCargo(l.kind, l.qty);
  if (taken === 0) { msgOnce('full', 'La bodega está llena. Vuelve a puerto a vender.', 5, 'crate'); return false; }
  l.qty -= taken; S.stats.loot += taken;
  Sfx.play('coin');
  floatText(l.x, l.y - 10, '+' + taken + ' ' + ITEMS[l.kind].name, ITEMS[l.kind].color);
  addFx('sparkle', l.x, l.y, 8, ITEMS[l.kind].color);
  if ((l.kind === 'chest' || l.kind === 'rare') && l.zone >= 0) maybePiece(l.zone, l.kind === 'rare' ? 0.25 : 0.1);
  return l.qty <= 0;
}
function openBottle(l) {
  Sfx.play('bubble');
  const r = rnd();
  const m = [0, 1, 2].find(i => S.pieces[i] < 3);
  if (r < 0.3 && m !== undefined) { UI.banner('Mensaje en una botella', 'Dentro había un pedazo de mapa', 'bottle'); givePiece(m); return; }
  if (r < 0.65) {
    const opts = World.digs.filter(d => !S.dug[d.id] && !isRevealedWorld(d.x, d.y));
    if (opts.length) {
      const d = opts.sort((a, b) => Math.hypot(a.x - G.ship.x, a.y - G.ship.y) - Math.hypot(b.x - G.ship.x, b.y - G.ship.y))[Math.floor(rnd() * Math.min(5, opts.length))];
      revealAround(d.x, d.y, 3); d.hinted = true;
      UI.banner('Mensaje en una botella', '"Enterré mi tesoro en una isla cercana..." Se marcó en tu mapa.', 'bottle');
      return;
    }
  }
  const g = Math.round((40 + rnd() * 80) * (1 + G.curZone));
  addGold(g, l.x, l.y);
  UI.banner('Mensaje en una botella', 'Un náufrago agradecido dejó ' + g + ' monedas', 'bottle');
}
function maybePiece(zone, chance) {
  const m = Math.min(2, Math.max(0, zone - 1));
  if (S.pieces[m] < 3 && rnd() < chance) givePiece(m);
}
function givePiece(m) {
  if (S.pieces[m] >= 3) { addGold(100); return; }
  S.pieces[m]++;
  UI.toast('Pedazo de mapa: ' + MAP_NAMES[m] + ' (' + S.pieces[m] + '/3)', 3, 'scroll');
  Sfx.play('page');
  if (S.pieces[m] === 3) {
    const x = World.xmarks[m];
    revealAround(x.x, x.y, 4);
    UI.banner('Mapa completo', 'Una X apareció en tu mapa: ' + MAP_NAMES[m], 'map');
  }
}
function lootBurst(x, y, z, n) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = 20 + rnd() * 50;
    let px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (World.blocked(px, py)) { px = x; py = y; }
    G.loot.push({ x: px, y: py, kind: rollItem(z), qty: 1, zone: -1, bob: rnd() * 6, born: G.time, pop: 1 });
  }
}
function revealSecrets() {
  for (const w of World.wrecks) revealAround(w.x, w.y, 1.5);
  for (const c of World.caves) revealAround(c.x, c.y, 1.5);
}

// ===== Mensajes y efectos =====
function floatText(x, y, text, color, big) { G.texts.push({ x, y, text, color: color || '#fff', life: big ? 2 : 1.6, big: !!big }); }
function msgOnce(key, text, cd, icon) {
  if ((G.msgCooldown[key] || 0) > G.time) return;
  G.msgCooldown[key] = G.time + (cd || 4);
  UI.toast(text, 3, icon);
}
function addFx(type, x, y, n, color, spd) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, s = (spd || 1) * (20 + rnd() * 90);
    const life = type === 'smoke' ? 1 + rnd() : (type === 'debris' ? 1.2 + rnd() * 0.6 : 0.5 + rnd() * 0.6);
    G.fx.push({ type, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, r: 2 + rnd() * 4, rot: rnd() * 6, vr: (rnd() - 0.5) * 8, z: type === 'debris' ? 0 : 0, vz: type === 'debris' ? 60 + rnd() * 80 : 0 });
  }
}
function ring(x, y, r, color) { G.fx.push({ type: 'ring', x, y, vx: 0, vy: 0, life: 0.5, max: 0.5, r, color: color || '#fff' }); }

function damagePlayer(dmg, holeChance, holes) {
  if (G.paused || G.demo) return;
  S.hp -= dmg;
  G.hitFlash = 0.25; G.shake = Math.min(14, G.shake + dmg * 0.6);
  if (rnd() < (holeChance || 0)) addHole(holes || 1);
  Sfx.play('crack'); vibrate(40 + dmg * 3);
  addFx('debris', G.ship.x, G.ship.y, 3, '#8a5a32');
  if (S.hp <= 0) sinkPlayer();
}
function addHole(n) {
  const before = S.holes;
  S.holes = Math.min(12, S.holes + n);
  if (S.holes > before) floatText(G.ship.x, G.ship.y - 30, '¡Nuevo hueco!', '#ff7b7b');
}
function sinkPlayer() {
  S.hp = 0; S.stats.sunk++;
  const lost = cargoValue();
  for (const k of ITEM_ORDER) S.cargo[k] = 0;
  G.sinking.push({ x: G.ship.x, y: G.ship.y, angle: G.ship.angle, stage: S.stage, t: 0, player: true });
  G.playerSunk = true;
  Sfx.play('boom'); Sfx.play('bubble');
  G.paused = true;
  setTimeout(() => UI.dialog('Te hundieron', 'Perdiste todo el botín de la bodega' + (lost ? ' (unas ' + fmt(lost) + ' monedas)' : '') +
    '.<br>Unos pescadores te remolcaron hasta <b>' + PORTS[S.lastPort].name + '</b>. Tu oro está a salvo.', [{ label: 'Volver a puerto', fn: () => respawn() }], 'skull'), 1300);
}
function respawn() {
  const st = stats();
  S.hp = Math.round(st.maxHp * 0.5); S.holes = 0; S.water = 0; S.morale = 100;
  G.enemies = G.enemies.filter(e => e.raid); G.shots = []; G.slams = []; G.boss = null; G.playerSunk = false;
  G.mode = 'sea'; G.hero = null;
  placeAtPort(S.lastPort);
  G.paused = false;
  saveGame();
}
function floodPlayer() {
  let lostUnits = 0;
  for (const k of ITEM_ORDER) { const l = Math.ceil(S.cargo[k] / 2); S.cargo[k] -= l; lostUnits += l; }
  S.water = 40;
  Sfx.play('splash'); vibrate(200);
  UI.dialog('¡El barco se llenó de agua!', 'Tuviste que tirar la mitad del botín por la borda para no hundirte' +
    (lostUnits ? ' (' + lostUnits + ' objetos)' : '') + '.<br><b>Tapa los huecos con tablas</b> o vuelve a puerto a reparar.', [{ label: 'Seguir' }], 'drop');
}

// ===== Navegación (A*) para mar y tierra =====
function passableSea(x, y) { const t = World.tileAt(x, y); return t === W_WATER || t === W_REEF; }
function findPath(sx, sy, ex, ey, land) {
  const pass = land ? Land.passableTile : passableSea;
  const valid = land ? (x, y) => pass(x, y) && (World.island[y * WW + x] === Land.island || World.tileAt(x, y) !== W_LAND) : (x, y) => World.reach[y * WW + x] && World.tileAt(x, y) !== W_ROCK;
  let tx = Math.floor(ex / TILE), ty = Math.floor(ey / TILE);
  const fx = Math.floor(sx / TILE), fy = Math.floor(sy / TILE);
  if (tx < 0 || ty < 0 || tx >= WW || ty >= WH) return null;
  if (!valid(tx, ty)) {
    let best = null, bd = 1e9;
    for (let r = 1; r <= 6 && !best; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = tx + dx, y = ty + dy;
      if (x < 0 || y < 0 || x >= WW || y >= WH) continue;
      if (valid(x, y)) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = [x, y]; } }
    }
    if (!best) return null;
    [tx, ty] = best;
  }
  if (fx === tx && fy === ty) return [{ x: ex, y: ey }];
  const N = WW * WH, goal = ty * WW + tx, start = fy * WW + fx;
  const gS = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const heap = [];
  const push = (i, f) => { heap.push([f, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
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
      if (!pass(nx, ny)) continue;
      if (dx && dy && (!pass(nx, y) || !pass(x, ny))) continue;
      const j = ny * WW + nx;
      const cost = c * (!land && World.tiles[j] === W_REEF ? 4 : 1);
      const g = gS[i] + cost;
      if (g < gS[j]) { gS[j] = g; from[j] = i; push(j, g + Math.hypot(nx - tx, ny - ty)); }
    }
  }
  if (!found) return null;
  const pts = [];
  for (let i = goal; i !== -1 && i !== start; i = from[i]) pts.push({ x: (i % WW + 0.5) * TILE, y: (((i / WW) | 0) + 0.5) * TILE });
  pts.reverse();
  if (pts.length && valid(Math.floor(ex / TILE), Math.floor(ey / TILE))) pts[pts.length - 1] = { x: ex, y: ey };
  const out = []; let cur = { x: sx, y: sy }, k = 0;
  while (k < pts.length) {
    let far = k;
    for (let m = pts.length - 1; m > k; m--) if (lineClear(cur.x, cur.y, pts[m].x, pts[m].y, land)) { far = m; break; }
    out.push(pts[far]); cur = pts[far]; k = far + 1;
  }
  return out;
}
function lineClear(x0, y0, x1, y1, land) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 8);
  const r = land ? 6 : 9;
  for (let i = 1; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
    for (const [ox, oy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      if (land) { if (!Land.walkable(x + ox, y + oy)) return false; }
      else { const t = World.tileAtWorld(x + ox, y + oy); if (t === W_LAND || t === W_ROCK || t === W_REEF) return false; }
    }
  }
  return true;
}
function setDestination(wx, wy) {
  if (G.mode === 'land') { Land.setDestination(wx, wy); return; }
  G.manualMode = false; G.ship.speedFrac = 0;
  const p = findPath(G.ship.x, G.ship.y, wx, wy, false);
  G.path = p && p.length ? p : null;
  G.destMark = G.path ? { x: G.path[G.path.length - 1].x, y: G.path[G.path.length - 1].y, t: 0 } : null;
}
function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

// ===== Actualización general =====
function update(dt) {
  G.time += dt;
  updateFx(dt);
  if (G.paused) return;
  G.dayT = (G.dayT + dt / DAY_LENGTH) % 1;
  S.stats.time += dt;
  // viento
  G.windTimer -= dt;
  if (G.windTimer <= 0) { G.windTimer = 30 + rnd() * 30; G.windTarget = G.wind + (rnd() - 0.5) * 2.4; }
  G.wind += angDiff(G.wind, G.windTarget) * dt * 0.1;
  updateAmbient(dt);
  for (let i = G.sinking.length - 1; i >= 0; i--) { const s = G.sinking[i]; s.t += dt; if (s.t > 2.6) G.sinking.splice(i, 1); else if (rnd() < dt * 12) addFx('bubble', s.x + (rnd() - 0.5) * 30, s.y + (rnd() - 0.5) * 20, 1, '#dff6ff'); }
  if (G.mode === 'land') Land.update(dt); else updateSea(dt);
  // tabernas
  G.tavTimer = (G.tavTimer || 0) - dt;
  if (G.tavTimer <= 0) { G.tavTimer = 5; if (!G.demo) tavernTick(); }
  updateRaid(dt);
  // música según combate
  const fighting = G.enemies.some(e => Math.hypot(e.x - G.ship.x, e.y - G.ship.y) < 500) || G.boss || (G.mode === 'land' && Land.crabs.length > 0);
  G.combatT = fighting ? 3 : Math.max(0, G.combatT - dt);
  Music.setIntensity(G.combatT > 0 ? 1 : 0);
  G.saveTimer += dt;
  if (G.saveTimer > 20) { G.saveTimer = 0; saveGame(); }
}

function updateFx(dt) {
  for (let i = G.fx.length - 1; i >= 0; i--) {
    const f = G.fx[i]; f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt;
    const drag = f.type === 'smoke' ? 0.97 : 0.93; f.vx *= drag; f.vy *= drag;
    if (f.type === 'smoke') { f.vx += Math.cos(G.wind) * 10 * dt; f.vy += Math.sin(G.wind) * 10 * dt; }
    if (f.type === 'debris') { f.vz -= 220 * dt; f.z = Math.max(0, f.z + f.vz * dt); f.rot += f.vr * dt; if (f.z === 0) { f.vx *= 0.9; f.vy *= 0.9; } }
    if (f.type === 'bubble') f.y -= 0;
    if (f.life <= 0) G.fx.splice(i, 1);
  }
  if (G.fx.length > 500) G.fx.splice(0, G.fx.length - 500);
  for (let i = G.texts.length - 1; i >= 0; i--) { const t = G.texts[i]; t.life -= dt; t.y -= 24 * dt; if (t.life <= 0) G.texts.splice(i, 1); }
  G.hitFlash = Math.max(0, G.hitFlash - dt); G.flash = Math.max(0, G.flash - dt * 2); G.shake = Math.max(0, G.shake - dt * 30);
  if (G.destMark) G.destMark.t += dt;
}

function updateAmbient(dt) {
  const cx = G.mode === 'land' && G.hero ? G.hero.x : G.ship.x, cy = G.mode === 'land' && G.hero ? G.hero.y : G.ship.y;
  // gaviotas
  if (G.gulls.length < 6 && rnd() < dt * 0.3 && G.curZone < 3) {
    const a = rnd() * 6.28, n = 2 + Math.floor(rnd() * 3);
    const bx = cx + Math.cos(a) * 500, by = cy + Math.sin(a) * 500, ang = a + Math.PI + (rnd() - 0.5);
    for (let k = 0; k < n; k++) G.gulls.push({ x: bx + (rnd() - 0.5) * 60, y: by + (rnd() - 0.5) * 60, a: ang, s: 70 + rnd() * 20, f: rnd() * 6, life: 14 });
    if (rnd() < 0.5) Sfx.play('gull', 0.7);
  }
  for (let i = G.gulls.length - 1; i >= 0; i--) {
    const g = G.gulls[i]; g.life -= dt; g.a += Math.sin(G.time * 0.7 + i) * 0.3 * dt;
    g.x += Math.cos(g.a) * g.s * dt; g.y += Math.sin(g.a) * g.s * dt; g.f += dt * 9;
    if (g.life <= 0) G.gulls.splice(i, 1);
  }
  // delfines
  if (G.mode === 'sea' && G.dolphins.length < 3 && rnd() < dt * 0.05 && G.curZone <= 1) {
    const a = G.ship.angle + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd()), r = 90 + rnd() * 80;
    const x = G.ship.x + Math.cos(a) * r, y = G.ship.y + Math.sin(a) * r;
    if (!World.blocked(x, y)) G.dolphins.push({ x, y, a: G.ship.angle + (rnd() - 0.5) * 0.6, t: 0, n: 2 + Math.floor(rnd() * 3) });
  }
  for (let i = G.dolphins.length - 1; i >= 0; i--) {
    const d = G.dolphins[i]; d.t += dt; d.x += Math.cos(d.a) * 150 * dt; d.y += Math.sin(d.a) * 150 * dt;
    if (d.t > 1.2 * d.n) { G.dolphins.splice(i, 1); continue; }
    const ph = (d.t % 1.2) / 1.2;
    if (Math.abs(ph - 0.05) < dt || Math.abs(ph - 0.75) < dt) addFx('splash', d.x, d.y, 4, '#e0f7ff', 0.4);
  }
}

// ===== Mar =====
function updateSea(dt) {
  const st = stats(), sh = G.ship;
  const zone = World.zoneAtWorld(sh.x, sh.y);
  if (zone !== G.curZone) {
    G.curZone = zone;
    if (!G.demo) UI.zoneBanner(ZONES[zone].name, S.stage + 1 < ZONES[zone].req ? 'Peligroso para tu barco' : '');
  }
  // control
  const k = G.keys;
  let throttle = 0, steer = 0, manual = false;
  if (k.ArrowLeft || k.a || k.A) { steer = -1; manual = true; }
  if (k.ArrowRight || k.d || k.D) { steer = 1; manual = true; }
  if (k.ArrowUp || k.w || k.W) { throttle = 1; manual = true; }
  if (k.ArrowDown || k.s || k.S) { throttle = -1; manual = true; }
  let wantSpeed = 0, turning = 0;
  if (manual) {
    G.path = null; G.destMark = null; G.manualMode = true;
    sh.angle += steer * st.turn * dt; turning = steer;
    if (throttle > 0) sh.speedFrac = Math.min(1, (sh.speedFrac || 0) + dt * 1.5);
    if (throttle < 0) sh.speedFrac = Math.max(0, (sh.speedFrac || 0) - dt * 1.5);
  }
  if (G.path) {
    const wp = G.path[0];
    const dx = wp.x - sh.x, dy = wp.y - sh.y, dist = Math.hypot(dx, dy);
    const last = G.path.length === 1;
    if (dist < 22) { G.path.shift(); if (!G.path.length) { G.path = null; G.destMark = null; } }
    const d = angDiff(sh.angle, Math.atan2(dy, dx));
    const turn = Math.max(-st.turn * dt, Math.min(st.turn * dt, d));
    sh.angle += turn; turning = Math.sign(turn) * Math.min(1, Math.abs(d));
    wantSpeed = Math.abs(d) > 1.6 ? 0.35 : 1;
    if (last && dist < 90) wantSpeed = Math.min(wantSpeed, 0.3 + dist / 130);
  } else if (G.manualMode) wantSpeed = sh.speedFrac || 0;
  sh.heel += (turning * 0.25 - sh.heel) * Math.min(1, dt * 3);

  let maxV = st.speed;
  maxV *= 1 + 0.18 * Math.cos(angDiff(sh.angle, G.wind));
  maxV *= 1 - S.water / 220;
  if (S.morale < 15) maxV *= 0.65; else if (S.morale < 40) maxV *= 0.8;
  if (World.tileAtWorld(sh.x, sh.y) === W_REEF) maxV *= 0.75;
  if (G.boarding) wantSpeed = 0;
  const target = wantSpeed * maxV;
  sh.speed += (target - sh.speed) * Math.min(1, dt * (target > sh.speed ? 0.9 : 1.6));
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
  // estela y espuma de proa
  if (Math.abs(sh.speed) > 20 && rnd() < dt * 40) {
    const side = rnd() < 0.5 ? 1 : -1, w = SHIPS[S.stage].wid * 0.4;
    G.fx.push({ type: 'wake', x: sh.x - Math.cos(sh.angle) * len + Math.cos(sh.angle + 1.57) * w * side * 0.5, y: sh.y - Math.sin(sh.angle) * len + Math.sin(sh.angle + 1.57) * w * side * 0.5,
      vx: Math.cos(sh.angle + 1.57 * side) * 12, vy: Math.sin(sh.angle + 1.57 * side) * 12, life: 1.6, max: 1.6, r: 3 + S.stage });
  }
  if (sh.speed > 60 && rnd() < dt * 20) addFx('foam', sh.x + Math.cos(sh.angle) * len, sh.y + Math.sin(sh.angle) * len, 1, '#fff', 0.3);
  if (S.hp < stats().maxHp * 0.5 && rnd() < dt * (S.hp < stats().maxHp * 0.25 ? 14 : 5)) addFx('smoke', sh.x + (rnd() - 0.5) * 16, sh.y + (rnd() - 0.5) * 10, 1, S.hp < stats().maxHp * 0.25 ? '#333' : '#777', 0.2);
  if (rnd() < dt * 0.04 && sh.speed > 30) Sfx.play('creak', 0.6);

  if (G.demo) { revealAround(sh.x, sh.y, 8); return; }
  // arrecifes
  G.reefTimer -= dt;
  if (World.tileAtWorld(sh.x, sh.y) === W_REEF && Math.abs(sh.speed) > 30 && G.reefTimer <= 0) {
    G.reefTimer = 0.8;
    const ch = 0.45 * (1 - 0.12 * S.parts.timon) * (S.stage >= 1 ? 0.45 : 1);
    if (rnd() < ch) { damagePlayer(2, 1, 1); msgOnce('reef', 'Los arrecifes rasgan el casco. Mejora el timón o el barco.', 6, 'warn'); }
  }
  // zona demasiado peligrosa
  G.zoneTimer -= dt;
  const diff = ZONES[zone].req - (S.stage + 1);
  if (diff > 0 && G.zoneTimer <= 0) {
    G.zoneTimer = 1;
    damagePlayer(1.2 * diff + (zone === 3 ? 2 : 0), 0.12 * diff, 1);
    msgOnce('zonereq', 'Tu barco no aguanta ' + ZONES[zone].name + '. Necesitas: ' + SHIPS[ZONES[zone].req - 1].name + ' o mejor.', 7, 'warn');
  }
  // huecos y agua
  if (st.leak > 0) {
    G.leakTimer += dt;
    if (G.leakTimer >= st.leak) { G.leakTimer = 0; addHole(1); msgOnce('leak', 'El bote hace agua: apareció un hueco.', 10, 'hole'); }
  }
  if (hasCrew('carpintero') && S.holes > 0) {
    G.carpTimer += dt;
    if (G.carpTimer >= 18) { G.carpTimer = 0; S.holes--; Sfx.play('hammer', 0.5); floatText(sh.x, sh.y - 30, 'El carpintero tapó un hueco', '#9fe39f'); }
  }
  if (S.holes > 0) S.water += S.holes * st.waterRate * dt;
  else S.water = Math.max(0, S.water - 1.2 * dt);
  if (S.water >= 100) floodPlayer();
  // moral
  const nearPort = World.ports.some(p => Math.hypot(p.x - sh.x, p.y - sh.y) < 300);
  if (nearPort) S.morale = Math.min(100, S.morale + dt * 10);
  else S.morale = Math.max(0, S.morale - dt * (100 / 360) * (hasCrew('cocinero') ? 0.45 : 1) * (S.legends.chalice ? 0.7 : 1));
  revealAround(sh.x, sh.y, Math.max(3, st.reveal));
  // botín
  for (let i = G.loot.length - 1; i >= 0; i--) {
    const l = G.loot[i];
    if (l.pop) l.pop = Math.max(0, l.pop - dt * 2);
    if (Math.hypot(l.x - sh.x, l.y - sh.y) < 34 + S.stage * 3) { if (tryCollect(l)) G.loot.splice(i, 1); }
    else if (l.zone === -1 && G.time - l.born > 240) G.loot.splice(i, 1);
  }
  for (let i = G.barrels.length - 1; i >= 0; i--) {
    const b = G.barrels[i];
    if (Math.hypot(b.x - sh.x, b.y - sh.y) < 30) { G.barrels.splice(i, 1); explode(b.x, b.y, b.zone); }
  }
  G.lootTimer -= dt;
  if (G.lootTimer <= 0) {
    G.lootTimer = 2;
    const counts = [0, 0, 0, 0];
    for (const l of G.loot) if (l.zone >= 0) counts[l.zone]++;
    for (const b of G.barrels) counts[b.zone]++;
    for (let z = 0; z < 4; z++) if (counts[z] < lootTarget(z)) spawnLoot(z, false);
  }
  updateEnemies(dt, st, zone);
  updateBoss(dt, st);
  updateStorms(dt, zone);
  updateShots(dt);
  if (G.boarding) updateBoarding(dt);
  G.reload -= dt; G.special -= dt;
  if (G.fireHeld) fire();
  G.nearby = findNearbySea();
}

function explode(x, y, zone) {
  Sfx.play('boom'); vibrate(120);
  addFx('fire', x, y, 18, '#ff8a00', 1.4); addFx('smoke', x, y, 14, '#444', 0.8); addFx('debris', x, y, 8, '#8a3a1a');
  ring(x, y, 110, '#ffcc66'); G.shake = 14; G.flash = 0.3;
  const dmg = 40 + zone * 30;
  for (const e of G.enemies) if (Math.hypot(e.x - x, e.y - y) < 110) { e.hp -= dmg; e.hitT = 0.2; floatText(e.x, e.y - 25, '-' + dmg, '#ffb347'); }
  if (G.boss && Math.hypot(G.boss.x - x, G.boss.y - y) < 130) { G.boss.hp -= dmg; G.boss.hitT = 0.2; }
  if (Math.hypot(G.ship.x - x, G.ship.y - y) < 85) damagePlayer(12, 0.7, 1);
}

function findNearbySea() {
  const sh = G.ship;
  if (G.boarding) return null;
  for (const e of G.enemies) if (e.hp > 0 && e.hp <= e.maxHp * 0.35 && Math.hypot(e.x - sh.x, e.y - sh.y) < 95) return { type: 'board', obj: e, label: '¡Abordar!', icon: 'sword', hot: true };
  for (const p of World.ports) if (Math.hypot(p.x - sh.x, p.y - sh.y) < 9.5 * TILE) return { type: 'port', obj: p, label: 'Atracar en ' + p.name, icon: 'anchor' };
  for (const w of World.wrecks) if (!S.wrecks[w.id] && Math.hypot(w.x - sh.x, w.y - sh.y) < 60) return { type: 'wreck', obj: w, label: hasCrew('buzo') ? 'Bucear en el naufragio' : 'Naufragio (necesitas Buzo)', icon: 'diver' };
  if (Math.abs(sh.speed) < 45) {
    const spot = Land.findLandingSpot(sh.x, sh.y);
    if (spot) return { type: 'land', obj: spot, label: 'Desembarcar', icon: 'boot' };
  }
  return null;
}

function doAction() {
  if (G.paused) return;
  if (G.mode === 'land') { Land.action(); return; }
  const n = G.nearby; if (!n) return;
  Sfx.play('ui');
  if (n.type === 'port') { Land.enterTown(n.obj.id); return; }
  if (n.type === 'land') { Land.disembark(n.obj); return; }
  if (n.type === 'board') { startBoarding(n.obj); return; }
  if (n.type === 'wreck') {
    if (!hasCrew('buzo')) { UI.toast('Necesitas contratar un Buzo en una taberna para bucear aquí.', 3, 'diver'); return; }
    const w = n.obj; S.wrecks[w.id] = true;
    Sfx.play('splash'); Sfx.play('bubble');
    lootBurst(w.x, w.y, Math.min(3, w.zone + 1), 4 + w.zone);
    const g = Math.round((150 + rnd() * 200) * ZONES[w.zone].lootMult); addGold(g, w.x, w.y);
    let txt = 'Tu buzo sacó tesoros del naufragio.<br>+' + fmt(g) + ' monedas y botín flotando alrededor.';
    if (w.legend && !S.legends[w.legend]) { S.legends[w.legend] = true; txt += legendText(w.legend); if (w.legend === 'compass') revealSecrets(); }
    contractProgress('secret', 1);
    Sfx.play('treasure'); UI.dialog('Naufragio', txt, [{ label: '¡Genial!' }], 'wreck'); saveGame();
  }
}
function legendText(l) { return '<div class="legend-get">' + ic('star', 22) + ' <b>Objeto legendario: ' + LEGENDS[l].name + '</b><br><i>' + LEGENDS[l].desc + '</i></div>'; }

function patchHole() {
  if (G.mode === 'land') return;
  if (S.holes <= 0) { UI.toast('No hay huecos que tapar.', 2, 'check'); return; }
  if (S.planks <= 0) { UI.toast('No te quedan tablas. Cómpralas en puerto.', 2, 'plank'); Sfx.play('err'); return; }
  S.planks--; S.holes--; Sfx.play('hammer');
  floatText(G.ship.x, G.ship.y - 30, 'Hueco tapado', '#e8c27a');
  addFx('dust', G.ship.x, G.ship.y, 6, '#c9965a', 0.4);
}

// ===== Combate =====
function nearestTarget(range) {
  const sh = G.ship; let target = null, best = range;
  const cands = G.enemies.slice(); if (G.boss) cands.push(G.boss);
  for (const e of cands) { const d = Math.hypot(e.x - sh.x, e.y - sh.y); if (d < best && e.hp > 0) { best = d; target = e; } }
  for (const b of G.barrels) { const d = Math.hypot(b.x - sh.x, b.y - sh.y); if (d < best * 0.7) { best = d; target = b; } }
  return { target, dist: best };
}
function shoot(ox, oy, ang, speed, dmg, enemy, extra) {
  const range = extra && extra.range || 300;
  const s = { x: ox, y: oy, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, life: range / speed, max: range / speed, dmg, enemy };
  if (extra) Object.assign(s, extra);
  G.shots.push(s);
  addFx('flash', ox + Math.cos(ang) * 8, oy + Math.sin(ang) * 8, 1, '#ffd27a');
  addFx('smoke', ox + Math.cos(ang) * 12, oy + Math.sin(ang) * 12, 2, '#cfcfcf', 0.4);
}
function fire(volley) {
  if (G.paused || G.mode !== 'sea' || G.boarding) return;
  if (!volley && G.reload > 0) return;
  const st = stats(), sh = G.ship;
  if (!volley) G.reload = st.reload;
  const { target, dist } = nearestTarget(st.range);
  const n = volley ? st.cannons * 2 + 2 : st.cannons;
  for (let i = 0; i < n; i++) {
    let ang;
    if (target) {
      const tt = dist / 420;
      const tx = target.x + (target.vx || 0) * tt, ty = target.y + (target.vy || 0) * tt;
      ang = Math.atan2(ty - sh.y, tx - sh.x) + (rnd() - 0.5) * (volley ? 0.5 : 0.16);
    } else if (volley) ang = sh.angle + (i / n) * Math.PI * 2;
    else ang = sh.angle + (i % 2 ? Math.PI / 2 : -Math.PI / 2) + (rnd() - 0.5) * 0.15;
    const off = (i % st.cannons - (st.cannons - 1) / 2) * (SHIPS[S.stage].len / Math.max(2, st.cannons));
    const ox = sh.x + Math.cos(sh.angle) * off, oy = sh.y + Math.sin(sh.angle) * off;
    const crit = rnd() < st.crit;
    setTimeout(() => shoot(ox, oy, ang, 420, st.dmg * (crit ? 2 : 1), false, { crit, range: st.range }), volley ? i * 40 : i * 25);
  }
  G.shake = Math.max(G.shake, volley ? 8 : 3);
  Sfx.play('cannon'); vibrate(volley ? 90 : 25);
  if (volley) setTimeout(() => Sfx.play('cannon'), 150);
}
function specialVolley() {
  if (G.special > 0 || G.mode !== 'sea' || G.paused) { if (G.special > 0) UI.toast('La andanada se está recargando...', 1.5, 'cannon'); return; }
  G.special = 14;
  floatText(G.ship.x, G.ship.y - 40, '¡ANDANADA!', '#ffd23f', true);
  fire(true);
}

function updateShots(dt) {
  for (let i = G.shots.length - 1; i >= 0; i--) {
    const s = G.shots[i];
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    let hit = false;
    if (World.blocked(s.x, s.y)) { addFx('dust', s.x, s.y, 5, '#c9a26b'); hit = true; }
    else if (s.enemy) {
      if (G.mode === 'sea' && Math.hypot(s.x - G.ship.x, s.y - G.ship.y) < SHIPS[S.stage].len * 0.45) {
        hit = true; addFx('spark', s.x, s.y, 8, '#ffb347'); addFx('debris', s.x, s.y, 4, '#8a5a32');
        damagePlayer(s.dmg, 0.3, 1);
      }
    } else {
      for (let b = G.barrels.length - 1; b >= 0; b--) {
        const br = G.barrels[b];
        if (Math.hypot(s.x - br.x, s.y - br.y) < 16) { G.barrels.splice(b, 1); explode(br.x, br.y, br.zone); hit = true; break; }
      }
      if (!hit) {
        const cands = G.enemies.slice(); if (G.boss) cands.push(G.boss);
        for (const e of cands) {
          if (e.hp > 0 && Math.hypot(s.x - e.x, s.y - e.y) < (e.radius || 22)) {
            hit = true; addFx('spark', s.x, s.y, s.crit ? 14 : 7, s.crit ? '#fff176' : '#ffb347'); addFx('debris', s.x, s.y, 3, '#5c4330');
            e.hp -= s.dmg; e.hitT = 0.15;
            if (s.crit) { S.stats.crits++; floatText(e.x, e.y - 34, '¡CRÍTICO! -' + Math.round(s.dmg), '#fff176', true); ring(s.x, s.y, 30, '#fff176'); }
            else floatText(e.x, e.y - 25, '-' + Math.round(s.dmg), '#ffd1a1');
            Sfx.play('hit', 0.7);
            break;
          }
        }
      }
    }
    if (!hit && s.life <= 0) { addFx('splash', s.x, s.y, 6, '#d6f3ff'); ring(s.x, s.y, 14, '#e0f7ff'); hit = true; }
    if (hit) G.shots.splice(i, 1);
  }
}

// ===== Piratas rivales =====
function inSafeHarbor(x, y) { return World.ports.some(p => Math.hypot(p.x - x, p.y - y) < 380); }
function spawnEnemy(zone, x, y, raid, type) {
  const es = ENEMY_STATS[zone];
  if (!type) { const r = rnd(); type = zone === 0 ? (r < 0.7 ? 'balandra' : 'bruto') : (r < 0.4 ? 'balandra' : r < 0.75 ? 'canonera' : 'bruto'); }
  const et = ENEMY_TYPES[type];
  const hp = Math.round(es.hp * et.hp);
  const e = { type, x, y, angle: rnd() * 6.28, speed: 0, vx: 0, vy: 0, hp, maxHp: hp, zone, reload: 1 + rnd() * 2, raid: !!raid,
    radius: 20 + zone * 3, turnBias: rnd() < 0.5 ? 1 : -1, stuck: 0, ramCd: 0, heel: 0 };
  G.enemies.push(e);
  return e;
}
function enemyStage(e) { return Math.min(4, e.zone + (e.type === 'canonera' ? 1 : 0)); }
function killEnemy(e, boarded) {
  const es = ENEMY_STATS[e.zone];
  G.sinking.push({ x: e.x, y: e.y, angle: e.angle, stage: enemyStage(e), t: 0, enemy: e });
  addFx('fire', e.x, e.y, 12, '#ff8a00', 0.8); addFx('smoke', e.x, e.y, 10, '#555'); addFx('debris', e.x, e.y, 10, '#5c4330');
  Sfx.play('boom'); G.shake = Math.max(G.shake, 8);
  const g = Math.round(es.gold * (0.7 + rnd() * 0.6) * (boarded ? 1.8 : 1)); addGold(g, e.x, e.y); S.stats.enemies++;
  floatText(e.x, e.y - 20, '+' + g + ' monedas', '#ffd23f', true);
  lootBurst(e.x, e.y, e.zone, (boarded ? 3 : 1) + Math.floor(rnd() * 3));
  if (rnd() < 0.12) G.loot.push({ x: e.x, y: e.y, kind: 'piece', map: Math.min(2, Math.max(0, e.zone - 1)), qty: 1, zone: -1, bob: 0, born: G.time });
  if (e.raid && G.raid) G.raid.left--;
  contractProgress('hunt', 1);
  if (boarded) { S.stats.boarded++; contractProgress('board', 1); S.morale = Math.min(100, S.morale + 25); }
}
function updateEnemies(dt, st, zone) {
  const sh = G.ship;
  G.spawnTimer -= dt;
  if (G.spawnTimer <= 0) {
    G.spawnTimer = 4;
    const cv = cargoValue();
    const night = nightFactor();
    const cap = Math.min(6, 1 + zone + Math.floor(cv / 900));
    const wild = G.enemies.filter(e => !e.raid).length;
    const chance = 0.03 + cv / 9000 + zone * 0.05 + night * 0.04;
    if (wild < cap && rnd() < chance && !inSafeHarbor(sh.x, sh.y)) {
      for (let k = 0; k < 10; k++) {
        const a = rnd() * 6.28, r = 520 + rnd() * 200;
        const x = sh.x + Math.cos(a) * r, y = sh.y + Math.sin(a) * r;
        const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
        if (tx < 0 || ty < 0 || tx >= WW || ty >= WH) continue;
        if (!World.reach[ty * WW + tx] || World.tileAt(tx, ty) !== W_WATER || inSafeHarbor(x, y)) continue;
        spawnEnemy(World.zone[ty * WW + tx], x, y);
        if (cv > 300) msgOnce('pir', 'Piratas rivales huelen tu botín', 15, 'skull');
        break;
      }
    }
  }
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i]; const es = ENEMY_STATS[e.zone], et = ENEMY_TYPES[e.type];
    e.hitT = Math.max(0, (e.hitT || 0) - dt);
    if (e.hp <= 0) { G.enemies.splice(i, 1); killEnemy(e, false); continue; }
    if (G.boarding && G.boarding.e === e) continue;
    const dx = sh.x - e.x, dy = sh.y - e.y, d = Math.hypot(dx, dy);
    if (!e.raid && d > 1400) { G.enemies.splice(i, 1); continue; }
    const safe = (inSafeHarbor(sh.x, sh.y) || G.mode === 'land') && !e.raid;
    let desired;
    if (e.raid && G.raid && d > 600) {
      const p = World.ports[G.raid.port], a = G.time * 0.3 + i;
      desired = Math.atan2(p.y + Math.sin(a) * 300 - e.y, p.x + Math.cos(a) * 300 - e.x);
    } else if (safe) desired = Math.atan2(-dy, -dx);
    else if (et.ram) desired = Math.atan2(dy, dx);
    else if (d > 190) desired = Math.atan2(dy, dx);
    else desired = Math.atan2(dy, dx) + e.turnBias * Math.PI / 2;
    if (e.hp < e.maxHp * 0.25 && !e.raid && !et.ram) desired = Math.atan2(-dy, -dx); // huye malherido
    for (let t = 0; t < 6; t++) {
      if (!World.blocked(e.x + Math.cos(desired) * 50, e.y + Math.sin(desired) * 50)) break;
      desired += e.turnBias * 0.6;
    }
    const turn = Math.max(-2 * dt, Math.min(2 * dt, angDiff(e.angle, desired)));
    e.angle += turn; e.heel += (Math.sign(turn) * 0.2 - e.heel) * Math.min(1, dt * 3);
    const v = es.speed * et.speed * (safe ? 1.1 : 1) * (e.hp < e.maxHp * 0.25 ? 0.7 : 1);
    e.speed += (v - e.speed) * dt;
    const nx = e.x + Math.cos(e.angle) * e.speed * dt, ny = e.y + Math.sin(e.angle) * e.speed * dt;
    if (!World.blocked(nx, ny)) { e.vx = (nx - e.x) / dt; e.vy = (ny - e.y) / dt; e.x = nx; e.y = ny; e.stuck = 0; }
    else { e.angle += e.turnBias * 6 * dt; e.stuck += dt; e.vx = e.vy = 0; if (e.stuck > 3) e.turnBias *= -1; }
    if (rnd() < dt * 20 && e.speed > 30) G.fx.push({ type: 'wake', x: e.x - Math.cos(e.angle) * 20, y: e.y - Math.sin(e.angle) * 20, vx: 0, vy: 0, life: 1.2, max: 1.2, r: 3 });
    if (e.hp < e.maxHp * 0.5 && rnd() < dt * 8) addFx('smoke', e.x, e.y, 1, e.hp < e.maxHp * 0.3 ? '#333' : '#777', 0.2);
    // embestida
    e.ramCd -= dt;
    if (et.ram && d < 40 && e.ramCd <= 0 && G.mode === 'sea') { e.ramCd = 2; damagePlayer(es.dmg * 1.4, 1, 2); e.hp -= 4; sh.speed *= 0.4; floatText(sh.x, sh.y - 30, '¡Embestida!', '#ff7b7b'); }
    e.reload -= dt;
    if (!safe && d < 300 && e.reload <= 0 && !G.paused && G.mode === 'sea') {
      e.reload = es.reload * et.reload * (0.85 + rnd() * 0.3);
      const balls = et.balls + Math.min(1, Math.floor(e.zone / 2));
      for (let b = 0; b < balls; b++) {
        const tt = d / 360;
        const tx = sh.x + Math.cos(sh.angle) * sh.speed * tt, ty = sh.y + Math.sin(sh.angle) * sh.speed * tt;
        const ang = Math.atan2(ty - e.y, tx - e.x) + (rnd() - 0.5) * 0.3 + (b - (balls - 1) / 2) * 0.08;
        shoot(e.x, e.y, ang, 360, es.dmg, true, { range: 330 });
      }
      Sfx.play('cannon2', Math.max(0.3, 1 - d / 400));
    }
  }
}

// ===== Abordaje =====
function startBoarding(e) {
  G.boarding = { e, t: 0, dur: 2.2 };
  Sfx.play('whoosh'); UI.banner('¡Al abordaje!', 'Tu tripulación salta al barco enemigo', 'sword', 1.6);
}
function updateBoarding(dt) {
  const b = G.boarding; b.t += dt;
  const e = b.e;
  // los barcos se acercan
  const dx = e.x - G.ship.x, dy = e.y - G.ship.y, d = Math.hypot(dx, dy);
  if (d > 50) { e.x -= dx / d * 60 * dt; e.y -= dy / d * 60 * dt; }
  if (rnd() < dt * 9) { addFx('spark', (G.ship.x + e.x) / 2 + (rnd() - 0.5) * 30, (G.ship.y + e.y) / 2 + (rnd() - 0.5) * 30, 4, '#fff'); Sfx.play('clash', 0.6); }
  if (b.t >= b.dur) {
    G.boarding = null;
    const i = G.enemies.indexOf(e);
    if (i >= 0) { G.enemies.splice(i, 1); killEnemy(e, true); UI.banner('¡Barco capturado!', 'Te quedas con su botín y su oro', 'skull'); Sfx.play('fanfare'); }
  }
}

// ===== Jefes =====
function updateBoss(dt) {
  const sh = G.ship;
  if (!G.boss) {
    for (const b in BOSSES) {
      if (S.bosses[b]) continue;
      const l = World.lairs[b];
      if (Math.hypot(l.x - sh.x, l.y - sh.y) < 650) {
        const def = BOSSES[b];
        G.boss = { type: b, x: l.x, y: l.y, hp: def.hp, maxHp: def.hp, angle: 0, t: 0, timer: 3, state: 'idle', radius: b === 'kraken' ? 70 : (b === 'ghost' ? 40 : 34), trail: [], vx: 0, vy: 0, cd: 0, alpha: 1, rise: 0 };
        UI.banner(def.name, '¡Un monstruo emerge de las profundidades!', 'skull', 2.5); Sfx.play('roar'); G.shake = 18; vibrate(300);
        break;
      }
    }
    return;
  }
  const b = G.boss, def = BOSSES[b.type], l = World.lairs[b.type];
  const dx = sh.x - b.x, dy = sh.y - b.y, d = Math.hypot(dx, dy);
  b.t += dt; b.timer -= dt; b.cd -= dt; b.hitT = Math.max(0, (b.hitT || 0) - dt); b.rise = Math.min(1, b.rise + dt * 0.7);
  if (b.hp <= 0) {
    S.bosses[b.type] = true; S.trophies[b.type] = true;
    addGold(def.reward, b.x, b.y);
    addFx('spark', b.x, b.y, 40, '#ffd23f', 2); addFx('smoke', b.x, b.y, 20, '#444'); addFx('fire', b.x, b.y, 20, '#ff8a00', 1.5); ring(b.x, b.y, 200, '#ffd23f');
    Sfx.play('boom'); Sfx.play('fanfare'); vibrate(400);
    lootBurst(b.x, b.y, Math.min(3, def.zone + 1), 8);
    G.boss = null; G.slams = [];
    contractProgress('boss', 1);
    UI.dialog('¡Derrotaste a ' + def.name + '!', '+' + fmt(def.reward) + ' monedas<br>Trofeo: <b>' + TROPHIES[b.type].name + '</b><br>Se colgará en la pared de tu sala de tesoros.', [{ label: '¡Victoria!' }], 'trophy');
    saveGame();
    return;
  }
  if (Math.hypot(sh.x - l.x, sh.y - l.y) > 1500 || G.mode === 'land') { G.boss = null; G.slams = []; return; }
  if (b.type === 'serpent') {
    if (b.state === 'dash') {
      b.x += Math.cos(b.angle) * 360 * dt; b.y += Math.sin(b.angle) * 360 * dt;
      if (rnd() < dt * 30) addFx('splash', b.x, b.y, 2, '#dff6ff', 0.5);
      if (b.timer <= 0) { b.state = 'circle'; b.timer = 3 + rnd() * 1.5; }
    } else if (b.state === 'tell') {
      b.angle = Math.atan2(dy, dx);
      if (b.timer <= 0) { b.state = 'dash'; b.timer = 1.1; Sfx.play('whoosh'); }
    } else {
      const a = Math.atan2(b.y - sh.y, b.x - sh.x) + dt * 0.9;
      const tx = sh.x + Math.cos(a) * 230, ty = sh.y + Math.sin(a) * 230;
      b.angle += angDiff(b.angle, Math.atan2(ty - b.y, tx - b.x)) * Math.min(1, dt * 3);
      b.x += Math.cos(b.angle) * 170 * dt; b.y += Math.sin(b.angle) * 170 * dt;
      if (b.timer <= 0) { b.state = 'tell'; b.timer = 0.7; floatText(b.x, b.y - 40, '¡Va a embestir!', '#ff7b7b'); }
      if (b.cd <= -2 && d < 320) { b.cd = 0; for (let k = -1; k <= 1; k++) shoot(b.x, b.y, Math.atan2(dy, dx) + k * 0.2, 260, 8, true, { range: 360, acid: true }); }
    }
    b.vx = Math.cos(b.angle) * 170; b.vy = Math.sin(b.angle) * 170;
    b.trail.unshift({ x: b.x, y: b.y }); if (b.trail.length > 60) b.trail.pop();
    if (d < 45 && b.cd <= 0) { b.cd = 1.2; damagePlayer(14, 1, 2); G.ship.speed *= 0.3; }
  } else if (b.type === 'kraken') {
    const rate = b.hp < b.maxHp / 2 ? 1.5 : 2.3;
    if (b.timer <= 0) {
      b.timer = rate;
      const n = b.hp < b.maxHp / 2 ? 2 : 1;
      for (let k = 0; k < n; k++) G.slams.push({ x: sh.x + Math.cos(sh.angle) * sh.speed * 0.9 + (rnd() - 0.5) * 80 * k, y: sh.y + Math.sin(sh.angle) * sh.speed * 0.9 + (rnd() - 0.5) * 80 * k, t: 1.3, r: 62 });
    }
    if (d < 130 && b.cd <= 0) { b.cd = 1; damagePlayer(8, 0.5, 1); msgOnce('grab', 'Los tentáculos te agarran. ¡Aléjate!', 3, 'warn'); }
  } else if (b.type === 'ghost') {
    b.alpha = Math.min(1, b.alpha + dt);
    if (b.timer <= 0) {
      b.timer = 7 + rnd() * 3;
      const a = rnd() * 6.28, nx = sh.x + Math.cos(a) * 260, ny = sh.y + Math.sin(a) * 260;
      if (!World.blocked(nx, ny)) { addFx('smoke', b.x, b.y, 14, '#9fffd8'); b.x = nx; b.y = ny; b.alpha = 0.1; Sfx.play('whoosh'); }
    }
    const desired = d > 200 ? Math.atan2(dy, dx) : Math.atan2(dy, dx) + Math.PI / 2;
    b.angle += Math.max(-2 * dt, Math.min(2 * dt, angDiff(b.angle, desired)));
    b.vx = Math.cos(b.angle) * 150; b.vy = Math.sin(b.angle) * 150;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (rnd() < dt * 10) addFx('smoke', b.x, b.y, 1, '#9fffd8', 0.2);
    if (b.cd <= 0 && d < 340) {
      b.cd = b.hp < b.maxHp / 2 ? 1.5 : 2.1;
      for (let k = -2; k <= 2; k++) shoot(b.x, b.y, Math.atan2(dy, dx) + k * 0.13, 340, 16, true, { ghost: true, range: 380 });
      Sfx.play('cannon2');
    }
  }
  for (let i = G.slams.length - 1; i >= 0; i--) {
    const s = G.slams[i]; s.t -= dt;
    if (s.t <= 0) {
      G.slams.splice(i, 1); addFx('splash', s.x, s.y, 18, '#d6f3ff', 1.3); ring(s.x, s.y, s.r * 1.3, '#d6f3ff'); G.shake = 9; Sfx.play('splash');
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
  Sfx.setAmbience(inStorm, false);
  if (inStorm) {
    G.stormDmg = (G.stormDmg || 0) - dt;
    if (G.stormDmg <= 0) {
      G.stormDmg = 1;
      let ch = S.stage >= 2 ? 0.1 : 0.28; if (S.legends.trident) ch *= 0.5;
      ch *= 1 - 0.05 * S.parts.casco;
      if (rnd() < ch) { addHole(1); msgOnce('storm', 'La tormenta abre huecos en el casco', 6, 'bolt'); }
      G.ship.angle += (rnd() - 0.5) * 0.15;
    }
    if (rnd() < dt * 0.25) { G.flash = 1; setTimeout(() => Sfx.play('thunder'), 200 + rnd() * 600); }
  }
}

// ===== Ataques a tabernas =====
function updateRaid(dt) {
  if (G.demo) return;
  const owned = Object.keys(S.taverns);
  if (!owned.length) return;
  if (!G.raid) {
    G.raidTimer -= dt;
    if (G.raidTimer <= 0) {
      G.raidTimer = 300 + rnd() * 300;
      const id = owned[Math.floor(rnd() * owned.length)];
      G.raid = { port: +id, time: 240, spawned: false, left: 3 };
      UI.banner('¡Atacan tu taberna!', 'Piratas en ' + PORTS[id].name + '. Tienes 4 minutos.', 'fire');
      Sfx.play('bell');
    }
    return;
  }
  const r = G.raid, p = World.ports[r.port];
  r.time -= dt;
  if (!r.spawned && Math.hypot(p.x - G.ship.x, p.y - G.ship.y) < 1300) {
    r.spawned = true;
    for (let k = 0; k < 3; k++) for (let t = 0; t < 30; t++) {
      const a = rnd() * 6.28, x = p.x + Math.cos(a) * 380, y = p.y + Math.sin(a) * 380;
      if (!World.blocked(x, y)) { spawnEnemy(p.zone, x, y, true); break; }
    }
    r.left = G.enemies.filter(e => e.raid).length;
  }
  if (r.spawned && r.left <= 0) {
    const g = 300 * (p.zone + 1); addGold(g);
    UI.dialog('¡Taberna defendida!', 'Echaste a los piratas de tu taberna en ' + p.name + '.<br>Los clientes agradecidos te dan +' + fmt(g) + ' monedas.', [{ label: '¡Salud!' }], 'mug');
    G.raid = null; return;
  }
  if (r.time <= 0) {
    const t = S.taverns[r.port];
    if (t) { t.stored = 0; t.closedUntil = Date.now() + 5 * 60000; }
    G.enemies = G.enemies.filter(e => !e.raid);
    UI.toast('Los piratas saquearon tu taberna en ' + p.name + '. Perdiste su caja.', 5, 'fire');
    G.raid = null;
  }
}

// ===== Contratos =====
const CONTRACT_TYPES = {
  hunt:   (z) => { const n = 2 + Math.floor(rnd() * 3) + z; return { type: 'hunt', need: n, title: 'Hundir ' + n + ' barcos piratas', reward: n * ENEMY_STATS[z].gold * 1.2 }; },
  board:  (z) => { const n = 1 + Math.floor(rnd() * 2); return { type: 'board', need: n, title: 'Abordar ' + n + ' barco' + (n > 1 ? 's' : '') + ' enemigo' + (n > 1 ? 's' : ''), reward: n * ENEMY_STATS[z].gold * 2.5 }; },
  dig:    (z) => { const n = 2 + Math.floor(rnd() * 3); return { type: 'dig', need: n, title: 'Desenterrar ' + n + ' tesoros en islas', reward: n * 90 * ZONES[z].lootMult }; },
  sell:   (z) => { const n = Math.round((400 + rnd() * 600) * ZONES[z].lootMult / 50) * 50; return { type: 'sell', need: n, title: 'Vender ' + fmt(n) + ' monedas en botín', reward: n * 0.3 }; },
  secret: (z) => ({ type: 'secret', need: 1, title: 'Explorar una cueva o un naufragio', reward: 250 * ZONES[z].lootMult }),
};
function contractOffers(portId) {
  if (!G.offers[portId] || G.offers[portId].day !== Math.floor(S.stats.time / 300)) {
    const z = World.ports[portId].zone;
    const keys = Object.keys(CONTRACT_TYPES).sort(() => rnd() - 0.5).slice(0, 3);
    G.offers[portId] = { day: Math.floor(S.stats.time / 300), list: keys.map(k => { const c = CONTRACT_TYPES[k](z); c.reward = Math.round(c.reward / 10) * 10; c.have = 0; return c; }) };
  }
  return G.offers[portId].list;
}
function contractProgress(type, n) {
  const c = S.contract; if (!c || c.type !== type) return;
  c.have = Math.min(c.need, c.have + n);
  if (c.have >= c.need) {
    S.contract = null; addGold(c.reward);
    UI.banner('Contrato cumplido', c.title + ' · +' + fmt(c.reward) + ' monedas', 'scroll');
    Sfx.play('level');
  }
}

// ===== Objetivo =====
function objective() {
  const legends = Object.keys(S.legends).length, trophies = Object.keys(S.trophies).length;
  if (!S.stats.loot) return 'Toca el mar para navegar y recoge el botín flotante';
  if (S.stage < 1) {
    if (S.stats.earned < 60 && cargoUsed() > 0) return 'Vuelve a ' + PORTS[0].name + ' y vende en el Mercado';
    if (Object.values(S.parts).every(v => v === 0)) return 'Compra una mejora en la Tienda de partes';
    if (!S.stats.dug) return 'Desembarca en una isla y busca tesoros enterrados';
    return 'Junta ' + SHIPS[1].price + ' monedas y compra una Balandra en el Astillero';
  }
  if (!S.crew.length) return 'Contrata tripulación en la Taberna';
  if (!S.xDug[0] && S.stage < 3) return S.pieces[0] < 3 ? 'Junta los 3 pedazos del mapa del tesoro (' + S.pieces[0] + '/3)' : 'Sigue la X de tu mapa y desentierra el tesoro';
  if (!Object.keys(S.taverns).length && S.stage < 3) return 'Abre tu propia taberna para ganar oro pasivo';
  if (S.stage < 2) return 'Compra un Bergantín para cruzar las Aguas de Tormenta';
  if (!S.bosses.serpent) return 'Derrota a la Serpiente Marina en los Arrecifes de Coral';
  if (S.stage < 3) return 'Compra una Fragata para entrar al Triángulo Maldito';
  if (!S.bosses.kraken) return 'Derrota al Kraken en las Aguas de Tormenta';
  if (!S.bosses.ghost) return 'Derrota al Barco Fantasma del Triángulo Maldito';
  if (!S.house && S.stage < 4) return 'Compra el Galeón o tu casa para tener tu sala de tesoros';
  return 'Llena tu sala: leyendas ' + legends + '/6 · trofeos ' + trophies + '/3 · decoración ' + Object.keys(S.decor).length + '/' + DECOR.length;
}
// Punto del mundo al que apunta la flecha guía
function objectiveTarget() {
  const px = G.mode === 'land' && G.hero ? G.hero.x : G.ship.x, py = G.mode === 'land' && G.hero ? G.hero.y : G.ship.y;
  const near = (list) => { let b = null, bd = 1e9; for (const o of list) { const d = Math.hypot(o.x - px, o.y - py); if (d < bd) { bd = d; b = o; } } return b; };
  const home = World.ports[S.lastPort];
  if (!S.stats.loot) return near(G.loot.filter(l => l.zone === 0 && l.kind !== 'bottle'));
  if (S.stage < 1 && S.stats.earned < 60 && cargoUsed() > 0) return World.ports[0];
  if (cargoUsed() >= stats().hold) return near(World.ports.filter(p => isRevealedWorld(p.x, p.y)));
  if (S.stage < 1 && !S.stats.dug && S.stats.earned >= 60) return near(World.digs.filter(d => !S.dug[d.id] && d.zone === 0 && Math.hypot(d.x - px, d.y - py) < 2500)) || home;
  for (let m = 0; m < 3; m++) if (S.pieces[m] >= 3 && !S.xDug[m] && S.stage + 1 >= ZONES[World.xmarks[m].zone].req) return World.xmarks[m];
  if (G.raid) return World.ports[G.raid.port];
  if (S.stage >= 1 && !S.bosses.serpent && isRevealedWorld(World.lairs.serpent.x, World.lairs.serpent.y)) return World.lairs.serpent;
  if (S.stage >= 2 && S.bosses.serpent && !S.bosses.kraken && isRevealedWorld(World.lairs.kraken.x, World.lairs.kraken.y)) return World.lairs.kraken;
  if (S.stage >= 3 && S.bosses.kraken && !S.bosses.ghost && isRevealedWorld(World.lairs.ghost.x, World.lairs.ghost.y)) return World.lairs.ghost;
  return null;
}
