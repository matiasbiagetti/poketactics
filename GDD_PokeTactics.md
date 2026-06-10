# PokéTactics: Liga Johto-Kanto
## Documento de Diseño de Juego (GDD) — v1.0

**Género:** Autobattler / Estrategia en tiempo real por rondas
**Inspiración estructural:** Teamfight Tactics
**Plataformas objetivo:** PC / Móvil
**Jugadores por partida:** 8
**Duración objetivo:** 25–35 minutos

---

# 1. Visión General

PokéTactics es un autobattler de 8 jugadores donde cada jugador actúa como Entrenador: compra Pokémon de las generaciones I y II en una tienda rotativa, los posiciona en un tablero hexagonal y observa cómo combaten automáticamente contra los equipos de los demás jugadores. Gana el último Entrenador con puntos de vida.

**Los tres pilares de diseño:**

1. **La evolución ES el sistema de mejora.** Donde TFT usa "estrellas" abstractas, aquí 3 copias de Charmander se fusionan en Charmeleon y 3 Charmeleon en Charizard. La progresión de poder es legible para cualquiera que conozca Pokémon: no hay que explicar qué es mejor, un Charizard *se ve* mejor que un Charmander. Esto reduce la curva de aprendizaje del sistema más complejo del género (la fusión de unidades) a cero para el público objetivo.

2. **La tabla de tipos como capa táctica.** El sistema clásico de ventajas (Agua > Fuego > Planta > Agua) se simplifica a un modificador de ±20-25% de daño. Es suficiente para que el scouting de oponentes importe ("va full Fuego, pivotaré a Agua") sin convertir cada combate en una lotería de counters duros.

3. **Fantasía de Entrenador, no de coleccionista.** La partida recompensa decisiones económicas y de composición, no suerte bruta. Toda mecánica aleatoria (tienda, drops PvE) tiene mitigación determinista (intereses, probabilidades públicas por nivel, pool compartido).

**Resumen de una partida:** 8 jugadores empiezan con 100 PS de Entrenador. Cada ronda compran unidades, posicionan y combaten (PvE en rondas de Pokémon salvajes, PvP el resto). Perder un combate PvP resta PS de Entrenador proporcionalmente a las unidades enemigas supervivientes. Al llegar a 0 PS quedas eliminado. La partida dura típicamente 30–35 rondas.

---

# 2. Roster y Sinergias

## 2.1 Estructura de rarezas

| Rareza | Coste | Líneas en roster | Copias en pool (por línea) | Disponible desde |
|---|---|---|---|---|
| Común | 1 oro | 14 | 29 | Ronda 1 |
| Poco común | 2 oro | 10 | 22 | Ronda 1 |
| Rara | 3 oro | 10 | 18 | Nivel 4 de Entrenador |
| Épica | 4 oro | 9 | 12 | Nivel 6 |
| Legendaria | 5 oro | 6 | 10 | Nivel 7 |

El pool es **compartido entre los 8 jugadores**: si tres jugadores acaparan Machop, encontrar el noveno para el Machamp 3★ se vuelve casi imposible. Esto fuerza diversidad de composiciones y castiga el seguidismo.

**Multiplicadores por etapa evolutiva (estrella):**

- 1★ (forma base): stats de tabla.
- 2★ (1.ª evolución, 3 copias): PS ×1,8 · ATQ ×1,8 · daño de habilidad ×1,5.
- 3★ (2.ª evolución, 9 copias base): PS ×3,2 · ATQ ×3,2 · daño de habilidad ×2,25.

Las líneas de 2 etapas (p. ej. Growlithe→Arcanine) evolucionan al 2★ y su 3★ es una "forma alfa" (misma especie, tamaño +30%, partículas doradas). Las unidades de etapa única (Snorlax, legendarios) usan el mismo escalado con cambio visual.

## 2.2 Roster completo (49 líneas)

Cada unidad tiene **tipos** (sinergias de origen, 1–2) y una **clase** (sinergia de rol). Stats listados a 1★. *Vel* = ataques por segundo. *Alc* = alcance en hexágonos. *Energía* = coste para lanzar el movimiento especial (empiezan con la mitad).

### Común — 1 oro

