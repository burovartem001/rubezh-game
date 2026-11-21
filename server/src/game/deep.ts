/**
 * Глубина полигона и сюжет на сервере: модели дронов и чертежи, износ и ремонт, передовые пункты,
 * сюжетная кампания, события выходных, достижения, случайные встречи и талисманы.
 */
import crypto from 'node:crypto';
import {
  Cost, EQUIPMENT, OPERATORS, OPERATOR_TYPES, OperatorType, RES_KEYS, SECTORS, sectorById, MissionType, VEHICLES,
} from '../../../shared/config.js';
import { CHEVRONS } from '../../../shared/chevrons.js';
import {
  ACHIEVEMENTS, ACH_POINTS, ACH_REWARD, BLUEPRINT_PARTS, BUILDING_FX, CAMPAIGN, CampaignReward, CampaignStep, DRONE_PARTS, DRONE_SLOTS, DroneSlot,
  ENCOUNTERS, ENCOUNTER_CHANCE, EQUIP_WEAR_PER_MISSION, EVENTS, MASCOTS, MODEL_CLASSES, MODEL_COLORS, MODEL_WEAR_PER_MISSION, OUTPOST, WORKSHOP_DISCOUNT,
  achTier, eventKey, eventWindow, modelCost, modelTime, modelsBonus, partByKey, repairDiscount, wearCut,
} from '../../../shared/content.js';
import { ATTACK_LOOKBACK, ATTACK_WINDOW, EPOCH, Mods, attackInWindow, seasonIndex, seasonTheme } from '../../../shared/progression.js';
import { ExpeditionResult, rng } from '../../../shared/calc.js';
import type { Db } from '../db.js';
import { bestOutpostFor, deepParts, equipRepairCostOf, modelRepairCostOf, workshopMulAt } from '../../../shared/deepcalc.js';
import { ExpRow, GameError, PS, bumpStat, costText, grant, grantChevron, spend } from './state.js';
import { defenseOf, track, grantNamedSoldier, ModPart } from './meta.js';

/* ───────────── типы и загрузка ───────────── */

export interface ModelRow { cls: OperatorType; name: string; color: string; parts: Record<DroneSlot, string>; durability: number; built_at: number; dirty?: boolean }
export interface OutpostRow { id: number; sector_id: number; level: number; checked_at: number; dirty?: boolean; removed?: boolean }
export interface Campaign { step: number; flags: Record<string, string> }

const ms = (d: Date | string) => new Date(d).getTime();

export async function loadDeep(c: Db, ps: PS, row: any) {
  const [bp, md, op] = await Promise.all([
    c.query('SELECT part FROM blueprints WHERE user_id=$1', [ps.userId]),
    c.query('SELECT cls, name, color, parts, durability, built_at FROM drone_models WHERE user_id=$1', [ps.userId]),
    c.query('SELECT id, sector_id, level, checked_at FROM outposts WHERE user_id=$1 ORDER BY id', [ps.userId]),
  ]);
  ps.blueprints = new Set(bp.rows.map((r) => r.part));
  ps.models = md.rows.map((r) => ({ ...r, built_at: ms(r.built_at) }));
  ps.outposts = op.rows.map((r) => ({ id: Number(r.id), sector_id: r.sector_id, level: r.level, checked_at: ms(r.checked_at) }));
  ps.campaign = { step: row.campaign?.step ?? 0, flags: row.campaign?.flags ?? {} };
  ps.newEncounters = 0;
}

export async function saveDeep(c: Db, ps: PS) {
  for (const m of ps.models) {
    if (!m.dirty) continue;
    await c.query(
      `INSERT INTO drone_models(user_id, cls, name, color, parts, durability, built_at) VALUES ($1,$2,$3,$4,$5,$6,to_timestamp($7/1000.0))
       ON CONFLICT (user_id, cls) DO UPDATE SET name=$3, color=$4, parts=$5, durability=$6, built_at=to_timestamp($7/1000.0)`,
      [ps.userId, m.cls, m.name, m.color, JSON.stringify(m.parts), m.durability, m.built_at],
    );
    m.dirty = false;
  }
  for (const o of ps.outposts) {
    if (o.removed) await c.query('DELETE FROM outposts WHERE id=$1 AND user_id=$2', [o.id, ps.userId]);
    else if (o.dirty) await c.query('UPDATE outposts SET level=$2, checked_at=to_timestamp($3/1000.0) WHERE id=$1', [o.id, o.level, o.checked_at]);
    o.dirty = false;
  }
  ps.outposts = ps.outposts.filter((o) => !o.removed);
  await c.query('UPDATE players SET campaign=$2 WHERE user_id=$1', [ps.userId, JSON.stringify(ps.campaign)]);
}

