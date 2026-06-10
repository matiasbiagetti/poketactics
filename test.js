// Test del núcleo de PokéTactics (Node)
const D = require('./data.js');
const C = require('./core.js');
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL:', msg); } };

// --- datos ---
ok(D.ROSTER.length === 49, `roster=49 (es ${D.ROSTER.length})`);
[1, 2, 3, 4, 5].forEach(c => {
  const n = D.ROSTER.filter(r => r.cost === c).length;
  const exp = { 1: 14, 2: 10, 3: 10, 4: 9, 5: 6 }[c];
  ok(n === exp, `tier ${c}: ${n} != ${exp}`);
});
ok(Object.keys(D.ITEMS).length === 21, `21 objetos (hay ${Object.keys(D.ITEMS).length})`);
// claves de objetos ordenadas
Object.keys(D.ITEMS).forEach(k => { const p = k.split('+'); ok(p.slice().sort().join('+') === k, `clave desordenada: ${k}`); });

// --- pool y tienda ---
const pool = C.makePool();
const rng = C.mulberry32(42);
for (let lvl = 1; lvl <= 9; lvl++) {
  const shop = C.rollShop(pool, lvl, rng);
  ok(shop.length === 5, 'tienda 5 slots');
  C.returnShopToPool(shop, pool);
}
ok(pool['charmander'] === 29, 'pool intacto tras devolver');

// --- jugador, compra y fusión ---
const p = C.makePlayer('p1', 'Tester');
p.gold = 100; p.level = 5; p.xp = 22;
p.shop = ['machop', 'machop', 'machop', 'abra', 'gastly'];
const ev = [];
C.buyFromShop(p, 0, pool, ev); C.buyFromShop(p, 1, pool, ev); C.buyFromShop(p, 2, pool, ev);
const units = C.allUnits(p);
ok(units.length === 1 && units[0].star === 2 && units[0].lineId === 'machop', 'fusión 3x Machop -> Machoke 2★');
ok(C.unitName(units[0]) === 'Machoke', `nombre evolución: ${C.unitName(units[0])}`);
ok(p.gold === 100 - 3, 'oro tras 3 compras de 1c');

// cascada a 3★
for (let i = 0; i < 6; i++) { const slot = C.findBenchSlot(p); p.bench[slot] = C.newUnit('machop'); C.tryMerge(p, 'machop', 1, ev); }
const u3 = C.allUnits(p).find(u => u.lineId === 'machop');
ok(u3 && u3.star === 3, `cascada 9 copias -> 3★ (star=${u3 && u3.star})`);
ok(C.unitName(u3) === 'Machamp', 'nombre 3★ Machamp');
ok(C.sellValue(u3) === 6, 'venta 3★ 1c = 6');

// piedra evolutiva
const p2 = C.makePlayer('p2', 'T2'); p2.stones = 1;
p2.bench[0] = C.newUnit('abra'); p2.bench[1] = C.newUnit('abra');
C.useStone(p2, p2.bench[0]);
const kad = C.allUnits(p2)[0];
ok(C.allUnits(p2).length === 1 && kad.star === 2, 'piedra: 2 copias + piedra = 2★');

// eevee pendiente de elección
const p3 = C.makePlayer('p3', 'T3');
for (let i = 0; i < 3; i++) p3.bench[i] = C.newUnit('eevee');
C.tryMerge(p3, 'eevee', 1, []);
ok(p3.pendingChoices.length === 1 && p3.pendingChoices[0].type === 'eevee', 'elección de Eevee pendiente');
const eev = C.allUnits(p3)[0]; eev.variant = 'jolteon';
ok(C.unitName(eev) === 'Jolteon', `variante Eevee: ${C.unitName(eev)}`);
ok(C.unitDef('eevee', 2, 'jolteon').types[0] === 'Eléctrico', 'Jolteon es Eléctrico');

