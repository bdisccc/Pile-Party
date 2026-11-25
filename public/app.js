const app = document.querySelector('#app');
const toastEl = document.querySelector('#toast');
const SESSION_KEY = 'pile-party-session-v1';
const state = { view: 'home', room: null, token: null, data: null, stream: null, selectedPile: null, busy: false };

const esc = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
const initials = (name) => (name || '?').slice(0, 1).toUpperCase();
const escapeAttr = esc;

let toastTimeout;
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toastEl.classList.remove('show'), 3500);
}
async function api(url, data) {
  const options = data === undefined ? {} : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data)
  };
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Server returned HTTP ${response.status}`);
  return body;
}
const inRoom = () => !!(state.room && state.token);
const endpoint = (action = '') => `/api/rooms/${state.room}${action ? '/' + action : ''}`;
const send = (action, data = {}) => api(endpoint(action), { token: state.token, ...data });
function clearSession() {
  state.stream?.close();
  state.stream = null;
  state.room = null; state.token = null; state.data = null;
  state.selectedPile = null;
  localStorage.removeItem(SESSION_KEY);
}
async function connect(code, token) {
  clearSession();
  state.room = code; state.token = token;
  localStorage.setItem(SESSION_KEY, JSON.stringify({ code, token }));
  try {
    state.data = await api(endpoint() + `?token=${encodeURIComponent(token)}`);
    state.view = 'room';
    render();
    const stream = new EventSource(endpoint('events') + `?token=${encodeURIComponent(token)}`);
    state.stream = stream;
    stream.addEventListener('update', (event) => {
      if (state.stream !== stream) return;
      state.data = JSON.parse(event.data);
      if (state.data.you.pendingPickup !== null) state.selectedPile = state.data.you.pendingPickup;
      if (state.selectedPile !== null && state.data.you.piles[state.selectedPile]?.completed) state.selectedPile = null;
      if (state.view === 'room') render();
    });
    stream.onerror = () => {
      // EventSource automatically reconnects. Existing room session is retained.
      if (state.stream === stream) toast('Connection interrupted. Trying to reconnect…');
    };
  } catch (error) {
    clearSession(); state.view = 'home'; render(); throw error;
  }
}
async function perform(action, payload) {
  if (state.busy) return;
  state.busy = true;
  try { await send(action, payload); }
  catch (error) { toast(error.message); }
  finally { state.busy = false; }
}
function header() {
  return `<header class="nav"><div class="logo" role="button" tabindex="0" data-action="home"><span class="logo-mark">✦</span><span>pile party<span style="color:#7955fa">.</span></span></div>
    <span class="top-info">THE FASTEST HANDS WIN ✦</span><button class="small-btn" data-action="howto">How to play <span aria-hidden="true">?</span></button></header>`;
}
function layout(content) {
  app.innerHTML = `<div class="shell">${header()}${content}<footer class="footer">An original fan-made mechanics study. No official game artwork used.</footer></div>`;
}
function homeHTML() {
  return `<main class="hero"><section><span class="eyebrow">✦ A GAME NIGHT FAVORITE</span>
    <h1>Grab.<br/>Swap.<br/><em>Match!</em></h1>
    <p>Six piles. Four cards in each. One frantic race to make every pile match. Play live with friends or upload your own ridiculously fun card art.</p>
    <div class="hero-actions"><button class="btn btn-primary" data-action="create">✦ Create Game</button><button class="btn btn-white" data-action="join">Join Game →</button></div>
    <div class="hero-foot"><span>👥 2–7 players</span><span class="bullet"></span><span>⚡ Live multiplayer</span><span class="bullet"></span><span>🎨 Custom pile images</span></div>
    <div style="margin-top:30px"><button class="text-btn" data-action="practice">Try solo practice instead ↗</button></div>
    </section><div class="art" aria-hidden="true"><span class="mini-art a">🦊</span><span class="mini-art b">🍓</span><span class="mini-art c">🎮</span><span class="mini-art d">🦄</span><div class="giant">🃏</div><span class="burst">MATCH 'EM ALL!</span></div></main>`;
}
function joinHTML() {
  return `<section class="panel"><button class="back" data-action="home">← Back to Home</button>
    <span class="eyebrow">✦ GAME NIGHT AWAITS</span><h1>Join a Game</h1><p>Got a room code from a friend? You're in the right place.</p>
    <form id="join-form"><div class="field"><label for="join-name">Your name</label><input id="join-name" name="name" maxlength="24" required placeholder="What should we call you?" autocomplete="nickname" /></div>
    <div class="field"><label for="join-code">Room code</label><input id="join-code" name="code" maxlength="6" minlength="6" required placeholder="E.g. A1B2C3" autocomplete="off" autocapitalize="characters" style="font-weight:900;letter-spacing:3px;text-transform:uppercase" /></div>
    <button class="btn btn-primary btn-full" type="submit">Join Game →</button></form>
    <div class="join-note">Want to host your own game? <button class="text-btn" data-action="home">Go back to Home</button> to create a room.</div>
  </section>`;
}
function createHTML() {
  return `<section class="panel"><button class="back" data-action="home">← Back to Home</button>
    <span class="eyebrow">✦ GET THE PARTY STARTED</span><h1>Create a Game</h1><p>Make a room, share the code, and race your friends.</p>
    <form id="create-form"><div class="field"><label for="create-name">Your name</label><input id="create-name" name="name" maxlength="24" required placeholder="Your player name" autocomplete="nickname" /></div>
    <div class="field"><label>Game mode</label><div class="seg"><label><input name="mode" type="radio" value="classic" checked /><span><strong>✦ Classic</strong>4 center cards. Fast & focused.</span></label>
    <label><input name="mode" type="radio" value="chaos" /><span><strong>⚡ Extra Chaos</strong>8 center cards. More mayhem.</span></label></div></div>
    <button class="btn btn-primary btn-full" type="submit">Create My Room →</button></form>
    <div class="notice">After creating a room, the host can upload custom images for matching sets before starting the game.</div></section>`;
}
function lobbyHTML(data) {
  const { you, players, code, customPack } = data;
  return `<main><div class="lobby-header"><div><span class="eyebrow">✦ GAME LOBBY</span><h1>Gather your crew.</h1><p class="muted">Share your code, then get ready to race!</p></div><span class="pill">● WAITING FOR PLAYERS</span></div>
  <div class="dashboard"><section class="box"><h2>🔑 Your room code</h2><p>Friends can enter this code on their phones.</p>
  <div class="room-code">${code}</div><div class="room-actions"><button class="btn btn-primary" data-action="copy">Copy code</button><button class="btn btn-white" data-action="share">Share invite ↗</button></div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin:28px 0 8px"><h2>Who's here?</h2><span class="count">${players.length}/${data.isSolo ? 1 : 7} players</span></div>
  <div class="player-list">${players.map((p) => `<div class="person"><span class="avatar">${esc(initials(p.name))}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</span><small>${p.isHost ? 'HOST' : 'READY'}</small></div>`).join('')}</div>
  ${you.isHost ? `<button class="btn btn-lavender btn-full room-start" data-action="start" ${!data.isSolo && players.length < 2 ? 'disabled' : ''}>Start the Game →</button>
    <p class="tagline">${players.length < 2 ? 'Waiting for at least one friend to join…' : 'Everyone ready? Start when you are!'}</p>` : `<div class="notice">Waiting for the host to start the round. Keep this screen open.</div>`}
  </section>
  <section class="box"><h2>🎨 Your custom piles</h2><p>Upload a photo or illustration for each matching set. Each one becomes four cards with different colored frames. No images? Our built-in emoji deck fills the rest.</p>
  <div style="margin-top:13px"><span class="tag">${customPack.length} custom sets</span> <span class="tag">${data.mode === 'classic' ? 'Classic / 4 center' : 'Chaos / 8 center'}</span></div>
  ${you.isHost ? `<label class="upload"><input id="upload-images" type="file" accept="image/png,image/jpeg,image/webp" multiple />
      <span>🖼️</span>Tap to add images<small>PNG, JPG, WEBP · Max 44 · Images are resized automatically before upload</small></label>` : `<div class="notice">The host chooses the custom matching-set artwork for this round.</div>`}
  ${customPack.length ? `<div class="pack">${customPack.map((entry, i) => `<div style="position:relative" title="${escapeAttr(entry.name)}"><img class="pack-card" src="${escapeAttr(entry.image)}" alt="${escapeAttr(entry.name)}" />${you.isHost ? `<button data-action="remove-custom" data-index="${i}" aria-label="Remove ${escapeAttr(entry.name)}" style="position:absolute;top:-5px;right:-5px;border:0;border-radius:50%;background:#2b2631;color:#fff;width:19px;height:19px;font-size:11px">×</button>` : ''}</div>`).join('')}</div>` : ''}
  ${customPack.length && you.isHost ? `<div style="margin-top:15px"><button class="text-btn" data-action="clear-pack">Clear custom uploads</button></div>` : ''}
  <div class="notice">For a full custom-only deck, you need ${players.length * 6 + (data.mode === 'chaos' ? 2 : 1)} unique set images at the current player count. Otherwise default cards are added automatically.</div>
  </section></div>
  <div class="steps"><div class="step">🃏 <strong>1. Six piles</strong><span>Each player gets six piles of four face-down cards.</span></div><div class="step">🔄 <strong>2. Discard then take</strong><span>Swap one card at a time with the shared center.</span></div><div class="step">🏆 <strong>3. Match all six</strong><span>Complete every pile to win the race.</span></div></div></main>`;
}
function cardHTML(card, action, extra = '', disabled = false) {
  return `<button type="button" class="card" style="--tint:${card.tint}" data-action="${action}" ${extra} ${disabled ? 'disabled' : ''} aria-label="${card.kind === 'emoji' ? `Card ${escapeAttr(card.art)}` : 'Custom artwork card'}">
    <span class="corner">✦</span>${card.kind === 'image' ? `<img class="artwork" src="${escapeAttr(card.art)}" alt="Custom matching card artwork" draggable="false" />` : `<span class="emoji" aria-hidden="true">${esc(card.art)}</span>`}</button>`;
}
function miniCard(card) {
  if (!card) return '';
  return `<span class="tiny finish" style="background:${card.tint}">${card.kind === 'image' ? `<img src="${escapeAttr(card.art)}" alt="" />` : esc(card.art)}</span>`;
}
function pileHTML(pile, index, selected, pending) {
  const done = pile.completed;
  return `<button class="pile ${done ? 'done' : ''} ${selected === index ? 'active' : ''}" data-action="select-pile" data-index="${index}" ${done || pending !== null ? 'disabled' : ''}>
    <span class="pile-top"><span>PILE ${index + 1}</span><span>${done ? '✓ MATCHED' : selected === index ? '● OPEN' : '•••'}</span></span>
    <span class="pile-previews">${done ? pile.cards.map(miniCard).join('') : Array.from({ length: 4 }, (_, i) => `<span class="tiny" style="transform:rotate(${[-7,-2,3,8][i]}deg)">✦</span>`).join('')}</span>
  </button>`;
}
function elapsed(start, end = Date.now()) {
  if (!start) return '00:00';
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
}
function playHTML(data) {
  const { you, players } = data;
  const selected = state.selectedPile;
  const pending = you.pendingPickup;
  const countdown = data.status === 'playing' && Date.now() < data.startsAt;
  const done = you.piles.filter((p) => p.completed).length;
  const winner = players.find((p) => p.id === data.winnerId);
  const active = selected !== null ? you.piles[selected] : null;
  return `<main class="play-shell">
    <header class="play-top"><div><span class="eyebrow">✦ LIVE GAME</span><h1>Room ${data.code}</h1></div>
      <div id="timer" class="timer"><small>TIME</small>${elapsed(data.startsAt, data.endedAt || Date.now())}</div>
      <button class="small-btn" data-action="home">Exit</button></header>
    <div class="top-scores">${players.map((p) => `<div class="score ${p.id === you.id ? 'you' : ''}">${esc(p.name)} · ${p.completed}/6 ${p.id === you.id ? '(you)' : ''}</div>`).join('')}</div>
    ${countdown ? `<div id="countdown" class="countdown">Get ready… ${Math.max(1, Math.ceil((data.startsAt - Date.now()) / 1000))}</div>` : ''}
    ${data.status === 'finished' ? `<div class="win"><span class="eyebrow">✦ WE HAVE A WINNER</span><h2>🎉 ${esc(winner?.name || 'Someone')} matched all six!</h2>
       <p class="muted">Round time: ${elapsed(data.startsAt, data.endedAt)} · ${done}/6 of your sets complete.</p>
       ${you.isHost ? `<button class="btn btn-primary" data-action="rematch" style="margin-top:18px">Play Again ↻</button>` : `<p class="tagline">Waiting for the host to start a rematch.</p>`}</div>` : ''}
    <section class="desk"><div class="section-title"><span>✦ SHARED CENTER</span><span class="hint">${data.center.length} cards · Everyone can swap</span></div>
    <div class="cards">${data.center.map((card) => cardHTML(card, 'take', `data-card="${card.id}"`, data.status !== 'playing' || countdown || pending === null)).join('')}</div>
    <hr class="desk-divider" />
    <div class="section-title"><span>YOUR SIX PILES</span><span class="hint">${done}/6 completed</span></div>
    <div class="pile-grid">${you.piles.map((pile, i) => pileHTML(pile, i, selected, pending)).join('')}</div>
    ${active ? `<div class="pile-active-area"><div class="section-title"><span>PILE ${selected + 1} · ${pending !== null ? 'CHOOSE A CENTER CARD' : 'CHOOSE A CARD TO DISCARD'}</span><span class="hint">${active.cards.length}/4 cards</span></div>
       <div class="cards">${active.cards.map((card) => cardHTML(card, 'discard', `data-pile="${selected}" data-card="${card.id}"`, pending !== null || data.status !== 'playing' || countdown)).join('')}
       ${pending !== null ? '<div class="waiting-slot">← Now take<br/>from center</div>' : ''}</div></div>` : ''}
    </section>
    <p class="game-guidance">${data.status === 'finished' ? 'Round finished!' : pending !== null ? '☝️ Now tap a card in the shared center to complete your swap.' : selected === null ? '👆 Tap one of your piles to look at its cards.' : '👆 Tap one of these four cards to discard it to the center.'}</p>
    <p class="game-message">Only hold one pile at a time. Discard one card before taking one from the center. Complete all six piles with four identical symbols to win.</p>
  </main>`;
}
function howToModal() {
  document.body.insertAdjacentHTML('beforeend', `<div id="howto-modal" class="overlay"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="howto-title"><h2 id="howto-title">How to play 🃏</h2><p>Each player has six piles of four. Tap one pile to open it. Discard a card from that pile to the shared center, then take any card from the center to replace it. Keep swapping until every pile has four cards of one matching symbol. The first to complete all six wins! Everyone plays simultaneously.</p><button class="btn btn-primary btn-full" data-action="close-howto">Got it!</button></section></div>`);
}
function render() {
  if (state.view === 'join') return layout(joinHTML());
  if (state.view === 'create') return layout(createHTML());
  if (state.view !== 'room' || !state.data) return layout(homeHTML());
  layout(state.data.status === 'lobby' ? lobbyHTML(state.data) : playHTML(state.data));
}
function normalizeCode(input) { return String(input || '').trim().toUpperCase(); }
function getName(form) { return String(new FormData(form).get('name') || '').trim().slice(0, 24); }
async function makeRoom(name, mode, solo) {
  const created = await api('/api/rooms', { name, mode, solo });
  await connect(created.code, created.token);
}

