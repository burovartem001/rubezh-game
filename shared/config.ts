/**
 * Баланс игры «Рубеж». Единственный источник цен, длительностей, характеристик и наград.
 * Импортируется и сервером (авторитетный расчёт), и клиентом (подписи, предпросмотр).
 * Все величины — условные игровые и не описывают реальную технику.
 */

export type ResKey = 'supplies' | 'parts' | 'fuel' | 'data';
export type Cost = Partial<Record<ResKey, number>>;
export const RES_KEYS: ResKey[] = ['supplies', 'parts', 'fuel', 'data'];
export const RES_NAMES: Record<ResKey, string> = {
  supplies: 'Припасы',
  parts: 'Комплектующие',
  fuel: 'Топливо',
  data: 'Данные',
};
export const RES_ICONS: Record<ResKey, string> = { supplies: '▣', parts: '◈', fuel: '◉', data: '◇' };

export const START_RESOURCES: Record<ResKey, number> = { supplies: 420, parts: 260, fuel: 160, data: 20 };

/* ───────────────────────────── Здания ───────────────────────────── */

export type BuildingKey = 'hq' | 'training' | 'workshop' | 'supply' | 'fueldepot' | 'comms';
export const BUILDING_KEYS: BuildingKey[] = ['hq', 'training', 'workshop', 'supply', 'fueldepot', 'comms'];
export const MAX_BUILDING_LEVEL = 10;

export interface BuildingDef {
  name: string;
  purpose: string;
  baseCost: Cost;
  costGrowth: number;
  baseTime: number; // секунды на улучшение 1 → 2
  timeGrowth: number;
}

export const BUILDINGS: Record<BuildingKey, BuildingDef> = {
  hq: {
    name: 'Командный пункт',
    purpose: 'Задаёт максимальный уровень остальных зданий. На 4 уровне открывает второй одновременный поход.',
    baseCost: { supplies: 100, parts: 80 },
    costGrowth: 1.5,
    baseTime: 20,
    timeGrowth: 1.8,
  },
  training: {
    name: 'Центр подготовки',
    purpose: 'Обучение операторов и повышение ранга специализаций. Уровень сокращает время подготовки и открывает новые специализации.',
    baseCost: { supplies: 120, parts: 90 },
    costGrowth: 1.5,
    baseTime: 25,
    timeGrowth: 1.75,
  },
  workshop: {
    name: 'Мастерская БПЛА',
    purpose: 'Производит комплектующие, собирает оснащение и обслуживает транспорт.',
    baseCost: { supplies: 90, parts: 60 },
    costGrowth: 1.5,
    baseTime: 20,
    timeGrowth: 1.75,
  },
  supply: {
    name: 'Пункт снабжения',
    purpose: 'Производит припасы и увеличивает их вместимость.',
    baseCost: { supplies: 60, parts: 60 },
    costGrowth: 1.5,
    baseTime: 15,
    timeGrowth: 1.75,
  },
  fueldepot: {
    name: 'Склад ГСМ',
    purpose: 'Производит и хранит топливо.',
    baseCost: { supplies: 70, parts: 50 },
    costGrowth: 1.5,
    baseTime: 15,
    timeGrowth: 1.75,
  },
  comms: {
    name: 'Узел связи',
    purpose: 'Открывает новые секторы, усиливает разведку и увеличивает получаемые данные.',
    baseCost: { supplies: 90, parts: 70, data: 10 },
    costGrowth: 1.5,
    baseTime: 25,
    timeGrowth: 1.75,
  },
};

/** Цена улучшения с уровня `level` на `level + 1`. */
export function buildingUpgradeCost(key: BuildingKey, level: number): Cost {
  const d = BUILDINGS[key];
  const k = Math.pow(d.costGrowth, level - 1);
  const out: Cost = {};
  for (const r of RES_KEYS) if (d.baseCost[r]) out[r] = Math.round(d.baseCost[r]! * k);
  return out;
}
export function buildingUpgradeTime(key: BuildingKey, level: number): number {
  const d = BUILDINGS[key];
  return Math.round(d.baseTime * Math.pow(d.timeGrowth, level - 1));
}

/* Производство и хранение */
export const PRODUCTION: Record<'supplies' | 'parts' | 'fuel', { building: BuildingKey; base: number; growth: number }> = {
  supplies: { building: 'supply', base: 180, growth: 1.25 }, // в час
  parts: { building: 'workshop', base: 120, growth: 1.25 },
  fuel: { building: 'fueldepot', base: 120, growth: 1.25 },
};
export const PRODUCED_KEYS = ['supplies', 'parts', 'fuel'] as const;
export function productionPerHour(res: 'supplies' | 'parts' | 'fuel', level: number): number {
  const p = PRODUCTION[res];
  return Math.round(p.base * Math.pow(p.growth, level - 1));
}
export function storageCap(level: number): number {
  return Math.round(600 * Math.pow(1.4, level - 1) / 10) * 10;
}

export const HQ_SECOND_SLOT_LEVEL = 4;
export const TRAINING_SPEED_PER_LEVEL = 0.06; // −6% времени подготовки за уровень выше 1
export const COMMS_RECON_PER_LEVEL = 0.05; // +5% к разведке и данным за уровень выше 1
export const WORKSHOP_RARITY_LEVEL = { common: 1, improved: 3, rare: 6 } as const;

