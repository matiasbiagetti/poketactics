// Test de integración headless: partida completa con 4 bots y reloj virtual
// --- reloj virtual ---
let NOW = 0, TID = 1;
const tasks = []; // {id, at, fn, interval}
global.setTimeout = (fn, ms) => { const id = TID++; tasks.push({ id, at: NOW + (ms || 0), fn }); return id; };
global.setInterval = (fn, ms) => { const id = TID++; tasks.push({ id, at: NOW + (ms || 1), fn, interval: ms || 1 }); return id; };
global.clearTimeout = global.clearInterval = (id) => { const i = tasks.findIndex(t => t.id === id); if (i >= 0) tasks.splice(i, 1); };
const realNow = Date.now; Date.now = () => NOW;
function advance(ms) {
  const end = NOW + ms;
  let guard = 0;
  while (guard++ < 200000) {
    tasks.sort((a, b) => a.at - b.at);
    const t = tasks[0];
    if (!t || t.at > end) break;
    NOW = Math.max(NOW, t.at);
    if (t.interval) t.at = NOW + t.interval; else tasks.shift();
    try { t.fn(); } catch (e) { console.log('ERROR en tarea:', e); fails++; tasks.length = 0; break; }
  }
  NOW = end;
}

// --- entorno navegador falso ---
global.window = {};
window.PTDATA = require('./data.js');
window.PTCORE = require('./core.js');
global.Peer = class {
  constructor() { this.h = {}; }
  on(ev, fn) { this.h[ev] = fn; if (ev === 'open') setTimeout(fn, 5); }
  destroy() {}
  connect() { return { on() {}, send() {}, open: false }; }
};
require('./game.js');
const G = window.PTGAME, C = window.PTCORE, D = window.PTDATA;

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL:', msg); } };

// --- bots ---
const log = { results: 0, safaris: 0, combats: 0, gameover: null, toasts: [] };
function makeBot(name) {
  const bot = { name, pid: null, state: null, conn: null };
  bot.conn = {
    metadata: null,
    send(msg) { onBotMsg(bot, msg); },
    on() {},
  };
  return bot;
}
function botAct(bot) {
  const S = bot.state; if (!S || !S.you.alive || S.state !== 'plan') return;
  const send = (m) => host._onMsg(bot.pid, m, bot.conn);
  // comprar lo que pueda
  for (let i = 0; i < 5; i++) {
    const c = S.you.shop[i];
    if (c && S.you.gold >= c.cost && S.you.bench.some(b => !b)) { send({ type: 'buy', slot: i }); break; }
  }
  // subir de nivel a veces
  if (S.you.gold > 30) send({ type: 'xp' });
  // colocar del banco al campo
  const S2 = bot.state; // tras sync
  if (S2.you.boardCount < S2.you.level) {
    const bi = S2.you.bench.findIndex(b => b);
    if (bi >= 0) {
      for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) {
        if (!S2.you.board[r][c]) { send({ type: 'move', iid: S2.you.bench[bi].iid, to: 'board', r, c }); return; }
      }
    }
  }
  // combinar componentes y equipar
  if (S2.you.components.length >= 2) send({ type: 'combine', i: 0, j: 1 });
  if (S2.you.fullItems.length && S2.you.boardCount > 0) {
    outer: for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) {
      const u = S2.you.board[r][c];
      if (u && u.items.length < 3) { send({ type: 'equip', iid: u.iid, idx: 0 }); break outer; }
    }
  }
}
function onBotMsg(bot, msg) {
  if (msg.type === 'joined') bot.pid = msg.pid;
  if (msg.type === 'state') { bot.state = msg; setTimeout(() => botAct(bot), 50 + Math.random() * 200); }
  if (msg.type === 'combat_results') log.results++;
  if (msg.type === 'combat_start') log.combats++;
  if (msg.type === 'safari' && bot === bots[0]) log.safaris++;
  if (msg.type === 'safari') {
    const me = msg.order.find(o => o.id === bot.pid);
    const myIdx = msg.order.findIndex(o => o.id === bot.pid);
    if (me && !me.picked && myIdx < msg.released) {
      const free = msg.units.map((u, i) => i).filter(i => !msg.units[i].takenBy);
      if (free.length) setTimeout(() => host._onMsg(bot.pid, { type: 'safariPick', idx: free[0] }, bot.conn), 100);
    }
  }
  if (msg.type === 'gameover') log.gameover = msg;
  if (msg.type === 'toast') log.toasts.push(msg.msg);
  if (msg.type === 'state' && msg.you.pendingChoices.length) {
    const ch = msg.you.pendingChoices[0];
    if (ch.type === 'eevee') setTimeout(() => host._onMsg(bot.pid, { type: 'eevee', iid: ch.iid, variant: 'jolteon' }, bot.conn), 80);
    if (ch.type === 'mewcopy') {
      const u = msg.you.bench.find(Boolean) || msg.you.board.flat().find(Boolean);
      if (u) setTimeout(() => host._onMsg(bot.pid, { type: 'mewcopy', iid: u.iid }, bot.conn), 80);
    }
  }
}

// --- montar partida: host (bot 0 local) + 3 invitados ---
const hostBot = makeBot('HostBot'); hostBot.pid = 'host';
let host;
host = new G.GameHost('HostBot', (msg) => onBotMsg(hostBot, msg), () => {});
advance(50);
const bots = [hostBot];
for (let i = 1; i <= 3; i++) {
  const b = makeBot('Bot' + i);
  host._onMsg('tmp' + i, { type: 'join', name: b.name }, b.conn);
  b.conn.metadata = { pid: b.pid };
  // registrar la conexión para mensajes futuros
  host.players.get(b.pid).conn = b.conn;
  bots.push(b);
}
advance(100);
ok(host.players.size === 4, `4 jugadores (hay ${host.players.size})`);

host._onMsg('host', { type: 'start' }, host.local);
advance(200);
ok(host.state === 'plan', 'partida empieza en plan');

// avanzar hasta 40 minutos virtuales o fin de partida
let minutes = 0;
while (!log.gameover && minutes < 60) { advance(60000); minutes++; }

ok(log.gameover, `la partida termina (fase ${host.phase}, ronda ${host.roundInPhase}, ${minutes} min virtuales)`);
if (log.gameover) {
  ok(log.gameover.standings.length === 4, 'clasificación de 4');
  ok(log.gameover.standings[0].place === 1, 'hay un campeón');
  console.log('Clasificación:', log.gameover.standings.map(s => `#${s.place} ${s.name} (${s.wins}W)`).join(' · '));
}
console.log(`Combates vistos: ${log.combats} · Resultados: ${log.results} · Safaris: ${log.safaris}`);
console.log('Botines de ejemplo:', log.toasts.slice(0, 5));
ok(log.combats > 10, 'hubo suficientes combates');
ok(log.safaris >= 1, 'hubo al menos un safari');
// pool no negativo
ok(Object.values(host.pool).every(v => v >= 0), 'pool nunca negativo');

console.log(fails === 0 ? '\n✔ INTEGRACIÓN OK' : `\n✘ ${fails} fallos`);
process.exit(fails ? 1 : 0);
