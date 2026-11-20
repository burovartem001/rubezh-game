/**
 * Выдача наград через интеграционный API сайта «Учёт дронов».
 * Нужны TEST_URL и INTEGRATION_KEY (тот же, что у сервера). Запуск: npm run test:awards
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const URL_ = process.env.TEST_URL ?? 'http://localhost:3000';
const KEY = process.env.INTEGRATION_KEY ?? '';
let token = '';
async function call(path: string, body?: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(`${URL_}/api/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: (await r.json()) as any };
}
const integ = (path: string, body?: unknown, key = KEY) => fetch(`${URL_}/api/integration/${path}`, {
  method: body ? 'POST' : 'GET',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
  body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, body: (await r.json()) as any }));
const act = (type: string, p: object = {}) => call('action', { ...p, action: type, requestId: crypto.randomUUID() });

test('награды за заслуги: выдача, защита от повтора и ограничения', async () => {
  const login = 'award' + Date.now();
  let r = await call('auth/register', { login, password: 'secret123', callsign: 'Гром', commanderName: 'Тест' });
  token = r.body.token;

  assert.equal((await integ('awards', undefined, 'wrong-key-wrong-key')).status, 401);
  const cat = await integ('awards');
  assert.equal(cat.status, 200);
  assert.equal(cat.body.awards.length, 8);

  for (const a of cat.body.awards) {
    const g = await integ('award', { login, award: a.key, reason: 'тест', externalId: `t-${login}-${a.key}` });
    assert.equal(g.status, 200, JSON.stringify(g.body));
    assert.equal(g.body.duplicate, false);
  }
  const dup = await integ('award', { login, award: 'veteran', externalId: `t-${login}-veteran` });
  assert.equal(dup.body.duplicate, true, 'повтор не выдаёт второй раз');
  assert.equal((await integ('award', { login: 'no-such-user', award: 'veteran' })).status, 404);
  assert.equal((await integ('award', { login, award: 'tank' })).status, 400);

  r = await call('state');
  assert.equal(r.body.operators.veteran.available, 1);
  assert.ok(r.body.vehicles.gyro && r.body.vehicles.niva);
  assert.equal(r.body.equipment.filter((e: any) => e.rarity === 'award').length, 5);
  assert.equal(r.body.newAwards.length, 8, 'игрок видит новые награды');
  r = await call('state');
  assert.equal(r.body.newAwards.length, 0, 'показываются один раз');

  assert.equal((await act('train', { type: 'veteran' })).status, 400);
  assert.equal((await act('acquireVehicle', { type: 'niva' })).status, 400);
  const awardItem = r.body.equipment.find((e: any) => e.rarity === 'award');
  assert.equal((await act('dismantleEquipment', { id: awardItem.id })).status, 400);

  const reb = r.body.equipment.find((e: any) => e.type === 'rebNew');
  const pig = r.body.equipment.find((e: any) => e.type === 'pigGear');
  r = await act('dispatch', { sectorId: 1, mission: 'raid', group: { veteran: 1, scout: 2 }, vehicle: 'niva', equipment: [reb.id, pig.id] });
  assert.equal(r.status, 400, 'два предмета с одинаковым эффектом нельзя');
  const fpv = r.body ? (await call('state')).body.equipment.find((e: any) => e.type === 'fpvBoevye') : null;
  r = await act('dispatch', { sectorId: 1, mission: 'raid', group: { veteran: 1, scout: 2 }, vehicle: 'niva', equipment: [reb.id, fpv.id] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.state.operators.veteran.on_mission, 1);
});