// magikarp -> gyarados
const p4 = C.makePlayer('p4', 'T4');
for (let i = 0; i < 3; i++) p4.bench[i] = C.newUnit('magikarp');
C.tryMerge(p4, 'magikarp', 1, []);
const gya = C.allUnits(p4)[0];
ok(gya.star === 2 && C.unitName(gya) === 'Gyarados', '3 Magikarp -> Gyarados');
ok(C.unitDef('magikarp', 2).types.join(',') === 'Agua,Dragón', 'Gyarados Agua/Dragón');

// --- sinergias ---
const synP = C.makePlayer('s', 'S');
synP.board[3][0] = C.newUnit('charmander'); synP.board[3][1] = C.newUnit('cyndaquil');
synP.board[3][2] = C.newUnit('growlithe'); synP.board[3][3] = C.newUnit('magmar');
const tiers = C.computeSynergies(C.boardUnits(synP));
ok(tiers['Fuego'].count === 4 && tiers['Fuego'].tier === 2, `Fuego 4 -> tier 2 (${JSON.stringify(tiers['Fuego'])})`);
ok(tiers['Atacante'].count === 1, 'Atacante cuenta 1');
// dos copias de la misma línea = 1
const synP2 = C.makePlayer('s2', 'S2');
synP2.board[3][0] = C.newUnit('charmander'); synP2.board[3][1] = C.newUnit('charmander');
ok(C.computeSynergies(C.boardUnits(synP2))['Fuego'].count === 1, 'líneas únicas');

// --- economía ---
const ep = C.makePlayer('e', 'E'); ep.gold = 37; ep.streakW = 4;
const inc = C.roundIncome(ep, 10, true);
ok(inc.interest === 3 && inc.streak === 2 && inc.winBonus === 1 && inc.total === 5 + 3 + 2 + 1, `ingreso ${JSON.stringify(inc)}`);
C.addXp(ep, 38); ok(ep.level === 6, `xp 38 -> nivel 6 (=${ep.level})`);

// --- combate PvP completo ---
function mkBoard(ids) {
  const pl = C.makePlayer('x', 'X');
  ids.forEach((id, i) => { const u = C.newUnit(id); u.star = 2; pl.board[i < 4 ? 3 : 2][i % 4] = u; });
  return pl;
}
const A = mkBoard(['charmander', 'machop', 'geodude', 'cyndaquil', 'gastly', 'abra']);
const B = mkBoard(['squirtle', 'totodile', 'poliwag', 'mareep', 'slowpoke', 'lapras']);
const tA = C.computeSynergies(C.boardUnits(A)), tB = C.computeSynergies(C.boardUnits(B));
const sim = C.makeSim(C.playerSide(A, 0, tA), C.playerSide(B, 1, tB), tA, tB, 123);
C.runFullCombat(sim);
ok(sim.over && (sim.winner === 0 || sim.winner === 1 || sim.winner === 'tie'), `combate termina (winner=${sim.winner})`);
ok(sim.t < 80, `duración razonable: ${sim.t.toFixed(1)}s`);
const dmg = C.trainerDamage(4, sim, sim.winner === 'tie' ? 0 : sim.winner);
ok(dmg >= 5, `daño entrenador fase 4: ${dmg}`);

// snapshot serializable
const snap = C.snapshot(sim);
ok(JSON.stringify(snap).length > 100, 'snapshot serializa');

// --- todas las unidades lanzan su habilidad sin crash (1v1 espejo) ---
D.ROSTER.forEach(rr => {
  const P1 = C.makePlayer('a', 'A'), P2 = C.makePlayer('b', 'B');
  const ua = C.newUnit(rr.id); ua.star = 2; if (rr.id === 'eevee') ua.variant = 'vaporeon';
  const ub = C.newUnit(rr.id); ub.star = 2; if (rr.id === 'eevee') ub.variant = 'flareon';
  P1.board[3][3] = ua; P2.board[3][3] = ub;
  const t1 = C.computeSynergies(C.boardUnits(P1)), t2 = C.computeSynergies(C.boardUnits(P2));
  try {
    const s = C.makeSim(C.playerSide(P1, 0, t1), C.playerSide(P2, 1, t2), t1, t2, 7);
    C.runFullCombat(s);
    ok(s.over, `1v1 ${rr.id} termina`);
  } catch (e) { fails++; console.log(`FAIL: crash en habilidad de ${rr.id}:`, e.message); }
});

