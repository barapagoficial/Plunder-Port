'use strict';
// ===== Introducción animada =====
const Intro = {
  scenes: [
    { text: 'Hace años eras el grumete del temido Capitán Garra Roja, el pirata más rico de los siete mares.', draw: 'ship', dur: 6 },
    { text: 'Una noche de tormenta, el Kraken partió su galeón en dos. Todo su tesoro se hundió en las profundidades.', draw: 'storm', dur: 6.5 },
    { text: 'Tú sobreviviste agarrado a un tablón... sin oro, sin barco y sin nada.', draw: 'drift', dur: 5.5 },
    { text: 'Despertaste en Puerto Remiendo. Un viejo pescador te regaló un bote feo y lleno de huecos.', draw: 'beach', dur: 6 },
    { text: 'Ese día juraste que serías más rico que Garra Roja. Con tu propio galeón... y una sala llena de tesoros.', draw: 'dawn', dur: 6.5 },
  ],
  i: 0, t: 0, chars: 0, running: false, onDone: null,
  start(onDone) {
    this.onDone = onDone; this.i = 0; this.t = 0; this.chars = 0; this.running = true;
    const el = $('intro'); el.style.display = 'block';
    const cv = $('introCv');
    const resize = () => { const d = Math.min(2, window.devicePixelRatio || 1); cv.width = innerWidth * d; cv.height = innerHeight * d; };
    resize(); window.addEventListener('resize', resize);
    $('introSkip').onclick = (e) => { e.stopPropagation(); this.finish(); };
    el.onclick = () => { if (this.chars < this.scenes[this.i].text.length) this.chars = 999; else this.next(); };
    let last = performance.now();
    const loop = (ts) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      this.t += dt; this.chars += dt * 38;
      const sc = this.scenes[this.i];
      $('introText').textContent = sc.text.slice(0, Math.floor(this.chars));
      if (this.t > sc.dur + sc.text.length / 38) this.next();
      this.draw(cv, sc.draw, this.t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    if (Sfx.ready) { Sfx.play('thunder', 0.4); }
  },
  next() {
    this.i++; this.t = 0; this.chars = 0;
    Sfx.play('page', 0.6);
    if (this.i >= this.scenes.length) { this.finish(); return; }
    if (this.scenes[this.i].draw === 'storm') { Sfx.play('thunder'); setTimeout(() => Sfx.play('roar', 0.6), 1500); }
    if (this.scenes[this.i].draw === 'beach') Sfx.play('gull');
    if (this.scenes[this.i].draw === 'dawn') Sfx.play('fanfare', 0.7);
  },
  finish() {
    if (!this.running) return;
    this.running = false;
    const el = $('intro'); el.style.transition = 'opacity .8s'; el.style.opacity = 0;
    setTimeout(() => { el.style.display = 'none'; el.style.opacity = 1; if (this.onDone) this.onDone(); }, 800);
  },
  sea(g, W, H, top, col1, col2, t, amp) {
    const gr = g.createLinearGradient(0, top, 0, H); gr.addColorStop(0, col1); gr.addColorStop(1, col2);
    g.fillStyle = gr; g.fillRect(0, top, W, H - top);
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2;
    for (let r = 0; r < 8; r++) {
      const y = top + (H - top) * (r / 8) + 10;
      g.beginPath();
      for (let x = 0; x <= W; x += 20) g.lineTo(x, y + Math.sin(x * 0.012 + t * (1 + r * 0.2) + r) * amp * (1 + r * 0.3));
      g.stroke();
    }
  },
  sideShip(g, x, y, s, rock, col, sails, broken, t) {
    t = t || 0;
    g.save(); g.translate(x, y); g.rotate(rock); g.scale(s, s);
    const hullC = col || '#4a2c14';
    // jarcias (detrás de las velas)
    const masts = broken ? [-40] : [-50, 10, 70];
    g.strokeStyle = 'rgba(30,18,8,0.8)'; g.lineWidth = 1.2;
    g.beginPath();
    for (const mx of masts) { g.moveTo(mx, -158); g.lineTo(mx - 38, -12); g.moveTo(mx, -158); g.lineTo(mx + 34, -12); }
    if (!broken) { g.moveTo(70, -158); g.lineTo(160, -24); g.moveTo(-50, -158); g.lineTo(-125, -42); }
    g.stroke();
    // bauprés y foque
    if (!broken) {
      g.strokeStyle = '#2a1808'; g.lineWidth = 5; g.beginPath(); g.moveTo(120, -18); g.lineTo(170, -40); g.stroke();
      g.fillStyle = sails || '#efe4c8'; g.beginPath(); g.moveTo(166, -38); g.quadraticCurveTo(128, -80, 76, -150); g.quadraticCurveTo(110, -80, 112, -22); g.closePath(); g.fill();
    }
    // casco con degradado
    const hg = g.createLinearGradient(0, -14, 0, 32); hg.addColorStop(0, '#7a4a24'); hg.addColorStop(0.35, hullC); hg.addColorStop(1, '#1a0e05');
    g.fillStyle = hg;
    g.beginPath(); g.moveTo(-122, -44); g.lineTo(-86, -44); g.lineTo(-86, -12); g.lineTo(132, -12); g.quadraticCurveTo(126, 14, 100, 30); g.lineTo(-92, 30); g.quadraticCurveTo(-118, 10, -122, -44); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
    for (let yy = -4; yy < 30; yy += 7) { g.beginPath(); g.moveTo(-115, yy); g.lineTo(125 - (yy + 12) * 0.5, yy); g.stroke(); }
    g.fillStyle = '#d4a72c'; g.fillRect(-122, -16, 254, 3); g.fillRect(-122, -46, 38, 3);
    // portas de cañones y ventanas de popa iluminadas
    for (let k = 0; k < 6; k++) { g.fillStyle = '#1a0e05'; g.fillRect(-72 + k * 32, 2, 12, 9); g.fillStyle = '#ffcf6b'; g.fillRect(-70 + k * 32, 4, 8, 5); }
    for (let k = 0; k < 2; k++) { g.fillStyle = '#ffcf6b'; g.fillRect(-114 + k * 14, -38, 8, 8); }
    // farol de popa
    g.fillStyle = 'rgba(255,207,107,0.35)'; g.beginPath(); g.arc(-122, -54, 12 + Math.sin(t * 4) * 1.5, 0, 6.28); g.fill();
    g.fillStyle = '#ffcf6b'; g.fillRect(-125, -58, 6, 8);
    for (const mx of masts) {
      g.fillStyle = '#3a2410'; g.fillRect(mx - 3, -165, 6, 155);
      g.fillStyle = '#2a1808'; g.fillRect(mx - 52, -150, 104, 4); g.fillRect(mx - 46, -100, 92, 4);
      for (const [y0, y1, w0, w1] of [[-146, -102, 48, 44], [-96, -52, 44, 40]]) {
        const sg = g.createLinearGradient(mx - w0, 0, mx + w0, 0);
        sg.addColorStop(0, sails ? 'rgba(0,0,0,0.25)' : '#d6c8a8'); sg.addColorStop(0.4, sails || '#f6eedb'); sg.addColorStop(1, sails ? 'rgba(0,0,0,0.15)' : '#e2d4b4');
        g.fillStyle = sails || '#efe4c8';
        g.beginPath(); g.moveTo(mx - w0, y0); g.quadraticCurveTo(mx, y0 + 10, mx + w0, y0); g.lineTo(mx + w1, y1); g.quadraticCurveTo(mx + 4, y1 + 14, mx - w1, y1); g.closePath(); g.fill();
        g.fillStyle = sg; g.fill();
      }
      g.fillStyle = '#3a2410'; g.fillRect(mx - 9, -170, 18, 6);
    }
    if (!broken) {
      const wv = Math.sin(t * 5) * 4;
      g.fillStyle = '#111'; g.beginPath(); g.moveTo(10, -188); g.quadraticCurveTo(30, -186 + wv, 52, -182 + wv); g.lineTo(52, -166 + wv); g.quadraticCurveTo(30, -170 + wv, 10, -170); g.fill();
      g.fillStyle = '#efe8d8'; g.beginPath(); g.arc(30, -177 + wv * 0.6, 4.5, 0, 6.28); g.fill();
      g.fillStyle = '#3a2410'; g.fillRect(8, -190, 3, 25);
      g.fillStyle = '#efe8d8'; g.beginPath(); g.arc(-50, -120, 13, 0, 6.28); g.fill(); g.fillRect(-56, -110, 12, 7);
      g.fillStyle = '#111'; g.beginPath(); g.arc(-55, -122, 3.4, 0, 6.28); g.arc(-45, -122, 3.4, 0, 6.28); g.fill();
    }
    g.restore();
  },
  draw(cv, kind, t) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, hz = H * 0.55;
    const fade = Math.min(1, t * 1.2);
    g.globalAlpha = 1;
    if (kind === 'ship') {
      const sky = g.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, '#1b2a4a'); sky.addColorStop(0.6, '#8a4a52'); sky.addColorStop(1, '#e0874a'); g.fillStyle = sky; g.fillRect(0, 0, W, hz);
      for (let k = 0; k < 40; k++) { g.fillStyle = 'rgba(255,255,255,' + (0.2 + hash2(k, 1, 7) * 0.5) * Math.max(0, 1 - hash2(k, 2, 7) * 2.2) + ')'; g.fillRect(hash2(k, 3, 7) * W, hash2(k, 2, 7) * hz * 0.5, 2, 2); }
      const sx = W * 0.75, sr = H * 0.12;
      const glow = g.createRadialGradient(sx, hz, sr * 0.5, sx, hz, sr * 4); glow.addColorStop(0, 'rgba(255,200,100,0.55)'); glow.addColorStop(1, 'rgba(255,140,60,0)');
      g.fillStyle = glow; g.fillRect(0, 0, W, hz);
      g.fillStyle = '#ffcf6b'; g.beginPath(); g.arc(sx, hz, sr, Math.PI, 0); g.fill();
      // nubes alargadas
      g.fillStyle = 'rgba(60,30,50,0.45)';
      for (let k = 0; k < 4; k++) { const cx = ((hash2(k, 1, 9) * W + t * 12 * (k + 1)) % (W * 1.3)) - W * 0.15, cy = hz * (0.25 + k * 0.13); g.beginPath(); g.ellipse(cx, cy, W * 0.12, H * 0.012, 0, 0, 6.28); g.ellipse(cx + W * 0.05, cy - H * 0.01, W * 0.07, H * 0.012, 0, 0, 6.28); g.fill(); }
      this.sea(g, W, H, hz, '#2a4f7a', '#0d1f36', t, 3);
      // reflejo del sol en el agua
      g.fillStyle = 'rgba(255,200,110,0.45)'; for (let k = 0; k < 9; k++) g.fillRect(sx - sr * (1 - k / 11) + Math.sin(t * 2 + k) * 10, hz + 6 + k * H * 0.035, sr * 2 * (1 - k / 11), 3);
      const shx = W * 0.15 + t * W * 0.05;
      this.sideShip(g, shx, hz + H * 0.06, H / 700, Math.sin(t * 1.3) * 0.03, '#3b2414', '#8e1f1f', false, t);
      // destellos del tesoro de Garra Roja
      for (let k = 0; k < 7; k++) {
        const ph = (t * 0.8 + k / 7) % 1, a = Math.sin(ph * Math.PI), r = (3 + hash2(k, 1, 3) * 4) * a * H / 500;
        const px = shx + (-60 + hash2(k, 2, 3) * 150) * H / 700, py = hz + H * 0.06 + (-20 - ph * 60) * H / 700;
        g.fillStyle = 'rgba(255,225,120,' + a + ')'; g.fillRect(px - r, py - r * 0.18, r * 2, r * 0.36); g.fillRect(px - r * 0.18, py - r, r * 0.36, r * 2);
      }
    } else if (kind === 'storm') {
      g.fillStyle = '#0a0f1a'; g.fillRect(0, 0, W, hz);
      if (Math.sin(t * 7) > 0.92 || (t > 1 && t < 1.15)) { g.fillStyle = 'rgba(220,230,255,0.8)'; g.fillRect(0, 0, W, H); }
      this.sea(g, W, H, hz, '#18283c', '#060c16', t * 1.8, 12);
      this.sideShip(g, W * 0.45, hz + H * 0.08 + t * 6, H / 700, -0.2 - t * 0.04, '#2a1808', '#5a1414', t > 2.5, t);
      // tentáculos
      g.strokeStyle = '#7a2a52'; g.lineCap = 'round';
      for (let k = 0; k < 4; k++) {
        g.lineWidth = H * 0.03;
        g.beginPath(); const bx = W * (0.3 + k * 0.13);
        g.moveTo(bx, H); for (let s = 1; s <= 8; s++) g.lineTo(bx + Math.sin(t * 2 + s + k) * W * 0.03, H - s * H * 0.06 * Math.min(1, t * 0.5));
        g.stroke();
      }
      g.strokeStyle = 'rgba(200,220,255,0.4)'; g.lineWidth = 1.5;
      g.beginPath(); for (let k = 0; k < 120; k++) { const x = (hash2(k, 1, 1) * W + t * 200) % W, y = (hash2(k, 2, 1) * H + t * 1400) % H; g.moveTo(x, y); g.lineTo(x - 6, y + 20); } g.stroke();
    } else if (kind === 'drift') {
      const sky = g.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, '#05070d'); sky.addColorStop(1, '#1a2438'); g.fillStyle = sky; g.fillRect(0, 0, W, hz);
      for (let k = 0; k < 80; k++) { g.fillStyle = 'rgba(255,255,255,' + (0.3 + hash2(k, 3, 3) * 0.7) * (0.6 + Math.sin(t * 2 + k) * 0.4) + ')'; g.fillRect(hash2(k, 4, 4) * W, hash2(k, 5, 5) * hz, 2, 2); }
      g.fillStyle = '#e8ecf5'; g.beginPath(); g.arc(W * 0.2, H * 0.18, H * 0.05, 0, 6.28); g.fill();
      this.sea(g, W, H, hz, '#142236', '#050a12', t, 4);
      const x = W * 0.5, y = hz + H * 0.15 + Math.sin(t * 1.4) * 8;
      g.save(); g.translate(x, y); g.rotate(Math.sin(t) * 0.08);
      g.fillStyle = '#6b4423'; g.fillRect(-H * 0.12, -H * 0.012, H * 0.24, H * 0.025);
      g.fillStyle = '#d9a679'; g.beginPath(); g.arc(-H * 0.02, -H * 0.03, H * 0.018, 0, 6.28); g.fill();
      g.fillStyle = '#c0392b'; g.beginPath(); g.arc(-H * 0.025, -H * 0.036, H * 0.018, Math.PI, 0); g.fill();
      g.fillStyle = '#7a1f1f'; g.fillRect(-H * 0.005, -H * 0.03, H * 0.06, H * 0.02);
      g.restore();
      for (let k = 0; k < 6; k++) { g.fillStyle = '#4a2c14'; g.fillRect(W * (0.15 + k * 0.13) + Math.sin(t + k) * 10, hz + H * (0.1 + hash2(k, 7, 7) * 0.3), H * 0.04, H * 0.01); }
    } else if (kind === 'beach') {
      const sky = g.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, '#6fb7e8'); sky.addColorStop(1, '#ffe3b0'); g.fillStyle = sky; g.fillRect(0, 0, W, hz);
      this.sea(g, W, H, hz, '#3ea6c9', '#1d6a94', t, 3);
      g.fillStyle = '#efd8a0'; g.beginPath(); g.moveTo(0, H); g.lineTo(0, H * 0.72); g.quadraticCurveTo(W * 0.4, H * 0.62, W * 0.7, H * 0.78); g.quadraticCurveTo(W * 0.85, H * 0.86, W, H * 0.85); g.lineTo(W, H); g.fill();
      // casitas
      for (let k = 0; k < 4; k++) { const x = W * (0.05 + k * 0.08), y = H * 0.66 - k * 6; g.fillStyle = '#efe4c8'; g.fillRect(x, y, H * 0.08, H * 0.06); g.fillStyle = ['#b5462f', '#3f6fb5', '#d9733b', '#5d3b6e'][k]; g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + H * 0.04, y - H * 0.05); g.lineTo(x + H * 0.08 + 6, y); g.fill(); }
      // bote remendado
      const bx = W * 0.58, by = H * 0.8 + Math.sin(t * 2) * 3;
      g.fillStyle = '#7a4b27'; g.beginPath(); g.moveTo(bx - H * 0.12, by); g.lineTo(bx + H * 0.12, by); g.lineTo(bx + H * 0.09, by + H * 0.05); g.lineTo(bx - H * 0.09, by + H * 0.05); g.fill();
      g.fillStyle = '#c9a06a'; g.fillRect(bx - H * 0.05, by + H * 0.01, H * 0.03, H * 0.02); g.fillRect(bx + H * 0.03, by + H * 0.02, H * 0.025, H * 0.018);
      g.fillStyle = '#1b0f06'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(bx - H * 0.08 + k * H * 0.05, by + H * 0.03, H * 0.005, 0, 6.28); g.fill(); }
      g.fillStyle = '#3a2410'; g.fillRect(bx - 2, by - H * 0.15, 4, H * 0.15);
      g.fillStyle = '#e8dcc0'; g.beginPath(); g.moveTo(bx + 2, by - H * 0.14); g.quadraticCurveTo(bx + H * 0.08, by - H * 0.08, bx + 2, by - H * 0.02); g.fill();
      g.fillStyle = '#c9a06a'; g.fillRect(bx + H * 0.02, by - H * 0.1, H * 0.02, H * 0.02);
      // gaviotas
      g.strokeStyle = '#fff'; g.lineWidth = 2;
      for (let k = 0; k < 3; k++) { const x = (W * 0.2 + k * W * 0.1 + t * 40) % W, y = H * 0.2 + k * 20; const f = Math.sin(t * 8 + k) * 6; g.beginPath(); g.moveTo(x - 12, y - f); g.quadraticCurveTo(x - 4, y - 4, x, y); g.quadraticCurveTo(x + 4, y - 4, x + 12, y - f); g.stroke(); }
    } else if (kind === 'dawn') {
      const sky = g.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, '#3a5c9a'); sky.addColorStop(0.6, '#ff9e5e'); sky.addColorStop(1, '#ffd27a'); g.fillStyle = sky; g.fillRect(0, 0, W, hz);
      const sunY = hz - Math.min(H * 0.18, t * H * 0.04);
      g.fillStyle = '#fff1b8'; g.beginPath(); g.arc(W * 0.5, sunY, H * 0.1, 0, 6.28); g.fill();
      this.sea(g, W, H, hz, '#e08a50', '#2a3f6a', t, 3);
      g.fillStyle = 'rgba(255,230,150,0.5)'; for (let k = 0; k < 10; k++) g.fillRect(W * 0.5 - H * 0.1 + Math.sin(t * 2 + k) * 20, hz + k * H * 0.04, H * 0.2 * (1 - k / 12), 3);
      const bx = W * 0.3 + t * W * 0.03, by = hz + H * 0.12 + Math.sin(t * 2) * 3;
      g.fillStyle = '#1a0f06'; g.beginPath(); g.moveTo(bx - H * 0.07, by); g.lineTo(bx + H * 0.07, by); g.lineTo(bx + H * 0.05, by + H * 0.03); g.lineTo(bx - H * 0.05, by + H * 0.03); g.fill();
      g.fillRect(bx - 1.5, by - H * 0.09, 3, H * 0.09);
      g.beginPath(); g.moveTo(bx + 1, by - H * 0.085); g.quadraticCurveTo(bx + H * 0.05, by - H * 0.05, bx + 1, by - H * 0.01); g.fill();
      if (t > 2) { g.globalAlpha = Math.min(1, (t - 2) * 0.6); g.font = 'bold ' + Math.round(H * 0.12) + 'px Georgia'; g.textAlign = 'center'; g.fillStyle = '#3b2414'; g.fillText('Plunder Port', W / 2 + 4, H * 0.3 + 5); g.fillStyle = '#ffd23f'; g.fillText('Plunder Port', W / 2, H * 0.3); g.globalAlpha = 1; }
    }
    // viñeta y fundido
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.7)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, H * 0.78, W, H * 0.22);
    if (fade < 1) { g.fillStyle = 'rgba(0,0,0,' + (1 - fade) + ')'; g.fillRect(0, 0, W, H); }
  },
};