export function buildingEffectText(key: BuildingKey, level: number): string {
  switch (key) {
    case 'hq':
      return `Максимальный уровень зданий: ${level}. Походов одновременно: ${level >= HQ_SECOND_SLOT_LEVEL ? 2 : 1}.`;
    case 'training':
      return `Подготовка быстрее на ${Math.round(Math.min(0.5, (level - 1) * TRAINING_SPEED_PER_LEVEL) * 100)}%. Открыто: ${unlockedOperatorNames(level).join(', ')}.`;
    case 'workshop':
      return `Комплектующие: ${productionPerHour('parts', level)}/ч, хранилище ${storageCap(level)}. Оснащение: ${rarityNamesFor(level)}.`;
    case 'supply':
      return `Припасы: ${productionPerHour('supplies', level)}/ч, хранилище ${storageCap(level)}.`;
    case 'fueldepot':
      return `Топливо: ${productionPerHour('fuel', level)}/ч, хранилище ${storageCap(level)}.`;
    case 'comms':
      return `Разведка и данные +${Math.round((level - 1) * COMMS_RECON_PER_LEVEL * 100)}%. Доступны секторы до уровня связи ${level}.`;
  }
}

function rarityNamesFor(workshopLevel: number): string {
  return (Object.keys(WORKSHOP_RARITY_LEVEL) as CraftRarity[])
    .filter((r) => workshopLevel >= WORKSHOP_RARITY_LEVEL[r])
    .map((r) => RARITY_NAMES[r].toLowerCase())
    .join(', ');
}

/* ───────────────────────────── Операторы ───────────────────────────── */

export type OperatorType = 'scout' | 'fpv' | 'heavy' | 'babayaga' | 'veteran';
export const OPERATOR_TYPES: OperatorType[] = ['scout', 'fpv', 'heavy', 'babayaga', 'veteran'];
/** Обучаемые классы (наградные выдаются только за заслуги). */
export const TRAINABLE_OPERATORS: OperatorType[] = ['scout', 'fpv', 'heavy', 'babayaga'];

export interface OperatorDef {
  name: string;
  role: string;
  strong: string;
  weak: string;
  cost: Cost;
  time: number; // секунды подготовки одного оператора на ур. 1 центра
  power: number; // вклад в боевой рейтинг
  recon: number; // вклад в разведку
  exposure: number; // чем выше, тем вероятнее попадает в потери
  upkeep: number; // припасы на поход
  unlock: { training: number; hq?: number };
  sprite: number; // номер панели на иллюстрации
  award?: boolean; // только награда за заслуги на сайте «Учёт дронов»
}

export const OPERATORS: Record<OperatorType, OperatorDef> = {
  scout: {
    name: 'Разведчик',
    role: 'Открывает данные о секторе',
    strong: 'Разведка и обнаружение наград',
    weak: 'Слабее в сложных столкновениях',
    cost: { supplies: 40 },
    time: 15,
    power: 2,
    recon: 3,
    exposure: 1.3,
    upkeep: 4,
    unlock: { training: 1 },
    sprite: 0,
  },
  fpv: {
    name: 'Оператор FPV',
    role: 'Основной атакующий класс',
    strong: 'Высокий вклад в боевой рейтинг',
    weak: 'Требует больше комплектующих',
    cost: { supplies: 60, parts: 30 },
    time: 25,
    power: 6,
    recon: 0.5,
    exposure: 1.0,
    upkeep: 5,
    unlock: { training: 2 },
    sprite: 1,
  },
  heavy: {
    name: 'Оператор тяжёлого БПЛА',
    role: 'Поддержка группы',
    strong: 'Бонус к сложным PvE-заданиям',
    weak: 'Высокая стоимость и время подготовки',
    cost: { supplies: 120, parts: 80 },
    time: 60,
    power: 9,
    recon: 1,
    exposure: 0.8,
    upkeep: 6,
    unlock: { training: 3 },
    sprite: 2,
  },
  babayaga: {
    name: 'Оператор «Баба-яги»',
    role: 'Редкая специализация',
    strong: 'Бонус к длительным походам и особым целям',
    weak: 'Позднее открытие, высокий расход припасов',
    cost: { supplies: 200, parts: 150, data: 20 },
    time: 120,
    power: 12,
    recon: 1.5,
    exposure: 0.9,
    upkeep: 15,
    unlock: { training: 5, hq: 5 },
    sprite: 3,
  },
  veteran: {
    name: 'Бывший штурмовик',
    role: 'Наградной боец',
    strong: 'Сильнее оператора FPV, сам реже попадает в потери и снижает потери группы',
    weak: 'Не обучается — выдаётся только за особые заслуги',
    cost: {},
    time: 0,
    power: 7,
    recon: 1.5,
    exposure: 0.55,
    upkeep: 5,
    unlock: { training: 99 },
    sprite: 2,
    award: true,
  },
};

/** Тяжёлый БПЛА: +5% к силе группы за оператора в сложных заданиях (опорный пункт или сложность ≥ 3), до +25%. */
export const HEAVY_HARD_BONUS = { perUnit: 0.05, max: 0.25, minDifficulty: 3 };
/** «Баба-яга»: +6% за оператора в длительных походах (≥ 5 мин) и особых целях (опорный пункт, событийная зона), до +30%. */
export const BABAYAGA_BONUS = { perUnit: 0.06, max: 0.3, longSeconds: 300 };
/** «Бывший штурмовик»: −4% к потерям всей группы за бойца, до −16%. */
export const VETERAN_BONUS = { perUnit: 0.04, max: 0.16 };

export const MAX_TRAIN_BATCH = 10;
export const TRAIN_QUEUE_LIMIT = 5;
export const WORKSHOP_QUEUE_LIMIT = 3;

