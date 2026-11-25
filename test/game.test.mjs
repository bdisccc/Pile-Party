import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../server.mjs';

let server, origin;
test.before(async () => {
  server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => await new Promise(resolve => server.close(resolve)));
async function request(path, data) {
  const response = await fetch(origin + path, data === undefined ? {} : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data)
  });
  return { status: response.status, result: await response.json() };
}

test('serves full mobile app and only Join Game CTA on the join view', async () => {
  const home = await fetch(origin + '/');
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /app\.js/);
  const js = await (await fetch(origin + '/app.js')).text();
  assert.match(js, /Want to host your own game\?/);
  assert.match(js, /Go back to Home/);
  assert.match(js, /<h1>Join a Game<\/h1>/);
});

test('room lifecycle, private hands, 2 player start, server-enforced discard then take', async () => {
  const created = await request('/api/rooms', { name: 'Host', mode: 'classic' });
  assert.equal(created.status, 201);
  const { code, token: host } = created.result;
  const joined = await request(`/api/rooms/${code}/join`, { name: 'Friend' });
  assert.equal(joined.status, 201);
  const { token: guest } = joined.result;
  const before = await request(`/api/rooms/${code}?token=${host}`);
  assert.equal(before.result.players.length, 2);
  assert.equal(before.result.center.length, 0);
  const tooEarly = await request(`/api/rooms/${code}/start`, { token: guest });
  assert.equal(tooEarly.status, 403);
  const custom = await request(`/api/rooms/${code}/pack`, {
    token: host, images: [{ name: 'Cat', image: 'data:image/png;base64,aGVsbG8=' }]
  });
  assert.equal(custom.status, 200);
  const started = await request(`/api/rooms/${code}/start`, { token: host });
  assert.equal(started.status, 200);
  let view = (await request(`/api/rooms/${code}?token=${host}`)).result;
  const guestView = (await request(`/api/rooms/${code}?token=${guest}`)).result;
  assert.equal(view.center.length, 4);
  assert.equal(view.you.piles.length, 6);
  assert.equal(view.you.piles[0].cards.length, 4);
  assert.equal(guestView.you.piles.length, 6);
  assert.ok(view.players.every(p => !('piles' in p)), 'opponents piles must be private');
  const invalid = await request(`/api/rooms/${code}/take`, { token: host, cardId: view.center[0].id });
  assert.equal(invalid.status, 409);
  await new Promise(r => setTimeout(r, 3100));
  view = (await request(`/api/rooms/${code}?token=${host}`)).result;
  const pileIndex = view.you.piles.findIndex(p => !p.completed);
  const cardId = view.you.piles[pileIndex].cards[0].id;
  const disc = await request(`/api/rooms/${code}/discard`, { token: host, pileIndex, cardId });
  assert.equal(disc.status, 200);
  const afterDiscard = (await request(`/api/rooms/${code}?token=${host}`)).result;
  assert.equal(afterDiscard.you.piles[pileIndex].cards.length, 3);
  assert.equal(afterDiscard.center.length, 5);
  assert.equal(afterDiscard.you.pendingPickup, pileIndex);
  const noDoubleDiscard = await request(`/api/rooms/${code}/discard`, { token: host, pileIndex, cardId: afterDiscard.you.piles[pileIndex].cards[0].id });
  assert.equal(noDoubleDiscard.status, 409);
  const take = await request(`/api/rooms/${code}/take`, { token: host, cardId: afterDiscard.center[0].id });
  assert.equal(take.status, 200);
  const afterTake = (await request(`/api/rooms/${code}?token=${host}`)).result;
  assert.equal(afterTake.you.piles[pileIndex].cards.length, 4);
  assert.equal(afterTake.center.length, 4);
  assert.equal(afterTake.you.pendingPickup, null);
});

test('solo practice, chaos center, and full room validation', async () => {
  const solo = await request('/api/rooms', { name: 'Solo', mode: 'chaos', solo: true });
  assert.equal(solo.status, 201);
  const { code, token } = solo.result;
  const view = (await request(`/api/rooms/${code}?token=${token}`)).result;
  assert.equal(view.status, 'playing');
  assert.equal(view.center.length, 8);
  const join = await request(`/api/rooms/${code}/join`, { name: 'Nope' });
  assert.equal(join.status, 409);
  const anon = await request(`/api/rooms/${code}?token=wrong`);
  assert.equal(anon.status, 401);
});
