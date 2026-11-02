'use strict';
// ===== Motor gráfico =====
const CH = 8;
const Render = {
  cv: null, ctx: null, w: 0, h: 0, dpr: 1, zoom: 1, viewZoom: 1, cam: { x: 0, y: 0 },
  chunks: new Map(), chunkScale: 1, fog: null, fogCtx: null, mini: null, light: null, lctx: null, depth: null,

  init(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.fog = document.createElement('canvas'); this.fog.width = WW; this.fog.height = WH;
    this.fogCtx = this.fog.getContext('2d');
    this.fogCtx.fillStyle = '#0a1422'; this.fogCtx.fillRect(0, 0, WW, WH);
    this.light = document.createElement('canvas'); this.lctx = this.light.getContext('2d');
    this.computeDepth();
    this.buildMini();
    this.resize();
  },
  computeDepth() {
    const N = WW * WH, d = new Uint8Array(N).fill(9), q = [];
    for (let i = 0; i < N; i++) if (World.tiles[i] === W_LAND) { d[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % WW, y = (i / WW) | 0;
      if (d[i] >= 6) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= WW || ny >= WH) continue;
        const j = ny * WW + nx; if (d[j] > d[i] + 1) { d[j] = d[i] + 1; q.push(j); }
      }
    }
    this.depth = d;
  },
  resetFog() {
    this.fogCtx.globalCompositeOperation = 'source-over';
    this.fogCtx.fillStyle = '#0a1422'; this.fogCtx.fillRect(0, 0, WW, WH);
    for (let i = 0; i < WW * WH; i++) if (G.revealed[i]) this.fogCtx.clearRect(i % WW, (i / WW) | 0, 1, 1);
  },
  fogClear(x, y) { this.fogCtx.clearRect(x, y, 1, 1); },
  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth; this.h = window.innerHeight;
    this.cv.width = Math.round(this.w * this.dpr); this.cv.height = Math.round(this.h * this.dpr);
    this.cv.style.width = this.w + 'px'; this.cv.style.height = this.h + 'px';
    this.zoom = Math.max(0.7, Math.min(1.6, Math.max(this.w, this.h) / (24 * TILE)));
    this.light.width = Math.ceil(this.w / 2); this.light.height = Math.ceil(this.h / 2);
    const sc = Math.max(1, Math.min(2, Math.round(this.zoom * this.dpr * 1.6 * 2) / 2));
    if (sc !== this.chunkScale) { this.chunkScale = sc; this.chunks.clear(); }
  },
  invalidate() { this.chunks.clear(); this.buildMini(); },

  waterRGB(i) {
    const z = World.zone[i], dep = Math.min(1, (this.depth[i] - 1) / 4);
    const s = ZONES[z].sea, dp = ZONES[z].deep;
    const sh = [Math.min(255, s[0] + 60), Math.min(255, s[1] + 70), Math.min(255, s[2] + 40)];
    const t = World.tiles[i];
    let c;
    if (dep <= 0) c = sh; else if (dep < 0.5) { const k = dep * 2; c = [sh[0] + (s[0] - sh[0]) * k, sh[1] + (s[1] - sh[1]) * k, sh[2] + (s[2] - sh[2]) * k]; }
    else { const k = (dep - 0.5) * 2; c = [s[0] + (dp[0] - s[0]) * k, s[1] + (dp[1] - s[1]) * k, s[2] + (dp[2] - s[2]) * k]; }
    if (t === W_REEF) c = [c[0] * 0.7 + 90 * 0.3, c[1] * 0.7 + 220 * 0.3, c[2] * 0.7 + 210 * 0.3];
    if (t === W_LAND) c = sh;
    return c;
  },
  landColors(z) {
    return [
      { sand: '#efd8a0', sand2: '#e2c486', grass: '#5fae4c', grass2: '#4f9a40', dark: '#3f8233' },
      { sand: '#f4e3b0', sand2: '#e6d096', grass: '#55b862', grass2: '#46a052', dark: '#378a44' },
      { sand: '#c9b88a', sand2: '#b5a376', grass: '#4d7e45', grass2: '#416c3a', dark: '#33582e' },
      { sand: '#9d9283', sand2: '#8a7f70', grass: '#5d5470', grass2: '#4f4762', dark: '#3e3750' },
    ][z];
  },
  landN(x, y) { let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (World.tileAt(x + dx, y + dy) === W_LAND) n++; return n; },

  buildChunk(cx, cy) {
    const s = this.chunkScale, size = CH * TILE;
    const c = document.createElement('canvas'); c.width = size * s; c.height = size * s;
    const g = c.getContext('2d');
    const x0 = cx * CH, y0 = cy * CH;
    // agua: imagen diminuta escalada con suavizado (degradado de profundidad)
    const m = document.createElement('canvas'); m.width = CH + 2; m.height = CH + 2;
    const mg = m.getContext('2d'), img = mg.createImageData(CH + 2, CH + 2);
    for (let y = -1; y <= CH; y++) for (let x = -1; x <= CH; x++) {
      const tx = Math.min(WW - 1, Math.max(0, x0 + x)), ty = Math.min(WH - 1, Math.max(0, y0 + y));
      const col = this.waterRGB(ty * WW + tx), o = ((y + 1) * (CH + 2) + x + 1) * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
    mg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(m, 0.5, 0.5, CH + 1, CH + 1, -TILE / 2 * s, -TILE / 2 * s, (CH + 1) * TILE * s, (CH + 1) * TILE * s);
    g.scale(s, s); g.translate(-cx * size, -cy * size);
    // arrecifes y rocas
    for (let y = y0; y < y0 + CH; y++) for (let x = x0; x < x0 + CH; x++) {
      const t = World.tileAt(x, y);
      if (t === W_REEF) {
        for (let k = 0; k < 6; k++) {
          const hx = hash2(x, y, 20 + k), hy = hash2(x, y, 40 + k);
          g.fillStyle = ['#ff8a80', '#ffb74d', '#f06292', '#ce93d8', '#80cbc4', '#fff59d'][k];
          g.globalAlpha = 0.75;
          g.beginPath(); g.arc(x * TILE + 3 + hx * 26, y * TILE + 3 + hy * 26, 2 + hash2(x, y, 60 + k) * 3.5, 0, 6.28); g.fill();
        }
        g.globalAlpha = 1;
      } else if (t === W_ROCK) {
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(x * TILE + 16, y * TILE + 17, 16, 0, 6.28); g.fill();
        g.fillStyle = '#4b4e56'; g.beginPath(); g.arc(x * TILE + 16, y * TILE + 18, 13, 0, 6.28); g.fill();
        g.fillStyle = '#6d717b'; g.beginPath(); g.arc(x * TILE + 14, y * TILE + 15, 10, 0, 6.28); g.fill();
        g.fillStyle = '#8f939d'; g.beginPath(); g.arc(x * TILE + 11, y * TILE + 12, 5, 0, 6.28); g.fill();
      }
    }
    // tierra
    const land = [];
    for (let y = y0 - 1; y < y0 + CH + 1; y++) for (let x = x0 - 1; x < x0 + CH + 1; x++) if (x >= 0 && y >= 0 && x < WW && y < WH && World.tiles[y * WW + x] === W_LAND) land.push([x, y]);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    for (const [x, y] of land) { g.beginPath(); g.arc(x * TILE + 16, y * TILE + 16, TILE * 0.9, 0, 6.28); g.fill(); }
    for (const [x, y] of land) { const lc = this.landColors(World.zone[y * WW + x]); g.fillStyle = lc.sand2; g.beginPath(); g.arc(x * TILE + 16, y * TILE + 17, TILE * 0.78, 0, 6.28); g.fill(); }
    for (const [x, y] of land) { const lc = this.landColors(World.zone[y * WW + x]); g.fillStyle = lc.sand; g.beginPath(); g.arc(x * TILE + 16, y * TILE + 15, TILE * 0.74, 0, 6.28); g.fill(); }
    const isPort = (x, y) => World.ports.find(p => Math.hypot(p.tx - x, p.ty - y) < 6);
    for (const [x, y] of land) {
      if (this.landN(x, y) >= 7) { const lc = this.landColors(World.zone[y * WW + x]); g.fillStyle = lc.grass2; g.beginPath(); g.arc(x * TILE + 16, y * TILE + 18, TILE * 0.76, 0, 6.28); g.fill(); }
    }
    for (const [x, y] of land) {
      if (this.landN(x, y) >= 7) { const lc = this.landColors(World.zone[y * WW + x]); g.fillStyle = lc.grass; g.beginPath(); g.arc(x * TILE + 16, y * TILE + 15, TILE * 0.72, 0, 6.28); g.fill(); }
    }
    // pueblo: plaza empedrada
    for (const p of World.ports) {
      if (Math.abs(p.tx - (x0 + CH / 2)) > CH + 8 || Math.abs(p.ty - (y0 + CH / 2)) > CH + 8) continue;
      g.save();
      g.fillStyle = '#b9a98e'; g.beginPath(); g.ellipse(p.x, p.y, 128, 112, 0, 0, 6.28); g.fill();
      g.fillStyle = '#cbbc9f'; g.beginPath(); g.ellipse(p.x, p.y - 2, 124, 108, 0, 0, 6.28); g.fill();
      g.clip();
      for (let yy = p.y - 115; yy < p.y + 115; yy += 9) for (let xx = p.x - 130 + ((yy / 9) % 2) * 6; xx < p.x + 130; xx += 12) {
        g.fillStyle = hash2(xx | 0, yy | 0, 3) < 0.5 ? '#bfae90' : '#d6c8ad';
        g.fillRect(xx, yy, 10, 7);
      }
      g.restore();
      // camino al muelle
      g.fillStyle = '#c4b393'; g.fillRect(p.x + 60, p.y + 14, 100, 26);
      // pozo central
      g.fillStyle = '#7d7468'; g.beginPath(); g.arc(p.x, p.y, 15, 0, 6.28); g.fill();
      g.fillStyle = '#2c5a7a'; g.beginPath(); g.arc(p.x, p.y, 10, 0, 6.28); g.fill();
      g.strokeStyle = '#5a3a1e'; g.lineWidth = 3; g.beginPath(); g.moveTo(p.x - 14, p.y); g.lineTo(p.x + 14, p.y); g.stroke();
    }
    // vegetación
    for (const [x, y] of land) {
      if (x < x0 || y < y0 || x >= x0 + CH || y >= y0 + CH) continue;
      if (isPort(x, y) && Math.hypot(World.ports.find(p => Math.hypot(p.tx - x, p.ty - y) < 6).tx - x, World.ports.find(p => Math.hypot(p.tx - x, p.ty - y) < 6).ty - y) < 4.3) continue;
      const n = this.landN(x, y), z = World.zone[y * WW + x], lc = this.landColors(z);
      if (n === 9 && hash2(x, y, 3) < 0.4) { g.fillStyle = lc.dark; g.beginPath(); g.arc(x * TILE + 8 + hash2(x, y, 4) * 16, y * TILE + 8 + hash2(x, y, 5) * 16, 5 + hash2(x, y, 6) * 4, 0, 6.28); g.fill(); }
      if (n >= 7 && hash2(x, y, 9) < 0.3) { g.fillStyle = z === 3 ? '#8a6f9a' : ['#ffeb3b', '#ff80ab', '#ffffff'][Math.floor(hash2(x, y, 10) * 3)]; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x * TILE + 6 + hash2(x, y, 11 + k) * 20, y * TILE + 6 + hash2(x, y, 14 + k) * 20, 1.6, 0, 6.28); g.fill(); } }
      if (n <= 6 && n >= 3 && hash2(x, y, 12) < 0.25) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.ellipse(x * TILE + 10 + hash2(x, y, 13) * 12, y * TILE + 18, 5, 2.5, 0, 0, 6.28); g.fill(); g.fillStyle = '#f7efe0'; g.beginPath(); g.arc(x * TILE + 10 + hash2(x, y, 13) * 12, y * TILE + 16, 2.5, 0, 6.28); g.fill(); }
      if (n >= 4 && hash2(x, y, 7) < 0.24) this.palm(g, x * TILE + 16, y * TILE + 16, z, hash2(x, y, 8));
      else if (n === 9 && hash2(x, y, 15) < 0.12) this.bush(g, x * TILE + 16, y * TILE + 16, z);
    }
    return c;
  },
  palm(g, x, y, z, h) {
    const dead = z === 3;
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(x + 7, y + 6, 13, 6, 0, 0, 6.28); g.fill();
    g.strokeStyle = dead ? '#3d3530' : '#7a5230'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y + 6); g.quadraticCurveTo(x + 4, y, x + 3, y - 7); g.stroke();
    g.strokeStyle = dead ? '#2d2620' : '#5a3a1e'; g.lineWidth = 1;
    for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x - 1 + k, y + 4 - k * 4); g.lineTo(x + 3 + k, y + 3 - k * 4); g.stroke(); }
    const leaf = dead ? ['#4b4458', '#3a3448'] : (z === 2 ? ['#3f7a3a', '#2f612b'] : ['#36a84a', '#24873a']);
    for (let k = 0; k < 6; k++) {
      const a = h * 6 + k * 1.047;
      g.fillStyle = leaf[k % 2];
      g.beginPath(); g.ellipse(x + 3 + Math.cos(a) * 8, y - 7 + Math.sin(a) * 8, 10, 3.2, a, 0, 6.28); g.fill();
    }
    if (!dead) { g.fillStyle = '#7a4a1a'; g.beginPath(); g.arc(x + 2, y - 5, 2.2, 0, 6.28); g.arc(x + 5, y - 6, 2.2, 0, 6.28); g.fill(); }
    g.lineCap = 'butt';
  },
  bush(g, x, y, z) {
    const lc = this.landColors(z);
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.beginPath(); g.ellipse(x + 3, y + 5, 11, 5, 0, 0, 6.28); g.fill();
    g.fillStyle = lc.dark; g.beginPath(); g.arc(x - 5, y, 7, 0, 6.28); g.arc(x + 5, y + 1, 7, 0, 6.28); g.arc(x, y - 4, 7, 0, 6.28); g.fill();
    g.fillStyle = lc.grass2; g.beginPath(); g.arc(x - 3, y - 3, 3, 0, 6.28); g.arc(x + 4, y - 2, 3, 0, 6.28); g.fill();
  },
  getChunk(cx, cy) {
    const key = cx + ',' + cy;
    let c = this.chunks.get(key);
    if (c) { this.chunks.delete(key); this.chunks.set(key, c); return c; }
    c = this.buildChunk(cx, cy);
    this.chunks.set(key, c);
    if (this.chunks.size > 60) this.chunks.delete(this.chunks.keys().next().value);
    return c;
  },
  buildMini() {
    if (!World.tiles || !this.depth) return;
    const m = document.createElement('canvas'); m.width = WW; m.height = WH;
    const g = m.getContext('2d'); const img = g.createImageData(WW, WH);
    for (let i = 0; i < WW * WH; i++) {
      const t = World.tiles[i], z = World.zone[i]; let c;
      if (t === W_LAND) c = this.depth && this.landN(i % WW, (i / WW) | 0) >= 7 ? (z === 3 ? [95, 84, 112] : z === 2 ? [77, 126, 69] : [95, 174, 76]) : (z === 3 ? [157, 146, 131] : [239, 216, 160]);
      else if (t === W_ROCK) c = [110, 110, 120];
      else c = this.waterRGB(i);
      img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.mini = m;
  },

  // ---------- Frame ----------
  frame() {
    const ctx = this.ctx;
    const land = G.mode === 'land' && G.hero;
    this.viewZoom += ((land ? 1.55 : 1) - this.viewZoom) * 0.08;
    const zm = this.zoom * this.viewZoom, z = zm * this.dpr;
    const fx = land ? G.hero.x : G.ship.x, fy = land ? G.hero.y : G.ship.y;
    // la cámara se adelanta un poco en la dirección del barco
    const lead = land ? 0 : Math.min(60, G.ship.speed * 0.35);
    const tx = fx + Math.cos(G.ship.angle) * lead, ty = fy + Math.sin(G.ship.angle) * lead;
    if (!this.camInit) { this.cam.x = tx; this.cam.y = ty; this.camInit = true; }
    this.cam.x += (tx - this.cam.x) * 0.12; this.cam.y += (ty - this.cam.y) * 0.12;
    if (Math.hypot(tx - this.cam.x, ty - this.cam.y) > 600) { this.cam.x = tx; this.cam.y = ty; }
    const shx = (Math.random() - 0.5) * G.shake, shy = (Math.random() - 0.5) * G.shake;
    const vw = this.w / zm, vh = this.h / zm;
    const left = this.cam.x - vw / 2, top = this.cam.y - vh / 2;
    this.view = { left, top, vw, vh, zm };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a1422'; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    ctx.setTransform(z, 0, 0, z, (-left + shx) * z, (-top + shy) * z);
    ctx.imageSmoothingEnabled = true;
    const size = CH * TILE;
    const cx0 = Math.floor(left / size), cy0 = Math.floor(top / size), cx1 = Math.floor((left + vw) / size), cy1 = Math.floor((top + vh) / size);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (cx < 0 || cy < 0 || cx * CH >= WW || cy * CH >= WH) continue;
      ctx.drawImage(this.getChunk(cx, cy), cx * size, cy * size, size + 0.6, size + 0.6);
    }
    const t = G.time;
    this.drawWaves(ctx, left, top, vw, vh, t);
    this.drawPOIs(ctx, left, top, vw, vh);
    this.drawPorts(ctx, left, top, vw, vh);
    this.drawLoot(ctx, left, top, vw, vh);
    // estela
    for (const f of G.fx) if (f.type === 'wake') {
      const a = f.life / f.max;
      ctx.fillStyle = 'rgba(255,255,255,' + (a * 0.4) + ')';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (2.2 - a), 0, 6.28); ctx.fill();
    }
    // delfines
    for (const d of G.dolphins) {
      const ph = (d.t % 1.2) / 1.2;
      if (ph > 0.8) continue;
      const k = ph / 0.8, hgt = Math.sin(k * Math.PI) * 18;
      ctx.fillStyle = 'rgba(0,30,60,0.25)'; ctx.beginPath(); ctx.ellipse(d.x, d.y + 4, 12, 4, d.a, 0, 6.28); ctx.fill();
      ctx.save(); ctx.translate(d.x, d.y - hgt); ctx.rotate(d.a);
      ctx.fillStyle = '#5d7d99'; ctx.beginPath(); ctx.ellipse(0, 0, 13, 4.5, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#a9c4d8'; ctx.beginPath(); ctx.ellipse(1, 1.5, 9, 2, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#4a6a85'; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-17, -4); ctx.lineTo(-17, 4); ctx.fill();
      ctx.restore();
    }
    // destino
    if (G.destMark) {
      const d = G.destMark, r = 9 + Math.sin(d.t * 6) * 2;
      ctx.strokeStyle = 'rgba(255,240,180,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, 6.28); ctx.stroke();
      ctx.beginPath(); ctx.arc(d.x, d.y, r * 0.4, 0, 6.28); ctx.stroke();
      const path = land ? G.hero.path : G.path;
      if (path) {
        ctx.setLineDash([5, 9]); ctx.lineDashOffset = -t * 30; ctx.strokeStyle = 'rgba(255,240,180,0.4)';
        ctx.beginPath(); ctx.moveTo(fx, fy); for (const p of path) ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // hundimientos
    for (const s of G.sinking) {
      const k = Math.min(1, s.t / 2.4);
      this.drawShip(ctx, s.x, s.y, s.angle + k * 0.6, s.stage, { enemy: !!s.enemy, etype: s.enemy && s.enemy.type, alpha: 1 - k, sink: k, player: s.player });
    }
    if (G.boss && G.boss.type !== 'ghost') this.drawBoss(ctx, G.boss);
    for (const e of G.enemies) {
      this.drawShip(ctx, e.x, e.y, e.angle, enemyStage(e), { enemy: true, etype: e.type, flash: e.hitT > 0, heel: e.heel, speed: e.speed });
      this.hpBar(ctx, e.x, e.y - 34, 38, e.hp / e.maxHp, e.hp <= e.maxHp * 0.35);
    }
    if (G.boss && G.boss.type === 'ghost') this.drawBoss(ctx, G.boss);
    if (!G.playerSunk) this.drawShip(ctx, G.ship.x, G.ship.y, G.ship.angle, S.stage, { holes: S.holes, flash: G.hitFlash > 0 && G.mode === 'sea', player: true, heel: G.ship.heel, speed: G.ship.speed, anchored: G.mode === 'land' });
    if (G.boarding) {
      const b = G.boarding, e = b.e;
      ctx.strokeStyle = '#c9965a'; ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(G.ship.x + (k - 1) * 8, G.ship.y); ctx.quadraticCurveTo((G.ship.x + e.x) / 2, (G.ship.y + e.y) / 2 - 20, e.x + (k - 1) * 8, e.y); ctx.stroke(); }
    }
    if (land) this.drawLandActors(ctx);
    // balas (con arco y sombra)
    for (const s of G.shots) {
      const p = 1 - s.life / s.max, hgt = Math.sin(p * Math.PI) * 14;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(s.x, s.y, 3.5, 0, 6.28); ctx.fill();
      if (s.acid) { ctx.fillStyle = '#9cff57'; ctx.beginPath(); ctx.arc(s.x, s.y - hgt, 5, 0, 6.28); ctx.fill(); continue; }
      ctx.fillStyle = s.ghost ? '#9fffd8' : (s.crit ? '#5a3a00' : '#1d1d1d'); ctx.beginPath(); ctx.arc(s.x, s.y - hgt, 4, 0, 6.28); ctx.fill();
      ctx.fillStyle = s.crit ? '#ffe082' : 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(s.x - 1.2, s.y - hgt - 1.2, 1.4, 0, 6.28); ctx.fill();
    }
    this.drawFx(ctx);
    for (const s of G.slams) {
      const p = 1 - s.t / 1.3;
      ctx.fillStyle = 'rgba(120,10,40,' + (0.15 + p * 0.3) + ')';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.28); ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,100,0.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * p, 0, 6.28); ctx.stroke();
      ctx.save(); ctx.translate(s.x, s.y); ctx.globalAlpha = p; ctx.fillStyle = '#9c3a6a';
      ctx.beginPath(); ctx.ellipse(0, -60 * (1 - p), 14, 40, 0, 0, 6.28); ctx.fill(); ctx.restore();
    }
    // gaviotas
    for (const gl of G.gulls) {
      const wing = Math.sin(gl.f) * 6;
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(gl.x + 30, gl.y + 40, 5, 2, 0, 0, 6.28); ctx.fill();
      ctx.save(); ctx.translate(gl.x, gl.y); ctx.rotate(gl.a);
      ctx.strokeStyle = '#fafafa'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -8 - wing * 0.3); ctx.quadraticCurveTo(-2, -3, 0, 0); ctx.quadraticCurveTo(-2, 3, 0, 8 + wing * 0.3); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(1, 0, 3.5, 1.6, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#ffb300'; ctx.fillRect(4, -0.5, 2, 1);
      ctx.restore(); ctx.lineCap = 'butt';
    }
    this.drawStorms(ctx, t);
    this.drawClouds(ctx, left, top, vw, vh, t);
    // niebla de guerra
    const fx0 = Math.max(0, Math.floor(left / TILE) - 1), fy0 = Math.max(0, Math.floor(top / TILE) - 1);
    const fx1 = Math.min(WW, Math.ceil((left + vw) / TILE) + 1), fy1 = Math.min(WH, Math.ceil((top + vh) / TILE) + 1);
    if (fx1 > fx0 && fy1 > fy0) ctx.drawImage(this.fog, fx0, fy0, fx1 - fx0, fy1 - fy0, fx0 * TILE, fy0 * TILE, (fx1 - fx0) * TILE, (fy1 - fy0) * TILE);
    // textos flotantes
    ctx.textAlign = 'center';
    for (const tt of G.texts) {
      const a = Math.min(1, tt.life * 1.5), sc = tt.big ? 1 + Math.max(0, tt.life - 1.6) * 1.5 : 1;
      ctx.globalAlpha = a; ctx.font = (tt.big ? '900 17px ' : 'bold 13px ') + 'Georgia, serif';
      ctx.save(); ctx.translate(tt.x, tt.y); ctx.scale(sc, sc);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(tt.text, 0, 0);
      ctx.fillStyle = tt.color; ctx.fillText(tt.text, 0, 0); ctx.restore();
    }
    ctx.globalAlpha = 1;
    // etiquetas de puertos
    ctx.font = 'bold 15px Georgia, serif';
    for (const p of World.ports) {
      if (!isRevealedWorld(p.x, p.y) || land || G.demo) continue;
      const w = ctx.measureText(p.name).width + 18;
      this.banner(ctx, p.x, p.y - 150, w, p.name);
    }
    this.drawLighting(ctx, left, top, zm);
    this.drawScreenFx(t);
    this.drawGuide(left, top, zm);
  },

  banner(ctx, x, y, w, text) {
    ctx.fillStyle = 'rgba(40,22,8,0.75)'; ctx.beginPath(); ctx.moveTo(x - w / 2 - 8, y - 11); ctx.lineTo(x + w / 2 + 8, y - 11); ctx.lineTo(x + w / 2, y + 1); ctx.lineTo(x + w / 2 + 8, y + 12); ctx.lineTo(x - w / 2 - 8, y + 12); ctx.lineTo(x - w / 2, y + 1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c9a35a'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center'; ctx.fillText(text, x, y + 6);
  },

  drawWaves(ctx, left, top, vw, vh, t) {
    const tx0 = Math.max(0, Math.floor(left / TILE)), ty0 = Math.max(0, Math.floor(top / TILE));
    const tx1 = Math.min(WW - 1, Math.ceil((left + vw) / TILE)), ty1 = Math.min(WH - 1, Math.ceil((top + vh) / TILE));
    const wx = Math.cos(G.wind) * t * 6, wy = Math.sin(G.wind) * t * 6;
    const night = nightFactor();
    ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.38 - night * 0.2) + ')';
    ctx.beginPath();
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const i = y * WW + x;
      if (World.tiles[i] !== W_WATER) continue;
      const h = hash2(x, y, 77);
      if (h > 0.16) continue;
      const ph = (t * 0.5 + h * 40) % 3;
      if (ph > 1.8) continue;
      const a = Math.sin(ph / 1.8 * Math.PI);
      const px = x * TILE + 6 + hash2(x, y, 78) * 20 + wx % 16, py = y * TILE + 8 + hash2(x, y, 79) * 16 + wy % 16;
      const L = 3 + a * 5;
      ctx.moveTo(px - L, py); ctx.quadraticCurveTo(px, py - 2.5 * a, px + L, py);
    }
    ctx.stroke();
    // espuma en la orilla
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const i = y * WW + x;
      if (World.tiles[i] !== W_WATER || this.depth[i] !== 1 || hash2(x, y, 81) > 0.5) continue;
      const ph = Math.sin(t * 1.5 + hash2(x, y, 82) * 6);
      if (ph < 0.2) continue;
      const px = x * TILE + 16 + (hash2(x, y, 83) - 0.5) * 14, py = y * TILE + 16 + (hash2(x, y, 84) - 0.5) * 14;
      ctx.moveTo(px - 4 * ph, py); ctx.lineTo(px + 4 * ph, py);
    }
    ctx.stroke();
    // destellos del sol
    if (night < 0.3) {
      ctx.fillStyle = 'rgba(255,255,240,0.8)';
      for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
        if (World.tiles[y * WW + x] !== W_WATER) continue;
        const h = hash2(x, y, 90 + Math.floor(t * 2));
        if (h > 0.02) continue;
        ctx.fillRect(x * TILE + hash2(x, y, 91) * 30, y * TILE + hash2(x, y, 92) * 30, 2, 2);
      }
    }
    ctx.lineCap = 'butt';
  },

  drawClouds(ctx, left, top, vw, vh, t) {
    const cs = 700, ox = t * 12 * Math.cos(G.wind), oy = t * 12 * Math.sin(G.wind);
    const gx0 = Math.floor((left - ox) / cs) - 1, gy0 = Math.floor((top - oy) / cs) - 1;
    for (let gy = gy0; gy < gy0 + Math.ceil(vh / cs) + 3; gy++) for (let gx = gx0; gx < gx0 + Math.ceil(vw / cs) + 3; gx++) {
      if (hash2(gx, gy, 300) > 0.45) continue;
      const x = gx * cs + hash2(gx, gy, 301) * cs + ox, y = gy * cs + hash2(gx, gy, 302) * cs + oy;
      const r = 120 + hash2(gx, gy, 303) * 160;
      ctx.fillStyle = 'rgba(10,20,40,0.07)';
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(x + (hash2(gx, gy, 310 + k) - 0.5) * r, y + (hash2(gx, gy, 320 + k) - 0.5) * r * 0.5, r * 0.6, r * 0.4, 0, 0, 6.28); ctx.fill(); }
    }
  },

  drawStorms(ctx, t) {
    for (const s of G.storms) {
      const gr = ctx.createRadialGradient(s.x, s.y, s.r * 0.2, s.x, s.y, s.r);
      gr.addColorStop(0, 'rgba(15,20,30,0.55)'); gr.addColorStop(1, 'rgba(15,20,30,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.28); ctx.fill();
      ctx.strokeStyle = 'rgba(200,220,255,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k < 50; k++) {
        const a = hash2(k, 1, 3) * 6.28, rr = Math.sqrt(hash2(k, 2, 3)) * s.r * 0.9;
        const yy = ((t * 400 + k * 37) % 60) - 30;
        const x = s.x + Math.cos(a) * rr, y = s.y + Math.sin(a) * rr + yy;
        ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 10);
      }
      ctx.stroke();
    }
  },

  drawFx(ctx) {
    for (const f of G.fx) {
      if (f.type === 'wake') continue;
      const a = Math.max(0, f.life / f.max);
      ctx.globalAlpha = a;
      if (f.type === 'smoke') { ctx.fillStyle = f.color || '#888'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (3 - a * 2) + 2, 0, 6.28); ctx.fill(); }
      else if (f.type === 'debris') {
        ctx.save(); ctx.translate(f.x, f.y - f.z); ctx.rotate(f.rot); ctx.fillStyle = f.color || '#8a5a32'; ctx.fillRect(-4, -1.5, 8, 3); ctx.restore();
        if (f.z > 0) { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(f.x - 3, f.y - 1, 6, 2); }
      }
      else if (f.type === 'ring') { ctx.strokeStyle = f.color; ctx.lineWidth = 3 * a; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - a) + 4, 0, 6.28); ctx.stroke(); }
      else if (f.type === 'flash') { ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(f.x, f.y, 9 * a + 3, 0, 6.28); ctx.fill(); }
      else if (f.type === 'fire') { ctx.fillStyle = a > 0.6 ? '#ffe082' : a > 0.3 ? '#ff8a00' : '#c62828'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.5 + a), 0, 6.28); ctx.fill(); }
      else if (f.type === 'sparkle') { ctx.fillStyle = f.color || '#fff'; const r = 3 * a + 0.5; ctx.fillRect(f.x - r, f.y - 0.6, r * 2, 1.2); ctx.fillRect(f.x - 0.6, f.y - r, 1.2, r * 2); }
      else if (f.type === 'bubble') { ctx.strokeStyle = '#e8f8ff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(f.x, f.y, 2 + (1 - a) * 3, 0, 6.28); ctx.stroke(); }
      else if (f.type === 'foam' || f.type === 'splash') { ctx.fillStyle = f.color || '#fff'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * a + 1, 0, 6.28); ctx.fill(); }
      else { ctx.fillStyle = f.color || '#fff'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * a + 1, 0, 6.28); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  },

  drawLighting(ctx, left, top, zm) {
    const night = nightFactor();
    const t = G.dayT;
    // atardecer / amanecer
    const dusk = Math.max(0, 1 - Math.abs(t - 0.52) / 0.07) + Math.max(0, 1 - Math.abs(t - 0.98) / 0.06) + Math.max(0, 1 - Math.abs(t + 0.02) / 0.06);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (dusk > 0) { ctx.fillStyle = 'rgba(255,120,40,' + Math.min(0.18, dusk * 0.18) + ')'; ctx.fillRect(0, 0, this.cv.width, this.cv.height); }
    if (night <= 0.02) return;
    const L = this.lctx, lw = this.light.width, lh = this.light.height, k = zm / 2;
    L.globalCompositeOperation = 'source-over';
    L.clearRect(0, 0, lw, lh);
    L.fillStyle = 'rgba(8,14,40,' + (night * 0.68) + ')'; L.fillRect(0, 0, lw, lh);
    L.globalCompositeOperation = 'destination-out';
    const light = (wx, wy, r, s) => {
      const x = (wx - left) * k, y = (wy - top) * k, rr = r * k;
      if (x < -rr || y < -rr || x > lw + rr || y > lh + rr) return;
      const g = L.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, 'rgba(0,0,0,' + s + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
      L.fillStyle = g; L.beginPath(); L.arc(x, y, rr, 0, 6.28); L.fill();
    };
    light(G.ship.x, G.ship.y, 200 + S.stage * 20, 0.95);
    if (G.mode === 'land' && G.hero) light(G.hero.x, G.hero.y, 170, 1);
    for (const p of World.ports) { light(p.x, p.y, 330, 0.9); light(p.x + 7 * TILE, p.y + TILE, 120, 0.8); }
    for (const e of G.enemies) light(e.x, e.y, 90, 0.7);
    if (G.boss) light(G.boss.x, G.boss.y, 160, 0.6);
    for (const f of G.fx) if (f.type === 'fire' || f.type === 'flash') light(f.x, f.y, 70, 0.6);
    for (const l of G.loot) if (l.kind === 'rare' || l.kind === 'diamond') light(l.x, l.y, 40, 0.5);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.light, 0, 0, this.cv.width, this.cv.height);
    // brillo cálido de faroles
    ctx.globalCompositeOperation = 'lighter';
    const glow = (wx, wy, r, col) => {
      const x = (wx - left) * zm * this.dpr, y = (wy - top) * zm * this.dpr, rr = r * zm * this.dpr;
      if (x < -rr || y < -rr || x > this.cv.width + rr || y > this.cv.height + rr) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    };
    const a = night * 0.35;
    const sl = SHIPS[S.stage].len;
    glow(G.ship.x - Math.cos(G.ship.angle) * sl * 0.45, G.ship.y - Math.sin(G.ship.angle) * sl * 0.45, 60, 'rgba(255,170,60,' + a + ')');
    for (const p of World.ports) { glow(p.x, p.y, 160, 'rgba(255,160,60,' + a * 0.8 + ')'); }
    for (const e of G.enemies) glow(e.x, e.y, 40, 'rgba(255,120,40,' + a + ')');
    if (G.mode === 'land' && G.hero) glow(G.hero.x, G.hero.y, 50, 'rgba(255,170,60,' + a + ')');
    ctx.globalCompositeOperation = 'source-over';
  },

  drawScreenFx(t) {
    const ctx = this.ctx; ctx.setTransform(1, 0, 0, 1, 0, 0);
    const W = this.cv.width, H = this.cv.height;
    const zn = G.curZone;
    if (zn === 3) { ctx.fillStyle = 'rgba(80,30,120,' + (0.12 + Math.sin(t * 0.8) * 0.05) + ')'; ctx.fillRect(0, 0, W, H); }
    else if (zn === 2) { ctx.fillStyle = 'rgba(10,20,40,0.12)'; ctx.fillRect(0, 0, W, H); }
    if (G.inStorm && G.mode === 'sea') {
      ctx.fillStyle = 'rgba(10,15,25,0.3)'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(200,220,255,0.4)'; ctx.lineWidth = this.dpr;
      ctx.beginPath();
      for (let k = 0; k < 90; k++) {
        const x = (hash2(k, 5, 1) * W + t * 120) % W, y = (hash2(k, 6, 1) * H + t * 900) % H;
        ctx.moveTo(x, y); ctx.lineTo(x - 4 * this.dpr, y + 14 * this.dpr);
      }
      ctx.stroke();
    }
    if (G.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + G.flash * 0.5 + ')'; ctx.fillRect(0, 0, W, H); }
    // viñeta suave
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    const hpLow = G.mode === 'sea' ? S.hp < stats().maxHp * 0.25 : (G.hero && G.hero.hp < 30);
    if (G.hitFlash > 0 || hpLow) {
      const a = G.hitFlash > 0 ? 0.45 : 0.18 + Math.sin(t * 5) * 0.08;
      const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      gr.addColorStop(0, 'rgba(200,0,0,0)'); gr.addColorStop(1, 'rgba(200,0,0,' + a + ')');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
  },

  // flecha guía al objetivo
  drawGuide(left, top, zm) {
    if (G.demo || UI.modal) return;
    const o = objectiveTarget(); if (!o) return;
    const ctx = this.ctx, d = this.dpr;
    const sx = (o.x - left) * zm, sy = (o.y - top) * zm;
    const W = this.w, H = this.h, m = 50;
    if (sx > m && sx < W - m && sy > m + 30 && sy < H - m) {
      ctx.setTransform(d, 0, 0, d, 0, 0);
      const b = Math.sin(G.time * 5) * 4;
      ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#3b2414'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx, sy - 18 + b); ctx.lineTo(sx - 9, sy - 32 + b); ctx.lineTo(sx + 9, sy - 32 + b); ctx.closePath(); ctx.fill(); ctx.stroke();
      return;
    }
    const cx = W / 2, cy = H / 2, ang = Math.atan2(sy - cy, sx - cx);
    let ex = cx + Math.cos(ang) * 1000, ey = cy + Math.sin(ang) * 1000;
    const kx = (W / 2 - 60) / Math.abs(ex - cx || 1), ky = (H / 2 - 60) / Math.abs(ey - cy || 1), kk = Math.min(kx, ky);
    ex = cx + (ex - cx) * kk; ey = cy + (ey - cy) * kk;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang);
    const p = 1 + Math.sin(G.time * 4) * 0.1; ctx.scale(p, p);
    ctx.fillStyle = 'rgba(20,10,0,0.55)'; ctx.beginPath(); ctx.arc(0, 0, 18, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#3b2414'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(2, -10); ctx.lineTo(5, 0); ctx.lineTo(2, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    const dist = Math.round(Math.hypot(o.x - (G.mode === 'land' && G.hero ? G.hero.x : G.ship.x), o.y - (G.mode === 'land' && G.hero ? G.hero.y : G.ship.y)) / TILE);
    ctx.font = 'bold 11px Georgia, serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#000';
    ctx.strokeText(dist + ' m', ex - Math.cos(ang) * 30, ey - Math.sin(ang) * 30 + 4); ctx.fillStyle = '#ffe9b0'; ctx.fillText(dist + ' m', ex - Math.cos(ang) * 30, ey - Math.sin(ang) * 30 + 4);
  },

  hpBar(ctx, x, y, w, f, boardable) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
    ctx.fillStyle = f > 0.5 ? '#5ad15a' : f > 0.25 ? '#e8c64a' : '#e85a4a';
    ctx.fillRect(x - w / 2, y, w * Math.max(0, f), 4);
    if (boardable) { drawIcon(ctx, 'sword', x + w / 2 + 8, y + 2, 12 + Math.sin(G.time * 8) * 2); }
  },

  drawShip(ctx, x, y, ang, stage, o) {
    const sh = SHIPS[stage], L = sh.len, Wd = sh.wid;
    const bob = Math.sin(G.time * 2 + x * 0.01) * 0.6;
    ctx.save(); ctx.translate(x, y + bob);
    if (o.sink) ctx.scale(1 - o.sink * 0.3, 1 - o.sink * 0.3);
    ctx.fillStyle = 'rgba(0,20,40,0.25)'; ctx.beginPath(); ctx.ellipse(5, 7, L * 0.55, Wd * 0.62, ang, 0, 6.28); ctx.fill();
    if (o.speed > 40) { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(Math.cos(ang) * L * 0.42, Math.sin(ang) * L * 0.42, 5, Wd * 0.5, ang, -1.2, 1.2); ctx.stroke(); }
    ctx.rotate(ang);
    if (o.alpha !== undefined) ctx.globalAlpha = Math.max(0, o.alpha);
    const heel = o.heel || 0;
    const hull = (sc) => {
      const l = L * sc, w = Wd * sc;
      ctx.beginPath(); ctx.moveTo(l / 2, 0);
      ctx.quadraticCurveTo(l * 0.25, -w / 2, -l * 0.3, -w / 2); ctx.lineTo(-l / 2, -w * 0.38);
      ctx.lineTo(-l / 2, w * 0.38); ctx.lineTo(-l * 0.3, w / 2); ctx.quadraticCurveTo(l * 0.25, w / 2, l / 2, 0); ctx.closePath();
    };
    let hc = '#7a4b27', hc2 = '#9a6436', dc = '#c8955e', sc = '#f6eedb', trim = '#3d240f';
    if (o.enemy) { hc = '#3b2a1e'; hc2 = '#4f3a2a'; dc = '#6b5038'; sc = (ENEMY_TYPES[o.etype] || ENEMY_TYPES.balandra).sail; trim = '#150e08'; }
    if (o.ghost) { hc = '#2f5a52'; hc2 = '#3e7468'; dc = '#4b8a7c'; sc = 'rgba(190,255,230,0.55)'; trim = '#9fffd8'; }
    if (o.player && stage === 4) trim = '#d4a72c';
    if (o.flash) { hc = '#ff6b6b'; hc2 = '#ff8b8b'; dc = '#ffaaaa'; }
    // casco con degradado
    const gr = ctx.createLinearGradient(0, -Wd / 2, 0, Wd / 2);
    gr.addColorStop(0, hc2); gr.addColorStop(0.5 + heel * 0.5, hc); gr.addColorStop(1, hc);
    hull(1); ctx.fillStyle = gr; ctx.fill(); ctx.lineWidth = stage >= 3 ? 2.5 : 2; ctx.strokeStyle = trim; ctx.stroke();
    if (o.etype === 'bruto') { ctx.fillStyle = '#888'; ctx.beginPath(); ctx.moveTo(L / 2 + 8, 0); ctx.lineTo(L / 2 - 4, -4); ctx.lineTo(L / 2 - 4, 4); ctx.fill(); }
    ctx.save(); hull(0.8); ctx.fillStyle = dc; ctx.fill(); ctx.restore();
    ctx.strokeStyle = 'rgba(60,35,15,0.3)'; ctx.lineWidth = 1;
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(-L * 0.36, k * Wd * 0.09); ctx.lineTo(L * 0.3, k * Wd * 0.07); ctx.stroke(); }
    // cañones a los lados
    const nc = Math.min(4, Math.ceil(sh.cannons / 2));
    ctx.fillStyle = '#222';
    for (let k = 0; k < nc; k++) { const cx = -L * 0.2 + k * (L * 0.4 / Math.max(1, nc - 1 || 1)); ctx.fillRect(cx - 2, -Wd / 2 - 2, 4, 3); ctx.fillRect(cx - 2, Wd / 2 - 1, 4, 3); }
    if (stage === 0 && !o.enemy) { ctx.fillStyle = '#c9a06a'; ctx.fillRect(-8, -5, 6, 5); ctx.fillRect(4, 1, 5, 4); ctx.fillStyle = '#6e4524'; ctx.fillRect(-12, 2, 4, 3); }
    if (o.holes) {
      for (let k = 0; k < Math.min(o.holes, 10); k++) {
        const hx = (hash2(k, 1, 11) - 0.5) * L * 0.7, hy = (hash2(k, 2, 11) - 0.5) * Wd * 0.6;
        ctx.fillStyle = '#1b0f06'; ctx.beginPath(); ctx.arc(hx, hy, 2.4, 0, 6.28); ctx.fill();
        ctx.fillStyle = 'rgba(120,200,255,0.6)'; ctx.beginPath(); ctx.arc(hx, hy, 1.2 + Math.sin(G.time * 6 + k) * 0.5, 0, 6.28); ctx.fill();
      }
    }
    if (stage >= 3) { ctx.fillStyle = trim; ctx.fillRect(-L / 2, -Wd * 0.3, L * 0.18, Wd * 0.6); ctx.fillStyle = '#ffe9a0'; ctx.fillRect(-L / 2 + 2, -Wd * 0.2, 2, 2); ctx.fillRect(-L / 2 + 2, Wd * 0.1, 2, 2); }
    if (stage === 4) { ctx.fillStyle = '#d4a72c'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(-L * 0.3 + k * L * 0.18, -Wd * 0.46, 1.8, 0, 6.28); ctx.arc(-L * 0.3 + k * L * 0.18, Wd * 0.46, 1.8, 0, 6.28); ctx.fill(); } }
    // mástiles y velas (se hinchan con el viento)
    const masts = [1, 1, 2, 3, 3][stage];
    const rel = angDiff(ang, G.wind);
    const billow = o.anchored ? 0.15 : 0.55 + Math.cos(rel) * 0.3 + Math.sin(G.time * 3 + x) * 0.04;
    const furl = o.anchored ? 0.45 : 1;
    for (let m = 0; m < masts; m++) {
      const mx = masts === 1 ? L * 0.05 : -L * 0.25 + m * (L * 0.55 / (masts - 1));
      const sw = Wd * (stage === 0 ? 1.15 : 1.5) * (m === 1 && masts === 3 ? 1.12 : 1) * furl;
      const bulge = Wd * billow;
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath(); ctx.moveTo(mx + 2, -sw / 2 + 3); ctx.quadraticCurveTo(mx + bulge + 3, 3, mx + 2, sw / 2 + 3); ctx.lineTo(mx - 1, sw / 2 + 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = sc;
      ctx.beginPath(); ctx.moveTo(mx - 2, -sw / 2); ctx.quadraticCurveTo(mx + bulge, 0, mx - 2, sw / 2); ctx.lineTo(mx - 5, sw / 2); ctx.quadraticCurveTo(mx + bulge * 0.5, 0, mx - 5, -sw / 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.moveTo(mx - 3, -sw * 0.25); ctx.quadraticCurveTo(mx + bulge * 0.75, 0, mx - 3, sw * 0.25); ctx.stroke();
      if (o.enemy && !o.ghost && m === masts - 1 || (masts === 1 && o.enemy && !o.ghost)) drawIcon(ctx, 'skull', mx + bulge * 0.35, 0, Math.min(10, Wd * 0.5));
      if (o.player && stage >= 2 && m === Math.floor(masts / 2)) { ctx.fillStyle = '#b5462f'; ctx.fillRect(mx + bulge * 0.2, -2, 3, 4); }
      ctx.fillStyle = '#4a2c14'; ctx.beginPath(); ctx.arc(mx - 3, 0, 2.6, 0, 6.28); ctx.fill();
    }
    // bandera
    const fw = Math.sin(G.time * 9 + x) * 2;
    ctx.fillStyle = o.enemy ? '#111' : (o.player ? '#1a1a1a' : '#111');
    ctx.beginPath(); ctx.moveTo(-L / 2, -1); ctx.quadraticCurveTo(-L / 2 - 5, -3 + fw, -L / 2 - 11, -3 + fw * 1.5); ctx.lineTo(-L / 2 - 11, 4 + fw * 1.5); ctx.quadraticCurveTo(-L / 2 - 5, 4 + fw, -L / 2, 3); ctx.closePath(); ctx.fill();
    if (o.enemy) { ctx.fillStyle = '#e53935'; ctx.fillRect(-L / 2 - 8, -0.5 + fw, 3, 2); } else { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-L / 2 - 6, 0.5 + fw * 1.2, 1.5, 0, 6.28); ctx.fill(); }
    // farol de popa
    if (nightFactor() > 0.1) { ctx.fillStyle = '#ffcf6b'; ctx.beginPath(); ctx.arc(-L / 2 + 3, 0, 2.2, 0, 6.28); ctx.fill(); }
    if (o.anchored) { ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L * 0.4, Wd * 0.3); ctx.lineTo(L * 0.55, Wd * 0.7); ctx.stroke(); }
    ctx.restore();
  },

  drawBoss(ctx, b) {
    const t = G.time, rise = b.rise === undefined ? 1 : b.rise;
    ctx.globalAlpha = Math.min(1, rise * 1.5);
    if (b.type === 'serpent') {
      for (let i = b.trail.length - 1; i >= 0; i -= 3) {
        const p = b.trail[i], r = 16 * (1 - i / 80) + 4;
        const submerged = Math.sin(i * 0.25 - t * 4) < -0.3;
        if (submerged) { ctx.fillStyle = 'rgba(30,90,60,0.35)'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.28); ctx.fill(); continue; }
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.arc(p.x + 4, p.y + 5, r, 0, 6.28); ctx.fill();
        ctx.fillStyle = i % 6 === 0 ? '#2e8b47' : '#3fae5a'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#7ad67f'; ctx.beginPath(); ctx.arc(p.x - r * 0.3, p.y - r * 0.3, r * 0.35, 0, 6.28); ctx.fill();
        if (i % 9 === 0) { ctx.fillStyle = '#c62828'; ctx.beginPath(); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x - 4, p.y - r - 8); ctx.lineTo(p.x + 4, p.y - r - 6); ctx.fill(); }
      }
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
      if (b.state === 'tell') ctx.translate(-4 + Math.sin(t * 40) * 2, 0);
      ctx.fillStyle = b.hitT > 0 ? '#ff7b7b' : '#2e8b47';
      ctx.beginPath(); ctx.ellipse(6, 0, 28, 18, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#ffeb3b'; ctx.beginPath(); ctx.arc(16, -9, 4.5, 0, 6.28); ctx.arc(16, 9, 4.5, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(17, -9, 1.5, 3.5, 0, 0, 6.28); ctx.ellipse(17, 9, 1.5, 3.5, 0, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#c62828'; ctx.lineWidth = 2; const fl = Math.sin(t * 20) * 3; ctx.beginPath(); ctx.moveTo(32, 0); ctx.lineTo(42, -4 + fl); ctx.moveTo(32, 0); ctx.lineTo(42, 4 + fl); ctx.stroke();
      ctx.restore();
    } else if (b.type === 'kraken') {
      ctx.lineCap = 'round';
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * 6.28 + Math.sin(t + k) * 0.2;
        for (const [col, w] of [['#6e2348', 16], [b.hitT > 0 ? '#ff8a9a' : '#9c3a6a', 12]]) {
          ctx.strokeStyle = col; ctx.lineWidth = w * rise;
          ctx.beginPath(); ctx.moveTo(b.x, b.y);
          for (let s = 1; s <= 7; s++) {
            const rr = s * 22 * rise, w2 = Math.sin(t * 2 + s * 0.8 + k) * 14;
            ctx.lineTo(b.x + Math.cos(a) * rr + Math.cos(a + 1.57) * w2, b.y + Math.sin(a) * rr + Math.sin(a + 1.57) * w2);
          }
          ctx.stroke();
        }
      }
      ctx.lineCap = 'butt';
      const gr = ctx.createRadialGradient(b.x - 15, b.y - 20, 5, b.x, b.y, 60);
      gr.addColorStop(0, b.hitT > 0 ? '#ffb3c6' : '#e06a9c'); gr.addColorStop(1, b.hitT > 0 ? '#ff7b9b' : '#8e2d5a');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(b.x, b.y, 58 * rise, 0, 6.28); ctx.fill();
      const blink = Math.sin(t * 0.7) > 0.97 ? 0.2 : 1;
      ctx.fillStyle = '#ffe082'; ctx.beginPath(); ctx.ellipse(b.x - 20, b.y - 10, 12, 12 * blink, 0, 0, 6.28); ctx.ellipse(b.x + 20, b.y - 10, 12, 12 * blink, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(b.x - 20, b.y - 10, 3, 9 * blink, 0, 0, 6.28); ctx.ellipse(b.x + 20, b.y - 10, 3, 9 * blink, 0, 0, 6.28); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(b.x, b.y, 62 + Math.sin(t * 3) * 4, 0, 6.28); ctx.stroke();
    } else {
      this.drawShip(ctx, b.x, b.y, b.angle, 4, { enemy: true, ghost: true, alpha: (0.55 + Math.sin(t * 3) * 0.15) * b.alpha, flash: b.hitT > 0, speed: 150 });
    }
    ctx.globalAlpha = 1;
    this.hpBar(ctx, b.x, b.y - (b.type === 'kraken' ? 95 : 52), 90, b.hp / b.maxHp);
  },

  drawPOIs(ctx, left, top, vw, vh) {
    const inView = (x, y) => x > left - 80 && x < left + vw + 80 && y > top - 80 && y < top + vh + 80;
    const t = G.time;
    for (const w of World.wrecks) {
      if (!inView(w.x, w.y)) continue;
      const done = S.wrecks[w.id];
      ctx.globalAlpha = done ? 0.35 : 1;
      ctx.fillStyle = 'rgba(10,25,40,0.45)'; ctx.beginPath(); ctx.ellipse(w.x, w.y, 30, 12, 0.5, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#4a3020'; ctx.beginPath(); ctx.ellipse(w.x + 4, w.y + 2, 14, 5, 0.5, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(w.x - 6, w.y + 6); ctx.lineTo(w.x + 10, w.y - 18); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w.x + 3, w.y - 7); ctx.lineTo(w.x + 15, w.y - 4); ctx.stroke();
      ctx.fillStyle = 'rgba(230,220,190,0.8)'; ctx.beginPath(); ctx.moveTo(w.x + 9, w.y - 16); ctx.lineTo(w.x + 16, w.y - 9); ctx.lineTo(w.x + 7, w.y - 8); ctx.fill();
      if (!done) for (let k = 0; k < 3; k++) { const ph = (t * 0.8 + k / 3) % 1; ctx.strokeStyle = 'rgba(255,255,255,' + (1 - ph) * 0.7 + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(w.x - 10 + k * 6, w.y - ph * 14, 1.5 + ph * 2, 0, 6.28); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    for (const c of World.caves) {
      if (!inView(c.x, c.y)) continue;
      ctx.globalAlpha = S.caves[c.id] ? 0.45 : 1;
      ctx.fillStyle = '#5e554a'; ctx.beginPath(); ctx.ellipse(c.x, c.y + 4, 22, 16, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#7d7366'; ctx.beginPath(); ctx.ellipse(c.x - 4, c.y, 16, 12, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#0d0b09'; ctx.beginPath(); ctx.ellipse(c.x, c.y + 5, 10, 10, 0, Math.PI, 0); ctx.fill();
      if (!S.caves[c.id] && nightFactor() > 0.3) { ctx.fillStyle = 'rgba(255,200,80,0.4)'; ctx.beginPath(); ctx.arc(c.x, c.y + 2, 4, 0, 6.28); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    for (const d of World.digs) {
      if (S.dug[d.id] || !inView(d.x, d.y)) continue;
      ctx.fillStyle = 'rgba(120,90,50,0.35)'; ctx.beginPath(); ctx.ellipse(d.x, d.y + 2, 9, 5, 0, 0, 6.28); ctx.fill();
      const ph = (t * 1.3 + d.id * 0.37) % 2.2;
      if (ph < 0.6) { const a = Math.sin(ph / 0.6 * Math.PI); ctx.fillStyle = 'rgba(255,240,170,' + a + ')'; const r = 6 * a; ctx.fillRect(d.x - r, d.y - 0.8, r * 2, 1.6); ctx.fillRect(d.x - 0.8, d.y - r, 1.6, r * 2); }
      if (d.hinted) { ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(d.x - 5, d.y - 5); ctx.lineTo(d.x + 5, d.y + 5); ctx.moveTo(d.x + 5, d.y - 5); ctx.lineTo(d.x - 5, d.y + 5); ctx.stroke(); }
    }
    for (const x of World.xmarks) {
      if (S.pieces[x.map] < 3 || S.xDug[x.map] || !inView(x.x, x.y)) continue;
      const p = 1 + Math.sin(t * 4) * 0.15;
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 7 * p; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x.x - 10, x.y - 8); ctx.lineTo(x.x + 10, x.y + 12); ctx.moveTo(x.x + 10, x.y - 8); ctx.lineTo(x.x - 10, x.y + 12); ctx.stroke();
      ctx.strokeStyle = '#d32f2f'; ctx.lineWidth = 5 * p;
      ctx.beginPath(); ctx.moveTo(x.x - 10, x.y - 10); ctx.lineTo(x.x + 10, x.y + 10); ctx.moveTo(x.x + 10, x.y - 10); ctx.lineTo(x.x - 10, x.y + 10); ctx.stroke();
      ctx.lineCap = 'butt';
    }
  },

  drawPorts(ctx, left, top, vw, vh) {
    const night = nightFactor();
    for (const p of World.ports) {
      if (Math.abs(p.x - (left + vw / 2)) > vw / 2 + 300 || Math.abs(p.y - (top + vh / 2)) > vh / 2 + 300) continue;
      const r = Land.dockRect(p);
      // muelle
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(r.x0 + 4, r.y0 + 5, r.x1 - r.x0, r.y1 - r.y0);
      ctx.fillStyle = '#8a5a30'; ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
      ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 1;
      for (let xx = r.x0; xx < r.x1; xx += 7) { ctx.beginPath(); ctx.moveTo(xx, r.y0); ctx.lineTo(xx, r.y1); ctx.stroke(); }
      ctx.fillStyle = '#4a2c14'; for (let xx = r.x0 + 30; xx < r.x1; xx += 30) { ctx.beginPath(); ctx.arc(xx, r.y0 - 1, 3, 0, 6.28); ctx.arc(xx, r.y1 + 1, 3, 0, 6.28); ctx.fill(); }
      // barriles y cajas en el muelle
      ctx.fillStyle = '#7a4a1a'; ctx.beginPath(); ctx.arc(r.x0 + 18, r.y0 + 5, 5, 0, 6.28); ctx.fill(); ctx.fillStyle = '#a8702f'; ctx.fillRect(r.x0 + 26, r.y1 - 10, 9, 9);
      // farolas
      for (const [lx, ly] of [[p.x + 40, p.y + 40], [p.x - 50, p.y - 10], [p.x + 30, p.y - 50], [r.x1 - 6, r.y0]]) {
        ctx.fillStyle = '#333'; ctx.fillRect(lx - 1.5, ly - 10, 3, 12);
        ctx.fillStyle = night > 0.2 ? '#ffd27a' : '#c9c2a8'; ctx.beginPath(); ctx.arc(lx, ly - 11, 3.5, 0, 6.28); ctx.fill();
      }
      // edificios
      for (const b of World.buildings) if (b.port === p.id) this.drawBuilding(ctx, b, p);
      if (G.raid && G.raid.port === p.id && rnd() < 0.3) addFx('smoke', p.x + (rnd() - 0.5) * 120, p.y + (rnd() - 0.5) * 80, 1, '#444', 0.3);
      // bandera de taberna propia
      if (S.taverns[p.id]) { const tb = World.buildings.find(b => b.port === p.id && b.def.id === 'taberna'); if (tb) { ctx.fillStyle = '#f5c542'; ctx.beginPath(); ctx.moveTo(tb.x + tb.w / 2 - 4, tb.y - tb.h / 2 - 22); ctx.lineTo(tb.x + tb.w / 2 + 10, tb.y - tb.h / 2 - 18 + Math.sin(G.time * 5)); ctx.lineTo(tb.x + tb.w / 2 - 4, tb.y - tb.h / 2 - 13); ctx.fill(); ctx.strokeStyle = '#333'; ctx.beginPath(); ctx.moveTo(tb.x + tb.w / 2 - 4, tb.y - tb.h / 2 - 22); ctx.lineTo(tb.x + tb.w / 2 - 4, tb.y - tb.h / 2 + 4); ctx.stroke(); } }
    }
  },
  drawBuilding(ctx, b, p) {
    const x = b.x - b.w / 2, y = b.y - b.h / 2, roof = p.def.roof;
    const near = G.mode === 'land' && G.nearby && G.nearby.obj === b;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 6, y + 8, b.w, b.h);
    // pared frontal
    const wallH = 16;
    ctx.fillStyle = b.def.id === 'taberna' ? '#d9c39a' : '#efe4c8'; ctx.fillRect(x, y + b.h - wallH, b.w, wallH);
    ctx.strokeStyle = 'rgba(80,50,20,0.35)'; ctx.strokeRect(x, y + b.h - wallH, b.w, wallH);
    // vigas
    ctx.fillStyle = '#6b4423'; ctx.fillRect(x, y + b.h - wallH, 3, wallH); ctx.fillRect(x + b.w - 3, y + b.h - wallH, 3, wallH);
    // ventanas
    const night = nightFactor();
    ctx.fillStyle = night > 0.2 ? '#ffd27a' : '#6ab0d8';
    ctx.fillRect(x + 7, y + b.h - wallH + 4, 8, 7); ctx.fillRect(x + b.w - 15, y + b.h - wallH + 4, 8, 7);
    // puerta
    ctx.fillStyle = near ? '#c98a3e' : '#6b4423'; ctx.fillRect(b.x - 6, y + b.h - 13, 12, 13);
    ctx.fillStyle = '#d4a72c'; ctx.fillRect(b.x + 3, y + b.h - 7, 2, 2);
    // tejado
    const gr = ctx.createLinearGradient(0, y - 6, 0, y + b.h - wallH);
    gr.addColorStop(0, this.shade(roof, 30)); gr.addColorStop(1, this.shade(roof, -30));
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(x - 4, y + b.h - wallH); ctx.lineTo(x + 6, y - 6); ctx.lineTo(x + b.w - 6, y - 6); ctx.lineTo(x + b.w + 4, y + b.h - wallH); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = this.shade(roof, -50); ctx.lineWidth = 1;
    for (let k = 1; k < 5; k++) { const yy = y - 6 + (b.h - wallH + 6) * k / 5; ctx.beginPath(); ctx.moveTo(x - 4 + 10 * (1 - k / 5), yy); ctx.lineTo(x + b.w + 4 - 10 * (1 - k / 5), yy); ctx.stroke(); }
    ctx.fillStyle = this.shade(roof, -40); ctx.fillRect(x + 6, y - 8, b.w - 12, 3);
    // chimenea
    if (b.def.id === 'taberna' || b.def.id === 'tienda') { ctx.fillStyle = '#7d6a5a'; ctx.fillRect(x + b.w - 16, y - 12, 7, 12); if (rnd() < 0.05) addFx('smoke', x + b.w - 12, y - 14, 1, '#aaa', 0.1); }
    // letrero con icono
    ctx.fillStyle = '#3b2414'; ctx.fillRect(b.x - 11, y + b.h - wallH - 13, 22, 15);
    ctx.strokeStyle = '#c9a35a'; ctx.lineWidth = 1.5; ctx.strokeRect(b.x - 11, y + b.h - wallH - 13, 22, 15);
    drawIcon(ctx, b.def.icon, b.x, y + b.h - wallH - 5.5, 12);
    if (G.mode === 'land') {
      ctx.font = 'bold 9px Georgia, serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; const tw = ctx.measureText(b.def.name).width + 8; ctx.fillRect(b.x - tw / 2, y - 22, tw, 12);
      ctx.fillStyle = '#ffe9b0'; ctx.fillText(b.def.name, b.x, y - 13);
    }
    if (near) { ctx.strokeStyle = 'rgba(255,230,140,' + (0.6 + Math.sin(G.time * 6) * 0.3) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(b.doorX, b.doorY - 2, 12, 5, 0, 0, 6.28); ctx.stroke(); }
  },
  shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amt)), g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt)), b = Math.max(0, Math.min(255, (n & 255) + amt));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  },

  drawLoot(ctx, left, top, vw, vh) {
    const t = G.time;
    for (const b of G.barrels) {
      if (b.x < left - 30 || b.x > left + vw + 30 || b.y < top - 30 || b.y > top + vh + 30) continue;
      const bb = Math.sin(t * 2 + b.bob) * 2;
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(b.x, b.y + 6, 12, 4, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#a3241c'; ctx.beginPath(); ctx.ellipse(b.x, b.y + bb, 8, 10, 0, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(b.x - 8, b.y - 4 + bb); ctx.lineTo(b.x + 8, b.y - 4 + bb); ctx.moveTo(b.x - 8, b.y + 4 + bb); ctx.lineTo(b.x + 8, b.y + 4 + bb); ctx.stroke();
      ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', b.x, b.y + 3 + bb);
    }
    for (const l of G.loot) {
      if (l.x < left - 30 || l.x > left + vw + 30 || l.y < top - 30 || l.y > top + vh + 30) continue;
      const bb = Math.sin(t * 2.5 + l.bob) * 2, pop = l.pop ? -Math.sin(l.pop * Math.PI) * 20 : 0;
      const x = l.x, y = l.y + bb + pop;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, l.y + 7, 12 + Math.sin(t * 2 + l.bob) * 2, 4, 0, 0, 6.28); ctx.stroke();
      if (l.kind === 'piece') { drawIcon(ctx, 'scroll', x, y, 20); continue; }
      if (l.kind === 'bottle') { ctx.save(); ctx.translate(x, y); ctx.rotate(0.6 + Math.sin(t + l.bob) * 0.3); drawIcon(ctx, 'bottle', 0, 0, 18); ctx.restore(); continue; }
      const it = ITEMS[l.kind];
      if (l.kind === 'rare' || l.kind === 'diamond' || l.kind === 'ruby') { ctx.fillStyle = it.color + '44'; ctx.beginPath(); ctx.arc(x, y, 15 + Math.sin(t * 4 + l.bob) * 2, 0, 6.28); ctx.fill(); }
      if (l.kind === 'coins') {
        ctx.fillStyle = '#7a4a22'; ctx.beginPath(); ctx.ellipse(x, y, 8, 10, 0, 0, 6.28); ctx.fill();
        ctx.strokeStyle = '#3b2a1e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 8, y - 3); ctx.lineTo(x + 8, y - 3); ctx.moveTo(x - 8, y + 3); ctx.lineTo(x + 8, y + 3); ctx.stroke();
        drawIcon(ctx, 'coin', x, y - 7, 10);
      } else drawIcon(ctx, it.icon, x, y, l.kind === 'rare' || l.kind === 'chest' ? 22 : 18);
      if (hash2(Math.floor(t * 2), Math.floor(l.x), 1) < 0.15) { ctx.fillStyle = '#fff'; ctx.fillRect(x + 6, y - 10, 2, 2); }
    }
  },

  // ---------- Personajes en tierra ----------
  drawPirate(ctx, x, y, dir, walkT, moving, o) {
    const step = moving ? Math.sin(walkT) : 0;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(1, 7, 8, 4, 0, 0, 6.28); ctx.fill();
    ctx.rotate(dir);
    // pies
    ctx.fillStyle = '#2a1a0c';
    ctx.beginPath(); ctx.ellipse(step * 4, -4, 3.5, 2.5, 0, 0, 6.28); ctx.ellipse(-step * 4, 4, 3.5, 2.5, 0, 0, 6.28); ctx.fill();
    // cuerpo
    ctx.fillStyle = o.coat || '#7a1f1f'; ctx.beginPath(); ctx.ellipse(0, 0, 6, 8, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = o.shirt || '#efe4c8'; ctx.beginPath(); ctx.ellipse(1.5, 0, 3, 4, 0, 0, 6.28); ctx.fill();
    // brazos
    ctx.fillStyle = o.skin || '#d9a679';
    const arm = moving ? Math.sin(walkT) * 3 : 0;
    ctx.beginPath(); ctx.arc(1 - arm, -7.5, 2.4, 0, 6.28); ctx.arc(1 + arm, 7.5, 2.4, 0, 6.28); ctx.fill();
    // espada
    if (o.sword) {
      const sw = o.swing > 0 ? (1 - o.swing / 0.25) * 2.4 - 1.2 : -0.6;
      ctx.save(); ctx.translate(1, 7.5); ctx.rotate(sw);
      ctx.strokeStyle = '#d8dde3'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(15, 2); ctx.stroke();
      ctx.fillStyle = '#c99a3c'; ctx.fillRect(-1, -2, 3, 4);
      ctx.restore();
      if (o.swing > 0) { ctx.strokeStyle = 'rgba(255,255,255,' + o.swing * 3 + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 18, -1.1, 1.1); ctx.stroke(); }
    }
    if (o.shovel) { ctx.strokeStyle = '#a8702f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(14 + Math.sin(G.time * 18) * 3, 2); ctx.stroke(); ctx.fillStyle = '#9a9aa3'; ctx.fillRect(13 + Math.sin(G.time * 18) * 3, -1, 5, 6); }
    // cabeza
    ctx.fillStyle = o.skin || '#d9a679'; ctx.beginPath(); ctx.arc(0, 0, 4.6, 0, 6.28); ctx.fill();
    if (o.hat === 'straw') { ctx.fillStyle = '#d9b56a'; ctx.beginPath(); ctx.arc(-0.5, 0, 6.2, 0, 6.28); ctx.fill(); ctx.fillStyle = '#b8924a'; ctx.beginPath(); ctx.arc(-0.5, 0, 3.6, 0, 6.28); ctx.fill(); ctx.fillStyle = o.band || '#c0392b'; ctx.fillRect(-4, -0.6, 7, 1.2); }
    else if (o.hat) { ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-4, -6); ctx.lineTo(-3, 0); ctx.lineTo(-4, 6); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(-1, 0, 3.8, 0, 6.28); ctx.fill(); ctx.fillStyle = '#d4a72c'; ctx.fillRect(1.5, -1, 2.5, 2); ctx.fillStyle = '#efe8d8'; ctx.beginPath(); ctx.arc(-1, 0, 1.3, 0, 6.28); ctx.fill(); }
    else { ctx.fillStyle = o.band || '#c0392b'; ctx.beginPath(); ctx.arc(-0.8, 0, 4.7, 1.6, 4.7); ctx.fill(); ctx.fillRect(-6.5, -1, 3, 2); }
    ctx.restore();
  },
  drawLandActors(ctx) {
    const h = G.hero;
    const actors = [];
    for (const c of Land.crabs) actors.push({ y: c.y, f: () => this.drawCrab(ctx, c) });
    for (const v of Land.villagers) actors.push({ y: v.y, f: () => { this.drawPirate(ctx, v.x, v.y, v.dir, v.anim, v.tx !== v.x, { coat: v.color, shirt: '#e8dcc0', hat: v.hat ? 'straw' : false, band: v.band, skin: v.skin }); if (v.talkT > 0) { v.talkT -= 1 / 60; drawIcon(ctx, 'people', v.x, v.y - 18, 12); } } });
    actors.push({ y: h.y, f: () => {
      if (h.inv > 0 && Math.floor(G.time * 20) % 2) return;
      this.drawPirate(ctx, h.x, h.y, h.dir, h.walkT, h.moving, { coat: '#7a1f1f', hat: S.stage >= 2, sword: !Land.digging, swing: h.swing, shovel: !!Land.digging });
    } });
    actors.sort((a, b) => a.y - b.y).forEach(a => a.f());
    // vida del héroe
    if (h.hp < h.maxHp) this.hpBar(ctx, h.x, h.y - 18, 26, h.hp / h.maxHp);
  },
  drawCrab(ctx, c) {
    ctx.save(); ctx.translate(c.x, c.y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(1, 5, 9, 4, 0, 0, 6.28); ctx.fill();
    const wob = c.moving ? Math.sin(c.anim * 2) * 1.5 : 0;
    if (c.kind === 'crab') {
      const col = c.hitT > 0 ? '#fff' : (c.zone >= 2 ? '#9a3a5a' : '#e2552b');
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(-5, k * 3); ctx.lineTo(-10, k * 4 + wob); ctx.moveTo(5, k * 3); ctx.lineTo(10, k * 4 - wob); ctx.stroke(); }
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, 8, 6, 0, 0, 6.28); ctx.fill();
      const pinch = Math.sin(c.anim) * 0.4;
      ctx.beginPath(); ctx.arc(-8, -7, 3.5, 0, 6.28); ctx.arc(8, -7, 3.5, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#3a1208'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-8, -9); ctx.lineTo(-8 + pinch * 3, -5); ctx.moveTo(8, -9); ctx.lineTo(8 - pinch * 3, -5); ctx.stroke();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-2.5, -4, 1.3, 0, 6.28); ctx.arc(2.5, -4, 1.3, 0, 6.28); ctx.fill();
    } else {
      const col = c.hitT > 0 ? '#ff9a9a' : '#efe8d8';
      ctx.fillStyle = '#2a1a0c'; ctx.beginPath(); ctx.ellipse(-3 + wob, 5, 2.5, 2, 0, 0, 6.28); ctx.ellipse(3 - wob, 5, 2.5, 2, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = col; ctx.fillRect(-4, -3, 8, 8);
      ctx.strokeStyle = '#8a8070'; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.moveTo(-4, 2.5); ctx.lineTo(4, 2.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -7, 5, 0, 6.28); ctx.fillStyle = col; ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-2, -7.5, 1.5, 0, 6.28); ctx.arc(2, -7.5, 1.5, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#ff5252'; ctx.fillRect(-2.3, -8, 0.8, 0.8); ctx.fillRect(1.7, -8, 0.8, 0.8);
      ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(5, 1); ctx.lineTo(12, -6 + wob * 2); ctx.stroke();
    }
    ctx.restore();
    if (c.hp < c.maxHp) this.hpBar(ctx, c.x, c.y - 16, 20, c.hp / c.maxHp);
  },

  // ----- Mapa -----
  drawMap(g, w, h, full) {
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0a1422'; g.fillRect(0, 0, w, h);
    let sx = 0, sy = 0, sw = WW, sh = WH;
    const px = G.mode === 'land' && G.hero ? G.hero.x : G.ship.x, py = G.mode === 'land' && G.hero ? G.hero.y : G.ship.y;
    if (!full) { const r = 28; sx = px / TILE - r; sy = py / TILE - r; sw = sh = r * 2; }
    const sc = Math.min(w / sw, h / sh), ox = (w - sw * sc) / 2, oy = (h - sh * sc) / 2;
    g.drawImage(this.mini, sx, sy, sw, sh, ox, oy, sw * sc, sh * sc);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.fog, sx, sy, sw, sh, ox, oy, sw * sc, sh * sc);
    const P = (wx, wy) => [ox + (wx / TILE - sx) * sc, oy + (wy / TILE - sy) * sc];
    const fs = full ? 13 : 9, is = full ? 18 : 11;
    g.font = 'bold ' + fs + 'px Georgia, serif'; g.textAlign = 'center';
    for (const p of World.ports) {
      if (!isRevealedWorld(p.x, p.y)) continue;
      const [x, y] = P(p.x, p.y);
      drawIcon(g, S.taverns[p.id] ? 'mug' : 'anchor', x, y, is);
      if (full) { g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(p.name, x, y - 13); g.fillStyle = '#ffe9b0'; g.fillText(p.name, x, y - 13); }
      if (G.raid && G.raid.port === p.id) drawIcon(g, 'fire', x + is * 0.7, y - is * 0.5, is * 0.8);
    }
    if (full) {
      for (const wr of World.wrecks) if (isRevealedWorld(wr.x, wr.y)) { const [x, y] = P(wr.x, wr.y); g.globalAlpha = S.wrecks[wr.id] ? 0.3 : 1; drawIcon(g, 'wreck', x, y, 16); }
      for (const c of World.caves) if (isRevealedWorld(c.x, c.y)) { const [x, y] = P(c.x, c.y); g.globalAlpha = S.caves[c.id] ? 0.3 : 1; drawIcon(g, 'cave', x, y, 16); }
      g.globalAlpha = 1;
      for (const d of World.digs) if (!S.dug[d.id] && d.hinted) { const [x, y] = P(d.x, d.y); drawIcon(g, 'shovel', x, y, 13); }
      for (const b in BOSSES) if (!S.bosses[b] && isRevealedWorld(World.lairs[b].x, World.lairs[b].y)) { const [x, y] = P(World.lairs[b].x, World.lairs[b].y); drawIcon(g, 'skull', x, y, 18); }
    }
    for (const xm of World.xmarks) if (S.pieces[xm.map] >= 3 && !S.xDug[xm.map]) { const [x, y] = P(xm.x, xm.y); drawIcon(g, 'xmark', x, y, full ? 20 : 12); }
    if (!full) for (const e of G.enemies) { const [x, y] = P(e.x, e.y); if (isRevealedWorld(e.x, e.y)) { g.fillStyle = '#ff5252'; g.beginPath(); g.arc(x, y, 2.5, 0, 6.28); g.fill(); } }
    const [qx, qy] = P(G.ship.x, G.ship.y);
    g.save(); g.translate(qx, qy); g.rotate(G.ship.angle);
    const s = full ? 9 : 6;
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(s, 0); g.lineTo(-s * 0.7, -s * 0.6); g.lineTo(-s * 0.4, 0); g.lineTo(-s * 0.7, s * 0.6); g.closePath(); g.fill(); g.stroke();
    g.restore();
    if (G.mode === 'land' && G.hero) { const [hx, hy] = P(G.hero.x, G.hero.y); g.fillStyle = '#ffd23f'; g.strokeStyle = '#000'; g.beginPath(); g.arc(hx, hy, full ? 5 : 3, 0, 6.28); g.fill(); g.stroke(); }
    return { sc, ox, oy, sx, sy };
  },
};
