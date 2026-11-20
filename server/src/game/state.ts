/**
 * Состояние игрока: загрузка под замком, «досчёт» времени (производство, очереди, походы), сохранение.
 * Время хранится абсолютными отметками; фоновых процессов нет — всё досчитывается при обращении.
 */
import {
  BUILDING_KEYS,
  BuildingKey,
  Cost,
  DAILY_KEYS,
  DailyKey,
  EQUIPMENT,
  EQUIPMENT_LIMIT,
  EquipmentType,
  HQ_SECOND_SLOT_LEVEL,
  MISSIONS,
  MissionType,
  OPERATORS,
  OPERATOR_TYPES,
  OUTCOME_NAMES,
  OperatorType,
  PRODUCED_KEYS,
  PRODUCTION,
  RARITY_NAMES,
  RES_KEYS,
  ResKey,
  Rarity,
  SECTORS,
  SKILL_EFFECTS,
  Skills,
  START_OPERATORS,
  START_RESOURCES,
  TUTORIAL,
  VEHICLES,
  VehicleType,
  BUILDINGS,
  commanderLevel,
  gameDay,
  productionPerHour,
  sectorById,
  storageCap,
} from '../../../shared/config.js';
import type { ExpeditionResult, Group, Plan } from '../../../shared/calc.js';
import type { Db } from '../db.js';

export class GameError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export interface OpRow { available: number; on_mission: number; wounded: number; recovering: number; lost_total: number; trained: number; rank: number }
export interface VehRow { level: number; status: 'ready' | 'mission' | 'damaged' | 'workshop' }
export interface EqRow { id: number; type: EquipmentType; rarity: Rarity; level: number; status: 'ready' | 'mission'; source: string; dirty?: boolean }
export interface JobRow { id: number; queue: 'build' | 'train' | 'workshop' | 'recovery'; kind: string; payload: any; cost: Cost; start_at: number; end_at: number; done: boolean }
export interface SecRow { recon: number; control: number; attempts: number; successes: number }
export interface ExpRow {
  id: number; sector_id: number; mission: MissionType; group_comp: Group; vehicle: VehicleType; equipment: number[];
  cost: Cost; plan: Plan; result: ExpeditionResult; start_at: number; end_at: number; status: 'active' | 'done';
}
export interface Notice { kind: 'info' | 'success' | 'warn'; text: string }

export interface PS {
  userId: number;
  p: {
    callsign: string; commander_name: string; portrait: number; insignia: number;
    supplies: number; parts: number; fuel: number; data: number; res_updated_at: number;
    tutorial_step: number; cmd_xp: number; cmd_level: number; skills: Skills; free_reset_used: boolean; stats: Record<string, number>;
  };
  buildings: Record<BuildingKey, number>;
  ops: Record<OperatorType, OpRow>;
  vehicles: Partial<Record<VehicleType, VehRow>>;
  equipment: EqRow[];
  jobs: JobRow[];
  sectors: Record<number, SecRow>;
  expeditions: ExpRow[];
  daily: { day: string; counters: Partial<Record<DailyKey, number>>; claimed: Partial<Record<DailyKey, boolean>> };
  notices: Notice[];
}

const ms = (d: Date | string) => new Date(d).getTime();

/* ───────────── создание и загрузка ───────────── */

export async function createPlayer(c: Db, userId: number, callsign: string, commanderName: string, now: number) {
  await c.query(
    `INSERT INTO players(user_id, callsign, commander_name, supplies, parts, fuel, data, res_updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,to_timestamp($8/1000.0))`,
    [userId, callsign, commanderName, START_RESOURCES.supplies, START_RESOURCES.parts, START_RESOURCES.fuel, START_RESOURCES.data, now],
  );
  for (const k of BUILDING_KEYS) await c.query('INSERT INTO buildings(user_id,key,level) VALUES ($1,$2,1)', [userId, k]);
  for (const t of OPERATOR_TYPES) await c.query('INSERT INTO operators(user_id,type,available) VALUES ($1,$2,$3)', [userId, t, START_OPERATORS[t]]);
  await c.query(`INSERT INTO vehicles(user_id,type,level,status) VALUES ($1,'moto',1,'ready')`, [userId]);
}

