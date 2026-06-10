// PokéTactics — ui.js : interfaz y glue de red
(function () {
  const D = window.PTDATA, C = window.PTCORE, G = window.PTGAME;
  const { CFG, TYPE_COLORS, COMPONENTS, ITEMS, SYNERGIES } = D;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

  let host = null, client = null, myPid = null;
  let S = null;            // último estado de planificación
  let combat = null;       // {youSide, aName, bName}
  let lastSnap = null;
  let sel = null;          // {iid, zone, ...}
  let selItem = null, selComp = null;
  let mode = 'plan';
  let scout = null;        // datos de scouting del rival

  // ---------- geometría del tablero ----------
  const CW = 66, CH = 60, OX = 14, OY = 12;
  const cellX = (r, c) => OX + c * CW + (r % 2) * (CW / 2);
  const cellY = (r) => OY + r * CH;
  const boardEl = $('board');
  boardEl.style.width = (OX * 2 + 7 * CW + CW / 2) + 'px';
  boardEl.style.height = (OY * 2 + 8 * CH + 14) + 'px';

  $('version').textContent = 'Versión ' + D.VERSION;

  function show(screen) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); $(screen).classList.add('active'); }
  function toast(msg, ms = 3500) { const t = el('div', 'toast', msg); $('toasts').appendChild(t); setTimeout(() => t.remove(), ms); }

  // ---------- home ----------
  $('btn-create').onclick = () => {
    const name = ($('inp-name').value || 'Entrenador').trim();
    $('home-status').textContent = 'Creando sala…';
    client = new G.GameClient(onMsg, onNetStatus);
    host = new G.GameHost(name, (msg) => onMsg(msg), (st, info) => {
      if (st === 'ready') { $('lobby-code').textContent = host.code; $('btn-start').classList.remove('hidden'); $('lobby-hint').textContent = 'Pulsa Empezar cuando estén todos (2-8)'; show('screen-lobby'); host.broadcastLobby(); }
      if (st === 'error') $('home-status').textContent = 'Error de red: ' + info + ' (reintenta)';
    });
    client.hostLocal(host); myPid = 'host';
  };
  $('btn-join').onclick = () => {
    const name = ($('inp-name').value || 'Entrenador').trim();
    const code = $('inp-code').value.trim().toUpperCase();
    if (code.length !== 5) { $('home-status').textContent = 'Código de 5 letras'; return; }
    $('home-status').textContent = 'Conectando…';
    client = new G.GameClient(onMsg, onNetStatus);
    client.join(code, name);
  };
  function onNetStatus(st, info) {
    if (st === 'connected') $('home-status').textContent = '';
    if (st === 'disconnected') { toast('⚠ Conexión perdida con el anfitrión'); }
    if (st === 'error') {
      $('home-status').textContent = info === 'timeout'
        ? 'No se pudo establecer la conexión P2P (suele ser el NAT del router o la red). Prueba: recargar y reintentar, otro navegador, o compartir internet desde el móvil.'
        : 'No se pudo conectar (' + (info || '') + '). ¿Código correcto? ¿El anfitrión tiene la sala abierta?';
    }
  }
  $('btn-start').onclick = () => client.send({ type: 'start' });

  // ---------- mensajes ----------
  function onMsg(msg) {
    switch (msg.type) {
      case 'joined': myPid = msg.pid; $('lobby-code').textContent = msg.code; show('screen-lobby'); break;
      case 'error': $('home-status').textContent = msg.err; toast(msg.err); break;
      case 'lobby': renderLobby(msg); break;
      case 'gamestart': show('screen-game'); break;
      case 'state': S = msg; if (mode !== 'combat' || msg.state === 'plan') { mode = msg.state === 'combat' ? mode : 'plan'; } if (msg.state === 'plan') { mode = 'plan'; $('safari').classList.remove('show'); } renderAll(); checkChoices(); break;
      case 'combat_start': mode = 'combat'; combat = msg; lastSnap = null; scout = null; $('combat-title').textContent = `⚔ ${msg.aName} vs ${msg.bName}`; $('combat-title').classList.remove('hidden'); clearBoardUnits(); break;
      case 'scoutData': scout = msg; if (mode === 'plan' || mode === 'safari') renderScoutBoard(); break;
      case 'combat_snap': lastSnap = msg.snap; renderCombat(msg.snap); break;
      case 'combat_results': showResults(msg); break;
      case 'safari': mode = 'safari'; renderSafari(msg); break;
      case 'toast': toast(msg.msg); break;
      case 'gameover': showGameOver(msg); break;
    }
  }

  function renderLobby(msg) {
    const box = $('lobby-players'); box.innerHTML = '';
    msg.players.forEach(p => box.appendChild(el('div', 'lobby-p', `<span>${esc(p.name)}${p.id === myPid ? ' (tú)' : ''}</span><span>${p.connected ? '🟢' : '🔴'}</span>`)));
  }
  const esc = (s) => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

  // ---------- render principal ----------
  function renderAll() {
    if (!S) return;
    $('hud-round').textContent = S.round.label;
    $('hud-kind').textContent = { pve: '🌿 PvE', pvp: '⚔ PvP', safari: '🌿 Safari' }[S.round.kind] || '';
    $('hud-gold').textContent = '💰 ' + S.you.gold;
    $('hud-lvl').textContent = `Nv ${S.you.level}` + (S.you.xpNext !== null ? ` · faltan ${S.you.xpNext} XP` : ' · MÁX');
    $('hud-board').textContent = `${S.you.boardCount}/${S.you.level} en campo`;
    $('btn-lock').textContent = S.you.locked ? '🔓 Desbloquear' : '🔒 Bloquear';
    $('btn-xp').disabled = S.you.gold < 4 || S.you.xpNext === null;
    $('btn-reroll').disabled = S.you.gold < 2;
    const inc = S.you.lastIncome;
    $('hud-inc').textContent = inc ? `+${inc.total}/ronda (int. ${inc.interest} · racha ${inc.streak})` : '';
    $('odds').innerHTML = (D.SHOP_ODDS[Math.min(S.you.level, 9)] || []).map((o, i) => `<span class="o${i + 1}">${o}%</span>`).join('');
    renderRoundTrack();
    renderShop(); renderPlayers(); renderSynergies(); renderItems();
    if (mode === 'plan') { if (scout) { client.send({ type: 'scout', pid: scout.pid }); } else renderPlanBoard(); }
    if (!S.you.alive) $('hud-msg').textContent = '💀 Eliminado — modo espectador';
  }

  // indicador de rondas de la fase (estilo TFT)
  function renderRoundTrack() {
    const box = $('roundtrack'); box.innerHTML = '';
    const icons = S.round.phase === 1 ? ['🐾', '🐾', '🐾'] : ['🌿', '⚔', '⚔', '⚔', '⚔', '🐾'];
    const cur = S.round.num - 1;
    icons.forEach((ic, i) => {
      const d = el('div', 'rt' + (i === cur ? ' cur' : i < cur ? ' done' : ''), ic);
      d.title = `Ronda ${S.round.phase}-${i + 1}: ` + (ic === '🌿' ? 'Safari' : ic === '⚔' ? 'PvP' : 'PvE');
      box.appendChild(d);
    });
  }

  function renderShop() {
    const box = $('shopcards'); box.innerHTML = '';
    S.you.shop.forEach((card, i) => {
      if (!card) { box.appendChild(el('div', 'card empty', '&nbsp;')); return; }
      const cd = el('div', `card c${card.cost}`);
      cd.innerHTML = `<span class="cost">${card.cost}💰</span><img src="${D.SPRITE(card.dex)}"><div class="nm">${card.name}</div>
        <div class="ty">${card.types.map(t => `<span style="background:${TYPE_COLORS[t]}">${t}</span>`).join('')}${card.cls ? `<span style="background:${TYPE_COLORS[card.cls]}">${card.cls}</span>` : ''}</div>`;
      cd.title = `${card.name} — ${card.ab.name}: ${card.ab.desc}`;
      cd.onclick = () => client.send({ type: 'buy', slot: i });
      box.appendChild(cd);
    });
  }

  function renderPlayers() {
    const box = $('playerlist'); box.innerHTML = '';
    S.players.slice().sort((a, b) => b.hp - a.hp || (a.alive ? -1 : 1)).forEach(p => {
      const d = el('div', 'pl' + (p.alive ? '' : ' dead') + (p.id !== myPid && p.alive ? ' scoutable' : ''));
      if (p.id !== myPid && p.alive) { d.title = 'Clic para ver su tablero'; d.onclick = () => { if (mode === 'plan' || mode === 'safari') client.send({ type: 'scout', pid: p.id }); }; }
      else if (p.id === myPid) d.onclick = () => exitScout();
      d.innerHTML = `<div class="nm"><span>${esc(p.name)}${p.id === myPid ? ' ⭐' : ''}${p.connected ? '' : ' 🔌'}</span><span>${p.alive ? p.hp + '❤' : '#' + p.place}</span></div>
        <div class="hpbar"><i style="width:${p.hp}%"></i></div>
        <div class="mini">${p.boardPreview.map(u => `<img src="${D.SPRITE(u.dex)}" title="${u.star}★">`).join('')}</div>
        <div style="font-size:11px;color:var(--dim)">Nv ${p.level} ${p.streak}</div>`;
      box.appendChild(d);
    });
  }

  function renderSynergies(src, owner) {
    const box = $('synlist'); box.innerHTML = '';
    if (owner) box.appendChild(el('div', '', `<b style="color:var(--gold);font-size:12px">🔍 ${esc(owner)}</b>`));
    const syns = Object.entries(src || S.you.synergies).filter(([k, v]) => v.count > 0)
      .sort((a, b) => (b[1].tier - a[1].tier) || (b[1].count - a[1].count));
    syns.forEach(([k, v]) => {
      const def = SYNERGIES[k];
      const d = el('div', 'syn' + (v.tier > 0 ? ' active' : ''));
      d.innerHTML = `<span class="dot" style="background:${TYPE_COLORS[k] || '#888'}">${v.count}</span><span>${k}</span><span class="cnt">${def.thresholds.join('/')}</span>`;
      d.title = def.desc.map((t, i) => `(${def.thresholds[i]}) ${t}`).join('\n');
      box.appendChild(d);
    });
    if (!syns.length) box.innerHTML = '<div style="color:var(--dim);font-size:12px">Coloca unidades en el campo</div>';
  }

  // ---------- objetos ----------
  function renderItems() {
    const cb = $('complist'); cb.innerHTML = '';
    S.you.components.forEach((k, i) => {
      const d = el('div', 'itm' + (selComp === i ? ' sel' : ''), COMPONENTS[k].emoji);
      d.title = `${COMPONENTS[k].name}: ${COMPONENTS[k].stat}`;
      d.onclick = () => {
        if (selComp === null) { selComp = i; }
        else if (selComp === i) { selComp = null; }
        else { client.send({ type: 'combine', i: selComp, j: i }); selComp = null; }
        renderItems();
      };
      cb.appendChild(d);
    });
    if (!S.you.components.length) cb.innerHTML = '<span style="font-size:11px;color:var(--dim)">Gana componentes en rondas PvE</span>';
    const ib = $('itemlist'); ib.innerHTML = '';
    S.you.fullItems.forEach((k, i) => {
      const d = el('div', 'itm' + (selItem === i ? ' sel' : ''), ITEMS[k].emoji);
      d.title = `${ITEMS[k].name}: ${ITEMS[k].desc}`;
      d.onclick = () => { selItem = selItem === i ? null : i; renderItems(); toast(selItem !== null ? 'Ahora haz clic en una unidad tuya para equipar' : 'Equipado cancelado', 1800); };
      ib.appendChild(d);
    });
    if (!S.you.fullItems.length) ib.innerHTML = '<span style="font-size:11px;color:var(--dim)">Combina 2 componentes</span>';
    $('stonebox').classList.toggle('hidden', S.you.stones <= 0);
    $('stonecount').textContent = '×' + S.you.stones;
  }
  $('btn-stone').onclick = () => { if (sel) client.send({ type: 'stone', iid: sel.iid }); };

  // ---------- tablero (planificación) ----------
  function clearBoardUnits() { boardEl.querySelectorAll('.unit,.float').forEach(e => e.remove()); }
  function ensureCells() {
    if (boardEl.querySelector('.cell')) return;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 7; c++) {
      const cell = el('div', 'cell' + (r >= 4 ? ' own' : ''));
      cell.style.left = cellX(r, c) + 'px'; cell.style.top = cellY(r) + 'px';
      cell.dataset.r = r; cell.dataset.c = c;
      cell.onclick = () => onCellClick(r, c);
      boardEl.appendChild(cell);
    }
  }
  // ---------- scouting (estilo TFT) ----------
  function renderScoutBoard() {
    if (!scout) return;
    ensureCells(); clearBoardUnits();
    const ct = $('combat-title');
    ct.classList.remove('hidden');
    ct.innerHTML = `🔍 Tablero de <b>${esc(scout.name)}</b> · Nv ${scout.level} · ${scout.hp}❤
      <button id="scout-prev" title="Anterior">‹</button><button id="scout-next" title="Siguiente">›</button><button id="scout-back">Volver (Esc)</button>`;
    document.getElementById('scout-back').onclick = exitScout;
    document.getElementById('scout-prev').onclick = () => cycleScout(-1);
    document.getElementById('scout-next').onclick = () => cycleScout(1);
    for (let ownR = 0; ownR < 4; ownR++) for (let c = 0; c < 7; c++) {
      const u = scout.board[ownR][c];
      if (u) { const d = planUnitEl(u, 7 - ownR, c, false); d.onclick = (e) => e.stopPropagation(); boardEl.appendChild(d); }
    }
    const box = $('bench'); box.innerHTML = '';
    scout.bench.forEach(u => {
      const slot = el('div', 'bslot');
      if (u) { slot.innerHTML = `<div class="stars">${'★'.repeat(u.star)}</div><img src="${D.SPRITE(u.dex)}">`; slot.title = `${u.name} ${'★'.repeat(u.star)}`; }
      box.appendChild(slot);
    });
    $('sellzone').classList.remove('show');
    renderSynergies(scout.synergies, scout.name);
  }
  function cycleScout(dir) {
    const others = S.players.filter(p => p.alive && p.id !== myPid);
    if (!others.length) return exitScout();
    let idx = others.findIndex(p => p.id === scout.pid);
    if (idx < 0) idx = 0;
    const next = others[(idx + dir + others.length) % others.length];
    client.send({ type: 'scout', pid: next.id });
  }
  function exitScout() {
    if (!scout) return;
    scout = null;
    $('combat-title').classList.add('hidden');
    if (S) { renderSynergies(); if (mode === 'plan') renderPlanBoard(); }
  }

  function onCellClick(r, c) {
    if (scout) return;
    if (mode !== 'plan' || !S || !S.you.alive) return;
    if (r < 4) return;
    const ownR = 7 - r;
    const u = S.you.board[ownR][c];
    if (selItem !== null && u) { client.send({ type: 'equip', iid: u.iid, idx: selItem }); selItem = null; return; }
    if (sel) { client.send({ type: 'move', iid: sel.iid, to: 'board', r: ownR, c }); sel = null; updateSelVisual(); return; }
    if (u) { sel = { iid: u.iid, unit: u }; updateSelVisual(); showUnitInfo(u); }
  }
  function renderPlanBoard() {
    ensureCells();
    $('combat-title').classList.add('hidden');
    clearBoardUnits();
    // unidades propias en su mitad
    for (let ownR = 0; ownR < 4; ownR++) for (let c = 0; c < 7; c++) {
      const u = S.you.board[ownR][c];
      if (u) boardEl.appendChild(planUnitEl(u, 7 - ownR, c, false));
    }
    renderBench();
    $('sellzone').classList.toggle('show', !!sel);
    if (sel) $('sellval').textContent = '+' + sellVal(sel.unit) + ' oro';
  }
  function sellVal(u) { const c = u.cost; return u.star === 1 ? c : u.star === 2 ? c * 3 - 1 : c * 6; }
  function planUnitEl(u, r, c, enemy) {
    const d = el('div', 'unit' + (sel && sel.iid === u.iid ? ' sel' : ''));
    d.style.left = cellX(r, c) + 'px'; d.style.top = (cellY(r) - 10) + 'px';
    d.innerHTML = `<div class="stars">${'★'.repeat(u.star)}</div><img class="sprite" src="${D.SPRITE(u.dex)}">
      <div class="itemdots">${u.items.map(k => ITEMS[k] ? ITEMS[k].emoji : '').join('')}${u.stone ? '🪨' : ''}</div>`;
    d.title = `${u.name} ${'★'.repeat(u.star)} — ${u.ab.name}: ${u.ab.desc}`;
    d.onclick = (e) => { e.stopPropagation(); onCellClick(r, c); };
    return d;
  }
  function renderBench() {
    const box = $('bench'); box.innerHTML = '';
    S.you.bench.forEach((u, i) => {
      const slot = el('div', 'bslot' + (sel && u && sel.iid === u.iid ? ' sel' : ''));
      if (u) {
        slot.innerHTML = `<div class="stars">${'★'.repeat(u.star)}</div><img src="${D.SPRITE(u.dex)}">`;
        slot.title = `${u.name} ${'★'.repeat(u.star)} — ${u.ab.name}: ${u.ab.desc}`;
      }
      slot.onclick = () => {
        if (mode !== 'plan') return;
        if (selItem !== null && u) { client.send({ type: 'equip', iid: u.iid, idx: selItem }); selItem = null; return; }
        if (sel) { client.send({ type: 'move', iid: sel.iid, to: 'bench', i }); sel = null; updateSelVisual(); return; }
        if (u) { sel = { iid: u.iid, unit: u }; updateSelVisual(); showUnitInfo(u); renderPlanBoard(); }
      };
      box.appendChild(slot);
    });
  }
  function updateSelVisual() { if (S && mode === 'plan') renderPlanBoard(); }
  function showUnitInfo(u) {
    const box = $('unitinfo'); box.classList.remove('hidden');
    box.innerHTML = `<b>${u.name} ${'★'.repeat(u.star)}</b> · ${u.cost}💰<br>
      ${u.types.map(t => `<span style="color:${TYPE_COLORS[t]}">${t}</span>`).join(' · ')}${u.cls ? ' · ' + u.cls : ''}
      <div class="ab"><b>${u.ab.name}</b>: ${u.ab.desc}</div>
      ${u.items.length ? '<div class="ab">Objetos: ' + u.items.map(k => ITEMS[k].emoji + ' ' + ITEMS[k].name).join(', ') + '</div>' : ''}`;
  }
  $('sellzone').onclick = () => { if (sel) { client.send({ type: 'sell', iid: sel.iid }); sel = null; } };

  // ---------- combate ----------
  const unitEls = new Map();
  function renderCombat(snap) {
    ensureCells();
    $('bench').innerHTML = '';
    $('sellzone').classList.remove('show');
    const flip = combat && combat.youSide === 1;
    const seen = new Set();
    snap.units.forEach(u => {
      seen.add(u.uid);
      let r = u.r, c = u.c;
      if (flip) { r = 7 - r; c = 6 - c; }
      const mySide = combat ? (flip ? 1 : 0) : 0;
      let d = unitEls.get(u.uid);
      if (!d) {
        d = el('div', 'unit' + (u.side === mySide ? '' : ' enemy'));
        d.innerHTML = `<div class="stars">${'★'.repeat(u.star)}</div>
          <div class="bars"><div class="hpb"><i></i></div><div class="enb"><i></i></div></div>
          <img class="sprite" src="${D.SPRITE(u.dex)}"><div class="sts"></div>`;
        d.title = u.name;
        boardEl.appendChild(d); unitEls.set(u.uid, d);
      }
      d.classList.toggle('dead', u.dead);
      d.style.left = cellX(r, c) + 'px'; d.style.top = (cellY(r) - 10) + 'px';
      d.querySelector('.hpb i').style.width = Math.max(0, u.hp / u.maxHp * 100) + '%';
      d.querySelector('.enb i').style.width = Math.min(100, u.en / u.enMax * 100) + '%';
      const st = [];
      if (u.st.burn) st.push('🔥'); if (u.st.slp) st.push('💤'); if (u.st.frz) st.push('🧊');
      if (u.st.par) st.push('⚡'); if (u.st.stun) st.push('💫'); if (u.st.fear) st.push('😱'); if (u.st.shield) st.push('🛡');
      d.querySelector('.sts').textContent = st.join('');
    });
    // efectos flotantes
    (snap.fx || []).forEach(fx => {
      const tgt = snap.units.find(u => u.uid === fx.uid); if (!tgt) return;
      let r = tgt.r, c = tgt.c; if (flip) { r = 7 - r; c = 6 - c; }
      if (fx.t === 'dmg') floatText(r, c, '-' + fx.amt, fx.crit ? '#ffd54a' : (fx.kind === 'ability' ? '#c792ff' : '#ff8a80'));
      else if (fx.t === 'heal') floatText(r, c, '+' + fx.amt, '#69f0ae');
      else if (fx.t === 'dodge') floatText(r, c, 'esquiva', '#80d8ff');
      else if (fx.t === 'miss') floatText(r, c, 'falla', '#aaa');
      else if (fx.t === 'cast') floatText(r, c, '✨', '#fff');
      else if (fx.t === 'revive') floatText(r, c, '¡REVIVE!', '#ffd54a');
    });
    // limpiar unidades de combates anteriores
    for (const [uid, d] of unitEls) { if (!seen.has(uid)) { d.remove(); unitEls.delete(uid); } }
  }
  function floatText(r, c, text, color) {
    const f = el('div', 'float', text);
    f.style.left = (cellX(r, c) + 8 + Math.random() * 30) + 'px';
    f.style.top = (cellY(r) - 6) + 'px';
    f.style.color = color;
    boardEl.appendChild(f);
    setTimeout(() => f.remove(), 900);
  }

  // ---------- resultados / modales ----------
  function modal(html, opts = {}) {
    $('modal').innerHTML = html;
    $('overlay').classList.add('show');
    if (opts.autoclose) setTimeout(closeModal, opts.autoclose);
  }
  function closeModal() { $('overlay').classList.remove('show'); }
  $('overlay').onclick = (e) => { if (e.target === $('overlay')) closeModal(); };

  function showResults(msg) {
    unitEls.forEach(d => d.remove()); unitEls.clear();
    const lines = msg.results.map(r => `<div class="resultline">⚔ <b>${esc(r.a)}</b> vs <b>${esc(r.b)}</b> → gana <b style="color:var(--gold)">${esc(r.winner)}</b>${r.dmg ? ` (${r.dmg} de daño)` : ''}</div>`).join('');
    modal(`<h3>Resultados ronda ${msg.label}</h3>${lines}`, { autoclose: 3000 });
  }
  function showGameOver(msg) {
    const lines = msg.standings.map(s => `<div class="resultline">${s.place === 1 ? '🏆' : '#' + s.place} <b>${esc(s.name)}</b> · ${s.wins} victorias</div>`).join('');
    modal(`<h3>🏁 Fin de la partida</h3>${lines}<br><button onclick="location.reload()">Volver al inicio</button>`);
  }
  function checkChoices() {
    if (!S || !S.you.pendingChoices.length) return;
    const ch = S.you.pendingChoices[0];
    if (ch.type === 'eevee') {
      const v = D.EEVEE_VARIANTS;
      modal(`<h3>✨ ¡Eevee va a evolucionar! Elige:</h3><div class="choices">` +
        Object.entries(v).map(([k, x]) => `<div class="choice" data-v="${k}"><img src="${D.SPRITE(x.dex)}"><b>${x.name}</b><br><span style="font-size:11px;color:var(--dim)">${x.types[0]} · ${x.cls}<br>${x.ab.name}</span></div>`).join('') + '</div>');
      $('modal').querySelectorAll('.choice').forEach(c => c.onclick = () => { client.send({ type: 'eevee', iid: ch.iid, variant: c.dataset.v }); closeModal(); });
    } else if (ch.type === 'mewcopy') {
      const units = [];
      S.you.board.forEach(row => row.forEach(u => { if (u) units.push(u); }));
      S.you.bench.forEach(u => { if (u) units.push(u); });
      modal(`<h3>🧬 Mew te permite copiar una de tus unidades (recibes 1 copia 1★)</h3><div class="choices">` +
        units.map(u => `<div class="choice" data-iid="${u.iid}"><img src="${D.SPRITE(u.dex)}"><b>${u.name}</b></div>`).join('') + '</div>');
      $('modal').querySelectorAll('.choice').forEach(c => c.onclick = () => { client.send({ type: 'mewcopy', iid: +c.dataset.iid }); closeModal(); });
    }
  }

  // ---------- safari ----------
  function renderSafari(msg) {
    $('safari').classList.add('show');
    const myTurnIdx = msg.order.findIndex(o => o.id === myPid);
    const released = myTurnIdx >= 0 && myTurnIdx < msg.released;
    const iPicked = msg.order.find(o => o.id === myPid && o.picked);
    $('safari-orden').innerHTML = 'Orden de captura (menos PS primero): ' +
      msg.order.map((o, i) => `<b style="color:${i < msg.released ? 'var(--gold)' : 'var(--dim)'}">${esc(o.name)}${o.picked ? ' ✔' : ''}</b>`).join(' → ');
    const grid = $('safari-grid'); grid.innerHTML = '';
    msg.units.forEach((u, i) => {
      const carryTxt = u.carry.full ? ITEMS[u.carry.full].emoji + ' ' + ITEMS[u.carry.full].name : COMPONENTS[u.carry.comp].emoji + ' ' + COMPONENTS[u.carry.comp].name;
      const d = el('div', 'swild' + (u.takenBy ? ' taken' : ''));
      d.innerHTML = `${u.takenBy ? `<div class="takenby">${esc(nameOf(u.takenBy, msg))}</div>` : ''}<img src="${D.SPRITE(u.dex)}"><div><b>${u.name}</b> · ${u.cost}💰</div><div class="carry">${carryTxt}</div>`;
      d.onclick = () => { if (released && !iPicked && !u.takenBy) client.send({ type: 'safariPick', idx: i }); };
      grid.appendChild(d);
    });
    $('safari-timer').textContent = released && !iPicked ? '¡Elige un Pokémon!' : iPicked ? 'Capturado ✔' : 'Espera tu turno…';
    safariEndsAt = msg.endsAt;
  }
  function nameOf(pid, msg) { const o = msg.order.find(x => x.id === pid); return o ? o.name : '?'; }

  // ---------- botones de economía ----------
  $('btn-xp').onclick = () => client.send({ type: 'xp' });
  $('btn-reroll').onclick = () => client.send({ type: 'reroll' });
  $('btn-lock').onclick = () => client.send({ type: 'lock' });

  // ---------- timer ----------
  let safariEndsAt = 0;
  setInterval(() => {
    const fill = $('bigtimer-fill'), num = $('bigtimer-num');
    if (mode === 'combat') {
      $('timer').textContent = lastSnap ? lastSnap.t.toFixed(0) + 's' : '⚔';
      const t = lastSnap ? lastSnap.t : 0;
      num.textContent = '⚔ ' + t.toFixed(0) + 's';
      fill.style.width = Math.min(100, t / D.CFG.COMBAT_MAX * 100) + '%';
      fill.classList.toggle('urgent', t > D.CFG.COMBAT_MAX - 10);
      return;
    }
    let ends = 0, total = D.CFG.PLAN_TIME;
    if (mode === 'safari') { ends = safariEndsAt; total = D.CFG.SAFARI_TIME; }
    else if (S && S.round) ends = S.round.endsAt;
    const leftMs = Math.max(0, ends - Date.now());
    const left = Math.ceil(leftMs / 1000);
    $('timer').textContent = left;
    num.textContent = (mode === 'safari' ? '🌿 ' : '🛒 ') + left + 's';
    fill.style.width = Math.min(100, leftMs / (total * 1000) * 100) + '%';
    fill.classList.toggle('urgent', left <= 8);
  }, 300);

  // teclas rápidas: D = reroll, F = xp, E = vender selección
  document.addEventListener('keydown', (e) => {
    if (mode !== 'plan' || !S) return;
    if (e.key === 'd' || e.key === 'D') client.send({ type: 'reroll' });
    if (e.key === 'f' || e.key === 'F') client.send({ type: 'xp' });
    if ((e.key === 'e' || e.key === 'E') && sel) { client.send({ type: 'sell', iid: sel.iid }); sel = null; }
    if (e.key === 'Escape') { if (scout) { exitScout(); return; } sel = null; selItem = null; selComp = null; renderAll(); }
  });
})();
