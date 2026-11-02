'use strict';
// ===== Dibujo =====
const CH = 8; // tiles por chunk
const Render = {
  cv: null, ctx: null, w: 0, h: 0, dpr: 1, zoom: 1, cam: { x: 0, y: 0 },
  chunks: new Map(), chunkScale: 1, fog: null, fogCtx: null, mini: null,

  init(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.fog = document.createElement('canvas'); this.fog.width = WW; this.fog.height = WH;
    this.fogCtx = this.fog.getContext('2d');
    this.fogCtx.fillStyle = '#0b1828'; this.fogCtx.fillRect(0, 0, WW, WH);
    this.buildMini();
    this.resize();
  },
  resetFog() {
    this.fogCtx.fillStyle = '#0b1828'; this.fogCtx.fillRect(0, 0, WW, WH);
    for (let i = 0; i < WW * WH; i++) if (G.revealed[i]) this.fogCtx.clearRect(i % WW, (i / WW) | 0, 1, 1);
  },
  fogClear(x, y) { this.fogCtx.clearRect(x, y, 1, 1); },
  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth; this.h = window.innerHeight;
    this.cv.width = Math.round(this.w * this.dpr); this.cv.height = Math.round(this.h * this.dpr);
    this.cv.style.width = this.w + 'px'; this.cv.style.height = this.h + 'px';
    // ~24 tiles a lo ancho del lado largo
    this.zoom = Math.max(this.w, this.h) / (24 * TILE);
    this.zoom = Math.max(0.7, Math.min(1.6, this.zoom));
    const sc = Math.max(1, Math.min(2, Math.round(this.zoom * this.dpr * 2) / 2));
    if (sc !== this.chunkScale) { this.chunkScale = sc; this.chunks.clear(); }
  },
  invalidate() { this.chunks.clear(); this.buildMini(); },

  seaColor(z, x, y) {
    const c = ZONES[z].sea, v = (valueNoise(x / 6, y / 6, 9) - 0.5) * 14;
    return 'rgb(' + Math.round(c[0] + v) + ',' + Math.round(c[1] + v) + ',' + Math.round(c[2] + v) + ')';
  },
  landColors(z) {
    return [
      { sand: '#ecd59b', grass: '#62b04f', dark: '#4e9440' },
      { sand: '#f1dfab', grass: '#58b866', dark: '#46a052' },
      { sand: '#c9b88a', grass: '#4d7e45', dark: '#3d6838' },
      { sand: '#9d9283', grass: '#5d5470', dark: '#4a425c' },
    ][z];
  },
  nearLand(x, y) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (World.tileAt(x + dx, y + dy) === W_LAND) return true;
    return false;
  },

  buildChunk(cx, cy) {
    const s = this.chunkScale, size = CH * TILE;
    const c = document.createElement('canvas'); c.width = size * s; c.height = size * s;
    const g = c.getContext('2d'); g.scale(s, s); g.translate(-cx * size, -cy * size);
    const x0 = cx * CH, y0 = cy * CH;
    // agua
    for (let y = y0; y < y0 + CH; y++) for (let x = x0; x < x0 + CH; x++) {
      const z = World.zone[Math.min(WH - 1, y) * WW + Math.min(WW - 1, x)];
      g.fillStyle = this.seaColor(z, x, y);
      g.fillRect(x * TILE, y * TILE, TILE + 0.5, TILE + 0.5);
    }
    // arrecifes y rocas
    for (let y = y0; y < y0 + CH; y++) for (let x = x0; x < x0 + CH; x++) {
      const t = World.tileAt(x, y);
      if (t === W_REEF) {
        g.fillStyle = 'rgba(120,230,220,0.3)'; g.beginPath(); g.arc(x * TILE + 16, y * TILE + 16, TILE * 0.8, 0, 6.28); g.fill();
        for (let k = 0; k < 4; k++) {
          const hx = hash2(x, y, 20 + k), hy = hash2(x, y, 40 + k);
          g.fillStyle = ['#ff8a80', '#ffb74d', '#f06292', '#ce93d8'][k];
          g.beginPath(); g.arc(x * TILE + 4 + hx * 24, y * TILE + 4 + hy * 24, 2.5 + hash2(x, y, 60 + k) * 3, 0, 6.28); g.fill();
        }
      } else if (t === W_ROCK) {
        g.fillStyle = '#5b5e66'; g.beginPath(); g.arc(x * TILE + 16, y * TILE + 17, 13, 0, 6.28); g.fill();
        g.fillStyle = '#7d818b'; g.beginPath(); g.arc(x * TILE + 13, y * TILE + 13, 8, 0, 6.28); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; g.beginPath(); g.arc(x * TILE + 16, y * TILE + 17, 15, 0, 6.28); g.stroke();
      }
    }
    // tierra con margen para costas redondeadas
    const land = [];
    for (let y = y0 - 1; y < y0 + CH + 1; y++) for (let x = x0 - 1; x < x0 + CH + 1; x++) if (World.tileAt(x, y) === W_LAND && x >= 0 && y >= 0 && x < WW && y < WH) land.push([x, y]);
    // aguas poco profundas (halo) y espuma
    const land2 = [];
    for (let y = y0 - 2; y < y0 + CH + 2; y++) for (let x = x0 - 2; x < x0 + CH + 2; x++) if (World.tileAt(x, y) === W_LAND && x >= 0 && y >= 0 && x < WW && y < WH) land2.push([x, y]);
    g.fillStyle = 'rgba(160,240,235,0.10)';
    for (const [x, y] of land2) { g.beginPath(); g.arc(x * TILE + 16, y * TILE + 16, TILE * 1.6, 0, 6.28); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.4)';
    for (const [x, y] of land) { g.beginPath(); g.arc(x * TILE + 16, y * TILE + 16, TILE * 0.88, 0, 6.28); g.fill(); }
    for (const [x, y] of land) { const lc = this.landColors(World.zone[y * WW + x]); g.fillStyle = lc.sand; g.beginPath(); g.arc(x * TILE + 16, y * TILE + 16, TILE * 0.76, 0, 6.28); g.fill(); }
    for (const [x, y] of land) {
      let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (World.tileAt(x + dx, y + dy) === W_LAND) n++;
      if (n >= 7) { const lc = this.landColors(World.zone[y * WW + x]); g.fillStyle = lc.grass; g.beginPath(); g.arc(x * TILE + 16, y * TILE + 16, TILE * 0.74, 0, 6.28); g.fill(); }
    }
    for (const [x, y] of land) {
      let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (World.tileAt(x + dx, y + dy) === W_LAND) n++;
      const lc = this.landColors(World.zone[y * WW + x]);
      if (n === 9 && hash2(x, y, 3) < 0.35) { g.fillStyle = lc.dark; g.beginPath(); g.arc(x * TILE + 8 + hash2(x, y, 4) * 16, y * TILE + 8 + hash2(x, y, 5) * 16, 6, 0, 6.28); g.fill(); }
      if (n >= 4 && hash2(x, y, 7) < 0.22) this.palm(g, x * TILE + 16, y * TILE + 16, World.zone[y * WW + x], hash2(x, y, 8));
    }
    return c;
  },
  palm(g, x, y, z, h) {
    const dead = z === 3;
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(x + 4, y + 5, 9, 5, 0, 0, 6.28); g.fill();
    g.strokeStyle = dead ? '#3d3530' : '#7a5230'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x, y + 4); g.lineTo(x + 2, y - 4); g.stroke();
    g.fillStyle = dead ? '#4b4458' : (z === 2 ? '#3f7a3a' : '#2f9e44');
    for (let k = 0; k < 5; k++) {
      const a = h * 6 + k * 1.256;
      g.beginPath(); g.ellipse(x + 2 + Math.cos(a) * 6, y - 4 + Math.sin(a) * 6, 7, 2.6, a, 0, 6.28); g.fill();
    }
  },
  getChunk(cx, cy) {
    const key = cx + ',' + cy;
    let c = this.chunks.get(key);
    if (c) { this.chunks.delete(key); this.chunks.set(key, c); return c; }
    c = this.buildChunk(cx, cy);
    this.chunks.set(key, c);
    if (this.chunks.size > 56) this.chunks.delete(this.chunks.keys().next().value);
    return c;
  },

  buildMini() {
    if (!World.tiles) return;
    const m = document.createElement('canvas'); m.width = WW; m.height = WH;
    const g = m.getContext('2d'); const img = g.createImageData(WW, WH);
    for (let i = 0; i < WW * WH; i++) {
      const t = World.tiles[i], z = World.zone[i]; let c;
      if (t === W_LAND) c = z === 3 ? [110, 100, 130] : (z === 2 ? [90, 130, 80] : [110, 180, 90]);
      else if (t === W_REEF) c = [120, 220, 210];
      else if (t === W_ROCK) c = [110, 110, 120];
      else c = ZONES[z].sea;
      img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.mini = m;
  },

  // ---------- Frame ----------
  frame() {
    const ctx = this.ctx, z = this.zoom * this.dpr;
    const sh = G.ship;
    const shx = (Math.random() - 0.5) * G.shake, shy = (Math.random() - 0.5) * G.shake;
    this.cam.x = sh.x; this.cam.y = sh.y;
    const vw = this.w / this.zoom, vh = this.h / this.zoom;
    const left = this.cam.x - vw / 2, top = this.cam.y - vh / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b1828'; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    ctx.setTransform(z, 0, 0, z, (-left + shx) * z, (-top + shy) * z);
    ctx.imageSmoothingEnabled = true;
    // chunks
    const size = CH * TILE;
    const cx0 = Math.floor(left / size), cy0 = Math.floor(top / size), cx1 = Math.floor((left + vw) / size), cy1 = Math.floor((top + vh) / size);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (cx < 0 || cy < 0 || cx * CH >= WW || cy * CH >= WH) continue;
      ctx.drawImage(this.getChunk(cx, cy), cx * size, cy * size, size + 0.5, size + 0.5);
    }
    // olas
    const t = G.time;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
    const tx0 = Math.max(0, Math.floor(left / TILE)), ty0 = Math.max(0, Math.floor(top / TILE));
    const tx1 = Math.min(WW - 1, Math.ceil((left + vw) / TILE)), ty1 = Math.min(WH - 1, Math.ceil((top + vh) / TILE));
    ctx.beginPath();
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const h = hash2(x, y, 77);
      if (h > 0.12 || World.tiles[y * WW + x] !== W_WATER) continue;
      const ph = (t * 0.6 + h * 40) % 3;
      if (ph > 1.6) continue;
      const wx = x * TILE + 8 + hash2(x, y, 78) * 16 + ph * 4, wy = y * TILE + 10 + hash2(x, y, 79) * 12;
      ctx.moveTo(wx - 5, wy); ctx.quadraticCurveTo(wx, wy - 3, wx + 5, wy);
    }
    ctx.stroke();

    this.drawPOIs(ctx, left, top, vw, vh);
    this.drawPorts(ctx);
    this.drawLoot(ctx, left, top, vw, vh);
    // estela
    for (const f of G.fx) if (f.type === 'wake') {
      const a = f.life / f.max;
      ctx.fillStyle = 'rgba(255,255,255,' + (a * 0.45) + ')';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (2 - a), 0, 6.28); ctx.fill();
    }
    // destino
    if (G.destMark) {
      const d = G.destMark, r = 10 + Math.sin(d.t * 6) * 3;
      ctx.strokeStyle = 'rgba(255,240,180,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, 6.28); ctx.stroke();
      if (G.path) {
        ctx.setLineDash([6, 8]); ctx.strokeStyle = 'rgba(255,240,180,0.35)';
        ctx.beginPath(); ctx.moveTo(sh.x, sh.y); for (const p of G.path) ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // jefes debajo (kraken / serpiente)
    if (G.boss && G.boss.type !== 'ghost') this.drawBoss(ctx, G.boss);
    for (const e of G.enemies) {
      this.drawShip(ctx, e.x, e.y, e.angle, Math.min(4, e.zone + (e.zone >= 2 ? 1 : 0)), { enemy: true, flash: e.hitT > 0 });
      this.hpBar(ctx, e.x, e.y - 30, 36, e.hp / e.maxHp);
    }
    if (G.boss && G.boss.type === 'ghost') this.drawBoss(ctx, G.boss);
    this.drawShip(ctx, sh.x, sh.y, sh.angle, S.stage, { holes: S.holes, flash: G.hitFlash > 0, player: true });
    // balas
    for (const s of G.shots) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(s.x + 3, s.y + 4, 4, 0, 6.28); ctx.fill();
      ctx.fillStyle = s.ghost ? '#9fffd8' : '#222'; ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, 6.28); ctx.fill();
    }
    // efectos
    for (const f of G.fx) {
      if (f.type === 'wake') continue;
      const a = Math.max(0, f.life / f.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color || '#fff';
      const r = f.type === 'smoke' ? f.r * (2.5 - a) : f.r * a + 1;
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 6.28); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // golpes del kraken
    for (const s of G.slams) {
      const p = 1 - s.t / 1.3;
      ctx.fillStyle = 'rgba(200,30,60,' + (0.15 + p * 0.3) + ')';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.28); ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,100,0.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * p, 0, 6.28); ctx.stroke();
    }
    // tormentas
    for (const s of G.storms) {
      const gr = ctx.createRadialGradient(s.x, s.y, s.r * 0.2, s.x, s.y, s.r);
      gr.addColorStop(0, 'rgba(20,25,35,0.55)'); gr.addColorStop(1, 'rgba(20,25,35,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.28); ctx.fill();
      ctx.strokeStyle = 'rgba(200,220,255,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k < 40; k++) {
        const a = hash2(k, 1, 3) * 6.28, rr = Math.sqrt(hash2(k, 2, 3)) * s.r * 0.9;
        const yy = ((G.time * 400 + k * 37) % 60) - 30;
        const x = s.x + Math.cos(a) * rr, y = s.y + Math.sin(a) * rr + yy;
        ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 10);
      }
      ctx.stroke();
    }
    // niebla de guerra
    ctx.imageSmoothingEnabled = true;
    const fx0 = Math.max(0, Math.floor(left / TILE) - 1), fy0 = Math.max(0, Math.floor(top / TILE) - 1);
    const fx1 = Math.min(WW, Math.ceil((left + vw) / TILE) + 1), fy1 = Math.min(WH, Math.ceil((top + vh) / TILE) + 1);
    if (fx1 > fx0 && fy1 > fy0) ctx.drawImage(this.fog, fx0, fy0, fx1 - fx0, fy1 - fy0, fx0 * TILE, fy0 * TILE, (fx1 - fx0) * TILE, (fy1 - fy0) * TILE);
    // textos flotantes
    ctx.textAlign = 'center'; ctx.font = 'bold 13px sans-serif';
    for (const tt of G.texts) {
      ctx.globalAlpha = Math.min(1, tt.life);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(tt.text, tt.x + 1, tt.y + 1);
      ctx.fillStyle = tt.color; ctx.fillText(tt.text, tt.x, tt.y);
    }
    ctx.globalAlpha = 1;
    // etiquetas de puertos
    ctx.font = 'bold 14px sans-serif';
    for (const p of World.ports) {
      if (!isRevealedWorld(p.x, p.y)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; const w = ctx.measureText(p.name).width + 12;
      ctx.fillRect(p.x - w / 2, p.y - 62, w, 20);
      ctx.fillStyle = '#ffe9b0'; ctx.fillText(p.name, p.x, p.y - 47);
    }

    // capas de pantalla
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const zn = G.curZone;
    if (zn === 3) { ctx.fillStyle = 'rgba(80,30,120,' + (0.12 + Math.sin(t * 0.8) * 0.05) + ')'; ctx.fillRect(0, 0, this.cv.width, this.cv.height); }
    else if (zn === 2) { ctx.fillStyle = 'rgba(10,20,40,0.12)'; ctx.fillRect(0, 0, this.cv.width, this.cv.height); }
    if (G.inStorm) {
      ctx.fillStyle = 'rgba(10,15,25,0.3)'; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
      ctx.strokeStyle = 'rgba(200,220,255,0.4)'; ctx.lineWidth = this.dpr;
      ctx.beginPath();
      for (let k = 0; k < 80; k++) {
        const x = (hash2(k, 5, 1) * this.cv.width + t * 120) % this.cv.width, y = (hash2(k, 6, 1) * this.cv.height + t * 900) % this.cv.height;
        ctx.moveTo(x, y); ctx.lineTo(x - 4 * this.dpr, y + 14 * this.dpr);
      }
      ctx.stroke();
    }
    if (G.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + G.flash * 0.5 + ')'; ctx.fillRect(0, 0, this.cv.width, this.cv.height); }
    if (G.hitFlash > 0 || S.hp < stats().maxHp * 0.25) {
      const a = G.hitFlash > 0 ? 0.45 : 0.18 + Math.sin(t * 5) * 0.08;
      const gr = ctx.createRadialGradient(this.cv.width / 2, this.cv.height / 2, Math.min(this.cv.width, this.cv.height) * 0.3, this.cv.width / 2, this.cv.height / 2, Math.max(this.cv.width, this.cv.height) * 0.7);
      gr.addColorStop(0, 'rgba(200,0,0,0)'); gr.addColorStop(1, 'rgba(200,0,0,' + a + ')');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    }
  },

  hpBar(ctx, x, y, w, f) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
    ctx.fillStyle = f > 0.5 ? '#5ad15a' : f > 0.25 ? '#e8c64a' : '#e85a4a';
    ctx.fillRect(x - w / 2, y, w * Math.max(0, f), 4);
  },

  drawShip(ctx, x, y, ang, stage, o) {
    const sh = SHIPS[stage], L = sh.len, Wd = sh.wid;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(4, 6, L * 0.55, Wd * 0.6, ang, 0, 6.28); ctx.fill();
    ctx.rotate(ang);
    if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
    const hull = () => {
      ctx.beginPath(); ctx.moveTo(L / 2, 0);
      ctx.quadraticCurveTo(L * 0.25, -Wd / 2, -L * 0.3, -Wd / 2); ctx.lineTo(-L / 2, -Wd * 0.38);
      ctx.lineTo(-L / 2, Wd * 0.38); ctx.lineTo(-L * 0.3, Wd / 2); ctx.quadraticCurveTo(L * 0.25, Wd / 2, L / 2, 0); ctx.closePath();
    };
    let hc = '#8a5a32', dc = '#b98552', sc = '#f4ecd6', trim = '#4a2c14';
    if (o.enemy) { hc = '#3b2a1e'; dc = '#5c4330'; sc = '#2a2a2a'; trim = '#1a120b'; }
    if (o.ghost) { hc = '#2f5a52'; dc = '#4b8a7c'; sc = 'rgba(190,255,230,0.6)'; trim = '#9fffd8'; }
    if (o.player && stage === 4) { trim = '#d4a72c'; }
    if (o.flash) { hc = '#ff6b6b'; dc = '#ff9b9b'; }
    hull(); ctx.fillStyle = hc; ctx.fill(); ctx.lineWidth = stage === 4 ? 3 : 2; ctx.strokeStyle = trim; ctx.stroke();
    // cubierta
    ctx.save(); ctx.scale(0.8, 0.72); hull(); ctx.fillStyle = dc; ctx.fill(); ctx.restore();
    ctx.strokeStyle = 'rgba(60,35,15,0.35)'; ctx.lineWidth = 1;
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(-L * 0.36, k * Wd * 0.18); ctx.lineTo(L * 0.3, k * Wd * 0.14); ctx.stroke(); }
    if (stage === 0 && !o.enemy) {
      // parches
      ctx.fillStyle = '#c9a06a'; ctx.fillRect(-8, -5, 6, 5); ctx.fillRect(4, 1, 5, 4); ctx.fillStyle = '#6e4524'; ctx.fillRect(-12, 2, 4, 3);
    }
    if (o.holes) {
      ctx.fillStyle = '#1b0f06';
      for (let k = 0; k < Math.min(o.holes, 10); k++) {
        const hx = (hash2(k, 1, 11) - 0.5) * L * 0.7, hy = (hash2(k, 2, 11) - 0.5) * Wd * 0.6;
        ctx.beginPath(); ctx.arc(hx, hy, 2.2, 0, 6.28); ctx.fill();
      }
    }
    if (stage >= 3) { ctx.fillStyle = trim; ctx.fillRect(-L / 2, -Wd * 0.3, L * 0.18, Wd * 0.6); }
    if (stage === 4) {
      ctx.fillStyle = '#d4a72c';
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(-L * 0.3 + k * L * 0.18, -Wd * 0.46, 1.8, 0, 6.28); ctx.arc(-L * 0.3 + k * L * 0.18, Wd * 0.46, 1.8, 0, 6.28); ctx.fill(); }
    }
    // mástiles y velas
    const masts = [1, 1, 2, 3, 3][stage];
    for (let m = 0; m < masts; m++) {
      const mx = masts === 1 ? L * 0.05 : -L * 0.25 + m * (L * 0.55 / (masts - 1));
      const sw = Wd * (stage === 0 ? 1.1 : 1.45);
      ctx.fillStyle = sc;
      ctx.beginPath(); ctx.moveTo(mx - 2, -sw / 2); ctx.quadraticCurveTo(mx + Wd * 0.5, 0, mx - 2, sw / 2); ctx.lineTo(mx - 5, sw / 2); ctx.quadraticCurveTo(mx + Wd * 0.25, 0, mx - 5, -sw / 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.stroke();
      if (o.enemy && !o.ghost) { ctx.fillStyle = '#b3261e'; ctx.fillRect(mx - 4, -2, 4, 4); }
      ctx.fillStyle = '#4a2c14'; ctx.beginPath(); ctx.arc(mx - 3, 0, 2.5, 0, 6.28); ctx.fill();
    }
    // bandera
    ctx.fillStyle = o.enemy ? '#b3261e' : '#111';
    ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(-L / 2 - 9, -3 + Math.sin(G.time * 8) * 2); ctx.lineTo(-L / 2 - 9, 4 + Math.sin(G.time * 8) * 2); ctx.closePath(); ctx.fill();
    ctx.restore();
  },

  drawBoss(ctx, b) {
    const t = G.time;
    if (b.type === 'serpent') {
      for (let i = b.trail.length - 1; i >= 0; i -= 3) {
        const p = b.trail[i], r = 16 * (1 - i / 80) + 4;
        ctx.fillStyle = i % 6 === 0 ? '#2e8b47' : '#3fae5a';
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.28); ctx.fill();
        ctx.fillStyle = 'rgba(255,240,120,0.5)'; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.4, 0, 6.28); ctx.fill();
      }
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
      ctx.fillStyle = b.hitT > 0 ? '#ff7b7b' : '#2e8b47';
      ctx.beginPath(); ctx.ellipse(6, 0, 26, 17, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#ffeb3b'; ctx.beginPath(); ctx.arc(14, -8, 4, 0, 6.28); ctx.arc(14, 8, 4, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(15, -8, 2, 0, 6.28); ctx.arc(15, 8, 2, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#c62828'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(40, -4); ctx.moveTo(30, 0); ctx.lineTo(40, 4); ctx.stroke();
      ctx.restore();
    } else if (b.type === 'kraken') {
      ctx.lineCap = 'round';
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * 6.28 + Math.sin(t + k) * 0.2;
        ctx.strokeStyle = b.hitT > 0 ? '#ff8a9a' : '#9c3a6a'; ctx.lineWidth = 14;
        ctx.beginPath(); ctx.moveTo(b.x, b.y);
        for (let s = 1; s <= 6; s++) {
          const rr = s * 22, w = Math.sin(t * 2 + s * 0.8 + k) * 14;
          ctx.lineTo(b.x + Math.cos(a) * rr + Math.cos(a + 1.57) * w, b.y + Math.sin(a) * rr + Math.sin(a + 1.57) * w);
        }
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      ctx.fillStyle = b.hitT > 0 ? '#ff7b9b' : '#c2457a';
      ctx.beginPath(); ctx.arc(b.x, b.y, 56, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#ffe082'; ctx.beginPath(); ctx.arc(b.x - 18, b.y - 10, 11, 0, 6.28); ctx.arc(b.x + 18, b.y - 10, 11, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(b.x - 18, b.y - 10, 3, 8, 0, 0, 6.28); ctx.ellipse(b.x + 18, b.y - 10, 3, 8, 0, 0, 6.28); ctx.fill();
    } else {
      this.drawShip(ctx, b.x, b.y, b.angle, 4, { enemy: true, ghost: true, alpha: (0.55 + Math.sin(t * 3) * 0.15) * b.alpha, flash: b.hitT > 0 });
    }
    this.hpBar(ctx, b.x, b.y - (b.type === 'kraken' ? 90 : 50), 90, b.hp / b.maxHp);
  },

  drawPOIs(ctx, left, top, vw, vh) {
    const inView = (x, y) => x > left - 80 && x < left + vw + 80 && y > top - 80 && y < top + vh + 80;
    for (const w of World.wrecks) {
      if (!inView(w.x, w.y)) continue;
      const done = S.wrecks[w.id];
      ctx.globalAlpha = done ? 0.35 : 1;
      ctx.fillStyle = 'rgba(20,30,40,0.45)'; ctx.beginPath(); ctx.ellipse(w.x, w.y, 26, 11, 0.5, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(w.x - 6, w.y + 6); ctx.lineTo(w.x + 10, w.y - 16); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w.x + 3, w.y - 7); ctx.lineTo(w.x + 14, w.y - 4); ctx.stroke();
      if (!done) { ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + Math.sin(G.time * 3) * 0.3) + ')'; ctx.beginPath(); ctx.arc(w.x - 10, w.y - 2 - (G.time * 10 % 10), 2, 0, 6.28); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    for (const c of World.caves) {
      if (!inView(c.x, c.y)) continue;
      ctx.globalAlpha = S.caves[c.id] ? 0.4 : 1;
      ctx.fillStyle = '#6b6258'; ctx.beginPath(); ctx.arc(c.x, c.y + 4, 15, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(c.x, c.y + 5, 9, Math.PI, 0); ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const x of World.xmarks) {
      if (S.pieces[x.map] < 3 || S.xDug[x.map] || !inView(x.x, x.y)) continue;
      const p = 1 + Math.sin(G.time * 4) * 0.15;
      ctx.strokeStyle = '#d32f2f'; ctx.lineWidth = 5 * p; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x.x - 10, x.y - 10); ctx.lineTo(x.x + 10, x.y + 10); ctx.moveTo(x.x + 10, x.y - 10); ctx.lineTo(x.x - 10, x.y + 10); ctx.stroke();
      ctx.lineCap = 'butt';
    }
  },

  drawPorts(ctx) {
    for (const p of World.ports) {
      const x = p.x, y = p.y;
      // muelle
      ctx.fillStyle = '#7a5230'; ctx.fillRect(x + 20, y - 5, 62, 10); ctx.fillRect(x - 5, y + 20, 10, 50);
      ctx.fillStyle = '#5a3a1e'; for (let k = 0; k < 6; k++) ctx.fillRect(x + 24 + k * 10, y - 7, 3, 14);
      // casas
      const houses = [[-14, -12, '#c0392b'], [10, -16, '#d35400'], [-4, 8, '#8e44ad'], [14, 6, '#c0392b']];
      for (const [hx, hy, col] of houses) {
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x + hx - 7, y + hy - 5, 16, 14);
        ctx.fillStyle = '#efe4c8'; ctx.fillRect(x + hx - 8, y + hy - 7, 15, 13);
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x + hx - 10, y + hy - 6); ctx.lineTo(x + hx - 0.5, y + hy - 14); ctx.lineTo(x + hx + 9, y + hy - 6); ctx.closePath(); ctx.fill();
      }
      // bandera
      ctx.strokeStyle = '#3b2a1e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 24, y + 4); ctx.lineTo(x - 24, y - 26); ctx.stroke();
      ctx.fillStyle = S.taverns[p.id] ? '#f5c542' : '#e74c3c';
      ctx.beginPath(); ctx.moveTo(x - 24, y - 26); ctx.lineTo(x - 10, y - 22 + Math.sin(G.time * 5)); ctx.lineTo(x - 24, y - 17); ctx.fill();
      if (G.raid && G.raid.port === p.id) { addFx('smoke', x + (Math.random() - 0.5) * 30, y - 10, 1, '#444'); }
    }
  },

  drawLoot(ctx, left, top, vw, vh) {
    for (const l of G.loot) {
      if (l.x < left - 30 || l.x > left + vw + 30 || l.y < top - 30 || l.y > top + vh + 30) continue;
      const b = Math.sin(G.time * 2.5 + l.bob) * 2;
      const x = l.x, y = l.y + b;
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(x, l.y + 6, 13, 5, 0, 0, 6.28); ctx.fill();
      if (l.kind === 'piece') {
        ctx.fillStyle = '#f3e2b3'; ctx.fillRect(x - 9, y - 6, 18, 12); ctx.strokeStyle = '#8a6a3a'; ctx.strokeRect(x - 9, y - 6, 18, 12);
        ctx.strokeStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3); ctx.moveTo(x + 3, y - 3); ctx.lineTo(x - 3, y + 3); ctx.stroke();
        continue;
      }
      const it = ITEMS[l.kind];
      if (l.kind === 'coins') {
        ctx.fillStyle = '#7a4a22'; ctx.beginPath(); ctx.ellipse(x, y, 8, 10, 0, 0, 6.28); ctx.fill();
        ctx.strokeStyle = '#3b2a1e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 8, y - 3); ctx.lineTo(x + 8, y - 3); ctx.moveTo(x - 8, y + 3); ctx.lineTo(x + 8, y + 3); ctx.stroke();
        ctx.fillStyle = '#f5c542'; ctx.beginPath(); ctx.arc(x, y - 6, 4, 0, 6.28); ctx.fill();
      } else if (l.kind === 'chest' || l.kind === 'rare') {
        const rare = l.kind === 'rare';
        if (rare) { ctx.fillStyle = 'rgba(176,108,255,' + (0.35 + Math.sin(G.time * 4) * 0.15) + ')'; ctx.beginPath(); ctx.arc(x, y, 18, 0, 6.28); ctx.fill(); }
        ctx.fillStyle = rare ? '#5e3a8a' : '#8a5a2b'; ctx.fillRect(x - 10, y - 7, 20, 14);
        ctx.fillStyle = rare ? '#ffd23f' : '#d4a72c'; ctx.fillRect(x - 10, y - 2, 20, 3); ctx.fillRect(x - 2, y - 7, 4, 14);
        ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 1; ctx.strokeRect(x - 10, y - 7, 20, 14);
      } else {
        ctx.fillStyle = it.color + '55'; ctx.beginPath(); ctx.arc(x, y, 13, 0, 6.28); ctx.fill();
        ctx.fillStyle = it.color; ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 7, y - 2); ctx.lineTo(x, y + 9); ctx.lineTo(x - 7, y - 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 3, y - 2); ctx.lineTo(x - 3, y - 2); ctx.closePath(); ctx.fill();
      }
      if (hash2(Math.floor(G.time * 2), Math.floor(l.x), 1) < 0.15) { ctx.fillStyle = '#fff'; ctx.fillRect(x + 6, y - 10, 2, 2); }
    }
  },

  // ----- Mapa (minimapa y mapa grande) -----
  drawMap(g, w, h, full) {
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0b1828'; g.fillRect(0, 0, w, h);
    let sx = 0, sy = 0, sw = WW, sh = WH;
    if (!full) { const r = 30; sx = G.ship.x / TILE - r; sy = G.ship.y / TILE - r; sw = sh = r * 2; }
    const sc = Math.min(w / sw, h / sh), ox = (w - sw * sc) / 2, oy = (h - sh * sc) / 2;
    g.drawImage(this.mini, sx, sy, sw, sh, ox, oy, sw * sc, sh * sc);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.fog, sx, sy, sw, sh, ox, oy, sw * sc, sh * sc);
    const P = (wx, wy) => [ox + (wx / TILE - sx) * sc, oy + (wy / TILE - sy) * sc];
    const fs = full ? 13 : 9;
    g.font = 'bold ' + fs + 'px sans-serif'; g.textAlign = 'center';
    for (const p of World.ports) {
      if (!isRevealedWorld(p.x, p.y)) continue;
      const [x, y] = P(p.x, p.y);
      g.fillStyle = S.taverns[p.id] ? '#f5c542' : '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, full ? 6 : 3.5, 0, 6.28); g.fill(); g.stroke();
      if (full) { g.fillStyle = '#000'; g.fillText(p.name, x + 1, y - 9); g.fillStyle = '#ffe9b0'; g.fillText(p.name, x, y - 10); }
      if (G.raid && G.raid.port === p.id) { g.fillStyle = '#ff3d00'; g.fillText('🔥', x, y + (full ? 22 : 12)); }
    }
    if (full) {
      for (const wr of World.wrecks) if (isRevealedWorld(wr.x, wr.y)) { const [x, y] = P(wr.x, wr.y); g.globalAlpha = S.wrecks[wr.id] ? 0.35 : 1; g.fillText('⚓', x, y + 4); }
      for (const c of World.caves) if (isRevealedWorld(c.x, c.y)) { const [x, y] = P(c.x, c.y); g.globalAlpha = S.caves[c.id] ? 0.35 : 1; g.fillText('🕳️', x, y + 4); }
      g.globalAlpha = 1;
      for (const b in BOSSES) if (!S.bosses[b] && isRevealedWorld(World.lairs[b].x, World.lairs[b].y)) { const [x, y] = P(World.lairs[b].x, World.lairs[b].y); g.fillText('💀', x, y + 4); }
    }
    for (const xm of World.xmarks) if (S.pieces[xm.map] >= 3 && !S.xDug[xm.map]) {
      const [x, y] = P(xm.x, xm.y); g.strokeStyle = '#ff1744'; g.lineWidth = full ? 4 : 2.5; const r = full ? 8 : 4;
      g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke();
    }
    if (!full) for (const e of G.enemies) { const [x, y] = P(e.x, e.y); if (isRevealedWorld(e.x, e.y)) { g.fillStyle = '#ff5252'; g.fillRect(x - 2, y - 2, 4, 4); } }
    const [px, py] = P(G.ship.x, G.ship.y);
    g.save(); g.translate(px, py); g.rotate(G.ship.angle);
    const s = full ? 9 : 6;
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(s, 0); g.lineTo(-s * 0.7, -s * 0.6); g.lineTo(-s * 0.4, 0); g.lineTo(-s * 0.7, s * 0.6); g.closePath(); g.fill(); g.stroke();
    g.restore();
    return { sc, ox, oy, sx, sy };
  },
};