export async function loadState(c: Db, userId: number): Promise<PS> {
  const pr = await c.query('SELECT * FROM players WHERE user_id=$1 FOR UPDATE', [userId]);
  if (!pr.rowCount) throw new GameError('Игрок не найден');
  const r = pr.rows[0];
  const [b, o, v, e, j, s, x, d] = await Promise.all([
    c.query('SELECT key, level FROM buildings WHERE user_id=$1', [userId]),
    c.query('SELECT * FROM operators WHERE user_id=$1', [userId]),
    c.query('SELECT type, level, status FROM vehicles WHERE user_id=$1', [userId]),
    c.query('SELECT id, type, rarity, level, status, source FROM equipment WHERE user_id=$1 ORDER BY id', [userId]),
    c.query('SELECT * FROM jobs WHERE user_id=$1 AND NOT done ORDER BY end_at, id', [userId]),
    c.query('SELECT * FROM sectors WHERE user_id=$1', [userId]),
    c.query(`SELECT * FROM expeditions WHERE user_id=$1 AND status='active' ORDER BY end_at, id`, [userId]),
    c.query('SELECT day::text AS day, counters, claimed FROM daily WHERE user_id=$1 ORDER BY day DESC LIMIT 1', [userId]),
  ]);
  const ps: PS = {
    userId,
    p: {
      callsign: r.callsign, commander_name: r.commander_name, portrait: r.portrait, insignia: r.insignia,
      supplies: r.supplies, parts: r.parts, fuel: r.fuel, data: r.data, res_updated_at: ms(r.res_updated_at),
      tutorial_step: r.tutorial_step, cmd_xp: r.cmd_xp, cmd_level: r.cmd_level, skills: r.skills, free_reset_used: r.free_reset_used, stats: r.stats,
    },
    buildings: Object.fromEntries(b.rows.map((row) => [row.key, row.level])) as Record<BuildingKey, number>,
    ops: Object.fromEntries(o.rows.map((row) => [row.type, { available: row.available, on_mission: row.on_mission, wounded: row.wounded, recovering: row.recovering, lost_total: row.lost_total, trained: row.trained, rank: row.rank }])) as Record<OperatorType, OpRow>,
    vehicles: Object.fromEntries(v.rows.map((row) => [row.type, { level: row.level, status: row.status }])),
    equipment: e.rows.map((row) => ({ ...row })),
    jobs: j.rows.map((row) => ({ id: row.id, queue: row.queue, kind: row.kind, payload: row.payload, cost: row.cost, start_at: ms(row.start_at), end_at: ms(row.end_at), done: row.done })),
    sectors: Object.fromEntries(s.rows.map((row) => [row.sector_id, { recon: row.recon, control: row.control, attempts: row.attempts, successes: row.successes }])),
    expeditions: x.rows.map((row) => ({ ...row, start_at: ms(row.start_at), end_at: ms(row.end_at) })),
    daily: d.rowCount ? { day: d.rows[0].day, counters: d.rows[0].counters, claimed: d.rows[0].claimed } : { day: '', counters: {}, claimed: {} },
    notices: [],
  };
  for (const k of BUILDING_KEYS) ps.buildings[k] ??= 1;
  for (const t of OPERATOR_TYPES) ps.ops[t] ??= { available: 0, on_mission: 0, wounded: 0, recovering: 0, lost_total: 0, trained: 0, rank: 1 };
  return ps;
}