export function operatorUnlocked(type: OperatorType, trainingLevel: number, hqLevel: number): boolean {
  if (OPERATORS[type].award) return false;
  const u = OPERATORS[type].unlock;
  return trainingLevel >= u.training && hqLevel >= (u.hq ?? 1);
}
function unlockedOperatorNames(trainingLevel: number): string[] {
  return TRAINABLE_OPERATORS.filter((t) => trainingLevel >= OPERATORS[t].unlock.training).map((t) => OPERATORS[t].name);
}
export function trainTime(type: OperatorType, trainingLevel: number): number {
  const k = 1 - Math.min(0.5, (trainingLevel - 1) * TRAINING_SPEED_PER_LEVEL);
  return Math.max(5, Math.round(OPERATORS[type].time * k));
}

/** Ранг специализации 1–5: +10% к силе и разведке за ранг выше 1. */
export const MAX_RANK = 5;
export const RANK_BONUS = 0.1;
export function rankUpgradeCost(type: OperatorType, toRank: number): Cost {
  const k = Math.pow(1.8, toRank - 2);
  const base = OPERATORS[type].award ? { supplies: 80 } : OPERATORS[type].cost;
  return {
    supplies: Math.round((base.supplies ?? 0) * 1.5 * k),
    parts: Math.round(60 * k),
    data: Math.round(10 * Math.pow(2, toRank - 2)),
  };
}
export function rankUpgradeTime(toRank: number, trainingLevel: number): number {
  const k = 1 - Math.min(0.5, (trainingLevel - 1) * TRAINING_SPEED_PER_LEVEL);
  return Math.round(40 * Math.pow(1.8, toRank - 2) * k);
}
/** Для ранга R нужен центр подготовки уровня 2R − 2. */
export function rankRequiredTraining(toRank: number): number {
  return 2 * toRank - 2;
}

/** Восстановление раненых: половина припасов обучения на оператора. */
export function recoveryCost(counts: Partial<Record<OperatorType, number>>, logisticsRank: number): Cost {
  let s = 0;
  for (const t of OPERATOR_TYPES) s += (counts[t] ?? 0) * Math.ceil((OPERATORS[t].award ? 80 : OPERATORS[t].cost.supplies ?? 0) * 0.5);
  return { supplies: Math.round(s * (1 - SKILL_EFFECTS.medic * logisticsRank)) };
}
export function recoveryTime(total: number, logisticsRank: number): number {
  return Math.round((10 + 8 * total) * (1 - SKILL_EFFECTS.medic * logisticsRank));
}

/* ───────────────────────────── Транспорт ───────────────────────────── */

export type VehicleType = 'moto' | 'ebike' | 'bukhanka' | 'gyro' | 'niva';
export const VEHICLE_TYPES: VehicleType[] = ['moto', 'ebike', 'bukhanka', 'gyro', 'niva'];
export const STANDARD_VEHICLES: VehicleType[] = ['moto', 'ebike', 'bukhanka'];
export const MAX_VEHICLE_LEVEL = 5;

export interface VehicleDef {
  name: string;
  purpose: string;
  unlockHq: number;
  acquireCost: Cost;
  acquireTime: number;
  fuelMul: number; // базовый коэффициент расхода топлива
  sprite: number; // −1 — своя векторная иллюстрация
  award?: boolean;
}

export const VEHICLES: Record<VehicleType, VehicleDef> = {
  moto: {
    name: 'Мотоцикл',
    purpose: 'Короткие походы: меньше время перехода',
    unlockHq: 1,
    acquireCost: {},
    acquireTime: 0,
    fuelMul: 1,
    sprite: 0,
  },
  ebike: {
    name: 'Электровелосипед',
    purpose: 'Экономичная разведка: меньше расход топлива, бонус к разведке',
    unlockHq: 2,
    acquireCost: { supplies: 30, parts: 60 },
    acquireTime: 20,
    fuelMul: 1,
    sprite: 1,
  },
  bukhanka: {
    name: 'УАЗ «Буханка»',
    purpose: 'Универсальная группа: больше вместимость и объём добычи',
    unlockHq: 3,
    acquireCost: { supplies: 120, parts: 200, fuel: 40 },
    acquireTime: 60,
    fuelMul: 1.5,
    sprite: 2,
  },
  gyro: {
    name: 'Гироскутер',
    purpose: 'Наградной: бесшумный, почти не ест топливо, в разведке лучше электровелосипеда',
    unlockHq: 99,
    acquireCost: {},
    acquireTime: 0,
    fuelMul: 1,
    sprite: -1,
    award: true,
  },
  niva: {
    name: 'Золотая Нива',
    purpose: 'Наградная: вместительнее, быстрее и экономнее «Буханки», больше добычи',
    unlockHq: 99,
    acquireCost: {},
    acquireTime: 0,
    fuelMul: 1.3,
    sprite: -1,
    award: true,
  },
};

