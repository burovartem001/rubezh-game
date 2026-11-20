/**
 * Шевроны и публичные профили. Нужны TEST_URL, DATABASE_URL и INTEGRATION_KEY. Запуск: npm run test:chevrons
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const URL_ = process.env.TEST_URL ?? 'http://localhost:3000';
const KEY = process.env.INTEGRATION_KEY ?? '';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
after(() => db.end());

async function call(token: string, path: string, body?: unknown) {
  const r = await fetch(`${URL_}/api/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: (await r.json()) as any };
}
const act = (t: string, type: string, p: object = {}) => call(t, 'action', { ...p, action: type, requestId: crypto.randomUUID() });
async function newPlayer(callsign: string) {
  const login = 'chev' + Date.now() + Math.floor(Math.random() * 1000);
  const r = await call('', 'auth/register', { login, password: 'secret123', callsign, commanderName: 'Тест' });
  return { login, token: r.body.token as string };
}

test('шевроны: старт, надеть, выдача сайтом, достижения, чужой профиль', async () => {
  const a = await newPlayer('Альфа-' + Date.now() % 10000);
  const b = await newPlayer('Браво-' + Date.now() % 10000);

  let r = await call(a.token, 'state');
  assert.deepEqual(r.body.chevrons.map((c: any) => c.key).sort(), ['platoon', 'polygon']);
  assert.equal(r.body.player.chevron, 'polygon');

  assert.equal((await act(a.token, 'wearChevron', { key: 'legend' })).status, 400, 'нельзя надеть неполученный');
  assert.equal((await act(a.token, 'wearChevron', { key: 'nope' })).status, 400);
  r = await act(a.token, 'wearChevron', { key: 'platoon' });
  assert.equal(r.status, 200);
  assert.equal(r.body.state.player.chevron, 'platoon');

  // выдача сайтом
  const g = await fetch(`${URL_}/api/integration/award`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ login: a.login, award: 'siteProp', reason: 'тест', externalId: `chev-${a.login}` }),
  }).then((x) => x.json() as Promise<any>);
  assert.equal(g.ok, true, JSON.stringify(g));
  r = await call(a.token, 'state');
  assert.ok(r.body.chevrons.some((c: any) => c.key === 'siteProp'));
  assert.equal(r.body.newAwards[0].award, 'siteProp');
  assert.equal((await act(a.token, 'wearChevron', { key: 'siteProp' })).status, 200);
  assert.equal((await act(a.token, 'wearChevron', { key: 'legend' })).status, 400);

  // достижение открывается само по условию
  const uid = Number((await db.query('SELECT id FROM users WHERE login=$1', [a.login])).rows[0].id);
  await db.query(`UPDATE players SET stats = stats || '{"expeditionsDone": 1}'::jsonb WHERE user_id=$1`, [uid]);
  r = await call(a.token, 'state');
  assert.ok(r.body.chevrons.some((c: any) => c.key === 'firstFlight'), 'первый вылет открыт');
  assert.ok(r.body.newChevrons.includes('firstFlight'));

  // другой игрок видит профиль и шевроны
  const list = await call(b.token, `players?q=${encodeURIComponent('Альфа')}`);
  const row = list.body.players.find((p: any) => p.id === uid);
  assert.ok(row, 'есть в списке сослуживцев');
  assert.equal(row.chevron, 'siteProp');
  const prof = await call(b.token, `players/${uid}`);
  assert.equal(prof.status, 200);
  assert.equal(prof.body.me, false);
  assert.equal(prof.body.chevron, 'siteProp');
  assert.ok(prof.body.chevrons.length >= 4);
  assert.equal(prof.body.login, undefined, 'логин не раскрывается');
  assert.equal(prof.body.resources, undefined);
  assert.equal((await call('', `players/${uid}`)).status, 401, 'без входа не видно');
});
