# Plunder Port

Juego de piratas 2D con vista desde arriba: empiezas con un bote remendado lleno de huecos y terminas con un galeón y tu propia sala de tesoros.

**Ciclo:** explorar → saquear → vender → mejorar → expandirse.

## Descargar y jugar (Android)
Descarga [`dist/PlunderPort.apk`](dist/PlunderPort.apk) en tu celular e instálalo (permite "instalar apps de origen desconocido").

## Qué incluye
- **Introducción animada** con la historia del grumete del Capitán Garra Roja, y pantalla de título con el mundo en vivo.
- **Navegación y exploración:** mapa de 200×200 con niebla de guerra, 4 zonas de peligro creciente, viento, tormentas, arrecifes, rocas, ciclo de día y noche con faroles, gaviotas y delfines. Una flecha dorada guía al siguiente objetivo.
- **A pie:** desembarca en cualquier isla, camina, cava tesoros enterrados, entra a cuevas y pelea con cangrejos y esqueletos con la espada. En los puertos paseas por el pueblo, hablas con los aldeanos y entras a cada edificio.
- **El barco:** hace agua (huecos, tablas, reparación), mejoras por partes (casco, velas, bodega, cañones, timón) y 5 barcos: Bote, Balandra, Bergantín, Fragata y Galeón.
- **Combate:** cañones con autoapuntado, andanada especial, golpes críticos, 3 tipos de piratas rivales (balandras rápidas, cañoneras, embestidores), abordajes, barriles explosivos y hundimientos animados.
- **Jefes:** Serpiente Marina, Kraken y Barco Fantasma, con trofeos.
- **Economía:** 5 puertos con precios distintos, botín de monedas a cofres raros, 6 objetos legendarios con efectos, mapas del tesoro en 3 pedazos, botellas con mensajes, contratos en la taberna, rumores.
- **Tripulación:** carpintero, vigía, artillero, cocinero y buzo.
- **Tabernas propias** con ingresos pasivos incluso con el juego cerrado, niveles, tabernero y ataques de rivales.
- **Final:** casa del capitán o galeón con una sala de tesoros animada que se llena con oro, vitrinas, trofeos y decoración.
- **Audio sintetizado:** efectos, ambiente de mar y viento, y música procedural estilo saloma pirata que se intensifica en combate.
- Iconos vectoriales propios (sin emojis), vibración en golpes y guardado automático.

## Novedades 3.0 (renovación visual)
- **Islas con formas naturales:** costas orgánicas generadas con un campo de distancias + ruido, relieve sombreado, playas con dunas, pasto con textura, selva espesa en el interior y cumbres rocosas en las islas grandes.
- **Vegetación variada por zona:** palmeras inclinadas hacia el mar, árboles frondosos con frutas, pinos en las Aguas de Tormenta, árboles muertos, huesos y hongos brillantes en el Triángulo Maldito, arbustos, flores, conchas, estrellas de mar y troncos a la deriva.
- **Mar nuevo:** profundidad suave (aguas turquesa junto a la costa), oleaje animado, espuma en la orilla, corales orgánicos y rocas con espuma.
- **Pueblos detallados:** cada edificio tiene su estilo (piedra, madera, entramado), tejados de tejas, ventanas con contraventanas, toldo del mercado, torre con bandera en la Capitanía, barriles, cajas, farolas, fuente animada y muelle de tablones.
- **Barcos rediseñados:** cubierta de tablas, castillo de popa, bauprés con foque, jarcias, velas con volumen y estela en "V" bajo el casco.
- **Bugs visuales corregidos:** la espuma y el humo ya no tapan el barco; la niebla de guerra tiene bordes suaves (sin cuadritos); los avisos no tapan el título de zona ni el barco; la flecha guía no queda bajo los botones; el texto de Andanada cabe en su botón; tejados que salían negros; costuras entre bloques del mapa.
- Cuevas con antorchas, naufragios con el casco visible bajo el agua, sombras de nubes y una intro más cinematográfica.

## Controles
- **Celular:** toca el mar (o el mapa) para navegar; botón Fuego para disparar; Andanada para la descarga especial; Tapar para los huecos; el botón verde central sirve para atracar, desembarcar, cavar, abordar o entrar. En tierra, toca el suelo para caminar y usa Espada.
- **PC (navegador):** WASD/flechas, Espacio = fuego/espada, Q = andanada, E = acción, R = tapar, M = mapa, Esc = menú.

## Estructura
- `game/` — el juego en HTML5 Canvas + JavaScript puro (sin dependencias). Se puede abrir `game/index.html` en un navegador.
- `game/js/terrain.js` — generador visual del terreno (costas, relieve, agua, vegetación).
- `android/` — envoltorio Android (WebView) con manifiesto, actividad e iconos.
- `build_apk.sh` — compila el APK con `aapt`, `dx`, `zipalign` y `apksigner` (paquetes de Ubuntu).