| Línea evolutiva | Tipos | Clase | PS | ATQ | Vel | Alc | Energía | Movimiento especial (a 1★) |
|---|---|---|---|---|---|---|---|---|
| Charmander → Charmeleon → Charizard | Fuego | Atacante | 550 | 50 | 0,75 | 1 | 60 | **Lanzallamas:** cono de 2 hex, 200 de daño + quemadura (20/s, 3 s) |
| Squirtle → Wartortle → Blastoise | Agua | Tanque | 700 | 40 | 0,60 | 1 | 80 | **Refugio:** escudo del 30% PS máx durante 4 s |
| Bulbasaur → Ivysaur → Venusaur | Planta | Soporte | 600 | 40 | 0,65 | 2 | 70 | **Drenadoras:** cura 180 PS al aliado más herido; el objetivo drenado pierde 60 |
| Cyndaquil → Quilava → Typhlosion | Fuego | Especialista | 500 | 45 | 0,70 | 3 | 70 | **Rueda Fuego:** 250 de daño al objetivo y 100 a adyacentes |
| Totodile → Croconaw → Feraligatr | Agua | Atacante | 600 | 55 | 0,70 | 1 | 50 | **Mordisco:** 220 de daño; si el objetivo está bajo 50% PS, +50% |
| Chikorita → Bayleef → Meganium | Planta | Tanque | 680 | 38 | 0,60 | 1 | 80 | **Pantalla Aroma:** reduce 25% el ATQ de enemigos en 2 hex, 4 s |
| Pichu → Pikachu → Raichu | Eléctrico | Velocista | 480 | 48 | 0,90 | 1 | 50 | **Impactrueno:** 180 de daño + paraliza 1 s (no ataca ni se mueve) |
| Geodude → Graveler → Golem | Roca | Tanque | 750 | 42 | 0,55 | 1 | 90 | **Rizo Defensa:** +40 DEF y reflejo del 15% del daño recibido, 5 s |
| Machop → Machoke → Machamp | Lucha | Atacante | 650 | 60 | 0,65 | 1 | 60 | **Golpe Kárate:** 240 de daño, ignora el 40% de la DEF |
| Gastly → Haunter → Gengar | Fantasma | Especialista | 450 | 40 | 0,70 | 3 | 80 | **Bola Sombra:** 280 al objetivo; aplica *Miedo* (−20% Vel) 3 s |
| Mareep → Flaaffy → Ampharos | Eléctrico | Especialista | 520 | 42 | 0,65 | 3 | 75 | **Onda Trueno:** 150 en cadena a 3 enemigos (−30% por salto) |
| Hoothoot → Noctowl | Normal, Volador | Soporte | 550 | 38 | 0,70 | 2 | 70 | **Hipnosis:** duerme al enemigo más lejano 2,5 s (despierta al recibir daño) |
| Sentret → Furret | Normal | Velocista | 500 | 46 | 0,85 | 1 | 55 | **Ataque Rápido:** dash al enemigo con menos PS, 200 de daño |
| **Magikarp** (ver 6.4) | — | — | 350 | 1 | 0,50 | 1 | — | **Salpicadura:** no hace nada. En serio. |

### Poco común — 2 oro

| Línea evolutiva | Tipos | Clase | PS | ATQ | Vel | Alc | Energía | Movimiento especial |
|---|---|---|---|---|---|---|---|---|
| Abra → Kadabra → Alakazam | Psíquico | Especialista | 480 | 45 | 0,70 | 4 | 70 | **Psicorrayo:** 320 al enemigo con más ATQ del campo |
| Growlithe → Arcanine | Fuego | Velocista | 600 | 55 | 0,85 | 1 | 60 | **Velocidad Extrema:** embiste atravesando 3 hex, 180 a cada enemigo tocado |
| Poliwag → Poliwhirl → Poliwrath | Agua, Lucha | Atacante | 620 | 58 | 0,70 | 1 | 65 | **Hidropulso:** 260 + confusión 2 s (50% de fallar ataques) |
| Oddish → Gloom → Vileplume | Planta | Soporte | 580 | 40 | 0,60 | 2 | 80 | **Polvo Veneno:** nube 7 hex, 40/s de daño y −30% curación, 4 s |
| Eevee → Vaporeon / Jolteon / Flareon (ver 6.5) | Normal → variable | Especialista | 560 | 48 | 0,75 | 2 | 70 | Según evolución elegida |
| Cubone → Marowak | Roca | Atacante | 640 | 60 | 0,65 | 1 | 60 | **Hueso Bumerán:** golpea 2 veces (160 ×2), la 2.ª aturde 1 s |
| Zubat → Golbat → Crobat | Volador | Velocista | 540 | 50 | 0,95 | 1 | 55 | **Chupavidas:** 200 de daño y se cura el 100% del daño infligido |
| Slowpoke → Slowbro | Agua, Psíquico | Tanque | 800 | 38 | 0,50 | 1 | 90 | **Amnesia:** −50% del daño de habilidades recibido, 5 s |
| Magnemite → Magneton | Eléctrico, Acero | Especialista | 560 | 44 | 0,65 | 3 | 75 | **Chispazo:** 240 + roba 20 de DEF al objetivo, 4 s |
| Phanpy → Donphan | Roca | Tanque | 780 | 45 | 0,55 | 1 | 85 | **Rodada:** gira 3 s, +30% DEF, 80/s a enemigos adyacentes |

### Rara — 3 oro (desbloqueada a nivel 4)

