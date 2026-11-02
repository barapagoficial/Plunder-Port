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
  sideShip(g, x, y, s, rock, col, sails, broken) {
    g.save(); g.translate(x, y); g.rotate(rock); g.scale(s, s);
    g.fillStyle = col || '#4a2c14';
    g.beginPath(); g.moveTo(-120, -10); g.lineTo(130, -10); g.lineTo(100, 30); g.lineTo(-95, 30); g.closePath(); g.fill();
    g.fillStyle = '#2a1808'; g.fillRect(-120, -14, 250, 6);
    g.fillStyle = '#d4a72c'; for (let k = 0; k < 6; k++) g.fillRect(-80 + k * 32, 4, 10, 8);
    g.fillStyle = '#4a2c14'; g.fillRect(-130, -40, 40, 30);
    const masts = broken ? [-40] : [-50, 10, 70];
    for (const mx of masts) {
      g.fillStyle = '#3a2410'; g.fillRect(mx - 3, -160, 6, 150);
      g.fillStyle = sails || '#efe4c8';
      g.beginPath(); g.moveTo(mx - 45, -145); g.quadraticCurveTo(mx, -125, mx + 45, -145); g.lineTo(mx + 40, -60); g.quadraticCurveTo(mx, -45, mx - 40, -60); g.closePath(); g.fill();
    }
    if (!broken) { g.fillStyle = '#111'; g.beginPath(); g.moveTo(10, -160); g.lineTo(50, -150); g.lineTo(10, -140); g.fill(); g.fillStyle = '#efe8d8'; g.beginPath(); g.arc(-50, -100, 14, 0, 6.28); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(-55, -102, 3, 0, 6.28); g.arc(-45, -102, 3, 0, 6.28); g.fill(); }
    g.restore();
  },
  draw(cv, kind, t) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, hz = H * 0.55;
    const fade = Math.min(1, t * 1.2);
    g.globalAlpha = 1;
    if (kind === 'ship') {
      const sky = g.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, '#1b2a4a'); sky.addColorStop(1, '#c86a3a'); g.fillStyle = sky; g.fillRect(0, 0, W, hz);
      g.fillStyle = '#ffcf6b'; g.beginPath(); g.arc(W * 0.75, hz, H * 0.12, Math.PI, 0); g.fill();
      this.sea(g, W, H, hz, '#2a4f7a', '#0d1f36', t, 3);
      this.sideShip(g, W * 0.15 + t * W * 0.05, hz + H * 0.06, H / 700, Math.sin(t * 1.3) * 0.03, '#3b2414', '#8e1f1f');
      g.fillStyle = 'rgba(255,215,90,.9)';
      for (let k = 0; k < 14; k++) { const a = (t * 2 + k) % 3; g.fillRect(W * 0.2 + t * W * 0.05 + k * 9 * H / 700, hz - a * 30 * H / 700, 4, 4); }
    } else if (kind === 'storm') {
      g.fillStyle = '#0a0f1a'; g.fillRect(0, 0, W, hz);
      if (Math.sin(t * 7) > 0.92 || (t > 1 && t < 1.15)) { g.fillStyle = 'rgba(220,230,255,0.8)'; g.fillRect(0, 0, W, H); }
      this.sea(g, W, H, hz, '#18283c', '#060c16', t * 1.8, 12);
      this.sideShip(g, W * 0.45, hz + H * 0.08 + t * 6, H / 700, -0.2 - t * 0.04, '#2a1808', '#5a1414', t > 2.5);
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