// --- variantes Eevee en combate ---
['vaporeon', 'jolteon', 'flareon'].forEach(v => {
  const P1 = C.makePlayer('a', 'A'), P2 = C.makePlayer('b', 'B');
  const ua = C.newUnit('eevee'); ua.star = 2; ua.variant = v;
  P1.board[3][3] = ua; P2.board[3][3] = C.newUnit('snorlax');
  const t1 = C.computeSynergies(C.boardUnits(P1)), t2 = C.computeSynergies(C.boardUnits(P2));
  try { const s = C.makeSim(C.playerSide(P1, 0, t1), C.playerSide(P2, 1, t2), t1, t2, 7); C.runFullCombat(s); ok(s.over, `eevee ${v} ok`); }
  catch (e) { fails++; console.log(`FAIL: eevee ${v}:`, e.message); }
});

// --- PvE: todos los encuentros ---
Object.keys(D.PVE_ROUNDS).forEach(k => {
  const P1 = mkBoard(['charmander', 'machop', 'geodude', 'cyndaquil', 'gastly', 'abra', 'snorlax', 'lapras']);
  const t1 = C.computeSynergies(C.boardUnits(P1));
  try {
    const wild = C.buildWildSide(k, C.EMPTY_TIERS());
    ok(wild.length > 0, `PvE ${k} tiene unidades`);
    const s = C.makeSim(C.playerSide(P1, 0, t1), wild, t1, C.EMPTY_TIERS(), 99);
    C.runFullCombat(s);
    ok(s.over, `PvE ${k} termina (winner=${s.winner}, t=${s.t.toFixed(1)})`);
  } catch (e) { fails++; console.log(`FAIL: PvE ${k}:`, e.message); }
});

// --- objetos: equipar y combinar ---
const ip = C.makePlayer('i', 'I');
ip.components = ['garra', 'garra', 'baya', 'caparazon'];
const made = C.combineComponents(ip, 0, 1);
ok(made === 'garra+garra', `combina Navaja (${made})`);
const made2 = C.combineComponents(ip, 0, 1); // baya+caparazon
ok(made2 === 'baya+caparazon', `combina Restos (${made2})`);
ip.bench[0] = C.newUnit('snorlax');
ok(C.equipItem(ip, ip.bench[0], 0), 'equipa objeto');
ok(ip.bench[0].items.length === 1 && ip.fullItems.length === 1, 'inventario consistente');
// combate con objetos
const P1 = C.makePlayer('a', 'A'); const uu = C.newUnit('heracross'); uu.star = 2; uu.items = ['garra+garra', 'baya+caparazon', 'chip+pluma'];
P1.board[3][3] = uu;
const P2 = C.makePlayer('b', 'B'); P2.board[3][3] = (() => { const x = C.newUnit('snorlax'); x.star = 2; return x; })();
const t1 = C.computeSynergies(C.boardUnits(P1)), t2 = C.computeSynergies(C.boardUnits(P2));
const s2 = C.makeSim(C.playerSide(P1, 0, t1), C.playerSide(P2, 1, t2), t1, t2, 5);
C.runFullCombat(s2);
ok(s2.over, 'combate con objetos termina');

// --- 8 jugadores: tiendas simultáneas agotan pool coherentemente ---
const bigPool = C.makePool();
const total1c = D.ROSTER.filter(r => r.cost === 1).length * 29;
let drawn = 0;
for (let i = 0; i < 50; i++) { const s = C.rollShop(bigPool, 3, rng); drawn += s.filter(Boolean).length; }
const remaining = Object.values(bigPool).reduce((a, b) => a + b, 0);
const totalPool = D.ROSTER.reduce((t, r) => t + C.makePool()[r.id], 0);
ok(remaining === totalPool - drawn, `pool consistente (${remaining} = ${totalPool} - ${drawn})`);

console.log(fails === 0 ? '\n✔ TODOS LOS TESTS PASAN' : `\n✘ ${fails} fallos`);
process.exit(fails ? 1 : 0);