export interface VehicleBonus {
  timeMul: number;
  fuelMul: number;
  capacity: number;
  lootBonus: number;
  reconBonus: number;
}
export function vehicleBonus(type: VehicleType, level: number): VehicleBonus {
  const l = level - 1;
  switch (type) {
    case 'moto':
      return { timeMul: 1 - (0.25 + 0.03 * l), fuelMul: 1, capacity: 0, lootBonus: 0, reconBonus: 0 };
    case 'ebike':
      return { timeMul: 1, fuelMul: 1 - (0.5 + 0.05 * l), capacity: 0, lootBonus: 0, reconBonus: 0.1 + 0.02 * l };
    case 'bukhanka':
      return { timeMul: 1.1, fuelMul: 1.5, capacity: 2 + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0), lootBonus: 0.1 + 0.04 * l, reconBonus: 0 };
    case 'gyro':
      return { timeMul: 0.9, fuelMul: 1 - (0.6 + 0.05 * l), capacity: 0, lootBonus: 0, reconBonus: 0.14 + 0.02 * l };
    case 'niva':
      return { timeMul: 1, fuelMul: 1.3, capacity: 3 + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0), lootBonus: 0.15 + 0.04 * l, reconBonus: 0 };
  }
}
export function vehicleBonusText(type: VehicleType, level: number): string {
  const b = vehicleBonus(type, level);
  const parts: string[] = [];
  if (b.timeMul < 1) parts.push(`время −${Math.round((1 - b.timeMul) * 100)}%`);
  if (b.timeMul > 1) parts.push(`время +${Math.round((b.timeMul - 1) * 100)}%`);
  if (b.fuelMul < 1) parts.push(`топливо −${Math.round((1 - b.fuelMul) * 100)}%`);
  if (b.fuelMul > 1) parts.push(`топливо +${Math.round((b.fuelMul - 1) * 100)}%`);
  if (b.capacity) parts.push(`группа +${b.capacity}`);
  if (b.lootBonus) parts.push(`добыча +${Math.round(b.lootBonus * 100)}%`);
  if (b.reconBonus) parts.push(`разведка +${Math.round(b.reconBonus * 100)}%`);
  return parts.join(', ');
}
export function vehicleUpgradeCost(level: number): Cost {
  const k = Math.pow(1.6, level - 1);
  return { parts: Math.round(80 * k), supplies: Math.round(40 * k) };
}
export function vehicleUpgradeTime(level: number): number {
  return Math.round(30 * Math.pow(1.6, level - 1));
}
/** Для улучшения транспорта до уровня L нужна мастерская уровня L. */
export function vehicleUpgradeRequiredWorkshop(toLevel: number): number {
  return toLevel;
}
export function vehicleRepairCost(level: number): Cost {
  return { parts: 30 + 15 * level, supplies: 20 };
}
export const VEHICLE_REPAIR_TIME = 40;

/* ───────────────────────────── Оснащение ───────────────────────────── */

export type EquipmentType = 'nsu' | 'reb' | 'commkit' | 'repairkit' | 'rebNew' | 'nsuRubicon' | 'pigGear' | 'fpvBoevye' | 'mavicField';
/** Предметы, которые собирают в мастерской и находят в походах. */
export const EQUIPMENT_TYPES: EquipmentType[] = ['nsu', 'reb', 'commkit', 'repairkit'];
/** Наградные предметы: выдаются за особые заслуги на сайте «Учёт дронов». */
export const AWARD_EQUIPMENT: EquipmentType[] = ['rebNew', 'nsuRubicon', 'pigGear', 'fpvBoevye', 'mavicField'];
export const ALL_EQUIPMENT_TYPES: EquipmentType[] = [...EQUIPMENT_TYPES, ...AWARD_EQUIPMENT];
export type Rarity = 'common' | 'improved' | 'rare' | 'award';
export type CraftRarity = 'common' | 'improved' | 'rare';
export const RARITIES: CraftRarity[] = ['common', 'improved', 'rare'];
export const RARITY_NAMES: Record<Rarity, string> = { common: 'Обычный', improved: 'Улучшенный', rare: 'Редкий', award: 'Наградной' };
export const MAX_EQUIPMENT_LEVEL = 5;
export const EQUIPMENT_LIMIT = 20;
export const MAX_EQUIPMENT_PER_GROUP = 2;

