/** Игровые действия. Каждое выполняется в транзакции под замком строки игрока, после досчёта времени. */
import crypto from 'node:crypto';
import {
  BUILDINGS,
  BuildingKey,
  CRAFT,
  DAILY,
  DailyKey,
  EQUIPMENT,
  EQUIPMENT_LIMIT,
  EQUIPMENT_TYPES,
  EquipmentType,
  MAX_BUILDING_LEVEL,
  MAX_EQUIPMENT_LEVEL,
  MAX_EQUIPMENT_PER_GROUP,
  MAX_RANK,
  MAX_TRAIN_BATCH,
  MAX_VEHICLE_LEVEL,
  MISSIONS,
  MissionType,
  OPERATORS,
  OPERATOR_TYPES,
  OperatorType,
  PORTRAITS,
  RARITIES,
  RARITY_NAMES,
  RESPEC_COST_DATA,
  Rarity,
  SECTOR_MISSIONS,
  SKILLS,
  SkillKey,
  TRAIN_QUEUE_LIMIT,
  TUTORIAL,
  VEHICLES,
  VEHICLE_REPAIR_TIME,
  VEHICLE_TYPES,
  VehicleType,
  WORKSHOP_QUEUE_LIMIT,
  WORKSHOP_RARITY_LEVEL,
  branchPoints,
  buildingUpgradeCost,
  buildingUpgradeTime,
  equipmentUpgradeCost,
  operatorUnlocked,
  rankRequiredTraining,
  rankUpgradeCost,
  rankUpgradeTime,
  recoveryCost,
  recoveryTime,
  sectorById,
  spentPoints,
  trainTime,
  gameDay,
  RES_KEYS,
  START_OPERATORS,
  START_RESOURCES,
  vehicleRepairCost,
  vehicleUpgradeCost,
  vehicleUpgradeRequiredWorkshop,
  vehicleUpgradeTime,
} from '../../../shared/config.js';
import { Group, groupSize, planExpedition, resolveExpedition } from '../../../shared/calc.js';
import type { Db } from '../db.js';
import { PRESTIGE_LEVEL, PRESTIGE_MAX, RESEARCH_COST, researchByKey, researchPrereq, streakReward, weekIndex, weeklyContracts } from '../../../shared/progression.js';
import { addPoints, dispatchBonus, pickSoldiers, playerMods } from './meta.js';
import { SOCIAL_ACTIONS } from './social.js';
import { campaignMissionCheck, deepActions, workshopMul } from './deep.js';
import { instructorMulOf, recoveryMulOf, repairMul, vehicleUpgradeMul } from '../../../shared/deepcalc.js';
import { LATE_BUILDINGS } from '../../../shared/config.js';
import { BUILDING_FX, CAMPAIGN, INSTRUCTOR_BONUS, MAX_INSTRUCTORS, SPEC_LEVEL, healScarsCost, repairDiscount, specByKey } from '../../../shared/content.js';
import { SOLDIER_MAX_LEVEL } from '../../../shared/progression.js';

function instructorMul(ps: PS): number {
  return instructorMulOf(ps.soldiers);
}
function scaleCost(c: Record<string, number | undefined>, k: number) {
  const o: Record<string, number> = {};
  for (const [r, v] of Object.entries(c)) if (v) o[r] = Math.max(1, Math.round(v * k));
  return o;
}
import { chevronByKey } from '../../../shared/chevrons.js';
import {
  GameError,
  PS,
  bumpDaily,
  bumpStat,
  costText,
  expeditionSlots,
  grant,
  sectorState,
  sectorUnlocked,
  spend,
  touchDaily,
} from './state.js';

export type Handler = (c: Db, ps: PS, a: any, now: number) => Promise<string | { message: string; data?: unknown }>;

