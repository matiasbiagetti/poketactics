// PokéTactics — game.js : orquestación de partida (host autoritativo) + protocolo P2P (PeerJS)
(function () {
  const D = window.PTDATA, C = window.PTCORE;
  const { CFG, PVE_ROUNDS, ROSTER, COMPONENTS, ITEMS } = D;

  // ============== RED ==============
  const PREFIX = 'poketactics-jk-';
  // STUN + TURN públicos: sin TURN, dos jugadores tras CGNAT/NAT simétrico no pueden conectarse
  const ICE = {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    ],
  };
  function roomCode() { const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)]; return s; }

  // Conexión local (el host también es jugador)
  class LocalConn {
    constructor() { this.handlers = {}; this.peerHandlers = {}; }
    on(ev, fn) { this.handlers[ev] = fn; }
    send(msg) { setTimeout(() => this.peerHandlers.data && this.peerHandlers.data(msg), 0); } // host->local client
    clientSend(msg) { setTimeout(() => this.handlers.data && this.handlers.data(msg), 0); }   // local client->host
  }

  // ============== HOST ==============
  class GameHost {
    constructor(hostName, onLocalMsg, onStatus) {
      this.code = roomCode();
      this.players = new Map(); // id -> {player(core), conn, connected}
      this.state = 'lobby';
      this.pool = C.makePool();
      this.rng = C.mulberry32(Date.now() % 2 ** 31);
      this.phase = 1; this.roundInPhase = 1; this.roundCount = 0;
      this.timers = []; this.sims = []; this.onStatus = onStatus;
      this.lastOpp = {};
      // jugador local (host)
      this.local = new LocalConn();
      this.local.peerHandlers.data = onLocalMsg;
      this.addPlayer('host', hostName, this.local);
      this.peer = new Peer(PREFIX + this.code, { debug: 1, config: ICE });
      this.peer.on('open', () => onStatus('ready', this.code));
      this.peer.on('error', (e) => onStatus('error', e.type));
      this.peer.on('connection', (conn) => {
        conn.on('data', (msg) => this.onMsg(conn.metadata && conn.metadata.pid || conn.peer, msg, conn));
        conn.on('open', () => { });
        conn.on('close', () => { const e = [...this.players.values()].find(p => p.conn === conn); if (e) { e.connected = false; this.broadcastLobby(); } });
      });
      this.local.on('data', (msg) => this.onMsg('host', msg, this.local));
    }
    addPlayer(id, name, conn) {
      const player = C.makePlayer(id, name);
      player.gold = 5;
      this.players.set(id, { player, conn, connected: true });
    }
    send(id, msg) { const e = this.players.get(id); if (e && e.connected) try { e.conn.send(msg); } catch (_) { } }
    broadcast(msg) { for (const id of this.players.keys()) this.send(id, msg); }
    alivePlayers() { return [...this.players.values()].map(e => e.player).filter(p => p.alive); }
    publicPlayers() {
      return [...this.players.values()].map(e => ({
        id: e.player.id, name: e.player.name, hp: e.player.hp, level: e.player.level,
        alive: e.player.alive, place: e.player.place, wins: e.player.wins,
        streak: e.player.streakW > 0 ? '🔥' + e.player.streakW : e.player.streakL > 0 ? '❄' + e.player.streakL : '',
        connected: e.connected,
        boardPreview: C.boardUnits(e.player).map(u => ({ dex: C.unitDex(u), star: u.star })),
      }));
    }
    broadcastLobby() { this.broadcast({ type: 'lobby', code: this.code, players: this.publicPlayers().map(p => ({ id: p.id, name: p.name, connected: p.connected })) }); }

    onMsg(id, msg, conn) {
      try { this._onMsg(id, msg, conn); } catch (e) { console.error('host error', e); }
    }
    _onMsg(id, msg, conn) {
      if (msg.type === 'join') {
        if (this.state !== 'lobby') { conn.send({ type: 'error', err: 'La partida ya empezó' }); return; }
        if (this.players.size >= 8) { conn.send({ type: 'error', err: 'Sala llena (8)' }); return; }
        let pid = 'g' + Math.floor(Math.random() * 1e9);
        this.addPlayer(pid, (msg.name || 'Entrenador').slice(0, 14), conn);
        conn.metadata = { pid };
        conn.send({ type: 'joined', pid, code: this.code });
        this.broadcastLobby();
        return;
      }
      const entry = this.players.get(id); if (!entry) return;
      const p = entry.player;
      if (msg.type === 'start' && id === 'host' && this.state === 'lobby') { if (this.players.size >= 2) this.startGame(); else this.send(id, { type: 'toast', msg: 'Se necesitan al menos 2 jugadores' }); return; }
      if (msg.type === 'chat') { this.broadcast({ type: 'chat', from: p.name, text: String(msg.text).slice(0, 120) }); return; }
      if (msg.type === 'scout' && (this.state === 'plan' || this.state === 'safari')) { this.sendScout(id, msg.pid); return; }
      // --- acciones de planificación ---
      if (this.state === 'plan' && p.alive) {
        let changed = true;
        switch (msg.type) {
          case 'buy': C.buyFromShop(p, msg.slot | 0, this.pool, null); break;
          case 'reroll': if (p.gold >= CFG.REROLL_COST) { p.gold -= CFG.REROLL_COST; C.returnShopToPool(p.shop, this.pool); p.shop = C.rollShop(this.pool, p.level, this.rng); p.locked = false; } break;
          case 'xp': if (p.gold >= CFG.XP_COST && p.level < CFG.MAX_LEVEL) { p.gold -= CFG.XP_COST; C.addXp(p, CFG.XP_PER_BUY); } break;
          case 'lock': p.locked = !p.locked; break;
          case 'sell': { const u = C.allUnits(p).find(x => x.iid === msg.iid); if (u) C.sellUnit(p, u, this.pool); break; }
          case 'move': this.handleMove(p, msg); break;
          case 'combine': C.combineComponents(p, msg.i | 0, msg.j | 0); break;
          case 'equip': { const u = C.allUnits(p).find(x => x.iid === msg.iid); if (u) C.equipItem(p, u, msg.idx | 0); break; }
          case 'stone': { const u = C.allUnits(p).find(x => x.iid === msg.iid); if (u) C.useStone(p, u); break; }
          case 'eevee': { const u = C.allUnits(p).find(x => x.iid === msg.iid && x.lineId === 'eevee'); if (u && ['vaporeon', 'jolteon', 'flareon'].includes(msg.variant)) { u.variant = msg.variant; p.pendingChoices = p.pendingChoices.filter(c => c.iid !== msg.iid); } break; }
          case 'mewcopy': { const ch = p.pendingChoices.find(c => c.type === 'mewcopy'); const u = C.allUnits(p).find(x => x.iid === msg.iid); if (ch && u) { const slot = C.findBenchSlot(p); if (slot >= 0) { const nu = C.newUnit(u.lineId); p.bench[slot] = nu; C.tryMerge(p, u.lineId, 1, null); } p.pendingChoices = p.pendingChoices.filter(c => c !== ch); } break; }
          default: changed = false;
        }
        if (changed) this.syncPlayer(id);
        return;
      }
      if (this.state === 'safari' && msg.type === 'safariPick') this.safariPick(p, msg.idx | 0);
      // elecciones también permitidas fuera de plan
      if (msg.type === 'eevee' && p.alive) { const u = C.allUnits(p).find(x => x.iid === msg.iid && x.lineId === 'eevee'); if (u && ['vaporeon', 'jolteon', 'flareon'].includes(msg.variant)) { u.variant = msg.variant; p.pendingChoices = p.pendingChoices.filter(c => c.iid !== msg.iid); this.syncPlayer(id); } }
    }
    handleMove(p, msg) {
      const u = C.allUnits(p).find(x => x.iid === msg.iid); if (!u) return;
      const from = this.locate(p, u);
      if (msg.to === 'bench') {
        const i = msg.i | 0; if (i < 0 || i >= CFG.BENCH_SIZE) return;
        const other = p.bench[i];
        this.removeAt(p, from); p.bench[i] = u;
        if (other && other !== u) this.placeAt(p, other, from);
      } else if (msg.to === 'board') {
        const r = msg.r | 0, c = msg.c | 0;
        if (r < 0 || r >= CFG.HALF_ROWS || c < 0 || c >= CFG.BOARD_COLS) return;
        const other = p.board[r][c];
        const movingToBoard = from.zone === 'bench';
        if (movingToBoard && !other && C.boardCount(p) >= p.level) return; // límite de unidades
        this.removeAt(p, from); p.board[r][c] = u;
        if (other && other !== u) this.placeAt(p, other, from);
      }
    }
    locate(p, u) {
      for (let r = 0; r < CFG.HALF_ROWS; r++) for (let c = 0; c < CFG.BOARD_COLS; c++) if (p.board[r][c] === u) return { zone: 'board', r, c };
      const i = p.bench.indexOf(u); return { zone: 'bench', i };
    }
    removeAt(p, loc) { if (loc.zone === 'board') p.board[loc.r][loc.c] = null; else if (loc.i >= 0) p.bench[loc.i] = null; }
    placeAt(p, u, loc) { if (loc.zone === 'board') p.board[loc.r][loc.c] = u; else if (loc.i >= 0) p.bench[loc.i] = u; else { const s = C.findBenchSlot(p); if (s >= 0) p.bench[s] = u; } }

    sendScout(requesterId, targetPid) {
      const e = this.players.get(targetPid); if (!e) return;
      const p = e.player;
      this.send(requesterId, {
        type: 'scoutData', pid: targetPid, name: p.name, hp: p.hp, level: p.level,
        board: p.board.map(row => row.map(u => u ? this.serializeUnit(u) : null)),
        bench: p.bench.slice(0, CFG.BENCH_SIZE).map(u => u ? this.serializeUnit(u) : null),
        synergies: C.computeSynergies(C.boardUnits(p)),
      });
    }
    serializeUnit(u) {
      const d = C.unitDef(u.lineId, u.star, u.variant);
      return { iid: u.iid, lineId: u.lineId, star: u.star, variant: u.variant, stone: u.stone, items: u.items, name: C.unitName(u), dex: C.unitDex(u), cost: C.LINE[u.lineId].cost, types: d.types, cls: d.cls, ab: d.ab };
    }
    syncPlayer(id) {
      const e = this.players.get(id); if (!e) return;
      const p = e.player;
      this.send(id, {
        type: 'state', state: this.state,
        round: { phase: this.phase, num: this.roundInPhase, label: `${this.phase}-${this.roundInPhase}`, kind: this.roundKind(), endsAt: this.planEndsAt || 0 },
        you: {
          id: p.id, name: p.name, hp: p.hp, gold: p.gold, level: p.level, xp: p.xp, xpNext: C.xpToNext(p),
          alive: p.alive, locked: p.locked, boardCount: C.boardCount(p), lastIncome: p._lastIncome || null,
          shop: p.shop.map(lid => lid ? { lineId: lid, name: C.LINE[lid].names[0], dex: C.LINE[lid].dex[0], cost: C.LINE[lid].cost, types: C.LINE[lid].types, cls: C.LINE[lid].cls, ab: C.LINE[lid].ab } : null),
          bench: p.bench.slice(0, CFG.BENCH_SIZE).map(u => u ? this.serializeUnit(u) : null),
          board: p.board.map(row => row.map(u => u ? this.serializeUnit(u) : null)),
          components: p.components, fullItems: p.fullItems, stones: p.stones,
          pendingChoices: p.pendingChoices,
          synergies: C.computeSynergies(C.boardUnits(p)),
        },
        players: this.publicPlayers(),
      });
    }
    syncAll() { for (const id of this.players.keys()) this.syncPlayer(id); }
    roundKind() {
      if (this.phase === 1) return 'pve';
      if (this.roundInPhase === 1) return 'safari';
      if (this.roundInPhase === 6) return 'pve';
      return 'pvp';
    }

    // ---------- ciclo de partida ----------
    startGame() {
      this.state = 'plan'; this.phase = 1; this.roundInPhase = 1;
      for (const e of this.players.values()) { e.player.shop = C.rollShop(this.pool, e.player.level, this.rng); }
      this.broadcast({ type: 'gamestart' });
      this.beginPlan();
    }
    beginPlan() {
      this.state = 'plan';
      this.planEndsAt = Date.now() + CFG.PLAN_TIME * 1000;
      this.syncAll();
      this.setT(() => this.beginCombat(), CFG.PLAN_TIME * 1000);
    }
    setT(fn, ms) { this.timers.push(setTimeout(fn, ms)); }

    nextRound() {
      this.roundInPhase++;
      const maxRounds = this.phase === 1 ? 3 : 6;
      if (this.roundInPhase > maxRounds) { this.phase++; this.roundInPhase = 1; }
      this.roundCount++;
      // ingresos + XP + tienda
      for (const e of this.players.values()) {
        const p = e.player; if (!p.alive) continue;
        const inc = C.roundIncome(p, this.roundCount + 1, p._wonLast || false);
        p.gold += inc.total; p._lastIncome = inc;
        C.addXp(p, CFG.XP_PER_ROUND);
        if (!p.locked) { C.returnShopToPool(p.shop, this.pool); p.shop = C.rollShop(this.pool, p.level, this.rng); }
        p.locked = false;
        // Eevee sin elegir: auto
        p.pendingChoices.filter(c => c.type === 'eevee').forEach(c => {
          const u = C.allUnits(p).find(x => x.iid === c.iid);
          if (u) u.variant = this.bestEeveeVariant(p);
        });
        p.pendingChoices = p.pendingChoices.filter(c => c.type !== 'eevee' || !C.allUnits(p).find(x => x.iid === c.iid && x.variant));
      }
      if (this.roundKind() === 'safari') this.beginSafari();
      else this.beginPlan();
    }
    bestEeveeVariant(p) {
      const count = { Agua: 0, 'Eléctrico': 0, Fuego: 0 };
      C.boardUnits(p).forEach(u => { C.unitDef(u.lineId, u.star, u.variant).types.forEach(t => { if (t in count) count[t]++; }); });
      const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
      return { Agua: 'vaporeon', 'Eléctrico': 'jolteon', Fuego: 'flareon' }[best];
    }

    // ---------- combate ----------
    beginCombat() {
      this.state = 'combat';
      const kind = this.roundKind();
      this.sims = [];
      const alive = this.alivePlayers();
      if (kind === 'pve') {
        const key = `${this.phase}-${this.roundInPhase}`;
        const pveKey = PVE_ROUNDS[key] ? key : `${Math.min(this.phase, 7)}-6`;
        alive.forEach(p => {
          const tiers = C.computeSynergies(C.boardUnits(p));
          const sideA = C.playerSide(p, 0, tiers);
          const wild = C.buildWildSide(PVE_ROUNDS[pveKey] ? pveKey : '7-6', C.EMPTY_TIERS());
          this.sims.push({ a: p, b: null, pve: pveKey, sim: C.makeSim(sideA, wild, tiers, C.EMPTY_TIERS(), Math.floor(this.rng() * 1e9)), watchers: [p.id] });
        });
      } else { // pvp
        let order = C.shuffle(this.rng, alive.slice());
        // evitar rival repetido (1 intento)
        for (let i = 0; i + 1 < order.length; i += 2) {
          if (this.lastOpp[order[i].id] === order[i + 1].id && order.length > 3) {
            const k = (i + 3 < order.length) ? i + 3 : 0;
            if (k !== i && k !== i + 1) [order[i + 1], order[k]] = [order[k], order[i + 1]];
          }
        }
        for (let i = 0; i + 1 < order.length; i += 2) {
          const A = order[i], B = order[i + 1];
          this.lastOpp[A.id] = B.id; this.lastOpp[B.id] = A.id;
          const tA = C.computeSynergies(C.boardUnits(A)), tB = C.computeSynergies(C.boardUnits(B));
          this.sims.push({ a: A, b: B, sim: C.makeSim(C.playerSide(A, 0, tA), C.playerSide(B, 1, tB), tA, tB, Math.floor(this.rng() * 1e9)), watchers: [A.id, B.id] });
        }
        if (order.length % 2 === 1) { // fantasma
          const solo = order[order.length - 1];
          const ghostOf = pickOther(this.rng, alive, solo);
          const tA = C.computeSynergies(C.boardUnits(solo)), tB = C.computeSynergies(C.boardUnits(ghostOf));
          this.sims.push({ a: solo, b: ghostOf, ghost: true, sim: C.makeSim(C.playerSide(solo, 0, tA), C.playerSide(ghostOf, 1, tB), tA, tB, Math.floor(this.rng() * 1e9)), watchers: [solo.id] });
        }
      }
      // espectadores: muertos y desemparejados ven el primer combate
      const watched = new Set(this.sims.flatMap(m => m.watchers));
      for (const e of this.players.values()) { if (!watched.has(e.player.id) && this.sims[0]) this.sims[0].watchers.push(e.player.id); }
      // anunciar
      this.sims.forEach(m => {
        const info = { type: 'combat_start', aName: m.a.name, bName: m.pve ? 'Pokémon salvajes' : (m.b.name + (m.ghost ? ' (fantasma)' : '')), label: `${this.phase}-${this.roundInPhase}` };
        m.watchers.forEach(w => { const e = this.players.get(w); info.youSide = (e && e.player === m.a) ? 0 : 1; this.send(w, { ...info }); });
      });
      // bucle en tiempo real
      let tick = 0;
      const iv = setInterval(() => {
        tick++;
        let allOver = true;
        for (const m of this.sims) {
          if (!m.sim.over) { C.stepSim(m.sim); C.stepSim(m.sim); allOver = allOver && m.sim.over; } // 2 pasos = 200ms de juego
          if (tick % 1 === 0) { const snap = C.snapshot(m.sim); m.watchers.forEach(w => this.send(w, { type: 'combat_snap', snap })); }
        }
        if (allOver) { clearInterval(iv); this.setT(() => this.resolveCombats(), 1200); }
      }, 200);
      this.timers.push(iv);
    }

    resolveCombats() {
      const kind = this.roundKind();
      const results = [];
      for (const m of this.sims) {
        const sim = m.sim;
        if (m.pve) {
          const p = m.a, won = sim.winner === 0;
          p._wonLast = won;
          if (won) { p.streakW++; p.streakL = 0; p.wins++; this.givePveLoot(p, m.pve); }
          else { p.streakL++; p.streakW = 0; p.hp -= 2; }
          results.push({ a: p.name, b: 'PvE', winner: won ? p.name : 'Salvajes', dmg: won ? 0 : 2 });
        } else {
          const A = m.a, B = m.b;
          if (sim.winner === 'tie') {
            const dmg = CFG.PHASE_BASE_DMG[Math.min(this.phase, 7)];
            A.hp -= dmg; A.streakL++; A.streakW = 0; A._wonLast = false;
            if (!m.ghost) { B.hp -= dmg; B.streakL++; B.streakW = 0; B._wonLast = false; }
            results.push({ a: A.name, b: B.name, winner: 'Empate', dmg });
          } else {
            const winP = sim.winner === 0 ? A : B;
            const loser = winP === A ? B : A;
            const dmg = C.trainerDamage(this.phase, sim, sim.winner);
            if (winP === A || !m.ghost) { winP.streakW++; winP.streakL = 0; winP.wins++; winP._wonLast = true; }
            if (loser === A || !m.ghost) { loser.hp -= dmg; loser.streakL++; loser.streakW = 0; loser._wonLast = false; }
            results.push({ a: A.name, b: B.name + (m.ghost ? ' (fantasma)' : ''), winner: winP.name, dmg });
          }
        }
      }
      // eliminaciones
      const aliveBefore = this.alivePlayers().length;
      for (const e of this.players.values()) {
        const p = e.player;
        if (p.alive && p.hp <= 0) {
          p.alive = false; p.hp = 0;
          p.place = this.alivePlayers().length + 1;
          C.allUnits(p).forEach(u => { this.pool[u.lineId] += (u.star === 1 ? 1 : u.star === 2 ? 3 : 9); });
          this.broadcast({ type: 'toast', msg: `💀 ${p.name} ha sido eliminado (puesto ${p.place})` });
        }
      }
      this.broadcast({ type: 'combat_results', results, label: `${this.phase}-${this.roundInPhase}` });
      const alive = this.alivePlayers();
      if (alive.length <= 1) {
        if (alive[0]) alive[0].place = 1;
        this.state = 'over';
        const standings = [...this.players.values()].map(e => e.player).sort((x, y) => (x.place || 99) - (y.place || 99))
          .map(p => ({ name: p.name, place: p.place || 1, wins: p.wins }));
        this.syncAll();
        this.broadcast({ type: 'gameover', standings });
        return;
      }
      this.setT(() => this.nextRound(), 3500);
    }

    givePveLoot(p, pveKey) {
      const loot = (PVE_ROUNDS[pveKey] || {}).loot || {};
      const compKeys = Object.keys(COMPONENTS);
      const gained = [];
      if (loot.unitOrComp) {
        if (this.rng() < 0.5) {
          const ones = ROSTER.filter(r => r.cost === 1 && this.pool[r.id] > 0);
          const line = C.pick(this.rng, ones);
          if (line) { const slot = C.findBenchSlot(p); if (slot >= 0) { this.pool[line.id]--; p.bench[slot] = C.newUnit(line.id); C.tryMerge(p, line.id, 1, null); gained.push(line.names[0]); } else { p.gold += 1; gained.push('+1 oro'); } }
        } else { const k = C.pick(this.rng, compKeys); p.components.push(k); gained.push(COMPONENTS[k].name); }
      }
      for (let i = 0; i < (loot.components || 0); i++) { const k = C.pick(this.rng, compKeys); p.components.push(k); gained.push(COMPONENTS[k].name); }
      for (let i = 0; i < (loot.fullItem || 0); i++) { const k = C.pick(this.rng, Object.keys(ITEMS)); p.fullItems.push(k); gained.push(ITEMS[k].name); }
      if (loot.gold) { p.gold += loot.gold; gained.push(`+${loot.gold} oro`); }
      if (loot.stone) { p.stones += loot.stone; gained.push('Piedra Evolutiva'); }
      if (loot.copy) { p.pendingChoices.push({ type: 'mewcopy' }); gained.push('¡Mew te deja copiar una unidad!'); }
      if (gained.length) this.send(p.id, { type: 'toast', msg: '🎁 Botín: ' + gained.join(', ') });
    }

    // ---------- safari ----------
    beginSafari() {
      this.state = 'safari';
      const alive = this.alivePlayers();
      const maxCost = Math.min(this.phase, 5);
      const compKeys = Object.keys(COMPONENTS);
      this.safari = { units: [], taken: {}, order: alive.slice().sort((a, b) => a.hp - b.hp).map(p => p.id), released: 0 };
      for (let i = 0; i < 9; i++) {
        let pool = ROSTER.filter(r => r.cost <= maxCost && r.id !== 'magikarp' && this.pool[r.id] > 0);
        if (this.phase >= 5 && i < 2) pool = pool.filter(r => r.cost >= 4).length ? pool.filter(r => r.cost >= 4) : pool;
        const line = C.pick(this.rng, pool) || ROSTER[0];
        const carry = this.rng() < 0.2 ? { full: C.pick(this.rng, Object.keys(ITEMS)) } : { comp: C.pick(this.rng, compKeys) };
        this.safari.units.push({ lineId: line.id, name: line.names[0], dex: line.dex[0], cost: line.cost, carry });
      }
      const endsAt = Date.now() + CFG.SAFARI_TIME * 1000;
      this.safari.endsAt = endsAt;
      this.broadcastSafari();
      // liberar por orden inverso de PS cada 2,5s
      this.safari.order.forEach((pid, i) => this.setT(() => { this.safari.released = i + 1; this.broadcastSafari(); }, i * 2500));
      this.setT(() => this.endSafari(), CFG.SAFARI_TIME * 1000);
    }
    broadcastSafari() {
      if (!this.safari) return;
      this.broadcast({
        type: 'safari', units: this.safari.units.map((u, i) => ({ ...u, takenBy: this.safari.taken[i] || null })),
        order: this.safari.order.map(id => { const e = this.players.get(id); return { id, name: e ? e.player.name : '?', picked: Object.values(this.safari.taken).includes(id) }; }),
        released: this.safari.released, endsAt: this.safari.endsAt,
      });
    }
    safariPick(p, idx) {
      if (!this.safari || this.safari.taken[idx]) return;
      const myOrder = this.safari.order.indexOf(p.id);
      if (myOrder < 0 || myOrder >= this.safari.released) return;
      if (Object.values(this.safari.taken).includes(p.id)) return;
      this.grantSafari(p, idx);
      this.broadcastSafari();
      if (Object.keys(this.safari.taken).length >= this.safari.order.length) this.endSafari();
    }
    grantSafari(p, idx) {
      const su = this.safari.units[idx];
      this.safari.taken[idx] = p.id;
      if (this.pool[su.lineId] > 0) this.pool[su.lineId]--;
      const slot = C.findBenchSlot(p);
      if (slot >= 0) { p.bench[slot] = C.newUnit(su.lineId); C.tryMerge(p, su.lineId, 1, null); }
      else p.gold += su.cost;
      if (su.carry.full) p.fullItems.push(su.carry.full); else p.components.push(su.carry.comp);
    }
    endSafari() {
      if (this.state !== 'safari') return;
      // autopick para quien no eligió
      this.safari.order.forEach(pid => {
        if (Object.values(this.safari.taken).includes(pid)) return;
        const e = this.players.get(pid); if (!e || !e.player.alive) return;
        const free = this.safari.units.map((u, i) => i).filter(i => !this.safari.taken[i]);
        if (free.length) this.grantSafari(e.player, free[Math.floor(this.rng() * free.length)]);
      });
      this.timers.forEach(clearTimeout); this.timers = [];
      this.beginPlan();
    }
    destroy() { this.timers.forEach(t => { clearTimeout(t); clearInterval(t); }); try { this.peer.destroy(); } catch (_) { } }
  }
  function pickOther(rng, arr, not) { const o = arr.filter(x => x !== not); return o[Math.floor(rng() * o.length)]; }

  // ============== CLIENTE ==============
  class GameClient {
    constructor(onMsg, onStatus) { this.onMsg = onMsg; this.onStatus = onStatus; this.pid = null; }
    hostLocal(host) { this.localHost = host; this.pid = 'host'; }
    send(msg) {
      if (this.localHost) this.localHost.local.clientSend(msg);
      else if (this.conn && this.conn.open) this.conn.send(msg);
    }
    join(code, name) {
      this.peer = new Peer({ debug: 1, config: ICE });
      const watchdog = setTimeout(() => { if (!this.conn || !this.conn.open) this.onStatus('error', 'timeout'); }, 20000);
      this.peer.on('open', () => {
        this.conn = this.peer.connect(PREFIX + code.toUpperCase().trim(), { reliable: true });
        this.conn.on('open', () => { clearTimeout(watchdog); this.conn.send({ type: 'join', name }); this.onStatus('connected'); });
        this.conn.on('data', (msg) => { if (msg.type === 'joined') this.pid = msg.pid; this.onMsg(msg); });
        this.conn.on('close', () => this.onStatus('disconnected'));
        this.conn.on('error', () => this.onStatus('error'));
      });
      this.peer.on('error', (e) => this.onStatus('error', e.type));
    }
  }

  window.PTGAME = { GameHost, GameClient };
})();