/** Вид эффекта: два предмета с одинаковым видом эффекта в одну группу не берутся. */
export type EquipKind = 'fpv' | 'losses' | 'recon' | 'field' | 'power';
export const EQUIP_KIND_NAMES: Record<EquipKind, string> = { fpv: 'усиление FPV', losses: 'защита от потерь', recon: 'разведка', field: 'полевой ремонт', power: 'ударная сила' };
export interface EquipmentDef {
  name: string;
  icon: string;
  kind: EquipKind;
  base: Partial<Record<Rarity, number>>; // доля на уровне 1
  extra?: { kind: EquipKind; value: number }; // второй, небольшой эффект
  award?: boolean;
}
export const EQUIPMENT: Record<EquipmentType, EquipmentDef> = {
  nsu: { name: 'НСУ для FPV', icon: '▣', kind: 'fpv', base: { common: 0.12, improved: 0.18, rare: 0.25 } },
  reb: { name: 'Комплекс РЭБ', icon: '◉', kind: 'losses', base: { common: 0.1, improved: 0.15, rare: 0.22 } },
  commkit: { name: 'Комплект связи', icon: '⌁', kind: 'recon', base: { common: 0.1, improved: 0.15, rare: 0.22 } },
  repairkit: { name: 'Полевой ремкомплект', icon: '✚', kind: 'field', base: { common: 0.3, improved: 0.45, rare: 0.6 } },
  // наградные: чуть сильнее «улучшенных» стандартных
  rebNew: { name: 'РЭБ нового образца', icon: '◉', kind: 'losses', base: { award: 0.18 }, award: true },
  nsuRubicon: { name: 'НСУ, брошенное Рубиконом', icon: '▣', kind: 'fpv', base: { award: 0.21 }, award: true },
  pigGear: { name: 'Снятое со свиньи снаряжение', icon: '✚', kind: 'losses', base: { award: 0.12 }, extra: { kind: 'power', value: 0.04 }, award: true },
  fpvBoevye: { name: 'FPV-дрон, купленный на боевые', icon: '▣', kind: 'power', base: { award: 0.08 }, award: true },
  mavicField: { name: 'Дрон Mavic, найденный в поле', icon: '⌁', kind: 'recon', base: { award: 0.18 }, award: true },
};
const KIND_CAP: Record<EquipKind, number> = { fpv: 0.6, losses: 0.6, recon: 0.6, field: 0.85, power: 0.3 };
export function equipmentPower(type: EquipmentType, rarity: Rarity, level: number): number {
  const d = EQUIPMENT[type];
  const base = d.base[rarity] ?? d.base.award ?? Object.values(d.base)[0] ?? 0;
  return Math.min(KIND_CAP[d.kind], base * (1 + 0.1 * (level - 1)));
}
/** Суммарный эффект заданного вида по набору предметов. */
export function equipmentKindValue(items: { type: EquipmentType; rarity: Rarity; level: number }[], kind: EquipKind): number {
  let v = 0;
  for (const e of items) {
    const d = EQUIPMENT[e.type];
    if (d.kind === kind) v += equipmentPower(e.type, e.rarity, e.level);
    if (d.extra?.kind === kind) v += d.extra.value * (1 + 0.1 * (e.level - 1));
  }
  return Math.min(KIND_CAP[kind], v);
}
function kindText(kind: EquipKind, p: number): string {
  switch (kind) {
    case 'fpv':
      return `+${p}% к вкладу операторов FPV`;
    case 'losses':
      return `−${p}% к расчётным потерям группы`;
    case 'recon':
      return `+${p}% к разведке и данным, прогноз точнее на ${p * 2}%`;
    case 'field':
      return `${p}% раненых восстанавливается в поле, риск поломки транспорта −${p}%`;
    case 'power':
      return `+${p}% к силе всей группы`;
  }
}
export function equipmentEffectText(type: EquipmentType, rarity: Rarity, level: number): string {
  const d = EQUIPMENT[type];
  const main = kindText(d.kind, Math.round(equipmentPower(type, rarity, level) * 100));
  return d.extra ? `${main}; ${kindText(d.extra.kind, Math.round(d.extra.value * (1 + 0.1 * (level - 1)) * 100))}` : main;
}
export const CRAFT: Record<CraftRarity, { cost: Cost; time: number }> = {
  common: { cost: { supplies: 40, parts: 80 }, time: 30 },
  improved: { cost: { supplies: 80, parts: 200, data: 20 }, time: 90 },
  rare: { cost: { supplies: 150, parts: 450, data: 60 }, time: 240 },
};
export function equipmentUpgradeCost(rarity: Rarity, level: number): Cost {
  const r = { common: 1, improved: 1.6, rare: 2.4, award: 2 }[rarity];
  return { parts: Math.round(60 * r * Math.pow(1.7, level - 1)), data: Math.round(5 * r * level) };
}

/* ───────────────────────────── Награды за заслуги ───────────────────────────── */

/** Каталог наград, которые выдаёт сайт «Учёт дронов». Ключ награды передаётся в API выдачи. */
export type AwardKey = 'veteran' | 'gyro' | 'niva' | 'rebNew' | 'nsuRubicon' | 'pigGear' | 'fpvBoevye' | 'mavicField';
export interface AwardDef {
  kind: 'operator' | 'vehicle' | 'equipment';
  name: string;
}
export const AWARDS: Record<AwardKey, AwardDef> = {
  veteran: { kind: 'operator', name: 'Бывший штурмовик' },
  gyro: { kind: 'vehicle', name: 'Гироскутер' },
  niva: { kind: 'vehicle', name: 'Золотая Нива' },
  rebNew: { kind: 'equipment', name: 'РЭБ нового образца' },
  nsuRubicon: { kind: 'equipment', name: 'НСУ, брошенное Рубиконом' },
  pigGear: { kind: 'equipment', name: 'Снятое со свиньи снаряжение' },
  fpvBoevye: { kind: 'equipment', name: 'FPV-дрон, купленный на боевые' },
  mavicField: { kind: 'equipment', name: 'Дрон Mavic, найденный в поле' },
};
export const AWARD_KEYS = Object.keys(AWARDS) as AwardKey[];
export const AWARD_SOURCE_NAME = 'сайт «Учёт дронов»';

/* ───────────────────────────── Командир ───────────────────────────── */

export const COMMANDER_MAX_LEVEL = 10;
/** Опыт, нужный для достижения уровня (индекс = уровень − 1). */
export const XP_THRESHOLDS = [0, 80, 200, 380, 620, 950, 1400, 2000, 2800, 3800];
export function commanderLevel(xp: number): number {
  let l = 1;
  for (let i = 0; i < XP_THRESHOLDS.length; i++) if (xp >= XP_THRESHOLDS[i]) l = i + 1;
  return l;
}
export const RESPEC_COST_DATA = 100; // после бесплатного сброса

