'use strict';
// ===== Interfaz =====
const $ = id => document.getElementById(id);
const fmt = n => Math.floor(n).toLocaleString('es-ES');

const UI = {
  modal: null, port: null, tab: 'puerto', dialogQueue: [], dialogActive: false, shownGold: 0,

  init() {
    const cv = Render.cv;
    let down = false, lastPath = 0;
    const toWorld = (e) => {
      const r = cv.getBoundingClientRect(), v = Render.view;
      return { x: v.left + (e.clientX - r.left) / v.zm, y: v.top + (e.clientY - r.top) / v.zm };
    };
    cv.addEventListener('pointerdown', e => {
      Sfx.resume();
      if (G.paused || this.modal || this.dialogActive || G.demo || !Render.view) return;
      down = true; const p = toWorld(e); setDestination(p.x, p.y); lastPath = performance.now();
    });
    cv.addEventListener('pointermove', e => {
      if (!down || G.paused) return;
      const now = performance.now();
      if (now - lastPath > 180) { lastPath = now; const p = toWorld(e); setDestination(p.x, p.y); }
    });
    window.addEventListener('pointerup', () => { down = false; });
    window.addEventListener('pointercancel', () => { down = false; });

    $('fireBtn').innerHTML = ic('cannon', 40) + '<span class="lbl">FUEGO</span>';
    $('specialBtn').innerHTML += ic('bolt', 24) + '<span class="lbl">ANDANADA</span>';
    $('menuBtn').innerHTML = ic('gear', 24);
    $('townBtn').innerHTML = ic('anchor', 18) + ' Menú del puerto';
    $('hpLbl').innerHTML = ic('heart', 15) + ' Casco';
    $('waterLbl').innerHTML = ic('drop', 15) + ' Agua';
    $('moraleLbl').innerHTML = ic('smile', 15) + ' Moral';

    const fb = $('fireBtn');
    const fireOn = e => { e.preventDefault(); Sfx.resume(); G.fireHeld = true; if (G.mode === 'land') Land.attack(); else fire(); };
    const fireOff = () => { G.fireHeld = false; };
    fb.addEventListener('pointerdown', fireOn); fb.addEventListener('pointerup', fireOff); fb.addEventListener('pointerleave', fireOff); fb.addEventListener('pointercancel', fireOff);
    $('specialBtn').addEventListener('pointerdown', e => { e.preventDefault(); specialVolley(); });
    $('patchBtn').addEventListener('click', () => patchHole());
    $('actionBtn').addEventListener('click', () => doAction());
    $('menuBtn').addEventListener('click', () => { Sfx.play('ui'); this.openPause(); });
    $('mini').addEventListener('click', () => { Sfx.play('page'); this.openMap(); });
    $('townBtn').addEventListener('click', () => { if (Land.town !== null) this.openPort(Land.town, 'puerto'); });

    window.addEventListener('keydown', e => {
      G.keys[e.key] = true;
      if (this.modal || this.dialogActive) { if (e.key === 'Escape') this.back(); return; }
      if (e.key === ' ') { G.fireHeld = true; if (G.mode === 'land') Land.attack(); e.preventDefault(); }
      if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') doAction();
      if (e.key === 'q' || e.key === 'Q') specialVolley();
      if (e.key === 'r' || e.key === 'R') patchHole();
      if (e.key === 'm' || e.key === 'M') this.openMap();
      if (e.key === 'Escape') this.openPause();
    });
    window.addEventListener('keyup', e => { G.keys[e.key] = false; if (e.key === ' ') G.fireHeld = false; });
    window.addEventListener('blur', () => { G.keys = {}; G.fireHeld = false; });
  },

  setMode() {
    const land = G.mode === 'land';
    $('fireBtn').innerHTML = land ? ic('sword', 40) + '<span class="lbl">ESPADA</span>' : ic('cannon', 40) + '<span class="lbl">FUEGO</span>';
    $('specialBtn').style.display = land ? 'none' : '';
    $('patchBtn').style.display = land ? 'none' : '';
    $('townBtn').style.display = land && Land.town !== null ? 'inline-flex' : 'none';
    $('seaRows').style.display = land ? 'none' : '';
    $('hpLbl').innerHTML = land ? ic('heart', 15) + ' Vida' : ic('heart', 15) + ' Casco';
    $('fireBtn').style.display = land && Land.town !== null ? 'none' : '';
  },

  toast(text, secs, icon) {
    const box = $('toasts');
    const d = document.createElement('div'); d.className = 'toast';
    d.innerHTML = (icon ? ic(icon, 18) : '') + '<span></span>'; d.lastChild.textContent = text;
    box.appendChild(d);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => { d.style.transition = 'opacity .4s, transform .4s'; d.style.opacity = '0'; d.style.transform = 'translateY(-8px)'; setTimeout(() => d.remove(), 400); }, (secs || 2.6) * 1000);
  },
  banner(title, sub, icon, secs) {
    const b = $('bigBanner');
    $('bbT').innerHTML = (icon ? ic(icon, 30) : '') + '<span></span>'; $('bbT').lastChild.textContent = title;
    $('bbS').textContent = sub || '';
    b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
    clearTimeout(this.bbT); this.bbT = setTimeout(() => b.classList.remove('on'), (secs || 2.6) * 1000);
  },
  zoneBanner(title, sub) {
    const z = $('zoneBanner'); $('zbT').textContent = title; $('zbS').textContent = sub || '';
    z.style.opacity = 1; clearTimeout(this.zbT); this.zbT = setTimeout(() => z.style.opacity = 0, 2600);
  },
  coinBurst(n, wx, wy) {
    if (G.demo) return;
    const layer = $('coinLayer'), tgt = $('gold').getBoundingClientRect();
    let sx = Render.w / 2, sy = Render.h / 2;
    if (wx !== undefined && Render.view) { sx = (wx - Render.view.left) * Render.view.zm; sy = (wy - Render.view.top) * Render.view.zm; }
    const count = Math.min(10, 2 + Math.floor(Math.log10(n + 1) * 2));
    for (let i = 0; i < count; i++) {
      const c = document.createElement('div'); c.className = 'flycoin'; c.innerHTML = ic('coin', 18);
      c.style.left = (sx + (Math.random() - 0.5) * 40) + 'px'; c.style.top = (sy + (Math.random() - 0.5) * 40) + 'px';
      layer.appendChild(c);
      setTimeout(() => { c.style.transform = 'translate(' + (tgt.left + 10 - parseFloat(c.style.left)) + 'px,' + (tgt.top + 6 - parseFloat(c.style.top)) + 'px) scale(.7)'; c.style.opacity = '0'; }, 30 + i * 45);
      setTimeout(() => { c.remove(); $('gold').classList.add('bump'); setTimeout(() => $('gold').classList.remove('bump'), 120); }, 830 + i * 45);
    }
    setTimeout(() => Sfx.play('coins', 0.6), 650);
  },

  // ---------- HUD ----------
  hudT: 0, miniT: 0,
  hud(dt) {
    this.hudT -= dt; this.miniT -= dt;
    // contador de oro animado
    const diff = S.gold - this.shownGold;
    this.shownGold += Math.abs(diff) < 1 ? diff : diff * Math.min(1, dt * 6);
    if (this.miniT <= 0) { this.miniT = 0.2; const g = $('mini').getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); Render.drawMap(g, 118, 118, false); }
    if (this.hudT > 0) return; this.hudT = 0.08;
    const st = stats();
    $('gold').innerHTML = ic('coin', 20) + ' ' + fmt(this.shownGold);
    $('shipName').textContent = SHIPS[S.stage].name;
    $('cargo').innerHTML = ic('crate', 15) + ' ' + cargoUsed() + '/' + st.hold;
    $('cargo').style.color = cargoUsed() >= st.hold ? '#ff8a80' : '';
    $('cargoVal').textContent = cargoValue() ? '≈ ' + fmt(cargoValue()) : '';
    if (G.mode === 'land' && G.hero) {
      $('hpTxt').textContent = Math.ceil(G.hero.hp) + '/' + G.hero.maxHp;
      $('hpBar').style.width = (G.hero.hp / G.hero.maxHp * 100) + '%';
      $('hpBar').style.backgroundColor = '#e5394a';
    } else {
      const f = S.hp / st.maxHp;
      $('hpTxt').textContent = Math.max(0, Math.ceil(S.hp)) + '/' + st.maxHp;
      $('hpBar').style.width = Math.max(0, f * 100) + '%';
      $('hpBar').style.backgroundColor = f > 0.5 ? '#5ad15a' : f > 0.25 ? '#e8c64a' : '#e85a4a';
    }
    $('holesTxt').innerHTML = ic('hole', 14) + ' ' + S.holes;
    $('waterBar').style.width = Math.min(100, S.water) + '%';
    $('waterBar').style.backgroundColor = S.water > 70 ? '#e85a4a' : '#3fa9f5';
    $('planksTxt').innerHTML = ic('plank', 14) + ' ' + S.planks;
    $('moraleBar').style.width = S.morale + '%';
    $('obj').innerHTML = ic('target', 15) + '<span></span>'; $('obj').lastChild.textContent = objective();
    const c = S.contract;
    if (c) { $('contract').style.display = 'inline-flex'; $('contract').innerHTML = ic('scroll', 14) + '<span></span>'; $('contract').lastChild.textContent = c.title + ' (' + (c.type === 'sell' ? fmt(c.have) + '/' + fmt(c.need) : c.have + '/' + c.need) + ')'; }
    else $('contract').style.display = 'none';
    $('patchBtn').innerHTML = ic('plank', 20) + ' Tapar (' + S.planks + ')';
    $('patchBtn').disabled = S.holes === 0 || S.planks === 0;
    $('fireBtn').style.filter = G.mode === 'sea' && G.reload > 0 ? 'brightness(.65)' : '';
    // recarga de andanada
    const sc = $('specCd').getContext('2d'); sc.clearRect(0, 0, 72, 72);
    if (G.special > 0) { sc.fillStyle = 'rgba(0,0,0,.55)'; sc.beginPath(); sc.moveTo(36, 36); sc.arc(36, 36, 36, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (G.special / 14)); sc.fill(); }
    else { sc.strokeStyle = 'rgba(255,230,140,' + (0.5 + Math.sin(G.time * 5) * 0.4) + ')'; sc.lineWidth = 4; sc.beginPath(); sc.arc(36, 36, 33, 0, 6.28); sc.stroke(); }
    const ab = $('actionBtn');
    if (G.nearby && !G.paused) { ab.style.display = 'inline-flex'; ab.innerHTML = ic(G.nearby.icon || 'hand', 22) + '<span></span>'; ab.lastChild.textContent = G.nearby.label; ab.classList.toggle('hot', !!G.nearby.hot); }
    else ab.style.display = 'none';
    $('windArrow').innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" style="transform:rotate(' + G.wind + 'rad)"><path d="M3 12h13M12 6l7 6-7 6" fill="none" stroke="#bfe6ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const night = nightFactor();
    const hour = Math.floor(((G.dayT * 24) + 6) % 24);
    $('clock').innerHTML = (night > 0.5 ? '<svg width="14" height="14" viewBox="0 0 24 24"><path d="M15 3a9 9 0 1 0 6 15A8 8 0 0 1 15 3Z" fill="#dfe8ff"/></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="#ffd23f"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4M4 4l3 3M17 17l3 3M4 20l3-3M17 7l3-3" stroke="#ffd23f" stroke-width="2"/></svg>') + ' ' + (hour < 10 ? '0' : '') + hour + ':00';
    if (G.boss) { $('bossBar').style.display = 'block'; $('bossName').innerHTML = ic('skull', 16) + '<span></span>'; $('bossName').lastChild.textContent = BOSSES[G.boss.type].name; $('bossHp').style.width = Math.max(0, G.boss.hp / G.boss.maxHp * 100) + '%'; }
    else $('bossBar').style.display = 'none';
    if (G.raid) { $('raidBox').style.display = 'flex'; $('raidBox').innerHTML = ic('fire', 16) + '<span></span>'; $('raidBox').lastChild.textContent = 'Taberna atacada en ' + PORTS[G.raid.port].name + ': ' + Math.ceil(G.raid.time) + 's'; }
    else $('raidBox').style.display = 'none';
  },

  // ---------- Ventanas ----------
  show(html) { const o = $('overlay'); o.innerHTML = html; o.style.display = 'flex'; G.paused = true; G.fireHeld = false; },
  hide() { $('overlay').style.display = 'none'; $('overlay').innerHTML = ''; this.modal = null; G.paused = this.dialogActive; this.roomAnim = false; },
  back() {
    if (this.dialogActive) return;
    if (this.modal) { if (this.modal === 'port') this.leavePort(); else this.hide(); }
    else this.openPause();
  },
  dialog(title, html, buttons, icon) {
    this.dialogQueue.push({ title, html, buttons, icon });
    if (!this.dialogActive) this.nextDialog();
  },
  closeDialog() { const l = $('dlgLayer'); l.style.display = 'none'; l.innerHTML = ''; this.dialogActive = false; G.paused = !!this.modal || !!G.playerSunk; },
  nextDialog() {
    if (this.dialogActive || !this.dialogQueue.length) return;
    const d = this.dialogQueue.shift();
    this.dialogActive = true; G.paused = true; G.fireHeld = false;
    const l = $('dlgLayer');
    l.innerHTML = '<div class="panel dlg"><h2><span>' + d.title + '</span></h2><div class="body">' + (d.icon ? '<div class="bigic">' + ic(d.icon, 56) + '</div>' : '') + d.html + '</div><div class="foot" id="dlgFoot"></div></div>';
    l.style.display = 'flex';
    Sfx.play('page');
    const foot = $('dlgFoot');
    (d.buttons || [{ label: 'OK' }]).forEach(b => {
      const el = document.createElement('button'); el.className = 'btn pb' + (b.cls ? ' ' + b.cls : ''); el.textContent = b.label;
      el.onclick = () => { Sfx.play('ui'); this.closeDialog(); if (b.fn) b.fn(); if (this.modal === 'port') this.renderPort(); this.nextDialog(); };
      foot.appendChild(el);
    });
  },

  // ---------- Mapa ----------
  openMap() {
    if (this.modal || this.dialogActive) return;
    this.modal = 'map';
    this.show('<div class="mapWrap"><canvas id="mapCv"></canvas><button class="btn pb close" id="mapClose">' + ic('close', 16) + ' Cerrar</button><div class="hint">' + (G.mode === 'sea' ? 'Toca un punto del mapa para navegar hasta allí' : 'Vuelve al barco para navegar') + '</div></div>');
    const cv = $('mapCv');
    const draw = () => {
      const r = cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
      cv.width = r.width * d; cv.height = r.height * d;
      const g = cv.getContext('2d'); g.scale(d, d);
      this.mapT = Render.drawMap(g, r.width, r.height, true);
      // leyenda
      g.fillStyle = 'rgba(30,16,4,.75)'; g.fillRect(8, 8, 200, 118); g.strokeStyle = '#c9a35a'; g.strokeRect(8, 8, 200, 118);
      g.font = '12px Georgia, serif'; g.textAlign = 'left';
      const rows = [['anchor', 'Puerto'], ['mug', 'Tu taberna'], ['wreck', 'Naufragio'], ['cave', 'Cueva'], ['skull', 'Guarida de jefe'], ['xmark', 'Tesoro del mapa']];
      rows.forEach(([icn, t], i) => { drawIcon(g, icn, 22 + (i % 2) * 96, 24 + Math.floor(i / 2) * 22, 15); g.fillStyle = '#ffe9b0'; g.fillText(t, 33 + (i % 2) * 96, 28 + Math.floor(i / 2) * 22); });
      g.fillStyle = '#ffe9b0';
      g.fillText('Zona: ' + ZONES[G.curZone].name, 16, 98);
      g.fillText('Mapa revelado: ' + Math.round(G.revealed.reduce((a, b) => a + b, 0) / (WW * WH) * 100) + '%', 16, 116);
    };
    requestAnimationFrame(draw);
    cv.addEventListener('pointerdown', e => {
      if (G.mode !== 'sea') return;
      const r = cv.getBoundingClientRect(), t = this.mapT; if (!t) return;
      const wx = ((e.clientX - r.left - t.ox) / t.sc + t.sx) * TILE, wy = ((e.clientY - r.top - t.oy) / t.sc + t.sy) * TILE;
      if (wx < 0 || wy < 0 || wx > WW * TILE || wy > WH * TILE) return;
      this.hide(); setDestination(wx, wy);
      if (!G.path) this.toast('No se puede llegar navegando hasta ahí.', 2, 'warn');
    });
    $('mapClose').onclick = () => this.hide();
  },

  // ---------- Pausa ----------
  openPause() {
    if (this.modal || this.dialogActive || G.demo) return;
    this.modal = 'pause';
    const room = S.house || S.stage === 4;
    this.show('<div class="panel dlg"><h2><span>' + ic('gear', 20) + ' Menú</span><span class="g">' + ic('coin', 18) + ' ' + fmt(S.gold) + '</span></h2><div class="body" id="pauseBody"></div></div>');
    const b = $('pauseBody'), s = S.stats;
    b.innerHTML = '<div style="text-align:left;font-size:13px;margin-bottom:10px;line-height:1.7">' +
      ic('ship', 16) + ' <b>' + SHIPS[S.stage].name + '</b> · ' + ic('people', 16) + ' ' + (S.crew.map(c => CREW[c].name).join(', ') || 'sin tripulación') + '<br>' +
      ic('scroll', 16) + ' Mapas: ' + S.pieces.map((p, i) => p + '/3').join(' · ') + ' &nbsp; ' + ic('star', 16) + ' ' + Object.keys(S.legends).length + '/6 &nbsp; ' + ic('trophy', 16) + ' ' + Object.keys(S.trophies).length + '/3 &nbsp; ' + ic('mug', 16) + ' ' + Object.keys(S.taverns).length + '/4<br>' +
      ic('stats', 16) + ' Oro ganado ' + fmt(s.earned) + ' · Botín ' + s.loot + ' · Piratas hundidos ' + s.enemies + ' · Abordajes ' + s.boarded + ' · Tesoros cavados ' + s.dug + ' · ' + Math.floor(s.time / 60) + ' min</div>';
    const btns = [
      ['play', 'Continuar', () => this.hide()],
      ['map', 'Mapa', () => { this.hide(); this.openMap(); }],
      room ? ['diamond', 'Sala de tesoros', () => { this.hide(); this.openRoom(); }] : null,
      ['question', 'Cómo jugar', () => { this.hide(); this.help(); }],
      [S.sound ? 'speaker' : 'mute', 'Efectos: ' + (S.sound ? 'sí' : 'no'), () => { S.sound = !S.sound; Sfx.applySettings(); this.hide(); this.openPause(); }],
      ['music', 'Música: ' + (S.music ? 'sí' : 'no'), () => { S.music = !S.music; Sfx.applySettings(); this.hide(); this.openPause(); }],
      ['bolt', 'Vibración: ' + (S.vibe ? 'sí' : 'no'), () => { S.vibe = !S.vibe; this.hide(); this.openPause(); }],
      ['save', 'Guardar', () => { saveGame(); this.toast('Partida guardada', 2, 'save'); }],
      ['trash', 'Borrar partida', () => { this.hide(); this.dialog('¿Borrar partida?', 'Perderás todo tu progreso. Esto no se puede deshacer.', [{ label: 'Cancelar' }, { label: 'Borrar', cls: 'red', fn: () => resetGame() }], 'warn'); }],
    ].filter(Boolean);
    const wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center';
    for (const [icn, l, f] of btns) { const e = document.createElement('button'); e.className = 'btn pb'; e.innerHTML = ic(icn, 18) + ' ' + l; e.onclick = () => { Sfx.play('ui'); f(); }; wrap.appendChild(e); }
    b.appendChild(wrap);
  },

  help() {
    const row = (icn, t) => '<div style="display:flex;gap:8px;align-items:flex-start;margin:5px 0">' + ic(icn, 20) + '<span>' + t + '</span></div>';
    this.dialog('Cómo jugar', '<div style="text-align:left;font-size:13px">' +
      row('target', '<b>Ciclo:</b> explorar, saquear, vender, mejorar y expandirse. Sigue la flecha dorada.') +
      row('hand', '<b>Toca el mar</b> o el mapa para navegar. Pasa sobre el botín flotante para recogerlo.') +
      row('boot', 'Acércate a una isla y pulsa <b>Desembarcar</b>: camina, cava donde brille la arena y entra a cuevas.') +
      row('anchor', 'En los puertos camina por el pueblo y <b>entra a los edificios</b>: mercado, tienda, astillero, taberna...') +
      row('hole', 'Tu bote <b>hace agua</b>: tapa huecos con tablas. Si se llena, pierdes la mitad del botín.') +
      row('cannon', '<b>Fuego</b> apunta solo al enemigo más cercano. La <b>Andanada</b> dispara todos los cañones.') +
      row('sword', 'Cuando un pirata está muy dañado, acércate y <b>abórdalo</b> para quedarte con todo.') +
      row('barrel', 'Dispara a los <b>barriles rojos</b> cerca de los enemigos. Las <b>botellas</b> traen mensajes.') +
      row('mug', 'Abre <b>tabernas</b> para ganar oro aunque no juegues. Acepta <b>contratos</b> en el tablón.') +
      row('crown', 'Meta final: tu <b>sala de tesoros</b> en una casa o en el Galeón, llena de leyendas y trofeos.') +
      '</div>', [{ label: '¡A navegar!' }], 'question');
  },

  // ---------- Puerto ----------
  openPort(id, tab) {
    if (this.modal || this.dialogActive) return;
    this.port = id; this.tab = tab || 'puerto'; this.modal = 'port';
    S.lastPort = id;
    tavernTick(); saveGame();
    this.renderPort();
    Sfx.play('page');
  },
  leavePort() { saveGame(); this.hide(); },
  renderPort() {
    const p = PORTS[this.port], wp = World.ports[this.port];
    const tabs = [['puerto', 'anchor', 'Capitanía'], ['mercado', 'coin', 'Mercado'], ['tienda', 'hammer', 'Tienda'], ['astillero', 'ship', 'Astillero'], ['taberna', 'mug', 'Taberna']];
    if (p.estate) tabs.push(['inmo', 'house', 'Inmobiliaria']);
    if (S.house || S.stage === 4) tabs.push(['sala', 'diamond', 'Sala']);
    let h = '<div class="panel"><h2><span>' + ic('anchor', 20) + p.name + ' <span class="small" style="color:#ffe9b0;font-weight:normal">· ' + ZONES[wp.zone].name + '</span></span><span class="g">' + ic('coin', 18) + ' ' + fmt(S.gold) + '</span></h2><div class="tabs">';
    for (const [k, icn, l] of tabs) h += '<button class="tab' + (this.tab === k ? ' on' : '') + '" data-tab="' + k + '">' + ic(icn, 15) + l + '</button>';
    h += '</div><div class="body" id="portBody"></div><div class="foot"><span class="small" style="flex:1;display:flex;gap:10px;align-items:center;flex-wrap:wrap">' + ic('crate', 15) + cargoUsed() + '/' + stats().hold + ' ' + ic('heart', 15) + Math.ceil(S.hp) + '/' + stats().maxHp + ' ' + ic('hole', 15) + S.holes + ' ' + ic('plank', 15) + S.planks + '</span><button class="btn pb green" id="sailBtn">' + ic('boot', 16) + ' Salir</button></div></div>';
    const scroll = $('portBody') ? $('portBody').scrollTop : 0;
    this.show(h);
    this.modal = 'port';
    document.querySelectorAll('.tab').forEach(b => b.onclick = () => { Sfx.play('ui'); this.tab = b.dataset.tab; this.renderPort(); $('portBody').scrollTop = 0; });
    $('sailBtn').onclick = () => { Sfx.play('ui'); this.leavePort(); };
    const body = $('portBody');
    this['tab_' + this.tab](body, wp);
    body.scrollTop = scroll;
  },
  card(icon, title, desc, btnLabel, enabled, fn, cls) {
    const c = document.createElement('div'); c.className = 'card';
    c.innerHTML = (icon ? '<div class="ico">' + ic(icon, 28) + '</div>' : '') + '<div class="info"><div class="t">' + title + '</div><div class="d">' + desc + '</div></div>';
    if (btnLabel) {
      const b = document.createElement('button'); b.className = 'btn pb' + (cls ? ' ' + cls : ''); b.innerHTML = btnLabel; b.disabled = !enabled;
      b.onclick = () => { fn(); this.renderPort(); };
      c.appendChild(b);
    }
    return c;
  },
  sec(b, icon, text) { const h = document.createElement('div'); h.className = 'sec'; h.innerHTML = ic(icon, 18) + text; b.appendChild(h); },
  pay(n) { if (S.gold < n) { Sfx.play('err'); this.toast('No tienes suficiente oro.', 2, 'coin'); return false; } S.gold -= n; this.shownGold = S.gold; Sfx.play('buy'); return true; },
  price(n) { return ic('coin', 14) + ' ' + fmt(n); },

  tab_puerto(b) {
    const st = stats();
    const missing = Math.max(0, st.maxHp - S.hp);
    const cost = Math.ceil(missing * 1.2 + S.holes * 6 + S.water * 0.3);
    b.appendChild(this.card('hammer', 'Reparar el barco', 'Casco ' + Math.ceil(S.hp) + '/' + st.maxHp + ', ' + S.holes + ' huecos, agua ' + Math.round(S.water) + '%', cost ? 'Reparar ' + this.price(cost) : 'Perfecto', cost > 0 && S.gold >= cost,
      () => { if (this.pay(cost)) { S.hp = st.maxHp; S.holes = 0; S.water = 0; Sfx.play('hammer'); } }, 'green'));
    if (cost > 0 && S.gold < cost && S.gold > 0) {
      b.appendChild(this.card('hammer', 'Reparación parcial', 'Gasta todo tu oro en reparar lo que alcance', 'Reparar ' + this.price(S.gold), true, () => {
        let g = S.gold; S.gold = 0; const h = Math.min(S.holes, Math.floor(g / 6)); S.holes -= h; g -= h * 6; S.water = 0; S.hp = Math.min(st.maxHp, S.hp + g / 1.2); Sfx.play('hammer');
      }));
    }
    const need = st.maxPlanks - S.planks;
    b.appendChild(this.card('plank', 'Tablas para tapar huecos', 'Tienes ' + S.planks + '/' + st.maxPlanks + ' · ' + PLANK_PRICE + ' monedas cada una', need > 0 ? 'Llenar ' + this.price(need * PLANK_PRICE) : 'Lleno', need > 0 && S.gold >= need * PLANK_PRICE,
      () => { if (this.pay(need * PLANK_PRICE)) S.planks = st.maxPlanks; }));
    if (need > 1) b.appendChild(this.card('plank', 'Comprar 1 tabla', '', 'Comprar ' + this.price(PLANK_PRICE), S.gold >= PLANK_PRICE, () => { if (this.pay(PLANK_PRICE)) S.planks++; }));
    const tavs = Object.keys(S.taverns).map(id => PORTS[id].name + ': ' + fmt(S.taverns[id].stored)).join(' · ');
    b.appendChild(this.card('save', 'Progreso guardado', 'Este puerto es tu punto de partida si te hunden.' + (tavs ? '<br>Cajas de tus tabernas: ' + tavs : ''), null));
    b.appendChild(this.card('ship', SHIPS[S.stage].name, 'Velocidad ' + Math.round(st.speed) + ' · Bodega ' + st.hold + ' · Cañones ' + st.cannons + ' · Daño ' + st.dmg.toFixed(1) + ' · Críticos ' + Math.round(st.crit * 100) + '% · Tripulación ' + S.crew.length + '/' + st.crewSlots + (st.leak ? ' · Hueco nuevo cada ' + Math.round(st.leak) + 's' : ' · No hace agua'), null));
  },

  tab_mercado(b, wp) {
    const known = World.ports.filter(p => isRevealedWorld(p.x, p.y) && p.id !== wp.id);
    let h = '<table><tr><th>Botín</th><th>Tienes</th><th>Aquí</th>' + known.map(p => '<th class="small">' + p.name.split(' ').pop() + '</th>').join('') + '<th></th></tr>';
    for (const k of ITEM_ORDER) {
      const pr = priceAt(wp.id, k), base = ITEMS[k].value;
      const cls = pr > base * 1.05 ? 'up' : pr < base * 0.95 ? 'down' : '';
      h += '<tr><td>' + ic(ITEMS[k].icon, 18) + ITEMS[k].name + '</td><td>' + S.cargo[k] + '</td><td class="' + cls + '">' + pr + '</td>' +
        known.map(p => { const o = priceAt(p.id, k); return '<td class="small ' + (o > pr ? 'up' : '') + '">' + o + '</td>'; }).join('') +
        '<td><button class="btn pb" data-sell="' + k + '"' + (S.cargo[k] ? '' : ' disabled') + '>Vender</button></td></tr>';
    }
    h += '</table>';
    let total = 0; for (const k of ITEM_ORDER) total += S.cargo[k] * priceAt(wp.id, k);
    const div = document.createElement('div'); div.innerHTML = h; b.appendChild(div);
    const sell = (k) => { const g = S.cargo[k] * priceAt(wp.id, k); S.cargo[k] = 0; addGold(g); contractProgress('sell', g); this.toast('+' + fmt(g) + ' monedas', 2, 'coin'); };
    div.querySelectorAll('[data-sell]').forEach(el => el.onclick = () => { sell(el.dataset.sell); this.renderPort(); });
    b.appendChild(this.card('coin', 'Vender todo', 'Total en este puerto: <b>' + fmt(total) + '</b> monedas. <span class="small">Verde = paga más que lo normal.</span>', 'Vender todo', total > 0, () => {
      for (const k of ITEM_ORDER) S.cargo[k] = 0; addGold(total); contractProgress('sell', total); Sfx.play('treasure'); this.toast('+' + fmt(total) + ' monedas', 2, 'coin');
    }, 'green'));
    const leg = Object.keys(S.legends);
    if (leg.length) b.appendChild(this.card('star', 'Objetos legendarios', leg.map(l => LEGENDS[l].name).join(', ') + '<br><i>No se venden: van a las vitrinas de tu sala de tesoros.</i>', null));
  },

  tab_tienda(b) {
    for (const k in PARTS) {
      const lvl = S.parts[k], max = lvl >= PART_MAX, cost = partCost(k, lvl);
      let bars = '<span class="lvl">'; for (let i = 0; i < PART_MAX; i++) bars += '<i class="' + (i < lvl ? 'on' : '') + '"></i>'; bars += '</span>';
      b.appendChild(this.card(PARTS[k].icon, PARTS[k].name + bars, PARTS[k].desc, max ? 'Máximo' : 'Mejorar ' + this.price(cost), !max && S.gold >= cost, () => {
        if (this.pay(cost)) { S.parts[k]++; if (k === 'casco') S.hp += SHIPS[S.stage].hp * 0.2; Sfx.play('level'); this.toast(PARTS[k].name + ' mejorado a nivel ' + S.parts[k], 2, PARTS[k].icon); }
      }));
    }
  },

  tab_astillero(b) {
    for (let i = 0; i < SHIPS.length; i++) {
      const s = SHIPS[i];
      const trade = Math.round(SHIPS[S.stage].price * 0.4);
      const cost = Math.max(0, s.price - trade);
      const desc = s.desc + '<br><span class="small">Casco ' + s.hp + ' · Bodega ' + s.hold + ' · Cañones ' + s.cannons + ' · Tripulación ' + s.crew + (s.leak ? ' · Hueco cada ' + s.leak + 's' : ' · Sin huecos') + '</span>';
      if (i === S.stage) b.appendChild(this.card('check', s.name + ' (tu barco)', desc, null));
      else if (i > S.stage) b.appendChild(this.card('ship', s.name, desc + (trade && cost < s.price ? '<br><span class="small">Precio ' + fmt(s.price) + ' − ' + fmt(trade) + ' por tu barco viejo</span>' : ''), 'Comprar ' + this.price(cost), S.gold >= cost && i === S.stage + 1, () => {
        if (this.pay(cost)) {
          S.stage = i; S.hp = stats().maxHp; S.holes = 0; S.water = 0; S.planks = Math.max(S.planks, Math.floor(stats().maxPlanks / 2));
          Sfx.play('fanfare');
          this.renderPort();
          this.dialog('¡Nuevo barco!', 'Ahora navegas en un <b>' + s.name + '</b>.<br>' + s.desc + (i === 4 ? '<br><br>¡Tienes tu propia <b>sala de tesoros</b> a bordo!' : ''), [{ label: '¡A la mar!', fn: () => { if (i === 4) checkEnding(); } }], 'ship');
        }
      }));
    }
    if (S.stage < 4) { const n = document.createElement('div'); n.className = 'small'; n.textContent = 'Solo puedes comprar el siguiente barco de la lista. Tus mejoras se conservan.'; b.appendChild(n); }
  },

  tab_taberna(b, wp) {
    const st = stats();
    this.sec(b, 'people', 'Tripulación (' + S.crew.length + '/' + st.crewSlots + ')');
    for (const k of CREW_ORDER) {
      if (hasCrew(k)) b.appendChild(this.card(CREW[k].icon, CREW[k].name + ' ' + ic('check', 16), CREW[k].desc, 'Despedir', true, () => { S.crew = S.crew.filter(c => c !== k); }, 'red'));
      else b.appendChild(this.card(CREW[k].icon, CREW[k].name, CREW[k].desc + (S.crew.length >= st.crewSlots ? '<br><i>Tu barco no tiene más espacio.</i>' : ''), 'Contratar ' + this.price(CREW[k].cost),
        S.crew.length < st.crewSlots && S.gold >= CREW[k].cost, () => { if (this.pay(CREW[k].cost)) { S.crew.push(k); this.toast(CREW[k].name + ' se une a tu tripulación', 2, CREW[k].icon); } }));
    }
    // contratos
    this.sec(b, 'scroll', 'Tablón de contratos');
    if (S.contract) b.appendChild(this.card('scroll', 'Contrato activo: ' + S.contract.title, 'Progreso: ' + (S.contract.type === 'sell' ? fmt(S.contract.have) + '/' + fmt(S.contract.need) : S.contract.have + '/' + S.contract.need) + ' · Recompensa ' + fmt(S.contract.reward), 'Abandonar', true, () => { S.contract = null; }, 'red'));
    else for (const c of contractOffers(wp.id)) b.appendChild(this.card('scroll', c.title, 'Recompensa: <b>' + fmt(c.reward) + '</b> monedas', 'Aceptar', true, () => { S.contract = Object.assign({}, c, { have: 0 }); Sfx.play('page'); this.toast('Contrato aceptado: ' + c.title, 3, 'scroll'); }, 'green'));
    // mapas
    const m = PORTS[wp.id].mapId, mp = MAP_PIECE_PRICE[m];
    this.sec(b, 'map', 'Mapas y rumores');
    b.appendChild(this.card('map', 'Pedazo del ' + MAP_NAMES[m], 'Tienes ' + S.pieces[m] + '/3 pedazos' + (S.xDug[m] ? ' (tesoro ya encontrado)' : ''), S.pieces[m] >= 3 ? 'Completo' : 'Comprar ' + this.price(mp), S.pieces[m] < 3 && S.gold >= mp, () => { if (this.pay(mp)) givePiece(m); }));
    const rp = RUMORS_PRICE[wp.zone];
    b.appendChild(this.card('ear', 'Escuchar rumores', 'Un viejo marinero te cuenta dónde hay un secreto (lo marca en tu mapa).', 'Invitar ron ' + this.price(rp), S.gold >= rp, () => { if (this.pay(rp)) this.rumor(wp.zone); }));
    // taberna propia
    this.sec(b, 'mug', 'Tu taberna');
    const t = S.taverns[wp.id], z = wp.zone;
    if (!t) {
      if (zoneHasTavern(z)) b.appendChild(this.card('mug', 'Ya tienes una taberna en esta zona', 'Solo puedes abrir una taberna por zona. Explora nuevas zonas para abrir más.', null));
      else b.appendChild(this.card('mug', 'Abrir taberna aquí', 'Gana ' + TAVERN.income[z] + ' monedas por minuto, incluso con el juego cerrado (hasta 8 horas).', 'Abrir ' + this.price(TAVERN.price[z]), S.gold >= TAVERN.price[z],
        () => { if (this.pay(TAVERN.price[z])) { S.taverns[wp.id] = { level: 1, keeper: false, stored: 0, last: Date.now() }; Sfx.play('fanfare'); this.banner('¡Taberna abierta!', PORTS[wp.id].name, 'mug'); } }, 'green'));
    } else {
      tavernTick();
      const rate = tavernRate(wp.id), closed = t.closedUntil && Date.now() < t.closedUntil;
      b.appendChild(this.card('coin', 'Caja de la taberna', fmt(t.stored) + ' monedas acumuladas · ' + rate.toFixed(0) + ' por minuto' + (closed ? '<br><b>Cerrada por el ataque pirata.</b>' : ''), 'Cobrar', t.stored >= 1, () => { const g = Math.floor(t.stored); t.stored -= g; addGold(g); this.toast('+' + fmt(g) + ' monedas', 2, 'coin'); }, 'green'));
      const up = TAVERN.price[z] * t.level;
      b.appendChild(this.card('mug', 'Mejorar taberna (nivel ' + t.level + '/' + TAVERN.maxLevel + ')', 'Más mesas, más ron, más oro.', t.level >= TAVERN.maxLevel ? 'Máximo' : 'Mejorar ' + this.price(up), t.level < TAVERN.maxLevel && S.gold >= up, () => { tavernTick(); if (this.pay(up)) { t.level++; Sfx.play('level'); } }));
      if (!t.keeper) b.appendChild(this.card('people', 'Contratar tabernero', '+50% de ganancias', 'Contratar ' + this.price(Math.round(TAVERN.price[z] * 0.8)), S.gold >= TAVERN.price[z] * 0.8, () => { tavernTick(); if (this.pay(Math.round(TAVERN.price[z] * 0.8))) t.keeper = true; }));
      else b.appendChild(this.card('people', 'Tabernero contratado ' + ic('check', 16), '+50% de ganancias', null));
    }
    const others = Object.keys(S.taverns).filter(id => +id !== wp.id);
    if (others.length) b.appendChild(this.card('scroll', 'Tus otras tabernas', others.map(id => PORTS[id].name + ': ' + fmt(S.taverns[id].stored) + ' en caja').join('<br>') + '<br><i>Cobra cada caja visitando su puerto.</i>', null));
  },

  rumor(zone) {
    const opts = [];
    const z2 = Math.min(3, zone + 1);
    for (const w of World.wrecks) if (!S.wrecks[w.id] && (w.zone === zone || w.zone === z2) && !isRevealedWorld(w.x, w.y)) opts.push(['un barco hundido lleno de tesoros', w.x, w.y]);
    for (const c of World.caves) if (!S.caves[c.id] && (c.zone === zone || c.zone === z2) && !isRevealedWorld(c.x, c.y)) opts.push(['una cueva secreta en una isla', c.x, c.y]);
    for (const b in BOSSES) if (!S.bosses[b] && !isRevealedWorld(World.lairs[b].x, World.lairs[b].y) && BOSSES[b].zone <= z2) opts.push(['la guarida de ' + BOSSES[b].name, World.lairs[b].x, World.lairs[b].y]);
    for (const p of World.ports) if (!isRevealedWorld(p.x, p.y)) opts.push(['un puerto llamado ' + p.name, p.x, p.y]);
    const digs = World.digs.filter(d => !S.dug[d.id] && d.zone === zone && !d.hinted);
    if (digs.length) { const d = digs[Math.floor(Math.random() * digs.length)]; opts.push(['un tesoro enterrado en una isla', d.x, d.y, d]); }
    if (!opts.length) { this.dialog('Rumores', '"Ya lo has descubierto todo por aquí, capitán. ¡Prueba en otra zona!"', [{ label: 'Salud' }], 'ear'); return; }
    const o = opts[Math.floor(Math.random() * opts.length)];
    revealAround(o[1], o[2], 3); if (o[3]) o[3].hinted = true;
    this.dialog('Rumores', '"Dicen que hay ' + o[0] + ' por estas aguas..."<br><br>Se marcó en tu mapa.', [{ label: 'Salud' }], 'ear');
  },

  tab_inmo(b) {
    if (!S.house) b.appendChild(this.card('house', 'Casa del capitán', 'Una mansión en tierra con una gran sala de tesoros. <b>El sueño de todo pirata.</b>', 'Comprar ' + this.price(HOUSE_PRICE), S.gold >= HOUSE_PRICE, () => {
      if (this.pay(HOUSE_PRICE)) { S.house = true; saveGame(); Sfx.play('fanfare'); setTimeout(() => checkEnding(), 50); }
    }, 'green'));
    else b.appendChild(this.card('house', 'Casa del capitán ' + ic('check', 16), 'Tu mansión con sala de tesoros es tuya.', null));
    const hasRoom = S.house || S.stage === 4;
    this.sec(b, 'brush', 'Decoración ' + (hasRoom ? '' : '<span class="small">(necesitas casa o galeón)</span>'));
    for (const d of DECOR) {
      if (S.decor[d.id]) b.appendChild(this.card('check', d.name, 'Ya decora tu sala', null));
      else b.appendChild(this.card('brush', d.name, '', 'Comprar ' + this.price(d.price), hasRoom && S.gold >= d.price, () => { if (this.pay(d.price)) S.decor[d.id] = true; }));
    }
  },

  tab_sala(b) {
    const c = document.createElement('canvas'); c.id = 'roomCv'; c.width = 960; c.height = 540; b.appendChild(c);
    this.roomAnim = true;
    const loop = () => { if (!this.roomAnim || !document.body.contains(c)) return; Room.draw(c.getContext('2d'), 960, 540); requestAnimationFrame(loop); };
    loop();
    const d = document.createElement('div'); d.className = 'small'; d.style.marginTop = '6px';
    d.textContent = (S.house ? 'Tu mansión en tierra.' : 'La sala de tesoros de tu Galeón.') + ' Las pilas de oro crecen con tu riqueza.';
    b.appendChild(d);
  },
  openRoom() {
    this.modal = 'room';
    this.show('<div class="panel"><h2><span>' + ic('diamond', 20) + ' Sala de tesoros</span><span class="g">' + ic('coin', 18) + ' ' + fmt(S.gold) + '</span></h2><div class="body" id="roomBody"></div><div class="foot"><button class="btn pb" id="roomClose">Cerrar</button></div></div>');
    this.tab_sala($('roomBody'));
    $('roomClose').onclick = () => this.hide();
  },
};