export async function saveState(c: Db, ps: PS) {
  const p = ps.p;
  await c.query(
    `UPDATE players SET callsign=$2, commander_name=$3, portrait=$4, insignia=$5, supplies=$6, parts=$7, fuel=$8, data=$9,
       res_updated_at=to_timestamp($10/1000.0), tutorial_step=$11, cmd_xp=$12, cmd_level=$13, skills=$14, free_reset_used=$15, stats=$16
     WHERE user_id=$1`,
    [ps.userId, p.callsign, p.commander_name, p.portrait, p.insignia, p.supplies, p.parts, p.fuel, p.data, p.res_updated_at,
      p.tutorial_step, p.cmd_xp, p.cmd_level, JSON.stringify(p.skills), p.free_reset_used, JSON.stringify(p.stats)],
  );
  for (const k of BUILDING_KEYS) await c.query('UPDATE buildings SET level=$3 WHERE user_id=$1 AND key=$2', [ps.userId, k, ps.buildings[k]]);
  for (const t of OPERATOR_TYPES) {
    const o = ps.ops[t];
    await c.query(
      `INSERT INTO operators(user_id,type,available,on_mission,wounded,recovering,lost_total,trained,rank) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (user_id,type) DO UPDATE SET available=$3,on_mission=$4,wounded=$5,recovering=$6,lost_total=$7,trained=$8,rank=$9`,
      [ps.userId, t, o.available, o.on_mission, o.wounded, o.recovering, o.lost_total, o.trained, o.rank],
    );
  }
  for (const [t, v] of Object.entries(ps.vehicles)) {
    await c.query(
      `INSERT INTO vehicles(user_id,type,level,status) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,type) DO UPDATE SET level=$3,status=$4`,
      [ps.userId, t, v!.level, v!.status],
    );
  }
  for (const e of ps.equipment) if (e.dirty) await c.query('UPDATE equipment SET level=$2, status=$3 WHERE id=$1', [e.id, e.level, e.status]);
  for (const [id, s] of Object.entries(ps.sectors)) {
    await c.query(
      `INSERT INTO sectors(user_id,sector_id,recon,control,attempts,successes) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id,sector_id) DO UPDATE SET recon=$3,control=$4,attempts=$5,successes=$6`,
      [ps.userId, Number(id), s.recon, s.control, s.attempts, s.successes],
    );
  }
  if (ps.daily.day) {
    await c.query(
      `INSERT INTO daily(user_id,day,counters,claimed) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,day) DO UPDATE SET counters=$3, claimed=$4`,
      [ps.userId, ps.daily.day, JSON.stringify(ps.daily.counters), JSON.stringify(ps.daily.claimed)],
    );
  }
}

/* ───────────── ресурсы ───────────── */

export function caps(ps: PS): Record<ResKey, number> {
  return {
    supplies: storageCap(ps.buildings.supply),
    parts: storageCap(ps.buildings.workshop),
    fuel: storageCap(ps.buildings.fueldepot),
    data: Infinity,
  };
}
export function rates(ps: PS): Record<'supplies' | 'parts' | 'fuel', number> {
  return {
    supplies: productionPerHour('supplies', ps.buildings[PRODUCTION.supplies.building]),
    parts: productionPerHour('parts', ps.buildings[PRODUCTION.parts.building]),
    fuel: productionPerHour('fuel', ps.buildings[PRODUCTION.fuel.building]),
  };
}
/** Производство до момента t. Выше вместимости хранилища производство останавливается, накопленное сверх неё (награды) не сгорает. */
function accrue(ps: PS, t: number) {
  if (t <= ps.p.res_updated_at) return;
  const hours = (t - ps.p.res_updated_at) / 3_600_000;
  const cp = caps(ps);
  const rt = rates(ps);
  for (const r of PRODUCED_KEYS) {
    const cur = ps.p[r];
    if (cur >= cp[r]) continue;
    ps.p[r] = Math.min(cp[r], cur + rt[r] * hours);
  }
  ps.p.res_updated_at = t;
}

