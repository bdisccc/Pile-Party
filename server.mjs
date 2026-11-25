import http from 'node:http';
import crypto from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const rooms = new Map();
const CARD_BACKS = ['#ffcf60', '#89def1', '#ffadd2', '#b5e6ae'];
const ICONS = [
  '🦊','🐼','🐧','🦋','🐸','🦄','🐝','🐢','🐬','🦀',
  '🍓','🍉','🍋','🍍','🥑','🍕','🍩','🍪','🧁','🍿',
  '🎸','🎹','🎲','🎨','🎧','🎮','🎯','🎪','🪁','🎈',
  '🚀','🛸','🚲','🚕','🚂','⛵','🏰','🏝️','🌋','🌈',
  '💎','🔮','🧸','🪩','👑','🧩','🕶️','👟','🎩','🪴'
];

const rand = (n) => crypto.randomInt(n);
const shuffled = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const cleanName = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
const code = () => crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
const token = () => crypto.randomBytes(24).toString('hex');
const json = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(data));
};
const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };

function findMember(room, secret) {
  const member = room.players.find((p) => p.token === secret);
  if (!member) fail(401, 'Invalid or expired player session.');
  return member;
}
function getRoom(roomCode) {
  const room = rooms.get(String(roomCode ?? '').toUpperCase());
  if (!room) fail(404, 'Room not found. Check your six-character code.');
  return room;
}
function cardView(card) {
  return { id: card.id, setId: card.setId, kind: card.kind, art: card.art, tint: CARD_BACKS[card.tint] };
}
function complete(pile) {
  return pile.length === 4 && pile.every((card) => card.setId === pile[0].setId);
}
function snapshot(room, secret) {
  const me = findMember(room, secret);
  return {
    code: room.code,
    status: room.status,
    mode: room.mode,
    isSolo: room.isSolo,
    hostId: room.hostId,
    startsAt: room.startsAt,
    endedAt: room.endedAt,
    winnerId: room.winnerId,
    center: room.status === 'lobby' ? [] : room.center.map(cardView),
    customPack: room.customPack.map(({ name, image }) => ({ name, image })),
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.id === room.hostId,
      connected: [...room.subscribers].some((s) => s.token === p.token),
      completed: p.piles ? p.piles.filter(complete).length : 0
    })),
    you: {
      id: me.id,
      name: me.name,
      isHost: me.id === room.hostId,
      pendingPickup: me.pendingPickup,
      piles: me.piles ? me.piles.map((p) => ({ completed: complete(p), cards: p.map(cardView) })) : []
    }
  };
}
function broadcast(room) {
  for (const subscriber of [...room.subscribers]) {
    try {
      subscriber.res.write(`event: update\ndata: ${JSON.stringify(snapshot(room, subscriber.token))}\n\n`);
    } catch { room.subscribers.delete(subscriber); }
  }
}
function addPlayer(room, name) {
  const p = { id: crypto.randomUUID(), name, token: token(), piles: null, pendingPickup: null };
  room.players.push(p);
  return p;
}
function createRoom({ name, mode, solo }) {
  if (!name) fail(400, 'Please enter your name.');
  if (mode !== 'classic' && mode !== 'chaos') fail(400, 'Unsupported game mode.');
  if (rooms.size >= 1000) fail(503, 'Room capacity reached. Try again later.');
  let roomCode = code();
  while (rooms.has(roomCode)) roomCode = code();
  const room = {
    code: roomCode, mode, isSolo: !!solo, status: 'lobby', hostId: null,
    players: [], center: [], customPack: [], startsAt: null, endedAt: null,
    winnerId: null, subscribers: new Set(), touchedAt: Date.now()
  };
  const owner = addPlayer(room, name);
  room.hostId = owner.id;
  rooms.set(roomCode, room);
  if (room.isSolo) start(room);
  return { room, player: owner };
}
function start(room) {
  if (room.status !== 'lobby' && room.status !== 'finished') fail(409, 'This game is already running.');
  if (!room.isSolo && room.players.length < 2) fail(409, 'Invite at least one more player before starting.');
  const setCount = room.players.length * 6 + (room.mode === 'chaos' ? 2 : 1);
  const sets = [];
  for (let i = 0; i < setCount; i++) {
    if (i < room.customPack.length) sets.push({ id: `custom-${i}`, kind: 'image', art: room.customPack[i].image });
    else sets.push({ id: `default-${i}`, kind: 'emoji', art: ICONS[(i - room.customPack.length) % ICONS.length] });
  }
  const deck = shuffled(sets.flatMap((set) => Array.from({ length: 4 }, (_, tint) => ({
    id: crypto.randomUUID(), setId: set.id, kind: set.kind, art: set.art, tint
  }))));
  for (const p of room.players) {
    p.piles = Array.from({ length: 6 }, () => deck.splice(0, 4));
    p.pendingPickup = null;
  }
  room.center = deck;
  room.status = 'playing';
  room.startsAt = Date.now() + 3000;
  room.endedAt = null;
  room.winnerId = null;
  broadcast(room);
}
function validateAction(room, player) {
  if (room.status !== 'playing') fail(409, 'The game is not in progress.');
  if (Date.now() < room.startsAt) fail(409, 'The countdown is still running.');
  if (!player.piles) fail(409, 'Your cards are not ready.');
}
function discard(room, player, pileIndex, cardId) {
  validateAction(room, player);
  if (player.pendingPickup !== null) fail(409, 'Pick up one center card before discarding another.');
  if (!Number.isInteger(pileIndex) || pileIndex < 0 || pileIndex > 5) fail(400, 'Invalid pile.');
  const pile = player.piles[pileIndex];
  if (complete(pile)) fail(409, 'Completed piles are locked.');
  const index = pile.findIndex((card) => card.id === cardId);
  if (index === -1) fail(409, 'Card not found in that pile.');
  const [card] = pile.splice(index, 1);
  room.center.push(card);
  player.pendingPickup = pileIndex;
  broadcast(room);
}
function take(room, player, cardId) {
  validateAction(room, player);
  if (player.pendingPickup === null) fail(409, 'Discard a card from one of your piles first.');
  const index = room.center.findIndex((card) => card.id === cardId);
  if (index === -1) fail(409, 'That center card has already been taken. Pick another.');
  const [card] = room.center.splice(index, 1);
  player.piles[player.pendingPickup].push(card);
  player.pendingPickup = null;
  if (player.piles.every(complete)) {
    room.status = 'finished'; room.winnerId = player.id; room.endedAt = Date.now();
  }
  broadcast(room);
}
function validatePack(images) {
  if (!Array.isArray(images) || images.length > 44) fail(400, 'Upload up to 44 custom matching-set images.');
  return images.map((x, i) => {
    const image = String(x?.image ?? '');
    const name = cleanName(x?.name) || `Custom Set ${i + 1}`;
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 180000) {
      fail(400, `Invalid or oversized image for set ${i + 1}. Each image must be under about 130 KB.`);
    }
    return { name, image };
  });
}
async function bodyJSON(req) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 12 * 1024 * 1024) fail(413, 'Upload too large (12 MB maximum per request).');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { fail(400, 'Invalid JSON request.'); }
}
const MIME = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };

