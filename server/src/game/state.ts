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
  AWARDS,
  AWARD_SOURCE_NAME,
  AwardKey,
  MAX_VEHICLE_LEVEL,
  productionPerHour,
  sectorById,
  storageCap,
} from '../../../shared/config.js';
import type { ExpeditionResult, Group, Plan } from '../../../shared/calc.js';
import { CHEVRONS, ChevronProgress, START_CHEVRONS, chevronByKey, chevronEarned } from '../../../shared/chevrons.js';
import { POINTS, researchByKey, seasonEnd, seasonIndex, seasonTheme, weekEnd, weekIndex, weeklyContracts } from '../../../shared/progression.js';
import {
  Meta, Period, SoldierRow, addPoints, companyDamage, defenseOf, loadMeta, playerModParts, playerMods, saveMeta, settleMeta, soldiersAfterExpedition,
  streakInfo, track, trackExpedition,
} from './meta.js';
import type { Db } from '../db.js';

export class GameError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export interface OpRow { available: number; on_mission: number; wounded: number; recovering: number; lost_total: number; trained: number; rank: number }
export interface VehRow { level: number; status: 'ready' | 'mission' | 'damaged' | 'workshop' }
export interface EqRow { id: number; type: EquipmentType; rarity: Rarity; level: number; status: 'ready' | 'mission'; source: string; dirty?: boolean }
export interface JobRow { id: number; queue: 'build' | 'train' | 'workshop' | 'recovery' | 'research'; kind: string; payload: any; cost: Cost; start_at: number; end_at: number; done: boolean }
export interface SecRow { recon: number; control: number; attempts: number; successes: number; control_at?: number | null }
export interface ExpRow {
  id: number; sector_id: number; mission: MissionType; group_comp: Group; vehicle: VehicleType; equipment: number[];
  cost: Cost; plan: Plan; result: ExpeditionResult; start_at: number; end_at: number; status: 'active' | 'done';
}
export interface Notice { kind: 'info' | 'success' | 'warn'; text: string }

