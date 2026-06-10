// PokéTactics — core.js : lógica pura (economía, tienda, fusiones, simulador de combate)
// Sin dependencias de DOM. Usable en Node para tests y en el navegador por el host.
(function () {
  const D = (typeof module !== 'undefined') ? require('./data.js') : window.PTDATA;
  const { CFG, SHOP_ODDS, TYPE_CHART, ROSTER, EEVEE_VARIANTS, GYARADOS, SYNERGIES, ITEMS, COMPONENT_STATS, WILD, PVE_ROUNDS } = D;

  // ---------- RNG con semilla ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  const shuffle = (rng, arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  const LINE = {}; ROSTER.forEach(r => LINE[r.id] = r);

  // ---------- Definición efectiva de unidad (con overrides Eevee/Gyarados) ----------
  function unitDef(lineId, star, variant) {
    const base = LINE[lineId];
    let def = { ...base, types: base.types.slice() };
    if (lineId === 'magikarp' && star >= 2) {
      def = { ...def, ...GYARADOS, types: GYARADOS.types.slice(), cls: GYARADOS.cls };
      def.names = base.names;
    }
    if (lineId === 'eevee' && star >= 2 && variant && EEVEE_VARIANTS[variant]) {
      const v = EEVEE_VARIANTS[variant];
      def = { ...def, types: v.types.slice(), cls: v.cls, ab: v.ab };
      def.names = [base.names[0], v.name, v.name + ' α'];
      def.dex = [base.dex[0], v.dex, v.dex];
    }
    return def;
  }
  function unitName(u) { const d = unitDef(u.lineId, u.star, u.variant); return d.names[u.star - 1]; }
  function unitDex(u) { const d = unitDef(u.lineId, u.star, u.variant); return d.dex[u.star - 1]; }
  function sellValue(u) { const c = LINE[u.lineId].cost; return u.star === 1 ? c : u.star === 2 ? c * 3 - 1 : c * 6; }
  function copiesValue(star) { return star === 1 ? 1 : star === 2 ? 3 : 9; }

  // ---------- Pool compartido ----------
  function makePool() { const p = {}; ROSTER.forEach(r => { if (r.id !== 'magikarp') p[r.id] = CFG.POOL[r.cost]; else p[r.id] = CFG.POOL[1]; }); return p; }

  // ---------- Tienda ----------
  function rollShop(pool, level, rng) {
    const odds = SHOP_ODDS[Math.min(level, 9)] || SHOP_ODDS[3];
    const shop = [];
    for (let s = 0; s < CFG.SHOP_SLOTS; s++) {
      let roll = rng() * 100, cost = 1;
      for (let c = 0; c < 5; c++) { if (roll < odds[c]) { cost = c + 1; break; } roll -= odds[c]; }
      // candidatos con stock
      let candidates = ROSTER.filter(r => r.cost === cost && pool[r.id] > 0);
      if (!candidates.length) candidates = ROSTER.filter(r => pool[r.id] > 0);
      if (!candidates.length) { shop.push(null); continue; }
      // ponderado por stock restante
      const total = candidates.reduce((t, r) => t + pool[r.id], 0);
      let x = rng() * total, chosen = candidates[0];
      for (const r of candidates) { x -= pool[r.id]; if (x <= 0) { chosen = r; break; } }
      pool[chosen.id]--;
      shop.push(chosen.id);
    }
    return shop;
  }
  function returnShopToPool(shop, pool) { shop.forEach(id => { if (id) pool[id]++; }); }

  // ---------- Jugador ----------
  let IID = 1;
  function newUnit(lineId) { return { iid: IID++, lineId, star: 1, variant: null, stone: false, items: [] }; }
  function makePlayer(id, name) {
    return {
      id, name, hp: CFG.PLAYER_HP, gold: 0, level: 1, xp: 0,
      streakW: 0, streakL: 0, alive: true, place: null,
      bench: Array(CFG.BENCH_SIZE).fill(null),
      board: Array.from({ length: CFG.HALF_ROWS }, () => Array(CFG.BOARD_COLS).fill(null)),
      shop: [null, null, null, null, null], locked: false,
      components: [], fullItems: [], stones: 0,
      pendingChoices: [], // {type:'eevee'|'mewcopy', ...}
      wins: 0, losses: 0,
    };
  }
  function boardUnits(p) { const out = []; p.board.forEach(row => row.forEach(u => { if (u) out.push(u); })); return out; }
  function benchUnits(p) { return p.bench.filter(Boolean); }
  function allUnits(p) { return boardUnits(p).concat(benchUnits(p)); }
  function boardCount(p) { return boardUnits(p).length; }
  function findBenchSlot(p) { return p.bench.findIndex(s => s === null); }

  // ---------- XP / nivel ----------
  function addXp(p, amount) {
    p.xp += amount;
    while (p.level < CFG.MAX_LEVEL && p.xp >= CFG.XP_TABLE[p.level + 1]) p.level++;
  }
  function xpToNext(p) { return p.level >= CFG.MAX_LEVEL ? null : CFG.XP_TABLE[p.level + 1] - p.xp; }

  // ---------- Economía ----------
  function roundIncome(p, roundNum, wonLast) {
    const base = CFG.ROUND_GOLD[roundNum] || CFG.BASE_GOLD;
    const interest = Math.min(CFG.INTEREST_MAX, Math.floor(p.gold / CFG.INTEREST_PER));
    const streak = CFG.STREAK_GOLD(Math.max(p.streakW, p.streakL));
    const winBonus = wonLast ? 1 : 0;
    return { base, interest, streak, winBonus, total: base + interest + streak + winBonus };
  }

  // ---------- Compra / venta / fusiones ----------
  function countCopies(p, lineId, star) {
    let n = 0;
    allUnits(p).forEach(u => { if (u.lineId === lineId && u.star === star) n += 1 + (u.stone ? 1 : 0); });
    return n;
  }
  // Fusiona si hay >=3 copias virtuales de (lineId, star). Devuelve unidad resultante o null.
  function tryMerge(p, lineId, star, events) {
    if (star >= 3) return null;
    if (countCopies(p, lineId, star) < 3) return null;
    // recoger unidades de esa línea/estrella; preferir conservar la del campo con más objetos
    const located = [];
    p.board.forEach((row, r) => row.forEach((u, c) => { if (u && u.lineId === lineId && u.star === star) located.push({ u, where: 'board', r, c }); }));
    p.bench.forEach((u, i) => { if (u && u.lineId === lineId && u.star === star) located.push({ u, where: 'bench', i }); });
    located.sort((a, b) => (b.where === 'board') - (a.where === 'board') || b.u.items.length - a.u.items.length);
    // consumir copias virtuales hasta 3
    let consumed = 0; const used = [];
    for (const loc of located) { if (consumed >= 3) break; consumed += 1 + (loc.u.stone ? 1 : 0); used.push(loc); }
    if (consumed < 3) return null;
    const keeper = used[0];
    const items = []; used.forEach(l => l.u.items.forEach(it => items.push(it)));
    const star2 = star + 1;
    const merged = { iid: IID++, lineId, star: star2, variant: keeper.u.variant, stone: false, items: items.slice(0, CFG.MAX_ITEMS) };
    items.slice(CFG.MAX_ITEMS).forEach(it => p.fullItems.push(it));
    // quitar usadas
    used.forEach(l => { if (l.where === 'board') p.board[l.r][l.c] = null; else p.bench[l.i] = null; });
    // colocar fusionada donde estaba la keeper
    if (keeper.where === 'board') p.board[keeper.r][keeper.c] = merged;
    else { const slot = findBenchSlot(p); if (slot >= 0) p.bench[slot] = merged; else p.bench[keeper.i] = merged; }
    if (lineId === 'eevee' && star2 === 2) {
      merged.variant = null;
      p.pendingChoices.push({ type: 'eevee', iid: merged.iid });
    }
    if (events) events.push({ t: 'merge', lineId, star: star2, name: unitName(merged) });
    // cascada (3x 2★ -> 3★)
    tryMerge(p, lineId, star2, events);
    return merged;
  }
  function buyFromShop(p, slot, pool, events) {
    const lineId = p.shop[slot];
    if (!lineId) return { ok: false, err: 'Vacío' };
    const cost = LINE[lineId].cost;
    if (p.gold < cost) return { ok: false, err: 'Sin oro' };
    const slotIdx = findBenchSlot(p);
    const wouldMerge = countCopies(p, lineId, 1) + 1 >= 3;
    if (slotIdx < 0 && !wouldMerge) return { ok: false, err: 'Banco lleno' };
    p.gold -= cost;
    p.shop[slot] = null;
    const u = newUnit(lineId);
    if (slotIdx >= 0) p.bench[slotIdx] = u;
    else { // banco lleno pero fusiona: colocar temporal en hueco virtual
      p.bench.push(u); // se eliminará en la fusión
    }
    tryMerge(p, lineId, 1, events);
    if (p.bench.length > CFG.BENCH_SIZE) p.bench = p.bench.filter((x, i) => i < CFG.BENCH_SIZE || x !== null).slice(0, CFG.BENCH_SIZE);
    return { ok: true };
  }
  function sellUnit(p, u, pool) {
    p.gold += sellValue(u);
    pool[u.lineId] += copiesValue(u.star) + (u.stone ? 1 : 0);
    u.items.forEach(it => p.fullItems.push(it));
    // quitar de donde esté
    p.board.forEach((row, r) => row.forEach((x, c) => { if (x === u) p.board[r][c] = null; }));
    p.bench.forEach((x, i) => { if (x === u) p.bench[i] = null; });
  }
  function useStone(p, u) {
    if (u.stone || p.stones <= 0) return false;
    p.stones--; u.stone = true;
    tryMerge(p, u.lineId, u.star, null);
    return true;
  }
  function combineComponents(p, i, j) {
    if (i === j || !p.components[i] || !p.components[j]) return null;
    const key = [p.components[i], p.components[j]].sort().join('+');
    if (!ITEMS[key]) return null;
    const a = Math.max(i, j), b = Math.min(i, j);
    p.components.splice(a, 1); p.components.splice(b, 1);
    p.fullItems.push(key);
    return key;
  }
  function equipItem(p, u, idx) {
    if (u.items.length >= CFG.MAX_ITEMS || !p.fullItems[idx] || u.lineId === 'magikarp' && u.star === 1) {
      if (u.lineId === 'magikarp' && u.star === 1) return false;
      if (u.items.length >= CFG.MAX_ITEMS) return false;
      if (!p.fullItems[idx]) return false;
    }
    u.items.push(p.fullItems[idx]); p.fullItems.splice(idx, 1); return true;
  }

  // ---------- Sinergias ----------
  function computeSynergies(units) {
    const lines = {}; // synergy -> Set(lineId)
    units.forEach(u => {
      const d = unitDef(u.lineId, u.star, u.variant);
      const keys = d.types.concat(d.cls ? [d.cls] : []);
      keys.forEach(k => { (lines[k] = lines[k] || new Set()).add(u.lineId); });
    });
    const tiers = {};
    Object.keys(SYNERGIES).forEach(s => {
      const n = lines[s] ? lines[s].size : 0;
      let tier = 0;
      SYNERGIES[s].thresholds.forEach((th, i) => { if (n >= th) tier = i + 1; });
      tiers[s] = { count: n, tier };
    });
    return tiers;
  }

  // ============================================================
  //                    SIMULADOR DE COMBATE
  // ============================================================
  // Hex odd-r offset
  const N_EVEN = [[0, 1], [0, -1], [-1, 0], [-1, -1], [1, 0], [1, -1]];
  const N_ODD = [[0, 1], [0, -1], [-1, 1], [-1, 0], [1, 1], [1, 0]];
  function neighbors(r, c) {
    const list = (r % 2 === 0 ? N_EVEN : N_ODD).map(([dr, dc]) => [r + dr, c + dc]);
    return list.filter(([rr, cc]) => rr >= 0 && rr < CFG.BOARD_ROWS && cc >= 0 && cc < CFG.BOARD_COLS);
  }
  function cube(r, c) { const x = c - (r - (r & 1)) / 2; const z = r; return [x, -x - z, z]; }
  function hexDist(a, b) { const A = cube(a.r, a.c), B = cube(b.r, b.c); return Math.max(Math.abs(A[0] - B[0]), Math.abs(A[1] - B[1]), Math.abs(A[2] - B[2])); }

  function typeMod(attackerType, defender, sim) {
    if (!attackerType) return 1;
    const defType = defender.types[0];
    let m = (TYPE_CHART[attackerType] && TYPE_CHART[attackerType][defType]) || 1;
    // Dragón (sinergia defensiva): superefectivo -> neutro
    if (m > 1 && sim.tiers[defender.side]['Dragón'].tier >= 1 && defender.types.includes('Dragón')) m = 1;
    return m;
  }

  // Construye unidad de combate a partir de unidad de planificación
  function combatUnit(u, side, pos, tiers, isWild) {
    let d, starHp = 1, starAtk = 1, starAb = 1, name, dex, star;
    if (isWild) {
      d = u; name = u.name; dex = u.dex; star = 1;
    } else {
      d = unitDef(u.lineId, u.star, u.variant);
      starHp = CFG.STAR_HP[u.star]; starAtk = CFG.STAR_ATK[u.star]; starAb = CFG.STAR_AB[u.star];
      name = d.names[u.star - 1]; dex = d.dex[u.star - 1]; star = u.star;
    }
    const cu = {
      uid: 'u' + (IID++), side, lineId: isWild ? null : u.lineId, wildId: isWild ? u.wid : null,
      boss: isWild ? d.boss : null, star, name, dex,
      types: d.types.slice(), cls: d.cls,
      maxHp: Math.round(d.hp * starHp), hp: 0,
      atk: Math.round(d.atk * starAtk), def: CFG.BASE_DEF[d.cls] || 20,
      baseSpd: d.spd, range: d.range, energyMax: d.energy, energy: 0,
      abStarMult: starAb, items: isWild ? [] : u.items.slice(),
      pos: { r: pos.r, c: pos.c },
      // dinámico
      target: null, atkCd: 0, moveCd: 0, dead: false,
      shields: [], st: {}, ccAccum: 0, ccWindow: 0,
      atkPct: 0, spdPct: 0, abPct: 0, healPower: 0, dmgMult: 1, dmgTakenMult: 1, basicTakenMult: 1, abilityTakenMult: 1,
      critChance: 0.0, abCanCrit: false, lifesteal: 0, abilityHealsPct: 0, dodge: 0, reflectBasic: 0,
      energyPerAttack: 10, energyRegen: 0, startEnergyBonus: 0, firstAbilityCostMult: 1,
      focusBand: false, zidra: false, usedFocus: false, usedZidra: false, usedTankShield: false,
      attacksDone: 0, firstAttackDone: false, castsDone: 0, revives: 0,
      elecStacks: 0, defShredStacks: 0, heraStacks: 0, snorlaxRested: false,
      untargetableT: 0, firstHitFear: false, hoohReviveUsed: false,
    };
    cu.hp = cu.maxHp;
    return cu;
  }

  function applyItemsAndSynergies(cu, tiers, sideUnits) {
    const T = (s) => tiers[s].tier;
    // --- componentes/objetos ---
    cu.items.forEach(key => {
      if (key in COMPONENT_STATS) { // componente suelto equipado? no: solo objetos completos. (se permite por robustez)
        const s = COMPONENT_STATS[key];
        if (s.atk) cu.atk += s.atk; if (s.def) cu.def += s.def; if (s.hp) cu.maxHp += s.hp;
        if (s.spdPct) cu.spdPct += s.spdPct; if (s.abPct) cu.abPct += s.abPct; if (s.startEnergy) cu.startEnergyBonus += s.startEnergy;
        return;
      }
      switch (key) {
        case 'garra+garra': cu.critChance += 0.35; break;
        case 'caparazon+garra': cu.reflectBasic += 0.15; break;
        case 'garra+pluma': cu.spdPct += 0.25; break;
        case 'chip+garra': cu.abCanCrit = true; cu.abPct += 0.15; break;
        case 'baya+garra': cu.lifesteal += 0.25; break;
        case 'garra+polvo': cu.atk += 20; cu.energyPerAttack += 3; break;
        case 'caparazon+caparazon': cu.def += 60; break;
        case 'caparazon+pluma': cu.dodge += 0.20; break;
        case 'caparazon+chip': cu.abilityTakenMult *= 0.7; break;
        case 'baya+caparazon': cu.regenPct = (cu.regenPct || 0) + 0.02; break;
        case 'caparazon+polvo': cu.mantoEspejo = true; break;
        case 'pluma+pluma': cu.spdPct += 0.45; break;
        case 'chip+pluma': cu.focusBand = true; break;
        case 'baya+pluma': cu.maxHp += 200; cu.spdPct += 0.10; break;
        case 'pluma+polvo': cu.firstAbilityCostMult = Math.min(cu.firstAbilityCostMult, 0.5); break;
        case 'chip+chip': cu.abPct += 0.50; break;
        case 'baya+chip': cu.maxHp += 250; cu.abilityHealsPct += 0.10; break;
        case 'chip+polvo': cu.startEnergyBonus += 30; break;
        case 'baya+baya': cu.maxHp += 450; break;
        case 'baya+polvo': cu.zidra = true; break;
        case 'polvo+polvo': cu.startEnergyBonus += 15; cu.energyRegen += 5; break;
      }
    });
    // --- sinergias de tipo ---
    if (cu.types.includes('Normal')) { const t = T('Normal'); if (t) cu.maxHp = Math.round(cu.maxHp * (t >= 2 ? 1.30 : 1.15)); }
    if (cu.types.includes('Psíquico')) { const t = T('Psíquico'); if (t) { cu.startEnergyBonus += cu.energyMax * (t >= 2 ? 0.6 : 0.3); if (t >= 2) cu.abPct += 0.20; } }
    if (cu.types.includes('Agua')) { const t = T('Agua'); if (t) { cu.energyPerAttack += t === 1 ? 3 : t === 2 ? 6 : 10; if (t >= 3) cu.firstAbilityCostMult = Math.min(cu.firstAbilityCostMult, 0.75); } }
    if (cu.types.includes('Volador')) { const t = T('Volador'); if (t) cu.dodge += t >= 2 ? 0.35 : 0.20; }
    if (cu.types.includes('Acero')) { const t = T('Acero'); if (t) { cu.basicTakenMult *= t >= 2 ? 0.65 : 0.80; if (t >= 2) cu.burnImmune = true; } }
    if (cu.types.includes('Lucha')) { const t = T('Lucha'); if (t) { cu.lifesteal += t >= 2 ? 0.40 : 0.25; if (t >= 2) cu.defShredOnHit = true; } }
    if (cu.types.includes('Siniestro')) { const t = T('Siniestro'); if (t) { cu.critChance += t >= 2 ? 0.40 : 0.20; cu.critVsFear = true; } }
    if (cu.types.includes('Fantasma')) { const t = T('Fantasma'); if (t) { cu.untargetableT = 2; cu.firstHitFear = true; } }
    if (cu.types.includes('Dragón')) { const t = T('Dragón'); if (t >= 2) cu.abPct += 0.25; }
    const rockT = T('Roca');
    if (rockT) { cu.def += rockT >= 2 ? 45 : 20; if (rockT >= 2 && cu.types.includes('Roca')) cu.reflectBasic += 0.12; }
    const legT = T('Legendario');
    if (legT) { cu.dmgMult *= legT >= 2 ? 1.20 : 1.10; if (legT >= 2 && cu.types.includes('Legendario')) cu.revives = Math.max(cu.revives, 1); }
    // --- sinergias de clase ---
    if (cu.cls === 'Tanque') { const t = T('Tanque'); if (t) { cu.def += [0, 30, 70, 120][t]; if (t >= 2) cu.dmgTakenMult *= 0.85; if (t >= 3) cu.tankShield = true; } }
    if (cu.cls === 'Atacante') { const t = T('Atacante'); if (t) cu.atkPct += [0, 0.20, 0.45, 0.80][t]; }
    if (cu.cls === 'Especialista') { const t = T('Especialista'); if (t) cu.abPct += [0, 0.25, 0.55, 1.00][t]; }
    if (cu.cls === 'Velocista') { const t = T('Velocista'); if (t) { cu.spdPct += t >= 2 ? 0.35 : 0.15; if (t >= 2) cu.firstAttackCrit = true; cu.isJumper = true; } else cu.isJumper = true; }
    if (cu.cls === 'Soporte') { const t = T('Soporte'); if (t) { cu.healPower += t >= 2 ? 0.50 : 0.25; if (t >= 2) cu.castGivesEnergy = true; } }
    cu.hp = cu.maxHp;
    cu.energy = Math.min(cu.energyMax * cu.firstAbilityCostMult, cu.energyMax * 0.5 + cu.startEnergyBonus);
  }

  // ---------- estado / utilidades de simulación ----------
  function aliveEnemies(sim, side) { return sim.units.filter(u => !u.dead && u.side !== side); }
  function aliveAllies(sim, side) { return sim.units.filter(u => !u.dead && u.side === side); }
  function targetable(u) { return !u.dead && u.untargetableT <= 0; }
  function isCCed(u) { return (u.st.par > 0) || (u.st.sleep > 0) || (u.st.freeze > 0) || (u.st.stun > 0) || (u.st.bind > 0 && false); }
  function canAct(u) { return !isCCed(u) && !(u.snorlaxSleep > 0); }

  function applyCC(u, type, dur, sim) {
    // tope anti-frustración: 4s por cada 10s
    if (u.ccAccum >= CFG.CC_CAP) dur *= 0.5;
    u.ccAccum += dur;
    u.st[type] = Math.max(u.st[type] || 0, dur);
    if (type === 'sleep') u.sleepWakeOnDmg = true;
    pushFx(sim, { t: 'status', uid: u.uid, s: type });
  }
  function applyBurn(u, dps, dur, healCut, explode) {
    if (u.burnImmune) return;
    u.st.burn = { dps, t: dur, healCut: healCut || 0, explode: !!explode };
  }
  function addShield(u, amt, dur) { u.shields.push({ amt, t: dur }); }
  function shieldTotal(u) { return u.shields.reduce((t, s) => t + s.amt, 0); }
  function pushFx(sim, e) { if (sim.fx.length < 400) sim.fx.push(e); }

  function heal(sim, source, target, amount) {
    if (target.dead) return 0;
    let amt = amount * (1 + (source ? source.healPower : 0));
    if (target.st.burn && target.st.burn.healCut) amt *= (1 - target.st.burn.healCut);
    if (target.st.poisonHealCut > 0) amt *= 0.7;
    const real = Math.min(target.maxHp - target.hp, Math.round(amt));
    target.hp += real;
    if (real > 0) pushFx(sim, { t: 'heal', uid: target.uid, amt: real });
    return real;
  }

  function dealDamage(sim, src, tgt, raw, kind /*'basic'|'ability'|'dot'|'true'*/, opts = {}) {
    if (tgt.dead || raw <= 0) return 0;
    let dmg = raw;
    if (kind !== 'true' && src) dmg *= src.dmgMult;
    if (kind === 'basic') dmg *= tgt.basicTakenMult;
    if (kind === 'ability') dmg *= tgt.abilityTakenMult * (tgt.amnesia > 0 ? 0.5 : 1) * (tgt.lugiaDR > 0 ? 0.75 : 1);
    dmg *= tgt.dmgTakenMult;
    dmg = Math.max(1, Math.round(dmg));
    // escudos primero
    let rem = dmg;
    for (const s of tgt.shields) { const used = Math.min(s.amt, rem); s.amt -= used; rem -= used; if (rem <= 0) break; }
    tgt.shields = tgt.shields.filter(s => s.amt > 0);
    const before = tgt.hp;
    tgt.hp -= rem;
    // energía por daño: +1 por 1% PS perdido (máx 25 por golpe)
    if (kind !== 'dot' && rem > 0) {
      tgt.energy = Math.min(tgt.energyMax, tgt.energy + Math.min(25, (rem / tgt.maxHp) * 100));
      if (tgt.sleepWakeOnDmg && tgt.st.sleep > 0) { tgt.st.sleep = 0; }
      if (kind === 'ability' && tgt.mantoEspejo) tgt.energy = Math.min(tgt.energyMax, tgt.energy + 15);
    }
    pushFx(sim, { t: 'dmg', uid: tgt.uid, amt: dmg, kind, crit: !!opts.crit });
    // Zidra / Cinta / escudo de Tanque 6
    if (tgt.hp / tgt.maxHp <= 0.4 && tgt.zidra && !tgt.usedZidra) { tgt.usedZidra = true; heal(sim, null, tgt, tgt.maxHp * 0.3); }
    if (tgt.hp / tgt.maxHp <= 0.5 && tgt.tankShield && !tgt.usedTankShield) { tgt.usedTankShield = true; addShield(tgt, tgt.maxHp * 0.2, 6); }
    if (tgt.hp <= 0) {
      if (tgt.focusBand && !tgt.usedFocus) { tgt.usedFocus = true; tgt.hp = 1; }
      else if (tgt.revives > 0) { tgt.revives--; tgt.hp = Math.round(tgt.maxHp * 0.3); tgt.st = {}; pushFx(sim, { t: 'revive', uid: tgt.uid }); }
      else {
        tgt.dead = true; tgt.hp = 0;
        pushFx(sim, { t: 'death', uid: tgt.uid });
        // explosión de quemadura (Fuego 6)
        if (tgt.st.burn && tgt.st.burn.explode) {
          sim.units.filter(e => !e.dead && e.side === tgt.side && hexDist(e.pos, tgt.pos) === 1)
            .forEach(e => dealDamage(sim, src, e, 150, 'ability'));
        }
        // Ho-Oh aliado: revivir
        const hooh = sim.units.find(h => !h.dead && h.side === tgt.side && h.lineId === 'hooh' && !h.hoohReviveUsed);
        if (hooh) { hooh.pendingRevive = hooh.pendingRevive || tgt; }
        // Heracross: gestionado por el atacante en su habilidad
      }
    }
    // robo de vida
    if (src && kind === 'basic' && src.lifesteal > 0) heal(sim, null, src, dmg * src.lifesteal);
    if (src && kind === 'ability' && src.abilityHealsPct > 0) heal(sim, null, src, dmg * src.abilityHealsPct);
    // reflejo
    if (src && kind === 'basic' && tgt.reflectBasic > 0 && !opts.noReflect) {
      dealDamage(sim, null, src, dmg * tgt.reflectBasic, 'true', { noReflect: true });
    }
    return dmg;
  }

  function effSpd(u) {
    let s = u.baseSpd * (1 + u.spdPct + u.elecStacks * 0.05 + (u.tempSpd || 0));
    if (u.st.fear > 0) s *= 0.8;
    if (u.frenzy) s *= 1.3;
    if (u.kingdraDance) s *= 1.25;
    return s;
  }
  function effAtk(u) { return Math.round(u.atk * (1 + u.atkPct + (u.heraStacks * 0.30) + (u.snorlaxAtkUp ? 0.25 : 0)) * (u.aromaDown > 0 ? 0.75 : 1)); }
  function effDef(u) { return Math.max(0, u.def - (u.defShredStacks * 10) - (u.defStolen || 0) + (u.defBuff || 0)); }

  // ---------- ataque básico ----------
  function basicAttack(sim, u, tgt) {
    u.attacksDone++;
    // confusión: 50% de fallar
    if (u.st.conf > 0 && sim.rng() < 0.5) { pushFx(sim, { t: 'miss', uid: tgt.uid }); return; }
    // esquiva (los Velocistas con primer ataque crítico no fallan ese golpe)
    if (tgt.dodge > 0 && sim.rng() < tgt.dodge) {
      pushFx(sim, { t: 'dodge', uid: tgt.uid });
      const fT = sim.tiers[tgt.side]['Volador'].tier;
      if (fT >= 2 && tgt.types.includes('Volador')) { tgt.tempSpd = 0.10; tgt.tempSpdT = 2; }
      u.energy = Math.min(u.energyMax, u.energy + u.energyPerAttack); // igualmente carga
      return;
    }
    let crit = sim.rng() < u.critChance;
    if (u.critVsFear && tgt.st.fear > 0) crit = true;
    if (u.firstAttackCrit && !u.firstAttackDone) crit = true;
    u.firstAttackDone = true;
    const tm = typeMod(u.types[0], tgt, sim);
    let dmg = effAtk(u) * tm * (crit ? 1.5 : 1) - effDef(tgt) * 0.5;
    dmg = Math.max(effAtk(u) * 0.2, dmg);
    dealDamage(sim, u, tgt, dmg, 'basic', { crit });
    // efectos al golpear
    if (u.firstHitFear) { u.firstHitFear = false; applyCC2(tgt, 'fear', 3, sim); }
    if (u.defShredOnHit) tgt.defShredStacks = Math.min(5, tgt.defShredStacks + 1);
    const fireT = sim.tiers[u.side]['Fuego'].tier;
    if (fireT && u.types.includes('Fuego')) applyBurn(tgt, [0, 15, 30, 50][fireT], 3, fireT >= 2 ? 0.33 : 0, fireT >= 3);
    const elecT = sim.tiers[u.side]['Eléctrico'].tier;
    if (elecT && u.types.includes('Eléctrico')) {
      const cap = [0, 5, 10, 18][elecT]; // pasos de 5% → 25/50/90
      u.elecStacks = Math.min(cap, u.elecStacks + 1);
      if (elecT >= 2 && u.attacksDone % 5 === 0) applyCC(tgt, 'par', 0.5, sim);
    }
    u.energy = Math.min(u.energyMax, u.energy + u.energyPerAttack);
  }
  // fear no es CC duro: aparte
  function applyCC2(u, type, dur, sim) { if (type === 'fear') { u.st.fear = Math.max(u.st.fear || 0, dur); pushFx(sim, { t: 'status', uid: u.uid, s: 'fear' }); } else applyCC(u, type, dur, sim); }

  // ---------- habilidades ----------
  function abilityDamage(sim, u, base) { return base * u.abStarMult * (1 + u.abPct); }
  function abilityHit(sim, u, tgt, base, opts = {}) {
    let dmg = abilityDamage(sim, u, base) * typeMod(u.types[0], tgt, sim) * (opts.mult || 1);
    let crit = false;
    if (u.abCanCrit && sim.rng() < Math.max(0.2, u.critChance)) { crit = true; dmg *= 1.5; }
    return dealDamage(sim, u, tgt, dmg, 'ability', { crit });
  }
  function nearestEnemies(sim, u, n) {
    return aliveEnemies(sim, u.side).filter(targetable).sort((a, b) => hexDist(u.pos, a.pos) - hexDist(u.pos, b.pos)).slice(0, n);
  }
  function enemiesWithin(sim, u, center, dist) {
    return aliveEnemies(sim, u.side).filter(e => hexDist(center, e.pos) <= dist);
  }
  function lowestHpAlly(sim, u) { const a = aliveAllies(sim, u.side).sort((x, y) => (x.hp / x.maxHp) - (y.hp / y.maxHp)); return a[0]; }

  function castAbility(sim, u) {
    const tgt = u.target && !u.target.dead && targetable(u.target) ? u.target : nearestEnemies(sim, u, 1)[0];
    if (!tgt && !['bulbasaur', 'squirtle', 'mrmime', 'suicune', 'snorlax', 'eevee'].includes(u.lineId)) return false;
    u.castsDone++;
    pushFx(sim, { t: 'cast', uid: u.uid, name: u.name });
    // Soporte (3): +5 energía a aliados
    if (u.castGivesEnergy) aliveAllies(sim, u.side).forEach(a => { if (a !== u) a.energy = Math.min(a.energyMax, a.energy + 5); });
    const id = u.lineId || u.boss;
    switch (id) {
      case 'charmander': { // cono de 2 hex
        enemiesWithin(sim, u, tgt.pos, 1).slice(0, 4).forEach(e => { abilityHit(sim, u, e, 200); applyBurn(e, 20, 3, 0); }); break;
      }
      case 'squirtle': addShield(u, abilityDamage(sim, u, u.maxHp * 0.3) / u.abStarMult / (1 + u.abPct) * (1 + u.healPower), 4); break;
      case 'bulbasaur': { const a = lowestHpAlly(sim, u); if (a) heal(sim, u, a, 180 * u.abStarMult); if (tgt) dealDamage(sim, u, tgt, 60 * u.abStarMult, 'ability'); break; }
      case 'cyndaquil': { abilityHit(sim, u, tgt, 250); enemiesWithin(sim, u, tgt.pos, 1).forEach(e => { if (e !== tgt) abilityHit(sim, u, e, 100); }); break; }
      case 'totodile': { const low = tgt.hp / tgt.maxHp < 0.5; abilityHit(sim, u, tgt, 220, { mult: low ? 1.5 : 1 }); break; }
      case 'chikorita': enemiesWithin(sim, u, u.pos, 2).forEach(e => { e.aromaDown = 4; }); break;
      case 'pichu': { abilityHit(sim, u, tgt, 180); applyCC(tgt, 'par', 1, sim); break; }
      case 'geodude': { u.defBuff = (u.defBuff || 0) + 40; u.reflectBasic += 0.15; u.rizoT = 5; break; }
      case 'machop': { const saved = tgt.def; tgt.def = Math.round(tgt.def * 0.6); abilityHit(sim, u, tgt, 240); tgt.def = saved; break; }
      case 'gastly': { abilityHit(sim, u, tgt, 280); applyCC2(tgt, 'fear', 3, sim); break; }
      case 'mareep': { let m = 1; nearestEnemies(sim, u, 3).forEach(e => { abilityHit(sim, u, e, 150, { mult: m }); m *= 0.7; }); break; }
      case 'hoothoot': { const far = aliveEnemies(sim, u.side).filter(targetable).sort((a, b) => hexDist(u.pos, b.pos) - hexDist(u.pos, a.pos))[0]; if (far) applyCC(far, 'sleep', 2.5, sim); break; }
      case 'sentret': { const weak = aliveEnemies(sim, u.side).filter(targetable).sort((a, b) => a.hp - b.hp)[0]; if (weak) { jumpAdjacent(sim, u, weak); abilityHit(sim, u, weak, 200); u.target = weak; } break; }
      case 'magikarp': if (u.star >= 2) { abilityHit(sim, u, tgt, 600); u.atkCd = Math.max(u.atkCd, 1.5); } break; // Hiperrayo
      case 'abra': { const big = aliveEnemies(sim, u.side).filter(targetable).sort((a, b) => effAtk(b) - effAtk(a))[0]; if (big) abilityHit(sim, u, big, 320); break; }
      case 'growlithe': { // embiste 3 hex en línea hacia el objetivo
        nearestEnemies(sim, u, 3).filter(e => hexDist(u.pos, e.pos) <= 3).forEach(e => abilityHit(sim, u, e, 180));
        break;
      }
      case 'poliwag': { abilityHit(sim, u, tgt, 260); tgt.st.conf = Math.max(tgt.st.conf || 0, 2); break; }
      case 'oddish': { enemiesWithin(sim, u, tgt.pos, 1).concat([tgt]).forEach(e => { e.st.poison = { dps: 40 * u.abStarMult, t: 4 }; e.st.poisonHealCut = 4; }); break; }
      case 'eevee': {
        if (u.star >= 2 && u.variantAb === 'vaporeon') { aliveAllies(sim, u.side).filter(a => hexDist(u.pos, a.pos) <= 1).forEach(a => heal(sim, u, a, 250 * u.abStarMult)); }
        else if (u.star >= 2 && u.variantAb === 'jolteon') { for (let i = 0; i < 5; i++) { const e = pick(sim.rng, aliveEnemies(sim, u.side).filter(targetable)); if (e) abilityHit(sim, u, e, 90); } }
        else if (u.star >= 2 && u.variantAb === 'flareon') { abilityHit(sim, u, tgt, 350); applyBurn(tgt, 40, 4, 0.33); }
        else if (tgt) abilityHit(sim, u, tgt, 240);
        break;
      }
      case 'cubone': { abilityHit(sim, u, tgt, 160); abilityHit(sim, u, tgt, 160); applyCC(tgt, 'stun', 1, sim); break; }
      case 'zubat': { const d = abilityHit(sim, u, tgt, 200); heal(sim, null, u, d); break; }
      case 'slowpoke': { u.amnesia = 5; break; }
      case 'magnemite': { abilityHit(sim, u, tgt, 240); tgt.defStolen = (tgt.defStolen || 0) + 20; tgt.defStolenT = 4; u.defBuff = (u.defBuff || 0) + 20; break; }
      case 'phanpy': { u.rodadaT = 3; u.defBuffPctT = 3; break; }
      case 'scyther': {
        let killsReset = false;
        for (let i = 0; i < 3; i++) { if (tgt.dead) break; abilityHit(sim, u, tgt, 130); if (tgt.dead) killsReset = true; }
        if (killsReset) u.energy = u.energyMax; // reinicia
        break;
      }
      case 'magmar': { abilityHit(sim, u, tgt, 350); applyBurn(tgt, 25, 4, 0.4); break; }
      case 'electabuzz': { abilityHit(sim, u, tgt, 320); applyCC(tgt, 'par', 1.5, sim); break; }
      case 'onix': { applyCC(tgt, 'stun', 3, sim); tgt.st.bindDot = { src: u, dps: 60 * u.abStarMult, t: 3 }; break; }
      case 'houndour': { // línea de 3 hex
        nearestEnemies(sim, u, 3).filter(e => hexDist(u.pos, e.pos) <= 3).forEach(e => abilityHit(sim, u, e, 300, { mult: e.st.fear > 0 ? 1.5 : 1 })); break;
      }
      case 'sneasel': { const d = abilityDamage(sim, u, 280) * typeMod(u.types[0], tgt, sim) * 1.5; dealDamage(sim, u, tgt, d, 'ability', { crit: true }); break; }
      case 'murkrow': { const weak = aliveEnemies(sim, u.side).filter(targetable).sort((a, b) => a.hp - b.hp)[0]; if (weak) { jumpAdjacent(sim, u, weak); abilityHit(sim, u, weak, 320); u.target = weak; } break; }
      case 'misdreavus': { enemiesWithin(sim, u, tgt.pos, 1).concat([tgt]).forEach(e => { abilityHit(sim, u, e, 200); applyCC2(e, 'fear', 3, sim); }); break; }
      case 'heracross': { abilityHit(sim, u, tgt, 400); if (tgt.dead) u.heraStacks++; break; }
      case 'mrmime': { aliveAllies(sim, u.side).filter(a => a !== u).sort((a, b) => hexDist(u.pos, a.pos) - hexDist(u.pos, b.pos)).slice(0, 2).forEach(a => addShield(a, 250 * u.abStarMult * (1 + u.healPower), 4)); break; }
      case 'snorlax': { u.snorlaxSleep = 2; heal(sim, null, u, u.maxHp * 0.35); u.snorlaxAtkUp = true; break; }
      case 'lapras': { nearestEnemies(sim, u, 2).forEach(e => applyCC(e, 'freeze', 2, sim)); const a = lowestHpAlly(sim, u); if (a) heal(sim, u, a, 200 * u.abStarMult); break; }
      case 'dratini': { for (let i = 0; i < 5; i++) { const e = pick(sim.rng, aliveEnemies(sim, u.side).filter(targetable)); if (e) abilityHit(sim, u, e, 150); } break; }
      case 'larvitar': { u.sandstormT = 5; aliveAllies(sim, u.side).forEach(a => { if (a.types.includes('Roca')) { a.defBuff = (a.defBuff || 0) + 30; a.defBuffClearT = 5; } }); break; }
      case 'kingdra': { u.kingdraDance = true; abilityHit(sim, u, tgt, 380); break; }
      case 'exeggutor': { enemiesWithin(sim, u, tgt.pos, 1).concat([tgt]).forEach(e => applyCC(e, 'sleep', 2, sim)); break; }
      case 'raikou': { for (let i = 0; i < 3; i++) { const e = pick(sim.rng, aliveEnemies(sim, u.side).filter(targetable)); if (e) { abilityHit(sim, u, e, 280); applyCC(e, 'par', 1, sim); } } break; }
      case 'entei': { enemiesWithin(sim, u, u.pos, 1).concat(hexDist(u.pos, tgt.pos) <= 1 ? [] : [tgt]).forEach(e => { abilityHit(sim, u, e, 300); applyBurn(e, 30, 4, 0); }); break; }
      case 'suicune': { aliveAllies(sim, u.side).forEach(a => { a.st = { ...a.st, burn: null, poison: null, fear: 0 }; heal(sim, u, a, 150 * u.abStarMult); }); break; }
      case 'mewtwo': { abilityHit(sim, u, tgt, 500); enemiesWithin(sim, u, tgt.pos, 1).forEach(e => applyCC(e, 'stun', 1.5, sim)); break; }
      case 'lugia': { // línea completa: enemigos en la columna del objetivo
        aliveEnemies(sim, u.side).filter(e => Math.abs(e.pos.c - tgt.pos.c) <= 0).forEach(e => abilityHit(sim, u, e, 350));
        abilityHit(sim, u, tgt, 0.0001); u.lugiaDR = 4; break;
      }
      case 'hooh': { enemiesWithin(sim, u, tgt.pos, 1).concat([tgt]).forEach(e => abilityHit(sim, u, e, 300));
        if (u.pendingRevive && !u.hoohReviveUsed) { const r = u.pendingRevive; u.hoohReviveUsed = true; r.dead = false; r.hp = Math.round(r.maxHp * 0.4); r.st = {}; pushFx(sim, { t: 'revive', uid: r.uid }); }
        break;
      }
      case 'zapdos': { const d = abilityHit(sim, u, tgt, 450); enemiesWithin(sim, u, tgt.pos, 1).forEach(e => { if (e !== tgt) abilityHit(sim, u, e, 225); }); break; }
      case 'moltres': { abilityHit(sim, u, tgt, 550); dealDamage(sim, null, u, u.maxHp * 0.1, 'true'); tgt.st.flames = { dps: 60, t: 3 }; break; }
      case 'articuno': { nearestEnemies(sim, u, 5).forEach(e => { abilityHit(sim, u, e, 320); applyCC(e, 'freeze', 2, sim); }); break; }
      // ---- bosses PvE ----
      case 'snorlaxBoss': case 'snorlax_boss': { u.snorlaxSleep = 2; heal(sim, null, u, u.maxHp * 0.25); break; }
      case 'dragonite': { for (let i = 0; i < 5; i++) { const e = pick(sim.rng, aliveEnemies(sim, u.side).filter(targetable)); if (e) dealDamage(sim, u, e, 300, 'ability'); } break; }
      case 'mew': { aliveEnemies(sim, u.side).filter(targetable).slice(0, 4).forEach(e => { dealDamage(sim, u, e, 350, 'ability'); }); break; }
      default: if (tgt) abilityHit(sim, u, tgt, 200);
    }
    u.energy = 0;
    u.firstAbilityCostMult = 1;
    u.energy = 0; // tras 1ª habilidad la barra vuelve al coste normal
    return true;
  }

  function jumpAdjacent(sim, u, tgt) {
    const free = neighbors(tgt.pos.r, tgt.pos.c).filter(([r, c]) => !sim.occ[r][c]);
    if (free.length) { sim.occ[u.pos.r][u.pos.c] = null; const [r, c] = free[0]; u.pos = { r, c }; sim.occ[r][c] = u; pushFx(sim, { t: 'jump', uid: u.uid, r, c }); }
  }

  // ---------- montaje de la simulación ----------
  // sideA: jugador local (filas 4-7 abajo), sideB: rival (filas 0-3 arriba, espejado)
  function buildSide(units, side, tiers) {
    const out = [];
    units.forEach(({ u, r, c, wild }) => {
      let pos;
      if (side === 0) pos = { r: 7 - r, c };
      else pos = { r, c: CFG.BOARD_COLS - 1 - c };
      const cu = combatUnit(wild ? u : u, side, pos, tiers, !!wild);
      if (!wild && u.lineId === 'eevee') cu.variantAb = u.variant;
      out.push(cu);
    });
    return out;
  }

  function makeSim(unitsA, unitsB, tiersA, tiersB, seed) {
    const rng = mulberry32(seed);
    const sim = { rng, t: 0, units: [], fx: [], tiers: [tiersA, tiersB], over: false, winner: null, occ: Array.from({ length: CFG.BOARD_ROWS }, () => Array(CFG.BOARD_COLS).fill(null)) };
    unitsA.forEach(u => sim.units.push(u)); unitsB.forEach(u => sim.units.push(u));
    // aplicar objetos y sinergias
    sim.units.forEach(u => applyItemsAndSynergies(u, sim.tiers[u.side], sim.units.filter(x => x.side === u.side)));
    // ocupación + salto de velocistas
    sim.units.forEach(u => { sim.occ[u.pos.r][u.pos.c] = u; });
    sim.units.filter(u => u.isJumper).forEach(u => {
      const enemies = aliveEnemies(sim, u.side);
      if (!enemies.length) return;
      const tgt = enemies.slice().sort((a, b) => a.maxHp - b.maxHp)[0];
      jumpAdjacent(sim, u, tgt); u.target = tgt;
    });
    return sim;
  }

  function stepSim(sim) {
    const dt = CFG.TICK;
    sim.t += dt;
    const units = sim.units;
    for (const u of units) {
      if (u.dead) continue;
      // --- timers de estado ---
      const st = u.st;
      ['par', 'sleep', 'freeze', 'stun', 'conf', 'fear'].forEach(k => { if (st[k] > 0) st[k] -= dt; });
      if (u.untargetableT > 0) u.untargetableT -= dt;
      if (u.snorlaxSleep > 0) { u.snorlaxSleep -= dt; }
      if (u.amnesia > 0) u.amnesia -= dt;
      if (u.lugiaDR > 0) u.lugiaDR -= dt;
      if (u.aromaDown > 0) u.aromaDown -= dt;
      if (u.tempSpdT > 0) { u.tempSpdT -= dt; if (u.tempSpdT <= 0) u.tempSpd = 0; }
      if (u.defStolenT > 0) { u.defStolenT -= dt; if (u.defStolenT <= 0) u.defStolen = 0; }
      if (u.rizoT > 0) { u.rizoT -= dt; if (u.rizoT <= 0) { u.defBuff = (u.defBuff || 0) - 40; u.reflectBasic -= 0.15; } }
      if (u.defBuffClearT > 0) { u.defBuffClearT -= dt; if (u.defBuffClearT <= 0) u.defBuff = 0; }
      u.ccWindow += dt; if (u.ccWindow >= CFG.CC_WINDOW) { u.ccWindow = 0; u.ccAccum = 0; }
      u.shields.forEach(s => s.t -= dt); u.shields = u.shields.filter(s => s.t > 0 && s.amt > 0);
      // --- DoTs (a intervalos de 0,5s) ---
      if (Math.round(sim.t * 10) % 5 === 0) {
        if (st.burn && st.burn.t > 0) { dealDamage(sim, null, u, st.burn.dps * 0.5, 'dot'); st.burn.t -= 0.5; if (st.burn.t <= 0) st.burn = null; }
        if (st.poison && st.poison.t > 0) { dealDamage(sim, null, u, st.poison.dps * 0.5, 'dot'); st.poison.t -= 0.5; if (st.poison.t <= 0) { st.poison = null; u.st.poisonHealCut = 0; } }
        if (st.bindDot && st.bindDot.t > 0) { dealDamage(sim, st.bindDot.src, u, st.bindDot.dps * 0.5, 'dot'); st.bindDot.t -= 0.5; if (st.bindDot.t <= 0) st.bindDot = null; }
        if (st.flames && st.flames.t > 0) { dealDamage(sim, null, u, st.flames.dps * 0.5, 'dot'); st.flames.t -= 0.5; if (st.flames.t <= 0) st.flames = null; }
        if (u.regenPct) heal(sim, null, u, u.maxHp * u.regenPct * 0.5);
        if (u.energyRegen) u.energy = Math.min(u.energyMax, u.energy + u.energyRegen * 0.5);
        // Tormenta arena de Tyranitar
        if (u.sandstormT > 0) { u.sandstormT -= 0.5; enemiesWithin(sim, u, u.pos, 2).forEach(e => dealDamage(sim, u, e, 50 * 0.5 * u.abStarMult, 'dot')); }
        // Rodada de Donphan
        if (u.rodadaT > 0) { u.rodadaT -= 0.5; sim.units.filter(e => !e.dead && e.side !== u.side && hexDist(e.pos, u.pos) === 1).forEach(e => dealDamage(sim, u, e, 80 * 0.5 * u.abStarMult, 'dot')); }
        // muerte súbita
        if (sim.t > CFG.COMBAT_MAX) dealDamage(sim, null, u, u.maxHp * CFG.SUDDEN_DEATH_DPS * 0.5, 'true');
        // Normal (2): frenesí bajo 30%
        const nT = sim.tiers[u.side]['Normal'].tier;
        u.frenzy = nT >= 2 && u.types.includes('Normal') && u.hp / u.maxHp < 0.3;
      }
      if (u.dead) continue;
      if (!canAct(u)) continue;
      // --- objetivo ---
      if (!u.target || u.target.dead || !targetable(u.target)) {
        const es = aliveEnemies(sim, u.side).filter(targetable);
        if (!es.length) continue;
        es.sort((a, b) => hexDist(u.pos, a.pos) - hexDist(u.pos, b.pos) || a.hp - b.hp);
        u.target = es[0];
      }
      const tgt = u.target;
      // --- lanzar habilidad ---
      const effEnergyMax = u.energyMax * (u.castsDone === 0 ? u.firstAbilityCostMult : 1);
      if (u.energy >= effEnergyMax && u.lineId !== 'magikarp' || (u.lineId === 'magikarp' && u.star >= 2 && u.energy >= effEnergyMax)) {
        castAbility(sim, u);
        continue;
      }
      // --- atacar o moverse ---
      const dist = hexDist(u.pos, tgt.pos);
      if (dist <= u.range) {
        u.atkCd -= dt;
        if (u.atkCd <= 0) { basicAttack(sim, u, tgt); u.atkCd = 1 / effSpd(u); }
      } else {
        u.moveCd -= dt;
        if (u.moveCd <= 0) {
          // un paso BFS hacia el objetivo
          const step = bfsStep(sim, u, tgt);
          if (step) { sim.occ[u.pos.r][u.pos.c] = null; u.pos = { r: step[0], c: step[1] }; sim.occ[step[0]][step[1]] = u; }
          u.moveCd = 0.55;
        }
      }
    }
    // Planta: regen de aura (cada 1s)
    if (Math.round(sim.t * 10) % 10 === 0) {
      [0, 1].forEach(side => {
        const t = sim.tiers[side]['Planta'].tier; if (!t) return;
        const pct = t >= 2 ? 0.035 : 0.015;
        const plants = sim.units.filter(x => !x.dead && x.side === side && x.types.includes('Planta'));
        if (!plants.length) return;
        sim.units.filter(x => !x.dead && x.side === side).forEach(x => {
          const near = x.types.includes('Planta') || plants.some(pl => hexDist(pl.pos, x.pos) <= 1);
          if (near) heal(sim, null, x, x.maxHp * pct);
        });
      });
    }
    // fin de combate
    const aAlive = units.some(x => !x.dead && x.side === 0);
    const bAlive = units.some(x => !x.dead && x.side === 1);
    if (!aAlive || !bAlive) {
      sim.over = true;
      sim.winner = aAlive && !bAlive ? 0 : bAlive && !aAlive ? 1 : 'tie';
    }
    if (sim.t > CFG.COMBAT_MAX + 30) { sim.over = true; sim.winner = 'tie'; } // red de seguridad
    return sim;
  }

  function bfsStep(sim, u, tgt) {
    const start = [u.pos.r, u.pos.c], goal = tgt.pos;
    const key = (r, c) => r * 16 + c;
    const visited = new Set([key(...start)]);
    const queue = [[start, null]]; // [pos, primer paso]
    while (queue.length) {
      const [[r, c], first] = queue.shift();
      if (hexDist({ r, c }, goal) <= u.range) return first || null;
      for (const [nr, nc] of neighbors(r, c)) {
        if (visited.has(key(nr, nc))) continue;
        const occupied = sim.occ[nr][nc] && !sim.occ[nr][nc].dead;
        if (occupied && !(nr === goal.r && nc === goal.c)) continue;
        visited.add(key(nr, nc));
        queue.push([[nr, nc], first || [nr, nc]]);
      }
    }
    // sin camino: paso codicioso a vecino libre más cercano al objetivo
    const opts = neighbors(...start).filter(([r, c]) => !sim.occ[r][c] || sim.occ[r][c].dead);
    if (!opts.length) return null;
    opts.sort((a, b) => hexDist({ r: a[0], c: a[1] }, goal) - hexDist({ r: b[0], c: b[1] }, goal));
    return opts[0];
  }

  function snapshot(sim) {
    const s = {
      t: Math.round(sim.t * 10) / 10, over: sim.over, winner: sim.winner,
      units: sim.units.map(u => ({
        uid: u.uid, side: u.side, dex: u.dex, name: u.name, star: u.star, dead: u.dead, items: u.items,
        hp: Math.max(0, Math.round(u.hp)), maxHp: u.maxHp, en: Math.round(u.energy), enMax: u.energyMax,
        r: u.pos.r, c: u.pos.c,
        st: { burn: !!(u.st.burn), slp: (u.st.sleep > 0 || u.snorlaxSleep > 0), frz: u.st.freeze > 0, par: u.st.par > 0, stun: u.st.stun > 0, fear: u.st.fear > 0, shield: shieldTotal(u) > 0 },
      })),
      fx: sim.fx.splice(0),
    };
    return s;
  }

  // ejecuta el combate completo (modo test) o por pasos (host en vivo)
  function runFullCombat(sim, maxSteps = 2000) {
    let steps = 0;
    while (!sim.over && steps < maxSteps) { stepSim(sim); steps++; }
    if (!sim.over) { sim.over = true; sim.winner = 'tie'; }
    return sim;
  }

  function survivorsStars(sim, side) {
    return sim.units.filter(u => !u.dead && u.side === side).reduce((t, u) => t + (u.star || 1), 0);
  }
  function trainerDamage(phase, sim, winnerSide) {
    const base = CFG.PHASE_BASE_DMG[Math.min(phase, 7)];
    return base + survivorsStars(sim, winnerSide);
  }

  // ---------- PvE ----------
  function buildWildSide(pveKey, tiersEmpty) {
    const spec = PVE_ROUNDS[pveKey];
    if (!spec) return [];
    const out = [];
    let i = 0;
    const positions = [{ r: 2, c: 3 }, { r: 2, c: 2 }, { r: 2, c: 4 }, { r: 3, c: 3 }, { r: 3, c: 2 }, { r: 3, c: 4 }, { r: 2, c: 1 }, { r: 2, c: 5 }];
    spec.units.forEach(([wid, n]) => {
      for (let k = 0; k < n; k++) {
        const w = WILD[wid];
        const pos = positions[i % positions.length]; i++;
        const cu = combatUnit({ ...w, wid }, 1, { r: pos.r, c: CFG.BOARD_COLS - 1 - pos.c }, tiersEmpty, true);
        cu.energyMax = w.boss ? 90 : 999; cu.energy = 0;
        if (w.boss === 'dragonite') cu.boss = 'dragonite';
        if (w.boss === 'mew') { cu.boss = 'mew'; cu.range = 3; }
        if (w.boss === 'snorlax') cu.boss = 'snorlaxBoss';
        out.push(cu);
      }
    });
    return out;
  }
  const EMPTY_TIERS = () => { const t = {}; Object.keys(SYNERGIES).forEach(s => t[s] = { count: 0, tier: 0 }); return t; };

  // ---------- Vista de planificación → lado de combate ----------
  function playerSide(p, side, tiers) {
    const list = [];
    p.board.forEach((row, r) => row.forEach((u, c) => { if (u) list.push({ u, r, c }); }));
    return buildSide(list, side, tiers);
  }

  const CORE = {
    mulberry32, pick, shuffle, LINE, unitDef, unitName, unitDex, sellValue,
    makePool, rollShop, returnShopToPool, makePlayer, newUnit,
    boardUnits, benchUnits, allUnits, boardCount, findBenchSlot,
    addXp, xpToNext, roundIncome, countCopies, tryMerge, buyFromShop, sellUnit,
    useStone, combineComponents, equipItem, computeSynergies,
    makeSim, stepSim, runFullCombat, snapshot, survivorsStars, trainerDamage,
    buildWildSide, EMPTY_TIERS, playerSide, hexDist, neighbors,
  };
  if (typeof module !== 'undefined') module.exports = CORE;
  if (typeof window !== 'undefined') window.PTCORE = CORE;
})();
