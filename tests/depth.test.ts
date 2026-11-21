/**
 * Глубина полигона и сюжет через API: новые здания, конструктор дронов, износ и ремонт, бойцы,
 * передовые пункты, кампания, события, достижения, случайные встречи.
 * Нужны TEST_URL и DATABASE_URL. Запуск: npm run test:depth
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { CAMPAIGN, EVENTS, eventWindow, modelsBonus, wearFactor, DEFAULT_MODEL } from '../shared/content.js';
import { EPOCH, soldierMods, countBondPairs } from '../shared/progression.js';
import { planExpedition } from '../shared/calc.js';
import { SECTORS, OPERATOR_TYPES, OperatorType } from '../shared/config.js';

const URL_ = process.env.TEST_URL ?? 'http://localhost:3000';
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
  const login = 'deep' + Date.now() + Math.floor(Math.random() * 100000);
  const r = await call('', 'auth/register', { login, password: 'secret123', callsign, commanderName: 'Тест' });
  const id = Number((await db.query('SELECT id FROM users WHERE login=$1', [login])).rows[0].id);
  return { login, token: r.body.token as string, id };
}
async function travel(uid: number, sec: number) {
  const iv = `${sec} seconds`;
  await db.query(`UPDATE jobs SET start_at=start_at-$2::interval, end_at=end_at-$2::interval WHERE user_id=$1 AND NOT done`, [uid, iv]);
  await db.query(`UPDATE expeditions SET start_at=start_at-$2::interval, end_at=end_at-$2::interval WHERE user_id=$1 AND status='active'`, [uid, iv]);
}
const ranks = Object.fromEntries(OPERATOR_TYPES.map((t) => [t, 1])) as Record<OperatorType, number>;

/* ───────── чистые функции ───────── */

test('расчёты: модели, износ, специализации, усталость, расчёты, окно событий', () => {
  assert.equal(wearFactor(100), 1);
  assert.equal(wearFactor(50), 1);
  assert.equal(wearFactor(25), 0.5);
  assert.equal(wearFactor(0), 0);
  const md = [{ cls: 'fpv' as OperatorType, name: 'Тест', parts: DEFAULT_MODEL, durability: 100 }];
  const full = modelsBonus(md, { fpv: 2 }, 0);
  const half = modelsBonus(md, { fpv: 1, scout: 1 }, 0);
  const broken = modelsBonus([{ ...md[0], durability: 0 }], { fpv: 2 }, 0);
  assert.ok((full.mods.power ?? 0) > (half.mods.power ?? 0), 'эффект модели пропорционален доле класса');
  assert.equal(broken.names.length, 0, 'сломанная модель не работает');
  assert.ok((modelsBonus(md, { fpv: 2 }, 3).mods.power ?? 0) > (full.mods.power ?? 0), 'полигон испытаний усиливает модель');
  // износ оснащения снижает эффект
  const base = { sector: SECTORS[0], mission: 'raid' as const, group: { fpv: 2 }, ranks, vehicle: { type: 'moto' as const, level: 1 }, skills: {}, commsLevel: 1, sectorRecon: 0 };
  const fresh = planExpedition({ ...base, equipment: [{ type: 'nsu', rarity: 'common', level: 1, durability: 100 }] });
  const worn = planExpedition({ ...base, equipment: [{ type: 'nsu', rarity: 'common', level: 1, durability: 10 }] });
  assert.ok(fresh.power > worn.power, 'изношенная НСУ слабее');
  // бойцы
  const spec = soldierMods([{ type: 'fpv', level: 3, trait: 'careful', spec: 'hunter' }]);
  const nospec = soldierMods([{ type: 'fpv', level: 3, trait: 'careful' }]);
  assert.ok((spec.mods.power ?? 0) > (nospec.mods.power ?? 0), 'специализация даёт силу');
  const tired = soldierMods([{ type: 'fpv', level: 3, trait: 'careful', fatigue: 80 }]);
  assert.ok((tired.mods.power ?? 0) < (nospec.mods.power ?? 0), 'усталость снижает силу');
  assert.equal(countBondPairs([{ id: 1, bonds: { '2': 10 } }, { id: 2, bonds: { '1': 10 } }, { id: 3, bonds: {} }]), 1);
  assert.ok((soldierMods([{ type: 'fpv', level: 1, trait: 'careful' }], 2).mods.power ?? 0) > (soldierMods([{ type: 'fpv', level: 1, trait: 'careful' }], 0).mods.power ?? 0));
  // окно событий: пятница 18:00 — понедельник 06:00 МСК, события по кругу
  const fri = EPOCH + 4 * 86400_000 + 18 * 3600_000;
  assert.equal(eventWindow(fri - 1000, EPOCH).active, false);
  assert.equal(eventWindow(fri + 1000, EPOCH).active, true);
  assert.equal(eventWindow(fri + 59 * 3600_000, EPOCH).active, true, 'понедельник 05:00 — ещё событие');
  assert.equal(eventWindow(fri + 61 * 3600_000, EPOCH).active, false);
  assert.equal(eventWindow(fri + 7 * 86400_000 + 1000, EPOCH).event.key, EVENTS[1].key, 'на следующей неделе — следующее событие');
  assert.equal(eventWindow(fri + 61 * 3600_000, EPOCH).nextStart, fri + 7 * 86400_000);
  // кампания: шаги согласованы
  const keys = new Set<string>();
  for (const s of CAMPAIGN) {
    assert.ok(!keys.has(s.key), `уникальный ключ ${s.key}`);
    keys.add(s.key);
    if (s.kind === 'mission') assert.ok(s.sectorId && s.mission && SECTORS.find((x) => x.id === s.sectorId), s.key);
    if (s.kind === 'choice') assert.ok((s.options?.length ?? 0) >= 2, s.key);
    if (s.kind === 'goal') assert.ok(s.goal, s.key);
  }
});