export function canAfford(ps: PS, cost: Cost): boolean {
  return RES_KEYS.every((r) => Math.floor(ps.p[r] + 1e-9) >= (cost[r] ?? 0));
}
export function spend(ps: PS, cost: Cost) {
  const lack = RES_KEYS.filter((r) => Math.floor(ps.p[r] + 1e-9) < (cost[r] ?? 0)).map((r) => `${RES_NAMES_LOWER[r]}: нужно ещё ${Math.ceil((cost[r] ?? 0) - ps.p[r])}`);
  if (lack.length) throw new GameError(`Недостаточно ресурсов — ${lack.join(', ')}`);
  for (const r of RES_KEYS) if (cost[r]) ps.p[r] = Math.max(0, ps.p[r] - cost[r]!);
}
export function grant(ps: PS, cost: Cost) {
  for (const r of RES_KEYS) if (cost[r]) ps.p[r] += cost[r]!;
}
const RES_NAMES_LOWER: Record<ResKey, string> = { supplies: 'припасы', parts: 'комплектующие', fuel: 'топливо', data: 'данные' };

export function costText(c: Cost): string {
  return RES_KEYS.filter((r) => c[r]).map((r) => `${RES_NAMES_LOWER[r]} ${c[r]}`).join(', ');
}

/* ───────────── вспомогательное ───────────── */

export function expeditionSlots(ps: PS): number {
  return 1 + (ps.buildings.hq >= HQ_SECOND_SLOT_LEVEL ? 1 : 0) + (ps.p.skills.echelon ?? 0) * SKILL_EFFECTS.echelon;
}
export function sectorState(ps: PS, id: number): SecRow {
  return (ps.sectors[id] ??= { recon: 0, control: 0, attempts: 0, successes: 0 });
}
export function sectorUnlocked(ps: PS, id: number): { ok: boolean; why: string } {
  const s = sectorById(id);
  if (!s) return { ok: false, why: 'Нет такого сектора' };
  if (ps.buildings.comms < s.comms) return { ok: false, why: `Нужен узел связи ${s.comms} уровня` };
  if (s.after.length && !s.after.some((a) => (ps.sectors[a]?.successes ?? 0) > 0)) {
    return { ok: false, why: `Нужен успешный поход в сектор ${s.after.map((a) => String(a).padStart(2, '0')).join(' или ')}` };
  }
  return { ok: true, why: '' };
}
export function touchDaily(ps: PS, now: number) {
  const day = gameDay(now);
  if (ps.daily.day !== day) ps.daily = { day, counters: {}, claimed: {} };
}
export function bumpDaily(ps: PS, now: number, key: DailyKey, n = 1) {
  touchDaily(ps, now);
  ps.daily.counters[key] = (ps.daily.counters[key] ?? 0) + n;
}
export function bumpStat(ps: PS, key: string, n = 1) {
  ps.p.stats[key] = (ps.p.stats[key] ?? 0) + n;
}

export async function addEquipment(c: Db, ps: PS, type: EquipmentType, rarity: Rarity, source: string): Promise<string> {
  if (ps.equipment.length >= EQUIPMENT_LIMIT) {
    const comp = { parts: { common: 60, improved: 150, rare: 300 }[rarity] };
    grant(ps, comp);
    return `Склад оснащения заполнен: ${EQUIPMENT[type].name} разобран, получено комплектующих ${comp.parts}`;
  }
  const r = await c.query('INSERT INTO equipment(user_id,type,rarity,source) VALUES ($1,$2,$3,$4) RETURNING id', [ps.userId, type, rarity, source]);
  ps.equipment.push({ id: r.rows[0].id, type, rarity, level: 1, status: 'ready', source });
  return `Получено оснащение: ${EQUIPMENT[type].name} (${RARITY_NAMES[rarity].toLowerCase()})`;
}

/* ───────────── досчёт времени ───────────── */