function checkEnding() {
  if (S.ended) return;
  S.ended = true; saveGame();
  UI.dialog('¡De pobre a rico!', 'Empezaste con un bote lleno de huecos y hoy tienes tu propia <b>sala de tesoros</b>' + (S.house ? ' en tu mansión' : ' a bordo de tu Galeón') + '.<br><br>' +
    'Oro ganado en total: <b>' + fmt(S.stats.earned) + '</b><br>Legendarios: ' + Object.keys(S.legends).length + '/6 · Trofeos: ' + Object.keys(S.trophies).length + '/3<br>Tiempo: ' + Math.floor(S.stats.time / 60) + ' minutos<br><br>' +
    '¡Gracias por jugar <b>Plunder Port</b>! Puedes seguir navegando para llenar tu sala.', [{ label: 'Ver mi sala', fn: () => UI.openRoom() }, { label: 'Seguir jugando' }], 'crown');
}

// ===== Sala de tesoros =====
const Room = {
  draw(g, w, h) {
    const house = S.house, t = Date.now() / 1000;
    g.fillStyle = house ? '#6d5a4a' : '#5a3a22'; g.fillRect(0, 0, w, h * 0.62);
    if (house) { g.strokeStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < h * 0.62; y += 30) for (let x = (y / 30 % 2) * 30; x < w; x += 60) g.strokeRect(x, y, 60, 30); }
    else {
      g.strokeStyle = 'rgba(0,0,0,.25)'; for (let y = 0; y < h * 0.62; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (const x of [120, 840]) { g.fillStyle = '#c9a35a'; g.beginPath(); g.arc(x, 90, 34, 0, 6.28); g.fill(); g.fillStyle = '#2d6ea3'; g.beginPath(); g.arc(x, 90, 27, 0, 6.28); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(x - 8, 82 + Math.sin(t) * 2, 8, 0, 6.28); g.fill(); }
    }
    g.fillStyle = '#7a5230'; g.fillRect(0, h * 0.62, w, h * 0.38);
    g.strokeStyle = 'rgba(0,0,0,.2)'; for (let x = -200; x < w; x += 70) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 150, h * 0.62); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, h * 0.62 - 4, w, 8);
    if (S.decor.alfombra) { g.fillStyle = '#8e1b1b'; g.beginPath(); g.ellipse(w / 2, h * 0.84, 300, 70, 0, 0, 6.28); g.fill(); g.strokeStyle = '#ffd23f'; g.lineWidth = 4; g.stroke(); g.lineWidth = 1; }
    if (S.decor.bandera) { const wv = Math.sin(t * 2) * 3; g.fillStyle = '#111'; g.beginPath(); g.moveTo(410, 30); g.lineTo(550, 30 + wv); g.lineTo(550, 115 + wv); g.lineTo(410, 115); g.fill(); drawIcon(g, 'skull', 480, 72, 60); }
    if (S.decor.mapa) { g.fillStyle = '#d4a72c'; g.fillRect(180, 40, 150, 100); g.fillStyle = '#f3e2b3'; g.fillRect(188, 48, 134, 84); drawIcon(g, 'map', 255, 90, 70); }
    if (S.decor.lampara) { g.strokeStyle = '#d4a72c'; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, 30); g.stroke(); g.beginPath(); g.ellipse(w / 2, 34, 60, 12, 0, 0, 6.28); g.stroke(); for (let k = -2; k <= 2; k++) { g.fillStyle = 'rgba(255,220,120,' + (0.6 + Math.sin(t * 8 + k) * 0.2) + ')'; g.beginPath(); g.arc(w / 2 + k * 26, 24, 7, 0, 6.28); g.fill(); g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(w / 2 + k * 26, 26, 4, 0, 6.28); g.fill(); } g.lineWidth = 1; }
    ['serpent', 'kraken', 'ghost'].forEach((tr, i) => {
      const x = 640 + i * 95, y = 40;
      g.fillStyle = '#4a2c14'; g.beginPath(); g.ellipse(x, y + 40, 38, 46, 0, 0, 6.28); g.fill(); g.strokeStyle = '#d4a72c'; g.lineWidth = 3; g.stroke(); g.lineWidth = 1;
      if (!S.trophies[tr]) { g.fillStyle = 'rgba(255,255,255,.25)'; g.font = 'bold 28px Georgia'; g.textAlign = 'center'; g.fillText('?', x, y + 50); return; }
      g.fillStyle = TROPHIES[tr].color;
      if (tr === 'serpent') { g.beginPath(); g.ellipse(x, y + 40, 18, 26, 0, 0, 6.28); g.fill(); g.fillStyle = '#ffeb3b'; g.beginPath(); g.arc(x - 7, y + 30, 4, 0, 6.28); g.arc(x + 7, y + 30, 4, 0, 6.28); g.fill(); }
      else if (tr === 'kraken') { g.strokeStyle = TROPHIES[tr].color; g.lineWidth = 10; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - 10, y + 75); g.bezierCurveTo(x - 30, y + 30, x + 30 + Math.sin(t) * 5, y + 40, x + 5, y + 10); g.stroke(); g.lineWidth = 1; g.lineCap = 'butt'; }
      else { g.fillStyle = '#333'; g.fillRect(x - 12, y + 18, 24, 42); g.fillStyle = TROPHIES[tr].color; g.globalAlpha = 0.8 + Math.sin(t * 3) * 0.2; g.fillRect(x - 8, y + 24, 16, 30); g.globalAlpha = 1; }
    });
    const gold = S.gold;
    const piles = Math.min(9, Math.max(gold > 0 ? 1 : 0, Math.floor(Math.log10(gold + 1) * 1.8)));
    for (let i = 0; i < piles; i++) {
      const px = 120 + (i % 5) * 70 + (i >= 5 ? 35 : 0), py = h * 0.8 + (i >= 5 ? 50 : 0);
      const hgt = Math.min(110, 20 + Math.log10(gold + 1) * 14 + (i * 7) % 20);
      g.fillStyle = '#b8860b'; g.beginPath(); g.moveTo(px - 40, py); g.quadraticCurveTo(px, py - hgt * 2, px + 40, py); g.closePath(); g.fill();
      g.fillStyle = '#f5c542'; g.beginPath(); g.moveTo(px - 34, py - 4); g.quadraticCurveTo(px, py - hgt * 1.85, px + 34, py - 4); g.closePath(); g.fill();
      for (let k = 0; k < 6; k++) { g.fillStyle = '#ffe680'; g.beginPath(); g.ellipse(px - 20 + hash2(i, k, 5) * 40, py - 8 - hash2(i, k, 6) * hgt * 0.7, 6, 3, 0, 0, 6.28); g.fill(); }
    }
    const chests = Math.min(3, Math.floor(S.stats.earned / 15000));
    for (let i = 0; i < chests; i++) drawIcon(g, 'rare', 570 + i * 110, h * 0.82, 80);
    const gems = Math.min(40, Math.floor(S.stats.earned / 3000));
    for (let i = 0; i < gems; i++) {
      const x = 60 + hash2(i, 1, 9) * (w - 120), y = h * 0.66 + hash2(i, 2, 9) * h * 0.3;
      drawIcon(g, i % 2 ? 'ruby' : 'diamond', x, y, 14);
      if ((t * 5 + i) % 10 < 1) { g.fillStyle = '#fff'; g.fillRect(x - 1, y - 11, 2, 7); g.fillRect(x - 4, y - 8, 8, 2); }
    }
    LEGEND_ORDER.forEach((l, i) => Room.vitrine(g, 80 + i * 72, h * 0.42, l, t));
    if (S.decor.candelabros) for (const x of [30, w - 30]) { g.fillStyle = '#d4a72c'; g.fillRect(x - 4, h * 0.45, 8, 120); g.fillRect(x - 18, h * 0.45, 36, 6); for (const dx of [-14, 0, 14]) { g.fillStyle = '#fff8e1'; g.fillRect(x + dx - 3, h * 0.45 - 16, 6, 16); g.fillStyle = '#ffb300'; g.beginPath(); g.ellipse(x + dx, h * 0.45 - 20, 3 + Math.sin(t * 10 + dx) * 0.8, 5, 0, 0, 6.28); g.fill(); } }
    if (S.decor.loro) { const x = 700, y = h * 0.36; g.strokeStyle = '#6b4423'; g.lineWidth = 4; g.beginPath(); g.moveTo(x - 30, y + 30); g.lineTo(x + 30, y + 30); g.stroke(); g.lineWidth = 1; g.fillStyle = '#e53935'; g.beginPath(); g.ellipse(x, y + 10, 12, 20, 0, 0, 6.28); g.fill(); g.fillStyle = '#1e88e5'; g.beginPath(); g.ellipse(x + 4, y + 18, 6, 14, 0.3, 0, 6.28); g.fill(); g.fillStyle = '#fdd835'; g.beginPath(); g.moveTo(x + 10, y - 2); g.lineTo(x + 18, y + 2); g.lineTo(x + 10, y + 6); g.fill(); }
    if (S.decor.canon) drawIcon(g, 'cannon', w - 140, h * 0.86, 100);
    if (S.decor.estatua) { const x = 590, y = h * 0.62; g.fillStyle = '#9e9e9e'; g.fillRect(x - 30, y - 10, 60, 30); g.fillStyle = '#d4a72c'; g.fillRect(x - 12, y - 80, 24, 70); g.beginPath(); g.arc(x, y - 92, 14, 0, 6.28); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.moveTo(x - 20, y - 100); g.lineTo(x + 20, y - 100); g.lineTo(x, y - 118); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, h - 34, w, 34);
    drawIcon(g, 'coin', 24, h - 17, 22);
    g.fillStyle = '#ffd23f'; g.font = 'bold 20px Georgia'; g.textAlign = 'left'; g.fillText(fmt(S.gold) + ' monedas', 42, h - 10);
    g.textAlign = 'right'; g.fillStyle = '#ffe9b0'; g.font = '15px Georgia';
    g.fillText('Legendarios ' + Object.keys(S.legends).length + '/6 · Trofeos ' + Object.keys(S.trophies).length + '/3 · Decoración ' + Object.keys(S.decor).length + '/' + DECOR.length, w - 14, h - 11);
  },
  vitrine(g, x, y, l, t) {
    g.fillStyle = '#4a2c14'; g.fillRect(x - 30, y + 40, 60, 50);
    g.fillStyle = '#d4a72c'; g.fillRect(x - 32, y + 36, 64, 6);
    g.fillStyle = 'rgba(180,230,255,0.22)'; g.fillRect(x - 28, y - 30, 56, 66);
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.strokeRect(x - 28, y - 30, 56, 66);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.moveTo(x - 24, y - 28); g.lineTo(x - 14, y - 28); g.lineTo(x - 24, y - 6); g.fill();
    if (!S.legends[l]) { g.fillStyle = 'rgba(255,255,255,.3)'; g.font = 'bold 24px Georgia'; g.textAlign = 'center'; g.fillText('?', x, y + 12); return; }
    const c = LEGENDS[l].color, fl = Math.sin(t * 2 + x) * 2;
    g.fillStyle = c + '55'; g.beginPath(); g.arc(x, y + 4, 22 + Math.sin(t * 3 + x) * 3, 0, 6.28); g.fill();
    g.save(); g.translate(0, fl);
    g.fillStyle = c; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    if (l === 'skull') drawIcon(g, 'skull', x, y + 2, 34);
    else if (l === 'trident') { g.fillRect(x - 2, y - 10, 4, 40); g.fillRect(x - 12, y - 10, 24, 4); g.fillRect(x - 12, y - 24, 4, 16); g.fillRect(x + 8, y - 24, 4, 16); g.fillRect(x - 2, y - 26, 4, 18); }
    else if (l === 'crown') drawIcon(g, 'crown', x, y + 2, 38);
    else if (l === 'chalice') { g.beginPath(); g.moveTo(x - 14, y - 14); g.lineTo(x + 14, y - 14); g.quadraticCurveTo(x + 12, y + 4, x + 2, y + 6); g.lineTo(x + 2, y + 18); g.lineTo(x + 10, y + 22); g.lineTo(x - 10, y + 22); g.lineTo(x - 2, y + 18); g.lineTo(x - 2, y + 6); g.quadraticCurveTo(x - 12, y + 4, x - 14, y - 14); g.fill(); g.stroke(); }
    else if (l === 'pearl') { g.fillStyle = '#e8d9c0'; g.beginPath(); g.ellipse(x, y + 14, 20, 6, 0, 0, 6.28); g.fill(); g.fillStyle = c; g.beginPath(); g.arc(x, y + 2, 12, 0, 6.28); g.fill(); g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(x - 4, y - 2, 3, 0, 6.28); g.fill(); }
    else if (l === 'compass') { g.save(); g.translate(x, y + 2); g.rotate(t * 0.8); drawIcon(g, 'compass', 0, 0, 34); g.restore(); }
    g.restore(); g.lineWidth = 1;
  },
};
