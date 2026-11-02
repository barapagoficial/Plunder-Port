'use strict';
// ===== Sonido (sintetizado, sin archivos) =====
const Sfx = {
  ctx: null,
  init() { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  noise(dur, freq, vol, type) {
    const c = this.ctx, len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(c.destination); src.start();
  },
  tone(freq, dur, vol, type, slide) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + dur);
  },
  last: {},
  play(n) {
    if (!this.ctx || !S || !S.sound) return;
    const now = performance.now();
    if (this.last[n] && now - this.last[n] < 60) return;
    this.last[n] = now;
    try {
      switch (n) {
        case 'cannon': this.noise(0.5, 500, 0.5); this.tone(90, 0.3, 0.3, 'sine', 40); break;
        case 'cannon2': this.noise(0.4, 350, 0.25); break;
        case 'boom': this.noise(0.9, 300, 0.6); this.tone(60, 0.6, 0.4, 'sine', 25); break;
        case 'hit': this.noise(0.2, 1200, 0.3, 'bandpass'); break;
        case 'coin': this.tone(988, 0.08, 0.15, 'square'); setTimeout(() => this.tone(1319, 0.15, 0.12, 'square'), 70); break;
        case 'treasure': [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 0.15, 'triangle'), i * 90)); break;
        case 'buy': this.tone(660, 0.1, 0.15, 'triangle'); setTimeout(() => this.tone(880, 0.15, 0.15, 'triangle'), 80); break;
        case 'hammer': this.noise(0.08, 2000, 0.3, 'bandpass'); setTimeout(() => this.noise(0.08, 2000, 0.3, 'bandpass'), 120); break;
        case 'splash': this.noise(0.6, 900, 0.3); break;
        case 'thunder': this.noise(1.5, 200, 0.5); break;
        case 'roar': this.tone(110, 1.2, 0.3, 'sawtooth', 50); this.noise(1, 400, 0.3); break;
        case 'err': this.tone(200, 0.15, 0.15, 'square'); break;
      }
    } catch (e) { }
  },
};

// ===== Interfaz =====
const $ = id => document.getElementById(id);
const fmt = n => Math.floor(n).toLocaleString('es-ES');