export async function settle(c: Db, ps: PS, now: number) {
  touchDaily(ps, now);
  type Ev = { t: number; job?: JobRow; exp?: ExpRow };
  const events: Ev[] = [
    ...ps.jobs.filter((j) => !j.done && j.end_at <= now).map((job) => ({ t: job.end_at, job })),
    ...ps.expeditions.filter((x) => x.status === 'active' && x.end_at <= now).map((exp) => ({ t: exp.end_at, exp })),
  ].sort((a, b) => a.t - b.t);
  for (const ev of events) {
    accrue(ps, ev.t);
    if (ev.job) await completeJob(c, ps, ev.job, ev.t);
    else if (ev.exp) await completeExpedition(c, ps, ev.exp, ev.t);
  }
  accrue(ps, now);
  ps.jobs = ps.jobs.filter((j) => !j.done);
  ps.expeditions = ps.expeditions.filter((x) => x.status === 'active');
  await checkTutorial(c, ps);
}

async function completeJob(c: Db, ps: PS, job: JobRow, t: number) {
  const upd = await c.query('UPDATE jobs SET done=true WHERE id=$1 AND NOT done', [job.id]);
  job.done = true;
  if (!upd.rowCount) return;
  const pl = job.payload;
  switch (job.kind) {
    case 'build': {
      const k = pl.building as BuildingKey;
      ps.buildings[k] = Math.max(ps.buildings[k], pl.toLevel);
      bumpStat(ps, 'buildsDone');
      bumpDaily(ps, t, 'build');
      ps.notices.push({ kind: 'success', text: `${BUILDINGS[k].name}: улучшено до ${pl.toLevel} уровня` });
      break;
    }
    case 'train': {
      const type = pl.type as OperatorType;
      ps.ops[type].available += pl.count;
      ps.ops[type].trained += pl.count;
      bumpDaily(ps, t, 'train', pl.count);
      ps.notices.push({ kind: 'success', text: `${OPERATORS[type].name}: подготовлено ${pl.count}` });
      break;
    }
    case 'rank': {
      const type = pl.type as OperatorType;
      ps.ops[type].rank = Math.max(ps.ops[type].rank, pl.toRank);
      ps.notices.push({ kind: 'success', text: `${OPERATORS[type].name}: ранг ${pl.toRank}` });
      break;
    }
    case 'recover': {
      let n = 0;
      for (const [type, cnt] of Object.entries(pl.counts as Record<OperatorType, number>)) {
        const o = ps.ops[type as OperatorType];
        const k = Math.min(cnt, o.recovering);
        o.recovering -= k;
        o.available += k;
        n += k;
      }
      ps.notices.push({ kind: 'success', text: `Восстановление завершено: в строй вернулись ${n}` });
      break;
    }
    case 'vehicle_acquire': {
      const type = pl.type as VehicleType;
      if (!ps.vehicles[type]) ps.vehicles[type] = { level: 1, status: 'ready' };
      ps.notices.push({ kind: 'success', text: `Автопарк: ${VEHICLES[type].name} готов` });
      break;
    }
    case 'vehicle_upgrade': {
      const v = ps.vehicles[pl.type as VehicleType];
      if (v) {
        v.level = Math.max(v.level, pl.toLevel);
        v.status = 'ready';
      }
      ps.notices.push({ kind: 'success', text: `${VEHICLES[pl.type as VehicleType].name}: уровень ${pl.toLevel}` });
      break;
    }
    case 'vehicle_repair': {
      const v = ps.vehicles[pl.type as VehicleType];
      if (v) v.status = 'ready';
      ps.notices.push({ kind: 'success', text: `${VEHICLES[pl.type as VehicleType].name}: ремонт завершён` });
      break;
    }
    case 'craft': {
      const text = await addEquipment(c, ps, pl.type, pl.rarity, 'Мастерская');
      ps.notices.push({ kind: 'success', text });
      break;
    }
  }
}

