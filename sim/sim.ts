/**
 * Симулятор баланса: бот играет на настоящем коде сервера с ускоренными часами.
 * Запуск: DATABASE_URL=... npx tsx sim/sim.ts [дней] [профиль active|casual|hardcore] [число ботов]
 * Каждый бот — новый игрок в базе. Входы в игру по расписанию профиля, между входами время «прокручивается».
 */
const realNow = Date.now.bind(Date);
const clock = { t: realNow() };
Date.now = () => clock.t;

import { pool, tx } from '../server/src/db.js';
import { ACTIONS } from '../server/src/game/actions.js';
import { GameError, PS, caps, canAfford, checkChevrons, checkTutorial, createPlayer, expeditionSlots, loadState, saveState, sectorState, sectorUnlocked, settle } from '../server/src/game/state.js';
import { dispatchBonus, pickSoldiers } from '../server/src/game/meta.js';
import {
  BUILDINGS, BUILDING_KEYS, BuildingKey, CRAFT, Cost, DAILY_KEYS, EQUIPMENT, EQUIPMENT_TYPES, LATE_BUILDINGS, MAX_BUILDING_LEVEL, MAX_RANK, MISSIONS, MissionType,
  OPERATORS, OPERATOR_TYPES, OperatorType, RES_KEYS, SECTORS, SECTOR_MISSIONS, SKILLS, SkillKey, TRAINABLE_OPERATORS, TUTORIAL, VEHICLES, VEHICLE_TYPES, VehicleType,
  buildingUpgradeCost, hqCommanderLevel, operatorUnlocked, rankRequiredTraining, rankUpgradeCost, spentPoints, vehicleUpgradeCost, vehicleUpgradeRequiredWorkshop, MAX_VEHICLE_LEVEL,
} from '../shared/config.js';
import { Group, planExpedition } from '../shared/calc.js';
import { RESEARCH, RESEARCH_COST, researchPrereq } from '../shared/progression.js';
import { CAMPAIGN, OUTPOST, DEFAULT_MODEL, chapterLockLevel } from '../shared/content.js';

const DAYS = Number(process.argv[2] ?? 14);
const PROFILE = (process.argv[3] ?? 'active') as 'active' | 'casual' | 'hardcore';
const BOTS = Number(process.argv[4] ?? 1);
const LOGINS: Record<typeof PROFILE, number[]> = {
  hardcore: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
  active: [8, 11, 14, 17, 20, 23],
  casual: [9, 19],
};
const H = 3_600_000;
const DAY = 24 * H;

const VALUE: Record<string, number> = { supplies: 1, parts: 1.2, fuel: 1, data: 6 };
const val = (c: Cost) => Object.entries(c).reduce((s, [k, v]) => s + (v ?? 0) * (VALUE[k] ?? 1), 0);
const sub = (a: Cost, b: Cost): Cost => Object.fromEntries(RES_KEYS.map((k) => [k, (a[k] ?? 0) + (b[k] ?? 0)])) as Cost;
const have = (ps: PS, c: Cost, reserve: Cost = {}) => canAfford(ps, sub(c, reserve));

const actionLog: Record<string, number> = {};
async function act(c: any, ps: PS, type: string, a: Record<string, unknown> = {}): Promise<boolean> {
  try {
    await ACTIONS[type](c, ps, a, clock.t);
    actionLog[type] = (actionLog[type] ?? 0) + 1;
    return true;
  } catch (e) {
    if (e instanceof GameError) return false;
    throw e;
  }
}

const BUILD_ORDER: BuildingKey[] = ['supply', 'workshop', 'fueldepot', 'training', 'comms', 'defense', 'testrange', 'medbay', 'repairyard', 'motorpool', 'analytics'];
function nextBuild(ps: PS): BuildingKey | null {
  // всё, что ниже командного пункта, подтягиваем по приоритету; когда всё ровно — командный пункт
  let best: BuildingKey | null = null;
  let bestLvl = 99;
  for (const k of BUILD_ORDER) {
    const lvl = ps.buildings[k] ?? 0;
    if ((BUILDINGS[k].unlockHq ?? 1) > ps.buildings.hq) continue;
    if (lvl >= ps.buildings.hq || lvl >= MAX_BUILDING_LEVEL) continue;
    const late = LATE_BUILDINGS.includes(k) ? 1.5 : 0; // новые здания чуть позже основных
    if (lvl + late < bestLvl) { best = k; bestLvl = lvl + late; }
  }
  const hqOk = ps.buildings.hq < MAX_BUILDING_LEVEL && ps.p.cmd_level >= hqCommanderLevel(ps.buildings.hq);
  if (!best && hqOk) best = 'hq';
  // командный пункт вперёд, если всё остальное уже на уровень ниже не отстаёт больше чем на 1
  if (hqOk && best && best !== 'hq' && bestLvl >= ps.buildings.hq - 1 && ps.buildings.hq < MAX_BUILDING_LEVEL && ps.buildings[best] >= ps.buildings.hq - 1) {
    const hqCost = buildingUpgradeCost('hq', ps.buildings.hq);
    if (val(hqCost) < val(buildingUpgradeCost(best, ps.buildings[best])) * 2.5) best = 'hq';
  }
  return best;
}

