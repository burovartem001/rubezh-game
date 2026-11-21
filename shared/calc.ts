/**
 * Расчёт похода: стоимость, длительность, прогноз и итог.
 * Сервер использует эти функции авторитетно; клиент — для предпросмотра до подтверждения.
 */
import {
  BABAYAGA_BONUS,
  BASE_GROUP_CAPACITY,
  COMMS_RECON_PER_LEVEL,
  Cost,
  EARLY_PROTECTION_MAX_DIFFICULTY,
  EQUIPMENT,
  EquipmentType,
  HEAVY_HARD_BONUS,
  MISSIONS,
  MissionType,
  OPERATORS,
  OPERATOR_TYPES,
  OUTCOME_CONTROL_GAIN,
  OUTCOME_ORDER,
  OUTCOME_RECON_GAIN,
  OUTCOME_REWARD_MUL,
  OperatorType,
  Outcome,
  PERMANENT_LOSS_SHARE,
  RANDOM_SPREAD,
  RANK_BONUS,
  RECON_POWER_BONUS,
  RES_KEYS,
  Rarity,
  STRONGHOLD_DROP,
  SKILL_EFFECTS,
  SectorDef,
  Skills,
  VEHICLES,
  VEHICLE_DAMAGE_BASE,
  VehicleType,
  baseLossRate,
  detection,
  enemyPower,
  equipmentPower,
  lossCategory,
  missionRewards,
  missionXp,
  outcomeFor,
  vehicleBonus,
  EquipKind,
  VETERAN_BONUS,
  equipmentKindValue,
} from './config.js';
import { Mods, emptyMods, addMods } from './progression.js';

