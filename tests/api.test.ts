/**
 * Сценарий через HTTP API на работающем сервере.
 * Нужны: TEST_URL (например http://localhost:3000) и DATABASE_URL той же базы — для «перемотки» таймеров.
 * Запуск: npm run test:api
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const URL_ = process.env.TEST_URL ?? 'http://localhost:3000';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
after(() => db.end());

let token = '';
async function call(path: string, body?: unknown, method = body ? 'POST' : 'GET') {
  const r = await fetch(`${URL_}/api/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: (await r.json()) as any };
}
const act = (type: string, p: object = {}, requestId = crypto.randomUUID()) => call('action', { ...p, action: type, requestId });
async function userId() {
  return (await db.query('SELECT user_id FROM sessions s JOIN users u ON u.id=s.user_id ORDER BY s.created_at DESC LIMIT 1')).rows[0].user_id;
}
/** Сдвигает все отметки игрока в прошлое — как будто прошло `sec` секунд. */
async function travel(sec: number) {
  const uid = await userId();
  const iv = `${sec} seconds`;
  await db.query(`UPDATE jobs SET start_at=start_at-$2::interval, end_at=end_at-$2::interval WHERE user_id=$1 AND NOT done`, [uid, iv]);
  await db.query(`UPDATE expeditions SET start_at=start_at-$2::interval, end_at=end_at-$2::interval WHERE user_id=$1 AND status='active'`, [uid, iv]);
  await db.query(`UPDATE players SET res_updated_at=res_updated_at-$2::interval WHERE user_id=$1`, [uid, iv]);
}

test('полный первый цикл и защита от двойных действий', async () => {
  const login = 'test' + Date.now();
  let r = await call('auth/register', { login, password: 'secret123', callsign: 'Ветер', commanderName: 'Тест' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  token = r.body.token;

  r = await call('state');
  assert.equal(r.body.tutorialStep, 0);
  assert.equal(r.body.operators.scout.available, 2);

  // 1. Командный пункт; повтор того же requestId не списывает ресурсы второй раз
  const s0 = r.body.resources.supplies;
  const rid = crypto.randomUUID();
  r = await act('build', { building: 'hq' }, rid);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const s1 = r.body.state.resources.supplies;
  assert.ok(s1 < s0);
  r = await act('build', { building: 'hq' }, rid);
  assert.equal(r.body.replayed, true);
  assert.ok(Math.abs(r.body.state.resources.supplies - s1) < 1, 'повтор не списал ресурсы');
  r = await act('build', { building: 'training' });
  assert.equal(r.status, 400, 'очередь строительства одна');
  await travel(25 * 30);
  r = await call('state');
  assert.equal(r.body.buildings.hq, 2);
  assert.equal(r.body.tutorialStep, 1);

  // 2. Разведчик
  r = await act('train', { type: 'scout', count: 1 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await travel(20 * 30);
  // 3. Электровелосипед
  r = await act('acquireVehicle', { type: 'ebike' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await travel(25 * 30);
  r = await call('state');
  assert.equal(r.body.operators.scout.available, 3);
  assert.ok(r.body.vehicles.ebike);
  assert.equal(r.body.tutorialStep, 3);

  // 4. Поход: параллельно два одинаковых запроса — уходит только один набор операторов
  const dispatch = { sectorId: 1, mission: 'recon', group: { scout: 3 }, vehicle: 'ebike', equipment: [] };
  const [a, b] = await Promise.all([act('dispatch', dispatch), act('dispatch', dispatch)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 400], 'второй поход теми же операторами отклонён');
  r = await call('state');
  assert.equal(r.body.operators.scout.available, 0);
  assert.equal(r.body.operators.scout.on_mission, 3);
  assert.equal(r.body.expeditions.length, 1);
  r = await act('dispatch', { ...dispatch, vehicle: 'moto', group: { scout: 1 } });
  assert.equal(r.status, 400, 'занятые операторы не уходят повторно');

  await travel(400 * 30);
  const [s1r, s2r] = await Promise.all([call('state'), call('state')]);
  assert.equal(s1r.status, 200);
  assert.equal(s2r.status, 200);
  r = await call('state');
  assert.equal(r.body.reports.length, 1, 'один отчёт на поход');
  const rep = r.body.reports[0];
  assert.ok(['success', 'decisive'].includes(rep.outcome), rep.outcome);
  assert.ok(rep.reasons.length > 0);
  const uid = await userId();
  const cnt = await db.query('SELECT count(*)::int n FROM reports WHERE user_id=$1', [uid]);
  assert.equal(cnt.rows[0].n, 1);
  assert.equal(r.body.operators.scout.on_mission, 0);
  assert.equal(r.body.operators.scout.available + r.body.operators.scout.wounded + r.body.operators.scout.lost_total, 3, 'операторы не исчезают');
  assert.ok(r.body.sectors[0].recon > 0);
  assert.equal(r.body.tutorialStep, 4);

  // 5–6. FPV и первый предмет оснащения
  r = await act('build', { building: 'training' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await travel(40 * 30);
  r = await act('train', { type: 'fpv', count: 1 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await travel(40 * 30);
  r = await call('state');
  assert.equal(r.body.tutorialStep, 6);
  assert.equal(r.body.equipment.length, 1);
  assert.equal(r.body.equipment[0].type, 'nsu');

  // 7. Рейд с оснащением
  const scouts = r.body.operators.scout.available;
  r = await act('dispatch', { sectorId: 1, mission: 'raid', group: { fpv: 1, scout: Math.min(2, scouts) }, vehicle: 'moto', equipment: [r.body.equipment[0].id] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.state.tutorialStep, 7, 'обучение завершено');

  // Нельзя потратить больше, чем есть
  await db.query('UPDATE players SET supplies=5, parts=5 WHERE user_id=$1', [uid]);
  r = await act('train', { type: 'scout', count: 5 });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Недостаточно/);
  r = await call('state');
  assert.ok(r.body.resources.supplies >= 5);

  // Повторный вход
  token = '';
  r = await call('auth/login', { login, password: 'wrong-pass' });
  assert.equal(r.status, 401);
  r = await call('auth/login', { login, password: 'secret123' });
  assert.equal(r.status, 200);
  token = r.body.token;
  r = await call('state');
  assert.equal(r.body.buildings.training, 2);
  assert.ok(r.body.reports.length >= 1);
});