const SKILL_ORDER: SkillKey[] = ['cohesion', 'cohesion', 'trophies', 'resilience', 'economy', 'trophies', 'resilience', 'echelon', 'analytics', 'observation', 'trophies', 'resilience', 'medic'];

function autoGroup(ps: PS, mission: MissionType, cap: number, only?: OperatorType[]): Group {
  const order: OperatorType[] = mission === 'recon' ? ['scout', 'babayaga', 'heavy', 'veteran', 'fpv'] : ['babayaga', 'veteran', 'heavy', 'fpv', 'scout'];
  const g: Group = {};
  let left = cap;
  for (const t of order) {
    if (only && !only.includes(t)) continue;
    const n = Math.min(ps.ops[t].available, left);
    if (n > 0) g[t] = n;
    left -= n;
  }
  return g;
}
function pickEquipment(ps: PS, mission: MissionType) {
  const want = mission === 'recon' ? ['recon', 'field', 'losses'] : ['fpv', 'power', 'losses', 'field', 'recon'];
  const out: typeof ps.equipment = [];
  const kinds = new Set<string>();
  for (const k of want) {
    if (out.length >= 2) break;
    const e = ps.equipment.filter((x) => x.status === 'ready' && (x.durability ?? 100) > 0 && EQUIPMENT[x.type].kind === k && !kinds.has(k))[0];
    if (e) { out.push(e); kinds.add(k); }
  }
  return out;
}

const RANK = { fail: 0, partial: 1, success: 2, decisive: 3 } as const;

async function dispatchAll(c: any, ps: PS) {
  let guard = 0;
  while (ps.expeditions.length < expeditionSlots(ps) && guard++ < 6) {
    const vehicles = VEHICLE_TYPES.filter((v) => ps.vehicles[v]?.status === 'ready');
    if (!vehicles.length) return;
    const totalAvail = OPERATOR_TYPES.reduce((s, t) => s + ps.ops[t].available, 0);
    if (!totalAvail) return;
    const step = CAMPAIGN[ps.campaign.step];
    type Cand = { score: number; args: Record<string, unknown> };
    let best: Cand | null = null;
    const consider = (sectorId: number, mission: MissionType, campaign?: (typeof CAMPAIGN)[number]) => {
      const s = SECTORS.find((x) => x.id === sectorId)!;
      if (!sectorUnlocked(ps, s.id).ok) return;
      const sec = sectorState(ps, s.id);
      if (sec.recon < MISSIONS[mission].minRecon) return;
      if (mission === 'expedition' && ps.p.cmd_level < 2) return;
      for (const vt of vehicles) {
        if (campaign?.vehicles && !campaign.vehicles.includes(vt)) continue;
        const v = ps.vehicles[vt]!;
        const ranks = Object.fromEntries(OPERATOR_TYPES.map((t) => [t, ps.ops[t].rank])) as Record<OperatorType, number>;
        const sector = campaign?.difficulty ? { ...s, difficulty: campaign.difficulty } : s;
        const base = { sector, mission, ranks, vehicle: { type: vt, level: v.level }, skills: ps.p.skills, commsLevel: ps.buildings.comms, sectorRecon: sec.recon };
        const cap = planExpedition({ ...base, group: {}, equipment: [] }).capacity;
        const group = autoGroup(ps, mission, cap, campaign?.onlyTypes);
        const size = Object.values(group).reduce((a, b) => a + (b ?? 0), 0);
        if (!size || (campaign?.minSize && size < campaign.minSize)) continue;
        if (campaign?.needModel && !ps.models.some((m) => (group[m.cls] ?? 0) > 0 && m.durability > 0)) continue;
        const eq = pickEquipment(ps, mission);
        const plan = planExpedition({ ...base, group, equipment: eq.map((e) => ({ id: e.id, type: e.type, rarity: e.rarity, level: e.level, durability: e.durability })), bonus: dispatchBonus(ps, s.id, clock.t, pickSoldiers(ps, group), group, !!campaign?.night) });
        if (!canAfford(ps, plan.cost)) continue;
        const low = RANK[plan.outcomeLow];
        if (low < 1) continue; // не идём туда, где возможен провал
        if (plan.lossCategory === 'высокая') continue;
        let score = val(plan.rewardsLow) / Math.max(60, plan.duration) * 3600 - val(plan.cost);
        if (low >= 2) score *= 1.5;
        if (!sec.successes && mission !== 'recon') score *= 3; // новый сектор открывает следующие
        if (mission === 'recon' && sec.recon < 60) score += 400 * s.difficulty;
        if (campaign) score += 100000;
        if (focusRecon === s.id && mission === 'recon') score += 50000;
        if (focusControl === s.id && (mission === 'raid' || mission === 'stronghold')) score += 20000;
        const args = { sectorId: s.id, mission, group, vehicle: vt, equipment: eq.map((e) => e.id), ...(campaign ? { campaign: campaign.key } : {}) };
        if (!best || score > best.score) best = { score, args };
      }
    };
    // фокус кампании: разведать сектор задания или удерживать контроль
    let focusRecon = 0;
    let focusControl = 0;
    if (step?.kind === 'mission' && sectorState(ps, step.sectorId!).recon < MISSIONS[step.mission!].minRecon) focusRecon = step.sectorId!;
    if (step?.kind === 'goal' && step.goal?.kind === 'control') {
      const cand = SECTORS.filter((x) => sectorUnlocked(ps, x.id).ok && (ps.sectors[x.id]?.control ?? 0) < 100).sort((a, b) => (ps.sectors[b.id]?.control ?? 0) - (ps.sectors[a.id]?.control ?? 0) || a.difficulty - b.difficulty)[0];
      if (cand) focusControl = cand.id;
    }
    if (step?.kind === 'mission' && !chapterLockLevel(step, ps.p.cmd_level)) consider(step.sectorId!, step.mission!, step);
    for (const s of SECTORS) for (const m of SECTOR_MISSIONS[s.type]) consider(s.id, m);
    if (!best) return;
    const b = best as Cand;
    if (!(await act(c, ps, 'dispatch', b.args))) return;
  }
}

