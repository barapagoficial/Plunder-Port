'use strict';
// ===== Terreno: costas orgánicas, relieve, agua profunda y vegetación =====
// El mundo es una cuadrícula de casillas, pero se dibuja a partir de un campo de
// distancias suavizado (+ ruido), así las islas tienen costas naturales en vez de
// círculos o cuadritos.
const WATER_RES = 4; // px de textura de agua por casilla
const FOG_RES = 4;   // px de niebla por casilla
const TERRAIN_PAD = 4; // margen (px de mundo) alrededor de cada bloque para que el suavizado no deje bordes

const LAND_PAL = [
  { wet: [196, 172, 124], sand: [240, 221, 166], sand2: [226, 200, 142], grass: [108, 182, 74], grass2: [82, 158, 62], dark: [46, 116, 52], rock: [146, 136, 120], leaf: ['#2f9a46', '#46b85a', '#227a38'] },
  { wet: [206, 186, 140], sand: [248, 233, 186], sand2: [234, 214, 160], grass: [96, 192, 98], grass2: [70, 168, 84], dark: [36, 126, 72], rock: [160, 150, 134], leaf: ['#2aa65a', '#4fcf73', '#1f8746'] },
  { wet: [150, 140, 112], sand: [200, 186, 146], sand2: [184, 170, 130], grass: [88, 130, 74], grass2: [70, 112, 62], dark: [40, 78, 48], rock: [118, 116, 112], leaf: ['#2f6e3a', '#3f8a4a', '#24552d'] },
  { wet: [118, 108, 104], sand: [158, 148, 136], sand2: [140, 130, 120], grass: [98, 86, 116], grass2: [80, 70, 98], dark: [54, 46, 72], rock: [96, 90, 104], leaf: ['#4b4060', '#5e4f78', '#382f4a'] },
];
// paletas intermedias para mezclar suavemente entre zonas (8 pasos por par de zonas)
const LAND_MIX = [];
for (let z = 0; z < 4; z++) {
  LAND_MIX.push([]);
  for (let s = 0; s < 8; s++) {
    const a = LAND_PAL[z], b = LAND_PAL[Math.min(3, z + 1)], t = s / 7, o = {};
    for (const k of ['wet', 'sand', 'sand2', 'grass', 'grass2', 'dark', 'rock']) o[k] = a[k].map((v, i) => v + (b[k][i] - v) * t);
    o.beachK = 1 - 0.3 * Math.max(0, Math.min(1, z + t - 2));
    LAND_MIX[z].push(o);
  }
}
const SHALLOW_TINT = [[120, 226, 214], [110, 236, 220], [112, 168, 178], [134, 110, 168]];

