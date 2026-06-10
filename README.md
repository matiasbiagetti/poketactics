# PokéTactics: Liga Johto-Kanto

Autobattler online tipo TFT con Pokémon de gen I-II, para **2-8 jugadores**, 100% gratuito.
Basado en el documento de diseño `GDD_PokeTactics.md`.

## Cómo jugar con amigos

1. Abre la página del juego en el navegador (Chrome/Edge/Firefox).
2. Un jugador pulsa **Crear sala** y comparte el código de 5 letras.
3. Los demás escriben el código y pulsan **Unirse**.
4. El anfitrión pulsa **Empezar partida**. ¡El último Entrenador con vida gana!

> La conexión es P2P (WebRTC vía PeerJS). El anfitrión hace de servidor: si cierra la pestaña, la partida termina. No hay cuentas ni servidores propios.

## Controles

- **Clic** en una carta de la tienda → comprar.
- **Clic** en una unidad y luego en una casilla/banco → mover (solo tu mitad inferior).
- Unidad seleccionada + zona roja **Vender** (o tecla `E`) → vender.
- `D` = refrescar tienda (2 oro) · `F` = comprar XP (4 oro) · `Esc` = cancelar selección.
- **Componentes:** clic en 2 para combinarlos en un objeto. **Objetos:** clic en el objeto y luego en una unidad para equiparlo (máx 3).
- 3 copias del mismo Pokémon evolucionan automáticamente (3 evolucionadas → forma final).
- 3 Magikarp → **Gyarados**. 3 Eevee → eliges Vaporeon/Jolteon/Flareon.

## Desarrollo

- `data.js` — roster (49 líneas), sinergias, tabla de tipos, objetos, encuentros PvE.
- `core.js` — lógica pura: economía, tienda, pool compartido, fusiones, simulador de combate por ticks.
- `game.js` — host autoritativo + protocolo P2P (PeerJS).
- `ui.js`, `index.html`, `style.css` — interfaz.
- Tests: `node test.js` (unitarios) y `node test-game.js` (partida completa con bots y reloj virtual).

## Aviso

Proyecto de fans sin ánimo de lucro. Pokémon y sus sprites son propiedad de Nintendo/Creatures/GAME FREAK. No distribuir comercialmente.