| Línea evolutiva | Tipos | Clase | PS | ATQ | Vel | Alc | Energía | Movimiento especial |
|---|---|---|---|---|---|---|---|---|
| Scyther → Scizor | Acero | Atacante | 700 | 70 | 0,80 | 1 | 60 | **Puño Bala:** 3 golpes de 130; cada golpe que mata reinicia la habilidad |
| Magmar | Fuego | Especialista | 620 | 55 | 0,70 | 3 | 75 | **Puño Fuego:** 350 + quemadura que reduce 40% la curación, 4 s |
| Electabuzz | Eléctrico | Atacante | 680 | 65 | 0,75 | 1 | 65 | **Puño Trueno:** 320 + paraliza 1,5 s |
| Onix → Steelix | Acero, Roca | Tanque | 950 | 40 | 0,45 | 1 | 100 | **Atadura:** inmoviliza al objetivo 3 s y le inflige 60/s |
| Houndour → Houndoom | Siniestro, Fuego | Especialista | 600 | 58 | 0,75 | 3 | 70 | **Pulso Umbrío:** 300 en línea de 3 hex; +50% a objetivos con *Miedo* |
| Sneasel | Siniestro | Velocista | 580 | 62 | 1,00 | 1 | 55 | **Garra Brutal:** 280; críticos garantizados por la espalda |
| Murkrow | Siniestro, Volador | Velocista | 560 | 58 | 0,90 | 1 | 60 | **Alevosía:** se teletransporta al enemigo con menos PS y le inflige 320 |
| Misdreavus | Fantasma | Especialista | 540 | 50 | 0,70 | 3 | 80 | **Rabia:** grito en 3 hex, 200 + *Miedo* (−20% Vel) 3 s |
| Heracross | Lucha | Atacante | 720 | 72 | 0,70 | 1 | 65 | **Megacuerno:** 400 a un objetivo; si lo mata, gana +30% ATQ el resto del combate |
| Mr. Mime | Psíquico | Soporte | 580 | 42 | 0,65 | 3 | 85 | **Barrera:** escudo de 250 a los 2 aliados más cercanos, 4 s |

### Épica — 4 oro (desbloqueada a nivel 6)

| Línea evolutiva | Tipos | Clase | PS | ATQ | Vel | Alc | Energía | Movimiento especial |
|---|---|---|---|---|---|---|---|---|
| Snorlax | Normal | Tanque | 1.300 | 55 | 0,50 | 1 | 100 | **Descanso:** duerme 2 s, recupera el 35% de sus PS máx; al despertar, +25% ATQ |
| Lapras | Agua | Soporte | 900 | 48 | 0,60 | 2 | 90 | **Canto Helado:** congela 2 s a los 2 enemigos más cercanos y cura 200 al aliado más herido |
| Dratini → Dragonair → Dragonite | Dragón, Volador | Atacante | 850 | 75 | 0,75 | 1 | 70 | **Cometa Draco:** 5 meteoros de 150 sobre enemigos aleatorios |
| Larvitar → Pupitar → Tyranitar | Roca, Siniestro | Tanque | 1.100 | 60 | 0,55 | 1 | 95 | **Tormenta Arena:** 5 s; aliados Roca +30 DEF, enemigos a 2 hex reciben 50/s y −20% precisión |
| Kingdra | Agua, Dragón | Especialista | 750 | 60 | 0,70 | 3 | 80 | **Danza Dragón + Hidrobomba:** +25% Vel permanente y 380 al objetivo |
| Exeggutor | Planta, Psíquico | Especialista | 820 | 55 | 0,60 | 3 | 85 | **Somnífero:** duerme 2 s a todos los enemigos en un área de 7 hex |
| Raikou | Eléctrico, Legendario | Velocista | 800 | 70 | 0,90 | 1 | 65 | **Trueno:** rayo sobre 3 enemigos aleatorios, 280 c/u + paraliza 1 s |
| Entei | Fuego, Legendario | Tanque | 1.150 | 58 | 0,60 | 1 | 90 | **Estallido:** explosión de 3 hex, 300 + quemadura (30/s, 4 s) |
| Suicune | Agua, Legendario | Soporte | 950 | 50 | 0,65 | 2 | 90 | **Aguas Puras:** limpia efectos negativos de todos los aliados y les cura 150 |

### Legendaria — 5 oro (desbloqueada a nivel 7)

| Unidad | Tipos | Clase | PS | ATQ | Vel | Alc | Energía | Movimiento especial |
|---|---|---|---|---|---|---|---|---|
| Mewtwo | Psíquico, Legendario | Especialista | 900 | 80 | 0,75 | 4 | 90 | **Psíquico:** 500 al objetivo y lo lanza 2 hex hacia atrás; el impacto aturde 1,5 s en área |
| Lugia | Volador, Legendario | Tanque | 1.400 | 60 | 0,60 | 2 | 100 | **Aerochorro:** 350 en línea completa + empuja 1 hex; Lugia gana 25% de reducción de daño 4 s |
| Ho-Oh | Fuego, Legendario | Soporte | 1.000 | 55 | 0,65 | 3 | 100 | **Fuego Sagrado:** 300 en área 7 hex y **revive** al primer aliado caído con 40% PS (1 vez por combate) |
| Zapdos | Eléctrico, Legendario | Especialista | 880 | 70 | 0,70 | 4 | 85 | **Voltio Cruel:** 450 al objetivo; se propaga al 50% a todo enemigo adyacente al impactado |
| Moltres | Fuego, Legendario | Atacante | 920 | 85 | 0,70 | 2 | 80 | **Envite Ígneo:** 550 al objetivo, Moltres recibe 10% de sus PS; deja el hex en llamas (60/s) |
| Articuno | Agua, Legendario | Especialista | 880 | 65 | 0,65 | 4 | 95 | **Ventisca:** cono de 5 hex, 320 + congela 2 s a los afectados |

