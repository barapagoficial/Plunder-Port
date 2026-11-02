'use strict';
// ===== Exploración a pie: islas y pueblos =====
const ISLAND_A = ['Isla', 'Cayo', 'Islote', 'Atolón', 'Isla'];
const ISLAND_B = ['de las Gaviotas', 'del Cangrejo', 'Perdida', 'del Ahorcado', 'de los Cocos', 'Sin Nombre', 'de la Calavera', 'del Loro', 'Brumosa',
  'Espinosa', 'del Tuerto', 'de la Sirena', 'del Ron', 'Tortuga', 'del Naufragio', 'Dorada', 'de los Huesos', 'del Viento', 'Escondida', 'del Pelícano'];
function islandName(id) { return ISLAND_A[Math.floor(hash2(id, 1, 5) * ISLAND_A.length)] + ' ' + ISLAND_B[Math.floor(hash2(id, 2, 5) * ISLAND_B.length)]; }

const Land = {
  island: 0, town: null, crabs: [], villagers: [], blockTiles: null, digging: null,

  init() {
    // tiles bloqueados por edificios
    this.blockTiles = new Uint8Array(WW * WH);
    for (const b of World.buildings) {
      for (let y = Math.floor((b.y - b.h / 2) / TILE); y <= Math.floor((b.y + b.h / 2) / TILE); y++)
        for (let x = Math.floor((b.x - b.w / 2) / TILE); x <= Math.floor((b.x + b.w / 2) / TILE); x++) {
          const cx = (x + 0.5) * TILE, cy = (y + 0.5) * TILE;
          if (Math.abs(cx - b.x) < b.w / 2 + 4 && Math.abs(cy - b.y) < b.h / 2 + 4) this.blockTiles[y * WW + x] = 1;
        }
    }
  },
  dockRect(p) { return { x0: p.x + 4.6 * TILE, x1: p.x + 8.2 * TILE, y0: p.y + 0.55 * TILE, y1: p.y + 1.3 * TILE }; },
  onDock(px, py) {
    if (this.town === null) return false;
    const r = this.dockRect(World.ports[this.town]);
    return px >= r.x0 && px <= r.x1 && py >= r.y0 && py <= r.y1;
  },
  passableTile: (x, y) => {
    if (World.tileAt(x, y) !== W_LAND) {
      if (Land.town !== null) { const cx = (x + 0.5) * TILE, cy = (y + 0.5) * TILE; return Land.onDock(cx, cy); }
      return false;
    }
    return !Land.blockTiles[y * WW + x];
  },
  walkable(px, py) {
    if (this.onDock(px, py)) return true;
    if (World.tileAtWorld(px, py) !== W_LAND) return false;
    if (World.islandAt(px, py) !== this.island) return false;
    if (this.town !== null) for (const b of World.buildings) if (b.port === this.town && Math.abs(px - b.x) < b.w / 2 && Math.abs(py - b.y) < b.h / 2) return false;
    return true;
  },

  findLandingSpot(sx, sy) {
    let best = null, bd = 1e9;
    const tx = Math.floor(sx / TILE), ty = Math.floor(sy / TILE);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = tx + dx, y = ty + dy;
      if (World.tileAt(x, y) !== W_LAND || x < 2 || y < 2 || x >= WW - 2 || y >= WH - 2) continue;
      const id = World.island[y * WW + x];
      if (World.portAtIsland(id)) continue;
      const px = (x + 0.5) * TILE, py = (y + 0.5) * TILE, d = Math.hypot(px - sx, py - sy);
      if (d < 64 && d < bd) { bd = d; best = { x: px, y: py, island: id }; }
    }
    return best;
  },

  newHero(x, y) {
    const keep = G.hero ? G.hero.hp : 100;
    G.hero = { x, y, dir: 0, walkT: 0, hp: Math.max(40, keep), maxHp: 100, swing: 0, swingCd: 0, path: null, inv: 0, moving: false, stepT: 0 };
  },

  disembark(spot) {
    G.mode = 'land'; this.town = null; this.island = spot.island;
    G.ship.speed = 0; G.path = null; G.destMark = null;
    this.newHero(spot.x, spot.y);
    G.hero.dir = Math.atan2(spot.y - G.ship.y, spot.x - G.ship.x);
    this.crabs = []; this.villagers = [];
    const tiles = World.islandTiles[spot.island] || [];
    const z = World.zone[Math.floor(spot.y / TILE) * WW + Math.floor(spot.x / TILE)];
    const n = tiles.length < 10 ? 0 : Math.min(5, 1 + z + Math.floor(rnd() * 2) + Math.floor(tiles.length / 150));
    for (let k = 0; k < n; k++) {
      const t = tiles[Math.floor(rnd() * tiles.length)];
      const x = (t % WW + 0.5) * TILE, y = (((t / WW) | 0) + 0.5) * TILE;
      if (Math.hypot(x - spot.x, y - spot.y) < 140) continue;
      const skel = z >= 2 && rnd() < 0.5;
      const hp = skel ? 40 + z * 22 : 20 + z * 15;
      this.crabs.push({ x, y, hp, maxHp: hp, kind: skel ? 'skeleton' : 'crab', zone: z, cd: 0, hitT: 0, angle: rnd() * 6, wander: 0, vx: 0, vy: 0, anim: rnd() * 6 });
    }
    revealAround(spot.x, spot.y, 7);
    Sfx.play('splash', 0.5); Sfx.setAmbience(false, true);
    UI.zoneBanner(islandName(spot.island), n ? 'Cuidado con los ' + (z >= 2 ? 'esqueletos y cangrejos' : 'cangrejos') : 'Parece tranquila');
    UI.setMode();
  },

  enterTown(portId) {
    const p = World.ports[portId];
    G.mode = 'land'; this.town = portId; this.island = p.island;
    placeAtPort(portId);
    S.lastPort = portId; S.morale = 100;
    this.newHero(p.x + 7.6 * TILE, p.y + 0.92 * TILE);
    G.hero.hp = G.hero.maxHp; G.hero.dir = Math.PI;
    this.crabs = [];
    this.villagers = [];
    const cols = ['#c0392b', '#2e86c1', '#8e44ad', '#27ae60', '#d35400', '#7f8c8d'];
    for (let k = 0; k < 6; k++) {
      const v = { x: p.x + (rnd() - 0.5) * 120, y: p.y + (rnd() - 0.5) * 80, tx: 0, ty: 0, wait: rnd() * 3, color: cols[k], hat: rnd() < 0.5, band: ['#c0392b', '#2e86c1', '#f5c542', '#27ae60'][k % 4], skin: ['#d9a679', '#a8714a', '#f0c8a0', '#7a4a2a'][Math.floor(rnd() * 4)], line: VILLAGER_LINES[Math.floor(rnd() * VILLAGER_LINES.length)], anim: 0, dir: 0 };
      if (!this.walkable(v.x, v.y)) { v.x = p.x; v.y = p.y + 10; }
      v.tx = v.x; v.ty = v.y;
      this.villagers.push(v);
    }
    revealAround(p.x + 2 * TILE, p.y, 9);
    tavernTick(); saveGame();
    Sfx.play('bell'); Sfx.setAmbience(false, true);
    UI.zoneBanner(p.name, 'Camina hasta una puerta para entrar');
    UI.setMode();
    if (!S.tutorial2) { S.tutorial2 = true; setTimeout(() => UI.toast('Toca el suelo para caminar. Acércate a las puertas para entrar a las tiendas.', 5, 'boot'), 1500); }
  },

  embark() {
    G.mode = 'sea'; this.crabs = []; this.villagers = [];
    if (this.town !== null) { placeAtPort(this.town); }
    this.town = null; G.hero.path = null;
    Sfx.play('creak'); Sfx.setAmbience(false, false);
    UI.setMode(); saveGame();
  },

  setDestination(wx, wy) {
    const h = G.hero; if (!h) return;
    // tocar un enemigo cercano = atacar
    for (const c of this.crabs) if (Math.hypot(c.x - wx, c.y - wy) < 26 && Math.hypot(c.x - h.x, c.y - h.y) < 60) { this.attack(); return; }
    const p = findPath(h.x, h.y, wx, wy, true);
    h.path = p && p.length ? p : null;
    G.destMark = h.path ? { x: h.path[h.path.length - 1].x, y: h.path[h.path.length - 1].y, t: 0 } : null;
  },

  attack() {
    const h = G.hero; if (!h || h.swingCd > 0 || this.digging) return;
    h.swingCd = 0.42; h.swing = 0.25;
    let best = null, bd = 70;
    for (const c of this.crabs) { const d = Math.hypot(c.x - h.x, c.y - h.y); if (d < bd) { bd = d; best = c; } }
    if (best) h.dir = Math.atan2(best.y - h.y, best.x - h.x);
    Sfx.play('sword');
    const dmg = 14 * (1 + 0.15 * S.stage) * (rnd() < 0.15 ? 2 : 1);
    for (const c of this.crabs) {
      const d = Math.hypot(c.x - h.x, c.y - h.y);
      if (d > 46) continue;
      if (Math.abs(angDiff(h.dir, Math.atan2(c.y - h.y, c.x - h.x))) > 1.1) continue;
      c.hp -= dmg; c.hitT = 0.2;
      c.x += Math.cos(h.dir) * 14; c.y += Math.sin(h.dir) * 14;
      if (!this.walkable(c.x, c.y)) { c.x -= Math.cos(h.dir) * 14; c.y -= Math.sin(h.dir) * 14; }
      addFx('spark', c.x, c.y, 6, '#fff');
      floatText(c.x, c.y - 18, '-' + Math.round(dmg), dmg > 20 ? '#fff176' : '#ffd1a1', dmg > 20);
      Sfx.play('clash', 0.6); G.shake = Math.max(G.shake, 3);
    }
  },

  update(dt) {
    const h = G.hero; if (!h) return;
    h.swing = Math.max(0, h.swing - dt); h.swingCd -= dt; h.inv = Math.max(0, h.inv - dt);
    // digging animation
    if (this.digging) {
      this.digging.t += dt;
      if (rnd() < dt * 8) addFx('dust', h.x + Math.cos(h.dir) * 12, h.y + Math.sin(h.dir) * 12, 2, '#c9a26b', 0.5);
      if (Math.floor(this.digging.t * 3) !== Math.floor((this.digging.t - dt) * 3)) Sfx.play('dig');
      if (this.digging.t > 1.3) { const d = this.digging; this.digging = null; d.done(); }
      this.common(dt); return;
    }
    // movimiento
    const k = G.keys; let mx = 0, my = 0;
    if (k.ArrowLeft || k.a || k.A) mx--; if (k.ArrowRight || k.d || k.D) mx++;
    if (k.ArrowUp || k.w || k.W) my--; if (k.ArrowDown || k.s || k.S) my++;
    const speed = 100;
    let vx = 0, vy = 0;
    if (mx || my) { h.path = null; G.destMark = null; const l = Math.hypot(mx, my); vx = mx / l * speed; vy = my / l * speed; }
    else if (h.path) {
      const wp = h.path[0], dx = wp.x - h.x, dy = wp.y - h.y, d = Math.hypot(dx, dy);
      if (d < 6) { h.path.shift(); if (!h.path.length) { h.path = null; G.destMark = null; } }
      else { vx = dx / d * speed; vy = dy / d * speed; }
    }
    h.moving = !!(vx || vy);
    if (h.moving) {
      if (!h.swing) h.dir = Math.atan2(vy, vx);
      const nx = h.x + vx * dt, ny = h.y + vy * dt;
      if (this.walkable(nx, ny)) { h.x = nx; h.y = ny; }
      else if (this.walkable(nx, h.y)) h.x = nx;
      else if (this.walkable(h.x, ny)) h.y = ny;
      else { h.path = null; G.destMark = null; }
      h.walkT += dt * 10; h.stepT -= dt;
      if (h.stepT <= 0) { h.stepT = 0.3; Sfx.play('step'); }
    }
    // enemigos
    for (let i = this.crabs.length - 1; i >= 0; i--) {
      const c = this.crabs[i];
      c.hitT = Math.max(0, c.hitT - dt); c.cd -= dt; c.anim += dt * 8;
      if (c.hp <= 0) {
        this.crabs.splice(i, 1);
        addFx('debris', c.x, c.y, 6, c.kind === 'crab' ? '#e2552b' : '#efe8d8'); addFx('dust', c.x, c.y, 6, '#c9a26b');
        const g = Math.round((8 + rnd() * 12) * (1 + c.zone) * (c.kind === 'skeleton' ? 2 : 1));
        addGold(g, c.x, c.y); floatText(c.x, c.y - 20, '+' + g + ' monedas', '#ffd23f');
        Sfx.play(c.kind === 'crab' ? 'crab' : 'crack');
        continue;
      }
      const dx = h.x - c.x, dy = h.y - c.y, d = Math.hypot(dx, dy);
      let tvx = 0, tvy = 0;
      const sp = c.kind === 'crab' ? 70 : 60;
      if (d < 170) { tvx = dx / d * sp; tvy = dy / d * sp; if (c.kind === 'crab') { tvx += -dy / d * 25 * Math.sin(c.anim * 0.3); tvy += dx / d * 25 * Math.sin(c.anim * 0.3); } }
      else { c.wander -= dt; if (c.wander <= 0) { c.wander = 1 + rnd() * 2; c.angle = rnd() * 6.28; } tvx = Math.cos(c.angle) * 25; tvy = Math.sin(c.angle) * 25; }
      if (d < 20) { tvx = 0; tvy = 0; }
      const nx = c.x + tvx * dt, ny = c.y + tvy * dt;
      if (this.walkable(nx, ny)) { c.x = nx; c.y = ny; } else c.angle += 2;
      c.moving = tvx || tvy;
      if (d < 24 && c.cd <= 0) {
        c.cd = 1.1;
        if (h.inv <= 0) {
          const dmg = (c.kind === 'crab' ? 6 : 10) + c.zone * 4;
          h.hp -= dmg; h.inv = 0.4; G.hitFlash = 0.2; G.shake = 6;
          floatText(h.x, h.y - 24, '-' + dmg, '#ff7b7b'); Sfx.play('hurt'); vibrate(60);
          if (c.kind === 'crab') Sfx.play('crab');
          if (h.hp <= 0) { this.faint(); return; }
        }
      }
    }
    // aldeanos
    for (const v of this.villagers) {
      v.wait -= dt;
      const dx = v.tx - v.x, dy = v.ty - v.y, d = Math.hypot(dx, dy);
      if (d > 3) { const nx = v.x + dx / d * 35 * dt, ny = v.y + dy / d * 35 * dt; if (this.walkable(nx, ny)) { v.x = nx; v.y = ny; v.anim += dt * 8; v.dir = Math.atan2(dy, dx); } else { v.tx = v.x; v.ty = v.y; } }
      else if (v.wait <= 0) {
        v.wait = 2 + rnd() * 4;
        const p = World.ports[this.town];
        const a = rnd() * 6.28, r = rnd() * 110;
        if (this.walkable(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r)) { v.tx = p.x + Math.cos(a) * r; v.ty = p.y + Math.sin(a) * r; }
      }
    }
    // regeneración
    if (!this.crabs.some(c => Math.hypot(c.x - h.x, c.y - h.y) < 200)) h.hp = Math.min(h.maxHp, h.hp + dt * (hasCrew('cocinero') ? 6 : 3));
    if (G.fireHeld) this.attack();
    this.common(dt);
  },

  common(dt) {
    const h = G.hero;
    revealAround(h.x, h.y, 5 + (hasCrew('vigia') ? 2 : 0));
    G.curZone = World.zoneAtWorld(h.x, h.y);
    G.nearby = this.findNearby();
  },

  findNearby() {
    const h = G.hero; if (this.digging) return null;
    if (Math.hypot(G.ship.x - h.x, G.ship.y - h.y) < 70) return { type: 'embark', label: this.town !== null ? 'Zarpar' : 'Volver al barco', icon: 'ship' };
    if (this.town !== null) {
      for (const b of World.buildings) if (b.port === this.town && Math.hypot(b.doorX - h.x, b.doorY - h.y) < 26) return { type: 'door', obj: b, label: 'Entrar: ' + b.def.name, icon: b.def.icon };
      for (const v of this.villagers) if (Math.hypot(v.x - h.x, v.y - h.y) < 26) return { type: 'talk', obj: v, label: 'Hablar', icon: 'people' };
      return null;
    }
    for (const c of World.caves) if (!S.caves[c.id] && World.island[c.ty * WW + c.tx] === this.island && Math.hypot(c.x - h.x, c.y - h.y) < 36) return { type: 'cave', obj: c, label: 'Entrar a la cueva', icon: 'cave' };
    for (const x of World.xmarks) if (S.pieces[x.map] >= 3 && !S.xDug[x.map] && Math.hypot(x.x - h.x, x.y - h.y) < 34) return { type: 'x', obj: x, label: 'Desenterrar el tesoro', icon: 'shovel', hot: true };
    for (const d of World.digs) if (!S.dug[d.id] && d.island === this.island && Math.hypot(d.x - h.x, d.y - h.y) < 30) return { type: 'dig', obj: d, label: 'Cavar aquí', icon: 'shovel', hot: true };
    return null;
  },

  action() {
    const n = G.nearby; if (!n) return;
    const h = G.hero;
    if (n.type === 'embark') { this.embark(); return; }
    if (n.type === 'door') { Sfx.play('ui'); UI.openPort(this.town, n.obj.def.tab); return; }
    if (n.type === 'talk') { n.obj.talkT = 4; Sfx.play('ui'); UI.toast('"' + n.obj.line + '"', 4, 'people'); n.obj.line = VILLAGER_LINES[Math.floor(rnd() * VILLAGER_LINES.length)]; return; }
    if (n.type === 'dig') {
      const d = n.obj; h.dir = Math.atan2(d.y - h.y, d.x - h.x);
      this.digging = { t: 0, done: () => this.digReward(d) };
      return;
    }
    if (n.type === 'x') {
      const x = n.obj;
      this.digging = { t: 0, done: () => {
        S.xDug[x.map] = true;
        const g = [1500, 5000, 12000][x.map]; addGold(g, x.x, x.y);
        const lg = MAP_LEGEND[x.map]; S.legends[lg] = true;
        const kinds = ['ruby', 'diamond', 'rare'];
        let txt = ''; for (const k of kinds) { const n2 = addCargo(k, 1 + x.map); if (n2) txt += '<br>+' + n2 + ' ' + ITEMS[k].name; }
        Sfx.play('fanfare'); G.shake = 10; addFx('sparkle', x.x, x.y, 40, '#ffd23f', 1.5); ring(x.x, x.y, 120, '#ffd23f');
        UI.dialog('¡Tesoro desenterrado!', 'Abriste el gran cofre del <b>' + MAP_NAMES[x.map] + '</b>.<br>+' + fmt(g) + ' monedas' + txt + legendText(lg) + 'Se guardará en las vitrinas de tu sala de tesoros.', [{ label: '¡Soy rico!' }], 'chest');
        saveGame();
      } };
      return;
    }
    if (n.type === 'cave') {
      const c = n.obj; S.caves[c.id] = true;
      Sfx.play('whoosh');
      const g = Math.round((80 + rnd() * 120) * ZONES[c.zone].lootMult); addGold(g, c.x, c.y);
      let txt = 'Bajaste a la oscuridad con una antorcha... ¡y encontraste un cofre escondido!<br>+' + fmt(g) + ' monedas';
      for (let i = 0; i < 2 + c.zone; i++) { const k = rollItem(Math.min(3, c.zone + 1)); if (addCargo(k, 1)) txt += '<br>+1 ' + ITEMS[k].name; }
      if (c.legend && !S.legends[c.legend]) { S.legends[c.legend] = true; txt += legendText(c.legend); }
      if (rnd() < 0.5) maybePiece(c.zone + 1, 1);
      contractProgress('secret', 1);
      Sfx.play('treasure'); UI.dialog('Cueva secreta', txt, [{ label: '¡Genial!' }], 'cave'); saveGame();
    }
  },

  digReward(d) {
    S.dug[d.id] = true; S.stats.dug++;
    contractProgress('dig', 1);
    const z = d.zone;
    let txt = [];
    const n = d.chest ? 3 + z : 1 + Math.floor(rnd() * 2);
    let overflow = 0;
    for (let i = 0; i < n; i++) { const k = d.chest && i === 0 ? (z >= 2 ? 'rare' : 'chest') : rollItem(z); if (addCargo(k, 1)) txt.push(ITEMS[k].name); else overflow += ITEMS[k].value; }
    const g = Math.round((20 + rnd() * 40) * ZONES[z].lootMult + overflow * 0.6);
    addGold(g, d.x, d.y);
    if (rnd() < 0.15) maybePiece(z, 1);
    Sfx.play(d.chest ? 'treasure' : 'coins');
    addFx('sparkle', d.x, d.y, 20, '#ffd23f', 1.2); ring(d.x, d.y, 50, '#ffd23f');
    UI.banner(d.chest ? '¡Cofre enterrado!' : 'Tesoro enterrado', (txt.length ? txt.join(', ') + ' · ' : '') + '+' + g + ' monedas' + (overflow ? ' (bodega llena: lo demás vendido)' : ''), d.chest ? 'chest' : 'shovel');
  },

  faint() {
    const lost = Math.min(500, Math.floor(S.gold * 0.1));
    S.gold -= lost;
    G.hero.hp = G.hero.maxHp;
    this.embark();
    UI.dialog('Te desmayaste', 'Tu tripulación te arrastró de vuelta al barco.<br>Perdiste ' + fmt(lost) + ' monedas en la huida.', [{ label: 'Ay...' }], 'skull');
  },
};