async function completeExpedition(c: Db, ps: PS, x: ExpRow, t: number) {
  // Перевод в «завершён» и вставка отчёта — единственная точка выдачи награды за поход
  const upd = await c.query(`UPDATE expeditions SET status='done' WHERE id=$1 AND status='active'`, [x.id]);
  x.status = 'done';
  if (!upd.rowCount) return;
  const res = x.result;
  const sector = sectorById(x.sector_id)!;
  const sec = sectorState(ps, x.sector_id);
  const before = { recon: sec.recon, control: sec.control };

  for (const type of OPERATOR_TYPES) {
    const n = x.group_comp[type] ?? 0;
    if (!n) continue;
    const cas = res.casualties[type] ?? { wounded: 0, lost: 0, fieldRecovered: 0 };
    const o = ps.ops[type];
    o.on_mission = Math.max(0, o.on_mission - n);
    o.available += n - cas.wounded - cas.lost;
    o.wounded += cas.wounded;
    o.lost_total += cas.lost;
  }
  const v = ps.vehicles[x.vehicle];
  if (v && v.status === 'mission') v.status = res.vehicleDamaged ? 'damaged' : 'ready';
  for (const e of ps.equipment) if (x.equipment.includes(e.id)) { e.status = 'ready'; e.dirty = true; }

  grant(ps, res.rewards);
  sec.attempts++;
  if (res.outcome === 'success' || res.outcome === 'decisive') sec.successes++;
  sec.recon = Math.min(100, sec.recon + res.reconGain);
  sec.control = Math.min(100, sec.control + res.controlGain);

  const lvlBefore = ps.p.cmd_level;
  ps.p.cmd_xp += res.xp;
  ps.p.cmd_level = commanderLevel(ps.p.cmd_xp);
  let dropText: string | null = null;
  if (res.equipmentDrop) dropText = await addEquipment(c, ps, res.equipmentDrop.type, res.equipmentDrop.rarity, `Сектор ${String(x.sector_id).padStart(2, '0')}`);

  bumpStat(ps, 'expeditionsDone');
  if (res.outcome === 'success' || res.outcome === 'decisive') bumpStat(ps, 'expeditionsWon');
  bumpStat(ps, 'woundedTotal', res.totalWounded);
  bumpStat(ps, 'lostTotal', res.totalLost);

  const body = {
    expeditionId: x.id,
    sectorId: x.sector_id,
    sectorName: sector.name,
    mission: x.mission,
    missionName: MISSIONS[x.mission].name,
    group: x.group_comp,
    vehicle: x.vehicle,
    equipment: ps.equipment.filter((e) => x.equipment.includes(e.id)).map((e) => ({ type: e.type, rarity: e.rarity, level: e.level })),
    startAt: x.start_at,
    endAt: x.end_at,
    cost: x.cost,
    forecast: { outcomeLow: x.plan.outcomeLow, outcomeHigh: x.plan.outcomeHigh, lossCategory: x.plan.lossCategory },
    outcome: res.outcome,
    ratio: res.ratio,
    casualties: res.casualties,
    totalWounded: res.totalWounded,
    totalLost: res.totalLost,
    totalFieldRecovered: res.totalFieldRecovered,
    vehicleDamaged: res.vehicleDamaged,
    rewards: res.rewards,
    xp: res.xp,
    levelUp: ps.p.cmd_level > lvlBefore ? ps.p.cmd_level : null,
    drop: dropText,
    recon: { before: before.recon, after: sec.recon },
    control: { before: before.control, after: sec.control },
    reasons: res.reasons,
  };
  const ins = await c.query(
    'INSERT INTO reports(user_id, expedition_id, created_at, body) VALUES ($1,$2,to_timestamp($3/1000.0),$4) ON CONFLICT (expedition_id) DO NOTHING',
    [ps.userId, x.id, t, JSON.stringify(body)],
  );
  if (!ins.rowCount) throw new Error('report already exists for expedition ' + x.id);
  ps.notices.push({
    kind: res.outcome === 'fail' ? 'warn' : 'success',
    text: `Поход в сектор ${String(x.sector_id).padStart(2, '0')} завершён: ${OUTCOME_NAMES[res.outcome]}`,
  });
  if (body.levelUp) ps.notices.push({ kind: 'success', text: `Командир достиг ${body.levelUp} уровня — доступен навык` });
}