## 2.3 Sinergias de tipo (origen)

Las sinergias cuentan **líneas únicas** en el campo (dos Charmander = 1 Fuego). Se activan al iniciar el combate y permanecen toda la ronda. Eevee cuenta para su tipo elegido tras evolucionar.

| Sinergia | Umbrales | Efecto |
|---|---|---|
| **Fuego** (8 líneas) | 2 / 4 / 6 | Los ataques básicos de los Fuego aplican quemadura acumulable: **(2)** 15 de daño/s durante 3 s · **(4)** 30/s y la quemadura reduce 33% la curación del objetivo · **(6)** 50/s y al morir un enemigo quemado, explota (150 en área de 1 hex). *Razón de diseño: Fuego es la sinergia de presión sostenida y anti-curación; castiga composiciones de Soporte.* |
| **Agua** (8 líneas) | 2 / 4 / 6 | Los Agua generan energía extra por ataque: **(2)** +3 · **(4)** +6 · **(6)** +10, y su primera habilidad de cada combate cuesta 25% menos. *Razón: Agua es la sinergia de ciclado de habilidades; convierte combates largos en victorias por acumulación.* |
| **Planta** (4 líneas) | 2 / 4 | Al final de cada segundo, los aliados Planta y los adyacentes a un Planta regeneran: **(2)** 1,5% PS máx · **(4)** 3,5% PS máx. *Razón: Planta ancla composiciones de desgaste; su counter natural es la quemadura de Fuego.* |
| **Eléctrico** (6 líneas) | 2 / 4 / 6 | Los Eléctrico ganan velocidad de ataque acumulativa: +5% por cada ataque realizado, hasta **(2)** +25% · **(4)** +50% · **(6)** +90%, y a nivel 4+ cada 5.º ataque paraliza 0,5 s. *Razón: escala con la duración del combate; débil en peleas cortas, imparable en largas.* |
| **Psíquico** (5 líneas) | 2 / 4 | Los Psíquico empiezan el combate con energía extra: **(2)** +30% de su barra · **(4)** +60% y sus habilidades infligen 20% más. *Razón: sinergia de burst inicial, opuesta filosóficamente a Eléctrico.* |
| **Lucha** (3 líneas) | 2 / 3 | Los Lucha curan al golpear: **(2)** 25% del daño infligido · **(3)** 40% y sus golpes reducen 10 DEF (acumulable 5 veces). *Razón: duelistas autosuficientes de primera línea.* |
| **Roca** (5 líneas) | 2 / 4 | Todo el equipo (no solo Roca) gana DEF: **(2)** +20 · **(4)** +45 y los Roca devuelven el 12% del daño recibido. *Razón: única sinergia que beneficia a todo el equipo; splash natural de 2 unidades.* |
| **Volador** (5 líneas) | 2 / 4 | Los Volador esquivan ataques básicos: **(2)** 20% · **(4)** 35% y al esquivar ganan +10% Vel 2 s. *Razón: counter blando de Atacantes; vulnerable a habilidades, que no fallan.* |
| **Fantasma** (2 líneas) | 2 | Al iniciar el combate, los Fantasma son intangibles 2 s (no pueden ser objetivo) y su primer golpe aplica *Miedo* (−20% Vel, 3 s). *Umbral único: solo hay 2 líneas; es un splash de utilidad, no un eje de composición.* |
| **Siniestro** (4 líneas) | 2 / 4 | Los Siniestro infligen críticos (×1,5) con probabilidad: **(2)** 20% · **(4)** 40%, y +100% de probabilidad contra objetivos con *Miedo*. *Razón: paquete de daño que se combina explícitamente con Fantasma (fuente de Miedo).* |
| **Acero** (3 líneas) | 2 / 3 | Los Acero reciben menos daño de ataques básicos: **(2)** −20% · **(3)** −35% e inmunidad a quemadura y veneno. *Razón: counter directo de Fuego y de composiciones de ataque básico.* |
| **Normal** (4 líneas) | 2 / 4 | Los Normal ganan PS máx: **(2)** +15% · **(4)** +30% y al caer bajo 30% PS ganan +30% Vel (instinto de supervivencia). *Razón: estadística pura, fácil de evaluar para jugadores nuevos.* |
| **Dragón** (3 líneas) | 2 / 3 | Los Dragón ignoran las ventajas de tipo enemigas contra ellos: **(2)** el daño superefectivo que reciben se reduce a neutro · **(3)** además +25% de daño de habilidad. *Razón: opt-out de la tabla de tipos a cambio de unidades caras.* |
| **Legendario** (9 unidades) | 2 / 3 | Aura de presencia: **(2)** todo el equipo +10% de daño · **(3)** +20% y los Legendarios reviven una vez con 30% PS. *Razón: sinergia de endgame que da salida natural a los 5-costes sueltos.* |

## 2.4 Sinergias de clase (rol)