export interface PS {
  userId: number;
  p: {
    callsign: string; commander_name: string; portrait: number; chevron: string;
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
  awards: AwardRow[];
  newAwards: { award: string; count: number; reason: string }[];
  chevrons: { key: string; source: string; at: number }[];
  newChevrons: string[];
  meta: Meta;
  research: Set<string>;
  soldiers: SoldierRow[];
  weekly: { week: string; counters: Record<string, number>; claimed: Record<string, boolean> };
  scoreW: Period;
  scoreS: Period;
  companyId: number | null;
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
  for (const k of START_CHEVRONS) await c.query(`INSERT INTO player_chevrons(user_id,chevron,source) VALUES ($1,$2,'start')`, [userId, k]);
}

export async function loadState(c: Db, userId: number): Promise<PS> {
  const pr = await c.query('SELECT * FROM players WHERE user_id=$1 FOR UPDATE', [userId]);
  if (!pr.rowCount) throw new GameError('Игрок не найден');
  const r = pr.rows[0];
  const [b, o, v, e, j, s, x, d, aw, ch] = await Promise.all([
    c.query('SELECT key, level FROM buildings WHERE user_id=$1', [userId]),
    c.query('SELECT * FROM operators WHERE user_id=$1', [userId]),
    c.query('SELECT type, level, status FROM vehicles WHERE user_id=$1', [userId]),
    c.query('SELECT id, type, rarity, level, status, source FROM equipment WHERE user_id=$1 ORDER BY id', [userId]),
    c.query('SELECT * FROM jobs WHERE user_id=$1 AND NOT done ORDER BY end_at, id', [userId]),
    c.query('SELECT * FROM sectors WHERE user_id=$1', [userId]),
    c.query(`SELECT * FROM expeditions WHERE user_id=$1 AND status='active' ORDER BY end_at, id`, [userId]),
    c.query('SELECT day::text AS day, counters, claimed FROM daily WHERE user_id=$1 ORDER BY day DESC LIMIT 1', [userId]),
    c.query('SELECT id, award, count, reason, source, seen, created_at FROM awards WHERE user_id=$1 ORDER BY created_at DESC, id DESC LIMIT 100', [userId]),
    c.query('SELECT chevron, source, created_at FROM player_chevrons WHERE user_id=$1 ORDER BY created_at, chevron', [userId]),
  ]);
  const ps = {
    userId,
    p: {
      callsign: r.callsign, commander_name: r.commander_name, portrait: r.portrait, chevron: r.chevron,
      supplies: r.supplies, parts: r.parts, fuel: r.fuel, data: r.data, res_updated_at: ms(r.res_updated_at),
      tutorial_step: r.tutorial_step, cmd_xp: r.cmd_xp, cmd_level: r.cmd_level, skills: r.skills, free_reset_used: r.free_reset_used, stats: r.stats,
    },
    buildings: Object.fromEntries(b.rows.map((row) => [row.key, row.level])) as Record<BuildingKey, number>,
    ops: Object.fromEntries(o.rows.map((row) => [row.type, { available: row.available, on_mission: row.on_mission, wounded: row.wounded, recovering: row.recovering, lost_total: row.lost_total, trained: row.trained, rank: row.rank }])) as Record<OperatorType, OpRow>,
    vehicles: Object.fromEntries(v.rows.map((row) => [row.type, { level: row.level, status: row.status }])),
    equipment: e.rows.map((row) => ({ ...row })),
    jobs: j.rows.map((row) => ({ id: row.id, queue: row.queue, kind: row.kind, payload: row.payload, cost: row.cost, start_at: ms(row.start_at), end_at: ms(row.end_at), done: row.done })),
    sectors: Object.fromEntries(s.rows.map((row) => [row.sector_id, { recon: row.recon, control: row.control, attempts: row.attempts, successes: row.successes, control_at: row.control_at ? ms(row.control_at) : null }])),
    expeditions: x.rows.map((row) => ({ ...row, start_at: ms(row.start_at), end_at: ms(row.end_at) })),
    daily: d.rowCount ? { day: d.rows[0].day, counters: d.rows[0].counters, claimed: d.rows[0].claimed } : { day: '', counters: {}, claimed: {} },
    notices: [],
    awards: aw.rows.map((r) => ({ ...r, created_at: ms(r.created_at) })),
    newAwards: [],
    chevrons: ch.rows.map((row) => ({ key: row.chevron, source: row.source, at: ms(row.created_at) })),
    newChevrons: [],
  } as unknown as PS;
  await loadMeta(c, ps, r, Date.now());
  for (const k of BUILDING_KEYS) ps.buildings[k] ??= 1;
  for (const t of OPERATOR_TYPES) ps.ops[t] ??= { available: 0, on_mission: 0, wounded: 0, recovering: 0, lost_total: 0, trained: 0, rank: 1 };
  return ps;
}

export async function saveState(c: Db, ps: PS) {
  const p = ps.p;
  await c.query(
    `UPDATE players SET callsign=$2, commander_name=$3, portrait=$4, chevron=$5, supplies=$6, parts=$7, fuel=$8, data=$9,
       res_updated_at=to_timestamp($10/1000.0), tutorial_step=$11, cmd_xp=$12, cmd_level=$13, skills=$14, free_reset_used=$15, stats=$16
     WHERE user_id=$1`,
    [ps.userId, p.callsign, p.commander_name, p.portrait, p.chevron, p.supplies, p.parts, p.fuel, p.data, p.res_updated_at,
      p.tutorial_step, p.cmd_xp, p.cmd_level, JSON.stringify(p.skills), p.free_reset_used, JSON.stringify(p.stats)],
  );
  for (const k of BUILDING_KEYS)
    await c.query('INSERT INTO buildings(user_id,key,level) VALUES ($1,$2,$3) ON CONFLICT (user_id,key) DO UPDATE SET level=$3', [ps.userId, k, ps.buildings[k]]);
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
      `INSERT INTO sectors(user_id,sector_id,recon,control,attempts,successes,control_at) VALUES ($1,$2,$3,$4,$5,$6,to_timestamp($7/1000.0))
       ON CONFLICT (user_id,sector_id) DO UPDATE SET recon=$3,control=$4,attempts=$5,successes=$6,control_at=to_timestamp($7/1000.0)`,
      [ps.userId, Number(id), s.recon, s.control, s.attempts, s.successes, s.control_at ?? null],
    );
  }
  if (ps.daily.day) {
    await c.query(
      `INSERT INTO daily(user_id,day,counters,claimed) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,day) DO UPDATE SET counters=$3, claimed=$4`,
      [ps.userId, ps.daily.day, JSON.stringify(ps.daily.counters), JSON.stringify(ps.daily.claimed)],
    );
  }
  await saveMeta(c, ps);
}