export type Branch = 'command' | 'recon' | 'logistics';
export const BRANCH_NAMES: Record<Branch, string> = { command: 'Командование', recon: 'Разведка', logistics: 'Логистика' };
export type SkillKey = 'cohesion' | 'resilience' | 'echelon' | 'analytics' | 'observation' | 'deepRecon' | 'economy' | 'trophies' | 'medic';
export interface SkillDef {
  branch: Branch;
  name: string;
  max: number;
  needBranchPoints: number;
  describe: (rank: number) => string;
}
export const SKILL_EFFECTS = {
  cohesion: 1, // +1 к вместимости группы за ранг
  resilience: 0.08, // −8% к потерям за ранг
  echelon: 1, // +1 слот похода
  analytics: 0.1, // +10% данных за ранг
  observation: 0.15, // +15% к росту разведанности и −15% к неопределённости прогноза за ранг
  deepRecon: 0.08, // +8% к силе в разведанных (≥ 100%) секторах за ранг
  economy: 0.1, // −10% топлива и припасов похода за ранг
  trophies: 0.08, // +8% к наградам за ранг
  medic: 0.2, // −20% к цене и времени восстановления за ранг
};
export const SKILLS: Record<SkillKey, SkillDef> = {
  cohesion: { branch: 'command', name: 'Слаженность', max: 2, needBranchPoints: 0, describe: (r) => `Вместимость группы +${r}` },
  resilience: { branch: 'command', name: 'Устойчивость', max: 3, needBranchPoints: 1, describe: (r) => `Потери −${Math.round(r * SKILL_EFFECTS.resilience * 100)}%` },
  echelon: { branch: 'command', name: 'Второй эшелон', max: 1, needBranchPoints: 4, describe: (r) => `Дополнительный слот похода: +${r}` },
  analytics: { branch: 'recon', name: 'Аналитика', max: 3, needBranchPoints: 0, describe: (r) => `Данные +${Math.round(r * SKILL_EFFECTS.analytics * 100)}%` },
  observation: { branch: 'recon', name: 'Наблюдение', max: 3, needBranchPoints: 1, describe: (r) => `Рост разведанности +${Math.round(r * SKILL_EFFECTS.observation * 100)}%, прогноз точнее` },
  deepRecon: { branch: 'recon', name: 'Глубокая разведка', max: 2, needBranchPoints: 3, describe: (r) => `Сила группы +${Math.round(r * SKILL_EFFECTS.deepRecon * 100)}% в полностью разведанных секторах` },
  economy: { branch: 'logistics', name: 'Экономия', max: 3, needBranchPoints: 0, describe: (r) => `Топливо и припасы похода −${Math.round(r * SKILL_EFFECTS.economy * 100)}%` },
  trophies: { branch: 'logistics', name: 'Трофеи', max: 3, needBranchPoints: 1, describe: (r) => `Награды +${Math.round(r * SKILL_EFFECTS.trophies * 100)}%` },
  medic: { branch: 'logistics', name: 'Санитарная служба', max: 2, needBranchPoints: 3, describe: (r) => `Восстановление дешевле и быстрее на ${Math.round(r * SKILL_EFFECTS.medic * 100)}%` },
};
export const SKILL_KEYS = Object.keys(SKILLS) as SkillKey[];
export type Skills = Partial<Record<SkillKey, number>>;
export function branchPoints(skills: Skills, branch: Branch): number {
  return SKILL_KEYS.filter((k) => SKILLS[k].branch === branch).reduce((s, k) => s + (skills[k] ?? 0), 0);
}
export function spentPoints(skills: Skills): number {
  return SKILL_KEYS.reduce((s, k) => s + (skills[k] ?? 0), 0);
}

export const PORTRAITS = ['Сокол', 'Ветер', 'Гранит', 'Полынь'];
export const INSIGNIA = [
  { name: 'Янтарный', color: '#edbb76' },
  { name: 'Оливковый', color: '#8fa77d' },
  { name: 'Стальной', color: '#799ca1' },
  { name: 'Песочный', color: '#e6ddc9' },
];

/* ───────────────────────────── Карта и задания ───────────────────────────── */

export type SectorType = 'observation' | 'warehouse' | 'stronghold' | 'route' | 'event';
export const SECTOR_TYPE_NAMES: Record<SectorType, string> = {
  observation: 'Наблюдательный сектор',
  warehouse: 'Нейтральный склад',
  stronghold: 'Опорный пункт',
  route: 'Маршрут снабжения',
  event: 'Событийная зона',
};
export type MissionType = 'recon' | 'raid' | 'stronghold' | 'supply';
export const MISSION_TYPES: MissionType[] = ['recon', 'raid', 'stronghold', 'supply'];

export interface MissionDef {
  name: string;
  desc: string;
  timeMul: number;
  fuelMul: number;
  enemyMul: number;
  lossMul: number;
  combat: boolean; // false — исход определяется разведкой, а не боевым рейтингом
  minRecon: number;
}
export const MISSIONS: Record<MissionType, MissionDef> = {
  recon: { name: 'Разведка', desc: 'Открывает сведения о секторе и приносит данные. Исход зависит от вклада в разведку.', timeMul: 1, fuelMul: 1, enemyMul: 1, lossMul: 0.35, combat: false, minRecon: 0 },
  raid: { name: 'Рейд', desc: 'Автоматическое столкновение за припасы и комплектующие. Повышает контроль сектора.', timeMul: 1.2, fuelMul: 1.2, enemyMul: 1, lossMul: 1, combat: true, minRecon: 0 },
  stronghold: { name: 'Опорный пункт', desc: 'Повышенная сложность и награда, шанс получить оснащение. Нужна разведанность от 50%.', timeMul: 1.6, fuelMul: 1.5, enemyMul: 1.8, lossMul: 1.25, combat: true, minRecon: 50 },
  supply: { name: 'Снабжение', desc: 'Спокойное задание: упор на транспорт и добычу топлива.', timeMul: 1.1, fuelMul: 0.8, enemyMul: 0.5, lossMul: 0.5, combat: true, minRecon: 0 },
};
export const SECTOR_MISSIONS: Record<SectorType, MissionType[]> = {
  observation: ['recon', 'raid'],
  warehouse: ['recon', 'raid', 'supply'],
  route: ['recon', 'supply', 'raid'],
  stronghold: ['recon', 'stronghold'],
  event: ['recon', 'raid', 'stronghold'],
};