| Clase | Umbrales | Efecto |
|---|---|---|
| **Tanque** (10) | 2 / 4 / 6 | Los Tanques ganan DEF y robo de aggro: **(2)** +30 DEF · **(4)** +70 DEF y −15% daño recibido · **(6)** +120 DEF y al caer bajo 50% PS ganan escudo del 20% PS máx. |
| **Atacante** (11) | 2 / 4 / 6 | ATQ adicional: **(2)** +20% · **(4)** +45% · **(6)** +80%. Simple a propósito: es la línea de daño físico de referencia. |
| **Especialista** (14) | 2 / 4 / 6 | Daño de habilidad: **(2)** +25% · **(4)** +55% · **(6)** +100%. |
| **Velocista** (7) | 2 / 4 | Al inicio del combate saltan a la retaguardia enemiga; **(2)** +15% Vel · **(4)** +35% Vel y su primer ataque es crítico garantizado. |
| **Soporte** (7) | 2 / 3 | Curaciones y escudos propios: **(2)** +25% de potencia · **(3)** +50% y al lanzar una habilidad otorgan +5 de energía a todos los aliados. |

## 2.5 Interacción entre sinergias

- **Apilamiento aditivo:** todos los bonus porcentuales de la misma estadística se suman antes de aplicarse (Atacante 4 + Legendario 2 = +55% de daño, no ×1,45×1,10).
- **Unidades puente:** las unidades de doble tipo (Poliwrath: Agua+Lucha; Tyranitar: Roca+Siniestro; Magneton: Eléctrico+Acero) cuentan para ambas sinergias simultáneamente y son las piezas de pivote del meta. Ejemplo: Tyranitar solo, junto a Geodude y Houndour, activa a la vez Roca (2) y Siniestro (2).
- **Combos diseñados intencionalmente:** Fantasma (2) aplica *Miedo* → Siniestro (4) critica al 100% contra objetivos con *Miedo* → Houndoom (Pulso Umbrío +50% vs *Miedo*) es la carta de pago. Detectar estas cadenas es parte del dominio del juego.
- **Ejemplo de composición completa (nivel 8):** Blastoise, Poliwrath, Slowbro, Kingdra, Suicune, Machamp, Heracross, Lapras = Agua (6) + Lucha (3) + Tanque (2) + Atacante (2) + Soporte (2) + Legendario (1, inactiva). Ciclado masivo de habilidades con frontline autosuficiente.

---

# 3. Mecánicas de Combate

## 3.1 El tablero

Tablero hexagonal de **8 filas × 7 columnas**; cada jugador posiciona en sus 4 filas. Convención: fila 1 = frente (línea de contacto), fila 4 = retaguardia. En PvP, el tablero del oponente se refleja contra el propio.

## 3.2 Flujo de un combate

1. **Fase de planificación (30 s):** compra, posicionamiento, equipamiento de objetos. La tienda y el tablero rival son visibles (scouting libre con clic en los retratos de los rivales).
2. **Fase de combate (hasta 45 s):** automática. Si a los 45 s quedan unidades de ambos bandos, entra **muerte súbita**: todas las unidades reciben 5% de sus PS máx por segundo hasta que un bando cae. Empate real (aniquilación simultánea): ambos jugadores reciben daño de Entrenador.

## 3.3 Comportamiento de las unidades (IA por clase)

- **Selección de objetivo por defecto:** el enemigo más cercano; en empate de distancia, el de menos PS actuales.
- **Tanques y Atacantes (alcance 1):** avanzan en línea recta hacia el enemigo más cercano y fijan objetivo hasta que muera. Los Tanques tienen prioridad de bloqueo: ocupan el hex y obligan a rodearlos.
- **Especialistas y Soportes (alcance 2–4):** mantienen posición mientras tengan un objetivo en alcance; si no, avanzan el mínimo de hexes necesario. Esto los hace dependientes del frontline: si éste cae rápido, quedan expuestos.
- **Velocistas:** al sonar la campana saltan al hex libre más cercano a la **retaguardia enemiga** (prioridad: el enemigo con menos PS máximos, típicamente un Especialista). Son la respuesta de diseño contra composiciones que esconden todo el daño en fila 4.

## 3.4 Energía y movimientos especiales

Cada unidad tiene una barra de energía (60–100 según la tabla del roster) y **empieza el combate con el 50%** (modificable por Psíquico/Agua/objetos).

- **Ganancia:** +10 por ataque básico realizado; +1 por cada 1% de PS perdido (máx +25 por golpe recibido).
- **Lanzamiento:** al llenar la barra, la unidad lanza su movimiento especial de inmediato (interrumpe el ataque básico en curso) y la barra vuelve a 0.
- **Ritmo resultante:** un Atacante típico (Vel 0,70; energía 60) lanza su especial cada ~6–8 s si no recibe daño, cada ~4–5 s bajo fuego. Los Tanques (energía 90–100) lanzan 1–2 especiales por combate; sus habilidades son defensivas y de alto impacto para compensar.
- Las habilidades **no fallan ni pueden ser esquivadas** (la esquiva de Volador solo aplica a ataques básicos).

## 3.5 Cálculo de daño

- **Daño físico (ataques básicos):** `daño = ATQ × modificadores − DEF × 0,5`, con mínimo del 20% del ATQ. DEF base por clase: Tanques 40, resto 15–25.
- **Daño de habilidad:** valor plano de la tabla × multiplicador de estrella × bonus de Especialista/sinergias. No es mitigado por DEF (sí por efectos como Amnesia o Acero… que especifican "ataques básicos" cuando solo aplican a físico).

