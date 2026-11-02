'use strict';
// ===== Motor gráfico =====
const CH = 8;
const Render = {
  cv: null, ctx: null, w: 0, h: 0, dpr: 1, zoom: 1, viewZoom: 1, cam: { x: 0, y: 0 },
  chunks: new Map(), empty: new Set(), chunkScale: 1, fog: null, fogCtx: null, mini: null, light: null, lctx: null, depth: null, budget: 99, cacheCap: 60,

  init(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    Terrain.init();
    this.mini = Terrain.mini;
    this.fog = document.createElement('canvas'); this.fog.width = WW * FOG_RES; this.fog.height = WH * FOG_RES;
    this.fogCtx = this.fog.getContext('2d');
    this.resetFogFill();
    this.light = document.createElement('canvas'); this.lctx = this.light.getContext('2d');
    this.computeDepth();
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
  // ---------- Niebla de guerra (bordes suaves) ----------
  resetFogFill() {
    const f = this.fogCtx;
    f.globalCompositeOperation = 'source-over';
    const gr = f.createLinearGradient(0, 0, this.fog.width, this.fog.height);
    gr.addColorStop(0, '#0d1b2e'); gr.addColorStop(1, '#0a1524');
    f.fillStyle = gr; f.fillRect(0, 0, this.fog.width, this.fog.height);
    // textura de nubes en la niebla
    for (let k = 0; k < 900; k++) {
      const x = hash2(k, 1, 900) * this.fog.width, y = hash2(k, 2, 900) * this.fog.height, r = 6 + hash2(k, 3, 900) * 18;
      f.fillStyle = 'rgba(40,70,110,' + (0.05 + hash2(k, 4, 900) * 0.07) + ')';
      f.beginPath(); f.arc(x, y, r, 0, 6.28); f.fill();
    }
    f.globalCompositeOperation = 'destination-out';
  },
  resetFog() {
    this.resetFogFill();
    // una máscara de 1 px por casilla, escalada con suavizado en un solo drawImage
    const m = document.createElement('canvas'); m.width = WW; m.height = WH;
    const mg = m.getContext('2d'), img = mg.createImageData(WW, WH);
    for (let i = 0; i < WW * WH; i++) if (G.revealed[i]) img.data[i * 4 + 3] = 255;
    mg.putImageData(img, 0, 0);
    this.fogCtx.imageSmoothingEnabled = true;
    this.fogCtx.drawImage(m, 0, 0, WW * FOG_RES, WH * FOG_RES);
  },
  fogClear(x, y) {
    const s = FOG_RES * 2.8;
    this.fogCtx.drawImage(Terrain.fogDot, (x + 0.5) * FOG_RES - s / 2, (y + 0.5) * FOG_RES - s / 2, s, s);
  },
  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth; this.h = window.innerHeight;
    this.cv.width = Math.round(this.w * this.dpr); this.cv.height = Math.round(this.h * this.dpr);
    this.cv.style.width = this.w + 'px'; this.cv.style.height = this.h + 'px';
    this.zoom = Math.max(0.7, Math.min(1.6, Math.max(this.w, this.h) / (24 * TILE)));
    this.light.width = Math.ceil(this.w / 2); this.light.height = Math.ceil(this.h / 2);
    const sc = Math.max(1, Math.min(2, Math.round(this.zoom * this.dpr * 1.4 * 2) / 2));
    if (sc !== this.chunkScale) { this.chunkScale = sc; this.chunks.clear(); }
  },

  getChunk(cx, cy) {
    const key = cx + ',' + cy;
    if (this.empty.has(key)) return null;
    let c = this.chunks.get(key);
    if (c) { this.chunks.delete(key); this.chunks.set(key, c); return c; }
    if (this.budget <= 0) return null;
    this.budget--;
    c = Terrain.buildLand(cx, cy, this.chunkScale);
    if (!c) { this.empty.add(key); return null; }
    this.chunks.set(key, c);
    if (this.chunks.size > this.cacheCap) this.chunks.delete(this.chunks.keys().next().value);
    return c;
  },
  // drawImage con recorte del rectángulo fuente (los WebView viejos fallan si se sale)
  blit(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh) {
    const kx = dw / sw, ky = dh / sh;
    if (sx < 0) { dx -= sx * kx; dw += sx * kx; sw += sx; sx = 0; }
    if (sy < 0) { dy -= sy * ky; dh += sy * ky; sh += sy; sy = 0; }
    if (sx + sw > img.width) { const e = sx + sw - img.width; sw -= e; dw -= e * kx; }
    if (sy + sh > img.height) { const e = sy + sh - img.height; sh -= e; dh -= e * ky; }
    if (sw > 0 && sh > 0) ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
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
    if (!this.camInit) { this.cam.x = tx; this.cam.y = ty; this.camInit = true; this.camWarm = false; }
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
    const t = G.time;
    // mar (textura global suave) + oleaje animado
    const R = WATER_RES / TILE;
    this.blit(ctx, Terrain.water, left * R, top * R, vw * R, vh * R, left, top, vw, vh);
    this.drawSeaTexture(ctx, left, top, vw, vh, t);
    // tierra por bloques (con presupuesto para no trabar el juego)
    const size = CH * TILE;
    const cx0 = Math.floor(left / size), cy0 = Math.floor(top / size), cx1 = Math.floor((left + vw) / size), cy1 = Math.floor((top + vh) / size);
    // presupuesto de construcción: todo de una vez al arrancar; si faltan bloques visibles (teletransporte), varios por frame; si no, solo precarga
    let missing = 0;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { const key = cx + ',' + cy; if (!this.chunks.has(key) && !this.empty.has(key)) missing++; }
    this.budget = !this.camWarm ? 99 : missing ? 4 : 1; this.camWarm = true;
    this.cacheCap = Math.max(60, (cx1 - cx0 + 3) * (cy1 - cy0 + 3) + 12);
    // se dibujan alineados a píxeles enteros de pantalla: sin rendijas ni líneas entre bloques
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const ox = (-left + shx) * z, oy = (-top + shy) * z, P = TERRAIN_PAD;
    const warm = this.budget < 50;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (cx < 0 || cy < 0 || cx * CH >= WW || cy * CH >= WH) continue;
      const c = this.getChunk(cx, cy);
      if (!c) continue;
      const X0 = Math.round(cx * size * z + ox), X1 = Math.round((cx + 1) * size * z + ox), Y0 = Math.round(cy * size * z + oy), Y1 = Math.round((cy + 1) * size * z + oy);
      const k = c.width / (size + 2 * P);
      ctx.drawImage(c, P * k, P * k, size * k, size * k, X0, Y0, X1 - X0, Y1 - Y0);
    }
    // precarga del anillo exterior (un bloque por frame como máximo)
    if (warm) for (let cy = cy0 - 1; cy <= cy1 + 1 && this.budget > 0; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1 && this.budget > 0; cx++) {
      if (cx < 0 || cy < 0 || cx * CH >= WW || cy * CH >= WH) continue;
      if (cy >= cy0 && cy <= cy1 && cx >= cx0 && cx <= cx1) continue;
      const key = cx + ',' + cy; if (!this.chunks.has(key) && !this.empty.has(key)) this.getChunk(cx, cy);
    }
    ctx.setTransform(z, 0, 0, z, ox, oy);
    this.drawWaves(ctx, left, top, vw, vh, t);
    this.drawPOIs(ctx, left, top, vw, vh);
    this.drawPorts(ctx, left, top, vw, vh);
    this.drawLoot(ctx, left, top, vw, vh);
    // estelas (debajo de los barcos)
    this.drawWake(ctx, G.ship.trail);
    for (const e of G.enemies) this.drawWake(ctx, e.trail);
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
    const FR = FOG_RES / TILE;
    this.blit(ctx, this.fog, left * FR, top * FR, vw * FR, vh * FR, left, top, vw, vh);
    if (left < 0 || top < 0 || left + vw > WW * TILE || top + vh > WH * TILE) {
      ctx.fillStyle = '#0b1828';
      if (left < 0) ctx.fillRect(left, top, -left, vh);
      if (top < 0) ctx.fillRect(left, top, vw, -top);
      if (left + vw > WW * TILE) ctx.fillRect(WW * TILE, top, left + vw - WW * TILE, vh);
      if (top + vh > WH * TILE) ctx.fillRect(left, WH * TILE, vw, top + vh - WH * TILE);
    }
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
    // sombras de nubes que pasan sobre el mar (suaves, nunca tapan el barco)
    const cs = 760, ox = t * 14 * Math.cos(G.wind), oy = t * 14 * Math.sin(G.wind);
    const gx0 = Math.floor((left - ox) / cs) - 1, gy0 = Math.floor((top - oy) / cs) - 1;
    ctx.globalAlpha = 0.16 * (1 - nightFactor() * 0.7);
    for (let gy = gy0; gy < gy0 + Math.ceil(vh / cs) + 3; gy++) for (let gx = gx0; gx < gx0 + Math.ceil(vw / cs) + 3; gx++) {
      if (hash2(gx, gy, 300) > 0.5) continue;
      const x = gx * cs + hash2(gx, gy, 301) * cs + ox, y = gy * cs + hash2(gx, gy, 302) * cs + oy;
      const r = 200 + hash2(gx, gy, 303) * 220;
      ctx.drawImage(Terrain.cloud, x - r, y - r * 0.6, r * 2, r * 1.25);
    }
    ctx.globalAlpha = 1;
  },

  drawSeaTexture(ctx, left, top, vw, vh, t) {
    if (!this.wavePattern) this.wavePattern = ctx.createPattern(Terrain.wavePat, 'repeat');
    const night = nightFactor();
    for (const [sc, sp, al, dir] of [[1, 7, 0.2, 0], [1.7, 4, 0.12, 2.1]]) {
      const a = G.wind + dir, ox = (Math.cos(a) * t * sp) % (256 * sc), oy = (Math.sin(a) * t * sp + Math.sin(t * 0.6) * 3) % (256 * sc);
      ctx.save();
      ctx.globalAlpha = al * (1 - night * 0.6);
      ctx.translate(ox, oy); ctx.scale(sc, sc);
      ctx.fillStyle = this.wavePattern;
      ctx.fillRect((left - ox) / sc - 2, (top - oy) / sc - 2, vw / sc + 4, vh / sc + 4);
      ctx.restore();
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
      if (f.type === 'smoke') { ctx.globalAlpha = a * 0.5; ctx.fillStyle = f.color || '#888'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (2.6 - a * 1.6) + 2, 0, 6.28); ctx.fill(); }
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
    // anillo elíptico alrededor del barco: lejos de las esquinas (HUD y botones)
    const rx = Math.max(90, W / 2 - 150), ry = Math.max(70, H / 2 - 95);
    const ex = cx + Math.cos(ang) * rx, ey = cy + Math.sin(ang) * ry;
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

  drawWake(ctx, tr) {
    if (!tr) return;
    const now = G.time, life = 1.8;
    while (tr.length && now - tr[0].t > life) tr.shift();
    if (tr.length < 2) return;
    ctx.lineCap = 'round';
    // agua batida en el centro de la estela
    for (let i = 0; i < tr.length; i++) {
      const p = tr[i], a = 1 - (now - p.t) / life, k = 1 - a;
      ctx.fillStyle = 'rgba(225,245,255,' + (a * a * 0.2) + ')';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.w * (0.35 + k * 0.45), p.w * (0.22 + k * 0.35), p.a, 0, 6.28); ctx.fill();
    }
    // dos líneas de espuma que se abren en "V"
    for (const side of [1, -1]) {
      for (let i = 1; i < tr.length; i++) {
        const p0 = tr[i - 1], p1 = tr[i];
        if (Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y) > 90) continue;
        const a0 = 1 - (now - p0.t) / life, a1 = 1 - (now - p1.t) / life;
        const s0 = p0.w * 0.42 + (1 - a0) * p0.w * 1.5, s1 = p1.w * 0.42 + (1 - a1) * p1.w * 1.5;
        const n0 = p0.a + 1.5708 * side, n1 = p1.a + 1.5708 * side;
        ctx.strokeStyle = 'rgba(255,255,255,' + (a0 * 0.62) + ')'; ctx.lineWidth = 0.8 + a0 * 2.4;
        ctx.beginPath(); ctx.moveTo(p0.x + Math.cos(n0) * s0, p0.y + Math.sin(n0) * s0); ctx.lineTo(p1.x + Math.cos(n1) * s1, p1.y + Math.sin(n1) * s1); ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
  },

  drawShip(ctx, x, y, ang, stage, o) {
    const sh = SHIPS[stage], L = sh.len, Wd = sh.wid;
    const bob = Math.sin(G.time * 2 + x * 0.01) * 0.6;
    ctx.save(); ctx.translate(x, y + bob);
    if (o.sink) ctx.scale(1 - o.sink * 0.3, 1 - o.sink * 0.3);
    if (o.alpha !== undefined) ctx.globalAlpha = Math.max(0, o.alpha);
    // sombra sobre el agua
    ctx.fillStyle = 'rgba(0,20,40,0.28)'; ctx.beginPath(); ctx.ellipse(6, 8, L * 0.52, Wd * 0.6, ang, 0, 6.28); ctx.fill();
    ctx.rotate(ang);
    const spd = Math.abs(o.speed || 0);
    // ola de proa: SIEMPRE debajo del casco, nunca lo tapa
    if (spd > 15 && !o.sink && !o.ghost) {
      const k = Math.min(1, spd / 150);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.3 + k * 0.45) + ')'; ctx.lineWidth = 1.4 + k * 2; ctx.lineCap = 'round';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(L * 0.5 + 2 + k * 3, 0); ctx.quadraticCurveTo(L * 0.32, s * (Wd * 0.62 + k * 3), -L * 0.05, s * (Wd * 0.58 + k * 5)); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,' + (0.18 + k * 0.2) + ')'; ctx.beginPath(); ctx.ellipse(L * 0.47, 0, 3 + k * 4, Wd * 0.32, 0, 0, 6.28); ctx.fill();
      ctx.lineCap = 'butt';
    }
    const heel = o.heel || 0;
    const hull = (sc) => {
      const l = L * sc, w = Wd * sc;
      ctx.beginPath(); ctx.moveTo(l / 2, 0);
      ctx.bezierCurveTo(l * 0.42, -w * 0.32, l * 0.2, -w / 2, -l * 0.12, -w / 2);
      ctx.lineTo(-l * 0.38, -w * 0.46); ctx.quadraticCurveTo(-l / 2, -w * 0.42, -l / 2, -w * 0.2);
      ctx.lineTo(-l / 2, w * 0.2); ctx.quadraticCurveTo(-l / 2, w * 0.42, -l * 0.38, w * 0.46);
      ctx.lineTo(-l * 0.12, w / 2); ctx.bezierCurveTo(l * 0.2, w / 2, l * 0.42, w * 0.32, l / 2, 0); ctx.closePath();
    };
    let hc = '#6e4122', hc2 = '#9a6436', dc = '#c99a62', dc2 = '#b98a54', sc = '#f6eedb', sc2 = '#d9cdb0', trim = '#3d240f', rail = '#7a4a24';
    if (o.enemy) { hc = '#33241a'; hc2 = '#4f3a2a'; dc = '#7a5c40'; dc2 = '#6b5038'; sc = (ENEMY_TYPES[o.etype] || ENEMY_TYPES.balandra).sail; sc2 = this.shade(sc, -30); trim = '#150e08'; rail = '#2a1c12'; }
    if (o.ghost) { hc = '#2f5a52'; hc2 = '#3e7468'; dc = '#4b8a7c'; dc2 = '#43796d'; sc = 'rgba(190,255,230,0.55)'; sc2 = 'rgba(120,220,190,0.45)'; trim = '#9fffd8'; rail = '#6fd0b0'; }
    if (o.player && stage === 4) { trim = '#d4a72c'; rail = '#b8862a'; }
    if (o.player && stage >= 3) { sc = '#fbf6e8'; }
    if (o.flash) { hc = '#ff6b6b'; hc2 = '#ff8b8b'; dc = '#ffaaaa'; dc2 = '#ff9a9a'; }
    // casco
    const gr = ctx.createLinearGradient(0, -Wd / 2, 0, Wd / 2);
    gr.addColorStop(0, hc2); gr.addColorStop(Math.max(0.1, Math.min(0.9, 0.5 + heel * 0.5)), hc); gr.addColorStop(1, this.shade(hc, -18));
    hull(1); ctx.fillStyle = gr; ctx.fill(); ctx.lineWidth = stage >= 3 ? 2.4 : 1.8; ctx.strokeStyle = trim; ctx.stroke();
    if (o.etype === 'bruto') { ctx.fillStyle = '#8a8a90'; ctx.beginPath(); ctx.moveTo(L / 2 + 9, 0); ctx.lineTo(L / 2 - 4, -5); ctx.lineTo(L / 2 - 4, 5); ctx.fill(); ctx.fillStyle = '#c0c0c8'; ctx.fillRect(L / 2 - 2, -1, 9, 1.2); }
    if (stage >= 2) { ctx.strokeStyle = o.player && stage === 4 ? '#d4a72c' : 'rgba(255,230,170,0.35)'; ctx.lineWidth = 1.2; hull(0.93); ctx.stroke(); }
    // cubierta de tablas
    ctx.save(); hull(0.8); ctx.clip();
    const dg = ctx.createLinearGradient(0, -Wd * 0.4, 0, Wd * 0.4);
    dg.addColorStop(0, this.shade(dc, 12)); dg.addColorStop(0.5, dc); dg.addColorStop(1, dc2);
    ctx.fillStyle = dg; ctx.fillRect(-L / 2, -Wd / 2, L, Wd);
    ctx.strokeStyle = 'rgba(70,40,15,0.32)'; ctx.lineWidth = 0.7;
    for (let yy = -Wd * 0.4; yy <= Wd * 0.4; yy += Math.max(2.2, Wd * 0.1)) { ctx.beginPath(); ctx.moveTo(-L / 2, yy); ctx.lineTo(L / 2, yy); ctx.stroke(); }
    for (let k = 0; k < 10; k++) { const xx = -L / 2 + hash2(k, stage, 31) * L, yy = -Wd * 0.4 + Math.floor(hash2(k, stage, 32) * 8) * Math.max(2.2, Wd * 0.1); ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + Math.max(2.2, Wd * 0.1)); ctx.stroke(); }
    ctx.restore();
    hull(0.8); ctx.strokeStyle = rail; ctx.lineWidth = 1.4; ctx.stroke();
    // castillo de popa
    if (stage >= 2) {
      const qx = -L / 2 + 2, qw = L * 0.22, qh = Wd * 0.62;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(qx + qw, -qh / 2, 2, qh);
      ctx.fillStyle = this.shade(dc, 16); ctx.fillRect(qx, -qh / 2, qw, qh);
      ctx.strokeStyle = rail; ctx.lineWidth = 1.2; ctx.strokeRect(qx, -qh / 2, qw, qh);
      ctx.strokeStyle = 'rgba(70,40,15,0.3)'; ctx.lineWidth = 0.6; for (let yy = -qh / 2 + 2.5; yy < qh / 2; yy += 2.5) { ctx.beginPath(); ctx.moveTo(qx, yy); ctx.lineTo(qx + qw, yy); ctx.stroke(); }
      // timón
      ctx.strokeStyle = '#4a2c14'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(qx + qw * 0.7, 0, 2.6, 0, 6.28); ctx.stroke();
      if (stage >= 3) { ctx.fillStyle = nightFactor() > 0.2 ? '#ffd27a' : '#6a90b0'; ctx.fillRect(-L / 2 + 0.5, -Wd * 0.22, 1.6, 2.2); ctx.fillRect(-L / 2 + 0.5, Wd * 0.05, 1.6, 2.2); }
    }
    // bauprés y foque
    if (stage >= 1) {
      ctx.strokeStyle = '#5a3415'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(L * 0.4, 0); ctx.lineTo(L * 0.5 + L * 0.16, 0); ctx.stroke();
      ctx.fillStyle = sc; ctx.beginPath(); ctx.moveTo(L * 0.64, 0); ctx.quadraticCurveTo(L * 0.42, -Wd * 0.22, L * 0.26, -1.5); ctx.lineTo(L * 0.26, 1.5); ctx.quadraticCurveTo(L * 0.42, Wd * 0.05, L * 0.64, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.6; ctx.stroke();
    }
    // cañones asomando por las bordas
    const nc = Math.min(4, Math.ceil(sh.cannons / 2));
    for (let k = 0; k < nc; k++) {
      const cx = -L * 0.18 + k * (L * 0.4 / Math.max(1, nc - 1 || 1));
      for (const s of [-1, 1]) { ctx.fillStyle = '#1e1e22'; ctx.fillRect(cx - 1.8, s * Wd / 2 - (s < 0 ? 2.5 : 0.5), 3.6, 3); ctx.fillStyle = '#55555c'; ctx.fillRect(cx - 1.2, s * Wd / 2 - (s < 0 ? 2.2 : 0.2), 1.2, 1); }
    }
    // carga en cubierta (botes pequeños)
    if (stage <= 1 && !o.enemy) {
      ctx.fillStyle = '#b8864a'; ctx.fillRect(-L * 0.32, -Wd * 0.25, 5, 5); ctx.strokeStyle = '#6e4524'; ctx.lineWidth = 0.7; ctx.strokeRect(-L * 0.32, -Wd * 0.25, 5, 5);
      ctx.fillStyle = '#7a4a1a'; ctx.beginPath(); ctx.arc(-L * 0.28, Wd * 0.18, 2.6, 0, 6.28); ctx.fill(); ctx.strokeStyle = '#3a2410'; ctx.beginPath(); ctx.arc(-L * 0.28, Wd * 0.18, 1.6, 0, 6.28); ctx.stroke();
      if (stage === 0) { ctx.strokeStyle = '#8a5a30'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-L * 0.1, -Wd * 0.62); ctx.lineTo(L * 0.05, -Wd * 0.2); ctx.moveTo(-L * 0.1, Wd * 0.62); ctx.lineTo(L * 0.05, Wd * 0.2); ctx.stroke(); }
    }
    if (o.holes) {
      for (let k = 0; k < Math.min(o.holes, 10); k++) {
        const hx = (hash2(k, 1, 11) - 0.5) * L * 0.6, hy = (hash2(k, 2, 11) - 0.5) * Wd * 0.5;
        ctx.fillStyle = '#1b0f06'; ctx.beginPath(); ctx.arc(hx, hy, 2.4, 0, 6.28); ctx.fill();
        ctx.fillStyle = 'rgba(120,200,255,0.75)'; ctx.beginPath(); ctx.arc(hx, hy, 1.2 + Math.sin(G.time * 6 + k) * 0.5, 0, 6.28); ctx.fill();
      }
    }
    if (stage === 4 && o.player) { ctx.fillStyle = '#d4a72c'; for (let k = 0; k < 4; k++) for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(-L * 0.3 + k * L * 0.18, s * Wd * 0.47, 1.6, 0, 6.28); ctx.fill(); } }
    // mástiles, vergas y velas (se hinchan con el viento; se inclinan con la escora)
    const masts = [1, 1, 2, 3, 3][stage];
    const rel = angDiff(ang, G.wind);
    const billow = o.anchored ? 0.12 : 0.55 + Math.cos(rel) * 0.3 + Math.sin(G.time * 3 + x) * 0.04;
    const furl = o.anchored ? 0.5 : 1;
    ctx.save(); ctx.translate(0, heel * Wd * 0.35);
    for (let m = 0; m < masts; m++) {
      const mx = masts === 1 ? L * 0.04 : -L * 0.22 + m * (L * 0.52 / (masts - 1));
      const sw = Wd * (stage === 0 ? 1.1 : 1.42) * (m === 1 && masts === 3 ? 1.12 : 1) * furl;
      const bulge = Math.max(2, Wd * 0.5 * billow), thick = Math.max(2.5, bulge * 0.55);
      // obenques
      ctx.strokeStyle = 'rgba(40,25,10,0.5)'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(mx, -sw / 2); ctx.lineTo(mx - L * 0.09, -Wd * 0.46); ctx.moveTo(mx, sw / 2); ctx.lineTo(mx - L * 0.09, Wd * 0.46); ctx.stroke();
      // sombra de la vela en cubierta
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      ctx.beginPath(); ctx.moveTo(mx + 2, -sw / 2 + 3); ctx.quadraticCurveTo(mx + bulge * 2 + 2, 3, mx + 2, sw / 2 + 3); ctx.quadraticCurveTo(mx + (bulge - thick) * 2 + 2, 3, mx + 2, -sw / 2 + 3); ctx.fill();
      // verga
      ctx.strokeStyle = '#5a3415'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mx, -sw / 2 - 1); ctx.lineTo(mx, sw / 2 + 1); ctx.stroke();
      // vela con volumen
      const vg = ctx.createLinearGradient(mx, 0, mx + bulge, 0);
      vg.addColorStop(0, sc2); vg.addColorStop(1, sc);
      ctx.fillStyle = vg;
      ctx.beginPath(); ctx.moveTo(mx, -sw / 2); ctx.quadraticCurveTo(mx + bulge * 2, 0, mx, sw / 2); ctx.quadraticCurveTo(mx + (bulge - thick) * 2, 0, mx, -sw / 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      for (const f of [0.35, 0.7]) { ctx.beginPath(); ctx.moveTo(mx, -sw / 2 * (1 - f * 0.15)); ctx.quadraticCurveTo(mx + (bulge - thick * f) * 2, 0, mx, sw / 2 * (1 - f * 0.15)); ctx.stroke(); }
      if (o.enemy && !o.ghost && (m === masts - 1 || masts === 1)) drawIcon(ctx, 'skull', mx + bulge * 0.62, 0, Math.min(9, Wd * 0.42));
      if (o.player && stage >= 2 && m === Math.floor(masts / 2)) { ctx.fillStyle = '#b5462f'; ctx.beginPath(); ctx.ellipse(mx + bulge * 0.65, 0, 1.6, sw * 0.18, 0, 0, 6.28); ctx.fill(); }
      // mástil y cofa
      ctx.fillStyle = '#4a2c14'; ctx.beginPath(); ctx.arc(mx, 0, 2.4, 0, 6.28); ctx.fill();
      if (stage >= 2 && m === Math.floor(masts / 2)) { ctx.strokeStyle = '#4a2c14'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(mx, 0, 4, 0, 6.28); ctx.stroke(); }
    }
    ctx.restore();
    // bandera de popa
    const fw = Math.sin(G.time * 9 + x) * 2;
    ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-L / 2 + 1, 0); ctx.lineTo(-L / 2 - 2, 0); ctx.stroke();
    ctx.fillStyle = o.ghost ? '#2a4a44' : '#141414';
    ctx.beginPath(); ctx.moveTo(-L / 2 - 1, -1); ctx.quadraticCurveTo(-L / 2 - 6, -3 + fw, -L / 2 - 12, -3 + fw * 1.5); ctx.lineTo(-L / 2 - 12, 4 + fw * 1.5); ctx.quadraticCurveTo(-L / 2 - 6, 4 + fw, -L / 2 - 1, 3); ctx.closePath(); ctx.fill();
    if (o.enemy) { ctx.fillStyle = '#e53935'; ctx.fillRect(-L / 2 - 9, -0.5 + fw, 3, 2); } else { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-L / 2 - 7, 0.5 + fw * 1.2, 1.5, 0, 6.28); ctx.fill(); }
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
      const done = S.wrecks[w.id], ang = hash2(w.id, 1, 40) * 6.28;
      ctx.globalAlpha = done ? 0.4 : 1;
      // casco hundido visto bajo el agua
      ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(ang);
      ctx.fillStyle = 'rgba(10,30,45,0.45)'; ctx.beginPath(); ctx.ellipse(0, 0, 34, 13, 0, 0, 6.28); ctx.fill();
      ctx.strokeStyle = 'rgba(90,70,50,0.55)'; ctx.lineWidth = 2;
      for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(k * 8, -10); ctx.quadraticCurveTo(k * 8 + 2, 0, k * 8, 10); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(110,85,60,0.6)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(30, 0); ctx.stroke();
      // tablas flotando
      ctx.fillStyle = '#7a5530'; ctx.fillRect(18, -16 + Math.sin(t * 2) * 1.2, 11, 3); ctx.fillRect(-26, 12 + Math.sin(t * 2 + 1) * 1.2, 9, 3);
      ctx.restore();
      // mástil roto con vela rasgada
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(w.x - 3, w.y + 9); ctx.lineTo(w.x + 14, w.y - 14); ctx.stroke();
      ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(w.x - 6, w.y + 6); ctx.lineTo(w.x + 10, w.y - 18); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w.x + 2, w.y - 7); ctx.lineTo(w.x + 16, w.y - 3); ctx.stroke();
      ctx.fillStyle = 'rgba(225,215,185,0.9)'; ctx.beginPath(); ctx.moveTo(w.x + 9, w.y - 16); ctx.lineTo(w.x + 17, w.y - 9); ctx.lineTo(w.x + 13, w.y - 7); ctx.lineTo(w.x + 11, w.y - 9); ctx.lineTo(w.x + 7, w.y - 7); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 + Math.sin(t * 2 + w.id) * 0.15) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(w.x - 6, w.y + 7, 7, 3, 0, 0, 6.28); ctx.stroke();
      if (!done) for (let k = 0; k < 3; k++) { const ph = (t * 0.8 + k / 3) % 1; ctx.strokeStyle = 'rgba(255,255,255,' + (1 - ph) * 0.7 + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(w.x - 10 + k * 6, w.y - ph * 14, 1.5 + ph * 2, 0, 6.28); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    for (const c of World.caves) {
      if (!inView(c.x, c.y)) continue;
      const done = S.caves[c.id];
      ctx.globalAlpha = done ? 0.55 : 1;
      // montículo rocoso
      ctx.fillStyle = 'rgba(20,15,5,0.28)'; ctx.beginPath(); ctx.ellipse(c.x + 5, c.y + 8, 28, 13, 0, 0, 6.28); ctx.fill();
      const rock = c.zone === 3 ? ['#4f4858', '#6a6274', '#857d90'] : ['#5e554a', '#7d7366', '#9a907f'];
      ctx.fillStyle = rock[0]; ctx.beginPath(); ctx.ellipse(c.x, c.y + 2, 26, 18, 0, Math.PI * 0.98, Math.PI * 2.02); ctx.lineTo(c.x + 26, c.y + 8); ctx.lineTo(c.x - 26, c.y + 8); ctx.fill();
      ctx.fillStyle = rock[1]; ctx.beginPath(); ctx.ellipse(c.x - 3, c.y - 1, 21, 14, 0, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rock[2]; ctx.beginPath(); ctx.ellipse(c.x - 9, c.y - 8, 8, 5, -0.3, 0, 6.28); ctx.fill();
      // boca de la cueva con vigas de madera
      ctx.fillStyle = '#0d0b09'; ctx.beginPath(); ctx.moveTo(c.x - 10, c.y + 8); ctx.lineTo(c.x - 10, c.y); ctx.arc(c.x, c.y, 10, Math.PI, 0); ctx.lineTo(c.x + 10, c.y + 8); ctx.fill();
      ctx.fillStyle = '#6b4423'; ctx.fillRect(c.x - 12, c.y - 2, 3, 10); ctx.fillRect(c.x + 9, c.y - 2, 3, 10); ctx.fillRect(c.x - 13, c.y - 4, 26, 3);
      // antorchas que titilan
      if (!done) for (const s of [-1, 1]) {
        const fx = c.x + s * 17, fy = c.y - 1, fl = Math.sin(t * 14 + s) * 0.8;
        ctx.fillStyle = '#4a2c14'; ctx.fillRect(fx - 1, fy, 2, 7);
        ctx.fillStyle = 'rgba(255,170,60,0.35)'; ctx.beginPath(); ctx.arc(fx, fy - 2, 6 + fl, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#ffb300'; ctx.beginPath(); ctx.ellipse(fx, fy - 2, 2, 3.4 + fl, 0, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(fx, fy - 1.5, 1, 0, 6.28); ctx.fill();
      }
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
    const night = nightFactor(), t = G.time;
    for (const p of World.ports) {
      if (Math.abs(p.x - (left + vw / 2)) > vw / 2 + 300 || Math.abs(p.y - (top + vh / 2)) > vh / 2 + 300) continue;
      const r = Land.dockRect(p), dw = r.x1 - r.x0, dh = r.y1 - r.y0;
      // muelle: sombra en el agua, pilotes, tablones
      ctx.fillStyle = 'rgba(0,25,45,0.3)'; ctx.fillRect(r.x0 + 4, r.y0 + 7, dw, dh);
      for (let xx = r.x0 + 14; xx < r.x1; xx += 28) for (const yy of [r.y0 - 1, r.y1 + 1]) {
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.25 + Math.sin(t * 2 + xx) * 0.1) + ')'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(xx, yy + 2, 5, 2.2, 0, 0, 6.28); ctx.stroke();
      }
      for (let xx = r.x0, k = 0; xx < r.x1; xx += 6, k++) {
        ctx.fillStyle = ['#9c6c3e', '#8a5c32', '#a87648', '#93643a'][(k * 7 + p.id) % 4];
        ctx.fillRect(xx, r.y0, Math.min(6, r.x1 - xx) - 0.7, dh);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(r.x0, r.y0 + 2.5, dw, 2);
      ctx.fillStyle = '#5a3a1e'; ctx.fillRect(r.x0, r.y0, dw, 2.5); ctx.fillRect(r.x0, r.y1 - 2.5, dw, 2.5);
      for (let xx = r.x0 + 14; xx < r.x1; xx += 28) for (const yy of [r.y0, r.y1]) {
        ctx.fillStyle = '#3d2410'; ctx.beginPath(); ctx.arc(xx, yy, 3.4, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#6b4423'; ctx.beginPath(); ctx.arc(xx - 0.8, yy - 0.8, 1.8, 0, 6.28); ctx.fill();
      }
      // carga en el muelle
      this.barrel(ctx, r.x0 + 20, r.y0 + 8, 5); this.barrel(ctx, r.x0 + 30, r.y0 + 7, 4.5);
      this.crate(ctx, r.x0 + 42, r.y1 - 13, 10);
      ctx.strokeStyle = '#c9a76a'; ctx.lineWidth = 1.4; ctx.beginPath(); for (let a = 0; a < 14; a += 0.4) ctx.lineTo(r.x0 + 62 + Math.cos(a) * a * 0.35, r.y0 + 12 + Math.sin(a) * a * 0.35); ctx.stroke();
      // farolas
      for (const [lx, ly] of [[p.x + 44, p.y + 44], [p.x - 54, p.y - 6], [p.x + 30, p.y - 54], [r.x1 - 6, r.y0], [p.x + 110, p.y + 46]]) this.lamp(ctx, lx, ly, night);
      // fuente de la plaza
      this.fountain(ctx, p.x, p.y, t);
      // edificios (ordenados para que los de abajo tapen a los de arriba)
      const bs = World.buildings.filter(b => b.port === p.id).sort((a, b) => a.y - b.y);
      for (const b of bs) this.drawBuilding(ctx, b, p);
      if (G.raid && G.raid.port === p.id && rnd() < 0.3) addFx('smoke', p.x + (rnd() - 0.5) * 120, p.y + (rnd() - 0.5) * 80, 1, '#444', 0.3);
      // bandera de taberna propia
      if (S.taverns[p.id]) {
        const tb = World.buildings.find(b => b.port === p.id && b.def.id === 'taberna');
        if (tb) {
          const fx = tb.x + tb.w / 2 - 4, fy = tb.y - tb.h / 2 - 8, wv = Math.sin(G.time * 5);
          ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(fx, fy - 18); ctx.lineTo(fx, fy + 10); ctx.stroke();
          ctx.fillStyle = '#f5c542'; ctx.beginPath(); ctx.moveTo(fx, fy - 18); ctx.quadraticCurveTo(fx + 8, fy - 17 + wv * 2, fx + 15, fy - 14 + wv); ctx.lineTo(fx, fy - 9); ctx.fill();
          drawIcon(ctx, 'mug', fx + 6, fy - 14, 6);
        }
      }
    }
  },
  barrel(ctx, x, y, r) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(x + 1.5, y + 2, r, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#7a4a1a'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
    ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r * 0.75, 0, 6.28); ctx.stroke();
    ctx.fillStyle = '#9a6430'; ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.4, 0, 6.28); ctx.fill();
  },
  crate(ctx, x, y, s) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 2, y + 2, s, s);
    ctx.fillStyle = '#b8864a'; ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = '#6e4524'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
    ctx.beginPath(); ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + s - 1, y + s - 1); ctx.moveTo(x + s - 1, y + 1); ctx.lineTo(x + 1, y + s - 1); ctx.stroke();
  },
  lamp(ctx, x, y, night) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 2, 4, 2, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#2c2c30'; ctx.fillRect(x - 1.2, y - 12, 2.4, 13);
    ctx.fillStyle = '#1e1e22'; ctx.fillRect(x - 3.5, y - 17, 7, 6);
    ctx.fillStyle = night > 0.2 ? '#ffd27a' : '#e9e2c8'; ctx.fillRect(x - 2.5, y - 16, 5, 4);
    ctx.fillStyle = '#1e1e22'; ctx.beginPath(); ctx.moveTo(x - 4.5, y - 17); ctx.lineTo(x + 4.5, y - 17); ctx.lineTo(x, y - 20); ctx.fill();
  },
  fountain(ctx, x, y, t) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 4, 19, 16, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#8d8270'; ctx.beginPath(); ctx.ellipse(x, y, 19, 16, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#b3a890'; ctx.beginPath(); ctx.ellipse(x, y - 1, 17.5, 14.5, 0, 0, 6.28); ctx.fill();
    const wg = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, 15);
    wg.addColorStop(0, '#7fd0f0'); wg.addColorStop(1, '#2f7fb0');
    ctx.fillStyle = wg; ctx.beginPath(); ctx.ellipse(x, y, 14, 11.5, 0, 0, 6.28); ctx.fill();
    for (let k = 0; k < 2; k++) { const ph = (t * 0.6 + k * 0.5) % 1; ctx.strokeStyle = 'rgba(255,255,255,' + (1 - ph) * 0.6 + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y, 5 + ph * 9, 4 + ph * 7, 0, 0, 6.28); ctx.stroke(); }
    ctx.fillStyle = '#a89c86'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#c9bfa8'; ctx.beginPath(); ctx.arc(x - 1, y - 1.5, 3, 0, 6.28); ctx.fill();
    ctx.strokeStyle = 'rgba(220,245,255,0.85)'; ctx.lineWidth = 1.3;
    for (let k = 0; k < 4; k++) { const a = k * 1.571 + 0.785, j = Math.sin(t * 8 + k) * 0.6; ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.quadraticCurveTo(x + Math.cos(a) * 5, y - 9 + j, x + Math.cos(a) * 9, y + Math.sin(a) * 7); ctx.stroke(); }
  },

  drawBuilding(ctx, b, p) {
    const id = b.def.id, x = b.x - b.w / 2, y = b.y - b.h / 2, w = b.w, h = b.h;
    const near = G.mode === 'land' && G.nearby && G.nearby.obj === b;
    const night = nightFactor(), wallH = 18, eave = y + h - wallH, top = y - 8;
    const ST = {
      mercado:   { wall: 'stone',   roof: this.shade(p.def.roof, 12) },
      tienda:    { wall: 'wood',    roof: this.shade(p.def.roof, -8) },
      astillero: { wall: 'wood2',   roof: '#7a5c3c' },
      taberna:   { wall: 'timber',  roof: p.def.roof },
      capitania: { wall: 'stone',   roof: this.shade(p.def.roof, -20) },
      inmo:      { wall: 'plaster', roof: this.shade(p.def.roof, 22) },
    }[id] || { wall: 'plaster', roof: p.def.roof };
    // sombra proyectada (el sol viene de arriba a la izquierda)
    ctx.fillStyle = 'rgba(25,18,8,0.28)';
    ctx.beginPath(); ctx.moveTo(x + w + 4, top + 6); ctx.lineTo(x + w + 13, top + 14); ctx.lineTo(x + w + 13, y + h + 7); ctx.lineTo(x + 9, y + h + 7); ctx.lineTo(x + 2, y + h); ctx.lineTo(x + w + 4, y + h); ctx.closePath(); ctx.fill();
    // pared frontal
    this.wall(ctx, ST.wall, x, eave, w, wallH);
    // ventanas
    const lit = night > 0.2;
    for (const wx of w >= 50 ? [x + 6, x + w - 16] : [x + 5]) this.window(ctx, wx, eave + 4, 10, 8, lit, id === 'inmo' ? '#3f6fb5' : '#5b3a1e', id === 'inmo' || id === 'taberna');
    // puerta con arco y escalón
    const dx = b.x - 6.5;
    ctx.fillStyle = '#b9ad94'; ctx.fillRect(dx - 2, y + h - 1, 17, 3);
    ctx.fillStyle = '#3a2410'; ctx.beginPath(); ctx.moveTo(dx - 1, y + h); ctx.lineTo(dx - 1, eave + 6); ctx.arc(b.x, eave + 6, 7.5, Math.PI, 0); ctx.lineTo(dx + 14, y + h); ctx.fill();
    ctx.fillStyle = near ? '#d0954a' : '#7a4a24'; ctx.beginPath(); ctx.moveTo(dx, y + h); ctx.lineTo(dx, eave + 6.5); ctx.arc(b.x, eave + 6.5, 6.5, Math.PI, 0); ctx.lineTo(dx + 13, y + h); ctx.fill();
    ctx.strokeStyle = 'rgba(40,20,5,0.5)'; ctx.lineWidth = 0.8; for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(dx + k * 4.3, eave + 2); ctx.lineTo(dx + k * 4.3, y + h); ctx.stroke(); }
    ctx.fillStyle = '#e2b23c'; ctx.beginPath(); ctx.arc(b.x + 3.5, y + h - 6, 1, 0, 6.28); ctx.fill();
    if (id === 'astillero') { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 4, eave + 2, w - 8, 3); }
    // tejado
    this.roof(ctx, x, top, w, eave, ST.roof, id);
    // chimenea
    if (id === 'taberna' || id === 'tienda' || id === 'inmo') {
      const cx = x + w - 17, cy = top + 1;
      ctx.fillStyle = '#7d6a5a'; ctx.fillRect(cx, cy - 6, 8, 12); ctx.fillStyle = '#5f5044'; ctx.fillRect(cx - 1, cy - 8, 10, 3);
      ctx.fillStyle = '#2a2018'; ctx.fillRect(cx + 1.5, cy - 7.5, 5, 1.6);
      if (rnd() < 0.05) addFx('smoke', cx + 4, cy - 10, 1, '#b0b0b0', 0.1);
    }
    // detalles de cada edificio
    if (id === 'mercado') this.awning(ctx, x - 2, eave - 1, w + 4, '#c0392b', '#f4ead2');
    if (id === 'mercado') { this.fruitCrate(ctx, x - 4, y + h + 1, '#e53935'); this.fruitCrate(ctx, x + w - 10, y + h + 1, '#ffb300'); }
    if (id === 'tienda') { this.barrel(ctx, x - 3, y + h - 2, 4.5); ctx.fillStyle = '#3a3a40'; ctx.fillRect(x + w - 4, y + h - 5, 9, 4); ctx.fillRect(x + w - 1, y + h - 1, 3, 3); ctx.fillStyle = '#6a6a72'; ctx.fillRect(x + w - 4, y + h - 5, 9, 1.2); }
    if (id === 'astillero') { for (let k = 0; k < 3; k++) { ctx.fillStyle = ['#b07d45', '#c08a50', '#a06c38'][k]; ctx.fillRect(x + w + 3, y + h - 14 + k * 4, 18, 3.4); } ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 0.6; ctx.strokeRect(x + w + 3, y + h - 14, 18, 11.6); }
    if (id === 'taberna') { this.barrel(ctx, x - 4, y + h - 3, 5); this.barrel(ctx, x - 4, y + h - 13, 4.5); ctx.fillStyle = '#6b4423'; ctx.fillRect(x + w - 2, y + h - 3, 12, 3); ctx.fillStyle = lit ? '#ffcf6b' : '#c9a35a'; ctx.beginPath(); ctx.arc(dx - 4, eave + 6, 2, 0, 6.28); ctx.fill(); }
    if (id === 'capitania') this.tower(ctx, x + w - 12, top - 4, ST.roof);
    if (id === 'inmo') { for (const wx of [x + 6, x + w - 16]) { ctx.fillStyle = '#6b4423'; ctx.fillRect(wx - 1, eave + 12, 12, 2.5); for (let k = 0; k < 4; k++) { ctx.fillStyle = ['#ff6f91', '#ffd23f', '#fff', '#c77dff'][k]; ctx.beginPath(); ctx.arc(wx + 1 + k * 2.8, eave + 11.5, 1.3, 0, 6.28); ctx.fill(); } } }
    // letrero con icono
    const sx = b.x, sy = eave - 9;
    ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(sx - 8, sy - 9); ctx.lineTo(sx - 8, sy - 6); ctx.moveTo(sx + 8, sy - 9); ctx.lineTo(sx + 8, sy - 6); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; this.rr(ctx, sx - 11, sy - 6 + 1.5, 22, 14, 3); ctx.fill();
    ctx.fillStyle = '#4a2c14'; this.rr(ctx, sx - 11, sy - 6, 22, 14, 3); ctx.fill();
    ctx.strokeStyle = '#c9a35a'; ctx.lineWidth = 1.2; ctx.stroke();
    drawIcon(ctx, b.def.icon, sx, sy + 1, 11);
    if (G.mode === 'land') {
      ctx.font = 'bold 9px Georgia, serif'; ctx.textAlign = 'center';
      const tw = ctx.measureText(b.def.name).width + 10, ly = top - 16;
      ctx.fillStyle = 'rgba(30,16,6,0.78)'; this.rr(ctx, b.x - tw / 2, ly - 9, tw, 12, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(201,163,90,0.8)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = '#ffe9b0'; ctx.fillText(b.def.name, b.x, ly);
    }
    if (near) { ctx.strokeStyle = 'rgba(255,230,140,' + (0.6 + Math.sin(G.time * 6) * 0.3) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(b.doorX, b.doorY - 2, 12, 5, 0, 0, 6.28); ctx.stroke(); }
  },
  rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); },
  wall(ctx, style, x, y, w, h) {
    const base = { stone: '#d2c8b4', wood: '#a87a4c', wood2: '#8a6038', timber: '#efe4c8', plaster: '#f4ecd8' }[style];
    ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (style === 'stone') {
      ctx.strokeStyle = 'rgba(90,78,58,0.4)'; ctx.lineWidth = 0.8;
      for (let yy = y, r = 0; yy < y + h; yy += 4.5, r++) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); for (let xx = x + (r % 2) * 4; xx < x + w; xx += 8) { ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + 4.5); ctx.stroke(); } }
    } else if (style === 'wood' || style === 'wood2') {
      ctx.strokeStyle = 'rgba(50,28,10,0.45)'; ctx.lineWidth = 0.8;
      for (let yy = y + 3.5; yy < y + h; yy += 3.5) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
    } else if (style === 'timber') {
      ctx.fillStyle = '#5a3a1e'; ctx.fillRect(x, y, 3, h); ctx.fillRect(x + w - 3, y, 3, h); ctx.fillRect(x, y, w, 2.5);
      ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 18, y); ctx.lineTo(x + 18, y + h); ctx.moveTo(x + w - 18, y); ctx.lineTo(x + w - 18, y + h); ctx.stroke();
    } else {
      ctx.fillStyle = '#c9bea6'; ctx.fillRect(x, y, 3, h); ctx.fillRect(x + w - 3, y, 3, h);
    }
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(60,40,20,0.22)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.fillStyle = 'rgba(70,55,40,0.6)'; ctx.fillRect(x, y + h - 2, w, 2);
  },
  window(ctx, x, y, w, h, lit, shutter, flowers) {
    ctx.fillStyle = shutter; ctx.fillRect(x - 3, y, 3, h); ctx.fillRect(x + w, y, 3, h);
    ctx.fillStyle = '#4a2c14'; ctx.fillRect(x - 0.8, y - 0.8, w + 1.6, h + 1.6);
    if (lit) { ctx.fillStyle = '#ffd27a'; ctx.fillRect(x, y, w, h); }
    else { const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#9fd2ef'); g.addColorStop(1, '#4f88b0'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + 4, y + 1); ctx.lineTo(x + 1, y + 4); ctx.fill(); }
    ctx.fillStyle = '#4a2c14'; ctx.fillRect(x + w / 2 - 0.5, y, 1, h); ctx.fillRect(x, y + h / 2 - 0.5, w, 1);
  },
  roof(ctx, x, top, w, eave, col, id) {
    const ridge = top + (eave - top) * 0.36;
    // faldón trasero (iluminado)
    ctx.fillStyle = this.shade(col, 30);
    ctx.beginPath(); ctx.moveTo(x + 3, top); ctx.lineTo(x + w - 3, top); ctx.lineTo(x + w + 4, ridge); ctx.lineTo(x - 4, ridge); ctx.closePath(); ctx.fill();
    // faldón delantero con tejas
    const g = ctx.createLinearGradient(0, ridge, 0, eave); g.addColorStop(0, this.shade(col, 6)); g.addColorStop(1, this.shade(col, -32));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x - 4, ridge); ctx.lineTo(x + w + 4, ridge); ctx.lineTo(x + w + 6, eave); ctx.lineTo(x - 6, eave); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = this.shade(col, -55); ctx.lineWidth = 0.9;
    if (id === 'astillero') {
      for (let xx = x - 6; xx < x + w + 6; xx += 5) { ctx.beginPath(); ctx.moveTo(xx, ridge); ctx.lineTo(xx, eave); ctx.stroke(); }
    } else {
      for (let yy = ridge + 4, row = 0; yy < eave + 3; yy += 4.2, row++) {
        ctx.beginPath();
        for (let xx = x - 8 + (row % 2) * 3; xx < x + w + 8; xx += 6) { ctx.moveTo(xx, yy); ctx.arc(xx + 3, yy, 3, Math.PI, 0, true); }
        ctx.stroke();
      }
    }
    ctx.restore();
    // cumbrera y bordes
    ctx.strokeStyle = this.shade(col, -50); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 4, ridge); ctx.lineTo(x + w + 4, ridge); ctx.stroke();
    ctx.strokeStyle = this.shade(col, 55); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 3, ridge - 1.6); ctx.lineTo(x + w + 3, ridge - 1.6); ctx.stroke();
    ctx.strokeStyle = this.shade(col, -65); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 3, top); ctx.lineTo(x + w - 3, top); ctx.lineTo(x + w + 6, eave); ctx.lineTo(x - 6, eave); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - 1, eave, w + 2, 3);
  },
  awning(ctx, x, y, w, c1, c2) {
    const n = Math.max(4, Math.round(w / 8)), sw = w / n;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, y + 8, w, 3);
    for (let k = 0; k < n; k++) {
      ctx.fillStyle = k % 2 ? c2 : c1;
      ctx.beginPath(); ctx.moveTo(x + k * sw, y); ctx.lineTo(x + (k + 1) * sw, y); ctx.lineTo(x + (k + 1) * sw, y + 8); ctx.arc(x + (k + 0.5) * sw, y + 8, sw / 2, 0, Math.PI); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
  },
  fruitCrate(ctx, x, y, col) {
    ctx.fillStyle = '#8a5a30'; ctx.fillRect(x, y, 14, 9);
    ctx.fillStyle = col; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x + 2.5 + (k % 3) * 4.5, y + 2.5 + Math.floor(k / 3) * 3.5, 2, 0, 6.28); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(x + 2, y + 1.5, 1, 1);
  },
  tower(ctx, x, y, roofCol) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 4, y + 2, 16, 26);
    ctx.fillStyle = '#c9bea8'; ctx.fillRect(x - 4, y, 16, 24);
    ctx.strokeStyle = 'rgba(90,78,58,0.4)'; ctx.lineWidth = 0.7; for (let yy = y + 4; yy < y + 24; yy += 4) { ctx.beginPath(); ctx.moveTo(x - 4, yy); ctx.lineTo(x + 12, yy); ctx.stroke(); }
    ctx.fillStyle = '#2a2a2e'; ctx.fillRect(x + 1, y + 6, 6, 7); ctx.fillStyle = '#d4a72c'; ctx.beginPath(); ctx.arc(x + 4, y + 10, 2.2, 0, 6.28); ctx.fill();
    ctx.fillStyle = this.shade(roofCol, 10); ctx.beginPath(); ctx.moveTo(x - 7, y + 1); ctx.lineTo(x + 15, y + 1); ctx.lineTo(x + 4, y - 13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = this.shade(roofCol, -30); ctx.beginPath(); ctx.moveTo(x + 4, y - 13); ctx.lineTo(x + 15, y + 1); ctx.lineTo(x + 6, y + 1); ctx.closePath(); ctx.fill();
    const wv = Math.sin(G.time * 6) * 1.5;
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 4, y - 13); ctx.lineTo(x + 4, y - 26); ctx.stroke();
    ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(x + 4, y - 26); ctx.quadraticCurveTo(x + 10, y - 25 + wv, x + 15, y - 23 + wv); ctx.lineTo(x + 4, y - 19); ctx.fill();
  },
  shade(col, amt) {
    const key = col + '|' + amt, hit = this.shadeCache[key];
    if (hit) return hit;
    return (this.shadeCache[key] = this.shadeRaw(col, amt));
  },
  shadeCache: {},
  shadeRaw(col, amt) {
    let r0, g0, b0;
    if (col[0] === '#') { const n = parseInt(col.slice(1), 16); r0 = n >> 16; g0 = (n >> 8) & 255; b0 = n & 255; }
    else { const m = col.match(/[\d.]+/g) || [0, 0, 0]; r0 = +m[0]; g0 = +m[1]; b0 = +m[2]; }
    const r = Math.round(Math.max(0, Math.min(255, r0 + amt))), g = Math.round(Math.max(0, Math.min(255, g0 + amt))), b = Math.round(Math.max(0, Math.min(255, b0 + amt)));
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
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.ellipse(-1.5, -2.5, 3, 3.5, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#2a1a0c'; ctx.fillRect(-1, -7.5, 2, 15);
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
    g.imageSmoothingEnabled = true;
    g.fillStyle = '#0a1422'; g.fillRect(0, 0, w, h);
    let sx = 0, sy = 0, sw = WW, sh = WH;
    const px = G.mode === 'land' && G.hero ? G.hero.x : G.ship.x, py = G.mode === 'land' && G.hero ? G.hero.y : G.ship.y;
    if (!full) { const r = 28; sx = px / TILE - r; sy = py / TILE - r; sw = sh = r * 2; }
    const sc = Math.min(w / sw, h / sh), ox = (w - sw * sc) / 2, oy = (h - sh * sc) / 2;
    const MR = this.mini.width / WW;
    this.blit(g, this.mini, sx * MR, sy * MR, sw * MR, sh * MR, ox, oy, sw * sc, sh * sc);
    this.blit(g, this.fog, sx * FOG_RES, sy * FOG_RES, sw * FOG_RES, sh * FOG_RES, ox, oy, sw * sc, sh * sc);
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
