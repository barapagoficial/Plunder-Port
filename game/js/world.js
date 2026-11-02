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
  tiles: null, zone: null, reach: null, ports: [], wrecks: [], caves: [], xmarks: [], lairs: {},
  startX: 0, startY: 0,
  idx(x, y) { return y * WW + x; },
  tileAt(x, y) { if (x < 0 || y < 0 || x >= WW || y >= WH) return W_LAND; return this.tiles[y * WW + x]; },
  tileAtWorld(px, py) { return this.tileAt(Math.floor(px / TILE), Math.floor(py / TILE)); },
  zoneAtWorld(px, py) {
    const x = Math.min(WW - 1, Math.max(0, Math.floor(px / TILE))), y = Math.min(WH - 1, Math.max(0, Math.floor(py / TILE)));
    return this.zone[y * WW + x];
  },
  isWater(x, y) { const t = this.tileAt(x, y); return t === W_WATER || t === W_REEF; },
  blocked(px, py) { const t = this.tileAtWorld(px, py); return t === W_LAND || t === W_ROCK; },

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
    // Islas de los puertos
    this.ports = PORTS.map((p, id) => {
      for (let y = p.ty - 6; y <= p.ty + 6; y++) for (let x = p.tx - 6; x <= p.tx + 6; x++) {
        if (x < 2 || y < 2 || x >= WW - 2 || y >= WH - 2) continue;
        const d = Math.hypot(x - p.tx, y - p.ty);
        if (d <= 1.6) this.tiles[y * WW + x] = W_LAND;
        else if (d <= 6) this.tiles[y * WW + x] = W_WATER;
      }
      return { id, name: p.name, tx: p.tx, ty: p.ty, x: (p.tx + 0.5) * TILE, y: (p.ty + 0.5) * TILE, zone: this.zone[p.ty * WW + p.tx], def: p };
    });
    // Islotes secretos para las X
    const xSpots = [{ zone: 1 }, { zone: 2 }, { zone: 3 }];
    this.flood();
    this.xmarks = xSpots.map((s, k) => {
      const c = this.pickTile(rnd, t => this.zone[t] === s.zone && this.tiles[t] === W_WATER, 900, 12);
      const cx = c % WW, cy = (c / WW) | 0;
      for (let y = cy - 5; y <= cy + 5; y++) for (let x = cx - 5; x <= cx + 5; x++) {
        if (x < 2 || y < 2 || x >= WW - 2 || y >= WH - 2) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d <= 1.3) this.tiles[y * WW + x] = W_LAND; else if (d <= 4) this.tiles[y * WW + x] = W_WATER;
      }
      // la X se marca en el agua junto al islote (playa)
      return { map: k, tx: cx + 2, ty: cy, x: (cx + 2.5) * TILE, y: (cy + 0.5) * TILE, zone: s.zone };
    });
    this.flood();
    this.ensureReach(this.ports.map(p => [p.tx + 3, p.ty]));
    this.ensureReach(this.xmarks.map(p => [p.tx, p.ty]));

    // Naufragios (2 por zona)
    const wreckLegend = { 1: 'chalice', 2: null, 3: 'compass' };
    this.wrecks = [];
    for (let z = 0; z < 4; z++) for (let k = 0; k < 2; k++) {
      const t = this.pickTile(rnd, t => this.zone[t] === z && this.reach[t] && this.tiles[t] === W_WATER, 900, 14);
      this.wrecks.push({ id: this.wrecks.length, zone: z, tx: t % WW, ty: (t / WW) | 0, x: (t % WW + 0.5) * TILE, y: (((t / WW) | 0) + 0.5) * TILE,
        legend: k === 0 ? wreckLegend[z] || null : null });
    }
    // Cuevas en la costa (2 por zona)
    this.caves = [];
    for (let z = 0; z < 4; z++) for (let k = 0; k < 2; k++) {
      const t = this.pickTile(rnd, t => {
        if (this.zone[t] !== z || this.tiles[t] !== W_LAND) return false;
        const x = t % WW, y = (t / WW) | 0;
        return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.reach[(y + dy) * WW + x + dx] && this.tiles[(y + dy) * WW + x + dx] === W_WATER);
      }, 900, 14);
      const x = t % WW, y = (t / WW) | 0;
      // punto de interacción: agua adyacente
      let wx = x, wy = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.reach[(y + dy) * WW + x + dx]) { wx = x + dx; wy = y + dy; break; }
      this.caves.push({ id: this.caves.length, zone: z, tx: x, ty: y, x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, ix: (wx + 0.5) * TILE, iy: (wy + 0.5) * TILE,
        legend: (z === 2 && k === 0) ? 'pearl' : null });
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
    // lista de agua alcanzable por zona (para generar botín)
    this.waterByZone = [[], [], [], []];
    for (let i = 0; i < N; i++) if (this.reach[i] && this.tiles[i] === W_WATER) this.waterByZone[this.zone[i]].push(i);
  },

  // escoge un tile aleatorio que cumpla la condición y esté lejos de los puertos
  pickTile(rnd, cond, tries, minPortDist) {
    let best = -1;
    for (let k = 0; k < tries * 10; k++) {
      const x = 3 + Math.floor(rnd() * (WW - 6)), y = 3 + Math.floor(rnd() * (WH - 6));
      const t = y * WW + x;
      if (!cond(t)) continue;
      best = t;
      if (this.ports.every(p => Math.hypot(p.tx - x, p.ty - y) > minPortDist) &&
          (this.wrecks || []).every(w => Math.hypot(w.tx - x, w.ty - y) > 8) &&
          (this.caves || []).every(w => Math.hypot(w.tx - x, w.ty - y) > 8)) return t;
    }
    if (best < 0) best = (this.startY) * WW + this.startX + 3;
    return best;
  },

  flood() {
    const N = WW * WH;
    this.reach = new Uint8Array(N);
    const st = this.startY * WW + this.startX + 3;
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

  // abre canales hacia el puerto inicial si algún punto quedó encerrado
  ensureReach(points) {
    for (const [px, py] of points) {
      if (this.reach[py * WW + px]) continue;
      let x = px, y = py;
      const tx = this.startX + 3, ty = this.startY;
      let guard = 0;
      while (!this.reach[y * WW + x] && guard++ < 400) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 2 || yy < 2 || xx >= WW - 2 || yy >= WH - 2) continue;
          const tt = this.tiles[yy * WW + xx];
          if (tt === W_LAND || tt === W_ROCK) this.tiles[yy * WW + xx] = W_WATER;
        }
        const ddx = tx - x, ddy = ty - y;
        if (Math.abs(ddx) > Math.abs(ddy)) x += Math.sign(ddx); else y += Math.sign(ddy);
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