/* ───────────── ресурсы ───────────── */

export function caps(ps: PS): Record<ResKey, number> {
  const k = 1 + Math.max(-0.5, playerMods(ps).storage);
  return {
    supplies: Math.round(storageCap(ps.buildings.supply) * k),
    parts: Math.round(storageCap(ps.buildings.workshop) * k),
    fuel: Math.round(storageCap(ps.buildings.fueldepot) * k),
    data: Infinity,
  };
}
export function rates(ps: PS): Record<'supplies' | 'parts' | 'fuel', number> {
  const k = 1 + Math.max(-0.5, playerMods(ps).production);
  return {
    supplies: Math.round(productionPerHour('supplies', ps.buildings[PRODUCTION.supplies.building]) * k),
    parts: Math.round(productionPerHour('parts', ps.buildings[PRODUCTION.parts.building]) * k),
    fuel: Math.round(productionPerHour('fuel', ps.buildings[PRODUCTION.fuel.building]) * k),
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
  // наградные предметы не сгорают из-за заполненного склада
  if (ps.equipment.length >= EQUIPMENT_LIMIT && rarity !== 'award') {
    const comp = { parts: { common: 60, improved: 150, rare: 300, award: 300 }[rarity] };
    grant(ps, comp);
    return `Склад оснащения заполнен: ${EQUIPMENT[type].name} разобран, получено комплектующих ${comp.parts}`;
  }
  const r = await c.query('INSERT INTO equipment(user_id,type,rarity,source) VALUES ($1,$2,$3,$4) RETURNING id', [ps.userId, type, rarity, source]);
  ps.equipment.push({ id: r.rows[0].id, type, rarity, level: 1, status: 'ready', source });
  return `Получено оснащение: ${EQUIPMENT[type].name} (${RARITY_NAMES[rarity].toLowerCase()})`;
}

/* ───────────── награды за заслуги ───────────── */

export interface AwardRow { id: number; award: string; count: number; reason: string; source: string; seen: boolean; created_at: number }

/** Выдаёт награду из каталога: бойца, транспорт или предмет оснащения. Повторный транспорт повышает его уровень. */
export async function applyAward(c: Db, ps: PS, key: AwardKey, count: number): Promise<string> {
  const def = AWARDS[key];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    if (def.kind === 'operator') {
      ps.ops[key as OperatorType].available += 1;
    } else if (def.kind === 'vehicle') {
      const v = ps.vehicles[key as VehicleType];
      if (!v) ps.vehicles[key as VehicleType] = { level: 1, status: 'ready' };
      else if (v.level < MAX_VEHICLE_LEVEL) v.level++;
      else grant(ps, { parts: 300 });
    } else {
      await addEquipment(c, ps, key as EquipmentType, 'award', AWARD_SOURCE_NAME);
    }
  }
  out.push(`${def.name}${count > 1 ? ` ×${count}` : ''}`);
  return out.join(', ');
}

export function awardName(key: string): string {
  return AWARDS[key as AwardKey]?.name ?? (chevronByKey(key) ? `шеврон «${chevronByKey(key)!.name}»` : key);
}