## 3.6 Tabla de tipos (ventajas)

El tipo de **ataque** de una unidad es su tipo primario (el primero listado). El modificador compara tipo de ataque vs tipo primario del defensor y aplica a **todo** su daño (básico y habilidad):

| Ataque ↓ | Superefectivo (+25%) | Poco efectivo (−20%) |
|---|---|---|
| Fuego | Planta, Acero | Agua, Roca |
| Agua | Fuego, Roca | Planta, Dragón |
| Planta | Agua, Roca | Fuego, Volador |
| Eléctrico | Agua, Volador | Planta, Dragón |
| Lucha | Normal, Roca, Acero | Volador, Psíquico |
| Psíquico | Lucha | Siniestro (−50%), Acero |
| Roca | Fuego, Volador | Lucha, Acero |
| Volador | Lucha, Planta | Eléctrico, Roca |
| Fantasma | Psíquico, Fantasma | Siniestro, Normal (−50%) |
| Siniestro | Psíquico, Fantasma | Lucha, Siniestro |
| Acero | Roca | Fuego, Agua, Acero |
| Normal | — | Roca, Acero, Fantasma (−50%) |
| Dragón | Dragón | Acero |

**Decisión de diseño:** ±25/20% (no ×2/×0,5 como en los juegos originales) para que la tabla incline combates parejos sin invalidar composiciones. Un Charizard 2★ sigue ganando a un Bulbasaur 1★; pero entre dos equipos de fuerza similar, el que tenga ventaja de tipos gana ~70% de las veces. La excepción didáctica son las inmunidades clásicas suavizadas a −50% (Normal/Lucha vs Fantasma, Psíquico vs Siniestro): lo bastante duras para sentirse fieles, sin daño cero (que en un autobattler produce combates eternos irresolubles).

## 3.7 Efectos de estado (resumen)

| Estado | Efecto | Fuentes | Contrarresta |
|---|---|---|---|
| Quemadura | Daño/s + posible anti-curación | Sinergia Fuego, habilidades | Acero (3), Suicune |
| Paralización | No actúa (0,5–2 s) | Eléctricos | — |
| Sueño | No actúa; despierta al recibir daño | Hipnosis, Somnífero | Daño de área propio |
| Congelación | No actúa, no despierta con daño (máx 2 s) | Lapras, Articuno | — |
| *Miedo* | −20% Vel; habilita críticos Siniestro | Fantasmas | Suicune |
| Confusión | 50% de fallar básicos (2 s) | Poliwrath | — |

Regla anti-frustración: una unidad no puede estar controlada (paralizada/dormida/congelada) más de 4 s acumulados por cada 10 s de combate; los controles posteriores duran el 50%.

---

# 4. Flujo de Partida

## 4.1 Estructura general

8 jugadores, 100 PS de Entrenador. La partida se divide en **Fases** (regiones del mapa Kanto→Johto, puro vestido narrativo) de 6 rondas. Una partida termina cuando queda 1 jugador vivo, típicamente en la fase 6 o 7 (rondas 30–38).

| Ronda dentro de la fase | Tipo |
|---|---|
| X-1 | **Safari** (carrusel compartido; desde fase 2) |
| X-2 a X-5 | **PvP** contra otro jugador (emparejamiento rotativo que evita repetir rival en 3 rondas) |
| X-6 | **PvE** contra Pokémon salvajes (drops garantizados) |

**Fase 1 (tutorial económico):** solo 3 rondas PvE suaves (sin Safari, sin PvP). Sirve para comprar las primeras unidades sin presión.

## 4.2 Rondas PvE (Pokémon salvajes)

| Fase | Encuentro salvaje | Dificultad esperada | Botín |
|---|---|---|---|
| 1 (rondas 1–3) | Pidgey ×2 → Rattata ×3 → Spearow ×3 | Trivial | 1 unidad gratis o componente de objeto por ronda |
| 2-6 | Mankey ×4 | Baja | 1 componente garantizado |
| 3-6 | Onix salvaje ×2 | Media: requiere ~4 unidades 2★ | 1 componente + 2 oro |
| 4-6 | **Snorlax salvaje** (mini-boss, 4.500 PS) | Alta: chequeo de daño real | 1 objeto completo |
| 5-6 | Manada de Tauros ×5 | Alta | 2 componentes |
| 6-6 | **Dragonite salvaje** (boss, 8.000 PS, usa Cometa Draco) | Muy alta | 1 objeto completo + 1 Piedra Evolutiva (ver 6.5) |
| 7-6 | **Mew salvaje** (boss final PvE, raro que se alcance) | Extrema | Copia de cualquier unidad del jugador |

Perder una ronda PvE inflige 2 PS de Entrenador y NO da botín: las rondas PvE son el chequeo de poder que castiga el greed económico extremo.

## 4.3 Ronda Safari (carrusel)

Los 8 jugadores entran a un área compartida donde 9 Pokémon corren en círculo, cada uno portando un objeto. Se libera a los jugadores por orden **inverso de PS de Entrenador** (los últimos eligen primero, mecánica de recuperación). Cada jugador captura exactamente 1 Pokémon con su objeto. Las unidades del Safari pueden ser de cualquier rareza desbloqueada para la fase (en Safari de fase 5+, garantizado al menos un 4-coste).