export type Group = Partial<Record<OperatorType, number>>;
export interface EquipLite {
  id?: number;
  type: EquipmentType;
  rarity: Rarity;
  level: number;
  durability?: number;
}
export interface PlanInput {
  sector: SectorDef;
  mission: MissionType;
  group: Group;
  ranks: Record<OperatorType, number>;
  vehicle: { type: VehicleType; level: number };
  equipment: EquipLite[];
  skills: Skills;
  commsLevel: number;
  sectorRecon: number;
  /** Пассивные бонусы: исследования, престиж, комплекты, сезон, обстановка, именные бойцы. */
  bonus?: { mods: Partial<Mods>; reasons: Reason[] };
  /** Для набега: сила обороны чужого полигона и добыча вместо наград сектора. */
  override?: { enemy?: number; rewards?: Cost };
}
export interface Reason {
  text: string;
  kind: 'bonus' | 'malus' | 'info';
}
export interface Plan {
  size: number;
  capacity: number;
  cost: Cost;
  duration: number;
  power: number;
  reconScore: number;
  enemy: number;
  uncertainty: number;
  ratioLow: number;
  ratioMid: number;
  ratioHigh: number;
  outcomeLow: Outcome;
  outcomeHigh: Outcome;
  lossRate: number;
  lossCategory: string;
  rewardsLow: Cost;
  rewardsHigh: Cost;
  reasons: Reason[];
  // промежуточные величины для итогового расчёта
  rewardMul: number;
  dataMul: number;
  reconGainMul: number;
  lossMul: number;
  fieldRecovery: number;
  damageReduce: number;
  permLossMul: number;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function groupSize(g: Group): number {
  return OPERATOR_TYPES.reduce((s, t) => s + (g[t] ?? 0), 0);
}
export function groupCapacity(vehicle: { type: VehicleType; level: number }, skills: Skills): number {
  return BASE_GROUP_CAPACITY + vehicleBonus(vehicle.type, vehicle.level).capacity + (skills.cohesion ?? 0) * SKILL_EFFECTS.cohesion;
}
/** Эффект заданного вида от оснащения группы и названия предметов, которые его дают. */
function equipKind(eq: EquipLite[], kind: EquipKind, mul = 1): { v: number; names: string } {
  const v = equipmentKindValue(eq, kind) * Math.max(0, mul);
  const names = eq.filter((e) => EQUIPMENT[e.type].kind === kind || EQUIPMENT[e.type].extra?.kind === kind).map((e) => EQUIPMENT[e.type].name).join(' и ');
  return { v, names };
}
function scaleCost(c: Cost, k: number): Cost {
  const o: Cost = {};
  for (const r of RES_KEYS) if (c[r]) o[r] = Math.round(c[r]! * k);
  return o;
}

export function planExpedition(inp: PlanInput): Plan {
  const { sector, mission, group, ranks, vehicle, equipment, skills } = inp;
  const m = MISSIONS[mission];
  const vb = vehicleBonus(vehicle.type, vehicle.level);
  const reasons: Reason[] = [];
  const size = groupSize(group);
  const capacity = groupCapacity(vehicle, skills);
  const vName = VEHICLES[vehicle.type].name;
  const M: Mods = addMods(emptyMods(), inp.bonus?.mods ?? {});
  for (const r of inp.bonus?.reasons ?? []) reasons.push(r);
  const eqMul = 1 + M.equip;

  // Длительность
  let duration = sector.baseTime * m.timeMul * vb.timeMul * Math.max(0.3, 1 - M.time);
  if (vb.timeMul < 1) reasons.push({ text: `${vName}: время похода −${pct(1 - vb.timeMul)}`, kind: 'bonus' });
  if (vb.timeMul > 1) reasons.push({ text: `${vName}: время похода +${pct(vb.timeMul - 1)}`, kind: 'malus' });
  duration = Math.max(mission === 'expedition' ? 3600 : 20, Math.round(duration)); // экспедиция — не меньше часа

  // Стоимость
  const economy = (skills.economy ?? 0) * SKILL_EFFECTS.economy;
  const fuel = Math.max(1, Math.round(sector.fuel * m.fuelMul * vb.fuelMul * (1 - economy) * Math.max(0.2, 1 - M.fuel)));
  let supplies = 0;
  for (const t of OPERATOR_TYPES) supplies += (group[t] ?? 0) * OPERATORS[t].upkeep;
  supplies = Math.round(supplies * (1 - economy));
  if (vb.fuelMul < 1) reasons.push({ text: `${vName}: расход топлива −${pct(1 - vb.fuelMul)}`, kind: 'bonus' });
  if (vb.fuelMul > 1) reasons.push({ text: `${vName}: расход топлива +${pct(vb.fuelMul - 1)}`, kind: 'malus' });
  if (economy) reasons.push({ text: `Командир, «Экономия»: топливо и припасы −${pct(economy)}`, kind: 'bonus' });

  // Боевая сила
  const fpvEq = equipKind(equipment, 'fpv', eqMul);
  const nsu = fpvEq.v;
  let power = 0;
  let reconScore = 0;
  for (const t of OPERATOR_TYPES) {
    const n = group[t] ?? 0;
    if (!n) continue;
    const rankMul = 1 + RANK_BONUS * ((ranks[t] ?? 1) - 1);
    let p = OPERATORS[t].power * n * rankMul;
    if (t === 'fpv' && nsu) p *= 1 + nsu;
    power += p;
    reconScore += OPERATORS[t].recon * n * rankMul;
  }
  if (nsu && (group.fpv ?? 0) > 0) reasons.push({ text: `${fpvEq.names}: +${pct(nsu)} к вкладу ${group.fpv} оператор(ов) FPV`, kind: 'bonus' });
  if (nsu && !(group.fpv ?? 0)) reasons.push({ text: `${fpvEq.names} не работает: в группе нет операторов FPV`, kind: 'malus' });
  for (const t of OPERATOR_TYPES) if ((ranks[t] ?? 1) > 1 && (group[t] ?? 0) > 0) reasons.push({ text: `${OPERATORS[t].name}, ранг ${ranks[t]}: +${pct(RANK_BONUS * (ranks[t] - 1))}`, kind: 'bonus' });

  let powerMul = 1;
  const hard = mission === 'stronghold' || sector.difficulty >= HEAVY_HARD_BONUS.minDifficulty;
  if ((group.heavy ?? 0) > 0) {
    if (hard) {
      const b = Math.min(HEAVY_HARD_BONUS.max, HEAVY_HARD_BONUS.perUnit * group.heavy!);
      powerMul += b;
      reasons.push({ text: `Тяжёлый БПЛА: +${pct(b)} к силе в сложном задании`, kind: 'bonus' });
    } else reasons.push({ text: 'Тяжёлый БПЛА даёт бонус только в сложных заданиях (сложность от 3 или опорный пункт)', kind: 'info' });
  }
  if ((group.babayaga ?? 0) > 0) {
    const special = mission === 'stronghold' || sector.type === 'event' || duration >= BABAYAGA_BONUS.longSeconds;
    if (special) {
      const b = Math.min(BABAYAGA_BONUS.max, BABAYAGA_BONUS.perUnit * group.babayaga!);
      powerMul += b;
      reasons.push({ text: `«Баба-яга»: +${pct(b)} в длительном походе или особой цели`, kind: 'bonus' });
    }
  }
  const powerEq = equipKind(equipment, 'power', eqMul);
  if (powerEq.v) {
    powerMul += powerEq.v;
    reasons.push({ text: `${powerEq.names}: +${pct(powerEq.v)} к силе группы`, kind: 'bonus' });
  }
  powerMul += M.power;
  const reconK = (inp.sectorRecon / 100) * RECON_POWER_BONUS;
  if (reconK > 0) {
    powerMul += reconK;
    reasons.push({ text: `Разведанность сектора ${inp.sectorRecon}%: +${pct(reconK)} к силе`, kind: 'bonus' });
  }
  if (inp.sectorRecon >= 100 && skills.deepRecon) {
    const b = skills.deepRecon * SKILL_EFFECTS.deepRecon;
    powerMul += b;
    reasons.push({ text: `Командир, «Глубокая разведка»: +${pct(b)} к силе`, kind: 'bonus' });
  }
  power *= powerMul;

  // Разведка
  const commsK = Math.max(0, inp.commsLevel - 1) * COMMS_RECON_PER_LEVEL;
  const reconEq = equipKind(equipment, 'recon', eqMul);
  const commkit = reconEq.v;
  const reconMul = Math.max(0.2, 1 + vb.reconBonus + commsK + commkit + M.recon);
  reconScore *= reconMul;
  if (vb.reconBonus) reasons.push({ text: `${vName}: разведка +${pct(vb.reconBonus)}`, kind: 'bonus' });
  if (commsK) reasons.push({ text: `Узел связи: разведка и данные +${pct(commsK)}`, kind: 'bonus' });
  if (commkit) reasons.push({ text: `${reconEq.names}: разведка и данные +${pct(commkit)}`, kind: 'bonus' });

  // Противник и прогноз
  let enemy: number;
  let effective: number;
  if (m.combat) {
    enemy = inp.override?.enemy ?? enemyPower(sector.difficulty) * m.enemyMul;
    effective = power;
  } else {
    enemy = detection(sector.difficulty);
    effective = reconScore + power * 0.15;
  }
  const obs = (skills.observation ?? 0) * SKILL_EFFECTS.observation;
  const uncertainty = Math.min(0.6, Math.max(0.03, 0.4 * (1 - inp.sectorRecon / 100) * (1 - Math.min(0.8, commkit * 2)) * (1 - obs) * (1 - Math.min(0.8, M.uncertainty))));
  const ratioMid = effective / enemy;
  const ratioLow = (effective * (1 - RANDOM_SPREAD)) / (enemy * (1 + uncertainty));
  const ratioHigh = (effective * (1 + RANDOM_SPREAD)) / (enemy * (1 - uncertainty));

  // Потери
  const lossEq = equipKind(equipment, 'losses', eqMul);
  const reb = lossEq.v;
  const vets = group.veteran ?? 0;
  const vetK = Math.min(VETERAN_BONUS.max, VETERAN_BONUS.perUnit * vets);
  const resil = (skills.resilience ?? 0) * SKILL_EFFECTS.resilience;
  const lossMul = m.lossMul * (1 - reb) * (1 - resil) * (1 - vetK) * Math.max(0.2, 1 - M.losses);
  if (reb) reasons.push({ text: `${lossEq.names}: расчётные потери −${pct(reb)}`, kind: 'bonus' });
  if (vetK) reasons.push({ text: `Бывшие штурмовики (${vets}): опыт бережёт группу, потери −${pct(vetK)}`, kind: 'bonus' });
  if (resil) reasons.push({ text: `Командир, «Устойчивость»: потери −${pct(resil)}`, kind: 'bonus' });
  const lossRate = baseLossRate(ratioMid) * lossMul;
  const fieldEq = equipKind(equipment, 'field', eqMul);
  const fieldRecovery = Math.min(0.85, fieldEq.v + Math.max(0, M.field));
  if (fieldRecovery) reasons.push({ text: `${fieldEq.names}: ${pct(fieldRecovery)} раненых восстанавливается в поле`, kind: 'bonus' });

  // Награды
  const trophies = (skills.trophies ?? 0) * SKILL_EFFECTS.trophies;
  const rewardMul = sector.rewardMul * (1 + vb.lootBonus + trophies) * Math.max(0.2, 1 + M.rewards);
  if (vb.lootBonus) reasons.push({ text: `${vName}: объём добычи +${pct(vb.lootBonus)}`, kind: 'bonus' });
  if (trophies) reasons.push({ text: `Командир, «Трофеи»: награды +${pct(trophies)}`, kind: 'bonus' });
  const analytics = (skills.analytics ?? 0) * SKILL_EFFECTS.analytics;
  const dataMul = sector.rewardMul * (1 + commsK + commkit + analytics) * (1 + trophies) * Math.max(0.2, 1 + M.rewards + M.data);
  if (analytics) reasons.push({ text: `Командир, «Аналитика»: данные +${pct(analytics)}`, kind: 'bonus' });
  const reconGainMul = 1 + obs + vb.reconBonus + commkit;

  const outcomeLow = outcomeFor(ratioLow);
  const outcomeHigh = outcomeFor(ratioHigh);
  const base = inp.override?.rewards ?? missionRewards(mission, sector.difficulty);
  const rewardsFor = (o: Outcome) => {
    const r = scaleCost(base, rewardMul * OUTCOME_REWARD_MUL[o]);
    if (r.data) r.data = Math.round((base.data ?? 0) * OUTCOME_REWARD_MUL[o] * dataMul);
    return r;
  };

  return {
    size,
    capacity,
    cost: { fuel, supplies },
    duration,
    power: round1(power),
    reconScore: round1(reconScore),
    enemy: round1(enemy),
    uncertainty,
    ratioLow,
    ratioMid,
    ratioHigh,
    outcomeLow,
    outcomeHigh,
    lossRate,
    lossCategory: lossCategory(lossRate),
    rewardsLow: rewardsFor(outcomeLow),
    rewardsHigh: rewardsFor(outcomeHigh),
    reasons,
    rewardMul,
    dataMul,
    reconGainMul,
    lossMul,
    fieldRecovery,
    damageReduce: fieldRecovery,
    permLossMul: Math.max(0, 1 - M.permLoss),
  };
}

function round1(x: number) {
  return Math.round(x * 10) / 10;
}

/** Детерминированный генератор случайных чисел. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Casualties {
  wounded: number;
  lost: number;
  fieldRecovered: number;
}
export interface ExpeditionResult {
  outcome: Outcome;
  ratio: number;
  randomFactor: number;
  casualties: Partial<Record<OperatorType, Casualties>>;
  totalWounded: number;
  totalLost: number;
  totalFieldRecovered: number;
  vehicleDamaged: boolean;
  rewards: Cost;
  xp: number;
  reconGain: number;
  controlGain: number;
  equipmentDrop: { type: EquipmentType; rarity: Rarity } | null;
  reasons: Reason[];
}

export function resolveExpedition(inp: PlanInput, plan: Plan, seed: number): ExpeditionResult {
  const rand = rng(seed);
  const m = MISSIONS[inp.mission];
  const d = inp.sector.difficulty;
  const randomFactor = 1 - RANDOM_SPREAD + rand() * RANDOM_SPREAD * 2;
  const ratio = (plan.ratioMid * randomFactor);
  const outcome = outcomeFor(ratio);
  const reasons: Reason[] = [...plan.reasons];
  reasons.unshift({
    text: `Соотношение сил ${ratio.toFixed(2)} (группа ${m.combat ? plan.power : plan.reconScore} против ${plan.enemy}${m.combat ? '' : ' по разведке'}; случайный фактор ×${randomFactor.toFixed(2)})`,
    kind: ratio >= 1 ? 'bonus' : 'malus',
  });

  // Потери
  const size = plan.size;
  let rate = baseLossRate(ratio) * plan.lossMul;
  let count = Math.floor(rate * size + rand());
  const early = d <= EARLY_PROTECTION_MAX_DIFFICULTY;
  if (early) {
    const cap = Math.floor(size / 2);
    if (count > cap) {
      count = cap;
      reasons.push({ text: 'Защита начального этапа: потери ограничены половиной группы', kind: 'info' });
    }
  }
  count = Math.min(count, size);
  // Кто попал в потери: вероятность пропорциональна уязвимости класса
  const pool: OperatorType[] = [];
  for (const t of OPERATOR_TYPES) for (let i = 0; i < (inp.group[t] ?? 0); i++) pool.push(t);
  const casualties: Partial<Record<OperatorType, Casualties>> = {};
  const hit: OperatorType[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    const weights = pool.map((t) => OPERATORS[t].exposure);
    const total = weights.reduce((s, w) => s + w, 0);
    let x = rand() * total;
    let idx = 0;
    while (idx < pool.length - 1 && x >= weights[idx]) x -= weights[idx++];
    hit.push(pool.splice(idx, 1)[0]);
  }
  let permanent = 0;
  if (!early && (outcome === 'fail' || outcome === 'partial') && hit.length) permanent = Math.floor(hit.length * PERMANENT_LOSS_SHARE * (plan.permLossMul ?? 1) + rand() * 0.5);
  let totalWounded = 0, totalLost = 0, totalField = 0;
  hit.forEach((t, i) => {
    const c = (casualties[t] ??= { wounded: 0, lost: 0, fieldRecovered: 0 });
    if (i < permanent) {
      c.lost++;
      totalLost++;
    } else if (rand() < plan.fieldRecovery) {
      c.fieldRecovered++;
      totalField++;
    } else {
      c.wounded++;
      totalWounded++;
    }
  });
  if (count === 0) reasons.push({ text: 'Группа вернулась без потерь', kind: 'bonus' });
  else {
    const why = ratio < 0.7 ? 'группа заметно уступала противнику' : ratio < 1 ? 'силы были почти равны' : 'даже при перевесе возможны отдельные потери';
    reasons.push({ text: `Потери ${count} из ${size}: ${why} (расчётная доля ${Math.round(rate * 100)}%)`, kind: 'malus' });
  }

  // Транспорт
  const dmgChance = m.combat ? Math.max(0, Math.min(0.6, VEHICLE_DAMAGE_BASE * (1.3 - Math.min(ratio, 1.3)) / 0.6)) * (1 - plan.damageReduce) : 0.02;
  const vehicleDamaged = rand() < dmgChance;
  if (vehicleDamaged) reasons.push({ text: `${VEHICLES[inp.vehicle.type].name} повреждён — нужен ремонт в мастерской`, kind: 'malus' });

  // Награды
  const base = inp.override?.rewards ?? missionRewards(inp.mission, d);
  const rewards: Cost = {};
  for (const r of RES_KEYS) {
    if (!base[r]) continue;
    const k = r === 'data' ? plan.dataMul : plan.rewardMul;
    rewards[r] = Math.round(base[r]! * k * OUTCOME_REWARD_MUL[outcome]);
  }
  let equipmentDrop: ExpeditionResult['equipmentDrop'] = null;
  if (inp.mission === 'stronghold' && (outcome === 'success' || outcome === 'decisive') && rand() < STRONGHOLD_DROP.chance) {
    const types: EquipmentType[] = ['nsu', 'reb', 'commkit', 'repairkit'];
    const type = types[Math.floor(rand() * types.length)];
    let rarity: Rarity = 'common';
    if (d >= STRONGHOLD_DROP.rareFrom && rand() < STRONGHOLD_DROP.rareChance) rarity = 'rare';
    else if (d >= STRONGHOLD_DROP.improvedFrom || (outcome === 'decisive' && d >= 3)) rarity = 'improved';
    equipmentDrop = { type, rarity };
  }
  const reconGain = Math.round((inp.mission === 'recon' ? OUTCOME_RECON_GAIN[outcome] : 5) * plan.reconGainMul);
  const controlGain = inp.mission === 'raid' || inp.mission === 'stronghold' ? OUTCOME_CONTROL_GAIN[outcome] * (inp.mission === 'stronghold' ? 2 : 1) : inp.mission === 'supply' ? Math.round(OUTCOME_CONTROL_GAIN[outcome] / 2) : 0;
  return {
    outcome,
    ratio: Math.round(ratio * 100) / 100,
    randomFactor: Math.round(randomFactor * 100) / 100,
    casualties,
    totalWounded,
    totalLost,
    totalFieldRecovered: totalField,
    vehicleDamaged,
    rewards,
    xp: missionXp(d, outcome),
    reconGain,
    controlGain,
    equipmentDrop,
    reasons,
  };
}

export function outcomeRangeText(low: Outcome, high: Outcome, names: Record<Outcome, string>): string {
  if (low === high) return names[low];
  return `от «${names[low]}» до «${names[high]}»`;
}
export { OUTCOME_ORDER };