/** Добавляет шеврон в коллекцию (повтор игнорируется). */
export async function grantChevron(c: Db, ps: PS, key: string, source: string): Promise<boolean> {
  if (ps.chevrons.some((x) => x.key === key)) return false;
  const r = await c.query('INSERT INTO player_chevrons(user_id,chevron,source) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [ps.userId, key, source]);
  if (!r.rowCount) return false;
  ps.chevrons.push({ key, source, at: Date.now() });
  return true;
}

export function chevronProgressOf(ps: PS): ChevronProgress {
  return {
    stats: ps.p.stats,
    level: ps.p.cmd_level,
    tutorialDone: ps.p.tutorial_step >= TUTORIAL.length,
    controlled: Object.values(ps.sectors).filter((x) => x.control >= 100).length,
    trained: OPERATOR_TYPES.reduce((s, t) => s + ps.ops[t].trained, 0),
  };
}

/** Открывает шевроны за достижения, условия которых выполнены. */
export async function checkChevrons(c: Db, ps: PS) {
  const prog = chevronProgressOf(ps);
  for (const ch of CHEVRONS) {
    if (ch.category !== 'game' || !chevronEarned(ch, prog)) continue;
    if (await grantChevron(c, ps, ch.key, 'game')) {
      ps.newChevrons.push(ch.key);
      ps.notices.push({ kind: 'success', text: `Новый шеврон: «${ch.name}»` });
    }
  }
}

/* ───────────── досчёт времени ───────────── */

export async function settle(c: Db, ps: PS, now: number, opts: { showAwards?: boolean } = {}) {
  touchDaily(ps, now);
  // помощь сослуживцев по роте сокращает текущую стройку
  const helps = await c.query('UPDATE company_helps SET applied=true WHERE target_id=$1 AND NOT applied RETURNING job_id, seconds', [ps.userId]);
  for (const h of helps.rows) {
    const job = ps.jobs.find((j) => j.id === Number(h.job_id) && !j.done);
    if (!job) continue;
    job.end_at = Math.max(job.start_at, job.end_at - h.seconds * 1000);
    await c.query('UPDATE jobs SET end_at=to_timestamp($2/1000.0) WHERE id=$1', [job.id, job.end_at]);
  }
  if (helps.rowCount) ps.notices.push({ kind: 'success', text: `Сослуживцы помогли со стройкой: ${helps.rowCount} раз(а)` });
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
  // новые награды за заслуги: показать игроку один раз
  const unseen = opts.showAwards === false ? [] : ps.awards.filter((a) => !a.seen);
  if (unseen.length) {
    await c.query('UPDATE awards SET seen=true WHERE user_id=$1 AND NOT seen', [ps.userId]);
    for (const a of unseen.reverse()) {
      a.seen = true;
      ps.newAwards.push({ award: a.award, count: a.count, reason: a.reason });
      ps.notices.push({ kind: 'success', text: `Награда за заслуги: ${awardName(a.award)}${a.count > 1 ? ` ×${a.count}` : ''}${a.reason ? ` — ${a.reason}` : ''}` });
    }
  }
  await settleMeta(c, ps, now);
  ps.jobs = ps.jobs.filter((j) => !j.done);
  ps.expeditions = ps.expeditions.filter((x) => x.status === 'active');
  await checkTutorial(c, ps);
  await checkChevrons(c, ps);
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
      track(ps, 'build');
      addPoints(ps, POINTS.build);
      ps.notices.push({ kind: 'success', text: `${BUILDINGS[k].name}: улучшено до ${pl.toLevel} уровня` });
      break;
    }
    case 'train': {
      const type = pl.type as OperatorType;
      ps.ops[type].available += pl.count;
      ps.ops[type].trained += pl.count;
      bumpDaily(ps, t, 'train', pl.count);
      track(ps, 'trained', pl.count);
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
        bumpStat(ps, 'recovered', k);
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
    case 'research': {
      const def = researchByKey(pl.key);
      if (def && !ps.research.has(def.key)) {
        ps.research.add(def.key);
        await c.query('INSERT INTO research(user_id,key) VALUES ($1,$2) ON CONFLICT DO NOTHING', [ps.userId, def.key]);
        bumpStat(ps, 'researchDone');
        track(ps, 'research');
        addPoints(ps, POINTS.research);
        ps.notices.push({ kind: 'success', text: `Исследование завершено: «${def.name}»` });
      }
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
  const isPvp = x.mission === 'pvp';
  const target = (x.plan as any).target as { id: number; callsign: string } | undefined;
  const sector = isPvp ? { name: `Полигон «${target?.callsign ?? '?'}»`, difficulty: 3 } : sectorById(x.sector_id)!;
  const sec = isPvp ? { recon: 0, control: 0, attempts: 0, successes: 0 } : sectorState(ps, x.sector_id);
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
  if (res.controlGain > 0) sec.control_at = t;
  const soldierNews = soldiersAfterExpedition(ps, x, res, t, sector.difficulty, Number((x as any).seed ?? x.id));
  trackExpedition(ps, x, res, sector.difficulty);
  const dmg = await companyDamage(c, ps, x, res, sector.difficulty, ps.scoreW.period);

  const lvlBefore = ps.p.cmd_level;
  ps.p.cmd_xp += res.xp;
  ps.p.cmd_level = commanderLevel(ps.p.cmd_xp);
  let dropText: string | null = null;
  if (res.equipmentDrop) dropText = await addEquipment(c, ps, res.equipmentDrop.type, res.equipmentDrop.rarity, `Сектор ${String(x.sector_id).padStart(2, '0')}`);

  bumpStat(ps, 'expeditionsDone');
  if (res.outcome === 'fail') bumpStat(ps, 'failed');
  if (res.outcome === 'decisive') bumpStat(ps, 'decisive');
  if (res.totalFieldRecovered) bumpStat(ps, 'recovered', res.totalFieldRecovered);
  if (res.outcome === 'success' || res.outcome === 'decisive') {
    bumpStat(ps, 'expeditionsWon');
    bumpStat(ps, `won_${x.mission}`);
    if (res.totalWounded + res.totalLost + res.totalFieldRecovered === 0) bumpStat(ps, 'flawless');
  }
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
    kind: isPvp ? 'pvp_attack' : 'expedition',
    target: target ?? null,
    soldiers: soldierNews,
    companyDamage: dmg,
  };
  const ins = await c.query(
    'INSERT INTO reports(user_id, expedition_id, created_at, body) VALUES ($1,$2,to_timestamp($3/1000.0),$4) ON CONFLICT (expedition_id) DO NOTHING',
    [ps.userId, x.id, t, JSON.stringify(body)],
  );
  if (!ins.rowCount) throw new Error('report already exists for expedition ' + x.id);
  ps.notices.push({
    kind: res.outcome === 'fail' ? 'warn' : 'success',
    text: isPvp ? `Набег на ${sector.name}: ${OUTCOME_NAMES[res.outcome]}` : `Поход в сектор ${String(x.sector_id).padStart(2, '0')} завершён: ${OUTCOME_NAMES[res.outcome]}`,
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
      chevron: ps.p.chevron,
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
    awards: ps.awards.map((a) => ({ id: a.id, award: a.award, count: a.count, reason: a.reason, at: a.created_at })),
    newAwards: ps.newAwards,
    chevrons: ps.chevrons,
    newChevrons: ps.newChevrons,
    research: [...ps.research],
    soldiers: ps.soldiers.filter((x) => x.status !== 'retired').map(({ dirty, ...x }) => x),
    weekly: { week: ps.weekly.week, counters: ps.weekly.counters, claimed: ps.weekly.claimed },
    contracts: weeklyContracts(ps.userId, weekIndex(now), ps.p.cmd_level, ps.companyId != null),
    week: { index: weekIndex(now), points: ps.scoreW.points, endsAt: weekEnd(weekIndex(now)) },
    season: { index: seasonIndex(now), points: ps.scoreS.points, counters: ps.scoreS.counters, endsAt: seasonEnd(seasonIndex(now)), theme: seasonTheme(seasonIndex(now)).key },
    streak: streakInfo(ps, now),
    modParts: playerModParts(ps, now),
    prestige: ps.meta.prestige,
    companyId: ps.companyId,
    siteLinked: !!ps.meta.siteUserId,
    linkCode: ps.meta.linkCode && (ps.meta.linkCodeExp ?? 0) > now ? { code: ps.meta.linkCode, until: ps.meta.linkCodeExp } : null,
    defense: defenseOf(ps, now),
    createdAt: ps.meta.createdAt,
  };
}
export type StateView = ReturnType<typeof view>;
export { DAILY_KEYS };
