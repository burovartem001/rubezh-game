/**
 * Системы долгой игры через API. Нужны TEST_URL, DATABASE_URL и INTEGRATION_KEY. Запуск: npm run test:long
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { attackInWindow, ATTACK_WINDOW, seasonIndex, seasonTheme } from '../shared/progression.js';

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
async function player(callsign: string) {
  const login = 'long' + Date.now() + Math.floor(Math.random() * 100000);
  const r = await call('', 'auth/register', { login, password: 'secret123', callsign, commanderName: 'Тест' });
  const id = Number((await db.query('SELECT id FROM users WHERE login=$1', [login])).rows[0].id);
  return { login, token: r.body.token as string, id };
}
async function travel(uid: number, sec: number) {
  const iv = `${sec} seconds`;
  await db.query(`UPDATE jobs SET start_at=start_at-$2::interval, end_at=end_at-$2::interval WHERE user_id=$1 AND NOT done`, [uid, iv]);
  await db.query(`UPDATE expeditions SET start_at=start_at-$2::interval, end_at=end_at-$2::interval WHERE user_id=$1 AND status='active'`, [uid, iv]);
  await db.query(`UPDATE pvp_hits SET at=at-$2::interval WHERE attacker_id=$1 AND NOT applied`, [uid, iv]);
}
const rich = (uid: number) =>
  db.query(`UPDATE players SET supplies=3000, parts=3000, fuel=2000, data=1000, tutorial_step=7, cmd_xp=200, cmd_level=3, created_at=now()-interval '5 days' WHERE user_id=$1`, [uid]);

test('долгая игра: исследования, бойцы, оборона, контроль, серия, контракты, экспедиции', async () => {
  const a = await player('Долгий-' + (Date.now() % 10000));
  await rich(a.id);

  // именные бойцы создаются под счётчики отряда
  let r = await call(a.token, 'state');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const scouts = r.body.soldiers.filter((s: any) => s.type === 'scout' && s.status === 'ready');
  assert.equal(scouts.length, 2, 'два именных разведчика');
  assert.ok(scouts[0].name && scouts[0].trait);
  assert.equal(r.body.contracts.length, 3, 'три контракта недели');
  assert.ok(r.body.season.index >= 1 && r.body.streak.streak >= 1);

  // серия входов
  r = await act(a.token, 'claimStreak');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await act(a.token, 'claimStreak')).status, 400, 'второй раз в день нельзя');

  // исследование
  r = await act(a.token, 'research', { key: 'comm2' });
  assert.equal(r.status, 400, 'без предыдущего нельзя');
  r = await act(a.token, 'research', { key: 'comm1' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await act(a.token, 'research', { key: 'uav1' })).status, 400, 'одно исследование за раз');
  await travel(a.id, 700 * 30);
  r = await call(a.token, 'state');
  assert.ok(r.body.research.includes('comm1'));
  assert.ok(r.body.modParts.some((p: any) => p.label === 'Исследования' && p.mods.recon > 0));

  // поход с именными бойцами → опыт
  r = await act(a.token, 'dispatch', { sectorId: 1, mission: 'recon', group: { scout: 2 }, vehicle: 'moto', equipment: [] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.state.soldiers.filter((s: any) => s.status === 'mission').length, 2);
  await travel(a.id, 4000 * 30);
  r = await call(a.token, 'state');
  const back = r.body.soldiers.filter((s: any) => s.type === 'scout');
  assert.ok(back.every((s: any) => s.status !== 'mission'));
  assert.ok(back.some((s: any) => s.missions >= 1 && s.xp > 0), 'бойцы получили опыт');
  assert.ok(r.body.reports[0].soldiers, 'в отчёте есть сведения о бойцах');
  assert.ok(r.body.week.points > 0, 'очки недели начислены');

  // удержание контроля: сектор теряет контроль после суток без походов
  await db.query(`UPDATE sectors SET control=100, recon=60, control_at=now()-interval '72 hours' WHERE user_id=$1 AND sector_id=1`, [a.id]);
  r = await call(a.token, 'state');
  const c1 = r.body.sectors.find((s: any) => s.id === 1).control;
  assert.ok(c1 <= 53 && c1 >= 50, `контроль упал до ~52, сейчас ${c1}`);

  // атаки на полигон за последние сутки — детерминированно
  const now = Date.now();
  await db.query(`UPDATE players SET attacks_checked_at = now() - interval '24 hours' WHERE user_id=$1`, [a.id]);
  const start = now - 24 * 3600_000;
  let expected = 0;
  for (let w = Math.floor(start / ATTACK_WINDOW); w <= Math.floor(now / ATTACK_WINDOW); w++) {
    const at = attackInWindow(a.id, w, 1, seasonTheme(seasonIndex(now)).key);
    if (at && at.at > start + 5000 && at.at <= now) expected++;
  }
  r = await call(a.token, 'state');
  const defense = await db.query(`SELECT count(*)::int n FROM reports WHERE user_id=$1 AND body->>'kind'='defense'`, [a.id]);
  assert.ok(Math.abs(defense.rows[0].n - expected) <= 1, `атак: ожидалось ${expected}, есть ${defense.rows[0].n}`);
  assert.ok(r.body.defense > 0);

  // экспедиция: многочасовой поход
  r = await act(a.token, 'dispatch', { sectorId: 1, mission: 'expedition', group: { scout: 1 }, vehicle: 'moto', equipment: [] });
  if (r.status === 400 && /свободно/.test(r.body.error)) return; // разведчик ранен при атаке — допустимо
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const exp = r.body.state.expeditions.find((x: any) => x.mission === 'expedition');
  assert.ok(exp.endAt - exp.startAt >= 40 * 60_000, 'экспедиция длится десятки минут и дольше');
});

test('роты: склад, помощь в стройке, штурм; рейтинг; набег; привязка к сайту; престиж', async () => {
  const a = await player('Ротный-' + (Date.now() % 10000));
  const b = await player('Боец-' + (Date.now() % 10000));
  const victim = await player('Сосед-' + (Date.now() % 10000));
  for (const p of [a, b, victim]) await rich(p.id);

  let r = await act(a.token, 'companyCreate', { name: 'Тестовая рота ' + (Date.now() % 100000), tag: 'ТСТ' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const cid = (r.body.data as any).id;
  r = await act(b.token, 'companyJoin', { id: cid });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await act(a.token, 'companyDonate', { res: 'parts', amount: 100 })).status, 200);
  assert.equal((await act(b.token, 'companyGive', { userId: a.id, res: 'parts', amount: 10 })).status, 400, 'выдаёт только командир роты');

  // помощь в стройке сокращает время
  r = await act(a.token, 'build', { building: 'hq' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const job = r.body.state.jobs.find((j: any) => j.kind === 'build');
  r = await act(b.token, 'helpBuild', { userId: a.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await act(b.token, 'helpBuild', { userId: a.id })).status, 400, 'повторная помощь той же стройке нельзя');
  r = await call(a.token, 'state');
  const job2 = r.body.jobs.find((j: any) => j.id === job.id);
  assert.ok(!job2 || job2.endAt < job.endAt, 'стройка стала короче');
  const det = await call(b.token, `companies/${cid}`);
  assert.equal(det.status, 200);
  assert.equal(det.body.members.length, 2);
  assert.ok(det.body.storage.parts >= 100);

  // рейтинг
  const lb = await call(a.token, 'leaderboard?period=all');
  assert.equal(lb.status, 200);
  assert.ok(lb.body.rows.length > 0);

  // набег: соседа нельзя трогать своей роте, чужого — можно
  r = await act(a.token, 'pvpRaid', { targetId: b.id, group: { scout: 1 }, vehicle: 'moto', equipment: [] });
  assert.equal(r.status, 400, 'своих не трогаем');
  r = await act(a.token, 'pvpScout', { targetId: victim.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok((r.body.data as any).defense > 0);
  r = await act(a.token, 'pvpRaid', { targetId: victim.id, group: { scout: 2 }, vehicle: 'moto', equipment: [] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await act(a.token, 'pvpRaid', { targetId: victim.id, group: { scout: 0, fpv: 0 }, vehicle: 'moto' })).status, 400);
  await travel(a.id, 2000 * 30);
  r = await call(a.token, 'state');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const rep = r.body.reports.find((x: any) => x.kind === 'pvp_attack');
  assert.ok(rep, 'отчёт о набеге у нападавшего');
  r = await call(victim.token, 'state');
  const def = r.body.reports.find((x: any) => x.kind === 'pvp_defense');
  assert.ok(def, 'отчёт о набеге у обороняющегося');

  // привязка к сайту и выдача по идентификатору сайта
  r = await act(a.token, 'linkCode');
  const code = (r.body.data as any).code;
  const link = await fetch(`${URL_}/api/integration/link`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ code, siteUserId: `site-${a.id}` }),
  }).then((x) => x.json() as Promise<any>);
  assert.equal(link.ok, true, JSON.stringify(link));
  const aw = await fetch(`${URL_}/api/integration/award`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ siteUserId: `site-${a.id}`, award: 'siteHands', externalId: `link-${a.id}` }),
  }).then((x) => x.json() as Promise<any>);
  assert.equal(aw.ok, true, JSON.stringify(aw));
  r = await call(a.token, 'state');
  assert.equal(r.body.siteLinked, true);
  assert.ok(r.body.chevrons.some((c: any) => c.key === 'siteHands'));

  // престиж
  const p = await player('Престиж-' + (Date.now() % 10000));
  await db.query(`UPDATE players SET cmd_xp=4000, cmd_level=10, tutorial_step=7 WHERE user_id=$1`, [p.id]);
  await db.query(`UPDATE buildings SET level=5 WHERE user_id=$1`, [p.id]);
  r = await act(p.token, 'prestige');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.state.prestige, 1);
  assert.equal(r.body.state.buildings.hq, 1);
  assert.equal(r.body.state.commander.level, 1);
  assert.ok(r.body.state.modParts.some((m: any) => m.label.startsWith('Престиж')));
});