async function bot(c: any, ps: PS) {
  const now = clock.t;
  // награды
  for (const k of DAILY_KEYS) await act(c, ps, 'claimDaily', { key: k });
  await act(c, ps, 'claimStreak');
  for (let i = 0; i < 3; i++) await act(c, ps, 'claimContract', { index: i });
  for (let i = 0; i < 4; i++) await act(c, ps, 'eventClaim', { tier: i });
  // кампания
  for (let g = 0; g < 4; g++) {
    const st = CAMPAIGN[ps.campaign.step];
    if (!st) break;
    if (st.kind === 'scene') { if (!(await act(c, ps, 'campaignAck', { key: st.key }))) break; }
    else if (st.kind === 'choice') {
      if (!(await act(c, ps, 'campaignChoose', { key: st.key, option: st.options![0].key }))) await act(c, ps, 'campaignChoose', { key: st.key, option: st.options![1].key });
    } else break;
  }
  // навыки
  while (ps.p.cmd_level - 1 - spentPoints(ps.p.skills) > 0) {
    let ok = false;
    for (const k of SKILL_ORDER) if (await act(c, ps, 'skill', { key: k })) { ok = true; break; }
    if (!ok) for (const k of Object.keys(SKILLS)) if (await act(c, ps, 'skill', { key: k })) { ok = true; break; }
    if (!ok) break;
  }
  // раненые, ремонт
  if (OPERATOR_TYPES.some((t) => ps.ops[t].wounded > 0)) await act(c, ps, 'recover');
  for (const v of VEHICLE_TYPES) if (ps.vehicles[v]?.status === 'damaged') await act(c, ps, 'repairVehicle', { type: v });
  for (const m of ps.models) if (m.durability < 40) await act(c, ps, 'repairModel', { cls: m.cls });
  for (const e of ps.equipment) if ((e.durability ?? 100) < 30 && e.status === 'ready') await act(c, ps, 'repairEquipment', { id: e.id });

  // стройка — главная цель; остальное тратим только сверх резерва на неё
  const target = nextBuild(ps);
  const targetCost = target ? buildingUpgradeCost(target, ps.buildings[target] ?? 0) : {};
  if (target && !ps.jobs.some((j) => j.queue === 'build')) await act(c, ps, 'build', { building: target });
  const reserve: Cost = ps.jobs.some((j) => j.queue === 'build') ? {} : targetCost;

  // походы — до трат, чтобы хватило топлива
  await dispatchAll(c, ps);

  // исследования
  if (!ps.jobs.some((j) => j.queue === 'research')) {
    const avail = RESEARCH.filter((r) => !ps.research.has(r.key) && (!researchPrereq(r) || ps.research.has(researchPrereq(r)!)) && ps.buildings.comms >= RESEARCH_COST[r.tier].comms).sort((a, b) => a.tier - b.tier);
    for (const r of avail) if (have(ps, RESEARCH_COST[r.tier].cost, reserve)) { if (await act(c, ps, 'research', { key: r.key })) break; }
  }
  // транспорт
  for (const v of ['ebike', 'bukhanka', 'pickup'] as VehicleType[]) if (!ps.vehicles[v] && have(ps, VEHICLES[v].acquireCost, reserve)) await act(c, ps, 'acquireVehicle', { type: v });
  for (const v of VEHICLE_TYPES) {
    const row = ps.vehicles[v];
    if (row && row.status === 'ready' && row.level < MAX_VEHICLE_LEVEL && ps.buildings.workshop >= vehicleUpgradeRequiredWorkshop(row.level + 1) && have(ps, vehicleUpgradeCost(row.level), reserve)) await act(c, ps, 'upgradeVehicle', { type: v });
  }
  // операторы: хотим заполнить все слоты + запас
  const want = expeditionSlots(ps) * 9 + 6;
  const total = OPERATOR_TYPES.reduce((s, t) => s + ps.ops[t].available + ps.ops[t].on_mission + ps.ops[t].wounded + ps.ops[t].recovering, 0);
  const trainOrder: OperatorType[] = ['babayaga', 'heavy', 'fpv'];
  const strong = ps.ops.heavy.trained + ps.ops.babayaga.trained;
  const trainingNow = ps.jobs.filter((j) => j.kind === 'train').reduce((s, j) => s + j.payload.count, 0);
  if (total + trainingNow < want || (total + trainingNow < 45 && strong < 24 && (operatorUnlocked('heavy', ps.buildings.training, ps.buildings.hq)))) {
    if (ps.ops.scout.available + ps.ops.scout.on_mission < 4) await act(c, ps, 'train', { type: 'scout', count: 2 });
    for (const t of trainOrder) {
      if (!operatorUnlocked(t, ps.buildings.training, ps.buildings.hq)) continue;
      const one = OPERATORS[t].cost;
      let n = 3;
      while (n > 0 && !have(ps, Object.fromEntries(Object.entries(one).map(([k, v]) => [k, v! * n])) as Cost, reserve)) n--;
      if (n > 0 && (await act(c, ps, 'train', { type: t, count: n }))) break;
    }
  }
  // ранги
  for (const t of ['fpv', 'heavy', 'babayaga', 'scout'] as OperatorType[]) {
    const o = ps.ops[t];
    if (o.rank < MAX_RANK && ps.buildings.training >= rankRequiredTraining(o.rank + 1) && (o.trained ?? 0) > 0 && have(ps, rankUpgradeCost(t, o.rank + 1), reserve)) await act(c, ps, 'rankUp', { type: t });
  }
  // оснащение
  if (ps.equipment.length < 6) {
    const rarity = ps.buildings.workshop >= 6 ? 'rare' : ps.buildings.workshop >= 3 ? 'improved' : 'common';
    const type = EQUIPMENT_TYPES[ps.equipment.length % EQUIPMENT_TYPES.length];
    if (have(ps, CRAFT[rarity].cost, reserve)) await act(c, ps, 'craft', { type, rarity });
  }
  // модели и пункты
  if ((ps.buildings.testrange ?? 0) >= 1) {
    for (const cls of ['fpv', 'heavy', 'babayaga', 'scout'] as OperatorType[])
      if (!ps.models.some((m) => m.cls === cls) && ps.ops[cls].trained > 0) { if (await act(c, ps, 'buildModel', { cls, name: `Бот-${cls}`, color: '#6b7a3c', parts: DEFAULT_MODEL })) break; }
  }
  if (ps.buildings.hq >= OUTPOST.hqFirst) {
    const s = SECTORS.filter((x) => (ps.sectors[x.id]?.control ?? 0) >= OUTPOST.minControl).sort((a, b) => b.difficulty - a.difficulty)[0];
    if (s && have(ps, OUTPOST.buildCost, reserve)) await act(c, ps, 'outpostBuild', { sectorId: s.id });
    for (const o of ps.outposts) if (have(ps, OUTPOST.upgradeCost(o.level), reserve)) await act(c, ps, 'outpostUpgrade', { id: o.id });
  }
  void now;
}

