// PokéTactics — data.js : datos del GDD v1.0 (roster, sinergias, tipos, objetos, PvE)
// Compartido entre navegador (globals) y Node (module.exports)

const SPRITE = (dex) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dex}.png`;

// ---------- Constantes globales ----------
const CFG = {
  PLAYER_HP: 100,
  BOARD_COLS: 7, BOARD_ROWS: 8, HALF_ROWS: 4,
  BENCH_SIZE: 9,
  SHOP_SLOTS: 5,
  REROLL_COST: 2,
  XP_COST: 4, XP_PER_BUY: 4, XP_PER_ROUND: 2,
  MAX_LEVEL: 9,
  PLAN_TIME: 30, SAFARI_TIME: 25, COMBAT_MAX: 45,
  TICK: 0.1, SNAP_EVERY: 2,
  INTEREST_PER: 10, INTEREST_MAX: 5,
  POOL: { 1: 29, 2: 22, 3: 18, 4: 12, 5: 10 },
  STAR_HP: [1, 1, 1.8, 3.2], STAR_ATK: [1, 1, 1.8, 3.2], STAR_AB: [1, 1, 1.5, 2.25],
  BASE_DEF: { Tanque: 40, Atacante: 25, Especialista: 15, Soporte: 20, Velocista: 20 },
  // XP acumulada necesaria para ALCANZAR cada nivel (índice = nivel)
  XP_TABLE: { 2: 2, 3: 6, 4: 12, 5: 22, 6: 38, 7: 60, 8: 88, 9: 124 },
  PHASE_BASE_DMG: { 1: 0, 2: 2, 3: 3, 4: 5, 5: 7, 6: 10, 7: 15 },
  ROUND_GOLD: { 1: 2, 2: 3, 3: 4 }, BASE_GOLD: 5,
  STREAK_GOLD: (s) => (s >= 6 ? 3 : s >= 4 ? 2 : s >= 2 ? 1 : 0),
  TYPE_ADV: 1.25, TYPE_DIS: 0.8, TYPE_IMMUNE: 0.5,
  CC_CAP: 4, CC_WINDOW: 10,
  SUDDEN_DEATH_DPS: 0.05, // 5% PS máx/s
  MAX_ITEMS: 3,
};

// Probabilidades de tienda por nivel [1c,2c,3c,4c,5c] en %
const SHOP_ODDS = {
  1: [100, 0, 0, 0, 0], 2: [85, 15, 0, 0, 0], 3: [75, 25, 0, 0, 0],
  4: [55, 35, 10, 0, 0], 5: [40, 35, 23, 2, 0], 6: [25, 35, 30, 10, 0],
  7: [18, 28, 32, 18, 4], 8: [12, 20, 30, 26, 12], 9: [8, 15, 25, 30, 22],
};

// ---------- Tabla de tipos ----------
// chart[atk][def] = multiplicador (solo se listan los != 1)
const TYPE_CHART = {
  Fuego:     { Planta: 1.25, Acero: 1.25, Agua: 0.8, Roca: 0.8 },
  Agua:      { Fuego: 1.25, Roca: 1.25, Planta: 0.8, 'Dragón': 0.8 },
  Planta:    { Agua: 1.25, Roca: 1.25, Fuego: 0.8, Volador: 0.8 },
  'Eléctrico': { Agua: 1.25, Volador: 1.25, Planta: 0.8, 'Dragón': 0.8 },
  Lucha:     { Normal: 1.25, Roca: 1.25, Acero: 1.25, Volador: 0.8, 'Psíquico': 0.8, Fantasma: 0.5 },
  'Psíquico':  { Lucha: 1.25, Siniestro: 0.5, Acero: 0.8 },
  Roca:      { Fuego: 1.25, Volador: 1.25, Lucha: 0.8, Acero: 0.8 },
  Volador:   { Lucha: 1.25, Planta: 1.25, 'Eléctrico': 0.8, Roca: 0.8 },
  Fantasma:  { 'Psíquico': 1.25, Fantasma: 1.25, Siniestro: 0.8, Normal: 0.5 },
  Siniestro: { 'Psíquico': 1.25, Fantasma: 1.25, Lucha: 0.8, Siniestro: 0.8 },
  Acero:     { Roca: 1.25, Fuego: 0.8, Agua: 0.8, Acero: 0.8 },
  Normal:    { Roca: 0.8, Acero: 0.8, Fantasma: 0.5 },
  'Dragón':    { 'Dragón': 1.25, Acero: 0.8 },
  Legendario: {},
};

// ---------- Roster ----------
// {id, cost, types, cls, names[3], dex[3], hp, atk, spd, range, energy, ab:{name,desc}}
// names/dex por estrella (1★,2★,3★). Líneas de 2 etapas repiten la final ("forma alfa").
const ROSTER = [
  // ---- 1 oro ----
  { id: 'charmander', cost: 1, types: ['Fuego'], cls: 'Atacante', names: ['Charmander', 'Charmeleon', 'Charizard'], dex: [4, 5, 6], hp: 550, atk: 50, spd: 0.75, range: 1, energy: 60, ab: { name: 'Lanzallamas', desc: 'Cono de 2 hex: 200 de daño + quemadura (20/s, 3s)' } },
  { id: 'squirtle', cost: 1, types: ['Agua'], cls: 'Tanque', names: ['Squirtle', 'Wartortle', 'Blastoise'], dex: [7, 8, 9], hp: 700, atk: 40, spd: 0.6, range: 1, energy: 80, ab: { name: 'Refugio', desc: 'Escudo del 30% PS máx durante 4s' } },
  { id: 'bulbasaur', cost: 1, types: ['Planta'], cls: 'Soporte', names: ['Bulbasaur', 'Ivysaur', 'Venusaur'], dex: [1, 2, 3], hp: 600, atk: 40, spd: 0.65, range: 2, energy: 70, ab: { name: 'Drenadoras', desc: 'Cura 180 PS al aliado más herido; drena 60 al objetivo' } },
  { id: 'cyndaquil', cost: 1, types: ['Fuego'], cls: 'Especialista', names: ['Cyndaquil', 'Quilava', 'Typhlosion'], dex: [155, 156, 157], hp: 500, atk: 45, spd: 0.7, range: 3, energy: 70, ab: { name: 'Rueda Fuego', desc: '250 al objetivo y 100 a adyacentes' } },
  { id: 'totodile', cost: 1, types: ['Agua'], cls: 'Atacante', names: ['Totodile', 'Croconaw', 'Feraligatr'], dex: [158, 159, 160], hp: 600, atk: 55, spd: 0.7, range: 1, energy: 50, ab: { name: 'Mordisco', desc: '220 de daño; +50% si el objetivo está bajo 50% PS' } },
  { id: 'chikorita', cost: 1, types: ['Planta'], cls: 'Tanque', names: ['Chikorita', 'Bayleef', 'Meganium'], dex: [152, 153, 154], hp: 680, atk: 38, spd: 0.6, range: 1, energy: 80, ab: { name: 'Pantalla Aroma', desc: '-25% ATQ a enemigos en 2 hex, 4s' } },
  { id: 'pichu', cost: 1, types: ['Eléctrico'], cls: 'Velocista', names: ['Pichu', 'Pikachu', 'Raichu'], dex: [172, 25, 26], hp: 480, atk: 48, spd: 0.9, range: 1, energy: 50, ab: { name: 'Impactrueno', desc: '180 de daño + paraliza 1s' } },
  { id: 'geodude', cost: 1, types: ['Roca'], cls: 'Tanque', names: ['Geodude', 'Graveler', 'Golem'], dex: [74, 75, 76], hp: 750, atk: 42, spd: 0.55, range: 1, energy: 90, ab: { name: 'Rizo Defensa', desc: '+40 DEF y refleja 15% del daño recibido, 5s' } },
  { id: 'machop', cost: 1, types: ['Lucha'], cls: 'Atacante', names: ['Machop', 'Machoke', 'Machamp'], dex: [66, 67, 68], hp: 650, atk: 60, spd: 0.65, range: 1, energy: 60, ab: { name: 'Golpe Kárate', desc: '240 de daño, ignora el 40% de la DEF' } },
  { id: 'gastly', cost: 1, types: ['Fantasma'], cls: 'Especialista', names: ['Gastly', 'Haunter', 'Gengar'], dex: [92, 93, 94], hp: 450, atk: 40, spd: 0.7, range: 3, energy: 80, ab: { name: 'Bola Sombra', desc: '280 al objetivo + Miedo (-20% Vel) 3s' } },
  { id: 'mareep', cost: 1, types: ['Eléctrico'], cls: 'Especialista', names: ['Mareep', 'Flaaffy', 'Ampharos'], dex: [179, 180, 181], hp: 520, atk: 42, spd: 0.65, range: 3, energy: 75, ab: { name: 'Onda Trueno', desc: '150 en cadena a 3 enemigos (-30% por salto)' } },
  { id: 'hoothoot', cost: 1, types: ['Normal', 'Volador'], cls: 'Soporte', names: ['Hoothoot', 'Noctowl', 'Noctowl α'], dex: [163, 164, 164], hp: 550, atk: 38, spd: 0.7, range: 2, energy: 70, ab: { name: 'Hipnosis', desc: 'Duerme al enemigo más lejano 2,5s' } },
  { id: 'sentret', cost: 1, types: ['Normal'], cls: 'Velocista', names: ['Sentret', 'Furret', 'Furret α'], dex: [161, 162, 162], hp: 500, atk: 46, spd: 0.85, range: 1, energy: 55, ab: { name: 'Ataque Rápido', desc: 'Dash al enemigo con menos PS, 200 de daño' } },
  { id: 'magikarp', cost: 1, types: [], cls: null, names: ['Magikarp', 'Gyarados', 'Gyarados α'], dex: [129, 130, 130], hp: 350, atk: 1, spd: 0.5, range: 1, energy: 999, ab: { name: 'Salpicadura', desc: 'No hace nada. En serio.' } },
  // ---- 2 oro ----
  { id: 'abra', cost: 2, types: ['Psíquico'], cls: 'Especialista', names: ['Abra', 'Kadabra', 'Alakazam'], dex: [63, 64, 65], hp: 480, atk: 45, spd: 0.7, range: 4, energy: 70, ab: { name: 'Psicorrayo', desc: '320 al enemigo con más ATQ del campo' } },
  { id: 'growlithe', cost: 2, types: ['Fuego'], cls: 'Velocista', names: ['Growlithe', 'Arcanine', 'Arcanine α'], dex: [58, 59, 59], hp: 600, atk: 55, spd: 0.85, range: 1, energy: 60, ab: { name: 'Velocidad Extrema', desc: 'Embiste 3 hex, 180 a cada enemigo tocado' } },
  { id: 'poliwag', cost: 2, types: ['Agua', 'Lucha'], cls: 'Atacante', names: ['Poliwag', 'Poliwhirl', 'Poliwrath'], dex: [60, 61, 62], hp: 620, atk: 58, spd: 0.7, range: 1, energy: 65, ab: { name: 'Hidropulso', desc: '260 + confusión 2s (50% de fallar)' } },
  { id: 'oddish', cost: 2, types: ['Planta'], cls: 'Soporte', names: ['Oddish', 'Gloom', 'Vileplume'], dex: [43, 44, 45], hp: 580, atk: 40, spd: 0.6, range: 2, energy: 80, ab: { name: 'Polvo Veneno', desc: 'Nube 7 hex: 40/s y -30% curación, 4s' } },
  { id: 'eevee', cost: 2, types: ['Normal'], cls: 'Especialista', names: ['Eevee', 'Eevee', 'Eevee'], dex: [133, 133, 133], hp: 560, atk: 48, spd: 0.75, range: 2, energy: 70, ab: { name: 'Refuerzo', desc: '240 al objetivo. Al evolucionar cambia (elige evolución)' } },
  { id: 'cubone', cost: 2, types: ['Roca'], cls: 'Atacante', names: ['Cubone', 'Marowak', 'Marowak α'], dex: [104, 105, 105], hp: 640, atk: 60, spd: 0.65, range: 1, energy: 60, ab: { name: 'Hueso Bumerán', desc: '160 ×2; el 2º golpe aturde 1s' } },
  { id: 'zubat', cost: 2, types: ['Volador'], cls: 'Velocista', names: ['Zubat', 'Golbat', 'Crobat'], dex: [41, 42, 169], hp: 540, atk: 50, spd: 0.95, range: 1, energy: 55, ab: { name: 'Chupavidas', desc: '200 de daño y se cura el 100% del daño' } },
  { id: 'slowpoke', cost: 2, types: ['Agua', 'Psíquico'], cls: 'Tanque', names: ['Slowpoke', 'Slowbro', 'Slowbro α'], dex: [79, 80, 80], hp: 800, atk: 38, spd: 0.5, range: 1, energy: 90, ab: { name: 'Amnesia', desc: '-50% daño de habilidades recibido, 5s' } },
  { id: 'magnemite', cost: 2, types: ['Eléctrico', 'Acero'], cls: 'Especialista', names: ['Magnemite', 'Magneton', 'Magneton α'], dex: [81, 82, 82], hp: 560, atk: 44, spd: 0.65, range: 3, energy: 75, ab: { name: 'Chispazo', desc: '240 + roba 20 DEF al objetivo, 4s' } },
  { id: 'phanpy', cost: 2, types: ['Roca'], cls: 'Tanque', names: ['Phanpy', 'Donphan', 'Donphan α'], dex: [231, 232, 232], hp: 780, atk: 45, spd: 0.55, range: 1, energy: 85, ab: { name: 'Rodada', desc: 'Gira 3s: +30% DEF y 80/s a adyacentes' } },
  // ---- 3 oro ----
  { id: 'scyther', cost: 3, types: ['Acero'], cls: 'Atacante', names: ['Scyther', 'Scizor', 'Scizor α'], dex: [123, 212, 212], hp: 700, atk: 70, spd: 0.8, range: 1, energy: 60, ab: { name: 'Puño Bala', desc: '3 golpes de 130; si un golpe mata, reinicia la habilidad' } },
  { id: 'magmar', cost: 3, types: ['Fuego'], cls: 'Especialista', names: ['Magmar', 'Magmar', 'Magmar α'], dex: [126, 126, 126], hp: 620, atk: 55, spd: 0.7, range: 3, energy: 75, ab: { name: 'Puño Fuego', desc: '350 + quemadura que reduce 40% curación, 4s' } },
  { id: 'electabuzz', cost: 3, types: ['Eléctrico'], cls: 'Atacante', names: ['Electabuzz', 'Electabuzz', 'Electabuzz α'], dex: [125, 125, 125], hp: 680, atk: 65, spd: 0.75, range: 1, energy: 65, ab: { name: 'Puño Trueno', desc: '320 + paraliza 1,5s' } },
  { id: 'onix', cost: 3, types: ['Acero', 'Roca'], cls: 'Tanque', names: ['Onix', 'Steelix', 'Steelix α'], dex: [95, 208, 208], hp: 950, atk: 40, spd: 0.45, range: 1, energy: 100, ab: { name: 'Atadura', desc: 'Inmoviliza 3s al objetivo y le inflige 60/s' } },
  { id: 'houndour', cost: 3, types: ['Siniestro', 'Fuego'], cls: 'Especialista', names: ['Houndour', 'Houndoom', 'Houndoom α'], dex: [228, 229, 229], hp: 600, atk: 58, spd: 0.75, range: 3, energy: 70, ab: { name: 'Pulso Umbrío', desc: '300 en línea de 3 hex; +50% vs objetivos con Miedo' } },
  { id: 'sneasel', cost: 3, types: ['Siniestro'], cls: 'Velocista', names: ['Sneasel', 'Sneasel', 'Sneasel α'], dex: [215, 215, 215], hp: 580, atk: 62, spd: 1.0, range: 1, energy: 55, ab: { name: 'Garra Brutal', desc: '280; crítico garantizado' } },
  { id: 'murkrow', cost: 3, types: ['Siniestro', 'Volador'], cls: 'Velocista', names: ['Murkrow', 'Murkrow', 'Murkrow α'], dex: [198, 198, 198], hp: 560, atk: 58, spd: 0.9, range: 1, energy: 60, ab: { name: 'Alevosía', desc: 'Se teletransporta al enemigo con menos PS: 320' } },
  { id: 'misdreavus', cost: 3, types: ['Fantasma'], cls: 'Especialista', names: ['Misdreavus', 'Misdreavus', 'Misdreavus α'], dex: [200, 200, 200], hp: 540, atk: 50, spd: 0.7, range: 3, energy: 80, ab: { name: 'Rabia', desc: 'Grito en 3 hex: 200 + Miedo 3s' } },
  { id: 'heracross', cost: 3, types: ['Lucha'], cls: 'Atacante', names: ['Heracross', 'Heracross', 'Heracross α'], dex: [214, 214, 214], hp: 720, atk: 72, spd: 0.7, range: 1, energy: 65, ab: { name: 'Megacuerno', desc: '400; si mata, +30% ATQ el resto del combate' } },
  { id: 'mrmime', cost: 3, types: ['Psíquico'], cls: 'Soporte', names: ['Mr. Mime', 'Mr. Mime', 'Mr. Mime α'], dex: [122, 122, 122], hp: 580, atk: 42, spd: 0.65, range: 3, energy: 85, ab: { name: 'Barrera', desc: 'Escudo de 250 a los 2 aliados más cercanos, 4s' } },
  // ---- 4 oro ----
  { id: 'snorlax', cost: 4, types: ['Normal'], cls: 'Tanque', names: ['Snorlax', 'Snorlax', 'Snorlax α'], dex: [143, 143, 143], hp: 1300, atk: 55, spd: 0.5, range: 1, energy: 100, ab: { name: 'Descanso', desc: 'Duerme 2s, recupera 35% PS; al despertar +25% ATQ' } },
  { id: 'lapras', cost: 4, types: ['Agua'], cls: 'Soporte', names: ['Lapras', 'Lapras', 'Lapras α'], dex: [131, 131, 131], hp: 900, atk: 48, spd: 0.6, range: 2, energy: 90, ab: { name: 'Canto Helado', desc: 'Congela 2s a los 2 más cercanos y cura 200 al aliado más herido' } },
  { id: 'dratini', cost: 4, types: ['Dragón', 'Volador'], cls: 'Atacante', names: ['Dratini', 'Dragonair', 'Dragonite'], dex: [147, 148, 149], hp: 850, atk: 75, spd: 0.75, range: 1, energy: 70, ab: { name: 'Cometa Draco', desc: '5 meteoros de 150 sobre enemigos aleatorios' } },
  { id: 'larvitar', cost: 4, types: ['Roca', 'Siniestro'], cls: 'Tanque', names: ['Larvitar', 'Pupitar', 'Tyranitar'], dex: [246, 247, 248], hp: 1100, atk: 60, spd: 0.55, range: 1, energy: 95, ab: { name: 'Tormenta Arena', desc: '5s: aliados Roca +30 DEF; enemigos a 2 hex 50/s' } },
  { id: 'kingdra', cost: 4, types: ['Agua', 'Dragón'], cls: 'Especialista', names: ['Kingdra', 'Kingdra', 'Kingdra α'], dex: [230, 230, 230], hp: 750, atk: 60, spd: 0.7, range: 3, energy: 80, ab: { name: 'Danza Dragón', desc: '+25% Vel permanente y 380 al objetivo' } },
  { id: 'exeggutor', cost: 4, types: ['Planta', 'Psíquico'], cls: 'Especialista', names: ['Exeggutor', 'Exeggutor', 'Exeggutor α'], dex: [103, 103, 103], hp: 820, atk: 55, spd: 0.6, range: 3, energy: 85, ab: { name: 'Somnífero', desc: 'Duerme 2s a los enemigos en área de 7 hex' } },
  { id: 'raikou', cost: 4, types: ['Eléctrico', 'Legendario'], cls: 'Velocista', names: ['Raikou', 'Raikou', 'Raikou α'], dex: [243, 243, 243], hp: 800, atk: 70, spd: 0.9, range: 1, energy: 65, ab: { name: 'Trueno', desc: 'Rayo a 3 enemigos aleatorios: 280 + paraliza 1s' } },
  { id: 'entei', cost: 4, types: ['Fuego', 'Legendario'], cls: 'Tanque', names: ['Entei', 'Entei', 'Entei α'], dex: [244, 244, 244], hp: 1150, atk: 58, spd: 0.6, range: 1, energy: 90, ab: { name: 'Estallido', desc: 'Explosión 3 hex: 300 + quemadura (30/s, 4s)' } },
  { id: 'suicune', cost: 4, types: ['Agua', 'Legendario'], cls: 'Soporte', names: ['Suicune', 'Suicune', 'Suicune α'], dex: [245, 245, 245], hp: 950, atk: 50, spd: 0.65, range: 2, energy: 90, ab: { name: 'Aguas Puras', desc: 'Limpia efectos negativos de los aliados y cura 150' } },
  // ---- 5 oro ----
  { id: 'mewtwo', cost: 5, types: ['Psíquico', 'Legendario'], cls: 'Especialista', names: ['Mewtwo', 'Mewtwo', 'Mewtwo α'], dex: [150, 150, 150], hp: 900, atk: 80, spd: 0.75, range: 4, energy: 90, ab: { name: 'Psíquico', desc: '500 + lanza 2 hex atrás; el impacto aturde 1,5s en área' } },
  { id: 'lugia', cost: 5, types: ['Volador', 'Legendario'], cls: 'Tanque', names: ['Lugia', 'Lugia', 'Lugia α'], dex: [249, 249, 249], hp: 1400, atk: 60, spd: 0.6, range: 2, energy: 100, ab: { name: 'Aerochorro', desc: '350 en línea completa + empuja; +25% reducción de daño 4s' } },
  { id: 'hooh', cost: 5, types: ['Fuego', 'Legendario'], cls: 'Soporte', names: ['Ho-Oh', 'Ho-Oh', 'Ho-Oh α'], dex: [250, 250, 250], hp: 1000, atk: 55, spd: 0.65, range: 3, energy: 100, ab: { name: 'Fuego Sagrado', desc: '300 en área 7 hex y revive al primer aliado caído con 40% PS (1 vez)' } },
  { id: 'zapdos', cost: 5, types: ['Eléctrico', 'Legendario'], cls: 'Especialista', names: ['Zapdos', 'Zapdos', 'Zapdos α'], dex: [145, 145, 145], hp: 880, atk: 70, spd: 0.7, range: 4, energy: 85, ab: { name: 'Voltio Cruel', desc: '450 al objetivo; se propaga al 50% a adyacentes' } },
  { id: 'moltres', cost: 5, types: ['Fuego', 'Legendario'], cls: 'Atacante', names: ['Moltres', 'Moltres', 'Moltres α'], dex: [146, 146, 146], hp: 920, atk: 85, spd: 0.7, range: 2, energy: 80, ab: { name: 'Envite Ígneo', desc: '550 al objetivo (recibe 10% PS propios); deja llamas (60/s)' } },
  { id: 'articuno', cost: 5, types: ['Agua', 'Legendario'], cls: 'Especialista', names: ['Articuno', 'Articuno', 'Articuno α'], dex: [144, 144, 144], hp: 880, atk: 65, spd: 0.65, range: 4, energy: 95, ab: { name: 'Ventisca', desc: 'Cono de 5 hex: 320 + congela 2s' } },
];

// Variantes de Eevee (elección al fusionar 3)
const EEVEE_VARIANTS = {
  vaporeon: { name: 'Vaporeon', dex: 134, types: ['Agua'], cls: 'Soporte', ab: { name: 'Aqua Aro', desc: 'Cura 250 en área de 3 hex' } },
  jolteon: { name: 'Jolteon', dex: 135, types: ['Eléctrico'], cls: 'Velocista', ab: { name: 'Pin Misil', desc: '5 proyectiles de 90 a enemigos aleatorios' } },
  flareon: { name: 'Flareon', dex: 136, types: ['Fuego'], cls: 'Atacante', ab: { name: 'Llamarada', desc: '350 + quemadura fuerte (40/s, 4s)' } },
};

// Gyarados (resultado de 3 Magikarp): redefine la línea a partir de 2★
const GYARADOS = { types: ['Agua', 'Dragón'], cls: 'Atacante', hp: 1000, atk: 80, spd: 0.7, range: 1, energy: 80, ab: { name: 'Hiperrayo', desc: '600 a un objetivo; queda 1,5s sin atacar' } };

// ---------- Sinergias ----------
// thresholds: niveles de activación. El motor implementa los efectos por clave.
const SYNERGIES = {
  Fuego: { kind: 'tipo', thresholds: [2, 4, 6], desc: ['Básicos queman: 15/s 3s', 'Quema 30/s y -33% curación', 'Quema 50/s; los quemados explotan al morir (150)'] },
  Agua: { kind: 'tipo', thresholds: [2, 4, 6], desc: ['+3 energía por ataque', '+6 energía por ataque', '+10 energía y 1ª habilidad -25% coste'] },
  Planta: { kind: 'tipo', thresholds: [2, 4], desc: ['Regeneran 1,5% PS/s (y adyacentes)', 'Regeneran 3,5% PS/s (y adyacentes)'] },
  'Eléctrico': { kind: 'tipo', thresholds: [2, 4, 6], desc: ['+5% Vel/ataque (máx +25%)', 'máx +50% y cada 5º ataque paraliza 0,5s', 'máx +90% y cada 5º ataque paraliza'] },
  'Psíquico': { kind: 'tipo', thresholds: [2, 4], desc: ['+30% energía inicial', '+60% energía inicial y +20% daño de habilidad'] },
  Lucha: { kind: 'tipo', thresholds: [2, 3], desc: ['Curan 25% del daño infligido', 'Curan 40% y -10 DEF por golpe (×5)'] },
  Roca: { kind: 'tipo', thresholds: [2, 4], desc: ['Todo el equipo +20 DEF', '+45 DEF y los Roca reflejan 12% del daño'] },
  Volador: { kind: 'tipo', thresholds: [2, 4], desc: ['20% de esquivar básicos', '35% de esquivar; al esquivar +10% Vel 2s'] },
  Fantasma: { kind: 'tipo', thresholds: [2], desc: ['Intangibles 2s al inicio; su 1er golpe aplica Miedo 3s'] },
  Siniestro: { kind: 'tipo', thresholds: [2, 4], desc: ['20% crítico (×1,5); 100% vs Miedo', '40% crítico; 100% vs Miedo'] },
  Acero: { kind: 'tipo', thresholds: [2, 3], desc: ['-20% daño de básicos recibido', '-35% e inmunes a quemadura/veneno'] },
  Normal: { kind: 'tipo', thresholds: [2, 4], desc: ['+15% PS máx', '+30% PS máx y +30% Vel bajo 30% PS'] },
  'Dragón': { kind: 'tipo', thresholds: [2, 3], desc: ['El daño superefectivo recibido pasa a neutro', 'Además +25% daño de habilidad'] },
  Legendario: { kind: 'tipo', thresholds: [2, 3], desc: ['Equipo +10% daño', '+20% daño y los Legendarios reviven (30% PS)'] },
  Tanque: { kind: 'clase', thresholds: [2, 4, 6], desc: ['Tanques +30 DEF', '+70 DEF y -15% daño recibido', '+120 DEF y escudo 20% al caer a 50%'] },
  Atacante: { kind: 'clase', thresholds: [2, 4, 6], desc: ['+20% ATQ', '+45% ATQ', '+80% ATQ'] },
  Especialista: { kind: 'clase', thresholds: [2, 4, 6], desc: ['+25% daño de habilidad', '+55%', '+100%'] },
  Velocista: { kind: 'clase', thresholds: [2, 4], desc: ['Saltan a retaguardia; +15% Vel', '+35% Vel y 1er ataque crítico'] },
  Soporte: { kind: 'clase', thresholds: [2, 3], desc: ['+25% curación/escudos', '+50% y al lanzar habilidad dan +5 energía a aliados'] },
};

// ---------- Objetos ----------
const COMPONENTS = {
  garra: { name: 'Garra', stat: '+15 ATQ', emoji: '🦴' },
  caparazon: { name: 'Caparazón', stat: '+20 DEF', emoji: '🐚' },
  pluma: { name: 'Pluma', stat: '+10% Vel', emoji: '🪶' },
  chip: { name: 'Chip', stat: '+15% daño hab.', emoji: '💾' },
  baya: { name: 'Baya', stat: '+150 PS', emoji: '🍒' },
  polvo: { name: 'Polvo', stat: '+15 energía inicial', emoji: '✨' },
};
// key = componentes ordenados alfabéticamente unidos por '+'
const ITEMS = {
  'garra+garra': { name: 'Navaja Crítica', desc: '+35% prob. de crítico', emoji: '🗡️' },
  'caparazon+garra': { name: 'Coraza Espinosa', desc: 'Refleja 15% del daño básico recibido', emoji: '🌵' },
  'garra+pluma': { name: 'Garra Rápida', desc: '+25% Vel', emoji: '⚡' },
  'chip+garra': { name: 'Lente Furia', desc: 'Las habilidades pueden criticar; +15% daño hab.', emoji: '🔍' },
  'baya+garra': { name: 'Colmillo Drenaje', desc: '25% robo de vida en básicos', emoji: '🧛' },
  'garra+polvo': { name: 'Puño Cargado', desc: '+20 ATQ y +3 energía por ataque', emoji: '🥊' },
  'caparazon+caparazon': { name: 'Caparazón Férreo', desc: '+60 DEF', emoji: '🛡️' },
  'caparazon+pluma': { name: 'Escudo Brisa', desc: '20% de esquivar básicos', emoji: '🌪️' },
  'caparazon+chip': { name: 'Placa Mental', desc: '-30% daño de habilidades recibido', emoji: '🧠' },
  'baya+caparazon': { name: 'Restos', desc: 'Regenera 2% PS máx/s', emoji: '🍙' },
  'caparazon+polvo': { name: 'Manto Espejo', desc: 'Al recibir una habilidad: +15 energía', emoji: '🪞' },
  'pluma+pluma': { name: 'Ala Vendaval', desc: '+45% Vel', emoji: '🕊️' },
  'chip+pluma': { name: 'Cinta Focus', desc: 'La primera vez que caería, sobrevive con 1 PS', emoji: '🎗️' },
  'baya+pluma': { name: 'Pluma Vital', desc: '+200 PS y +10% Vel', emoji: '🪽' },
  'pluma+polvo': { name: 'Danza Pluma', desc: 'La 1ª habilidad del combate cuesta 50% menos', emoji: '💃' },
  'chip+chip': { name: 'Núcleo Psíquico', desc: '+50% daño de habilidad', emoji: '🔮' },
  'baya+chip': { name: 'Batería de Bayas', desc: '+250 PS; las habilidades curan 10% del daño', emoji: '🔋' },
  'chip+polvo': { name: 'Condensador', desc: '+30 energía inicial', emoji: '⚗️' },
  'baya+baya': { name: 'Baya Gigante', desc: '+450 PS', emoji: '🍉' },
  'baya+polvo': { name: 'Baya Zidra', desc: 'Al caer a 40% PS: cura 30% (1 vez)', emoji: '🍇' },
  'polvo+polvo': { name: 'Polvo Estelar', desc: '+15 energía inicial y +5 energía/s', emoji: '🌟' },
};
const STONE = { name: 'Piedra Evolutiva', desc: 'Úsala sobre una unidad: cuenta como una copia extra (máx 1 por unidad)', emoji: '🪨' };

const COMPONENT_STATS = {
  garra: { atk: 15 }, caparazon: { def: 20 }, pluma: { spdPct: 0.10 },
  chip: { abPct: 0.15 }, baya: { hp: 150 }, polvo: { startEnergy: 15 },
};

// ---------- PvE ----------
// Unidades salvajes: stats absolutos (no escalan por estrella)
const WILD = {
  pidgey: { name: 'Pidgey', dex: 16, hp: 300, atk: 25, spd: 0.7, range: 1, types: ['Normal'], cls: 'Atacante' },
  rattata: { name: 'Rattata', dex: 19, hp: 280, atk: 30, spd: 0.8, range: 1, types: ['Normal'], cls: 'Atacante' },
  spearow: { name: 'Spearow', dex: 21, hp: 300, atk: 35, spd: 0.8, range: 1, types: ['Volador'], cls: 'Atacante' },
  mankey: { name: 'Mankey', dex: 56, hp: 550, atk: 55, spd: 0.75, range: 1, types: ['Lucha'], cls: 'Atacante' },
  onixWild: { name: 'Onix salvaje', dex: 95, hp: 1600, atk: 60, spd: 0.5, range: 1, types: ['Roca'], cls: 'Tanque' },
  snorlaxBoss: { name: 'Snorlax salvaje', dex: 143, hp: 4500, atk: 90, spd: 0.55, range: 1, types: ['Normal'], cls: 'Tanque', boss: 'snorlax' },
  tauros: { name: 'Tauros', dex: 128, hp: 1200, atk: 85, spd: 0.8, range: 1, types: ['Normal'], cls: 'Atacante' },
  dragoniteBoss: { name: 'Dragonite salvaje', dex: 149, hp: 8000, atk: 130, spd: 0.7, range: 1, types: ['Dragón'], cls: 'Atacante', boss: 'dragonite' },
  mewBoss: { name: 'Mew salvaje', dex: 151, hp: 12000, atk: 150, spd: 0.8, range: 3, types: ['Psíquico'], cls: 'Especialista', boss: 'mew' },
};

// Encuentros por (fase, ronda). loot: componentes/objetos/oro/piedra/copia
const PVE_ROUNDS = {
  '1-1': { units: [['pidgey', 2]], loot: { unitOrComp: true } },
  '1-2': { units: [['rattata', 3]], loot: { unitOrComp: true } },
  '1-3': { units: [['spearow', 3]], loot: { unitOrComp: true } },
  '2-6': { units: [['mankey', 4]], loot: { components: 1 } },
  '3-6': { units: [['onixWild', 2]], loot: { components: 1, gold: 2 } },
  '4-6': { units: [['snorlaxBoss', 1]], loot: { fullItem: 1 } },
  '5-6': { units: [['tauros', 5]], loot: { components: 2 } },
  '6-6': { units: [['dragoniteBoss', 1]], loot: { fullItem: 1, stone: 1 } },
  '7-6': { units: [['mewBoss', 1]], loot: { copy: 1 } },
};

const TYPE_COLORS = {
  Fuego: '#F08030', Agua: '#6890F0', Planta: '#78C850', 'Eléctrico': '#F8D030',
  'Psíquico': '#F85888', Lucha: '#C03028', Roca: '#B8A038', Volador: '#A890F0',
  Fantasma: '#705898', Siniestro: '#705848', Acero: '#B8B8D0', Normal: '#A8A878',
  'Dragón': '#7038F8', Legendario: '#E8C84A',
  Tanque: '#5577aa', Atacante: '#cc5544', Especialista: '#9955cc', Velocista: '#44aa88', Soporte: '#dd9933',
};

const DATA = { CFG, SHOP_ODDS, TYPE_CHART, ROSTER, EEVEE_VARIANTS, GYARADOS, SYNERGIES, COMPONENTS, ITEMS, STONE, COMPONENT_STATS, WILD, PVE_ROUNDS, TYPE_COLORS, SPRITE };
if (typeof module !== 'undefined') module.exports = DATA;
if (typeof window !== 'undefined') window.PTDATA = DATA;