/* ───────────── бонусы полигона ───────────── */

export function deepModParts(ps: PS): ModPart[] {
  const parts: ModPart[] = [];
  const b = ps.buildings;
  const m: Partial<Mods> = {};
  if (b.medbay) m.recovery = BUILDING_FX.medbay.recovery * b.medbay;
  if (b.analytics) {
    m.uncertainty = BUILDING_FX.analytics.uncertainty * b.analytics;
    m.data = BUILDING_FX.analytics.data * b.analytics;
  }
  if (Object.keys(m).length) parts.push({ label: 'Здания полигона', mods: m });
  for (const [k, def] of Object.entries(MASCOTS)) if (ps.p.stats[`mascot_${k}`]) parts.push({ label: def.name, mods: def.mods });
  return parts;
}
export function eventNow(now: number) {
  return eventWindow(now, EPOCH);
}
/** Части бонусов конкретного похода от моделей, передовых пунктов, события и ночного задания кампании. */
export function deepDispatchParts(ps: PS, sectorId: number, group: Partial<Record<OperatorType, number>>, now: number, night: boolean): ModPart[] {
  return deepParts({ models: ps.models, outposts: ps.outposts, testrange: ps.buildings.testrange ?? 0 }, sectorId, group, now, night);
}
export function bestOutpost(ps: PS, sectorId: number): OutpostRow | null {
  return bestOutpostFor(ps.outposts, sectorId);
}
export function workshopMul(now: number) {
  return workshopMulAt(now);
}

/* ───────────── чертежи ───────────── */

