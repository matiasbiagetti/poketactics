// PokéTactics — ui.js : interfaz y glue de red (v1.2: tooltips, drag&drop, watch, badges)
(function () {
  const D = window.PTDATA, C = window.PTCORE, G = window.PTGAME;
  const { CFG, TYPE_COLORS, COMPONENTS, ITEMS, SYNERGIES } = D;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

  let host = null, client = null, myPid = null;
  let S = null;            // último estado
  let combat = null;       // info del combate visto
  let lastSnap = null;
  let sel = null;          // unidad seleccionada {iid, unit}
  let selItem = null, selComp = null;
  let mode = 'plan';
  let scout = null;        // datos de scouting
  let scoutWanted = false; // solo aceptar scoutData solicitado
  let safariEndsAt = 0;

  // diagnóstico: errores visibles en pantalla
  let lastErrToast = 0;
  window.onerror = (m) => { if (Date.now() - lastErrToast > 5000) { lastErrToast = Date.now(); try { toast('⚠ Error: ' + m, 6000); } catch (_) { } } };

  $('version').textContent = 'Versión ' + D.VERSION;

  // ---------- geometría ----------
  const CW = 78, CH = 70, OX = 14, OY = 12;
  const cellX = (r, c) => OX + c * CW + (r % 2) * (CW / 2);
  const cellY = (r) => OY + r * CH;
  const boardEl = $('board');
  boardEl.style.width = (OX * 2 + 7 * CW + CW / 2) + 'px';
  boardEl.style.height = (OY * 2 + 8 * CH + 14) + 'px';

  function show(screen) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); $(screen).classList.add('active'); }
  function toast(msg, ms = 3500) { const t = el('div', 'toast', msg); $('toasts').appendChild(t); setTimeout(() => t.remove(), ms); }

  // ================= TOOLTIP instantáneo =================
  const tipEl = el('div'); tipEl.id = 'tooltip'; document.body.appendChild(tipEl);
  function posTip(e) {
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let x = e.clientX + 16, y = e.clientY + 12;
    if (x + w > innerWidth - 8) x = e.clientX - w - 12;
    if (y + h > innerHeight - 8) y = e.clientY - h - 12;
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  }
  function tt(node, html) {
    node.onmouseenter = (e) => { tipEl.innerHTML = typeof html === 'function' ? html() : html; tipEl.style.display = 'block'; posTip(e); };
    node.onmousemove = posTip;
    node.onmouseleave = () => { tipEl.style.display = 'none'; };
  }
  function hideTip() { tipEl.style.display = 'none'; }
  const chip = (t) => `<span class="chip" style="background:${TYPE_COLORS[t] || '#888'}">${t}</span>`;
  function roleText(cls, range) {
    const pos = cls === 'Velocista' ? 'Salta a la retaguardia enemiga' : (cls === 'Tanque' || cls === 'Atacante') ? 'Línea frontal' : 'Línea trasera';
    const dmg = { Tanque: 'Aguanta daño', Atacante: 'Daño de ataque', Especialista: 'Daño de habilidad', Soporte: 'Curación y escudos', Velocista: 'Asesino' }[cls] || '';
    return `${pos} · ${dmg} · Alcance ${range}`;
  }
  function unitTip(u) {
    const st = u.stats || {};
    return `<div class="tname">${esc(u.name)} <span class="gold">${'★'.repeat(u.star || 1)}</span> · ${u.cost}💰</div>
      <div>${(u.types || []).map(chip).join('')}${u.cls ? chip(u.cls) : ''}</div>
      <div class="trole">${u.cls ? roleText(u.cls, st.range ?? 1) : 'Sin tipo (¡confía en el pez!)'}</div>
      <div class="tstats">❤ ${st.hp ?? '?'} · ⚔ ${st.atk ?? '?'} · ⚡ ${st.spd ?? '?'}/s · 🔵 ${st.energy ?? '?'} energía</div>
      <div class="tab"><b>${esc(u.ab.name)}</b>: ${esc(u.ab.desc)}</div>
      ${u.items && u.items.length ? `<div class="tab">${u.items.map(k => itemMini(k)).join('<br>')}</div>` : ''}
      ${u.stone ? '<div class="tab">🪨 Piedra Evolutiva (cuenta como copia extra)</div>' : ''}`;
  }
  function itemMini(k) {
    if (ITEMS[k]) return `${ITEMS[k].emoji} <b>${ITEMS[k].name}</b>: ${ITEMS[k].desc}`;
    if (COMPONENTS[k]) return `${COMPONENTS[k].emoji} <b>${COMPONENTS[k].name}</b> (componente): ${COMPONENTS[k].stat}`;
    return k;
  }
  function itemTip(k) { return `<div class="tname">${ITEMS[k].emoji} ${ITEMS[k].name}</div><div>${ITEMS[k].desc}</div><div class="trole">Arrástralo sobre una de tus unidades (máx 3)</div>`; }
  function compTip(k) {
    const combos = Object.keys(COMPONENTS).map(o => {
      const key = [k, o].sort().join('+');
      const it = ITEMS[key];
      return it ? `<div class="combo">${COMPONENTS[o].emoji}→${it.emoji} <b>${it.name}</b>: ${it.desc}</div>` : '';
    }).join('');
    return `<div class="tname">${COMPONENTS[k].emoji} ${COMPONENTS[k].name} <span class="trole">(componente)</span></div>
      <div>${COMPONENTS[k].stat}</div>
      <div class="trole">Equipable suelto; al añadir otro componente se combina:</div>${combos}`;
  }

  // ================= DRAG & DROP =================
  let drag = null, lastDragEnd = 0;
  const canAct = () => S && S.you.alive && (mode === 'plan' || mode === 'combat') && !scout;
  function startDrag(e, info, srcEl, clickFn) {
    if (e.button !== undefined && e.button !== 0) return;
    drag = { ...info, sx: e.clientX, sy: e.clientY, moved: false, clickFn };
    const g = srcEl.cloneNode(true); g.classList.add('dragghost');
    g.style.left = (e.clientX - 28) + 'px'; g.style.top = (e.clientY - 30) + 'px';
    document.body.appendChild(g); drag.ghost = g;
    if (info.kind === 'unit') {
      $('sellzone').classList.add('show'); $('sellval').textContent = '+' + sellVal(info.unit) + ' oro';
      $('shopbar').classList.add('sellmode'); $('shopbar').dataset.sellval = sellVal(info.unit);
    }
    hideTip();
    e.preventDefault();
  }
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
    drag.ghost.style.left = (e.clientX - 28) + 'px'; drag.ghost.style.top = (e.clientY - 30) + 'px';
  });
  document.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag; drag = null; d.ghost.remove();
    lastDragEnd = Date.now();
    $('shopbar').classList.remove('sellmode');
    if (!sel) $('sellzone').classList.remove('show');
    if (!d.moved) { if (d.clickFn) d.clickFn(); return; }
    d.ghost.style.display = 'none';
    const t = document.elementFromPoint(e.clientX, e.clientY);
    if (!t || !canAct()) return;
    const sellz = (t.closest && t.closest('#sellzone')) || (d.kind === 'unit' && t.closest && t.closest('#shopbar'));
    const bs = t.closest && t.closest('.bslot');
    const un = t.closest && t.closest('.unit');
    const cell = t.closest && t.closest('.cell');
    if (d.kind === 'shop') { // arrastrar carta de la tienda → comprar (TFT)
      if (bs || cell || un || (t.closest && t.closest('#bench'))) client.send({ type: 'buy', slot: d.slot });
      return;
    }
    if (d.kind === 'unit') {
      sel = null;
      if (sellz) { client.send({ type: 'sell', iid: d.unit.iid }); return; }
      if (bs) { client.send({ type: 'move', iid: d.unit.iid, to: 'bench', i: +bs.dataset.i }); return; }
      let r = null, c = null;
      if (un && un.dataset.r !== undefined) { r = +un.dataset.r; c = +un.dataset.c; }
      else if (cell) { r = +cell.dataset.r; c = +cell.dataset.c; }
      if (r !== null && r >= 4 && mode === 'plan') client.send({ type: 'move', iid: d.unit.iid, to: 'board', r: 7 - r, c });
    } else {
      let iid = null;
      if (un && un.dataset.iid) iid = +un.dataset.iid;
      else if (bs && bs.dataset.iid) iid = +bs.dataset.iid;
      if (iid !== null) {
        if (d.kind === 'comp') { client.send({ type: 'equipComp', iid, idx: d.idx, k: S.you.components[d.idx] }); selComp = null; }
        else { client.send({ type: 'equip', iid, idx: d.idx, k: S.you.fullItems[d.idx] }); selItem = null; }
      }
    }
  });
  const justDragged = () => Date.now() - lastDragEnd < 120;

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
    try { _onMsg(msg); }
    catch (e) {
      console.error('Error procesando', msg.type, e);
      if (Date.now() - lastErrToast > 5000) { lastErrToast = Date.now(); toast('⚠ Error UI (' + msg.type + '): ' + e.message, 6000); }
    }
  }
  function _onMsg(msg) {
    switch (msg.type) {
      case 'joined': myPid = msg.pid; $('lobby-code').textContent = msg.code; show('screen-lobby'); break;
      case 'error': $('home-status').textContent = msg.err; toast(msg.err); break;
      case 'lobby': renderLobby(msg); break;
      case 'gamestart': show('screen-game'); break;
      case 'state':
        S = msg;
        if (msg.state === 'plan') { mode = 'plan'; $('safari').classList.remove('show'); }
        renderAll(); checkChoices();
        break;
      case 'combat_start':
        mode = 'combat'; combat = msg; lastSnap = null; scout = null; scoutWanted = false;
        unitEls.forEach(d => d.remove()); unitEls.clear(); clearBoardUnits();
        $('combat-title').innerHTML = `⚔ <b>${esc(msg.aName)}</b>${msg.aLevel ? ` (Nv ${msg.aLevel})` : ''} vs <b>${esc(msg.bName)}</b>${msg.bLevel ? ` (Nv ${msg.bLevel})` : ''}`;
        $('combat-title').classList.remove('hidden');
        updateBadges();
        if (S) renderBench();
        break;
      case 'scoutData': if (!scoutWanted) break; scout = msg; if (mode === 'plan' || mode === 'safari') { renderScoutBoard(); updateBadges(); } break;
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
    if (mode === 'plan') { if (scout) client.send({ type: 'scout', pid: scout.pid }); else renderPlanBoard(); }
    else if (mode === 'combat') renderBench();
    updateBadges();
    if (!S.you.alive) $('hud-msg').textContent = '💀 Eliminado — modo espectador';
  }

  function renderRoundTrack() {
    const box = $('roundtrack'); box.innerHTML = '';
    const icons = S.round.phase === 1 ? ['🐾', '🐾', '🐾'] : ['🌿', '⚔', '⚔', '⚔', '⚔', '🐾'];
    const cur = S.round.num - 1;
    icons.forEach((ic, i) => {
      const d = el('div', 'rt' + (i === cur ? ' cur' : i < cur ? ' done' : ''), ic);
      tt(d, `<b>Ronda ${S.round.phase}-${i + 1}</b>: ` + (ic === '🌿' ? 'Safari (carrusel compartido)' : ic === '⚔' ? 'PvP contra otro entrenador' : 'PvE contra Pokémon salvajes'));
      box.appendChild(d);
    });
  }

  // ---------- badges de avatar/nivel ----------
  function setBadge(node, name, level, avatar, foe) {
    node.classList.remove('hidden'); node.classList.toggle('foe', !!foe);
    const img = avatar ? `<img draggable="false" src="${D.SPRITE(avatar)}">` : '<div style="font-size:32px;line-height:46px">🌿</div>';
    node.innerHTML = `${img}<div class="lv">${level != null ? 'Nv ' + level : 'PvE'}</div><div class="nm">${esc(name)}</div>`;
  }
  function updateBadges() {
    const top = $('badge-top'), bot = $('badge-bottom');
    if (mode === 'combat' && combat) {
      const a = { n: combat.aName, l: combat.aLevel, av: combat.aAvatar }, b = { n: combat.bName, l: combat.bLevel, av: combat.bAvatar };
      const me = combat.youSide === 0 ? a : b, foe = combat.youSide === 0 ? b : a;
      setBadge(bot, me.n, me.l, me.av, false);
      setBadge(top, foe.n, foe.l, foe.av, true);
    } else if (scout) {
      setBadge(bot, scout.name, scout.level, scout.avatar, true);
      top.classList.add('hidden');
    } else if (S) {
      const me = S.players.find(p => p.id === myPid);
      if (me) setBadge(bot, me.name, me.level, me.avatar, false);
      top.classList.add('hidden');
    }
  }

  function renderShop() {
    const box = $('shopcards'); box.innerHTML = '';
    S.you.shop.forEach((card, i) => {
      if (!card) { box.appendChild(el('div', 'card empty', '&nbsp;')); return; }
      const cd = el('div', `card c${card.cost}`);
      cd.innerHTML = `<span class="cost">${card.cost}💰</span><img draggable="false" src="${D.SPRITE(card.dex)}"><div class="nm">${card.name}</div>
        <div class="ty">${card.types.map(t => `<span style="background:${TYPE_COLORS[t]}">${t}</span>`).join('')}${card.cls ? `<span style="background:${TYPE_COLORS[card.cls]}">${card.cls}</span>` : ''}</div>`;
      tt(cd, () => unitTip({ ...card, star: 1 }));
      cd.onpointerdown = (e) => { if (canAct()) startDrag(e, { kind: 'shop', slot: i }, cd, () => client.send({ type: 'buy', slot: i })); };
      box.appendChild(cd);
    });
  }

  function renderPlayers() {
    const box = $('playerlist'); box.innerHTML = '';
    S.players.slice().sort((a, b) => b.hp - a.hp || (a.alive ? -1 : 1)).forEach(p => {
      const d = el('div', 'pl' + (p.alive ? '' : ' dead') + (p.alive ? ' scoutable' : ''));
      if (p.alive) {
        tt(d, mode === 'combat' ? '👁 Clic para ver su combate en vivo' : (p.id === myPid ? 'Tu tablero' : '🔍 Clic para espiar su tablero'));
        d.onclick = () => {
          if (mode === 'combat') client.send({ type: 'watch', pid: p.id });
          else if (p.id === myPid) exitScout();
          else if (mode === 'plan' || mode === 'safari') { scoutWanted = true; client.send({ type: 'scout', pid: p.id }); }
        };
      }
      d.innerHTML = `<div class="nm"><span>${esc(p.name)}${p.id === myPid ? ' ⭐' : ''}${p.connected ? '' : ' 🔌'}</span><span>${p.alive ? p.hp + '❤' : '#' + p.place}</span></div>
        <div class="hpbar"><i style="width:${p.hp}%"></i></div>
        <div class="mini">${p.boardPreview.map(u => `<img draggable="false" src="${D.SPRITE(u.dex)}" title="${u.star}★">`).join('')}</div>
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
      tt(d, `<div class="tname">${chip(k)} ${k} (${v.count})</div>` + def.desc.map((t, i) =>
        `<div class="${v.count >= def.thresholds[i] ? 'gold' : 'trole'}">(${def.thresholds[i]}) ${esc(t)}</div>`).join(''));
      box.appendChild(d);
    });
    if (!syns.length) box.innerHTML = '<div style="color:var(--dim);font-size:12px">Coloca unidades en el campo</div>';
  }

  // ---------- objetos ----------
  function renderItems() {
    const cb = $('complist'); cb.innerHTML = '';
    S.you.components.forEach((k, i) => {
      const d = el('div', 'itm' + (selComp === i ? ' sel' : ''), COMPONENTS[k].emoji);
      tt(d, compTip(k));
      d.onpointerdown = (e) => { if (canAct()) startDrag(e, { kind: 'comp', idx: i }, d, () => compClick(i)); };
      cb.appendChild(d);
    });
    if (!S.you.components.length) cb.innerHTML = '<span style="font-size:11px;color:var(--dim)">Gana componentes en rondas PvE</span>';
    const ib = $('itemlist'); ib.innerHTML = '';
    S.you.fullItems.forEach((k, i) => {
      const d = el('div', 'itm' + (selItem === i ? ' sel' : ''), ITEMS[k].emoji);
      tt(d, itemTip(k));
      d.onpointerdown = (e) => { if (canAct()) startDrag(e, { kind: 'item', idx: i }, d, () => itemClick(i)); };
      ib.appendChild(d);
    });
    if (!S.you.fullItems.length) ib.innerHTML = '<span style="font-size:11px;color:var(--dim)">Combina 2 componentes (o equípalos sueltos)</span>';
    $('stonebox').classList.toggle('hidden', S.you.stones <= 0);
    $('stonecount').textContent = '×' + S.you.stones;
  }
  function compClick(i) {
    if (selComp === null) { selComp = i; selItem = null; toast('Arrastra o haz clic en otra cosa: otro componente = combinar · una unidad = equipar', 2600); }
    else if (selComp === i) selComp = null;
    else { client.send({ type: 'combine', i: selComp, j: i, ki: S.you.components[selComp], kj: S.you.components[i] }); selComp = null; }
    renderItems();
  }
  function itemClick(i) {
    selItem = selItem === i ? null : i; selComp = null;
    renderItems();
    if (selItem !== null) toast('Haz clic en una unidad tuya para equipar (o arrástralo)', 2000);
  }
  $('btn-stone').onclick = () => { if (sel) client.send({ type: 'stone', iid: sel.iid }); };

  // ---------- tablero ----------
  function clearBoardUnits() { boardEl.querySelectorAll('.unit,.float').forEach(e => e.remove()); }
  function ensureCells() {
    if (boardEl.querySelector('.cell')) return;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 7; c++) {
      const cell = el('div', 'cell' + (r >= 4 ? ' own' : ''));
      cell.style.left = cellX(r, c) + 'px'; cell.style.top = cellY(r) + 'px';
      cell.dataset.r = r; cell.dataset.c = c;
      cell.onclick = () => { if (!justDragged()) boardClick(r, c); };
      boardEl.appendChild(cell);
    }
  }

  // ---------- scouting ----------
  function renderScoutBoard() {
    if (!scout) return;
    ensureCells(); clearBoardUnits();
    const ct = $('combat-title');
    ct.classList.remove('hidden');
    ct.innerHTML = `🔍 Tablero de <b>${esc(scout.name)}</b> · Nv ${scout.level} · ${scout.hp}❤
      <button id="scout-prev" title="Anterior">‹</button><button id="scout-next" title="Siguiente">›</button><button id="scout-back">Volver (Esc)</button>`;
    $('scout-back').onclick = exitScout;
    $('scout-prev').onclick = () => cycleScout(-1);
    $('scout-next').onclick = () => cycleScout(1);
    for (let ownR = 0; ownR < 4; ownR++) for (let c = 0; c < 7; c++) {
      const u = scout.board[ownR][c];
      if (u) { const d = planUnitEl(u, 7 - ownR, c, true); boardEl.appendChild(d); }
    }
    const box = $('bench'); box.innerHTML = '';
    scout.bench.forEach(u => {
      const slot = el('div', 'bslot');
      if (u) { slot.innerHTML = `<div class="stars">${'★'.repeat(u.star)}</div><img draggable="false" src="${D.SPRITE(u.dex)}">`; tt(slot, () => unitTip(u)); }
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
    scoutWanted = true;
    client.send({ type: 'scout', pid: others[(idx + dir + others.length) % others.length].id });
  }
  function exitScout() {
    scoutWanted = false;
    if (!scout) return;
    scout = null;
    $('combat-title').classList.add('hidden');
    if (S) { renderSynergies(); if (mode === 'plan') renderPlanBoard(); updateBadges(); }
  }

  // ---------- planificación ----------
  // clic en unidad = SOLO ver información (mover es siempre arrastrando, estilo TFT)
  function boardClick(r, c) {
    if (scout || mode !== 'plan' || !S || !S.you.alive || r < 4) return;
    const ownR = 7 - r;
    const u = S.you.board[ownR][c];
    if (selItem !== null && u) { client.send({ type: 'equip', iid: u.iid, idx: selItem, k: S.you.fullItems[selItem] }); selItem = null; renderItems(); return; }
    if (selComp !== null && u) { client.send({ type: 'equipComp', iid: u.iid, idx: selComp, k: S.you.components[selComp] }); selComp = null; renderItems(); return; }
    if (u) { sel = { iid: u.iid, unit: u }; updateSelVisual(); showUnitInfo(u); }
    else { sel = null; updateSelVisual(); }
  }
  function benchClick(i) {
    if (scout || !S || !S.you.alive || mode === 'safari') return;
    const u = S.you.bench[i];
    if (selItem !== null && u) { client.send({ type: 'equip', iid: u.iid, idx: selItem, k: S.you.fullItems[selItem] }); selItem = null; renderItems(); return; }
    if (selComp !== null && u) { client.send({ type: 'equipComp', iid: u.iid, idx: selComp, k: S.you.components[selComp] }); selComp = null; renderItems(); return; }
    if (u) { sel = { iid: u.iid, unit: u }; if (mode === 'plan') updateSelVisual(); showUnitInfo(u); }
    else { sel = null; if (mode === 'plan') updateSelVisual(); }
  }
  function renderPlanBoard() {
    ensureCells();
    if (!scout) $('combat-title').classList.add('hidden');
    clearBoardUnits();
    for (let ownR = 0; ownR < 4; ownR++) for (let c = 0; c < 7; c++) {
      const u = S.you.board[ownR][c];
      if (u) boardEl.appendChild(planUnitEl(u, 7 - ownR, c, false));
    }
    renderBench();
    $('sellzone').classList.toggle('show', !!sel);
    if (sel) $('sellval').textContent = '+' + sellVal(sel.unit) + ' oro';
  }
  function sellVal(u) { const c = u.cost; return u.star === 1 ? c : u.star === 2 ? c * 3 - 1 : c * 6; }
  function planUnitEl(u, r, c, readOnly) {
    const d = el('div', 'unit' + (sel && sel.iid === u.iid ? ' sel' : ''));
    d.style.left = cellX(r, c) + 'px'; d.style.top = (cellY(r) - 10) + 'px';
    d.dataset.iid = u.iid; d.dataset.r = r; d.dataset.c = c;
    d.innerHTML = `<div class="stars">${'★'.repeat(u.star)}</div><img class="sprite" draggable="false" src="${D.SPRITE(u.dex)}">
      <div class="itemdots">${u.items.map(k => ITEMS[k] ? ITEMS[k].emoji : (COMPONENTS[k] ? COMPONENTS[k].emoji : '')).join('')}${u.stone ? '🪨' : ''}</div>`;
    tt(d, () => unitTip(u));
    if (!readOnly) d.onpointerdown = (e) => { e.stopPropagation(); if (mode === 'plan' && !scout && S.you.alive) startDrag(e, { kind: 'unit', unit: u }, d, () => boardClick(r, c)); };
    return d;
  }
  function renderBench() {
    const box = $('bench'); box.innerHTML = '';
    S.you.bench.forEach((u, i) => {
      const slot = el('div', 'bslot' + (sel && u && sel.iid === u.iid ? ' sel' : ''));
      slot.dataset.i = i;
      if (u) {
        slot.dataset.iid = u.iid;
        slot.innerHTML = `<div class="stars">${'★'.repeat(u.star)}</div><img draggable="false" src="${D.SPRITE(u.dex)}">`;
        tt(slot, () => unitTip(u));
        slot.onpointerdown = (e) => { if (canAct() && mode !== 'safari') startDrag(e, { kind: 'unit', unit: u }, slot, () => benchClick(i)); };
      } else {
        slot.onclick = () => { if (!justDragged()) benchClick(i); };
      }
      box.appendChild(slot);
    });
  }
  function updateSelVisual() { if (S && mode === 'plan' && !scout) renderPlanBoard(); }
  function showUnitInfo(u) {
    const box = $('unitinfo'); box.classList.remove('hidden');
    box.innerHTML = unitTip(u);
  }
  $('sellzone').onclick = () => { if (sel && !justDragged()) { client.send({ type: 'sell', iid: sel.iid }); sel = null; } };

  // ---------- combate ----------
  const unitEls = new Map();
  function renderCombat(snap) {
    ensureCells();
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
        if (u.srcIid && u.side === mySide) d.dataset.iid = u.srcIid; // permite soltar objetos sobre tus unidades en combate
        const its = (u.items || []).map(k => ITEMS[k] ? ITEMS[k].emoji : (COMPONENTS[k] ? COMPONENTS[k].emoji : '')).join('');
        d.innerHTML = `<div class="stars">${'★'.repeat(u.star)}</div>
          <div class="bars"><div class="hpb"><i></i></div><div class="enb"><i></i></div></div>
          <img class="sprite" draggable="false" src="${D.SPRITE(u.dex)}"><div class="sts"></div>
          <div class="citems">${its}</div>`;
        tt(d, () => `<div class="tname">${esc(u.name)} <span class="gold">${'★'.repeat(u.star)}</span></div>` +
          ((u.items || []).length ? `<div class="tab">${u.items.map(k => itemMini(k)).join('<br>')}</div>` : '<div class="trole">Sin objetos</div>'));
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

  // ---------- modales ----------
  let modalToken = 0;
  function modal(html, opts = {}) {
    const my = ++modalToken;
    $('modal').innerHTML = html;
    $('overlay').classList.add('show');
    $('overlay').dataset.sticky = opts.sticky ? '1' : '';
    if (opts.autoclose) setTimeout(() => { if (modalToken === my) closeModal(); }, opts.autoclose);
  }
  function closeModal() { $('overlay').classList.remove('show'); }
  $('overlay').onclick = (e) => { if (e.target === $('overlay') && !$('overlay').dataset.sticky) closeModal(); };

  function showResults(msg) {
    unitEls.forEach(d => d.remove()); unitEls.clear();
    const lines = msg.results.map(r => `<div class="resultline">⚔ <b>${esc(r.a)}</b> vs <b>${esc(r.b)}</b> → gana <b style="color:var(--gold)">${esc(r.winner)}</b>${r.dmg ? ` (${r.dmg} de daño)` : ''}</div>`).join('');
    modal(`<h3>Resultados ronda ${msg.label}</h3>${lines}`, { autoclose: 3000 });
  }
  function showGameOver(msg) {
    const lines = msg.standings.map(s => `<div class="resultline">${s.place === 1 ? '🏆' : '#' + s.place} <b>${esc(s.name)}</b> · ${s.wins} victorias</div>`).join('');
    modal(`<h3>🏁 Fin de la partida</h3>${lines}<br>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:10px">
        <button onclick="location.reload()" style="font-size:16px;padding:10px 22px">🏠 Volver al inicio</button>
      </div>`, { sticky: true });
  }
  function checkChoices() {
    if (!S || !S.you.pendingChoices.length) return;
    const ch = S.you.pendingChoices[0];
    if (ch.type === 'eevee') {
      const v = D.EEVEE_VARIANTS;
      modal(`<h3>✨ ¡Eevee va a evolucionar! Elige:</h3><div class="choices">` +
        Object.entries(v).map(([k, x]) => `<div class="choice" data-v="${k}"><img draggable="false" src="${D.SPRITE(x.dex)}"><b>${x.name}</b><br><span style="font-size:11px;color:var(--dim)">${x.types[0]} · ${x.cls}<br>${x.ab.name}</span></div>`).join('') + '</div>');
      $('modal').querySelectorAll('.choice').forEach(c => c.onclick = () => { client.send({ type: 'eevee', iid: ch.iid, variant: c.dataset.v }); closeModal(); });
    } else if (ch.type === 'mewcopy') {
      const units = [];
      S.you.board.forEach(row => row.forEach(u => { if (u) units.push(u); }));
      S.you.bench.forEach(u => { if (u) units.push(u); });
      modal(`<h3>🧬 Mew te permite copiar una de tus unidades (recibes 1 copia 1★)</h3><div class="choices">` +
        units.map(u => `<div class="choice" data-iid="${u.iid}"><img draggable="false" src="${D.SPRITE(u.dex)}"><b>${u.name}</b></div>`).join('') + '</div>');
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
      d.innerHTML = `${u.takenBy ? `<div class="takenby">${esc(nameOf(u.takenBy, msg))}</div>` : ''}<img draggable="false" src="${D.SPRITE(u.dex)}"><div><b>${u.name}</b> · ${u.cost}💰</div><div class="carry">${carryTxt}</div>`;
      tt(d, (u.carry.full ? itemTip(u.carry.full) : compTip(u.carry.comp)));
      d.onclick = () => { if (released && !iPicked && !u.takenBy) client.send({ type: 'safariPick', idx: i }); };
      grid.appendChild(d);
    });
    $('safari-timer').textContent = released && !iPicked ? '¡Elige un Pokémon!' : iPicked ? 'Capturado ✔' : 'Espera tu turno…';
    safariEndsAt = msg.endsAt;
  }
  function nameOf(pid, msg) { const o = msg.order.find(x => x.id === pid); return o ? o.name : '?'; }

  // ---------- botones ----------
  $('btn-xp').onclick = () => client.send({ type: 'xp' });
  $('btn-reroll').onclick = () => client.send({ type: 'reroll' });
  $('btn-lock').onclick = () => client.send({ type: 'lock' });

  // ---------- timer ----------
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

  // teclas: D = reroll, F = xp, E = vender selección, Esc = cancelar/volver
  document.addEventListener('keydown', (e) => {
    if (!S) return;
    if (e.key === 'Escape') { if (scout) { exitScout(); return; } sel = null; selItem = null; selComp = null; renderAll(); return; }
    if (mode !== 'plan' && mode !== 'combat') return;
    if (e.key === 'd' || e.key === 'D') client.send({ type: 'reroll' });
    if (e.key === 'f' || e.key === 'F') client.send({ type: 'xp' });
    if ((e.key === 'e' || e.key === 'E') && sel) { client.send({ type: 'sell', iid: sel.iid }); sel = null; }
  });
})();