export function oneOf<T extends string>(v: unknown, list: readonly T[], what: string): T {
  if (typeof v !== 'string' || !list.includes(v as T)) throw new GameError(`Неизвестное значение: ${what}`);
  return v as T;
}
export function int(v: unknown, min: number, max: number, what: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new GameError(`Неверное значение: ${what}`);
  return n;
}
function queueEnd(ps: PS, queue: string, now: number): number {
  return ps.jobs.filter((j) => j.queue === queue).reduce((m, j) => Math.max(m, j.end_at), now);
}
export async function addJob(c: Db, ps: PS, queue: PS['jobs'][number]['queue'], kind: string, payload: any, cost: any, seconds: number, now: number) {
  const start = queueEnd(ps, queue, now);
  const end = start + Math.max(1, seconds) * 1000;
  const r = await c.query(
    'INSERT INTO jobs(user_id,queue,kind,payload,cost,start_at,end_at) VALUES ($1,$2,$3,$4,$5,to_timestamp($6/1000.0),to_timestamp($7/1000.0)) RETURNING id',
    [ps.userId, queue, kind, JSON.stringify(payload), JSON.stringify(cost), start, end],
  );
  ps.jobs.push({ id: r.rows[0].id, queue, kind, payload, cost, start_at: start, end_at: end, done: false });
  return { start, end };
}
const fmt = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} мин ${s % 60 ? (s % 60) + ' с' : ''}`.trim() : `${s} с`);

const BUILDING_KEYS = Object.keys(BUILDINGS) as BuildingKey[];

export const ACTIONS: Record<string, Handler> = {
  /* ── Полигон ── */
  async build(c, ps, a, now) {
    const key = oneOf(a.building, BUILDING_KEYS, 'здание');
    if (ps.jobs.some((j) => j.queue === 'build')) throw new GameError('Строительная очередь занята — дождитесь завершения текущего улучшения');
    const level = ps.buildings[key];
    if (level >= MAX_BUILDING_LEVEL) throw new GameError('Достигнут максимальный уровень');
    const unlock = BUILDINGS[key].unlockHq ?? 1;
    if (ps.buildings.hq < unlock) throw new GameError(`${BUILDINGS[key].name} — с командного пункта ${unlock} уровня`);
    if (key !== 'hq' && level + 1 > ps.buildings.hq) throw new GameError(`Сначала улучшите командный пункт до ${level + 1} уровня`);
    const cost = buildingUpgradeCost(key, level);
    spend(ps, cost);
    const t = buildingUpgradeTime(key, level);
    await addJob(c, ps, 'build', 'build', { building: key, toLevel: level + 1 }, cost, t, now);
    return `${BUILDINGS[key].name}: улучшение до ${level + 1} уровня, ${fmt(t)}`;
  },

  /* ── Центр подготовки ── */
  async train(c, ps, a, now) {
    const type = oneOf(a.type, OPERATOR_TYPES, 'тип оператора');
    const count = int(a.count ?? 1, 1, MAX_TRAIN_BATCH, 'количество');
    if (OPERATORS[type].award) throw new GameError(`${OPERATORS[type].name} не обучается — приходит только за особые заслуги`);
    if (!operatorUnlocked(type, ps.buildings.training, ps.buildings.hq)) {
      const u = OPERATORS[type].unlock;
      throw new GameError(`Специализация закрыта: нужен центр подготовки ${u.training} ур.${u.hq ? ` и командный пункт ${u.hq} ур.` : ''}`);
    }
    if (ps.jobs.filter((j) => j.queue === 'train').length >= TRAIN_QUEUE_LIMIT) throw new GameError(`В очереди подготовки не больше ${TRAIN_QUEUE_LIMIT} заданий`);
    const one = OPERATORS[type].cost;
    const cost = Object.fromEntries(Object.entries(one).map(([k, v]) => [k, v! * count]));
    spend(ps, cost);
    const t = Math.round(trainTime(type, ps.buildings.training) * count * instructorMul(ps));
    await addJob(c, ps, 'train', 'train', { type, count }, cost, t, now);
    return `${OPERATORS[type].name} ×${count}: в очереди подготовки`;
  },
  async rankUp(c, ps, a, now) {
    const type = oneOf(a.type, OPERATOR_TYPES, 'тип оператора');
    const o = ps.ops[type];
    if (ps.jobs.some((j) => j.kind === 'rank' && j.payload.type === type)) throw new GameError('Повышение ранга уже в очереди');
    if (o.rank >= MAX_RANK) throw new GameError('Максимальный ранг');
    const to = o.rank + 1;
    if (ps.buildings.training < rankRequiredTraining(to)) throw new GameError(`Для ранга ${to} нужен центр подготовки ${rankRequiredTraining(to)} уровня`);
    const owned = o.available + o.on_mission + o.wounded + o.recovering > 0;
    if (OPERATORS[type].award ? !owned : !operatorUnlocked(type, ps.buildings.training, ps.buildings.hq)) throw new GameError('Специализация ещё закрыта');
    if (ps.jobs.filter((j) => j.queue === 'train').length >= TRAIN_QUEUE_LIMIT) throw new GameError('Очередь подготовки заполнена');
    const cost = rankUpgradeCost(type, to);
    spend(ps, cost);
    await addJob(c, ps, 'train', 'rank', { type, toRank: to }, cost, Math.round(rankUpgradeTime(to, ps.buildings.training) * instructorMul(ps)), now);
    return `${OPERATORS[type].name}: повышение до ранга ${to} в очереди`;
  },
  async recover(c, ps, _a, now) {
    const counts: Partial<Record<OperatorType, number>> = {};
    let total = 0;
    for (const t of OPERATOR_TYPES) if (ps.ops[t].wounded > 0) { counts[t] = ps.ops[t].wounded; total += ps.ops[t].wounded; }
    if (!total) throw new GameError('Нет раненых операторов');
    const medic = ps.p.skills.medic ?? 0;
    const recMul = recoveryMulOf(playerMods(ps, now).recovery);
    const base = recoveryCost(counts, medic);
    const cost = { supplies: Math.round((base.supplies ?? 0) * recMul) };
    spend(ps, cost);
    for (const t of OPERATOR_TYPES) if (counts[t]) { ps.ops[t].wounded -= counts[t]!; ps.ops[t].recovering += counts[t]!; }
    const t = Math.round(recoveryTime(total, medic) * recMul);
    await addJob(c, ps, 'recovery', 'recover', { counts }, cost, t, now);
    return `Восстановление ${total} операторов: ${fmt(t)}`;
  },

  /* ── Автопарк ── */
  async acquireVehicle(c, ps, a, now) {
    const type = oneOf(a.type, VEHICLE_TYPES, 'транспорт');
    const d = VEHICLES[type];
    if (d.award) throw new GameError(`${d.name} выдаётся только за особые заслуги`);
    if (ps.vehicles[type]) throw new GameError('Этот транспорт уже есть');
    if (ps.jobs.some((j) => j.kind === 'vehicle_acquire' && j.payload.type === type)) throw new GameError('Уже готовится в мастерской');
    if (ps.buildings.hq < d.unlockHq) throw new GameError(`Нужен командный пункт ${d.unlockHq} уровня`);
    if (type === 'pickup' && (ps.buildings.motorpool ?? 0) < BUILDING_FX.motorpool.pickupLevel) throw new GameError(`Пикап — с автопарка ${BUILDING_FX.motorpool.pickupLevel} уровня`);
    if (ps.jobs.filter((j) => j.queue === 'workshop').length >= WORKSHOP_QUEUE_LIMIT) throw new GameError('Очередь мастерской заполнена');
    spend(ps, d.acquireCost);
    await addJob(c, ps, 'workshop', 'vehicle_acquire', { type }, d.acquireCost, d.acquireTime, now);
    return `${d.name}: подготовка в мастерской`;
  },
  async upgradeVehicle(c, ps, a, now) {
    const type = oneOf(a.type, VEHICLE_TYPES, 'транспорт');
    const v = ps.vehicles[type];
    if (!v) throw new GameError('Транспорта нет в автопарке');
    if (v.status !== 'ready') throw new GameError('Транспорт занят или повреждён');
    if (v.level >= MAX_VEHICLE_LEVEL) throw new GameError('Максимальный уровень');
    const need = vehicleUpgradeRequiredWorkshop(v.level + 1);
    if (ps.buildings.workshop < need) throw new GameError(`Нужна мастерская ${need} уровня`);
    if (ps.jobs.filter((j) => j.queue === 'workshop').length >= WORKSHOP_QUEUE_LIMIT) throw new GameError('Очередь мастерской заполнена');
    const cost = scaleCost(vehicleUpgradeCost(v.level), vehicleUpgradeMul(ps.buildings.motorpool ?? 0));
    spend(ps, cost);
    v.status = 'workshop';
    await addJob(c, ps, 'workshop', 'vehicle_upgrade', { type, toLevel: v.level + 1 }, cost, vehicleUpgradeTime(v.level), now);
    return `${VEHICLES[type].name}: улучшение до ${v.level + 1} уровня`;
  },
  async repairVehicle(c, ps, a, now) {
    const type = oneOf(a.type, VEHICLE_TYPES, 'транспорт');
    const v = ps.vehicles[type];
    if (!v || v.status !== 'damaged') throw new GameError('Ремонт не требуется');
    if (ps.jobs.filter((j) => j.queue === 'workshop').length >= WORKSHOP_QUEUE_LIMIT) throw new GameError('Очередь мастерской заполнена');
    const cost = scaleCost(vehicleRepairCost(v.level), repairMul(ps.buildings.repairyard ?? 0, now));
    spend(ps, cost);
    v.status = 'workshop';
    await addJob(c, ps, 'workshop', 'vehicle_repair', { type }, cost, VEHICLE_REPAIR_TIME, now);
    return `${VEHICLES[type].name}: ремонт начат`;
  },

  /* ── Мастерская: оснащение ── */
  async craft(c, ps, a, now) {
    const type = oneOf(a.type, EQUIPMENT_TYPES, 'оснащение');
    const rarity = oneOf(a.rarity, RARITIES, 'редкость');
    if (ps.buildings.workshop < WORKSHOP_RARITY_LEVEL[rarity]) throw new GameError(`Для редкости «${RARITY_NAMES[rarity]}» нужна мастерская ${WORKSHOP_RARITY_LEVEL[rarity]} уровня`);
    const pending = ps.jobs.filter((j) => j.kind === 'craft').length;
    if (ps.equipment.length + pending >= EQUIPMENT_LIMIT) throw new GameError(`Склад оснащения вмещает ${EQUIPMENT_LIMIT} предметов — разберите лишние`);
    if (ps.jobs.filter((j) => j.queue === 'workshop').length >= WORKSHOP_QUEUE_LIMIT) throw new GameError('Очередь мастерской заполнена');
    const { time } = CRAFT[rarity];
    const cost = scaleCost(CRAFT[rarity].cost, workshopMul(now));
    spend(ps, cost);
    await addJob(c, ps, 'workshop', 'craft', { type, rarity }, cost, time, now);
    return `${EQUIPMENT[type].name}: сборка начата`;
  },
  async upgradeEquipment(_c, ps, a) {
    const id = int(a.id, 1, Number.MAX_SAFE_INTEGER, 'предмет');
    const e = ps.equipment.find((x) => x.id === id);
    if (!e) throw new GameError('Предмет не найден');
    if (e.status !== 'ready') throw new GameError('Предмет сейчас в походе');
    if (e.level >= MAX_EQUIPMENT_LEVEL) throw new GameError('Максимальный уровень');
    const cost = equipmentUpgradeCost(e.rarity, e.level);
    spend(ps, cost);
    e.level++;
    e.dirty = true;
    return `${EQUIPMENT[e.type].name}: уровень ${e.level}`;
  },
  async dismantleEquipment(c, ps, a) {
    const id = int(a.id, 1, Number.MAX_SAFE_INTEGER, 'предмет');
    const e = ps.equipment.find((x) => x.id === id);
    if (!e) throw new GameError('Предмет не найден');
    if (e.status !== 'ready') throw new GameError('Предмет сейчас в походе');
    if (e.rarity === 'award') throw new GameError('Наградные предметы не разбирают');
    const back = Math.round((CRAFT[e.rarity].cost.parts ?? 0) * 0.5);
    await c.query('DELETE FROM equipment WHERE id=$1 AND user_id=$2', [id, ps.userId]);
    ps.equipment = ps.equipment.filter((x) => x.id !== id);
    grant(ps, { parts: back });
    return `${EQUIPMENT[e.type].name} разобран: комплектующие +${back}`;
  },

  /* ── Поход ── */
  async dispatch(c, ps, a, now) {
    const sector = sectorById(Number(a.sectorId));
    if (!sector) throw new GameError('Сектор не найден');
    const ul = sectorUnlocked(ps, sector.id);
    if (!ul.ok) throw new GameError(`Сектор закрыт: ${ul.why}`);
    const campaignKey = a.campaign ? String(a.campaign) : null;
    const step = campaignKey ? CAMPAIGN.find((s) => s.key === campaignKey) : null;
    if (campaignKey && (!step || step.kind !== 'mission')) throw new GameError('Это задание кампании сейчас недоступно');
    const mission = (step ? step.mission : oneOf(a.mission, SECTOR_MISSIONS[sector.type], 'задание')) as MissionType;
    if (mission === 'expedition' && ps.p.cmd_level < 2) throw new GameError('Экспедиции открываются со 2 уровня командира');
    const sec = sectorState(ps, sector.id);
    if (sec.recon < MISSIONS[mission].minRecon) throw new GameError(`Нужна разведанность сектора от ${MISSIONS[mission].minRecon}% — сначала проведите разведку`);
    if (ps.expeditions.length >= expeditionSlots(ps)) throw new GameError('Все слоты походов заняты — дождитесь возвращения группы');

    const group: Group = {};
    for (const t of OPERATOR_TYPES) {
      const n = int(a.group?.[t] ?? 0, 0, 50, 'состав группы');
      if (n > ps.ops[t].available) throw new GameError(`${OPERATORS[t].name}: свободно только ${ps.ops[t].available}`);
      if (n) group[t] = n;
    }
    const vType = oneOf(a.vehicle, VEHICLE_TYPES, 'транспорт');
    const v = ps.vehicles[vType];
    if (!v) throw new GameError('Этого транспорта нет в автопарке');
    if (v.status !== 'ready') throw new GameError(`${VEHICLES[vType].name}: ${v.status === 'mission' ? 'в походе' : v.status === 'damaged' ? 'нужен ремонт' : 'в мастерской'}`);

    const ids: number[] = Array.isArray(a.equipment) ? [...new Set(a.equipment.map(Number))] as number[] : [];
    if (ids.length > MAX_EQUIPMENT_PER_GROUP) throw new GameError(`В группу помещается до ${MAX_EQUIPMENT_PER_GROUP} предметов оснащения`);
    const eq = ids.map((id) => {
      const e = ps.equipment.find((x) => x.id === id);
      if (!e) throw new GameError('Предмет оснащения не найден');
      if (e.status !== 'ready') throw new GameError(`${EQUIPMENT[e.type].name} уже в походе`);
      if ((e.durability ?? 100) <= 0) throw new GameError(`${EQUIPMENT[e.type].name} сломан — нужен ремонт`);
      return e;
    });
    if (new Set(eq.map((e) => EQUIPMENT[e.type].kind)).size !== eq.length) throw new GameError('Нельзя взять два предмета с одинаковым эффектом');

    if (campaignKey) campaignMissionCheck(ps, campaignKey, sector.id, mission, group, vType);
    const ranks = Object.fromEntries(OPERATOR_TYPES.map((t) => [t, ps.ops[t].rank])) as Record<OperatorType, number>;
    const input = {
      sector: step?.difficulty ? { ...sector, difficulty: step.difficulty } : sector, mission, group, ranks,
      vehicle: { type: vType, level: v.level },
      equipment: eq.map((e) => ({ id: e.id, type: e.type as EquipmentType, rarity: e.rarity as Rarity, level: e.level, durability: e.durability })),
      skills: ps.p.skills, commsLevel: ps.buildings.comms, sectorRecon: sec.recon,
      bonus: undefined as ReturnType<typeof dispatchBonus> | undefined,
    };
    const chosen = pickSoldiers(ps, group);
    input.bonus = dispatchBonus(ps, sector.id, now, chosen, group, !!step?.night);
    const plan = planExpedition(input);
    if (campaignKey) (plan as any).campaign = campaignKey;
    if (plan.size < 1) throw new GameError('В группе должен быть хотя бы один оператор');
    if (plan.size > plan.capacity) throw new GameError(`Вместимость группы — ${plan.capacity} операторов`);
    spend(ps, plan.cost);

    const seed = crypto.randomInt(1, 2 ** 31 - 1);
    const result = resolveExpedition(input, plan, seed);
    for (const t of OPERATOR_TYPES) {
      const n = group[t] ?? 0;
      ps.ops[t].available -= n;
      ps.ops[t].on_mission += n;
    }
    v.status = 'mission';
    for (const e of eq) { e.status = 'mission'; e.dirty = true; }
    const end = now + plan.duration * 1000;
    const r = await c.query(
      `INSERT INTO expeditions(user_id,sector_id,mission,group_comp,vehicle,equipment,cost,plan,result,seed,start_at,end_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,to_timestamp($11/1000.0),to_timestamp($12/1000.0)) RETURNING id`,
      [ps.userId, sector.id, mission, JSON.stringify(group), vType, JSON.stringify(ids), JSON.stringify(plan.cost), JSON.stringify(plan), JSON.stringify(result), seed, now, end],
    );
    ps.expeditions.push({ id: r.rows[0].id, sector_id: sector.id, mission, group_comp: group, vehicle: vType, equipment: ids, cost: plan.cost, plan, result, start_at: now, end_at: end, status: 'active', seed } as any);
    for (const so of chosen) {
      so.status = 'mission';
      so.expedition_id = r.rows[0].id;
      so.dirty = true;
    }
    bumpStat(ps, 'expeditionsSent');
    bumpDaily(ps, now, 'dispatch');
    if (mission === 'recon') bumpDaily(ps, now, 'recon');
    if (mission === 'raid' && eq.length) bumpStat(ps, 'raidWithEquipment');
    return `Группа отправлена: ${MISSIONS[mission].name.toLowerCase()}, сектор ${String(sector.id).padStart(2, '0')}. Расход: ${costText(plan.cost)}`;
  },

  /* ── Командир ── */
  async skill(_c, ps, a) {
    const key = oneOf(a.key, Object.keys(SKILLS) as SkillKey[], 'навык');
    const def = SKILLS[key];
    const skills = ps.p.skills;
    const free = ps.p.cmd_level - 1 - spentPoints(skills);
    if (free <= 0) throw new GameError('Нет свободных очков навыков — повышайте уровень командира в походах');
    if ((skills[key] ?? 0) >= def.max) throw new GameError('Навык уже на максимуме');
    if (branchPoints(skills, def.branch) < def.needBranchPoints) throw new GameError(`Нужно ещё вложить очков в ветку: ${def.needBranchPoints - branchPoints(skills, def.branch)}`);
    skills[key] = (skills[key] ?? 0) + 1;
    return `${def.name}: ${def.describe(skills[key]!)}`;
  },
  async resetSkills(_c, ps) {
    if (!spentPoints(ps.p.skills)) throw new GameError('Навыки ещё не выбраны');
    if (ps.expeditions.length) throw new GameError('Сброс доступен, когда нет активных походов');
    if (ps.p.free_reset_used) spend(ps, { data: RESPEC_COST_DATA });
    const wasFree = !ps.p.free_reset_used;
    ps.p.free_reset_used = true;
    ps.p.skills = {};
    return wasFree ? 'Навыки сброшены (бесплатный сброс использован)' : `Навыки сброшены за ${RESPEC_COST_DATA} данных`;
  },
  async profile(_c, ps, a) {
    const callsign = String(a.callsign ?? ps.p.callsign).trim();
    const name = String(a.commanderName ?? ps.p.commander_name).trim();
    if (callsign.length < 2 || callsign.length > 24) throw new GameError('Позывной: от 2 до 24 символов');
    if (name.length < 2 || name.length > 40) throw new GameError('Имя: от 2 до 40 символов');
    ps.p.callsign = callsign;
    ps.p.commander_name = name;
    ps.p.portrait = int(a.portrait ?? ps.p.portrait, 0, PORTRAITS.length - 1, 'портрет');
    return 'Профиль командира сохранён';
  },
  async wearChevron(_c, ps, a) {
    const key = String(a.key ?? '');
    const ch = chevronByKey(key);
    if (!ch) throw new GameError('Такого шеврона нет');
    if (!ps.chevrons.some((x) => x.key === key)) throw new GameError('Этого шеврона ещё нет в коллекции');
    ps.p.chevron = key;
    return `Теперь на рукаве: «${ch.name}»`;
  },

  /* ── Исследования ── */
  async research(c, ps, a, now) {
    const def = researchByKey(String(a.key ?? ''));
    if (!def) throw new GameError('Нет такого исследования');
    if (ps.research.has(def.key)) throw new GameError('Уже изучено');
    if (ps.jobs.some((j) => j.queue === 'research')) throw new GameError('Лаборатория занята — одно исследование за раз');
    const pre = researchPrereq(def);
    if (pre && !ps.research.has(pre)) throw new GameError(`Сначала изучите «${researchByKey(pre)!.name}»`);
    const tier = RESEARCH_COST[def.tier];
    if (ps.buildings.comms < tier.comms) throw new GameError(`Нужен узел связи ${tier.comms} уровня`);
    spend(ps, tier.cost);
    await addJob(c, ps, 'research', 'research', { key: def.key }, tier.cost, tier.time, now);
    return `Исследование «${def.name}» начато`;
  },

  /* ── Серия входов и контракты ── */
  async claimStreak(_c, ps, _a, now) {
    const day = gameDay(now);
    if (ps.meta.streakClaimedDay === day) throw new GameError('Сегодняшняя награда уже получена');
    const r = streakReward(ps.meta.streak);
    grant(ps, r);
    ps.meta.streakClaimedDay = day;
    return `День ${ps.meta.streak} подряд: получено ${costText(r)}`;
  },
  async claimContract(_c, ps, a, now) {
    const idx = int(a.index, 0, 2, 'контракт');
    const list = weeklyContracts(ps.userId, weekIndex(now), ps.p.cmd_level, ps.companyId != null);
    const ct = list[idx];
    if (!ct) throw new GameError('Нет такого контракта');
    if (ps.weekly.claimed[idx]) throw new GameError('Награда уже получена');
    if ((ps.weekly.counters[ct.counter] ?? 0) < ct.target) throw new GameError('Контракт ещё не выполнен');
    ps.weekly.claimed[idx] = true;
    grant(ps, ct.reward);
    addPoints(ps, 10);
    return `Контракт выполнен: ${costText(ct.reward)}`;
  },

  /* ── Престиж ── */
  async prestige(c, ps) {
    if (ps.p.cmd_level < PRESTIGE_LEVEL) throw new GameError(`Престиж доступен командиру ${PRESTIGE_LEVEL} уровня`);
    if (ps.meta.prestige >= PRESTIGE_MAX) throw new GameError('Достигнут максимальный престиж');
    if (ps.expeditions.length || ps.jobs.length) throw new GameError('Сначала дождитесь возвращения групп и окончания всех очередей');
    ps.meta.prestige++;
    bumpStat(ps, 'prestige');
    for (const k of Object.keys(ps.buildings) as BuildingKey[]) ps.buildings[k] = LATE_BUILDINGS.includes(k) ? 0 : 1;
    for (const o of ps.outposts) o.removed = true;
    for (const t of OPERATOR_TYPES) {
      const o = ps.ops[t];
      const keep = OPERATORS[t].award ? o.available + o.wounded + o.recovering : 0;
      ps.ops[t] = { ...o, available: keep + (START_OPERATORS[t] ?? 0), wounded: 0, recovering: 0, on_mission: 0, rank: 1 };
    }
    for (const v of VEHICLE_TYPES) if (ps.vehicles[v] && !VEHICLES[v].award && v !== 'moto') delete ps.vehicles[v];
    await c.query(`DELETE FROM vehicles WHERE user_id=$1 AND type <> ALL($2)`, [ps.userId, Object.keys(ps.vehicles)]);
    if (ps.vehicles.moto) ps.vehicles.moto = { level: 1, status: 'ready' };
    await c.query('DELETE FROM sectors WHERE user_id=$1', [ps.userId]);
    ps.sectors = {};
    for (const r of RES_KEYS) ps.p[r] = START_RESOURCES[r];
    ps.p.cmd_xp = 0;
    ps.p.cmd_level = 1;
    ps.p.skills = {};
    ps.p.free_reset_used = false;
    return `Полигон переведён на новый рубеж! Престиж ${ps.meta.prestige}: производство и награды +${5 * ps.meta.prestige}%, сила +${2 * ps.meta.prestige}%`;
  },

  /* ── Привязка к сайту «Учёт дронов» ── */
  async linkCode(_c, ps, _a, now) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += alphabet[crypto.randomInt(alphabet.length)];
    ps.meta.linkCode = code;
    ps.meta.linkCodeExp = now + 30 * 60_000;
    return { message: 'Код привязки создан — введите его на сайте «Учёт дронов» в течение 30 минут', data: { code } };
  },

  ...SOCIAL_ACTIONS,
  ...deepActions(addJob),

  /* ── Бойцы: специализация, инструкторы, шрамы ── */
  async soldierSpec(_c, ps, a) {
    const s = ps.soldiers.find((x) => x.id === Number(a.id) && x.status !== 'lost' && x.status !== 'retired');
    if (!s) throw new GameError('Боец не найден');
    if (s.spec) throw new GameError('Специализация уже выбрана');
    if (s.level < SPEC_LEVEL) throw new GameError(`Специализация — с ${SPEC_LEVEL} уровня бойца`);
    const sp = specByKey(String(a.spec));
    if (!sp || sp.type !== s.type) throw new GameError('Эта специализация не подходит бойцу');
    s.spec = sp.key;
    s.dirty = true;
    return `«${s.name}» теперь ${sp.name.toLowerCase()}`;
  },
  async setInstructor(_c, ps, a) {
    const s = ps.soldiers.find((x) => x.id === Number(a.id) && x.status !== 'lost' && x.status !== 'retired');
    if (!s) throw new GameError('Боец не найден');
    const on = !!a.on;
    if (on) {
      if (s.level < SOLDIER_MAX_LEVEL) throw new GameError(`Инструктором может стать боец ${SOLDIER_MAX_LEVEL} уровня`);
      if (ps.soldiers.filter((x) => x.instructor && x !== s && x.status !== 'lost' && x.status !== 'retired').length >= MAX_INSTRUCTORS) throw new GameError(`Инструкторов не больше ${MAX_INSTRUCTORS}`);
    }
    s.instructor = on;
    s.dirty = true;
    return on ? `«${s.name}» назначен инструктором: подготовка быстрее, в походы — в последнюю очередь` : `«${s.name}» вернулся в строй`;
  },
  async healScars(_c, ps, a) {
    if ((ps.buildings.medbay ?? 0) < 1) throw new GameError('Нужен медпункт');
    const s = ps.soldiers.find((x) => x.id === Number(a.id) && x.status !== 'lost' && x.status !== 'retired');
    if (!s || !s.scars) throw new GameError('Шрамов нет');
    spend(ps, healScarsCost(s.scars));
    s.scars = 0;
    s.dirty = true;
    return `Медпункт свёл шрамы «${s.name}»`;
  },

  /* ── Прочее ── */
  async claimDaily(_c, ps, a, now) {
    const key = oneOf(a.key, Object.keys(DAILY) as DailyKey[], 'задание');
    touchDaily(ps, now);
    if (ps.daily.claimed[key]) throw new GameError('Награда уже получена');
    if ((ps.daily.counters[key] ?? 0) < DAILY[key].target) throw new GameError('Задание ещё не выполнено');
    ps.daily.claimed[key] = true;
    grant(ps, DAILY[key].reward);
    return `Ежедневное задание: получено ${costText(DAILY[key].reward)}`;
  },
  async readReports(c, ps) {
    await c.query('UPDATE reports SET is_read=true WHERE user_id=$1 AND NOT is_read', [ps.userId]);
    return '';
  },
  async skipTutorial(_c, ps) {
    ps.p.tutorial_step = TUTORIAL.length;
    return 'Обучение пропущено';
  },
};