## 4.4 Daño de Entrenador

Al perder un PvP: `daño = base de fase + Σ(estrellas de unidades enemigas supervivientes)`.

| Fase | 1 | 2 | 3 | 4 | 5 | 6 | 7+ |
|---|---|---|---|---|---|---|---|
| Daño base | 0 | 2 | 3 | 5 | 7 | 10 | 15 |

Ejemplo: en fase 4, perder dejando vivos un Charizard (3★) y dos Pikachu (2★) = 5 + 3 + 2 + 2 = **12 PS**. Promedio de eliminación: el jugador medio aguanta 9–12 derrotas. El escalado garantiza que las partidas no se eternicen: en fase 6+ cada derrota es potencialmente letal.

## 4.5 Arco narrativo de la partida

- **Early game (fases 1–2, rondas 1–9):** economía sobre tablero. Decisión central: ¿proteger racha de victorias con compras agresivas, o perder con intención (lose-streak) acumulando intereses? Composiciones de 1–2 costes con pares 2★.
- **Mid game (fases 3–4, rondas 10–21):** el punto de inflexión es el acceso a nivel 6 (épicas en tienda) y el Snorlax salvaje en 4-6 como muro de poder. Aquí se decide la identidad de la composición (¿qué sinergia a 4+?) y se gasta el oro acumulado. Primeras eliminaciones esperadas: ronda ~18.
- **Late game (fases 5–7, ronda 22+):** quedan 3–5 jugadores. Nivel 8, legendarios, lucha por 3★ de unidades caras. El daño de Entrenador hace que cada combate sea decisivo. Condición de victoria: **último Entrenador con PS > 0**. (Modo alternativo "Liga rápida" para móvil: gana el primero en alcanzar 10 victorias PvP; fuera del alcance de la v1.0.)

---

# 5. Sistema de Economía

## 5.1 Ingresos por ronda

| Concepto | Cantidad |
|---|---|
| Ingreso base | 5 oro (rondas 1–3: 2/3/4 oro) |
| Victoria PvP | +1 oro |
| Interés | +1 oro por cada 10 oro ahorrados al final de la ronda (máx +5) |
| Racha (victorias o derrotas consecutivas) | 2–3: +1 · 4–5: +2 · 6+: +3 |

**Lectura de diseño:** el interés máximo (+5 con 50 oro) crea el umbral psicológico clave del juego. "Bajar de 50" es la decisión de compromiso por excelencia. Las rachas de derrota pagan igual que las de victoria para que el lose-streak intencional sea una estrategia legítima de early game (sacrificas PS por economía).

## 5.2 Experiencia y niveles

- +2 XP gratis por ronda. Comprar XP: **4 oro = 4 XP**, sin límite por ronda.
- El **nivel de Entrenador = unidades máximas en campo**.

| Nivel | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|
| XP acumulada para alcanzarlo | 2 | 6 | 12 | 22 | 38 | 60 | 88 | 124 |

## 5.3 Probabilidades de tienda por nivel

| Nivel | 1 oro | 2 oro | 3 oro | 4 oro | 5 oro |
|---|---|---|---|---|---|
| 3 | 75% | 25% | — | — | — |
| 4 | 55% | 35% | 10% | — | — |
| 5 | 40% | 35% | 23% | 2% | — |
| 6 | 25% | 35% | 30% | 10% | — |
| 7 | 18% | 28% | 32% | 18% | 4% |
| 8 | 12% | 20% | 30% | 26% | 12% |
| 9 | 8% | 15% | 25% | 30% | 22% |

Probabilidades públicas (visibles en la UI de la tienda, como en TFT): la información oculta genera frustración, no profundidad.

## 5.4 Tienda

- **5 espacios** por refresco; muestra unidades en su forma base (compras Charmander, nunca Charizard).
- Se refresca gratis al inicio de cada ronda; **refresco manual: 2 oro**, ilimitado.
- **Bloqueo de tienda:** candado para conservar la oferta actual a la siguiente ronda.
- **Compra:** coste de rareza. **Venta:** una 1★ devuelve su coste íntegro; una 2★ devuelve `coste × 3 − 1`; una 3★ devuelve `coste × 6`. La penalización de −1 en 2★ evita usar el banco como cuenta de ahorro sin riesgo; el precio de venta de 3★ es deliberadamente inferior a las 9 copias invertidas porque un 3★ vendido ya cumplió su función.

## 5.5 Curva económica de referencia

Un jugador competente que estabiliza en ronda 2-2 con lose-streak controlado llega a 50 oro alrededor de la ronda 3-2, sube a nivel 6 en 3-5/4-1, y a partir de ahí decide entre **rolldown** (gastar 30–40 oro en refrescos buscando sus 2★ clave) o **fast 8** (seguir ahorrando hacia nivel 8 y legendarios). Ambas rutas deben ser viables; el balance se ajusta con las probabilidades de la tabla 5.3.

---

# 6. Construcción de Equipo

## 6.1 Límites