interface Snap { day: number; hq: number; bsum: number; cmd: number; xp: number; unlocked: number; controlled: number; camp: number; research: number; ops: number; slots: number; res: string; tut: number }
function snap(ps: PS, day: number): Snap {
  return {
    day,
    hq: ps.buildings.hq,
    bsum: BUILDING_KEYS.reduce((s, k) => s + (ps.buildings[k] ?? 0), 0),
    cmd: ps.p.cmd_level,
    xp: ps.p.cmd_xp,
    unlocked: SECTORS.filter((s) => sectorUnlocked(ps, s.id).ok).length,
    controlled: Object.values(ps.sectors).filter((s) => s.control >= 100).length,
    camp: ps.campaign.step,
    research: ps.research.size,
    ops: OPERATOR_TYPES.reduce((s, t) => s + ps.ops[t].available + ps.ops[t].on_mission + ps.ops[t].wounded + ps.ops[t].recovering, 0),
    slots: expeditionSlots(ps),
    res: RES_KEYS.map((k) => `${k[0]}${Math.round(ps.p[k])}`).join(' '),
    tut: ps.p.tutorial_step,
  };
}

async function runBot(n: number) {
  // старт — понедельник 08:00 МСК реальной недели, чтобы попадать в события выходных
  const start = Math.floor(realNow() / DAY) * DAY + 5 * H;
  clock.t = start;
  const login = `sim${PROFILE}${Date.now().toString(36)}${n}${Math.floor(Math.random() * 1e6)}`;
  const uid: number = await tx(async (c) => {
    const u = await c.query('INSERT INTO users(login,password_hash) VALUES ($1,$2) RETURNING id', [login, 'x']);
    await createPlayer(c, u.rows[0].id, `Бот${n}`, 'Симулятор', clock.t);
    return Number(u.rows[0].id);
  });
  const snaps: Snap[] = [];
  const milestones: Record<string, number> = {};
  const mark = (k: string, cond: boolean) => { if (cond && milestones[k] == null) milestones[k] = +( (clock.t - start) / DAY).toFixed(2); };
  for (let d = 0; d < DAYS; d++) {
    for (const h of LOGINS[PROFILE]) {
      clock.t = start + d * DAY + (h - 8) * H + Math.floor(Math.random() * 20) * 60_000;
      await tx(async (c) => {
        const ps = await loadState(c, uid);
        await settle(c, ps, clock.t);
        if (d >= 1 && ps.p.tutorial_step < TUTORIAL.length) await act(c, ps, 'skipTutorial');
        await bot(c, ps);
        await checkTutorial(c, ps);
        await checkChevrons(c, ps);
        await saveState(c, ps);
        mark('hq5', ps.buildings.hq >= 5);
        mark('hq8', ps.buildings.hq >= 8);
        mark('hq10', ps.buildings.hq >= 10);
        mark('cmd5', ps.p.cmd_level >= 5);
        mark('cmd10', ps.p.cmd_level >= 10);
        mark('sector12', sectorUnlocked(ps, 12).ok);
        mark('allControlled', Object.values(ps.sectors).filter((s) => s.control >= 100).length >= 12);
        mark('campaignDone', ps.campaign.step >= CAMPAIGN.length);
        mark('research16', ps.research.size >= 16);
        mark('allMax', BUILDING_KEYS.every((k) => (ps.buildings[k] ?? 0) >= MAX_BUILDING_LEVEL));
      });
    }
    await tx(async (c) => {
      const ps = await loadState(c, uid);
      snaps.push(snap(ps, d + 1));
    });
  }
  return { snaps, milestones, uid };
}

const results = [];
for (let i = 0; i < BOTS; i++) results.push(await runBot(i));
for (const r of results) {
  console.log(`\n=== бот (профиль ${PROFILE}), игрок ${r.uid}`);
  console.log('день | КП | Σзд | ком | опыт | откр | контр | камп | иссл | опер | слоты | ресурсы');
  for (const s of r.snaps) console.log([s.day, s.hq, s.bsum, s.cmd, s.xp, s.unlocked, s.controlled, s.camp, s.research, s.ops, s.slots, s.res].join(' | '));
  console.log('вехи (день):', JSON.stringify(r.milestones));
}
console.log('действия:', JSON.stringify(actionLog));
await pool.end();
