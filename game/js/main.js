'use strict';
// ===== Arranque y bucle principal =====
(function () {
// se deja pintar la pantalla de carga antes del trabajo pesado (generar el mundo y el terreno)
requestAnimationFrame(() => setTimeout(boot, 30));
function boot() {
  World.generate();
  Land.init();
  Render.init(document.getElementById('game'));
  Sfx.init();
  UI.init();
  window.addEventListener('resize', () => Render.resize());
  { const ld = document.getElementById('loading'); if (ld) ld.remove(); }

  // Pantalla de título con el mundo de fondo
  startGame(true, true);
  Render.resetFog();
  revealAround(G.ship.x, G.ship.y, 14);
  G.dayT = 0.45;
  let state = 'title', last = 0;
  function demoSail() {
    if (G.path) return;
    for (let k = 0; k < 20; k++) {
      const a = Math.random() * 6.28, r = 250 + Math.random() * 300;
      const x = World.ports[0].x + 8 * TILE + Math.cos(a) * r, y = World.ports[0].y + Math.sin(a) * r - 200;
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (tx > 0 && ty > 0 && tx < WW && ty < WH && World.reach[ty * WW + tx] && World.tiles[ty * WW + tx] === W_WATER) { setDestination(x, y); if (G.path) return; }
    }
  }

  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
    if (state === 'title') { demoSail(); update(dt); Render.frame(); }
    else if (state === 'play') { update(dt); Render.frame(); UI.hud(dt); }
    requestAnimationFrame(loop);
  }

  function showHud(on) { for (const id of ['hudL', 'hudTop', 'hudR', 'controls']) document.getElementById(id).style.display = on ? '' : 'none'; }
  showHud(false);

  function begin(fresh) {
    document.getElementById('title').style.display = 'none';
    Sfx.resume();
    const offline = startGame(fresh, false);
    UI.shownGold = S.gold;
    Render.resetFog(); Render.camInit = false;
    Sfx.applySettings();
    state = 'play'; showHud(true); UI.setMode();
    G.curZone = World.zoneAtWorld(G.ship.x, G.ship.y);
    if (!S.tutorial) {
      S.tutorial = true;
      UI.dialog('¡Bienvenido a Plunder Port!', '<div style="text-align:left;line-height:1.8">' +
        ic('hand', 20) + ' <b>Toca el mar</b> para navegar.<br>' +
        ic('chest', 20) + ' Pasa sobre el <b>botín flotante</b> para recogerlo.<br>' +
        ic('anchor', 20) + ' Vuelve a <b>Puerto Remiendo</b> y véndelo en el Mercado.<br>' +
        ic('hole', 20) + ' Tu bote <b>hace agua</b>: tapa los huecos con tablas.<br>' +
        ic('target', 20) + ' Sigue la <b>flecha dorada</b> si no sabes a dónde ir.</div>', [{ label: '¡Zarpar!' }], 'ship');
    } else if (offline >= 1) {
      UI.dialog('Ganancias de tus tabernas', 'Mientras no estabas, tus tabernas juntaron <b>' + fmt(offline) + '</b> monedas.<br>Visita cada puerto para cobrar su caja.', [{ label: '¡Bien!' }], 'mug');
    } else UI.zoneBanner(ZONES[G.curZone].name, 'De vuelta al mar, capitán');
    saveGame();
  }
  function newGame() {
    try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem('plunderport_save_v1'); } catch (e) { }
    document.getElementById('title').style.display = 'none';
    Sfx.resume();
    state = 'intro';
    Intro.start(() => begin(true));
  }

  const hasSave = !!loadGame();
  const bc = document.getElementById('btnContinue'), bn = document.getElementById('btnNew');
  bc.innerHTML = ic('play', 18) + ' Continuar'; bn.innerHTML = ic('ship', 20) + ' Nueva partida';
  if (!hasSave) bc.style.display = 'none';
  bc.onclick = () => { Sfx.resume(); Sfx.play('ui'); begin(false); };
  bn.onclick = () => {
    Sfx.resume(); Sfx.play('ui');
    if (hasSave) {
      UI.dialog('¿Nueva partida?', 'Se borrará tu partida actual.', [{ label: 'Cancelar' }, { label: 'Empezar de cero', cls: 'red', fn: () => newGame() }], 'warn');
      return;
    }
    newGame();
  };
  document.getElementById('title').addEventListener('pointerdown', () => Sfx.resume());

  window.onAndroidBack = function () { if (state !== 'play') return state === 'intro'; UI.back(); return true; };
  window.onAndroidPause = function () { if (state === 'play') saveGame(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') saveGame(); if (Sfx.ready) { if (document.hidden) Sfx.ctx.suspend(); else Sfx.ctx.resume(); } });
  window.addEventListener('pagehide', () => { if (state === 'play') saveGame(); });

  requestAnimationFrame(loop);
}
})();