- **Campo:** unidades = nivel de Entrenador (máx 9).
- **Banco:** 9 espacios. Las unidades del banco no combaten ni cuentan para sinergias.
- Si el banco está lleno no puedes comprar (salvo que la compra complete una fusión inmediata).

## 6.2 Evoluciones (fusión de copias)

- **3 copias 1★ de la misma línea → evolución 2★** automática (donde sea que estén, campo o banco; la unidad resultante conserva la posición y los objetos de la copia mejor equipada).
- **3 copias 2★ → forma final 3★** (9 copias base en total).
- Stats: ver multiplicadores en 2.1. La rareza visual escala: marco plateado y animación de evolución clásica al 2★; marco dorado, aura y modelo agrandado al 3★.
- Las evoluciones **no cambian el coste de tienda** de la línea, pero sí el valor de venta (5.4).
- Cambio de identidad al evolucionar (excepciones diseñadas): Onix gana el tipo Acero desde 1★ (anticipa a Steelix); Scyther cuenta como Acero desde 1★ (anticipa a Scizor); Gyarados cuenta Agua+Dragón. Regla general para el resto: los tipos son fijos toda la línea, para que las sinergias no se rompan al evolucionar.

## 6.3 Posicionamiento táctico

- **Fila 1–2 (frente):** Tanques y Atacantes. Reciben el primer impacto y fijan la línea de contacto.
- **Fila 3–4 (retaguardia):** Especialistas y Soportes. Su DPS depende de sobrevivir; la amenaza de Velocistas enemigos obliga a decisiones reales: ¿esquinas protegidas con un Tanque de escolta en fila 4, o agrupar todo al centro?
- **Flancos:** colocar el equipo cargado a un lado contra rivales con daño de área central (Exeggutor, Articuno); separarse contra daño en línea (Houndoom, Lugia).
- **Counter-posicionamiento observable:** todo el posicionamiento rival es visible en planificación. El juego de adivinanza ("¿moverá su Mewtwo a la otra esquina?") es contenido estratégico gratuito y deliberado.

## 6.4 Mecánica especial: Magikarp

Magikarp cuesta 1 oro, no tiene tipos ni clase, y su ATQ es 1. Es estrictamente una carga para el tablero. **3 Magikarp se fusionan en un Gyarados 2★** (Agua, Dragón / Atacante; stats de épica: 1.000 PS, 80 ATQ; **Hiperrayo:** 600 a un objetivo y queda 1,5 s sin atacar). 3 Gyarados (9 Magikarp) → Gyarados 3★, la unidad más fuerte del juego. Gyarados no aparece en tienda. *Razón de diseño: es la apuesta de alto riesgo icónica de la franquicia convertida en mecánica: sacrificas poder presente (hexes y oro en peces inútiles) por un pico de poder futuro. También enseña la lección económica central del juego de forma memorable.*

## 6.5 Mecánica especial: Eevee y las Piedras Evolutivas

Al fusionar 3 Eevee, el jugador **elige** la evolución (ventana de 10 s; por defecto, la que más sinergias active):

- **Vaporeon** (Agua / Soporte): Aqua Aro — cura 250 en área de 3 hex.
- **Jolteon** (Eléctrico / Velocista): Pin Misil — 5 proyectiles de 90 a enemigos aleatorios.
- **Flareon** (Fuego / Atacante): Llamarada — 350 + quemadura fuerte.

Las **Piedras Evolutivas** (drop del boss de fase 6, y rara vez del Safari) permiten evolucionar instantáneamente 1 copia como si fueran 3 (una 1★ pasa a 2★, o añade una "copia virtual" a la cuenta). Límite: 1 por unidad.

## 6.6 Objetos (sistema secundario, resumen)

Los PvE sueltan **componentes** (6 tipos: Garra, Caparazón, Pluma, Chip, Baya, Polvo). Dos componentes se combinan en un objeto completo (21 combinaciones). Máximo 3 objetos por unidad. Ejemplos: Garra+Garra = **Navaja Crítica** (+30% prob. de crítico); Baya+Caparazón = **Restos** (regenera 2% PS/s); Chip+Pluma = **Cinta Focus** (la primera vez que caería, sobrevive con 1 PS). El detalle completo del sistema de objetos se especifica en un documento aparte (GDD-Items v0.x); este resumen existe para que el lazo de recompensas PvE del presente documento sea autocontenido.

---

## Apéndice: resumen de cifras clave para QA de balance

| Parámetro | Valor |
|---|---|
| Jugadores / PS iniciales | 8 / 100 |
| Líneas de roster | 49 (14/10/10/9/6 por rareza) |
| Costes | 1/2/3/4/5 oro |
| Fusión | 3 copias → 2★ (×1,8) · 9 → 3★ (×3,2) |
| Tienda | 5 espacios · refresco 2 oro · probabilidades públicas |
| XP | +2/ronda · 4 oro = 4 XP · nivel = unidades en campo |
| Interés | 1 por 10 oro, máx 5 |
| Modificador de tipos | +25% / −20% (inmunidades clásicas: −50%) |
| Duración de combate | máx 45 s + muerte súbita |
| Fases / partida típica | 6–7 fases · 30–38 rondas · 25–35 min |