/* ───────────── обучение ───────────── */

function tutorialDone(ps: PS, step: number): boolean {
  switch (step) {
    case 0: return ps.buildings.hq >= 2;
    case 1: return ps.ops.scout.trained >= 1;
    case 2: return !!ps.vehicles.ebike;
    case 3: return (ps.p.stats.expeditionsDone ?? 0) >= 1;
    case 4: return ps.buildings.training >= 2;
    case 5: return ps.ops.fpv.trained >= 1;
    case 6: return (ps.p.stats.raidWithEquipment ?? 0) >= 1;
    default: return false;
  }
}
export async function checkTutorial(c: Db, ps: PS) {
  while (ps.p.tutorial_step < TUTORIAL.length && tutorialDone(ps, ps.p.tutorial_step)) {
    const st = TUTORIAL[ps.p.tutorial_step];
    grant(ps, st.reward);
    const parts = [costText(st.reward)].filter(Boolean);
    if (st.rewardEquipment) parts.push(await addEquipment(c, ps, st.rewardEquipment.type, st.rewardEquipment.rarity, 'Обучение'));
    ps.notices.push({ kind: 'success', text: `Цель выполнена: ${st.title}. Награда: ${parts.join('; ')}` });
    ps.p.tutorial_step++;
    if (ps.p.tutorial_step === TUTORIAL.length) ps.notices.push({ kind: 'success', text: 'Обучение завершено. Дальше — развитие полигона и новые секторы.' });
  }
}

/* ───────────── представление для клиента ───────────── */

export function view(ps: PS, now: number) {
  const unlocked: Record<number, { ok: boolean; why: string }> = {};
  for (const s of SECTORS) unlocked[s.id] = sectorUnlocked(ps, s.id);
  return {
    serverTime: now,
    player: {
      callsign: ps.p.callsign,
      commanderName: ps.p.commander_name,
      portrait: ps.p.portrait,
      insignia: ps.p.insignia,
    },
    resources: { supplies: ps.p.supplies, parts: ps.p.parts, fuel: ps.p.fuel, data: ps.p.data },
    resAt: ps.p.res_updated_at,
    caps: { ...caps(ps), data: null },
    rates: rates(ps),
    buildings: ps.buildings,
    operators: ps.ops,
    vehicles: ps.vehicles,
    equipment: ps.equipment.map(({ dirty, ...e }) => e),
    jobs: ps.jobs.map((j) => ({ id: j.id, queue: j.queue, kind: j.kind, payload: j.payload, startAt: j.start_at, endAt: j.end_at })),
    sectors: SECTORS.map((s) => ({ id: s.id, ...(ps.sectors[s.id] ?? { recon: 0, control: 0, attempts: 0, successes: 0 }), unlocked: unlocked[s.id].ok, lockReason: unlocked[s.id].why })),
    expeditions: ps.expeditions.map((x) => ({
      id: x.id, sectorId: x.sector_id, mission: x.mission, group: x.group_comp, vehicle: x.vehicle, equipment: x.equipment,
      cost: x.cost, startAt: x.start_at, endAt: x.end_at,
      forecast: { outcomeLow: x.plan.outcomeLow, outcomeHigh: x.plan.outcomeHigh, lossCategory: x.plan.lossCategory },
    })),
    slots: expeditionSlots(ps),
    commander: {
      level: ps.p.cmd_level,
      xp: ps.p.cmd_xp,
      skills: ps.p.skills,
      freeResetUsed: ps.p.free_reset_used,
      stats: ps.p.stats,
    },
    tutorialStep: ps.p.tutorial_step,
    daily: { day: ps.daily.day, counters: ps.daily.counters, claimed: ps.daily.claimed },
    notices: ps.notices,
  };
}
export type StateView = ReturnType<typeof view>;
export { DAILY_KEYS };
