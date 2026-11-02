# ⚓ Plunder Port

Juego de piratas 2D con vista desde arriba: empiezas con un bote remendado lleno de huecos y terminas con un galeón y tu propia sala de tesoros.

**Ciclo:** explorar → saquear → vender → mejorar → expandirse.

## Descargar y jugar (Android)
Descarga [`dist/PlunderPort.apk`](dist/PlunderPort.apk) en tu celular e instálalo (permite "instalar apps de origen desconocido").

## Qué incluye
- Bote con huecos y agua, tablas para taparlos, reparación en puerto.
- Mejoras por partes: casco, velas, bodega, cañones, timón (6 niveles).
- 5 barcos: Bote remendado, Balandra, Bergantín, Fragata, Galeón (con sala de tesoros a bordo).
- Mapa de 200×200 con niebla de guerra, 4 zonas de peligro creciente: Mar de los Novatos, Arrecifes de Coral, Aguas de Tormenta y el Triángulo Maldito.
- 5 puertos con precios distintos: mercado, tienda de partes, astillero, taberna e inmobiliaria.
- Botín: monedas, cofres comunes, rubíes, diamantes, cofres raros y 6 objetos legendarios para las vitrinas.
- Mapas del tesoro en 3 pedazos, cuevas secretas, naufragios (con buzo) y rumores.
- Piratas rivales que aparecen más cuanto más botín llevas, tormentas, viento, arrecifes y rocas.
- Jefes: Serpiente Marina, Kraken y Barco Fantasma, con trofeos.
- Tripulación: carpintero, vigía, artillero, cocinero y buzo.
- Tabernas propias con ingresos pasivos (incluso con el juego cerrado), niveles, tabernero y ataques de rivales.
- Casa del capitán, decoración y sala de tesoros que se llena visualmente.
- Guardado automático.

## Controles
- **Celular:** toca el mar (o el mapa) para navegar; 💥 dispara; 🪵 tapa huecos; botón verde para atracar/explorar.
- **PC (navegador):** WASD/flechas, Espacio = fuego, E = acción, R = tapar, M = mapa, Esc = menú.

## Estructura
- `game/` — el juego en HTML5 Canvas + JavaScript puro (sin dependencias). Se puede abrir `game/index.html` en un navegador.
- `android/` — envoltorio Android (WebView) con manifiesto, actividad e iconos.
- `build_apk.sh` — compila el APK con `aapt`, `dx`, `zipalign` y `apksigner` (paquetes de Ubuntu).