const UI = {
  modal: null, port: null, tab: 'puerto', dialogQueue: [],

  init() {
    const cv = Render.cv;
    let down = false, lastPath = 0;
    const toWorld = (e) => {
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      return { x: Render.cam.x + (x - Render.w / 2) / Render.zoom, y: Render.cam.y + (y - Render.h / 2) / Render.zoom };
    };
    cv.addEventListener('pointerdown', e => {
      Sfx.resume();
      if (G.paused || this.modal || this.dialogActive) return;
      down = true; const p = toWorld(e); setDestination(p.x, p.y); lastPath = performance.now();
    });
    cv.addEventListener('pointermove', e => {
      if (!down || G.paused) return;
      const now = performance.now();
      if (now - lastPath > 180) { lastPath = now; const p = toWorld(e); setDestination(p.x, p.y); }
    });
    window.addEventListener('pointerup', () => { down = false; });
    window.addEventListener('pointercancel', () => { down = false; });

    const fb = $('fireBtn');
    const fireOn = e => { e.preventDefault(); Sfx.resume(); G.fireHeld = true; fire(); };
    const fireOff = () => { G.fireHeld = false; };
    fb.addEventListener('pointerdown', fireOn); fb.addEventListener('pointerup', fireOff); fb.addEventListener('pointerleave', fireOff); fb.addEventListener('pointercancel', fireOff);
    $('patchBtn').addEventListener('click', () => patchHole());
    $('actionBtn').addEventListener('click', () => doAction());
    $('menuBtn').addEventListener('click', () => this.openPause());
    $('mini').addEventListener('click', () => this.openMap());

    window.addEventListener('keydown', e => {
      G.keys[e.key] = true;
      if (this.modal || this.dialogActive) { if (e.key === 'Escape') this.back(); return; }
      if (e.key === ' ') { G.fireHeld = true; e.preventDefault(); }
      if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') doAction();
      if (e.key === 'r' || e.key === 'R') patchHole();
      if (e.key === 'm' || e.key === 'M') this.openMap();
      if (e.key === 'Escape') this.openPause();
    });
    window.addEventListener('keyup', e => { G.keys[e.key] = false; if (e.key === ' ') G.fireHeld = false; });
    window.addEventListener('blur', () => { G.keys = {}; G.fireHeld = false; });
  },

  toast(text, secs) {
    const box = $('toasts');
    const d = document.createElement('div'); d.className = 'toast'; d.textContent = text;
    box.appendChild(d);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => { d.style.transition = 'opacity .4s'; d.style.opacity = '0'; setTimeout(() => d.remove(), 400); }, (secs || 2.6) * 1000);
  },

  // ---------- HUD ----------
  hudT: 0, miniT: 0,
  hud(dt) {
    this.hudT -= dt; this.miniT -= dt;
    if (this.miniT <= 0) { this.miniT = 0.2; Render.drawMap($('mini').getContext('2d'), 112, 112, false); }
    if (this.hudT > 0) return; this.hudT = 0.1;
    const st = stats();
    $('gold').textContent = '💰 ' + fmt(S.gold);
    $('shipName').textContent = SHIPS[S.stage].name;
    $('cargo').textContent = '📦 ' + cargoUsed() + '/' + st.hold;
    $('cargoVal').textContent = cargoValue() ? '≈' + fmt(cargoValue()) : '';
    $('hpTxt').textContent = Math.max(0, Math.ceil(S.hp)) + '/' + st.maxHp;
    $('hpBar').style.width = Math.max(0, S.hp / st.maxHp * 100) + '%';
    $('hpBar').style.background = S.hp / st.maxHp > 0.5 ? '#5ad15a' : S.hp / st.maxHp > 0.25 ? '#e8c64a' : '#e85a4a';
    $('holesTxt').textContent = '🕳️ ' + S.holes + ' huecos';
    $('waterBar').style.width = Math.min(100, S.water) + '%';
    $('waterBar').style.background = S.water > 70 ? '#e85a4a' : '#3fa9f5';
    $('planksTxt').textContent = '🪵 ' + S.planks + ' tablas';
    $('moraleBar').style.width = S.morale + '%';
    $('obj').textContent = '🎯 ' + objective();
    $('patchBtn').textContent = '🪵 Tapar (' + S.planks + ')';
    $('patchBtn').disabled = S.holes === 0 || S.planks === 0;
    const fbr = $('fireBtn'); fbr.style.opacity = G.reload > 0 ? 0.6 : 1;
    const ab = $('actionBtn');
    if (G.nearby && !G.paused) { ab.style.display = 'block'; ab.textContent = G.nearby.label; } else ab.style.display = 'none';
    // viento relativo a la pantalla
    $('windArrow').style.transform = 'rotate(' + G.wind + 'rad)';
    // jefe
    if (G.boss) { $('bossBar').style.display = 'block'; $('bossName').textContent = BOSSES[G.boss.type].name; $('bossHp').style.width = Math.max(0, G.boss.hp / G.boss.maxHp * 100) + '%'; }
    else $('bossBar').style.display = 'none';
    if (G.raid) { $('raidBox').style.display = 'block'; $('raidBox').textContent = '🔥 Taberna atacada en ' + PORTS[G.raid.port].name + ': ' + Math.ceil(G.raid.time) + 's'; }
    else $('raidBox').style.display = 'none';
  },

  // ---------- Ventanas ----------
  show(html) { const o = $('overlay'); o.innerHTML = html; o.style.display = 'flex'; G.paused = true; G.fireHeld = false; },
  hide() { $('overlay').style.display = 'none'; $('overlay').innerHTML = ''; this.modal = null; G.paused = this.dialogActive; },
  back() {
    if (this.dialogActive) return;
    if (this.modal) { if (this.modal === 'port') this.leavePort(); else this.hide(); }
    else this.openPause();
  },

  dialogActive: false,
  dialog(title, html, buttons) {
    this.dialogQueue.push({ title, html, buttons });
    if (!this.dialogActive) this.nextDialog();
  },
  closeDialog() {
    const l = $('dlgLayer'); l.style.display = 'none'; l.innerHTML = '';
    this.dialogActive = false; G.paused = !!this.modal;
  },
  nextDialog() {
    if (this.dialogActive || !this.dialogQueue.length) return;
    const d = this.dialogQueue.shift();
    this.dialogActive = true; G.paused = true; G.fireHeld = false;
    const l = $('dlgLayer');
    l.innerHTML = '<div class="panel dlg"><h2>' + d.title + '</h2><div class="body">' + d.html + '</div><div class="foot" id="dlgFoot"></div></div>';
    l.style.display = 'flex';
    const foot = $('dlgFoot');
    (d.buttons || [{ label: 'OK' }]).forEach(b => {
      const el = document.createElement('button'); el.className = 'btn pb' + (b.cls ? ' ' + b.cls : ''); el.textContent = b.label;
      el.onclick = () => { this.closeDialog(); if (b.fn) b.fn(); if (this.modal === 'port') this.renderPort(); this.nextDialog(); };
      foot.appendChild(el);
    });
  },

  // ---------- Mapa grande ----------
  openMap() {
    if (this.modal || this.dialogActive) return;
    this.modal = 'map';
    this.show('<div class="mapWrap"><canvas id="mapCv"></canvas><button class="btn pb close" id="mapClose">✕ Cerrar</button><div class="hint">Toca un punto del mapa para navegar hasta allí</div></div>');
    const cv = $('mapCv');
    const draw = () => {
      const r = cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
      cv.width = r.width * d; cv.height = r.height * d;
      const g = cv.getContext('2d'); g.scale(d, d);
      this.mapT = Render.drawMap(g, r.width, r.height, true);
      // leyenda
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(8, 8, 190, 92);
      g.fillStyle = '#fff'; g.font = '12px sans-serif'; g.textAlign = 'left';
      ['⚪ Puerto  🟡 Tu taberna', '⚓ Naufragio  🕳️ Cueva', '💀 Guarida de jefe  ❌ Tesoro', 'Zona: ' + ZONES[G.curZone].name, 'Mapa revelado: ' + Math.round(G.revealed.reduce((a, b) => a + b, 0) / (WW * WH) * 100) + '%']
        .forEach((t, i) => g.fillText(t, 14, 26 + i * 17));
    };
    requestAnimationFrame(draw);
    cv.addEventListener('pointerdown', e => {
      const r = cv.getBoundingClientRect(), t = this.mapT; if (!t) return;
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const wx = ((mx - t.ox) / t.sc + t.sx) * TILE, wy = ((my - t.oy) / t.sc + t.sy) * TILE;
      if (wx < 0 || wy < 0 || wx > WW * TILE || wy > WH * TILE) return;
      this.hide(); setDestination(wx, wy);
      if (!G.path) this.toast('No se puede llegar navegando hasta ahí.');
    });
    $('mapClose').onclick = () => this.hide();
  },

  // ---------- Menú de pausa ----------
  openPause() {
    if (this.modal || this.dialogActive) return;
    this.modal = 'pause';
    const room = S.house || S.stage === 4;
    this.show('<div class="panel dlg"><h2>☰ Menú <span class="g">💰 ' + fmt(S.gold) + '</span></h2><div class="body" id="pauseBody"></div></div>');
    const b = $('pauseBody');
    const s = S.stats;
    b.innerHTML = '<div style="text-align:left;font-size:13px;margin-bottom:10px">' +
      '⛵ <b>' + SHIPS[S.stage].name + '</b> · Tripulación: ' + (S.crew.map(c => CREW[c].icon + ' ' + CREW[c].name).join(', ') || 'nadie') + '<br>' +
      '🗺️ Pedazos de mapa: ' + S.pieces.map((p, i) => MAP_NAMES[i].replace('Mapa del ', '').replace('Mapa de la ', '') + ' ' + p + '/3').join(' · ') + '<br>' +
      '⭐ Legendarios ' + Object.keys(S.legends).length + '/6 · 🏆 Trofeos ' + Object.keys(S.trophies).length + '/3 · 🍺 Tabernas ' + Object.keys(S.taverns).length + '/4<br>' +
      '📊 Oro ganado: ' + fmt(s.earned) + ' · Botín recogido: ' + s.loot + ' · Piratas hundidos: ' + s.enemies + ' · Naufragios: ' + s.sunk + ' · Tiempo: ' + Math.floor(s.time / 60) + ' min</div>';
    const btns = [
      ['▶ Continuar', () => this.hide()],
      ['🗺️ Mapa', () => { this.hide(); this.openMap(); }],
      room ? ['💎 Sala de tesoros', () => { this.hide(); this.openRoom(); }] : null,
      ['❓ Ayuda', () => { this.hide(); this.help(); }],
      [(S.sound ? '🔊 Sonido: sí' : '🔇 Sonido: no'), () => { S.sound = !S.sound; this.hide(); this.openPause(); }],
      ['💾 Guardar', () => { saveGame(); this.toast('Partida guardada'); }],
      ['🗑️ Borrar partida', () => { this.hide(); this.dialog('¿Borrar partida?', 'Perderás todo tu progreso. Esto no se puede deshacer.', [{ label: 'Cancelar' }, { label: 'Borrar', cls: 'red', fn: () => resetGame() }]); }],
    ].filter(Boolean);
    const wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center';
    for (const [l, f] of btns) { const e = document.createElement('button'); e.className = 'btn pb'; e.textContent = l; e.onclick = f; wrap.appendChild(e); }
    b.appendChild(wrap);
  },

  help() {
    this.dialog('❓ Cómo jugar', '<div style="text-align:left;font-size:13px">' +
      '<b>Ciclo:</b> explorar → saquear → vender → mejorar → expandirse.<br>' +
      '• <b>Toca el mar</b> (o el mapa) para navegar. En PC: WASD/flechas.<br>' +
      '• Pasa sobre el botín flotante para recogerlo. Véndelo en el <b>Mercado</b>: cada puerto paga distinto.<br>' +
      '• Tu bote <b>hace agua</b>: tapa huecos con 🪵 tablas o repara en puerto. Si se llena, pierdes botín.<br>' +
      '• Mientras más botín cargas, <b>más piratas te persiguen</b>. 💥 dispara al enemigo más cercano.<br>' +
      '• Mejora casco, velas, bodega, cañones y timón. Compra barcos más grandes en el <b>Astillero</b>.<br>' +
      '• Zonas peligrosas: Arrecifes (Balandra), Tormentas (Bergantín), Triángulo Maldito (Fragata).<br>' +
      '• Junta pedazos de mapa para revelar ❌ tesoros. Cuevas 🕳️ y naufragios ⚓ (con Buzo) esconden riquezas.<br>' +
      '• Abre <b>tabernas</b> para ganar oro aunque el juego esté cerrado. ¡Defiéndelas de ataques!<br>' +
      '• Meta final: tu <b>sala de tesoros</b> en una casa o en el Galeón, llena de oro, leyendas y trofeos.</div>', [{ label: '¡A navegar!' }]);
  },

  // ---------- Puerto ----------
  openPort(id) {
    if (this.modal || this.dialogActive) return;
    this.port = id; this.tab = 'puerto'; this.modal = 'port';
    S.lastPort = id; G.path = null; G.destMark = null; G.ship.speed = 0;
    tavernTick(); saveGame();
    this.renderPort();
    Sfx.play('buy');
  },
  leavePort() { saveGame(); this.hide(); },
  renderPort() {
    const p = PORTS[this.port], wp = World.ports[this.port];
    const tabs = [['puerto', '⚓ Puerto'], ['mercado', '💰 Mercado'], ['tienda', '🔧 Tienda'], ['astillero', '⛵ Astillero'], ['taberna', '🍺 Taberna']];
    if (p.estate) tabs.push(['inmo', '🏠 Inmobiliaria']);
    if (S.house || S.stage === 4) tabs.push(['sala', '💎 Sala']);
    let h = '<div class="panel"><h2><span>' + p.name + ' <span class="small" style="color:#ffe9b0">· ' + ZONES[wp.zone].name + '</span></span><span class="g">💰 ' + fmt(S.gold) + '</span></h2><div class="tabs">';
    for (const [k, l] of tabs) h += '<button class="tab' + (this.tab === k ? ' on' : '') + '" data-tab="' + k + '">' + l + '</button>';
    h += '</div><div class="body" id="portBody"></div><div class="foot"><span class="small" style="flex:1;align-self:center">📦 ' + cargoUsed() + '/' + stats().hold + ' · ❤️ ' + Math.ceil(S.hp) + '/' + stats().maxHp + ' · 🕳️ ' + S.holes + ' · 🪵 ' + S.planks + '</span><button class="btn pb green" id="sailBtn">⛵ Zarpar</button></div></div>';
    const scroll = $('portBody') ? $('portBody').scrollTop : 0;
    this.show(h);
    this.modal = 'port';
    document.querySelectorAll('.tab').forEach(b => b.onclick = () => { this.tab = b.dataset.tab; this.renderPort(); $('portBody').scrollTop = 0; });
    $('sailBtn').onclick = () => this.leavePort();
    const body = $('portBody');
    this['tab_' + this.tab](body, wp);
    body.scrollTop = scroll;
  },
  card(title, desc, btnLabel, enabled, fn, cls) {
    const c = document.createElement('div'); c.className = 'card';
    c.innerHTML = '<div class="info"><div class="t">' + title + '</div><div class="d">' + desc + '</div></div>';
    if (btnLabel) {
      const b = document.createElement('button'); b.className = 'btn pb' + (cls ? ' ' + cls : ''); b.innerHTML = btnLabel; b.disabled = !enabled;
      b.onclick = () => { fn(); this.renderPort(); };
      c.appendChild(b);
    }
    return c;
  },
  pay(n) { if (S.gold < n) { Sfx.play('err'); this.toast('No tienes suficiente oro.'); return false; } S.gold -= n; Sfx.play('buy'); return true; },

  tab_puerto(b) {
    const st = stats();
    const missing = Math.max(0, st.maxHp - S.hp);
    const cost = Math.ceil(missing * 1.2 + S.holes * 6 + S.water * 0.3);
    b.appendChild(this.card('🔨 Reparar el barco', 'Casco ' + Math.ceil(S.hp) + '/' + st.maxHp + ', ' + S.holes + ' huecos, agua ' + Math.round(S.water) + '%', cost ? 'Reparar (' + fmt(cost) + ')' : 'Perfecto', cost > 0 && S.gold >= cost,
      () => { if (this.pay(cost)) { S.hp = st.maxHp; S.holes = 0; S.water = 0; } }, 'green'));
    if (cost > 0 && S.gold < cost && S.gold > 0) {
      b.appendChild(this.card('🔧 Reparación parcial', 'Gasta todo tu oro en reparar lo que alcance', 'Reparar (' + fmt(S.gold) + ')', true, () => {
        let g = S.gold; S.gold = 0; const h = Math.min(S.holes, Math.floor(g / 6)); S.holes -= h; g -= h * 6; S.water = 0; S.hp = Math.min(st.maxHp, S.hp + g / 1.2);
      }));
    }
    const need = st.maxPlanks - S.planks;
    b.appendChild(this.card('🪵 Tablas para tapar huecos', 'Tienes ' + S.planks + '/' + st.maxPlanks + ' · ' + PLANK_PRICE + ' de oro cada una', need > 0 ? 'Llenar (' + need * PLANK_PRICE + ')' : 'Lleno', need > 0 && S.gold >= need * PLANK_PRICE,
      () => { if (this.pay(need * PLANK_PRICE)) S.planks = st.maxPlanks; }));
    if (need > 1) b.appendChild(this.card('🪵 Comprar 1 tabla', '', 'Comprar (' + PLANK_PRICE + ')', S.gold >= PLANK_PRICE, () => { if (this.pay(PLANK_PRICE)) S.planks++; }));
    const tavs = Object.keys(S.taverns).map(id => PORTS[id].name + ': ' + fmt(S.taverns[id].stored) + ' 🪙').join(' · ');
    b.appendChild(this.card('💾 Progreso guardado', 'Este puerto es tu punto de partida si te hunden.' + (tavs ? '<br>Cajas de tus tabernas: ' + tavs : ''), null));
    const s = stats();
    b.appendChild(this.card('⛵ ' + SHIPS[S.stage].name, 'Velocidad ' + Math.round(s.speed) + ' · Bodega ' + s.hold + ' · Cañones ' + s.cannons + ' · Daño ' + s.dmg.toFixed(1) + ' · Tripulación ' + S.crew.length + '/' + s.crewSlots + (s.leak ? ' · Hueco nuevo cada ' + Math.round(s.leak) + 's' : ' · No hace agua'), null));
  },

  tab_mercado(b, wp) {
    const known = World.ports.filter(p => isRevealedWorld(p.x, p.y));
    let h = '<table><tr><th>Botín</th><th>Tienes</th><th>Precio aquí</th>' + known.filter(p => p.id !== wp.id).map(p => '<th class="small">' + p.name.split(' ').pop() + '</th>').join('') + '<th></th></tr>';
    for (const k of ITEM_ORDER) {
      const pr = priceAt(wp.id, k), base = ITEMS[k].value;
      const cls = pr > base * 1.05 ? 'up' : pr < base * 0.95 ? 'down' : '';
      h += '<tr><td>' + ITEMS[k].icon + ' ' + ITEMS[k].name + '</td><td>' + S.cargo[k] + '</td><td class="' + cls + '">' + pr + '</td>' +
        known.filter(p => p.id !== wp.id).map(p => { const o = priceAt(p.id, k); return '<td class="small ' + (o > pr ? 'up' : '') + '">' + o + '</td>'; }).join('') +
        '<td><button class="btn pb" data-sell="' + k + '"' + (S.cargo[k] ? '' : ' disabled') + '>Vender</button></td></tr>';
    }
    h += '</table>';
    let total = 0; for (const k of ITEM_ORDER) total += S.cargo[k] * priceAt(wp.id, k);
    const div = document.createElement('div'); div.innerHTML = h; b.appendChild(div);
    div.querySelectorAll('[data-sell]').forEach(el => el.onclick = () => { const k = el.dataset.sell; const g = S.cargo[k] * priceAt(wp.id, k); S.cargo[k] = 0; addGold(g); Sfx.play('coin'); this.toast('+' + fmt(g) + ' de oro'); this.renderPort(); });
    b.appendChild(this.card('💰 Vender todo', 'Total en este puerto: <b>' + fmt(total) + '</b> de oro. <span class="small">Verde = paga más que el precio normal.</span>', 'Vender todo', total > 0, () => {
      for (const k of ITEM_ORDER) S.cargo[k] = 0; addGold(total); Sfx.play('treasure'); this.toast('+' + fmt(total) + ' de oro');
    }, 'green'));
    const leg = Object.keys(S.legends);
    if (leg.length) b.appendChild(this.card('⭐ Objetos legendarios', leg.map(l => LEGENDS[l].name).join(', ') + '<br><i>Estos no se venden: van a las vitrinas de tu sala de tesoros.</i>', null));
  },

  tab_tienda(b) {
    for (const k in PARTS) {
      const lvl = S.parts[k], max = lvl >= PART_MAX, cost = partCost(k, lvl);
      let bars = '<span class="lvl">'; for (let i = 0; i < PART_MAX; i++) bars += '<i class="' + (i < lvl ? 'on' : '') + '"></i>'; bars += '</span>';
      b.appendChild(this.card(PARTS[k].name + bars, PARTS[k].desc, max ? 'Máximo' : 'Mejorar (' + fmt(cost) + ')', !max && S.gold >= cost, () => {
        if (this.pay(cost)) { S.parts[k]++; if (k === 'casco') S.hp += SHIPS[S.stage].hp * 0.2; this.toast(PARTS[k].name + ' mejorado a nivel ' + S.parts[k]); }
      }));
    }
  },

  tab_astillero(b) {
    for (let i = 0; i < SHIPS.length; i++) {
      const s = SHIPS[i];
      const owned = i <= S.stage;
      const trade = Math.round(SHIPS[S.stage].price * 0.4);
      const cost = Math.max(0, s.price - trade);
      const desc = s.desc + '<br><span class="small">Casco ' + s.hp + ' · Bodega ' + s.hold + ' · Cañones ' + s.cannons + ' · Tripulación ' + s.crew + (s.leak ? ' · Hueco cada ' + s.leak + 's' : ' · Sin huecos') + '</span>';
      if (i === S.stage) b.appendChild(this.card('✅ ' + s.name + ' (tu barco)', desc, null));
      else if (!owned) b.appendChild(this.card('⛵ ' + s.name, desc + (trade && cost < s.price ? '<br><span class="small">Precio ' + fmt(s.price) + ' − ' + fmt(trade) + ' por tu barco viejo</span>' : ''), 'Comprar (' + fmt(cost) + ')', S.gold >= cost && i === S.stage + 1, () => {
        if (this.pay(cost)) {
          S.stage = i; S.hp = stats().maxHp; S.holes = 0; S.water = 0; S.planks = Math.max(S.planks, Math.floor(stats().maxPlanks / 2));
          Render.invalidate();
          this.renderPort();
          this.dialog('⛵ ¡Nuevo barco!', 'Ahora navegas en un <b>' + s.name + '</b>.<br>' + s.desc + (i === 4 ? '<br><br>💎 ¡Tienes tu propia <b>sala de tesoros</b> a bordo!' : ''), [{ label: '¡A la mar!', fn: () => { if (i === 4) checkEnding(); } }]);
        }
      }));
    }
    const c = b.lastChild; if (c && S.stage < 4) { const n = document.createElement('div'); n.className = 'small'; n.textContent = 'Solo puedes comprar el siguiente barco de la lista. Tus mejoras de partes se conservan.'; b.appendChild(n); }
  },

  tab_taberna(b, wp) {
    const st = stats();
    const h = document.createElement('div'); h.innerHTML = '<b>👥 Tripulación (' + S.crew.length + '/' + st.crewSlots + ')</b>'; b.appendChild(h);
    for (const k of CREW_ORDER) {
      const has = hasCrew(k);
      if (has) b.appendChild(this.card(CREW[k].icon + ' ' + CREW[k].name + ' ✅', CREW[k].desc, 'Despedir', true, () => { S.crew = S.crew.filter(c => c !== k); }, 'red'));
      else b.appendChild(this.card(CREW[k].icon + ' ' + CREW[k].name, CREW[k].desc + (S.crew.length >= st.crewSlots ? '<br><i>Tu barco no tiene más espacio para tripulación.</i>' : ''), 'Contratar (' + CREW[k].cost + ')',
        S.crew.length < st.crewSlots && S.gold >= CREW[k].cost, () => { if (this.pay(CREW[k].cost)) { S.crew.push(k); this.toast('¡' + CREW[k].name + ' se une a tu tripulación!'); } }));
    }
    // mapas
    const m = PORTS[wp.id].mapId, mp = MAP_PIECE_PRICE[m];
    const h2 = document.createElement('div'); h2.innerHTML = '<b>🗺️ Mapas y rumores</b>'; h2.style.marginTop = '8px'; b.appendChild(h2);
    b.appendChild(this.card('🗺️ Pedazo del ' + MAP_NAMES[m], 'Tienes ' + S.pieces[m] + '/3 pedazos' + (S.xDug[m] ? ' (tesoro ya encontrado)' : ''), S.pieces[m] >= 3 ? 'Completo' : 'Comprar (' + mp + ')', S.pieces[m] < 3 && S.gold >= mp, () => { if (this.pay(mp)) givePiece(m); }));
    const rp = RUMORS_PRICE[wp.zone];
    b.appendChild(this.card('👂 Escuchar rumores', 'Un viejo marinero te cuenta dónde hay un secreto (lo marca en tu mapa).', 'Invitar ron (' + rp + ')', S.gold >= rp, () => { if (this.pay(rp)) this.rumor(wp.zone); }));
    // taberna propia
    const h3 = document.createElement('div'); h3.innerHTML = '<b>🍺 Tu taberna</b>'; h3.style.marginTop = '8px'; b.appendChild(h3);
    const t = S.taverns[wp.id], z = wp.zone;
    if (!t) {
      if (zoneHasTavern(z)) b.appendChild(this.card('Ya tienes una taberna en esta zona', 'Solo puedes abrir una taberna por zona. Explora nuevas zonas para abrir más.', null));
      else b.appendChild(this.card('🍺 Abrir taberna aquí', 'Gana ' + TAVERN.income[z] + ' de oro por minuto, incluso con el juego cerrado (hasta 8 horas).', 'Abrir (' + fmt(TAVERN.price[z]) + ')', S.gold >= TAVERN.price[z],
        () => { if (this.pay(TAVERN.price[z])) { S.taverns[wp.id] = { level: 1, keeper: false, stored: 0, last: Date.now() }; this.toast('🍺 ¡Abriste tu taberna en ' + PORTS[wp.id].name + '!'); } }, 'green'));
    } else {
      tavernTick();
      const rate = tavernRate(wp.id);
      const closed = t.closedUntil && Date.now() < t.closedUntil;
      b.appendChild(this.card('💰 Caja de la taberna', fmt(t.stored) + ' de oro acumulado · ' + rate.toFixed(0) + ' oro/min' + (closed ? '<br><b>Cerrada por el ataque pirata.</b>' : ''), 'Cobrar', t.stored >= 1, () => { const g = Math.floor(t.stored); t.stored -= g; addGold(g); Sfx.play('coin'); this.toast('+' + fmt(g) + ' de oro'); }, 'green'));
      const up = TAVERN.price[z] * t.level;
      b.appendChild(this.card('⬆️ Mejorar taberna (nivel ' + t.level + '/' + TAVERN.maxLevel + ')', 'Más mesas, más ron, más oro.', t.level >= TAVERN.maxLevel ? 'Máximo' : 'Mejorar (' + fmt(up) + ')', t.level < TAVERN.maxLevel && S.gold >= up, () => { tavernTick(); if (this.pay(up)) t.level++; }));
      if (!t.keeper) b.appendChild(this.card('🧔 Contratar tabernero', '+50% de ganancias', 'Contratar (' + fmt(Math.round(TAVERN.price[z] * 0.8)) + ')', S.gold >= TAVERN.price[z] * 0.8, () => { tavernTick(); if (this.pay(Math.round(TAVERN.price[z] * 0.8))) t.keeper = true; }));
      else b.appendChild(this.card('🧔 Tabernero contratado ✅', '+50% de ganancias', null));
    }
    const others = Object.keys(S.taverns).filter(id => +id !== wp.id);
    if (others.length) b.appendChild(this.card('📜 Tus otras tabernas', others.map(id => { tavernTick(); return PORTS[id].name + ': ' + fmt(S.taverns[id].stored) + ' en caja'; }).join('<br>') + '<br><i>Cobra cada caja visitando su puerto.</i>', null));
  },

  rumor(zone) {
    const opts = [];
    const z2 = Math.min(3, zone + 1);
    for (const w of World.wrecks) if (!S.wrecks[w.id] && (w.zone === zone || w.zone === z2) && !isRevealedWorld(w.x, w.y)) opts.push(['un barco hundido lleno de tesoros', w.x, w.y]);
    for (const c of World.caves) if (!S.caves[c.id] && (c.zone === zone || c.zone === z2) && !isRevealedWorld(c.x, c.y)) opts.push(['una cueva secreta en la costa', c.x, c.y]);
    for (const b in BOSSES) if (!S.bosses[b] && !isRevealedWorld(World.lairs[b].x, World.lairs[b].y) && BOSSES[b].zone <= z2) opts.push(['la guarida de ' + BOSSES[b].name, World.lairs[b].x, World.lairs[b].y]);
    for (const p of World.ports) if (!isRevealedWorld(p.x, p.y)) opts.push(['un puerto llamado ' + p.name, p.x, p.y]);
    if (!opts.length) { this.dialog('👂 Rumores', '"Ya lo has descubierto todo por aquí, capitán. ¡Prueba en otra zona!"', [{ label: 'Salud' }]); return; }
    const o = opts[Math.floor(Math.random() * opts.length)];
    revealAround(o[1], o[2], 3);
    this.dialog('👂 Rumores', '"Dicen que hay ' + o[0] + ' por estas aguas…"<br><br>Se marcó en tu mapa.', [{ label: 'Salud' }]);
  },

  tab_inmo(b) {
    if (!S.house) b.appendChild(this.card('🏠 Casa del capitán', 'Una mansión en tierra con una gran sala de tesoros, más grande y segura. <b>El sueño de todo pirata.</b>', 'Comprar (' + fmt(HOUSE_PRICE) + ')', S.gold >= HOUSE_PRICE, () => {
      if (this.pay(HOUSE_PRICE)) { S.house = true; saveGame(); setTimeout(() => checkEnding(), 50); }
    }, 'green'));
    else b.appendChild(this.card('🏠 Casa del capitán ✅', 'Tu mansión con sala de tesoros es tuya.', null));
    const hasRoom = S.house || S.stage === 4;
    const h = document.createElement('div'); h.innerHTML = '<b>🎨 Decoración</b> <span class="small">' + (hasRoom ? 'para tu sala de tesoros' : '(necesitas casa o galeón para decorar)') + '</span>'; h.style.margin = '8px 0 4px'; b.appendChild(h);
    for (const d of DECOR) {
      if (S.decor[d.id]) b.appendChild(this.card('✅ ' + d.name, 'Ya decora tu sala', null));
      else b.appendChild(this.card(d.name, '', 'Comprar (' + fmt(d.price) + ')', hasRoom && S.gold >= d.price, () => { if (this.pay(d.price)) S.decor[d.id] = true; }));
    }
  },

  tab_sala(b) {
    const c = document.createElement('canvas'); c.id = 'roomCv'; c.width = 960; c.height = 540; b.appendChild(c);
    Room.draw(c.getContext('2d'), 960, 540);
    const d = document.createElement('div'); d.className = 'small'; d.style.marginTop = '6px';
    d.textContent = (S.house ? 'Tu mansión en tierra.' : 'La sala de tesoros de tu Galeón.') + ' Las pilas de oro crecen con tu riqueza.';
    b.appendChild(d);
  },

  openRoom() {
    this.modal = 'room';
    this.show('<div class="panel"><h2>💎 Sala de tesoros <span class="g">💰 ' + fmt(S.gold) + '</span></h2><div class="body" id="roomBody"></div><div class="foot"><button class="btn pb" id="roomClose">Cerrar</button></div></div>');
    this.tab_sala($('roomBody'));
    $('roomClose').onclick = () => this.hide();
  },
};

