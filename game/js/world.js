'use strict';
// ===== Generación del mundo =====
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
function valueNoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s) {
  return valueNoise(x, y, s) * 0.55 + valueNoise(x * 2, y * 2, s + 7) * 0.3 + valueNoise(x * 4, y * 4, s + 13) * 0.15;
}

const World = {
  tiles: null, zone: null, reach: null, island: null, ports: [], wrecks: [], caves: [], xmarks: [], lairs: {}, digs: [], buildings: [],
  startX: 0, startY: 0,
  tileAt(x, y) { if (x < 0 || y < 0 || x >= WW || y >= WH) return W_LAND; return this.tiles[y * WW + x]; },
  tileAtWorld(px, py) { return this.tileAt(Math.floor(px / TILE), Math.floor(py / TILE)); },
  zoneAtWorld(px, py) {
    const x = Math.min(WW - 1, Math.max(0, Math.floor(px / TILE))), y = Math.min(WH - 1, Math.max(0, Math.floor(py / TILE)));
    return this.zone[y * WW + x];
  },
  isWater(x, y) { const t = this.tileAt(x, y); return t === W_WATER || t === W_REEF; },
  blocked(px, py) { const t = this.tileAtWorld(px, py); return t === W_LAND || t === W_ROCK; },
  isLandWorld(px, py) { return this.tileAtWorld(px, py) === W_LAND; },
  islandAt(px, py) { const x = Math.floor(px / TILE), y = Math.floor(py / TILE); if (x < 0 || y < 0 || x >= WW || y >= WH) return 0; return this.island[y * WW + x]; },
  portAtIsland(id) { return this.ports.find(p => p.island === id) || null; },

  carveDisk(cx, cy, rLand, rWater) {
    for (let y = Math.floor(cy - rWater); y <= cy + rWater; y++) for (let x = Math.floor(cx - rWater); x <= cx + rWater; x++) {
      if (x < 2 || y < 2 || x >= WW - 2 || y >= WH - 2) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d <= rLand) this.tiles[y * WW + x] = W_LAND; else if (d <= rWater) this.tiles[y * WW + x] = W_WATER;
    }
  },

  generate() {
    const rnd = mulberry32(SEED);
    const N = WW * WH;
    this.tiles = new Uint8Array(N);
    this.zone = new Uint8Array(N);
    const sx = PORTS[0].tx, sy = PORTS[0].ty;
    this.startX = sx; this.startY = sy;
    for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
      const i = y * WW + x;
      const d = Math.hypot(x - sx, y - sy) + (fbm(x / 14, y / 14, 91) - 0.5) * 14;
      let z = 0; for (let k = 1; k < 4; k++) if (d >= ZONE_EDGES[k]) z = k;
      this.zone[i] = z;
      const n = fbm(x / 16, y / 16, SEED);
      const small = valueNoise(x / 5, y / 5, SEED + 3);
      let land = n > 0.64 || (n > 0.55 && small > 0.78);
      if (x < 2 || y < 2 || x >= WW - 2 || y >= WH - 2) land = true;
      let t = land ? W_LAND : W_WATER;
      if (!land) {
        if (z === 1 && fbm(x / 5, y / 5, 444) > 0.63) t = W_REEF;
        else if (z === 0 && fbm(x / 5, y / 5, 444) > 0.74) t = W_REEF;
        else if (z >= 2 && hash2(x, y, 55) < 0.012) t = W_ROCK;
        else if (z === 1 && hash2(x, y, 56) < 0.006) t = W_ROCK;
      }
      this.tiles[i] = t;
    }
    // Islas de los puertos (pueblos)
    for (const p of PORTS) this.carveDisk(p.tx, p.ty, 5.3, 11);
    this.ports = PORTS.map((p, id) => ({ id, name: p.name, tx: p.tx, ty: p.ty, x: (p.tx + 0.5) * TILE, y: (p.ty + 0.5) * TILE, def: p }));
    for (const p of this.ports) p.zone = this.zone[p.ty * WW + p.tx];
    this.flood();
    // Islotes del tesoro (X)
    this.xmarks = [1, 2, 3].map((zone, k) => {
      const c = this.pickTile(rnd, t => this.zone[t] === zone && this.tiles[t] === W_WATER && this.reach[t], 900, 14);
      const cx = c % WW, cy = (c / WW) | 0;
      this.carveDisk(cx, cy, 2.6, 6);
      return { map: k, tx: cx, ty: cy, x: (cx + 0.5) * TILE, y: (cy + 0.5) * TILE, zone };
    });
    this.flood();
    this.ensureReach(this.ports.map(p => [p.tx + 8, p.ty]));
    this.ensureReach(this.xmarks.map(p => [p.tx + 4, p.ty]));

    // Naufragios (2 por zona)
    const wreckLegend = { 1: 'chalice', 3: 'compass' };
    this.wrecks = [];
    for (let z = 0; z < 4; z++) for (let k = 0; k < 2; k++) {
      const t = this.pickTile(rnd, t => this.zone[t] === z && this.reach[t] && this.tiles[t] === W_WATER, 900, 16);
      this.wrecks.push({ id: this.wrecks.length, zone: z, tx: t % WW, ty: (t / WW) | 0, x: (t % WW + 0.5) * TILE, y: (((t / WW) | 0) + 0.5) * TILE,
        legend: k === 0 ? wreckLegend[z] || null : null });
    }
    // Guaridas de jefes
    for (const b of Object.keys(BOSSES)) {
      const z = BOSSES[b].zone;
      const t = this.pickTile(rnd, t => {
        if (this.zone[t] !== z || !this.reach[t] || this.tiles[t] !== W_WATER) return false;
        const x = t % WW, y = (t / WW) | 0;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (!this.isWater(x + dx, y + dy)) return false;
        return true;
      }, 4000, 20);
      this.lairs[b] = { x: (t % WW + 0.5) * TILE, y: (((t / WW) | 0) + 0.5) * TILE };
    }
    this.labelIslands();
    for (const p of this.ports) p.island = this.island[p.ty * WW + p.tx];
    for (const x of this.xmarks) x.island = this.island[x.ty * WW + x.tx];
    // Cuevas: en tierra junto a la costa, en islas visitables (2 por zona)
    this.caves = [];
    for (let z = 0; z < 4; z++) for (let k = 0; k < 2; k++) {
      const t = this.pickTile(rnd, t => {
        if (this.zone[t] !== z || this.tiles[t] !== W_LAND || !this.coastal[this.island[t]]) return false;
        if (this.ports.some(p => p.island === this.island[t])) return false;
        const x = t % WW, y = (t / WW) | 0;
        let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.tileAt(x + dx, y + dy) === W_LAND) n++;
        return n >= 7;
      }, 900, 14);
      const x = t % WW, y = (t / WW) | 0;
      this.caves.push({ id: this.caves.length, zone: z, tx: x, ty: y, x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, legend: (z === 2 && k === 0) ? 'pearl' : null });
    }
    // Tesoros enterrados en islas
    this.digs = [];
    const isl = this.islandTiles;
    for (const id in isl) {
      if (!this.coastal[id]) continue;
      if (this.ports.some(p => p.island === +id) || this.xmarks.some(x => x.island === +id)) continue;
      const tiles = isl[id]; if (tiles.length < 5 || tiles.length > 2500) continue;
      const n = Math.min(4, 1 + Math.floor(tiles.length / 40));
      for (let k = 0; k < n; k++) {
        const t = tiles[Math.floor(rnd() * tiles.length)];
        const x = t % WW, y = (t / WW) | 0;
        if (this.digs.some(d => Math.abs(d.tx - x) + Math.abs(d.ty - y) < 4)) continue;
        this.digs.push({ id: this.digs.length, tx: x, ty: y, x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, zone: this.zone[t], island: +id, chest: rnd() < 0.35 });
      }
    }
    // Edificios de los pueblos
    this.buildings = [];
    for (const p of this.ports) for (const b of BUILDINGS) {
      if (b.estateOnly && !p.def.estate) continue;
      this.buildings.push({ port: p.id, def: b, x: p.x + b.dx, y: p.y + b.dy, w: b.w, h: b.h, doorX: p.x + b.dx, doorY: p.y + b.dy + b.h / 2 + 6 });
    }
    // Agua alcanzable por zona (para generar botín)
    this.waterByZone = [[], [], [], []];
    for (let i = 0; i < N; i++) if (this.reach[i] && this.tiles[i] === W_WATER) this.waterByZone[this.zone[i]].push(i);
  },

  labelIslands() {
    const N = WW * WH;
    this.island = new Int32Array(N); this.islandTiles = {}; this.coastal = {};
    let id = 0;
    const q = new Int32Array(N);
    for (let s = 0; s < N; s++) {
      if (this.tiles[s] !== W_LAND || this.island[s]) continue;
      id++; let h = 0, t = 0; q[t++] = s; this.island[s] = id; const list = [];
      let coast = false;
      while (h < t) {
        const i = q[h++]; list.push(i);
        const x = i % WW, y = (i / WW) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= WW || ny >= WH) continue;
          const j = ny * WW + nx;
          if (this.tiles[j] === W_LAND) { if (!this.island[j]) { this.island[j] = id; q[t++] = j; } }
          else if (this.reach[j]) coast = true;
        }
      }
      this.islandTiles[id] = list; this.coastal[id] = coast;
    }
  },

  pickTile(rnd, cond, tries, minPortDist) {
    let best = -1;
    for (let k = 0; k < tries * 10; k++) {
      const x = 3 + Math.floor(rnd() * (WW - 6)), y = 3 + Math.floor(rnd() * (WH - 6));
      const t = y * WW + x;
      if (!cond(t)) continue;
      best = t;
      if (this.ports.every(p => Math.hypot(p.tx - x, p.ty - y) > minPortDist) &&
          this.wrecks.every(w => Math.hypot(w.tx - x, w.ty - y) > 8) &&
          this.caves.every(w => Math.hypot(w.tx - x, w.ty - y) > 8)) return t;
    }
    if (best < 0) best = (this.startY) * WW + this.startX + 8;
    return best;
  },

  flood() {
    const N = WW * WH;
    this.reach = new Uint8Array(N);
    const st = this.startY * WW + this.startX + 8;
    const q = new Int32Array(N); let h = 0, t = 0;
    q[t++] = st; this.reach[st] = 1;
    while (h < t) {
      const i = q[h++]; const x = i % WW, y = (i / WW) | 0;
      const nb = [i - 1, i + 1, i - WW, i + WW];
      const ok = [x > 0, x < WW - 1, y > 0, y < WH - 1];
      for (let k = 0; k < 4; k++) {
        if (!ok[k]) continue; const j = nb[k];
        if (this.reach[j]) continue;
        const tt = this.tiles[j];
        if (tt === W_WATER || tt === W_REEF) { this.reach[j] = 1; q[t++] = j; }
      }
    }
  },

  ensureReach(points) {
    for (const [px, py] of points) {
      if (this.reach[py * WW + px]) continue;
      let x = px, y = py;
      const tx = this.startX + 8, ty = this.startY;
      let guard = 0;
      // canal serpenteante (no recto) para que la costa se vea natural
      while (!this.reach[y * WW + x] && guard++ < 800) {
        const rad = hash2(x, y, 990) < 0.35 ? 2 : 1;
        for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
          if (rad === 2 && Math.abs(dx) + Math.abs(dy) > 3) continue;
          const xx = x + dx, yy = y + dy;
          if (xx < 2 || yy < 2 || xx >= WW - 2 || yy >= WH - 2) continue;
          if (this.ports.some(p => Math.hypot(p.tx - xx, p.ty - yy) < 6)) continue;
          const tt = this.tiles[yy * WW + xx];
          if (tt === W_LAND || tt === W_ROCK) this.tiles[yy * WW + xx] = W_WATER;
        }
        const ddx = tx - x, ddy = ty - y, wob = valueNoise(x / 6, y / 6, 991);
        const alongX = Math.abs(ddx) > Math.abs(ddy);
        // como mucho 1 de cada 3 pasos es lateral: siempre avanza hacia el destino
        if (wob < 0.3 && guard % 3 === 0) { if (alongX) y += (hash2(x, y, 992) < 0.5 ? -1 : 1); else x += (hash2(x, y, 993) < 0.5 ? -1 : 1); }
        else if (alongX) x += Math.sign(ddx); else y += Math.sign(ddy);
        x = Math.max(3, Math.min(WW - 4, x)); y = Math.max(3, Math.min(WH - 4, y));
      }
      this.flood();
    }
  },

  randomWaterInZone(z, rnd) {
    const arr = this.waterByZone[z];
    if (!arr.length) return null;
    const t = arr[Math.floor(rnd() * arr.length)];
    return { x: (t % WW + 0.5) * TILE, y: (((t / WW) | 0) + 0.5) * TILE };
  },
};