function smooth01(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

const Terrain = {
  sdf: null, water: null, mini: null,

  init() {
    const N = WW * WH, T = World.tiles;
    const ld = this.chamfer(i => T[i] !== W_LAND);   // distancia de cada casilla al agua
    const wd = this.chamfer(i => T[i] === W_LAND);   // distancia de cada casilla a la tierra
    this.sdf = new Float32Array(N);
    for (let i = 0; i < N; i++) this.sdf[i] = T[i] === W_LAND ? ld[i] - 0.5 : -(wd[i] - 0.5);
    // colores del mar por casilla (para mezclar zonas suavemente)
    this.zc = new Float32Array(N * 9);
    for (let i = 0; i < N; i++) {
      const z = World.zone[i], s = ZONES[z].sea, d = ZONES[z].deep, t = SHALLOW_TINT[z], o = i * 9;
      this.zc[o] = s[0]; this.zc[o + 1] = s[1]; this.zc[o + 2] = s[2];
      this.zc[o + 3] = d[0]; this.zc[o + 4] = d[1]; this.zc[o + 5] = d[2];
      this.zc[o + 6] = s[0] + (t[0] - s[0]) * 0.62; this.zc[o + 7] = s[1] + (t[1] - s[1]) * 0.62; this.zc[o + 8] = s[2] + (t[2] - s[2]) * 0.62;
    }
    this.buildWater();
    this.buildMini();
    this.buildPatterns();
  },

  // Transformada de distancia (chaflán 1 / √2): casi euclídea y muy rápida
  chamfer(isSrc) {
    const N = WW * WH, d = new Float32Array(N), R = 1.41421;
    for (let i = 0; i < N; i++) d[i] = isSrc(i) ? 0 : 1e6;
    for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
      const i = y * WW + x; let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - WW] + 1);
        if (x > 0) v = Math.min(v, d[i - WW - 1] + R);
        if (x < WW - 1) v = Math.min(v, d[i - WW + 1] + R);
      }
      d[i] = v;
    }
    for (let y = WH - 1; y >= 0; y--) for (let x = WW - 1; x >= 0; x--) {
      const i = y * WW + x; let v = d[i];
      if (x < WW - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < WH - 1) {
        v = Math.min(v, d[i + WW] + 1);
        if (x < WW - 1) v = Math.min(v, d[i + WW + 1] + R);
        if (x > 0) v = Math.min(v, d[i + WW - 1] + R);
      }
      d[i] = v;
    }
    for (let i = 0; i < N; i++) if (d[i] > 30) d[i] = 30;
    return d;
  },

  sdfAt(px, py) {
    let u = px / TILE - 0.5, v = py / TILE - 0.5;
    if (u < 0) u = 0; else if (u > WW - 1.001) u = WW - 1.001;
    if (v < 0) v = 0; else if (v > WH - 1.001) v = WH - 1.001;
    const x = u | 0, y = v | 0, fx = u - x, fy = v - y, i = y * WW + x, s = this.sdf;
    const a = s[i], b = s[i + 1], c = s[i + WW], d = s[i + WW + 1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  },
  coastNoise(px, py) {
    // amplitud moderada (±0.28 casillas) para que la costa dibujada coincida con la colisión
    return (valueNoise(px / 52, py / 52, 501) * 0.55 + valueNoise(px / 19, py / 19, 502) * 0.3 + valueNoise(px / 8, py / 8, 503) * 0.15 - 0.5) * 0.56;
  },
  // "altura" del terreno en casillas: >0 tierra, <0 agua
  hAt(px, py) { return this.sdfAt(px, py) + this.coastNoise(px, py); },
  // ancho de la playa (en casillas): irregular para que el pasto no forme bordes rectos
  beachAt(px, py) { return 0.3 + valueNoise(px / 60, py / 60, 620) * 0.8 + valueNoise(px / 17, py / 17, 621) * 0.4; },
  zoneAt(px, py) {
    const x = Math.min(WW - 1, Math.max(0, Math.floor(px / TILE))), y = Math.min(WH - 1, Math.max(0, Math.floor(py / TILE)));
    return World.zone[y * WW + x];
  },

  // ---------- Agua: una textura global suave ----------
  buildWater() {
    const R = WATER_RES, w = WW * R, h = WH * R;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), img = g.createImageData(w, h), D = img.data, zc = this.zc, T = World.tiles;
    for (let y = 0; y < h; y++) {
      const wy = (y + 0.5) / R * TILE;
      let v = wy / TILE - 0.5; if (v < 0) v = 0; else if (v > WH - 1.001) v = WH - 1.001;
      const ty = v | 0, fy = v - ty;
      for (let x = 0; x < w; x++) {
        const wx = (x + 0.5) / R * TILE;
        let u = wx / TILE - 0.5; if (u < 0) u = 0; else if (u > WW - 1.001) u = WW - 1.001;
        const tx = u | 0, fx = u - tx, i = ty * WW + tx;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        const s = this.sdf, s0 = s[i] * w00 + s[i + 1] * w10 + s[i + WW] * w01 + s[i + WW + 1] * w11;
        const o = (y * w + x) * 4;
        if (s0 > 1.2) { D[o] = 214; D[o + 1] = 206; D[o + 2] = 160; D[o + 3] = 255; continue; } // bajo tierra: no se ve
        const dep = -(s0 > -3.5 ? s0 + this.coastNoise(wx, wy) : s0);
        const o0 = i * 9, o1 = (i + 1) * 9, o2 = (i + WW) * 9, o3 = (i + WW + 1) * 9;
        const k1 = smooth01(0.2, 2.6, dep), k2 = smooth01(2.6, 7, dep);
        const reef = ((T[i] === W_REEF) * w00 + (T[i + 1] === W_REEF) * w10 + (T[i + WW] === W_REEF) * w01 + (T[i + WW + 1] === W_REEF) * w11);
        const patch = 0.93 + valueNoise(wx / 150, wy / 150, 700) * 0.12;
        for (let ch = 0; ch < 3; ch++) {
          const sea = zc[o0 + ch] * w00 + zc[o1 + ch] * w10 + zc[o2 + ch] * w01 + zc[o3 + ch] * w11;
          const deep = zc[o0 + 3 + ch] * w00 + zc[o1 + 3 + ch] * w10 + zc[o2 + 3 + ch] * w01 + zc[o3 + 3 + ch] * w11;
          const sh = zc[o0 + 6 + ch] * w00 + zc[o1 + 6 + ch] * w10 + zc[o2 + 6 + ch] * w01 + zc[o3 + 6 + ch] * w11;
          let col = sh + (sea - sh) * k1; col = col + (deep - col) * k2;
          col = col + ([118, 222, 206][ch] - col) * reef * 0.42;
          D[o + ch] = col * patch;
        }
        D[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    this.water = c;
  },

  // ---------- Minimapa: agua + tierra con colores reales ----------
  buildMini() {
    const R = 2, w = WW * R, h = WH * R;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.drawImage(this.water, 0, 0, w, h);
    const img = g.getImageData(0, 0, w, h), D = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const wx = (x + 0.5) / R * TILE, wy = (y + 0.5) / R * TILE, hh = this.hAt(wx, wy);
      const o = (y * w + x) * 4, T = World.tileAtWorld(wx, wy);
      if (T === W_ROCK) { D[o] = 110; D[o + 1] = 108; D[o + 2] = 116; continue; }
      if (hh < -0.15) continue;
      const p = LAND_PAL[this.zoneAt(wx, wy)];
      const col = hh < 0 ? [235, 245, 240] : hh < 0.9 ? p.sand : hh < 3 ? p.grass : p.dark;
      D[o] = col[0]; D[o + 1] = col[1]; D[o + 2] = col[2];
    }
    g.putImageData(img, 0, 0);
    this.mini = c;
  },

  // ---------- Texturas reutilizables ----------
  buildPatterns() {
    // ondas estilizadas del mar
    const s = 256, c = document.createElement('canvas'); c.width = s; c.height = s;
    const g = c.getContext('2d'); g.lineCap = 'round';
    for (let k = 0; k < 46; k++) {
      const x = hash2(k, 1, 800) * s, y = hash2(k, 2, 800) * s, L = 10 + hash2(k, 3, 800) * 18;
      for (const [dx, dy] of [[0, 0], [-s, 0], [0, -s], [-s, -s], [s, 0], [0, s]]) {
        g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(x + dx - L, y + dy); g.quadraticCurveTo(x + dx, y + dy - 4, x + dx + L, y + dy); g.stroke();
        g.strokeStyle = 'rgba(0,30,70,0.35)'; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(x + dx - L * 0.8, y + dy + 3); g.quadraticCurveTo(x + dx, y + dy - 1, x + dx + L * 0.8, y + dy + 3); g.stroke();
      }
    }
    this.wavePat = c;
    // sombra de nube suave
    const cl = document.createElement('canvas'); cl.width = 256; cl.height = 160;
    const cg = cl.getContext('2d');
    for (let k = 0; k < 7; k++) {
      const x = 50 + hash2(k, 1, 810) * 156, y = 50 + hash2(k, 2, 810) * 60, r = 30 + hash2(k, 3, 810) * 34;
      const gr = cg.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      cg.fillStyle = gr; cg.beginPath(); cg.arc(x, y, r, 0, 6.28); cg.fill();
    }
    this.cloud = cl;
    // pincel suave para la niebla
    const fd = document.createElement('canvas'); fd.width = fd.height = 16;
    const fg = fd.getContext('2d'), gr = fg.createRadialGradient(8, 8, 0, 8, 8, 8);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    fg.fillStyle = gr; fg.fillRect(0, 0, 16, 16);
    this.fogDot = fd;
  },

  // ---------- Capa de tierra por bloque (transparente sobre el agua) ----------
  buildLand(cx, cy, scale) {
    const x0 = cx * CH, y0 = cy * CH;
    let any = false;
    for (let ty = y0 - 1; ty <= y0 + CH && !any; ty++) for (let tx = x0 - 1; tx <= x0 + CH; tx++) if (World.tileAt(tx, ty) !== W_WATER) { any = true; break; }
    if (!any) return null;
    const P = TERRAIN_PAD, S = CH * TILE + 2 * P, X0 = x0 * TILE - P, Y0 = y0 * TILE - P;
    // rejilla gruesa (cada 2 px) con altura, sombreado y ruidos lentos
    const gn = S / 2 + 3;
    const hg = new Float32Array(gn * gn), eg = new Float32Array(gn * gn), bw = new Float32Array(gn * gn), ft = new Float32Array(gn * gn), gm = new Float32Array(gn * gn), zg = new Float32Array(gn * gn);
    const Z = World.zone;
    for (let j = 0; j < gn; j++) for (let i = 0; i < gn; i++) {
      const px = X0 + (i - 1) * 2, py = Y0 + (j - 1) * 2, k = j * gn + i;
      const h = this.hAt(px, py);
      hg[k] = h;
      eg[k] = h > 0 ? Math.sqrt(h) * 0.8 + valueNoise(px / 120, py / 120, 610) * Math.min(1, h * 0.6) * 2.2 : h * 0.4;
      bw[k] = this.beachAt(px, py);
      ft[k] = 2.3 + valueNoise(px / 64, py / 64, 650) * 2.4;
      gm[k] = valueNoise(px / 38, py / 38, 640);
      // zona suavizada (bilineal entre casillas + un poco de ruido)
      let u = px / TILE - 0.5, v = py / TILE - 0.5;
      u = Math.max(0, Math.min(WW - 1.001, u)); v = Math.max(0, Math.min(WH - 1.001, v));
      const tx = u | 0, ty = v | 0, fx = u - tx, fy = v - ty, ti = ty * WW + tx;
      zg[k] = Z[ti] * (1 - fx) * (1 - fy) + Z[ti + 1] * fx * (1 - fy) + Z[ti + WW] * (1 - fx) * fy + Z[ti + WW + 1] * fx * fy;
    }
    const sh = new Float32Array(gn * gn);
    for (let j = 1; j < gn - 1; j++) for (let i = 1; i < gn - 1; i++) {
      const k = j * gn + i;
      const v = ((eg[k + 1] - eg[k - 1]) + (eg[k + gn] - eg[k - gn])) * 1.6;
      sh[k] = v < -0.32 ? -0.32 : v > 0.28 ? 0.28 : v;
    }
    const tmp = document.createElement('canvas'); tmp.width = S; tmp.height = S;
    const tg = tmp.getContext('2d'), img = tg.createImageData(S, S), D = img.data;
    const bil = (A, k, fx, fy) => A[k] + (A[k + 1] - A[k]) * fx + (A[k + gn] - A[k]) * fy + (A[k] - A[k + 1] - A[k + gn] + A[k + gn + 1]) * fx * fy;
    for (let py = 0; py < S; py++) {
      const gy = py / 2 + 1, jy = gy | 0, fy = gy - jy;
      const wy = Y0 + py;
      for (let px = 0; px < S; px++) {
        const gx = px / 2 + 1, ix = gx | 0, fx = gx - ix, k = jy * gn + ix;
        const h = bil(hg, k, fx, fy);
        if (h < -0.68) continue;
        const wx = X0 + px, o = (py * S + px) * 4;
        const zf = bil(zg, k, fx, fy), z0 = Math.min(3, zf | 0), p = LAND_MIX[z0][Math.round((zf - z0) * 7)];
        let r, gg, b, a = 255;
        if (h < 0) {
          // banda de espuma y agua clara junto a la orilla
          const f = 1 - Math.abs(h + 0.17) / 0.51;
          a = f <= 0 ? 0 : Math.round(f * f * 200);
          r = 236; gg = 250; b = 248;
          if (h > -0.05) { const t = (h + 0.05) / 0.05; r += (p.wet[0] - r) * t; gg += (p.wet[1] - gg) * t; b += (p.wet[2] - b) * t; a = a + (255 - a) * t; }
          if (a <= 0) continue;
        } else {
          const beach = bil(bw, k, fx, fy) * p.beachK;
          const n1 = hash2(wx, wy, 630) - 0.5;
          if (h < beach) {
            const t = Math.min(1, h / 0.16);
            const dune = Math.sin((wx * 0.7 + wy * 0.4) / 5 + valueNoise(wx / 20, wy / 20, 631) * 6) * 3;
            const sr = p.sand[0] + (p.sand2[0] - p.sand[0]) * (0.5 + n1 * 0.6), sg = p.sand[1] + (p.sand2[1] - p.sand[1]) * (0.5 + n1 * 0.6), sb = p.sand[2] + (p.sand2[2] - p.sand[2]) * (0.5 + n1 * 0.6);
            r = p.wet[0] + (sr - p.wet[0]) * t + dune; gg = p.wet[1] + (sg - p.wet[1]) * t + dune; b = p.wet[2] + (sb - p.wet[2]) * t + dune;
            if (h > beach - 0.12) { r *= 0.93; gg *= 0.93; b *= 0.93; } // sombra del borde del pasto
            const s2 = bil(sh, k, fx, fy) * 0.4; r *= 1 + s2; gg *= 1 + s2; b *= 1 + s2;
          } else {
            let m = bil(gm, k, fx, fy) * 0.75 + valueNoise(wx / 9, wy / 9, 641) * 0.25 + n1 * 0.18;
            m = m < 0 ? 0 : m > 1 ? 1 : m;
            r = p.grass[0] + (p.grass2[0] - p.grass[0]) * m; gg = p.grass[1] + (p.grass2[1] - p.grass[1]) * m; b = p.grass[2] + (p.grass2[2] - p.grass[2]) * m;
            const fth = bil(ft, k, fx, fy);
            if (h > fth) { const t = smooth01(fth, fth + 1.2, h) * 0.85; r += (p.dark[0] - r) * t; gg += (p.dark[1] - gg) * t; b += (p.dark[2] - b) * t; }
            if (h > fth + 3.2) { const t = smooth01(fth + 3.2, fth + 4.4, h) * 0.8; r += (p.rock[0] - r) * t; gg += (p.rock[1] - gg) * t; b += (p.rock[2] - b) * t; }
            if (h < beach + 0.13) { const t = 0.42 * (1 - (h - beach) / 0.13); r += (p.dark[0] - r) * t; gg += (p.dark[1] - gg) * t; b += (p.dark[2] - b) * t; }
            const s2 = bil(sh, k, fx, fy); r *= 1 + s2; gg *= 1 + s2; b *= 1 + s2;
          }
        }
        D[o] = r; D[o + 1] = gg; D[o + 2] = b; D[o + 3] = a;
      }
    }
    tg.putImageData(img, 0, 0);
    const c = document.createElement('canvas'); c.width = Math.round(S * scale); c.height = Math.round(S * scale);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.drawImage(tmp, 0, 0, c.width, c.height);
    g.scale(scale, scale); g.translate(-X0, -Y0);
    this.drawPlazas(g, x0, y0);
    this.drawDecor(g, x0, y0);
    return c;
  },

  // ---------- Plaza empedrada de los pueblos ----------
  drawPlazas(g, x0, y0) {
    for (const p of World.ports) {
      if (Math.abs(p.tx - (x0 + CH / 2)) > CH + 8 || Math.abs(p.ty - (y0 + CH / 2)) > CH + 8) continue;
      g.save();
      // camino de tierra al muelle
      g.fillStyle = '#b39b74'; g.beginPath(); g.moveTo(p.x + 70, p.y + 6); g.lineTo(p.x + 158, p.y + 14); g.lineTo(p.x + 158, p.y + 44); g.lineTo(p.x + 70, p.y + 46); g.closePath(); g.fill();
      g.fillStyle = 'rgba(80,60,30,0.15)'; for (let k = 0; k < 14; k++) { g.beginPath(); g.ellipse(p.x + 80 + hash2(k, p.id, 1) * 76, p.y + 14 + hash2(k, p.id, 2) * 26, 3, 2, 0, 0, 6.28); g.fill(); }
      g.fillStyle = '#9d8a6a'; g.beginPath(); g.ellipse(p.x, p.y + 3, 134, 116, 0, 0, 6.28); g.fill();
      g.fillStyle = '#c2b394'; g.beginPath(); g.ellipse(p.x, p.y, 130, 112, 0, 0, 6.28); g.fill();
      g.clip();
      for (let yy = p.y - 118, row = 0; yy < p.y + 118; yy += 9, row++) for (let xx = p.x - 136 + (row % 2) * 7; xx < p.x + 136; xx += 14) {
        const hh = hash2(xx | 0, yy | 0, 3), w = 11 + hash2(xx | 0, yy | 0, 4) * 2;
        const v = 190 + Math.floor(hh * 34);
        g.fillStyle = 'rgb(' + v + ',' + (v - 12) + ',' + (v - 34) + ')';
        g.beginPath(); this.rrect(g, xx, yy, w, 7, 2.5); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(xx + 1.5, yy + 0.8, w - 3, 1.4);
      }
      // brillo central
      const gr = g.createRadialGradient(p.x, p.y, 10, p.x, p.y, 130);
      gr.addColorStop(0, 'rgba(255,240,200,0.18)'); gr.addColorStop(1, 'rgba(60,40,20,0.12)');
      g.fillStyle = gr; g.fillRect(p.x - 140, p.y - 120, 280, 240);
      g.restore();
      // anillo de bordillo
      g.strokeStyle = 'rgba(110,95,70,0.8)'; g.lineWidth = 3; g.beginPath(); g.ellipse(p.x, p.y, 130, 112, 0, 0, 6.28); g.stroke();
      // jardineras
      for (const [dx, dy] of [[-38, -26], [38, -26], [-38, 26], [38, 26]]) {
        g.fillStyle = '#7d6a52'; g.beginPath(); g.arc(p.x + dx, p.y + dy, 8, 0, 6.28); g.fill();
        g.fillStyle = '#3f8a3a'; g.beginPath(); g.arc(p.x + dx, p.y + dy - 1, 6, 0, 6.28); g.fill();
        for (let k = 0; k < 4; k++) { g.fillStyle = ['#ff6f91', '#ffd23f', '#fff', '#c77dff'][(k + p.id) % 4]; g.beginPath(); g.arc(p.x + dx + Math.cos(k * 1.6) * 3.5, p.y + dy - 1 + Math.sin(k * 1.6) * 3.5, 1.5, 0, 6.28); g.fill(); }
      }
    }
  },
  rrect(g, x, y, w, h, r) { g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); },

  // ---------- Vegetación y detalles ----------
  drawDecor(g, x0, y0) {
    const items = [];
    const nearPort = (x, y) => World.ports.some(p => ((x - p.x) / 150) ** 2 + ((y - p.y) / 132) ** 2 < 1 || (x > p.x + 60 && x < p.x + 270 && y > p.y - 4 && y < p.y + 56));
    const nearPOI = (x, y) => World.caves.some(c => Math.hypot(c.x - x, c.y - y) < 34) || World.xmarks.some(c => Math.hypot(c.x - x, c.y - y) < 30);
    for (let ty = y0 - 1; ty < y0 + CH + 1; ty++) for (let tx = x0 - 1; tx < x0 + CH + 1; tx++) {
      if (tx < 0 || ty < 0 || tx >= WW || ty >= WH) continue;
      const t = World.tiles[ty * WW + tx], z = World.zone[ty * WW + tx];
      if (t === W_REEF) { items.push({ y: ty * TILE, f: () => this.coral(g, tx, ty) }); continue; }
      if (t === W_ROCK) { const x = tx * TILE + 16, y = ty * TILE + 17; items.push({ y, f: () => this.seaRock(g, x, y, hash2(tx, ty, 9)) }); continue; }
      for (let k = 0; k < 3; k++) {
        const x = tx * TILE + hash2(tx, ty, 200 + k) * TILE, y = ty * TILE + hash2(tx, ty, 210 + k) * TILE;
        const h = this.hAt(x, y);
        if (h < 0.08) continue;
        if (nearPort(x, y) || nearPOI(x, y)) continue;
        const r = hash2(tx, ty, 220 + k), v = hash2(tx, ty, 230 + k);
        const beach = this.beachAt(x, y);
        if (h < beach) {
          if (r < 0.05) items.push({ y, f: () => this.shell(g, x, y, v) });
          else if (r < 0.075) items.push({ y, f: () => this.pebble(g, x, y, v, z) });
          else if (r < 0.09 && k === 0) items.push({ y, f: () => this.driftwood(g, x, y, v) });
          else if (r > 0.94 && z <= 1 && h > 0.3) {
            const gx = this.hAt(x + 8, y) - this.hAt(x - 8, y), gy = this.hAt(x, y + 8) - this.hAt(x, y - 8), l = Math.hypot(gx, gy) || 1;
            items.push({ y, f: () => this.palm(g, x, y, z, v, -gx / l, -gy / l) });
          }
          continue;
        }
        const p = z === 3 ? 0.11 : 0.15 + Math.min(0.3, (h - beach) * 0.07);
        if (r < p) {
          let kind;
          if (z <= 1) kind = h < 2.6 ? (v < 0.72 ? 'palm' : 'tree') : (v < 0.3 ? 'palm' : 'tree');
          else if (z === 2) kind = v < 0.6 ? 'pine' : 'tree';
          else kind = v < 0.75 ? 'dead' : 'tree';
          if (kind === 'palm') items.push({ y, f: () => this.palm(g, x, y, z, v, 0, 0) });
          else if (kind === 'pine') items.push({ y, f: () => this.pine(g, x, y, v) });
          else if (kind === 'dead') items.push({ y, f: () => this.deadTree(g, x, y, v) });
          else items.push({ y, f: () => this.tree(g, x, y, z, v) });
        } else if (r < p + 0.07) items.push({ y, f: () => this.bush(g, x, y, z, v) });
        else if (r < p + 0.15) items.push({ y, f: () => z === 3 ? this.mushrooms(g, x, y, v) : this.flowers(g, x, y, v) });
        else if (r < p + 0.3) items.push({ y, f: () => this.tuft(g, x, y, z, v) });
        else if (r < p + 0.33) items.push({ y, f: () => this.pebble(g, x, y, v, z) });
        else if (z === 3 && r < p + 0.35) items.push({ y, f: () => this.bones(g, x, y, v) });
      }
    }
    items.sort((a, b) => a.y - b.y);
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const it of items) it.f();
    g.lineCap = 'butt'; g.lineJoin = 'miter';
  },

  shadow(g, x, y, rx, ry, a) { g.fillStyle = 'rgba(20,30,10,' + (a || 0.22) + ')'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 6.28); g.fill(); },

  palm(g, x, y, z, v, lx, ly) {
    const lean = 0.5 + v * 0.6, tx = x + (lx || Math.cos(v * 20)) * 9 * lean, ty = y + (ly || Math.sin(v * 20)) * 9 * lean - 12;
    const L = LAND_PAL[z].leaf;
    this.shadow(g, tx + 9, ty + 16, 15, 7, 0.2);
    // tronco anillado
    g.strokeStyle = '#6b4626'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (tx - x) * 0.2, y - 6, tx, ty); g.stroke();
    g.strokeStyle = '#8f6236'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(x - 1, y - 1); g.quadraticCurveTo(x + (tx - x) * 0.2 - 1, y - 7, tx - 1, ty); g.stroke();
    g.strokeStyle = 'rgba(60,35,15,0.6)'; g.lineWidth = 1;
    for (let k = 1; k < 5; k++) { const t = k / 5, px = x + (tx - x) * t, py = y + (ty - y) * t - Math.sin(t * Math.PI) * 3; g.beginPath(); g.moveTo(px - 2.5, py); g.lineTo(px + 2.5, py + 0.6); g.stroke(); }
    // hojas
    const n = 7;
    for (let k = 0; k < n; k++) {
      const a = v * 9 + k * 6.283 / n, len = 15 + hash2(k, v * 1000 | 0, 1) * 4;
      const ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * 0.85 + 3;
      const mx = tx + Math.cos(a) * len * 0.5 - Math.sin(a) * 3, my = ty + Math.sin(a) * len * 0.45 + Math.cos(a) * 3 - 3;
      g.fillStyle = L[2]; g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(mx + Math.sin(a) * 4, my - Math.cos(a) * 4, ex, ey); g.quadraticCurveTo(mx - Math.sin(a) * 4, my + Math.cos(a) * 4 + 1, tx, ty); g.fill();
      g.fillStyle = L[k % 2]; g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(mx + Math.sin(a) * 3.2, my - Math.cos(a) * 3.2 - 1, ex, ey - 1); g.quadraticCurveTo(mx, my, tx, ty); g.fill();
      g.strokeStyle = 'rgba(255,255,220,0.35)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(mx, my - 0.5, ex, ey - 0.5); g.stroke();
    }
    g.fillStyle = '#6b4220'; g.beginPath(); g.arc(tx - 1.5, ty + 1, 2.2, 0, 6.28); g.arc(tx + 2, ty + 0.5, 2.2, 0, 6.28); g.arc(tx, ty - 1.5, 2, 0, 6.28); g.fill();
  },
  tree(g, x, y, z, v) {
    const L = LAND_PAL[z].leaf, r = 11 + v * 6;
    this.shadow(g, x + 7, y + 6, r * 1.1, r * 0.6, 0.25);
    g.fillStyle = '#5a3a1e'; g.fillRect(x - 2, y - 4, 4, 8);
    const blobs = [[0, -6, 1], [-r * 0.5, -3, 0.7], [r * 0.5, -2, 0.72], [-r * 0.2, -r * 0.6 - 4, 0.66], [r * 0.3, -r * 0.55 - 3, 0.6]];
    g.fillStyle = L[2]; for (const [dx, dy, s] of blobs) { g.beginPath(); g.arc(x + dx, y + dy + 2, r * s, 0, 6.28); g.fill(); }
    g.fillStyle = L[0]; for (const [dx, dy, s] of blobs) { g.beginPath(); g.arc(x + dx, y + dy, r * s * 0.92, 0, 6.28); g.fill(); }
    g.fillStyle = L[1]; for (const [dx, dy, s] of blobs) { g.beginPath(); g.arc(x + dx - r * s * 0.25, y + dy - r * s * 0.3, r * s * 0.45, 0, 6.28); g.fill(); }
    if (z <= 1 && v > 0.6) { g.fillStyle = v > 0.8 ? '#ff7043' : '#ffd54f'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + (hash2(k, 1, v * 99 | 0) - 0.5) * r * 1.4, y - 4 + (hash2(k, 2, v * 99 | 0) - 0.5) * r, 1.6, 0, 6.28); g.fill(); } }
  },
  pine(g, x, y, v) {
    const r = 10 + v * 5;
    this.shadow(g, x + 7, y + 5, r, r * 0.55, 0.26);
    for (let l = 0; l < 3; l++) {
      const rr = r * (1 - l * 0.28), cy = y - 3 - l * 4;
      for (const [col, off] of [['#1f4a2a', 1.5], [l === 2 ? '#4f8a52' : '#356b3c', 0]]) {
        g.fillStyle = col; g.beginPath();
        for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283, rad = k % 2 ? rr * 0.68 : rr; g.lineTo(x + Math.cos(a) * rad, cy + off + Math.sin(a) * rad * 0.9); }
        g.closePath(); g.fill();
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(x - 2, y - 13, 2.5, 0, 6.28); g.fill();
  },
  deadTree(g, x, y, v) {
    this.shadow(g, x + 6, y + 4, 10, 4, 0.25);
    g.strokeStyle = '#3b3340'; g.lineWidth = 3.5;
    g.beginPath(); g.moveTo(x, y + 3); g.lineTo(x + 1, y - 10); g.stroke();
    g.lineWidth = 2;
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k - 2) * 0.55 + (v - 0.5), L = 8 + hash2(k, 3, v * 99 | 0) * 6;
      const bx = x + 1, by = y - 6 - k * 1.2;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(a) * L, by + Math.sin(a) * L); g.lineTo(bx + Math.cos(a + 0.5) * L * 1.3, by + Math.sin(a + 0.5) * L * 1.3); g.stroke();
    }
    g.fillStyle = '#7a5aa0'; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + (hash2(k, 5, v * 99 | 0) - 0.5) * 16, y - 12 + (hash2(k, 6, v * 99 | 0) - 0.5) * 8, 1.5, 0, 6.28); g.fill(); }
  },
  bush(g, x, y, z, v) {
    const L = LAND_PAL[z].leaf, s = 0.8 + v * 0.5;
    this.shadow(g, x + 4, y + 4, 10 * s, 4.5 * s, 0.2);
    g.fillStyle = L[2]; g.beginPath(); g.arc(x - 5 * s, y + 1, 6 * s, 0, 6.28); g.arc(x + 5 * s, y + 1.5, 6 * s, 0, 6.28); g.arc(x, y - 2.5 * s, 6.5 * s, 0, 6.28); g.fill();
    g.fillStyle = L[0]; g.beginPath(); g.arc(x - 5 * s, y, 5 * s, 0, 6.28); g.arc(x + 5 * s, y + 0.5, 5 * s, 0, 6.28); g.arc(x, y - 3.5 * s, 5.5 * s, 0, 6.28); g.fill();
    g.fillStyle = L[1]; g.beginPath(); g.arc(x - 2 * s, y - 5 * s, 2.2 * s, 0, 6.28); g.arc(x - 6.5 * s, y - 1.5 * s, 1.8 * s, 0, 6.28); g.fill();
    if (v > 0.55 && z < 3) { g.fillStyle = v > 0.8 ? '#e53935' : '#7e57c2'; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x - 4 + k * 4, y - 1 + (k % 2) * 2, 1.3, 0, 6.28); g.fill(); } }
  },
  flowers(g, x, y, v) {
    const col = ['#ff6f91', '#ffd23f', '#ffffff', '#c77dff', '#ff8a3d'][Math.floor(v * 5)];
    for (let k = 0; k < 5; k++) {
      const fx = x + (hash2(k, 1, v * 999 | 0) - 0.5) * 14, fy = y + (hash2(k, 2, v * 999 | 0) - 0.5) * 10;
      g.strokeStyle = '#3d7a2e'; g.lineWidth = 1; g.beginPath(); g.moveTo(fx, fy + 3); g.lineTo(fx, fy); g.stroke();
      g.fillStyle = col; g.beginPath(); g.arc(fx, fy, 1.9, 0, 6.28); g.fill();
      g.fillStyle = '#fff3a0'; g.beginPath(); g.arc(fx, fy, 0.7, 0, 6.28); g.fill();
    }
  },
  mushrooms(g, x, y, v) {
    for (let k = 0; k < 3; k++) {
      const fx = x + (k - 1) * 5, fy = y + (k % 2) * 3;
      g.fillStyle = '#d9cfe0'; g.fillRect(fx - 0.8, fy - 1, 1.6, 3);
      g.fillStyle = v > 0.5 ? '#b388ff' : '#7c4dff'; g.beginPath(); g.ellipse(fx, fy - 1.5, 3, 2, 0, Math.PI, 0); g.fill();
      g.fillStyle = 'rgba(200,170,255,0.35)'; g.beginPath(); g.arc(fx, fy - 1.5, 5, 0, 6.28); g.fill();
    }
  },
  tuft(g, x, y, z, v) {
    g.strokeStyle = z === 3 ? 'rgba(60,50,80,0.7)' : 'rgba(30,90,30,0.65)'; g.lineWidth = 1.2;
    g.beginPath();
    for (let k = 0; k < 4; k++) { const a = -1.9 + k * 0.4 + (v - 0.5) * 0.3; g.moveTo(x + k * 1.5 - 2, y); g.lineTo(x + k * 1.5 - 2 + Math.cos(a) * 5, y + Math.sin(a) * 5); }
    g.stroke();
  },
  pebble(g, x, y, v, z) {
    const r = 2.5 + v * 3;
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(x + 1.5, y + 1.5, r, r * 0.7, 0, 0, 6.28); g.fill();
    g.fillStyle = z === 3 ? '#6e6878' : '#8f8a80'; g.beginPath(); g.ellipse(x, y, r, r * 0.75, v, 0, 6.28); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.3, r * 0.4, r * 0.25, 0, 0, 6.28); g.fill();
  },
  shell(g, x, y, v) {
    if (v < 0.3) { // estrella de mar
      g.fillStyle = '#ff7f50'; g.beginPath();
      for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283 + v * 5, r = k % 2 ? 1.4 : 4; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      g.closePath(); g.fill(); return;
    }
    g.fillStyle = v > 0.65 ? '#f8e1e7' : '#fff6e3'; g.beginPath(); g.ellipse(x, y, 2.8, 2.2, v * 3, 0, 6.28); g.fill();
    g.strokeStyle = 'rgba(160,110,90,0.6)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x - 1.5, y); g.lineTo(x + 1.5, y); g.stroke();
  },
  driftwood(g, x, y, v) {
    const a = v * 6, L = 9 + v * 6;
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 4; g.beginPath(); g.moveTo(x - Math.cos(a) * L + 1.5, y - Math.sin(a) * L + 2); g.lineTo(x + Math.cos(a) * L + 1.5, y + Math.sin(a) * L + 2); g.stroke();
    g.strokeStyle = '#a08060'; g.lineWidth = 3.4; g.beginPath(); g.moveTo(x - Math.cos(a) * L, y - Math.sin(a) * L); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
    g.strokeStyle = '#c4a884'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - Math.cos(a) * L * 0.8, y - Math.sin(a) * L * 0.8 - 0.8); g.lineTo(x + Math.cos(a) * L * 0.6, y + Math.sin(a) * L * 0.6 - 0.8); g.stroke();
  },
  bones(g, x, y, v) {
    g.strokeStyle = '#e8e0d0'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(x - 4, y - 2); g.lineTo(x + 4, y + 2); g.moveTo(x - 4, y + 2); g.lineTo(x + 4, y - 2); g.stroke();
    if (v > 0.5) { g.fillStyle = '#efe8d8'; g.beginPath(); g.arc(x + 6, y - 3, 3, 0, 6.28); g.fill(); g.fillStyle = '#222'; g.fillRect(x + 4.6, y - 3.6, 1.1, 1.1); g.fillRect(x + 6.5, y - 3.6, 1.1, 1.1); }
  },
  coral(g, tx, ty) {
    const cols = ['#ff8a80', '#ffb74d', '#f06292', '#ce93d8', '#80cbc4', '#fff59d'];
    const H = (k) => hash2(tx, ty, k);
    g.fillStyle = 'rgba(255,240,200,0.16)'; g.beginPath(); g.ellipse(tx * TILE + 16, ty * TILE + 16, 14, 10, H(3), 0, 6.28); g.fill();
    const n = 2 + Math.floor(H(4) * 2);
    g.globalAlpha = 0.75;
    for (let k = 0; k < n; k++) {
      const x = tx * TILE + 6 + H(20 + k) * 20, y = ty * TILE + 6 + H(40 + k) * 20, col = cols[Math.floor(H(60 + k) * 6)], kind = H(70 + k);
      if (kind < 0.3) {
        // coral cuerno de ciervo: ramas desiguales hacia un lado, con bifurcaciones
        g.strokeStyle = col; g.lineCap = 'round';
        const base = H(90 + k) * 6.28, nb = 3 + Math.floor(H(91 + k) * 2);
        for (let b = 0; b < nb; b++) {
          const a = base + (b - (nb - 1) / 2) * (0.45 + H(100 + b + k * 7) * 0.3), L = 4 + H(110 + b + k * 7) * 4;
          const mx = x + Math.cos(a) * L, my = y + Math.sin(a) * L;
          g.lineWidth = 1.8; g.beginPath(); g.moveTo(x, y); g.lineTo(mx, my); g.stroke();
          g.lineWidth = 1.2; g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + Math.cos(a - 0.35) * L * 0.6, my + Math.sin(a - 0.35) * L * 0.6); g.stroke();
          if (H(120 + b + k * 7) < 0.6) { g.beginPath(); g.moveTo(mx - Math.cos(a) * L * 0.3, my - Math.sin(a) * L * 0.3); g.lineTo(mx + Math.cos(a + 0.6) * L * 0.4, my + Math.sin(a + 0.6) * L * 0.4); g.stroke(); }
        }
      } else if (kind < 0.55) {
        // abanico de mar
        const a = H(130 + k) * 6.28, r = 5 + H(131 + k) * 3;
        g.fillStyle = col; g.globalAlpha = 0.45; g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, a - 0.9, a + 0.9); g.closePath(); g.fill();
        g.globalAlpha = 0.75; g.strokeStyle = col; g.lineWidth = 0.8;
        for (let s = -2; s <= 2; s++) { const aa = a + s * 0.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r); g.stroke(); }
      } else if (kind < 0.8) {
        // coral cerebro
        const r = 3 + H(80 + k) * 2.5;
        g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 0.7;
        g.beginPath(); g.moveTo(x - r * 0.6, y - r * 0.2); g.quadraticCurveTo(x, y - r * 0.7, x + r * 0.6, y); g.moveTo(x - r * 0.5, y + r * 0.35); g.quadraticCurveTo(x, y - r * 0.1, x + r * 0.5, y + r * 0.45); g.stroke();
      } else {
        // anémonas / esponjas
        g.fillStyle = col;
        for (let s = 0; s < 4; s++) { g.beginPath(); g.arc(x + (H(140 + s + k * 5) - 0.5) * 8, y + (H(150 + s + k * 5) - 0.5) * 8, 1.4 + H(160 + s + k * 5) * 1.4, 0, 6.28); g.fill(); }
      }
    }
    g.globalAlpha = 1; g.lineCap = 'round';
  },
  seaRock(g, x, y, v) {
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(x, y + 3, 17, 12, 0, 0, 6.28); g.stroke();
    g.fillStyle = 'rgba(10,30,50,0.3)'; g.beginPath(); g.ellipse(x + 3, y + 5, 14, 9, 0, 0, 6.28); g.fill();
    const pts = []; for (let k = 0; k < 9; k++) { const a = k / 9 * 6.283, r = 11 + hash2(k, v * 99 | 0, 7) * 4; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8]); }
    g.fillStyle = '#3e424b'; g.beginPath(); for (const [px, py] of pts) g.lineTo(px, py + 2); g.closePath(); g.fill();
    g.fillStyle = '#626772'; g.beginPath(); for (const [px, py] of pts) g.lineTo(x + (px - x) * 0.85 - 1.5, y + (py - y) * 0.85 - 1); g.closePath(); g.fill();
    g.fillStyle = '#8a909b'; g.beginPath(); g.ellipse(x - 4, y - 4, 5, 3.5, -0.4, 0, 6.28); g.fill();
    g.fillStyle = 'rgba(60,120,70,0.5)'; g.beginPath(); g.ellipse(x + 4, y + 3, 4, 2, 0.3, 0, 6.28); g.fill();
  },
};