export interface SectorDef {
  id: number;
  name: string;
  type: SectorType;
  difficulty: number;
  x: number; // координаты на схеме 0–100
  y: number;
  links: number[]; // соседние секторы (0 — полигон)
  comms: number; // требуемый уровень узла связи
  after: number[]; // нужен успех хотя бы в одном из этих секторов (пусто — доступен сразу)
  baseTime: number; // секунды похода (до модификаторов)
  fuel: number;
  rewardMul: number;
}
export const HOME = { x: 50, y: 92, name: 'Тыловой полигон' };
export const SECTORS: SectorDef[] = [
  { id: 1, name: 'Лесополоса', type: 'observation', difficulty: 1, x: 36, y: 76, links: [0, 2, 4], comms: 1, after: [], baseTime: 60, fuel: 8, rewardMul: 1 },
  { id: 2, name: 'Старая ферма', type: 'warehouse', difficulty: 1, x: 60, y: 74, links: [0, 1, 3, 5], comms: 1, after: [1], baseTime: 75, fuel: 10, rewardMul: 1 },
  { id: 3, name: 'Грунтовка Б-3', type: 'route', difficulty: 1, x: 80, y: 80, links: [0, 2, 7], comms: 2, after: [2], baseTime: 90, fuel: 10, rewardMul: 1 },
  { id: 4, name: 'Водонапорная башня', type: 'observation', difficulty: 2, x: 20, y: 60, links: [1, 5, 9], comms: 2, after: [1], baseTime: 120, fuel: 14, rewardMul: 1 },
  { id: 5, name: 'Элеватор', type: 'warehouse', difficulty: 2, x: 48, y: 58, links: [2, 4, 6, 8], comms: 2, after: [1, 2], baseTime: 150, fuel: 16, rewardMul: 1 },
  { id: 6, name: 'Высота 112', type: 'stronghold', difficulty: 3, x: 66, y: 50, links: [5, 7, 10], comms: 3, after: [5], baseTime: 210, fuel: 22, rewardMul: 1.1 },
  { id: 7, name: 'Речной переезд', type: 'route', difficulty: 3, x: 86, y: 58, links: [3, 6, 10], comms: 3, after: [3, 6], baseTime: 240, fuel: 24, rewardMul: 1 },
  { id: 8, name: 'Карьер', type: 'event', difficulty: 3, x: 34, y: 42, links: [5, 9, 11], comms: 4, after: [5], baseTime: 300, fuel: 26, rewardMul: 1.5 },
  { id: 9, name: 'Посадка Дубовая', type: 'observation', difficulty: 4, x: 14, y: 34, links: [4, 8, 11], comms: 4, after: [4, 8], baseTime: 360, fuel: 30, rewardMul: 1 },
  { id: 10, name: 'Депо', type: 'warehouse', difficulty: 4, x: 74, y: 30, links: [6, 7, 12], comms: 5, after: [6], baseTime: 420, fuel: 34, rewardMul: 1.1 },
  { id: 11, name: 'Узел Северный', type: 'stronghold', difficulty: 5, x: 40, y: 22, links: [8, 9, 12], comms: 6, after: [8, 9], baseTime: 540, fuel: 40, rewardMul: 1.2 },
  { id: 12, name: 'Терриконы', type: 'stronghold', difficulty: 6, x: 62, y: 10, links: [10, 11], comms: 7, after: [10, 11], baseTime: 720, fuel: 48, rewardMul: 1.3 },
];
export function sectorById(id: number): SectorDef | undefined {
  return SECTORS.find((s) => s.id === id);
}

export const BASE_GROUP_CAPACITY = 4;
export const EXPEDITION_PHASES = [
  { key: 'travel', name: 'В пути', until: 0.4 },
  { key: 'action', name: 'Выполнение задания', until: 0.6 },
  { key: 'return', name: 'Возвращение', until: 1 },
] as const;

/** Боевая сила противника по сложности. */
export function enemyPower(difficulty: number): number {
  return 8 * Math.pow(difficulty, 1.5);
}
/** Порог обнаружения для разведки. */
export function detection(difficulty: number): number {
  return 4 * Math.pow(difficulty, 1.4);
}
export const RANDOM_SPREAD = 0.15; // случайный фактор 0.85–1.15, фиксируется при отправке
export const RECON_POWER_BONUS = 0.15; // до +15% силы при разведанности 100%

export type Outcome = 'decisive' | 'success' | 'partial' | 'fail';
export const OUTCOME_NAMES: Record<Outcome, string> = {
  decisive: 'Решительный успех',
  success: 'Успех',
  partial: 'Частичный успех',
  fail: 'Задание не выполнено',
};
export const OUTCOME_ORDER: Outcome[] = ['fail', 'partial', 'success', 'decisive'];
export function outcomeFor(ratio: number): Outcome {
  if (ratio >= 1.3) return 'decisive';
  if (ratio >= 1) return 'success';
  if (ratio >= 0.7) return 'partial';
  return 'fail';
}
export const OUTCOME_REWARD_MUL: Record<Outcome, number> = { decisive: 1.25, success: 1, partial: 0.5, fail: 0.1 };
export const OUTCOME_RECON_GAIN: Record<Outcome, number> = { decisive: 45, success: 35, partial: 20, fail: 5 };
export const OUTCOME_CONTROL_GAIN: Record<Outcome, number> = { decisive: 35, success: 25, partial: 10, fail: 0 };