function checkEnding() {
  if (S.ended) return;
  S.ended = true; saveGame();
  UI.dialog('👑 ¡De pobre a rico!', 'Empezaste con un bote lleno de huecos y hoy tienes tu propia <b>sala de tesoros</b>' + (S.house ? ' en tu mansión' : ' a bordo de tu Galeón') + '.<br><br>' +
    '💰 Oro ganado en total: <b>' + fmt(S.stats.earned) + '</b><br>⭐ Legendarios: ' + Object.keys(S.legends).length + '/6 · 🏆 Trofeos: ' + Object.keys(S.trophies).length + '/3<br>⏱️ Tiempo: ' + Math.floor(S.stats.time / 60) + ' minutos<br><br>' +
    '¡Gracias por jugar <b>Plunder Port</b>! Puedes seguir navegando para llenar tu sala.', [{ label: 'Ver mi sala', fn: () => UI.openRoom() }, { label: 'Seguir jugando' }]);
}

// ===== Sala de tesoros =====
const Room = {
  draw(g, w, h) {
    const house = S.house;
    // paredes
    g.fillStyle = house ? '#6d5a4a' : '#5a3a22'; g.fillRect(0, 0, w, h * 0.62);
    if (house) { g.strokeStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < h * 0.62; y += 30) for (let x = (y / 30 % 2) * 30; x < w; x += 60) g.strokeRect(x, y, 60, 30); }
    else {
      g.strokeStyle = 'rgba(0,0,0,.25)'; for (let y = 0; y < h * 0.62; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (const x of [120, 840]) { g.fillStyle = '#c9a35a'; g.beginPath(); g.arc(x, 90, 34, 0, 6.28); g.fill(); g.fillStyle = '#2d6ea3'; g.beginPath(); g.arc(x, 90, 27, 0, 6.28); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(x - 8, 82, 8, 0, 6.28); g.fill(); }
    }
    // suelo
    g.fillStyle = '#7a5230'; g.fillRect(0, h * 0.62, w, h * 0.38);
    g.strokeStyle = 'rgba(0,0,0,.2)'; for (let x = -200; x < w; x += 70) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 150, h * 0.62); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, h * 0.62 - 4, w, 8);
    if (S.decor.alfombra) { g.fillStyle = '#8e1b1b'; g.beginPath(); g.ellipse(w / 2, h * 0.84, 300, 70, 0, 0, 6.28); g.fill(); g.strokeStyle = '#ffd23f'; g.lineWidth = 4; g.stroke(); g.lineWidth = 1; }
    // decoración de pared
    if (S.decor.bandera) { g.fillStyle = '#111'; g.fillRect(410, 30, 140, 85); g.fillStyle = '#fff'; g.beginPath(); g.arc(480, 62, 18, 0, 6.28); g.fill(); g.fillRect(470, 74, 20, 12); g.fillStyle = '#111'; g.beginPath(); g.arc(473, 60, 5, 0, 6.28); g.arc(487, 60, 5, 0, 6.28); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.moveTo(450, 90); g.lineTo(510, 108); g.moveTo(510, 90); g.lineTo(450, 108); g.stroke(); g.lineWidth = 1; }
    if (S.decor.mapa) { g.fillStyle = '#d4a72c'; g.fillRect(180, 40, 150, 100); g.fillStyle = '#f3e2b3'; g.fillRect(188, 48, 134, 84); g.fillStyle = '#6aa0c8'; g.fillRect(196, 56, 118, 68); g.fillStyle = '#7cb36a'; g.beginPath(); g.arc(230, 80, 12, 0, 6.28); g.arc(280, 100, 16, 0, 6.28); g.fill(); g.strokeStyle = '#c00'; g.lineWidth = 3; g.beginPath(); g.moveTo(276, 96); g.lineTo(284, 104); g.moveTo(284, 96); g.lineTo(276, 104); g.stroke(); g.lineWidth = 1; }
    if (S.decor.lampara) { g.strokeStyle = '#d4a72c'; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, 30); g.stroke(); g.beginPath(); g.ellipse(w / 2, 34, 60, 12, 0, 0, 6.28); g.stroke(); for (let k = -2; k <= 2; k++) { g.fillStyle = '#ffeb99'; g.beginPath(); g.arc(w / 2 + k * 26, 26, 5, 0, 6.28); g.fill(); } g.lineWidth = 1; }
    // trofeos
    const trophies = ['serpent', 'kraken', 'ghost'];
    trophies.forEach((t, i) => {
      const x = 640 + i * 95, y = 40;
      g.fillStyle = '#4a2c14'; g.beginPath(); g.ellipse(x, y + 40, 38, 46, 0, 0, 6.28); g.fill(); g.strokeStyle = '#d4a72c'; g.lineWidth = 3; g.stroke(); g.lineWidth = 1;
      if (!S.trophies[t]) { g.fillStyle = 'rgba(255,255,255,.25)'; g.font = 'bold 28px sans-serif'; g.textAlign = 'center'; g.fillText('?', x, y + 50); return; }
      g.fillStyle = TROPHIES[t].color;
      if (t === 'serpent') { g.beginPath(); g.ellipse(x, y + 40, 18, 26, 0, 0, 6.28); g.fill(); g.fillStyle = '#ffeb3b'; g.beginPath(); g.arc(x - 7, y + 30, 4, 0, 6.28); g.arc(x + 7, y + 30, 4, 0, 6.28); g.fill(); }
      else if (t === 'kraken') { g.strokeStyle = TROPHIES[t].color; g.lineWidth = 10; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - 10, y + 75); g.bezierCurveTo(x - 30, y + 30, x + 30, y + 40, x + 5, y + 10); g.stroke(); g.lineWidth = 1; g.lineCap = 'butt'; g.fillStyle = '#ffd1e0'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x - 8 + k * 4, y + 60 - k * 12, 2.5, 0, 6.28); g.fill(); } }
      else { g.fillStyle = '#333'; g.fillRect(x - 12, y + 18, 24, 42); g.fillStyle = TROPHIES[t].color; g.globalAlpha = 0.8 + Math.sin(Date.now() / 300) * 0.2; g.fillRect(x - 8, y + 24, 16, 30); g.globalAlpha = 1; }
    });
    // pilas de oro
    const gold = S.gold;
    const piles = Math.min(9, Math.max(gold > 0 ? 1 : 0, Math.floor(Math.log10(gold + 1) * 1.8)));
    for (let i = 0; i < piles; i++) {
      const px = 120 + (i % 5) * 70 + (i >= 5 ? 35 : 0), py = h * 0.8 + (i >= 5 ? 50 : 0);
      const hgt = Math.min(110, 20 + Math.log10(gold + 1) * 14 + (i * 7) % 20);
      g.fillStyle = '#b8860b'; g.beginPath(); g.moveTo(px - 40, py); g.quadraticCurveTo(px, py - hgt * 2, px + 40, py); g.closePath(); g.fill();
      g.fillStyle = '#f5c542'; g.beginPath(); g.moveTo(px - 34, py - 4); g.quadraticCurveTo(px, py - hgt * 1.85, px + 34, py - 4); g.closePath(); g.fill();
      for (let k = 0; k < 6; k++) { g.fillStyle = '#ffe680'; g.beginPath(); g.ellipse(px - 20 + hash2(i, k, 5) * 40, py - 8 - hash2(i, k, 6) * hgt * 0.7, 6, 3, 0, 0, 6.28); g.fill(); }
    }
    // cofres abiertos y gemas según riqueza acumulada
    const chests = Math.min(3, Math.floor(S.stats.earned / 15000));
    for (let i = 0; i < chests; i++) {
      const x = 560 + i * 110, y = h * 0.86;
      g.fillStyle = '#6b4423'; g.fillRect(x - 35, y - 25, 70, 40); g.fillStyle = '#8a5a32'; g.beginPath(); g.moveTo(x - 35, y - 25); g.lineTo(x - 30, y - 60); g.lineTo(x + 30, y - 60); g.lineTo(x + 35, y - 25); g.fill();
      g.fillStyle = '#f5c542'; g.beginPath(); g.ellipse(x, y - 25, 32, 10, 0, 0, 6.28); g.fill();
      g.fillStyle = '#e0245e'; g.beginPath(); g.arc(x - 10, y - 30, 5, 0, 6.28); g.fill(); g.fillStyle = '#9ef0ff'; g.beginPath(); g.arc(x + 10, y - 29, 5, 0, 6.28); g.fill();
      g.fillStyle = '#d4a72c'; g.fillRect(x - 35, y - 8, 70, 5);
    }
    const gems = Math.min(40, Math.floor(S.stats.earned / 3000));
    for (let i = 0; i < gems; i++) {
      const x = 60 + hash2(i, 1, 9) * (w - 120), y = h * 0.66 + hash2(i, 2, 9) * h * 0.3;
      g.fillStyle = ['#e0245e', '#9ef0ff', '#3ddc84', '#b06cff'][i % 4];
      g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 5, y); g.lineTo(x, y + 6); g.lineTo(x - 5, y); g.fill();
      if ((Date.now() / 200 + i) % 10 < 1) { g.fillStyle = '#fff'; g.fillRect(x - 1, y - 9, 2, 6); g.fillRect(x - 3, y - 7, 6, 2); }
    }
    // vitrinas
    LEGEND_ORDER.forEach((l, i) => Room.vitrine(g, 80 + i * 72, h * 0.42, l));
    // decoración de suelo
    if (S.decor.candelabros) for (const x of [30, w - 30]) { g.fillStyle = '#d4a72c'; g.fillRect(x - 4, h * 0.45, 8, 120); g.fillRect(x - 18, h * 0.45, 36, 6); for (const dx of [-14, 0, 14]) { g.fillStyle = '#fff8e1'; g.fillRect(x + dx - 3, h * 0.45 - 16, 6, 16); g.fillStyle = '#ffb300'; g.beginPath(); g.arc(x + dx, h * 0.45 - 20, 4, 0, 6.28); g.fill(); } }
    if (S.decor.loro) { const x = 700, y = h * 0.36; g.strokeStyle = '#6b4423'; g.lineWidth = 4; g.beginPath(); g.moveTo(x - 30, y + 30); g.lineTo(x + 30, y + 30); g.stroke(); g.lineWidth = 1; g.fillStyle = '#e53935'; g.beginPath(); g.ellipse(x, y + 10, 12, 20, 0, 0, 6.28); g.fill(); g.fillStyle = '#1e88e5'; g.beginPath(); g.ellipse(x + 4, y + 18, 6, 14, 0.3, 0, 6.28); g.fill(); g.fillStyle = '#fdd835'; g.beginPath(); g.moveTo(x + 10, y - 2); g.lineTo(x + 18, y + 2); g.lineTo(x + 10, y + 6); g.fill(); }
    if (S.decor.canon) { const x = w - 140, y = h * 0.9; g.fillStyle = '#5a3a22'; g.beginPath(); g.arc(x - 20, y, 14, 0, 6.28); g.arc(x + 20, y, 14, 0, 6.28); g.fill(); g.fillStyle = '#d4a72c'; g.save(); g.translate(x, y - 16); g.rotate(-0.25); g.fillRect(-40, -12, 80, 24); g.beginPath(); g.arc(-40, 0, 14, 0, 6.28); g.fill(); g.restore(); }
    if (S.decor.estatua) { const x = 590, y = h * 0.62; g.fillStyle = '#9e9e9e'; g.fillRect(x - 30, y - 10, 60, 30); g.fillStyle = '#d4a72c'; g.fillRect(x - 12, y - 80, 24, 70); g.beginPath(); g.arc(x, y - 92, 14, 0, 6.28); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.moveTo(x - 20, y - 100); g.lineTo(x + 20, y - 100); g.lineTo(x, y - 118); g.fill(); }
    // título
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, h - 34, w, 34);
    g.fillStyle = '#ffd23f'; g.font = 'bold 20px sans-serif'; g.textAlign = 'left';
    g.fillText('💰 ' + fmt(S.gold) + ' de oro', 14, h - 10);
    g.textAlign = 'right'; g.fillStyle = '#ffe9b0'; g.font = '15px sans-serif';
    g.fillText('⭐ ' + Object.keys(S.legends).length + '/6  🏆 ' + Object.keys(S.trophies).length + '/3  🎨 ' + Object.keys(S.decor).length + '/' + DECOR.length, w - 14, h - 11);
  },
  vitrine(g, x, y, l) {
    g.fillStyle = '#4a2c14'; g.fillRect(x - 30, y + 40, 60, 50);
    g.fillStyle = '#d4a72c'; g.fillRect(x - 32, y + 36, 64, 6);
    g.fillStyle = 'rgba(180,230,255,0.22)'; g.fillRect(x - 28, y - 30, 56, 66);
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.strokeRect(x - 28, y - 30, 56, 66);
    if (!S.legends[l]) { g.fillStyle = 'rgba(255,255,255,.3)'; g.font = 'bold 24px sans-serif'; g.textAlign = 'center'; g.fillText('?', x, y + 12); return; }
    const c = LEGENDS[l].color;
    g.fillStyle = c + '55'; g.beginPath(); g.arc(x, y + 4, 24, 0, 6.28); g.fill();
    g.fillStyle = c; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    if (l === 'skull') { g.beginPath(); g.arc(x, y, 14, 0, 6.28); g.fill(); g.fillRect(x - 8, y + 8, 16, 10); g.fillStyle = '#000'; g.beginPath(); g.arc(x - 5, y - 2, 4, 0, 6.28); g.arc(x + 5, y - 2, 4, 0, 6.28); g.fill(); }
    else if (l === 'trident') { g.fillRect(x - 2, y - 10, 4, 40); g.fillRect(x - 12, y - 10, 24, 4); g.fillRect(x - 12, y - 24, 4, 16); g.fillRect(x + 8, y - 24, 4, 16); g.fillRect(x - 2, y - 26, 4, 18); }
    else if (l === 'crown') { g.beginPath(); g.moveTo(x - 18, y + 12); g.lineTo(x - 18, y - 8); g.lineTo(x - 9, y + 2); g.lineTo(x, y - 14); g.lineTo(x + 9, y + 2); g.lineTo(x + 18, y - 8); g.lineTo(x + 18, y + 12); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#e0245e'; g.beginPath(); g.arc(x, y + 5, 3, 0, 6.28); g.fill(); }
    else if (l === 'chalice') { g.beginPath(); g.moveTo(x - 14, y - 14); g.lineTo(x + 14, y - 14); g.quadraticCurveTo(x + 12, y + 4, x + 2, y + 6); g.lineTo(x + 2, y + 18); g.lineTo(x + 10, y + 22); g.lineTo(x - 10, y + 22); g.lineTo(x - 2, y + 18); g.lineTo(x - 2, y + 6); g.quadraticCurveTo(x - 12, y + 4, x - 14, y - 14); g.fill(); g.stroke(); }
    else if (l === 'pearl') { g.fillStyle = '#e8d9c0'; g.beginPath(); g.ellipse(x, y + 14, 20, 6, 0, 0, 6.28); g.fill(); g.fillStyle = c; g.beginPath(); g.arc(x, y + 2, 12, 0, 6.28); g.fill(); g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(x - 4, y - 2, 3, 0, 6.28); g.fill(); }
    else if (l === 'compass') { g.fillStyle = '#d4a72c'; g.beginPath(); g.arc(x, y + 2, 16, 0, 6.28); g.fill(); g.fillStyle = '#f3e2b3'; g.beginPath(); g.arc(x, y + 2, 12, 0, 6.28); g.fill(); g.fillStyle = c; g.save(); g.translate(x, y + 2); g.rotate(Date.now() / 400); g.beginPath(); g.moveTo(0, -11); g.lineTo(3, 0); g.lineTo(-3, 0); g.fill(); g.restore(); }
    g.lineWidth = 1;
  },
};
