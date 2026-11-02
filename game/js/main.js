'use strict';
// ===== Arranque y bucle principal =====
(function () {
  World.generate();
  Render.init(document.getElementById('game'));
  Sfx.init();
  UI.init();
  window.addEventListener('resize', () => Render.resize());

  let running = false, last = 0;
  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
    if (running) {
      update(dt);
      Render.frame();
      UI.hud(dt);
    }
    requestAnimationFrame(loop);
  }

  function begin(fresh) {
    document.getElementById('title').style.display = 'none';
    Sfx.resume();
    const offline = startGame(fresh);
    Render.resetFog();
    Render.buildMini();
    running = true;
    if (!S.tutorial) {
      S.tutorial = true;
      UI.dialog('🏴‍☠️ ¡Bienvenido a Plunder Port!', 'Eres un pirata sin un peso, con un bote <b>feo y lleno de huecos</b>.<br><br>' +
        '🖐️ <b>Toca el mar</b> para navegar.<br>📦 Pasa sobre el <b>botín flotante</b> para recogerlo.<br>⚓ Vuelve a <b>Puerto Remiendo</b> y véndelo en el Mercado.<br>' +
        '🪵 Tu bote <b>hace agua</b>: tapa los huecos con tablas.<br><br>¡De pobre a rico, capitán!', [{ label: '¡Zarpar!' }]);
    } else if (offline >= 1) {
      UI.dialog('🍺 Ganancias de tus tabernas', 'Mientras no estabas, tus tabernas juntaron <b>' + fmt(offline) + '</b> de oro.<br>Visita cada puerto para cobrar su caja.', [{ label: '¡Bien!' }]);
    }
    saveGame();
  }

  const hasSave = !!loadGame();
  const bc = document.getElementById('btnContinue'), bn = document.getElementById('btnNew');
  if (!hasSave) bc.style.display = 'none';
  bc.onclick = () => begin(false);
  bn.onclick = () => {
    if (hasSave) {
      UI.dialog('¿Nueva partida?', 'Se borrará tu partida actual.', [{ label: 'Cancelar' },
        { label: 'Empezar de cero', cls: 'red', fn: () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } begin(true); } }]);
      return;
    }
    begin(true);
  };

  // Integración con Android (WebView)
  window.onAndroidBack = function () { if (!running) return false; UI.back(); return true; };
  window.onAndroidPause = function () { if (running) saveGame(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden && running) saveGame(); });
  window.addEventListener('pagehide', () => { if (running) saveGame(); });

  requestAnimationFrame(loop);
})();