/** Доля потерь группы. ratio — соотношение сил. */
export function baseLossRate(ratio: number): number {
  return Math.max(0, Math.min(0.7, 0.32 / Math.max(ratio, 0.1) - 0.18));
}
export const EARLY_PROTECTION_MAX_DIFFICULTY = 2; // до этой сложности нет безвозвратных потерь и не больше половины группы
export const PERMANENT_LOSS_SHARE = 0.3; // доля безвозвратных среди потерь при неудаче / частичном успехе
export const VEHICLE_DAMAGE_BASE = 0.35; // шанс поломки при соотношении сил ≤ 0.7

export function lossCategory(rate: number): 'низкая' | 'средняя' | 'высокая' {
  if (rate < 0.08) return 'низкая';
  if (rate < 0.2) return 'средняя';
  return 'высокая';
}

/** Базовые награды сектора за задание при обычном успехе. */
export function missionRewards(mission: MissionType, difficulty: number): Cost {
  const d = difficulty;
  switch (mission) {
    case 'recon':
      return { data: Math.round(12 * Math.pow(d, 1.2)), supplies: 20 * d };
    case 'raid':
      return { supplies: Math.round(70 * Math.pow(d, 1.3)), parts: Math.round(50 * Math.pow(d, 1.3)), data: 2 * d };
    case 'stronghold':
      return { parts: Math.round(120 * Math.pow(d, 1.3)), data: Math.round(25 * Math.pow(d, 1.2)), supplies: 60 * d };
    case 'supply':
      return { fuel: Math.round(60 * Math.pow(d, 1.2)), supplies: 40 * d };
  }
}
export function missionXp(difficulty: number, outcome: Outcome): number {
  const k = { decisive: 1.2, success: 1, partial: 0.6, fail: 0.3 }[outcome];
  return Math.round(25 * difficulty * k);
}
/** Шанс получить оснащение за опорный пункт (при успехе). */
export const STRONGHOLD_DROP = { chance: 0.6, improvedFrom: 4, rareFrom: 5, rareChance: 0.35 };

/* ───────────────────────────── Обучение и ежедневные задания ───────────────────────────── */

export interface TutorialStep {
  title: string;
  text: string;
  reward: Cost;
  rewardEquipment?: { type: EquipmentType; rarity: Rarity };
  goto: 'base' | 'map' | 'squad' | 'commander' | 'reports';
  focus?: string;
}
export const TUTORIAL: TutorialStep[] = [
  { title: 'Улучшите командный пункт', text: 'С прибытием, командир! Начнём со штаба: пока он маленький, остальные здания выше не вырастут. Поднимите командный пункт до 2 уровня — это секунд двадцать.', reward: { parts: 50 }, goto: 'base', focus: 'hq' },
  { title: 'Подготовьте разведчика', text: 'Двоих разведчиков мало, чтобы что-то увидеть. Дайте мне сорок припасов — и через пятнадцать секунд будет третий.', reward: { supplies: 50, data: 10 }, goto: 'squad', focus: 'scout' },
  { title: 'Выберите транспорт', text: 'Мотоцикл — это хорошо, но для разведки нужен электровелосипед: тихий и экономный. Загляни в автопарк, я соберу.', reward: { fuel: 60 }, goto: 'squad', focus: 'ebike' },
  { title: 'Первое задание', text: 'Первая вылазка! Сектор 01, «Лесополоса», — тихое место. Отправь туда разведчиков на велосипеде и дождись отчёта.', reward: { data: 20, supplies: 40 }, goto: 'map', focus: 'sector-1' },
  { title: 'Откройте операторов FPV', text: 'Разведка — это глаза. А теперь нужны руки: поднимите центр подготовки до 2 уровня, и я начну учить FPV-операторов.', reward: { parts: 60 }, goto: 'base', focus: 'training' },
  { title: 'Обучите оператора FPV', text: 'Площадка готова. Обучите первого оператора FPV — а Батя за это выдаст ему антенну НСУ.', reward: {}, rewardEquipment: { type: 'nsu', rarity: 'common' }, goto: 'squad', focus: 'fpv' },
  { title: 'Рейд с оснащением', text: 'Последний экзамен: группа с FPV и оснащением идёт в рейд. Вернётесь — и полигон официально ваш.', reward: { supplies: 100, parts: 60 }, goto: 'map', focus: 'sector-1' },
];

export type DailyKey = 'dispatch' | 'train' | 'build' | 'recon';
export const DAILY: Record<DailyKey, { name: string; target: number; reward: Cost }> = {
  dispatch: { name: 'Отправить 3 похода', target: 3, reward: { supplies: 150 } },
  train: { name: 'Обучить 3 операторов', target: 3, reward: { parts: 100 } },
  build: { name: 'Завершить улучшение здания', target: 1, reward: { fuel: 80 } },
  recon: { name: 'Провести разведку', target: 1, reward: { data: 15 } },
};
export const DAILY_KEYS = Object.keys(DAILY) as DailyKey[];
/** Игровые сутки считаются по московскому времени. */
export function gameDay(ms: number): string {
  return new Date(ms + 3 * 3600_000).toISOString().slice(0, 10);
}

export const START_OPERATORS: Record<OperatorType, number> = { scout: 2, fpv: 0, heavy: 0, babayaga: 0, veteran: 0 };