/* ───────── через API ───────── */

test('здания с нуля, модели дронов, износ и ремонт, бойцы, встречи, кампания, события, достижения, передовой пункт', async () => {
  const a = await player('Глубина-' + (Date.now() % 10000));
  await db.query(`UPDATE players SET supplies=20000, parts=20000, fuel=8000, data=3000, tutorial_step=7, cmd_xp=950, cmd_level=6, created_at=now()-interval '5 days' WHERE user_id=$1`, [a.id]);
  await db.query(`UPDATE buildings SET level=6 WHERE user_id=$1 AND key IN ('hq','training','workshop','comms','supply','fueldepot','defense')`, [a.id]);

  // новые здания начинаются с нуля и строятся
  let r = await call(a.token, 'state');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.buildings.testrange, 0);
  assert.equal((await act(a.token, 'buildModel', { cls: 'fpv', name: 'Шершень', color: '#6b7a3c', parts: { frame: 'f_std', motors: 'm_std', battery: 'b_std', camera: 'c_std', payload: 'p_std', link: 'l_std' } })).status, 400, 'без полигона испытаний модель не собрать');
  r = await act(a.token, 'build', { building: 'testrange' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await travel(a.id, 200 * 30);
  r = await call(a.token, 'state');
  assert.equal(r.body.buildings.testrange, 1);

  // кампания: сцена → миссия разведки (только разведчики)
  assert.equal(r.body.campaign.step, 0);
  r = await act(a.token, 'campaignAck', { key: 'c1s' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.state.campaign.step, 1);
  assert.equal((await act(a.token, 'campaignAck', { key: 'c1s' })).status, 400, 'сцену не принять дважды');
  r = await act(a.token, 'train', { type: 'fpv', count: 3 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await travel(a.id, 400 * 30);
  r = await act(a.token, 'dispatch', { sectorId: 1, campaign: 'c1m1', group: { scout: 1, fpv: 1 }, vehicle: 'moto', equipment: [] });
  assert.equal(r.status, 400, 'в миссии только разведчики');
  r = await act(a.token, 'dispatch', { sectorId: 1, campaign: 'c1m1', group: { scout: 2 }, vehicle: 'moto', equipment: [] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await travel(a.id, 4000 * 30);
  r = await call(a.token, 'state');
  const step = r.body.campaign.step;
  const camRep = r.body.reports.find((x: any) => x.campaign);
  if (camRep) assert.equal(step, 2, 'миссия кампании продвинула сюжет');
  else assert.equal(step, 1, 'неудачная миссия кампании не продвигает сюжет');

  // модель дрона
  r = await act(a.token, 'buildModel', { cls: 'fpv', name: 'Шершень', color: '#6b7a3c', parts: { frame: 'f_carbon', motors: 'm_std', battery: 'b_std', camera: 'c_std', payload: 'p_std', link: 'l_std' } });
  assert.equal(r.status, 400, 'без чертежа карбоновую раму не поставить');
  r = await act(a.token, 'buildModel', { cls: 'fpv', name: 'Шершень', color: '#6b7a3c', parts: { frame: 'f_heavy', motors: 'm_torque', battery: 'b_ext', camera: 'c_zoom', payload: 'p_heavy', link: 'l_long' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await travel(a.id, 400 * 30);
  r = await call(a.token, 'state');
  const model = r.body.models.find((m: any) => m.cls === 'fpv');
  assert.ok(model && model.durability === 100, 'модель собрана');
  assert.ok(r.body.stats?.modelsBuilt ?? r.body.commander.stats.modelsBuilt >= 1);

  // поход с моделью: в причинах есть модель, после — износ модели
  await db.query(`UPDATE sectors SET recon=60 WHERE user_id=$1 AND sector_id=1`, [a.id]);
  await db.query(`UPDATE drone_models SET built_at = built_at - interval '5 days' WHERE user_id=$1`, [a.id]); // тест сдвигает время похода назад
  r = await act(a.token, 'dispatch', { sectorId: 1, mission: 'raid', group: { fpv: 3 }, vehicle: 'moto', equipment: [] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await travel(a.id, 4000 * 30);
  r = await call(a.token, 'state');
  const rep = r.body.reports.find((x: any) => x.mission === 'raid');
  assert.ok(rep.reasons.some((x: any) => /Модели дронов/.test(x.text)), 'модель влияет на расчёт и видна в отчёте');
  assert.ok(r.body.models.find((m: any) => m.cls === 'fpv').durability < 100, 'модель износилась');
  r = await act(a.token, 'repairModel', { cls: 'fpv' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.state.models.find((m: any) => m.cls === 'fpv').durability, 100);

  // износ оснащения: сломанное нельзя взять, ремонт возвращает
  const eqr = await db.query(`INSERT INTO equipment(user_id, type, rarity, source, durability) VALUES ($1,'reb','common','тест',0) RETURNING id`, [a.id]);
  const eqId = Number(eqr.rows[0].id);
  r = await act(a.token, 'dispatch', { sectorId: 1, mission: 'raid', group: { fpv: 1 }, vehicle: 'moto', equipment: [eqId] });
  assert.equal(r.status, 400, 'сломанное оснащение не берут');
  r = await act(a.token, 'repairEquipment', { id: eqId });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.state.equipment.find((e: any) => e.id === eqId).durability, 100);

  // бойцы: специализация с 3 уровня, инструктор с 5, шрамы — в медпункте
  const fpvSoldier = r.body.state.soldiers.find((s: any) => s.type === 'fpv');
  assert.equal((await act(a.token, 'soldierSpec', { id: fpvSoldier.id, spec: 'hunter' })).status, 400, 'нужен 3 уровень');
  await db.query(`UPDATE soldiers SET xp=500, level=5, scars=2 WHERE id=$1`, [fpvSoldier.id]);
  assert.equal((await act(a.token, 'soldierSpec', { id: fpvSoldier.id, spec: 'pathfinder' })).status, 400, 'чужая специализация');
  r = await act(a.token, 'soldierSpec', { id: fpvSoldier.id, spec: 'hunter' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await act(a.token, 'setInstructor', { id: fpvSoldier.id, on: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.state.instructorsReady, 1);
  assert.equal((await act(a.token, 'healScars', { id: fpvSoldier.id })).status, 400, 'без медпункта не лечат');

  // встреча: вручную создаём встречу в отчёте и решаем её
  const repRow = await db.query(`SELECT id FROM reports WHERE user_id=$1 AND expedition_id IS NOT NULL ORDER BY id DESC LIMIT 1`, [a.id]);
  const repId = Number(repRow.rows[0].id);
  await db.query(`UPDATE reports SET body = jsonb_set(body, '{encounter}', '{"key":"kitten","resolved":false}'::jsonb) WHERE id=$1`, [repId]);
  r = await act(a.token, 'encounterChoose', { reportId: repId, option: 0 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.state.mascots.includes('cat'), 'котёнок стал талисманом');
  assert.equal((await act(a.token, 'encounterChoose', { reportId: repId, option: 1 })).status, 400, 'встреча решается один раз');

  // передовой пункт: нужен контроль сектора
  assert.equal((await act(a.token, 'outpostBuild', { sectorId: 1 })).status, 400, 'без контроля нельзя');
  await db.query(`UPDATE sectors SET control=80, control_at=now() WHERE user_id=$1 AND sector_id=1`, [a.id]);
  r = await act(a.token, 'outpostBuild', { sectorId: 1 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await travel(a.id, 1000 * 30);
  r = await call(a.token, 'state');
  assert.equal(r.body.outposts.length, 1);
  r = await act(a.token, 'dispatch', { sectorId: 2, mission: 'recon', group: { scout: 1 }, vehicle: 'moto', equipment: [] });
  if (r.status === 200) {
    const x = r.body.state.expeditions.find((e: any) => e.sectorId === 2);
    assert.ok(x, 'поход в соседний сектор');
  }

  // достижения и событие
  r = await call(a.token, 'state');
  assert.ok(Array.isArray(r.body.achievements) && r.body.achievements.length >= 20);
  assert.ok(r.body.achPoints >= 0);
  assert.ok(r.body.event && typeof r.body.event.active === 'boolean');
  assert.equal((await act(a.token, 'eventClaim', { tier: 3 })).status, 400, 'без очков ступень не взять');

  // чужой профиль показывает модели и достижения
  const b = await player('Смотрящий-' + (Date.now() % 10000));
  const prof = await call(b.token, `players/${a.id}`);
  assert.equal(prof.status, 200);
  assert.ok(prof.body.models.some((m: any) => m.name === 'Шершень'));
  assert.ok(typeof prof.body.achPoints === 'number');
});

test('событие выходных: ступени наград забираются один раз, четвёртая даёт шеврон события', async () => {
  const a = await player('Событие-' + (Date.now() % 10000));
  const ev = eventWindow(Date.now(), EPOCH);
  const week = ev.active ? ev.week : ev.week - 1;
  const def = EVENTS[((week % EVENTS.length) + EVENTS.length) % EVENTS.length];
  await db.query(`INSERT INTO scores(user_id, period, points, counters) VALUES ($1,$2,700,'{}') ON CONFLICT (user_id, period) DO UPDATE SET points=700`, [a.id, `E${week}`]);
  let r = await call(a.token, 'state');
  assert.equal(r.body.event.points, 700, 'очки события видны в состоянии');
  for (let i = 0; i < 4; i++) {
    r = await act(a.token, 'eventClaim', { tier: i });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  assert.equal((await act(a.token, 'eventClaim', { tier: 0 })).status, 400, 'повторно не выдаётся');
  r = await call(a.token, 'state');
  assert.ok(r.body.chevrons.some((c: any) => c.key === def.tiers[3].chevron), 'шеврон события получен');
  assert.equal(r.body.blueprints.length, 1, 'чертёж с третьей ступени');
  assert.equal(r.body.event.claimed.claimed3, 1);
});

test('кампания: выбор с ценой нельзя сделать без ресурсов, сюжет идёт по шагам', async () => {
  const a = await player('Сюжет-' + (Date.now() % 10000));
  const idx = CAMPAIGN.findIndex((s) => s.key === 'c3c');
  await db.query(`UPDATE players SET campaign=$2, supplies=100, cmd_level=5, cmd_xp=2500 WHERE user_id=$1`, [a.id, JSON.stringify({ step: idx, flags: {} })]);
  let r = await act(a.token, 'campaignChoose', { key: 'c3c', option: 'help' });
  assert.equal(r.status, 400, 'не хватает припасов на помощь соседям');
  r = await call(a.token, 'state');
  assert.equal(r.body.campaign.step, idx, 'шаг не сдвинулся');
  r = await act(a.token, 'campaignChoose', { key: 'c3c', option: 'keep' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.state.campaign.flags.c3c, 'keep');
  assert.equal(r.body.state.campaign.step, idx + 1);
  assert.equal((await act(a.token, 'campaignChoose', { key: 'c3c', option: 'help' })).status, 400, 'выбор делается один раз');
  assert.equal((await act(a.token, 'campaignAck', { key: 'c1s' })).status, 400, 'старую сцену не принять');
});

test('после проверки: ключ сцены в походе — 400, престиж сбрасывает новые здания в ноль', async () => {
  const a = await player('Престиж-' + (Date.now() % 10000));
  await db.query(`UPDATE players SET tutorial_step=7 WHERE user_id=$1`, [a.id]);
  const r1 = await act(a.token, 'dispatch', { sectorId: 1, campaign: 'c1s', group: { scout: 1 }, vehicle: 'moto', equipment: [] });
  assert.equal(r1.status, 400, JSON.stringify(r1.body));
  await db.query(`UPDATE players SET cmd_level=10, cmd_xp=99999 WHERE user_id=$1`, [a.id]);
  await db.query(`UPDATE buildings SET level=3 WHERE user_id=$1`, [a.id]);
  const r2 = await act(a.token, 'prestige');
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  assert.equal(r2.body.state.buildings.testrange, 0);
  assert.equal(r2.body.state.buildings.medbay, 0);
  assert.equal(r2.body.state.buildings.hq, 1);
});