async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const route = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})(?:\/(join|pack|start|discard|take|reset|events))?$/i);
    if (req.method === 'POST' && url.pathname === '/api/rooms') {
      const input = await bodyJSON(req);
      const { room, player } = createRoom({ name: cleanName(input.name), mode: input.mode || 'classic', solo: input.solo });
      return json(res, 201, { code: room.code, token: player.token });
    }
    if (route) {
      const room = getRoom(route[1]);
      room.touchedAt = Date.now();
      const action = route[2] || '';
      if (req.method === 'POST' && action === 'join') {
        const input = await bodyJSON(req);
        const name = cleanName(input.name);
        if (!name) fail(400, 'Please enter your name.');
        if (room.isSolo) fail(409, 'This is a solo practice room.');
        if (room.status !== 'lobby') fail(409, 'This game has already started.');
        if (room.players.length >= 7) fail(409, 'This room is full (7 players maximum).');
        const player = addPlayer(room, name);
        broadcast(room);
        return json(res, 201, { code: room.code, token: player.token });
      }
      const secret = req.method === 'GET' ? url.searchParams.get('token') : null;
      if (req.method === 'GET' && !action) return json(res, 200, snapshot(room, secret));
      if (req.method === 'GET' && action === 'events') {
        findMember(room, secret);
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform',
          'connection': 'keep-alive', 'x-accel-buffering': 'no', 'x-content-type-options': 'nosniff'
        });
        const subscriber = { token: secret, res };
        room.subscribers.add(subscriber);
        res.write(`event: update\ndata: ${JSON.stringify(snapshot(room, secret))}\n\n`);
        broadcast(room);
        const pulse = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 22000);
        req.on('close', () => { clearInterval(pulse); room.subscribers.delete(subscriber); broadcast(room); });
        return;
      }
      if (req.method === 'POST') {
        const input = await bodyJSON(req);
        const player = findMember(room, input.token);
        if (action === 'pack') {
          if (player.id !== room.hostId) fail(403, 'Only the host can edit custom sets.');
          if (room.status !== 'lobby') fail(409, 'Custom sets can only be changed in the lobby.');
          room.customPack = validatePack(input.images);
          broadcast(room);
          return json(res, 200, { ok: true, count: room.customPack.length });
        }
        if (action === 'start' || action === 'reset') {
          if (player.id !== room.hostId) fail(403, 'Only the host can start a round.');
          if (action === 'reset' && room.status !== 'finished') fail(409, 'You can rematch after a round finishes.');
          start(room);
          return json(res, 200, { ok: true });
        }
        if (action === 'discard') {
          discard(room, player, input.pileIndex, input.cardId);
          return json(res, 200, { ok: true });
        }
        if (action === 'take') {
          take(room, player, input.cardId);
          return json(res, 200, { ok: true });
        }
      }
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'API route not found.' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed.' });
    const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.resolve(root, `.${requestedPath}`);
    if (!(file === root || file.startsWith(root + path.sep))) return json(res, 403, { error: 'Forbidden' });
    const s = await stat(file).catch(() => null);
    if (!s?.isFile()) return json(res, 404, { error: 'File not found.' });
    res.writeHead(200, { 'content-type': `${MIME[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'x-content-type-options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    res.end(await readFile(file));
  } catch (e) {
    if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : 'Internal server error.' });
    else res.end();
  }
}

export const createAppServer = () => http.createServer(handler);

// Room state intentionally stays in memory for the starter project.
const tidy = setInterval(() => {
  const threshold = Date.now() - 8 * 60 * 60 * 1000;
  for (const [key, room] of rooms) {
    if (room.touchedAt < threshold && room.subscribers.size === 0) rooms.delete(key);
  }
}, 30 * 60 * 1000);
tidy.unref();

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createAppServer().listen(port, '0.0.0.0', () => {
    console.log(`Pile Party running at http://localhost:${port}`);
  });
}