export async function grantBlueprint(c: Db, ps: PS, part: string | 'random', source: string): Promise<string | null> {
  let key = part;
  if (part === 'random') {
    const locked = BLUEPRINT_PARTS.filter((p) => !ps.blueprints.has(p));
    if (!locked.length) return null;
    key = locked[crypto.randomInt(locked.length)];
  }
  if (ps.blueprints.has(key)) return null;
  await c.query('INSERT INTO blueprints(user_id, part, source) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [ps.userId, key, source]);
  ps.blueprints.add(key);
  const name = partByKey(key)?.name ?? key;
  ps.notices.push({ kind: 'success', text: `Новый чертёж: «${name}»` });
  return name;
}

/* ───────────── после похода: износ, кампания, встречи, чертежи ───────────── */

export async function afterExpeditionDeep(c: Db, ps: PS, x: ExpRow, res: ExpeditionResult, t: number): Promise<Record<string, unknown>> {
  const extra: Record<string, unknown> = {};
  const cut = 1 - wearCut(ps.buildings.repairyard ?? 0);
  // износ оснащения и моделей
  const worn: string[] = [];
  for (const e of ps.equipment) {
    if (!x.equipment.includes(e.id)) continue;
    e.durability = Math.max(0, (e.durability ?? 100) - Math.round(EQUIP_WEAR_PER_MISSION * cut));
    e.dirty = true;
    if (e.durability === 0) worn.push(EQUIPMENT[e.type].name);
  }
  for (const m of ps.models) {
    if (!(x.group_comp[m.cls] ?? 0) || m.built_at > x.start_at) continue;
    m.durability = Math.max(0, m.durability - Math.round(MODEL_WEAR_PER_MISSION * cut));
    m.dirty = true;
    if (m.durability === 0) worn.push(`модель «${m.name}»`);
  }
  if (worn.length) {
    extra.broken = worn;
    ps.notices.push({ kind: 'warn', text: `Нужен ремонт: ${worn.join(', ')}` });
  }
  const won = res.outcome === 'success' || res.outcome === 'decisive';
  // кампания
  const key = (x.plan as any).campaign as string | undefined;
  const step = CAMPAIGN[ps.campaign.step];
  if (key && step && step.key === key && won) {
    extra.campaign = { title: step.title, chapter: step.chapter };
    await advanceCampaign(c, ps, step);
  }
  // чертёж с опорного пункта
  const rand = rng(Number((x as any).seed ?? x.id) ^ 0xbeef);
  if (won && x.mission === 'stronghold' && rand() < 0.25) {
    const name = await grantBlueprint(c, ps, 'random', 'Трофей опорного пункта');
    if (name) extra.blueprint = name;
  }
  // случайная встреча
  if (x.mission !== 'pvp' && rand() < ENCOUNTER_CHANCE) {
    const enc = ENCOUNTERS[Math.floor(rand() * ENCOUNTERS.length)];
    extra.encounter = { key: enc.key, resolved: false };
    ps.newEncounters++;
  }
  return extra;
}

/* ───────────── кампания ───────────── */

export async function applyCampaignReward(c: Db, ps: PS, r: CampaignReward | undefined, source: string): Promise<string[]> {
  const out: string[] = [];
  if (!r) return out;
  if (r.res) {
    const neg: Cost = {};
    const pos: Cost = {};
    for (const k of RES_KEYS) {
      const v = r.res[k] ?? 0;
      if (v < 0) neg[k] = -v;
      else if (v > 0) pos[k] = v;
    }
    if (Object.keys(neg).length) spend(ps, neg);
    grant(ps, pos);
    if (Object.keys(pos).length) out.push(costText(pos));
  }
  if (r.blueprint) {
    const n = await grantBlueprint(c, ps, r.blueprint, source);
    if (n) out.push(`чертёж «${n}»`);
  }
  if (r.chevron && (await grantChevron(c, ps, r.chevron, 'story'))) {
    ps.newChevrons.push(r.chevron);
    out.push(`шеврон «${CHEVRONS.find((x) => x.key === r.chevron)?.name}»`);
  }
  if (r.soldier) {
    await grantNamedSoldier(c, ps, r.soldier.type, r.soldier.name, r.soldier.trait);
    out.push(`боец «${r.soldier.name}» (${OPERATORS[r.soldier.type].name.toLowerCase()})`);
  }
  return out;
}
async function advanceCampaign(c: Db, ps: PS, step: CampaignStep, reward?: CampaignReward) {
  const got = await applyCampaignReward(c, ps, reward ?? step.reward, `Кампания: ${step.title}`);
  ps.campaign.step++;
  bumpStat(ps, 'campaignSteps');
  ps.notices.push({ kind: 'success', text: `Кампания: «${step.title}» выполнено${got.length ? `. Награда: ${got.join(', ')}` : ''}` });
}
function goalDone(ps: PS, step: CampaignStep): boolean {
  const g = step.goal;
  if (!g) return false;
  switch (g.kind) {
    case 'building': return (ps.buildings[g.key as keyof PS['buildings']] ?? 0) >= g.value;
    case 'stat': return (ps.p.stats[g.key!] ?? 0) >= g.value;
    case 'research': return ps.research.has(g.key!);
    case 'model': return ps.models.length >= g.value;
    case 'outpost': return ps.outposts.filter((o) => !o.removed && o.level > 0).length >= g.value;
    case 'control': return Object.values(ps.sectors).filter((s) => s.control >= 100).length >= g.value;
  }
}
export async function checkCampaignGoals(c: Db, ps: PS) {
  let guard = 0;
  while (guard++ < 5) {
    const st = CAMPAIGN[ps.campaign.step];
    if (!st || st.kind !== 'goal' || !goalDone(ps, st)) return;
    await advanceCampaign(c, ps, st);
  }
}
/** Проверки задания кампании при отправке группы. Возвращает сектор с изменённой сложностью. */
export function campaignMissionCheck(ps: PS, key: string, sectorId: number, mission: MissionType, group: Partial<Record<OperatorType, number>>, vehicle: string) {
  const st = CAMPAIGN[ps.campaign.step];
  if (!st || st.key !== key || st.kind !== 'mission') throw new GameError('Это задание кампании сейчас недоступно');
  if (st.sectorId !== sectorId || st.mission !== mission) throw new GameError('Задание кампании — в другом секторе');
  const size = OPERATOR_TYPES.reduce((s, t) => s + (group[t] ?? 0), 0);
  if (st.onlyTypes && OPERATOR_TYPES.some((t) => (group[t] ?? 0) > 0 && !st.onlyTypes!.includes(t)))
    throw new GameError(`В этом задании только: ${st.onlyTypes.map((t) => OPERATORS[t].name.toLowerCase()).join(', ')}`);
  if (st.minSize && size < st.minSize) throw new GameError(`Нужно не меньше ${st.minSize} операторов`);
  if (st.vehicles && !st.vehicles.includes(vehicle as never)) throw new GameError(`Транспорт: ${st.vehicles.map((v) => VEHICLES[v].name).join(' или ')}`);
  if (st.needModel && !ps.models.some((m) => (group[m.cls] ?? 0) > 0 && m.durability > 0)) throw new GameError('Нужна исправная модель дрона хотя бы для одного класса в группе');
  return st;
}

/* ───────────── передовые пункты: атаки ───────────── */

async function outpostAttacks(c: Db, ps: PS, now: number) {
  if (!ps.outposts.length) return;
  const theme = seasonTheme(seasonIndex(now)).key;
  const ev = eventNow(now);
  for (const o of ps.outposts) {
    if (o.removed || o.level <= 0) continue;
    const start = Math.max(o.checked_at, now - ATTACK_LOOKBACK);
    const diff = sectorById(o.sector_id)?.difficulty ?? 1;
    for (let w = Math.floor(start / ATTACK_WINDOW); w <= Math.floor(now / ATTACK_WINDOW); w++) {
      const a = attackInWindow(ps.userId * 97 + o.id, w, diff, theme, ev.active ? ev.event.attackBoost ?? 0 : 0);
      if (!a || a.at <= start || a.at > now || o.level <= 0) continue;
      ps.clock = a.at;
      // улучшение, законченное в этом досчёте позже атаки, на момент атаки ещё не действовало
      const lateUp = ps.jobs.some((j) => j.done && j.kind === 'outpost_upgrade' && j.payload?.id === o.id && j.end_at > a.at);
      const lvlAt = Math.max(1, o.level - (lateUp ? 1 : 0));
      const rand = rng(o.id * 31 + w);
      const defense = OUTPOST.defense(lvlAt, defenseOf(ps, a.at)) * (0.85 + rand() * 0.3);
      const won = defense >= a.strength;
      const before = o.level;
      const name = sectorById(o.sector_id)?.name ?? '?';
      if (won) {
        grant(ps, { parts: 15 * o.level });
        bumpStat(ps, 'defended');
        track(ps, 'defended');
      } else {
        o.level--;
        if (o.level <= 0) o.removed = true;
        const sec = ps.sectors[o.sector_id];
        if (sec) sec.control = Math.max(0, sec.control - 20);
      }
      o.dirty = true;
      await c.query('INSERT INTO reports(user_id, expedition_id, created_at, body) VALUES ($1,NULL,to_timestamp($2/1000.0),$3)', [
        ps.userId, a.at, JSON.stringify({ kind: 'outpost', at: a.at, won, attack: a.strength, defense: Math.round(defense), sectorName: name, before, after: o.level, reward: won ? { parts: 15 * before } : {} }),
      ]);
      ps.notices.push({ kind: won ? 'success' : 'warn', text: won ? `Передовой пункт у «${name}» отбил атаку` : o.removed ? `Передовой пункт у «${name}» потерян` : `Передовой пункт у «${name}» повреждён` });
    }
    o.checked_at = now;
    o.dirty = true;
  }
  ps.clock = undefined;
}

/* ───────────── достижения ───────────── */

function achValue(ps: PS, source: string): number {
  switch (source) {
    case '_trained': return OPERATOR_TYPES.reduce((s, t) => s + ps.ops[t].trained, 0);
    case '_chevrons': return ps.chevrons.length;
    case '_maxed': return ps.soldiers.filter((s) => s.level >= 5 && s.status !== 'retired' && s.status !== 'lost').length;
    case '_campaign': return ps.campaign.step;
    default: return ps.p.stats[source] ?? 0;
  }
}
export function achievementsView(ps: PS) {
  return ACHIEVEMENTS.map((a) => ({ key: a.key, value: achValue(ps, a.source), tier: ps.p.stats[`ach:${a.key}`] ?? 0 }));
}
export async function checkAchievements(ps: PS) {
  let points = 0;
  for (const a of ACHIEVEMENTS) {
    const was = ps.p.stats[`ach:${a.key}`] ?? 0;
    const now = achTier(achValue(ps, a.source), a.tiers);
    for (let t = was + 1; t <= now; t++) {
      grant(ps, ACH_REWARD[t - 1]);
      ps.notices.push({ kind: 'success', text: `Достижение «${a.name}» — ${['бронза', 'серебро', 'золото'][t - 1]}! Награда: ${costText(ACH_REWARD[t - 1])}` });
    }
    if (now > was) ps.p.stats[`ach:${a.key}`] = now;
    const tier = Math.max(now, was);
    for (let t = 0; t < tier; t++) points += ACH_POINTS[t];
  }
  ps.p.stats.achPoints = points;
}

/* ───────────── досчёт ───────────── */

export async function settleDeep(c: Db, ps: PS, now: number) {
  await outpostAttacks(c, ps, now);
  await checkCampaignGoals(c, ps);
  await checkAchievements(ps);
}

/* ───────────── представление ───────────── */

export function deepView(ps: PS, now: number) {
  const ev = eventNow(now);
  return {
    blueprints: [...ps.blueprints],
    models: ps.models.map(({ dirty, ...m }) => m),
    outposts: ps.outposts.filter((o) => !o.removed).map(({ dirty, removed, ...o }) => o),
    campaign: ps.campaign,
    event: { key: ev.event.key, active: ev.active, start: ev.start, end: ev.end, nextStart: ev.nextStart, week: ev.week, points: ps.scoreE.points, claimed: ps.scoreE.counters },
    achievements: achievementsView(ps),
    achPoints: ps.p.stats.achPoints ?? 0,
    mascots: Object.keys(MASCOTS).filter((k) => ps.p.stats[`mascot_${k}`]),
    instructorsReady: ps.soldiers.filter((s) => s.instructor && s.status === 'ready').length,
  };
}

/* ───────────── действия ───────────── */

function partsFrom(a: any, ps: PS): Record<DroneSlot, string> {
  const out = {} as Record<DroneSlot, string>;
  for (const sl of DRONE_SLOTS) {
    const k = String(a?.[sl.key] ?? '');
    const p = DRONE_PARTS.find((x) => x.key === k && x.slot === sl.key);
    if (!p) throw new GameError(`Не выбрана деталь: ${sl.name.toLowerCase()}`);
    if (p.blueprint && !ps.blueprints.has(p.key)) throw new GameError(`Нет чертежа: «${p.name}»`);
    out[sl.key] = p.key;
  }
  return out;
}
function scale(c: Cost, k: number): Cost {
  const o: Cost = {};
  for (const r of RES_KEYS) if (c[r]) o[r] = Math.max(1, Math.round(c[r]! * k));
  return o;
}
export function equipRepairCost(rarity: string, durability: number, ps: PS, now: number): Cost {
  return equipRepairCostOf(rarity, durability, ps.buildings.repairyard ?? 0, now);
}
export function modelRepairCost(durability: number, ps: PS, now: number): Cost {
  return modelRepairCostOf(durability, ps.buildings.repairyard ?? 0, now);
}

type H = (c: Db, ps: PS, a: any, now: number) => Promise<string | { message: string; data?: unknown }>;
type AddJob = (c: Db, ps: PS, queue: any, kind: string, payload: any, cost: any, seconds: number, now: number) => Promise<unknown>;

export function deepActions(addJob: AddJob): Record<string, H> {
  return {
    async buildModel(c, ps, a, now) {
      if ((ps.buildings.testrange ?? 0) < 1) throw new GameError('Сначала постройте «Полигон испытаний»');
      const cls = String(a.cls) as OperatorType;
      if (!MODEL_CLASSES.includes(cls)) throw new GameError('Неизвестный класс операторов');
      if (ps.jobs.some((j) => j.kind === 'drone_model')) throw new GameError('Одна модель собирается за раз');
      if (ps.jobs.filter((j) => j.queue === 'workshop').length >= 3) throw new GameError('Очередь мастерской заполнена');
      const name = String(a.name ?? '').trim().slice(0, 24);
      if (name.length < 2) throw new GameError('Назовите модель (от 2 символов)');
      const color = MODEL_COLORS.includes(String(a.color)) ? String(a.color) : MODEL_COLORS[0];
      const parts = partsFrom(a.parts, ps);
      const cost = scale(modelCost(parts), workshopMul(now));
      spend(ps, cost);
      await addJob(c, ps, 'workshop', 'drone_model', { cls, name, color, parts }, cost, modelTime(parts), now);
      return `Модель «${name}» отправлена в сборку`;
    },
    async repairModel(_c, ps, a, now) {
      const m = ps.models.find((x) => x.cls === a.cls);
      if (!m) throw new GameError('Модели нет');
      if (m.durability >= 100) throw new GameError('Модель исправна');
      spend(ps, modelRepairCost(m.durability, ps, now));
      m.durability = 100;
      m.dirty = true;
      bumpStat(ps, 'repairs');
      track(ps, 'repair');
      return `Модель «${m.name}» отремонтирована`;
    },
    async repairEquipment(_c, ps, a, now) {
      const e = ps.equipment.find((x) => x.id === Number(a.id));
      if (!e) throw new GameError('Предмет не найден');
      if (e.status !== 'ready') throw new GameError('Предмет в походе');
      if ((e.durability ?? 100) >= 100) throw new GameError('Предмет исправен');
      spend(ps, equipRepairCost(e.rarity, e.durability ?? 100, ps, now));
      e.durability = 100;
      e.dirty = true;
      bumpStat(ps, 'repairs');
      track(ps, 'repair');
      return `${EQUIPMENT[e.type].name}: отремонтировано`;
    },
    async decodeBlueprint(c, ps) {
      if ((ps.buildings.analytics ?? 0) < 1) throw new GameError('Нужен «Аналитический центр»');
      if (!BLUEPRINT_PARTS.some((p) => !ps.blueprints.has(p))) throw new GameError('Все чертежи уже расшифрованы');
      spend(ps, BUILDING_FX.analytics.decodeCost);
      const name = await grantBlueprint(c, ps, 'random', 'Аналитический центр');
      return `Расшифрован чертёж: «${name}»`;
    },
    async outpostBuild(c, ps, a, now) {
      const max = (ps.buildings.hq >= OUTPOST.hqSecond ? 2 : ps.buildings.hq >= OUTPOST.hqFirst ? 1 : 0);
      if (!max) throw new GameError(`Передовой пункт — с командного пункта ${OUTPOST.hqFirst} уровня`);
      const active = ps.outposts.filter((o) => !o.removed).length + ps.jobs.filter((j) => j.kind === 'outpost_build').length;
      if (active >= max) throw new GameError(`Сейчас можно держать не больше ${max} передовых пунктов`);
      const sid = Number(a.sectorId);
      const s = sectorById(sid);
      if (!s) throw new GameError('Нет такого сектора');
      if ((ps.sectors[sid]?.control ?? 0) < OUTPOST.minControl) throw new GameError(`Нужен контроль сектора от ${OUTPOST.minControl}%`);
      if (ps.outposts.some((o) => o.sector_id === sid && !o.removed)) throw new GameError('Здесь уже есть пункт');
      if (ps.jobs.some((j) => j.queue === 'outpost')) throw new GameError('Бригада уже строит пункт');
      spend(ps, OUTPOST.buildCost);
      await addJob(c, ps, 'outpost', 'outpost_build', { sectorId: sid }, OUTPOST.buildCost, OUTPOST.buildTime, now);
      return `Строим передовой пункт у «${s.name}»`;
    },
    async outpostUpgrade(c, ps, a, now) {
      const o = ps.outposts.find((x) => x.id === Number(a.id) && !x.removed);
      if (!o) throw new GameError('Пункт не найден');
      if (o.level >= OUTPOST.maxLevel) throw new GameError('Максимальный уровень');
      if (ps.jobs.some((j) => j.queue === 'outpost')) throw new GameError('Бригада занята');
      const cost = OUTPOST.upgradeCost(o.level);
      spend(ps, cost);
      await addJob(c, ps, 'outpost', 'outpost_upgrade', { id: o.id, toLevel: o.level + 1 }, cost, OUTPOST.upgradeTime(o.level), now);
      return `Пункт у «${sectorById(o.sector_id)?.name}»: укрепление до ${o.level + 1} уровня`;
    },
    async campaignAck(c, ps, a) {
      const st = CAMPAIGN[ps.campaign.step];
      if (!st || st.kind !== 'scene' || st.key !== a.key) throw new GameError('Сцена уже просмотрена');
      await advanceCampaign(c, ps, st);
      await checkCampaignGoals(c, ps);
      return '';
    },
    async campaignChoose(c, ps, a) {
      const st = CAMPAIGN[ps.campaign.step];
      if (!st || st.kind !== 'choice' || st.key !== a.key) throw new GameError('Выбор уже сделан');
      const opt = st.options?.find((o) => o.key === a.option);
      if (!opt) throw new GameError('Нет такого варианта');
      ps.campaign.flags[st.key] = opt.key;
      await advanceCampaign(c, ps, st, opt.reward);
      await checkCampaignGoals(c, ps);
      return opt.text;
    },
    async eventClaim(c, ps, a, now) {
      const ev = eventNow(now);
      const evWeek = ev.active ? ev.week : ev.week - 1;
      if (ps.scoreE.period !== eventKey(evWeek)) throw new GameError('Событие уже закончилось');
      const evDef = EVENTS[((evWeek % EVENTS.length) + EVENTS.length) % EVENTS.length];
      const i = Number(a.tier);
      const tier = evDef.tiers[i];
      if (!tier) throw new GameError('Нет такой ступени');
      if (ps.scoreE.counters[`claimed${i}`]) throw new GameError('Уже получено');
      if (ps.scoreE.points < tier.points) throw new GameError(`Нужно ${tier.points} очков события`);
      ps.scoreE.counters[`claimed${i}`] = 1;
      grant(ps, tier.reward);
      const got = [costText(tier.reward)];
      if (tier.blueprint) {
        const n = await grantBlueprint(c, ps, 'random', `Событие «${evDef.name}»`);
        if (n) got.push(`чертёж «${n}»`);
        else {
          grant(ps, { parts: 300 });
          got.push('300 комплектующих вместо чертежа (все уже есть)');
        }
      }
      if (tier.chevron && (await grantChevron(c, ps, tier.chevron, 'event'))) {
        ps.newChevrons.push(tier.chevron);
        got.push('шеврон события');
      }
      bumpStat(ps, 'eventTiers');
      return `Ступень события: ${got.join(', ')}`;
    },
    async encounterChoose(c, ps, a) {
      const id = Number(a.reportId);
      const opt = Number(a.option);
      const r = await c.query('SELECT body FROM reports WHERE id=$1 AND user_id=$2 FOR UPDATE', [id, ps.userId]);
      const enc = r.rows[0]?.body?.encounter;
      if (!enc) throw new GameError('Встреча не найдена');
      if (enc.resolved) throw new GameError('Решение уже принято');
      const def = ENCOUNTERS.find((e) => e.key === enc.key);
      const option = def?.options[opt];
      if (!def || !option) throw new GameError('Нет такого варианта');
      const roll = rng(id * 13 + opt * 7)();
      let acc = 0;
      let out = option.outcomes[option.outcomes.length - 1];
      for (const o of option.outcomes) {
        acc += o.chance;
        if (roll < acc) { out = o; break; }
      }
      const parts: string[] = [];
      if (out.reward) {
        grant(ps, out.reward);
        parts.push(costText(out.reward));
      }
      if (out.wound) {
        const avail = OPERATOR_TYPES.filter((t) => ps.ops[t].available > 0);
        if (avail.length) {
          const t = avail[Math.floor(roll * 1000) % avail.length];
          ps.ops[t].available--;
          ps.ops[t].wounded++;
          parts.push(`ранен ${OPERATORS[t].name.toLowerCase()}`);
        }
      }
      if (out.blueprint) {
        const n = await grantBlueprint(c, ps, 'random', `Встреча: ${def.title}`);
        parts.push(n ? `чертёж «${n}»` : 'детали', ...(n ? [] : [costText({ parts: 150 })]));
        if (!n) grant(ps, { parts: 150 });
      }
      if (out.mascot) {
        ps.p.stats[`mascot_${out.mascot}`] = 1;
        parts.push(MASCOTS[out.mascot].name);
      }
      bumpStat(ps, 'encounters');
      const resolved = { ...enc, resolved: true, option: opt, result: out.text, gains: parts };
      await c.query(`UPDATE reports SET body = jsonb_set(body, '{encounter}', $3::jsonb) WHERE id=$1 AND user_id=$2`, [id, ps.userId, JSON.stringify(resolved)]);
      return { message: out.text, data: resolved };
    },
  };
}

export { SECTORS };