app.addEventListener('submit', async (event) => {
  if (!['join-form', 'create-form'].includes(event.target.id)) return;
  event.preventDefault();
  if (state.busy) return;
  state.busy = true;
  const form = event.target;
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const name = getName(form);
    if (!name) throw new Error('Please enter your name.');
    if (form.id === 'join-form') {
      const code = normalizeCode(new FormData(form).get('code'));
      if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('Please enter a valid 6-character room code.');
      const joined = await api(`/api/rooms/${code}/join`, { name });
      await connect(joined.code, joined.token);
    } else {
      await makeRoom(name, String(new FormData(form).get('mode')), false);
    }
  } catch (error) { toast(error.message); submit.disabled = false; }
  finally { state.busy = false; }
});

document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'close-howto') { document.querySelector('#howto-modal')?.remove(); return; }
  if (action === 'howto') { howToModal(); return; }
  if (action === 'home') { clearSession(); state.view = 'home'; render(); return; }
  if (action === 'create' || action === 'join') { state.view = action; render(); return; }
  if (action === 'practice') {
    const name = window.prompt('Your name for solo practice?', 'Player 1');
    if (!name?.trim()) return;
    try { await makeRoom(name.trim().slice(0, 24), 'classic', true); }
    catch (error) { toast(error.message); }
    return;
  }
  if (!inRoom() || !state.data) return;
  if (action === 'copy') {
    try { await navigator.clipboard.writeText(state.room); toast('Room code copied!'); }
    catch { toast(`Your room code is ${state.room}`); }
  }
  if (action === 'share') {
    const text = `Play Pile Party with me! Join room ${state.room} at ${location.origin}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Pile Party', text, url: location.origin }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(text); toast('Invite copied!'); }
      catch { toast(`Share room code ${state.room}`); }
    }
  }
  if (action === 'start' || action === 'rematch') {
    await perform(action === 'start' ? 'start' : 'reset');
  }
  if (action === 'select-pile') {
    const index = Number(target.dataset.index);
    if (state.data.you.pendingPickup !== null || state.data.you.piles[index]?.completed) return;
    state.selectedPile = index; render();
  }
  if (action === 'discard') await perform('discard', { pileIndex: Number(target.dataset.pile), cardId: target.dataset.card });
  if (action === 'take') await perform('take', { cardId: target.dataset.card });
  if (action === 'remove-custom') {
    const images = state.data.customPack.filter((_, i) => i !== Number(target.dataset.index));
    await perform('pack', { images });
  }
  if (action === 'clear-pack') await perform('pack', { images: [] });
});

async function resizeImage(file) {
  if (!['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error(`${file.name} is not a PNG, JPG, or WEBP image.`);
  if (file.size > 15 * 1024 * 1024) throw new Error(`${file.name} is larger than 15 MB.`);
  const image = await createImageBitmap(file);
  const side = 350;
  const scale = Math.min(side / image.width, side / image.height, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(image.width * scale));
  canvas.height = Math.max(1, Math.floor(image.height * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  let data = canvas.toDataURL('image/webp', .72);
  if (data.length > 180000) data = canvas.toDataURL('image/jpeg', .48);
  if (data.length > 180000) throw new Error(`${file.name} is too detailed. Try a smaller image.`);
  return { name: file.name.replace(/\.[^.]+$/, '').slice(0, 24), image: data };
}
app.addEventListener('change', async (event) => {
  if (event.target.id !== 'upload-images') return;
  const input = event.target;
  const files = Array.from(input.files || []);
  if (!files.length || state.busy) return;
  if (files.length + state.data.customPack.length > 44) { toast('Maximum 44 custom set images per room.'); input.value=''; return; }
  state.busy = true;
  try {
    const images = [...state.data.customPack];
    for (const file of files) images.push(await resizeImage(file));
    await send('pack', { images });
    toast(`Added ${files.length} custom set${files.length > 1 ? 's' : ''}!`);
  } catch (error) { toast(error.message); }
  finally { state.busy = false; input.value = ''; }
});

let previousCountdown = false;
setInterval(() => {
  if (state.view !== 'room' || state.data?.status !== 'playing') return;
  const now = Date.now();
  const timer = document.getElementById('timer');
  if (timer) timer.innerHTML = `<small>TIME</small>${elapsed(state.data.startsAt, now)}`;
  const counting = now < state.data.startsAt;
  if (counting) {
    const label = document.getElementById('countdown');
    if (label) label.textContent = `Get ready… ${Math.max(1,Math.ceil((state.data.startsAt - now) / 1000))}`;
  }
  if (previousCountdown && !counting) render();
  previousCountdown = counting;
}, 200);

async function init() {
  const session = localStorage.getItem(SESSION_KEY);
  if (session) {
    try {
      const { code, token } = JSON.parse(session);
      if (code && token) { await connect(code, token); return; }
    } catch { clearSession(); }
  }
  render();
}
init();
