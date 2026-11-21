/**
 * Глубина полигона и сюжет: детали дронов и модели, специализации бойцов, передовые пункты,
 * сюжетная кампания, события, достижения, случайные встречи. Данные и чистые функции.
 */
import type { Cost, OperatorType, MissionType, VehicleType } from './config.js';
import type { Mods } from './progression.js';

/* ═════════════ Конструктор дронов ═════════════ */

export type DroneSlot = 'frame' | 'motors' | 'battery' | 'camera' | 'payload' | 'link';
export const DRONE_SLOTS: { key: DroneSlot; name: string; icon: string }[] = [
  { key: 'frame', name: 'Рама', icon: 'slot-frame' },
  { key: 'motors', name: 'Моторы', icon: 'slot-motors' },
  { key: 'battery', name: 'Аккумулятор', icon: 'slot-battery' },
  { key: 'camera', name: 'Камера', icon: 'slot-camera' },
  { key: 'payload', name: 'Нагрузка', icon: 'slot-payload' },
  { key: 'link', name: 'Связь', icon: 'slot-link' },
];
export interface DronePart {
  key: string;
  slot: DroneSlot;
  name: string;
  text: string;
  mods: Partial<Mods>;
  cost: Cost;
  blueprint?: boolean; // нужен чертёж
}
export const DRONE_PARTS: DronePart[] = [
  { key: 'f_light', slot: 'frame', name: 'Лёгкая рама', text: 'Быстрее летает, слабее держит удар.', mods: { time: 0.05, power: 0.02 }, cost: { parts: 40 } },
  { key: 'f_std', slot: 'frame', name: 'Универсальная рама', text: 'Надёжная середина.', mods: { power: 0.04 }, cost: { parts: 50 } },
  { key: 'f_heavy', slot: 'frame', name: 'Тяжёлая рама', text: 'Больше нагрузки, больше расход.', mods: { power: 0.08, fuel: -0.05 }, cost: { parts: 80 } },
  { key: 'f_carbon', slot: 'frame', name: 'Карбоновая рама', text: 'Лёгкая и прочная. Только по чертежу.', mods: { power: 0.06, time: 0.06 }, cost: { parts: 140, data: 20 }, blueprint: true },
  { key: 'm_std', slot: 'motors', name: 'Штатные моторы', text: 'Без сюрпризов.', mods: { power: 0.03 }, cost: { parts: 40 } },
  { key: 'm_fast', slot: 'motors', name: 'Скоростные моторы', text: 'Дорога короче.', mods: { time: 0.06, power: 0.02 }, cost: { parts: 60 } },
  { key: 'm_torque', slot: 'motors', name: 'Тяговые моторы', text: 'Тянут тяжёлое, едят батарею.', mods: { power: 0.07, fuel: -0.04 }, cost: { parts: 70 } },
  { key: 'm_silent', slot: 'motors', name: 'Тихие моторы', text: 'Подкрадываются незаметно. По чертежу.', mods: { recon: 0.08, losses: 0.03 }, cost: { parts: 120, data: 15 }, blueprint: true },
  { key: 'b_std', slot: 'battery', name: 'Штатный аккумулятор', text: 'Хватает на задание.', mods: { fuel: 0.03 }, cost: { parts: 30 } },
  { key: 'b_ext', slot: 'battery', name: 'Ёмкий аккумулятор', text: 'Экономит топливо группы.', mods: { fuel: 0.07, time: -0.02 }, cost: { parts: 60 } },
  { key: 'b_cold', slot: 'battery', name: 'Морозостойкий аккумулятор', text: 'Не садится в стужу. По чертежу.', mods: { fuel: 0.05, losses: 0.03 }, cost: { parts: 100, data: 15 }, blueprint: true },
  { key: 'c_std', slot: 'camera', name: 'Штатная камера', text: 'Видит то, что надо.', mods: { recon: 0.04 }, cost: { parts: 40 } },
  { key: 'c_zoom', slot: 'camera', name: 'Камера с зумом', text: 'Видит дальше.', mods: { recon: 0.08 }, cost: { parts: 70 } },
  { key: 'c_thermal', slot: 'camera', name: 'Тепловизор', text: 'Тёплое не спрячешь. По чертежу.', mods: { recon: 0.1, power: 0.03 }, cost: { parts: 150, data: 25 }, blueprint: true },
  { key: 'c_night', slot: 'camera', name: 'Ночная камера', text: 'Ночь — союзник. По чертежу.', mods: { recon: 0.06, power: 0.05 }, cost: { parts: 130, data: 20 }, blueprint: true },
  { key: 'p_std', slot: 'payload', name: 'Штатная нагрузка', text: 'Делает своё дело.', mods: { power: 0.04 }, cost: { parts: 50 } },
  { key: 'p_heavy', slot: 'payload', name: 'Тяжёлая нагрузка', text: 'Сильнее, но рискованнее.', mods: { power: 0.09, losses: -0.03 }, cost: { parts: 90 } },
  { key: 'p_cluster', slot: 'payload', name: 'Кассетная нагрузка', text: 'Накрывает площадь. По чертежу.', mods: { power: 0.12, fuel: -0.05 }, cost: { parts: 180, data: 30 }, blueprint: true },
  { key: 'l_std', slot: 'link', name: 'Штатная связь', text: 'Работает.', mods: { uncertainty: 0.05 }, cost: { parts: 30 } },
  { key: 'l_long', slot: 'link', name: 'Дальняя связь', text: 'Сведения точнее, полёт дольше.', mods: { uncertainty: 0.1, time: -0.02 }, cost: { parts: 60 } },
  { key: 'l_mesh', slot: 'link', name: 'Меш-сеть', text: 'Дроны держат связь друг через друга. По чертежу.', mods: { uncertainty: 0.12, losses: 0.04 }, cost: { parts: 140, data: 20 }, blueprint: true },
];
/** Иконки деталей по чертежам. */
export const PART_ICONS: Record<string, string> = {
  f_carbon: 'part-carbon', m_silent: 'part-silent', b_cold: 'part-cold', c_thermal: 'part-thermal', c_night: 'part-night', p_cluster: 'part-cluster', l_mesh: 'part-mesh',
};
export const BLUEPRINT_PARTS = DRONE_PARTS.filter((p) => p.blueprint).map((p) => p.key);
export function partByKey(k: string) {
  return DRONE_PARTS.find((p) => p.key === k);
}
export const MODEL_CLASSES: OperatorType[] = ['scout', 'fpv', 'heavy', 'babayaga', 'veteran'];
export const MODEL_COLORS = ['#6b7a3c', '#3f5d6b', '#5a4a3a', '#2e2e2e', '#7a2e2e', '#c9a23a'];
export const MODEL_WEAR_PER_MISSION = 4;
export const EQUIP_WEAR_PER_MISSION = 5;
export const TESTRANGE_BONUS = 0.04; // +4% к эффекту модели за уровень полигона испытаний
export function modelCost(parts: Record<DroneSlot, string>): Cost {
  const c: Record<string, number> = {};
  for (const k of Object.values(parts)) for (const [r, v] of Object.entries(partByKey(k)?.cost ?? {})) c[r] = (c[r] ?? 0) + (v as number);
  return c as Cost;
}
export function modelTime(parts: Record<DroneSlot, string>): number {
  return 120 + 30 * Object.values(parts).filter((k) => partByKey(k)?.blueprint).length;
}
export function modelMods(parts: Record<DroneSlot, string>): Partial<Mods> {
  const m: Record<string, number> = {};
  for (const k of Object.values(parts)) for (const [mk, v] of Object.entries(partByKey(k)?.mods ?? {})) m[mk] = (m[mk] ?? 0) + (v as number);
  return m as Partial<Mods>;
}
/** Множитель от износа: до 50% прочности эффект полный, ниже — падает, на нуле — нет. */
export function wearFactor(durability: number): number {
  if (durability <= 0) return 0;
  return durability >= 50 ? 1 : durability / 50;
}
/** Вклад моделей в поход: эффект модели × доля её класса в группе × износ × полигон испытаний. */
export function modelsBonus(
  models: { cls: OperatorType; name: string; parts: Record<DroneSlot, string>; durability: number }[],
  group: Partial<Record<OperatorType, number>>,
  testrangeLevel: number,
): { mods: Partial<Mods>; names: string[] } {
  const size = Object.values(group).reduce((s, v) => s + (v ?? 0), 0);
  const out: Record<string, number> = {};
  const names: string[] = [];
  if (!size) return { mods: {}, names };
  for (const md of models) {
    const n = group[md.cls] ?? 0;
    if (!n) continue;
    const k = (n / size) * wearFactor(md.durability) * (1 + TESTRANGE_BONUS * testrangeLevel);
    if (k <= 0) continue;
    names.push(`«${md.name}»`);
    for (const [mk, v] of Object.entries(modelMods(md.parts))) out[mk] = (out[mk] ?? 0) + (v as number) * k;
  }
  return { mods: out as Partial<Mods>, names };
}
export const DEFAULT_MODEL: Record<DroneSlot, string> = { frame: 'f_std', motors: 'm_std', battery: 'b_std', camera: 'c_std', payload: 'p_std', link: 'l_std' };

/* ═════════════ Специализации бойцов ═════════════ */

export interface SpecDef { key: string; type: OperatorType; name: string; text: string; mods: Partial<Mods> }
export const SPECS: SpecDef[] = [
  { key: 'pathfinder', type: 'scout', name: 'Следопыт', text: 'Разведка группы +6%', mods: { recon: 0.06 } },
  { key: 'spotter', type: 'scout', name: 'Корректировщик', text: 'Сила группы +4%', mods: { power: 0.04 } },
  { key: 'hunter', type: 'fpv', name: 'Охотник', text: 'Сила группы +6%', mods: { power: 0.06 } },
  { key: 'sapper', type: 'fpv', name: 'Подрывник', text: 'Сила +4%, потери −2%', mods: { power: 0.04, losses: 0.02 } },
  { key: 'carrier', type: 'heavy', name: 'Грузовик', text: 'Награды +5%', mods: { rewards: 0.05 } },
  { key: 'shield', type: 'heavy', name: 'Прикрытие', text: 'Потери −5%', mods: { losses: 0.05 } },
  { key: 'nightowl', type: 'babayaga', name: 'Ночной', text: 'Сила +5%, разведка +3%', mods: { power: 0.05, recon: 0.03 } },
  { key: 'bomber', type: 'babayaga', name: 'Бомбардир', text: 'Сила группы +7%', mods: { power: 0.07 } },
  { key: 'leader', type: 'veteran', name: 'Лидер', text: 'Потери −4%, сила +2%', mods: { losses: 0.04, power: 0.02 } },
  { key: 'assault', type: 'veteran', name: 'Штурмовик', text: 'Сила группы +6%', mods: { power: 0.06 } },
];
export const SPEC_LEVEL = 3;
export function specByKey(k: string | null | undefined) {
  return SPECS.find((s) => s.key === k);
}
export const FATIGUE_PER_MISSION = 20;
export const FATIGUE_RECOVERY_PER_HOUR = 10;
export const FATIGUE_MAX_PENALTY = 0.15;
export const BOND_MISSIONS = 10;
export const BOND_BONUS = 0.02;
export const BOND_MAX = 0.1;
export const MAX_INSTRUCTORS = 2;
export const INSTRUCTOR_BONUS = 0.1;
export function fatigueNow(f: number, at: number | null, now: number): number {
  if (!f || !at) return f || 0;
  return Math.max(0, f - ((now - at) / 3_600_000) * FATIGUE_RECOVERY_PER_HOUR);
}
export function healScarsCost(scars: number): Cost {
  return { supplies: 40 * scars };
}

/* ═════════════ Передовые пункты ═════════════ */

export const OUTPOST = {
  hqFirst: 6,
  hqSecond: 8,
  minControl: 50,
  maxLevel: 5,
  buildCost: { supplies: 600, parts: 500, fuel: 200 } as Cost,
  buildTime: 900,
  upgradeCost: (lvl: number): Cost => ({ supplies: Math.round(400 * Math.pow(1.5, lvl)), parts: Math.round(350 * Math.pow(1.5, lvl)), fuel: 100 * lvl }),
  upgradeTime: (lvl: number) => Math.round(900 * Math.pow(1.5, lvl)),
  timeCut: (lvl: number) => 0.15 + 0.05 * lvl,
  fuelCut: (lvl: number) => 0.2 + 0.05 * lvl,
  defense: (lvl: number, mainDefense: number) => Math.round(20 * lvl + mainDefense * 0.3),
};

/* ═════════════ Сюжетная кампания ═════════════ */

export type CastWho = 'sova' | 'shmel' | 'batya' | 'iskra';
export interface SceneLine { who: CastWho; text: string; flag?: [string, string] } // flag: показать реплику только при флаге
export interface CampaignReward { res?: Cost; blueprint?: string; chevron?: string; soldier?: { type: OperatorType; name: string; trait: string } }
export interface CampaignStep {
  key: string;
  chapter: number;
  title: string;
  kind: 'scene' | 'mission' | 'goal' | 'choice';
  lines?: SceneLine[];
  // миссия
  sectorId?: number;
  mission?: MissionType;
  difficulty?: number;
  onlyTypes?: OperatorType[];
  vehicles?: VehicleType[];
  minSize?: number;
  night?: boolean;
  needModel?: boolean;
  // цель
  goal?: { kind: 'building' | 'stat' | 'research' | 'model' | 'outpost' | 'control'; key?: string; value: number; text: string };
  // выбор
  options?: { key: string; label: string; text: string; reward: CampaignReward }[];
  reward?: CampaignReward;
}
export const CHAPTERS = [
  { n: 1, name: 'Чужой сигнал', text: 'Искра ловит в эфире передачу, которой быть не должно.' },
  { n: 2, name: 'Мастерская Бати', text: 'Пора делать свои дроны, а не только чинить чужие.' },
  { n: 3, name: 'Ночь длинная', text: 'Противник стал злее. Ночные вылеты и проверка обороны.' },
  { n: 4, name: 'Передовой', text: 'Полигон выходит вперёд — к дальним секторам.' },
  { n: 5, name: 'Рубеж', text: 'Последний рубеж этой карты. Всё, чему научились, — в дело.' },
];
export const CAMPAIGN: CampaignStep[] = [
  // ── Глава 1
  { key: 'c1s', chapter: 1, title: 'Странная передача', kind: 'scene', lines: [
    { who: 'iskra', text: 'Командир, слышишь? Это не наши частоты и не их. Кто-то передаёт цифры — по кругу, третий час.' },
    { who: 'sova', text: 'Источник?' },
    { who: 'iskra', text: 'Где-то у Лесополосы. Пусть разведчики посмотрят — только тихо, без шума.' },
  ], reward: { res: { data: 10 } } },
  { key: 'c1m1', chapter: 1, title: 'Тихо посмотреть', kind: 'mission', sectorId: 1, mission: 'recon', difficulty: 2, onlyTypes: ['scout'],
    reward: { res: { data: 25, supplies: 150 } } },
  { key: 'c1g', chapter: 1, title: 'Расшифровка', kind: 'goal', goal: { kind: 'research', key: 'comm1', value: 1, text: 'Изучить «Шифрованный канал»' },
    reward: { res: { parts: 150 } } },
  { key: 'c1m2', chapter: 1, title: 'Ночной склад', kind: 'mission', sectorId: 2, mission: 'raid', difficulty: 2, night: true,
    reward: { res: { supplies: 200, parts: 200 } } },
  { key: 'c1c', chapter: 1, title: 'Чертёж в ящике', kind: 'choice', lines: [
    { who: 'batya', text: 'В ящике со склада — чертёж ночной камеры. Хорошая вещь. Штаб, конечно, захочет её себе.' },
    { who: 'sova', text: 'По правилам — сдаём. По совести — решай сам, командир.' },
  ], options: [
    { key: 'loyal', label: 'Сдать в штаб', text: 'Штаб благодарит: данные и доверие.', reward: { res: { data: 80 } } },
    { key: 'rogue', label: 'Оставить себе', text: 'Батя довольно хмыкает: чертёж ночной камеры — ваш.', reward: { blueprint: 'c_night' } },
  ] },
  // ── Глава 2
  { key: 'c2s', chapter: 2, title: 'Батя берётся за дело', kind: 'scene', lines: [
    { who: 'batya', text: 'Хватит летать на чём попало. Построим полигон испытаний — соберу вам дрон под задачу.' },
    { who: 'sova', text: 'Штаб молчит про наш сигнал. Значит, разбираемся сами.', flag: ['c1c', 'loyal'] },
    { who: 'shmel', text: 'А ночная камера у нас уже есть. Будет на что поставить.', flag: ['c1c', 'rogue'] },
  ], reward: { res: { parts: 200 } } },
  { key: 'c2g1', chapter: 2, title: 'Полигон испытаний', kind: 'goal', goal: { kind: 'building', key: 'testrange', value: 1, text: 'Построить «Полигон испытаний»' }, reward: { res: { parts: 250, data: 20 } } },
  { key: 'c2g2', chapter: 2, title: 'Первая модель', kind: 'goal', goal: { kind: 'model', value: 1, text: 'Собрать модель дрона для любого класса' }, reward: { blueprint: 'm_silent' } },
  { key: 'c2m', chapter: 2, title: 'Обкатка', kind: 'mission', sectorId: 4, mission: 'raid', difficulty: 2, needModel: true, onlyTypes: ['fpv', 'scout'],
    reward: { soldier: { type: 'fpv', name: 'Паяльник', trait: 'sharp' }, res: { supplies: 250 } } },
  // ── Глава 3
  { key: 'c3s', chapter: 3, title: 'Ночные гости', kind: 'scene', lines: [
    { who: 'shmel', text: 'Противник стал ходить ночью. Значит, и мы будем.' },
    { who: 'iskra', text: 'Сигнал снова в эфире. Теперь — со стороны Высоты 112.' },
  ], reward: { res: { fuel: 200 } } },
  { key: 'c3m', chapter: 3, title: 'Высота ночью', kind: 'mission', sectorId: 6, mission: 'stronghold', difficulty: 3, night: true, minSize: 4,
    reward: { res: { parts: 400, data: 40 }, blueprint: 'c_thermal' } },
  { key: 'c3g', chapter: 3, title: 'Проверка обороны', kind: 'goal', goal: { kind: 'stat', key: 'defended', value: 3, text: 'Отбить 3 атаки на полигон' }, reward: { res: { parts: 300 } } },
  { key: 'c3c', chapter: 3, title: 'Соседи просят помощи', kind: 'choice', lines: [
    { who: 'sova', text: 'Соседний полигон потрепало. Просят припасов. Своим бы не обеднеть…' },
  ], options: [
    { key: 'help', label: 'Отправить 300 припасов', text: 'Соседи запомнят. Штаб отмечает вашу взаимовыручку.', reward: { res: { supplies: -300, data: 60 }, chevron: 'storyHelper' } },
    { key: 'keep', label: 'Оставить себе', text: 'Запасы целы. Батя молча кивает.', reward: { res: { parts: 150 } } },
  ] },
  // ── Глава 4
  { key: 'c4s', chapter: 4, title: 'Вперёд', kind: 'scene', lines: [
    { who: 'sova', text: 'До дальних секторов далеко. Нужен передовой пункт.' },
    { who: 'batya', text: 'Построим. Только держать его придётся — противник не обрадуется.' },
  ], reward: { res: { supplies: 300, fuel: 150 } } },
  { key: 'c4g1', chapter: 4, title: 'Передовой пункт', kind: 'goal', goal: { kind: 'outpost', value: 1, text: 'Построить передовой пункт' }, reward: { res: { parts: 400 } } },
  { key: 'c4g2', chapter: 4, title: 'Под контролем', kind: 'goal', goal: { kind: 'control', value: 3, text: 'Держать под полным контролем 3 сектора' }, reward: { blueprint: 'p_cluster' } },
  { key: 'c4m', chapter: 4, title: 'Депо', kind: 'mission', sectorId: 10, mission: 'raid', difficulty: 4, minSize: 5,
    reward: { res: { supplies: 500, parts: 500, data: 50 } } },
  // ── Глава 5
  { key: 'c5s', chapter: 5, title: 'Источник', kind: 'scene', lines: [
    { who: 'iskra', text: 'Нашла. Сигнал идёт с Терриконов. Там что-то большое.' },
    { who: 'shmel', text: 'Значит, идём все. С лучшими дронами.' },
  ], reward: { res: { data: 50 } } },
  { key: 'c5m', chapter: 5, title: 'Штурм Терриконов', kind: 'mission', sectorId: 12, mission: 'stronghold', difficulty: 6, minSize: 6, needModel: true,
    reward: { res: { parts: 1000, data: 120 }, blueprint: 'f_carbon' } },
  { key: 'c5f', chapter: 5, title: 'Рубеж наш', kind: 'scene', lines: [
    { who: 'sova', text: 'Передатчик молчит. Рубеж — наш. Штаб передаёт благодарность.', flag: ['c1c', 'loyal'] },
    { who: 'sova', text: 'Передатчик молчит. Штаб не знает, как мы это сделали, — и не узнает.', flag: ['c1c', 'rogue'] },
    { who: 'batya', text: 'Ко мне тут Старшина просится. Говорит, за таким командиром пойдёт куда угодно.' },
  ], reward: { chevron: 'campaignHero', soldier: { type: 'veteran', name: 'Старшина', trait: 'tough' } } },
];
export function campaignStepIndex(key: string) {
  return CAMPAIGN.findIndex((s) => s.key === key);
}

/* ═════════════ События ═════════════ */

export interface GameEvent {
  key: string;
  name: string;
  text: string;
  icon: string;
  mods: Partial<Mods>;
  attackBoost?: number;
  points: Record<string, number>; // счётчик → очки события
  tiers: { points: number; reward: Cost; blueprint?: boolean; chevron?: string }[];
}
const TIERS = (chevron: string) => [
  { points: 50, reward: { supplies: 300 } },
  { points: 150, reward: { parts: 400, data: 20 } },
  { points: 300, reward: { fuel: 300, data: 40 }, blueprint: true },
  { points: 600, reward: { parts: 800, data: 80 }, chevron },
];
export const EVENTS: GameEvent[] = [
  { key: 'night', name: 'Ночная охота', text: 'Вся карта в ночи: сила групп +10%, разведка −10%. Очки — за успешные рейды и штурмы.', icon: 'event-night', mods: { power: 0.1, recon: -0.1 },
    points: { raid_win: 15, stronghold_win: 40, expedition_win: 60 }, tiers: TIERS('evNight') },
  { key: 'convoy', name: 'Конвой', text: 'По району идут колонны: задания «Снабжение» дают тройные очки и больше топлива.', icon: 'event-convoy', mods: { rewards: 0.15 },
    points: { supply_win: 30, raid_win: 10, expedition_win: 50 }, tiers: TIERS('evConvoy') },
  { key: 'storm', name: 'Буря', text: 'Сильные помехи: оснащение слабее на 25%, данные ×2. Очки — за разведку.', icon: 'event-storm', mods: { equip: -0.25, data: 1 },
    points: { recon_win: 20, research: 30, expedition_win: 40 }, tiers: TIERS('evStorm') },
  { key: 'workshop', name: 'Неделя мастерской', text: 'Сборка, ремонт и модели дешевле. Очки — за работу мастерской.', icon: 'event-workshop', mods: {},
    points: { craft: 20, repair: 10, model: 60, raid_win: 5 }, tiers: TIERS('evWorkshop') },
  { key: 'rubezh', name: 'Оборона рубежа', text: 'Противник атакует полигоны чаще. Очки — за отбитые атаки и набеги.', icon: 'event-rubezh', mods: { defense: 0.1 }, attackBoost: 0.3,
    points: { defended: 50, raid_win: 10, pvp_win: 40 }, tiers: TIERS('evRubezh') },
];
const DAY = 86_400_000;
/** Событие выходных: с пятницы 18:00 до понедельника 06:00 МСК (60 часов), события идут по кругу. */
export function eventWindow(ms: number, epoch: number): { event: GameEvent; week: number; start: number; end: number; active: boolean; nextStart: number } {
  const W = 7 * DAY;
  const startOf = (w: number) => epoch + w * W + 4 * DAY + 18 * 3_600_000;
  const evOf = (w: number) => EVENTS[((w % EVENTS.length) + EVENTS.length) % EVENTS.length];
  const week = Math.floor((ms - epoch) / W);
  for (const w of [week - 1, week]) {
    const st = startOf(w);
    if (ms >= st && ms < st + 60 * 3_600_000) return { event: evOf(w), week: w, start: st, end: st + 60 * 3_600_000, active: true, nextStart: startOf(w + 1) };
  }
  const nw = ms < startOf(week) ? week : week + 1;
  const st = startOf(nw);
  return { event: evOf(nw), week: nw, start: st, end: st + 60 * 3_600_000, active: false, nextStart: st };
}
export function eventKey(week: number) {
  return `E${week}`;
}
export const WORKSHOP_DISCOUNT = 0.3;

/* ═════════════ Достижения ═════════════ */

export interface AchievementDef { key: string; name: string; text: string; icon: string; source: string; tiers: [number, number, number] }
export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'wins', name: 'Боевой путь', text: 'Успешных походов', icon: 'flag', source: 'expeditionsWon', tiers: [10, 50, 200] },
  { key: 'raids', name: 'Рейдер', text: 'Успешных рейдов', icon: 'raid', source: 'won_raid', tiers: [10, 50, 200] },
  { key: 'recon', name: 'Глаза полигона', text: 'Успешных разведок', icon: 'recon', source: 'won_recon', tiers: [10, 50, 200] },
  { key: 'strong', name: 'Штурмовик', text: 'Взятых опорных пунктов', icon: 'stronghold', source: 'won_stronghold', tiers: [3, 15, 50] },
  { key: 'exped', name: 'Дальние дороги', text: 'Успешных экспедиций', icon: 'compass', source: 'won_expedition', tiers: [3, 15, 50] },
  { key: 'flawless', name: 'Все дома', text: 'Походов без потерь', icon: 'heart', source: 'flawless', tiers: [5, 25, 100] },
  { key: 'defense', name: 'Стена', text: 'Отбитых атак', icon: 'reb', source: 'defended', tiers: [3, 15, 50] },
  { key: 'pvp', name: 'Гость', text: 'Успешных набегов', icon: 'flag', source: 'pvp_win', tiers: [3, 15, 50] },
  { key: 'builder', name: 'Прораб', text: 'Улучшений зданий', icon: 'hq', source: 'buildsDone', tiers: [10, 40, 100] },
  { key: 'science', name: 'Учёный', text: 'Исследований', icon: 'data', source: 'researchDone', tiers: [4, 10, 16] },
  { key: 'trainer', name: 'Наставник', text: 'Подготовлено операторов', icon: 'training', source: '_trained', tiers: [20, 100, 300] },
  { key: 'medic', name: 'Санитар', text: 'Вернули в строй раненых', icon: 'cross', source: 'recovered', tiers: [10, 50, 200] },
  { key: 'helper', name: 'Плечо', text: 'Помощи сослуживцам', icon: 'squad', source: 'helps', tiers: [5, 25, 100] },
  { key: 'donor', name: 'Кормилец роты', text: 'Сдано на склад роты', icon: 'supply', source: 'donated', tiers: [500, 5000, 20000] },
  { key: 'designer', name: 'Конструктор', text: 'Собрано моделей дронов', icon: 'drone', source: 'modelsBuilt', tiers: [1, 5, 15] },
  { key: 'mechanic', name: 'Механик', text: 'Ремонтов', icon: 'wrench', source: 'repairs', tiers: [5, 25, 100] },
  { key: 'streak', name: 'На посту', text: 'Дней подряд', icon: 'clock', source: 'maxStreak', tiers: [3, 7, 30] },
  { key: 'collector', name: 'Коллекционер', text: 'Нашивок в коллекции', icon: 'medal', source: '_chevrons', tiers: [5, 15, 30] },
  { key: 'elite', name: 'Школа мастеров', text: 'Бойцов 5 уровня', icon: 'star', source: '_maxed', tiers: [1, 5, 15] },
  { key: 'story', name: 'Летописец', text: 'Пройдено шагов кампании', icon: 'reports', source: '_campaign', tiers: [5, 12, 20] },
  { key: 'events', name: 'Завсегдатай', text: 'Ступеней событий', icon: 'event', source: 'eventTiers', tiers: [3, 10, 25] },
  { key: 'luck', name: 'Бывалый', text: 'Случайных встреч', icon: 'sparkle', source: 'encounters', tiers: [3, 15, 40] },
];
export const ACH_POINTS = [10, 25, 50];
export const ACH_REWARD: Cost[] = [{ data: 5 }, { data: 15, parts: 100 }, { data: 40, parts: 300 }];
export const ACH_TITLES: [number, string][] = [
  [0, 'Новобранец'],
  [50, 'Боец'],
  [150, 'Опытный'],
  [300, 'Мастер'],
  [600, 'Легенда полигона'],
];
export function achTitle(points: number): string {
  let t = ACH_TITLES[0][1];
  for (const [p, name] of ACH_TITLES) if (points >= p) t = name;
  return t;
}
export function achTier(value: number, tiers: [number, number, number]): number {
  return value >= tiers[2] ? 3 : value >= tiers[1] ? 2 : value >= tiers[0] ? 1 : 0;
}

/* ═════════════ Случайные встречи в походах ═════════════ */

export interface EncounterOutcome { chance: number; text: string; reward?: Cost; wound?: boolean; blueprint?: boolean; mascot?: string }
export interface EncounterDef { key: string; title: string; text: string; who: CastWho; options: { label: string; outcomes: EncounterOutcome[] }[] }
export const ENCOUNTER_CHANCE = 0.18;
export const ENCOUNTERS: EncounterDef[] = [
  { key: 'kitten', title: 'Котёнок в блиндаже', who: 'shmel', text: 'В заброшенном блиндаже пищит котёнок. Худой, но живой.', options: [
    { label: 'Забрать на полигон', outcomes: [{ chance: 1, text: 'Котёнка назвали Пулемётом. Теперь он живёт в штабе, и бойцы быстрее приходят в себя.', mascot: 'cat' }] },
    { label: 'Оставить паёк и уйти', outcomes: [{ chance: 1, text: 'Котёнок проводил группу взглядом. Совесть чиста.', reward: { data: 5 } }] },
  ] },
  { key: 'cache', title: 'Брошенный склад', who: 'batya', text: 'Под маскировочной сетью — ящики. Может, полные. Может, с сюрпризом.', options: [
    { label: 'Вскрыть', outcomes: [
      { chance: 0.6, text: 'Комплектующие и топливо — богато!', reward: { parts: 250, fuel: 150 } },
      { chance: 0.4, text: 'Сюрприз сработал. Один боец ранен, но ящик всё же вскрыли.', reward: { parts: 80 }, wound: true },
    ] },
    { label: 'Пометить и пройти мимо', outcomes: [{ chance: 1, text: 'Отметили на карте для сапёров. Штаб доволен.', reward: { data: 15 } }] },
  ] },
  { key: 'radio', title: 'Чужая рация', who: 'iskra', text: 'В траве — рабочая рация противника. Эфир живой.', options: [
    { label: 'Послушать эфир', outcomes: [
      { chance: 0.7, text: 'Полчаса ценнейших разговоров. Искра в восторге.', reward: { data: 40 } },
      { chance: 0.3, text: 'Рацию засекли — пришлось уходить бегом. Зато трофей.', reward: { data: 10, parts: 60 } },
    ] },
    { label: 'Разобрать на детали', outcomes: [{ chance: 1, text: 'Батя будет рад таким платам.', reward: { parts: 120 } }] },
  ] },
  { key: 'drone', title: 'Упавший дрон', who: 'batya', text: 'В кустах — почти целый чужой дрон.', options: [
    { label: 'Изучить конструкцию', outcomes: [
      { chance: 0.35, text: 'Удача: по нему восстановили чертёж!', blueprint: true },
      { chance: 0.65, text: 'Ничего нового, но детали пригодятся.', reward: { parts: 150, data: 10 } },
    ] },
    { label: 'Сдать как трофей', outcomes: [{ chance: 1, text: 'Штаб выписал премию.', reward: { supplies: 200 } }] },
  ] },
  { key: 'locals', title: 'Пасека у дороги', who: 'sova', text: 'Старик-пасечник предлагает мёд и показывает тропу в обход.', options: [
    { label: 'Взять мёд и тропу', outcomes: [{ chance: 1, text: 'Мёд — к чаю, тропа — на карту. Отличный день.', reward: { supplies: 120, data: 10 } }] },
    { label: 'Поблагодарить и идти', outcomes: [{ chance: 1, text: 'Пасечник пожелал удачи. Иногда этого хватает.', reward: { supplies: 40 } }] },
  ] },
  { key: 'puppy', title: 'Пёс у переезда', who: 'shmel', text: 'Лохматый пёс увязался за группой и не отстаёт.', options: [
    { label: 'Взять с собой', outcomes: [{ chance: 1, text: 'Пса назвали Сапёром. Он чует чужих за версту — полигон охраняется лучше.', mascot: 'dog' }] },
    { label: 'Отогнать', outcomes: [{ chance: 1, text: 'Пёс обиделся и ушёл. Нехорошо получилось.' }] },
  ] },
  { key: 'mines', title: 'Подозрительная тропа', who: 'iskra', text: 'Короткая тропа срезает полпути, но выглядит слишком удобной.', options: [
    { label: 'Рискнуть', outcomes: [
      { chance: 0.5, text: 'Проскочили! Сэкономили топливо.', reward: { fuel: 120 } },
      { chance: 0.5, text: 'Не зря сомневались: один раненый.', wound: true },
    ] },
    { label: 'В обход', outcomes: [{ chance: 1, text: 'Долго, но надёжно.', reward: { data: 5 } }] },
  ] },
  { key: 'letter', title: 'Письмо в каске', who: 'sova', text: 'В брошенной каске — письмо без адреса. Кто-то писал домой.', options: [
    { label: 'Сохранить', outcomes: [{ chance: 1, text: 'Письмо повесили на стене штаба. Бойцы молча его читают.', reward: { data: 10 } }] },
    { label: 'Оставить на месте', outcomes: [{ chance: 1, text: 'Пусть дождётся своего хозяина.' }] },
  ] },
];
export const MASCOTS: Record<string, { name: string; text: string; mods: Partial<Mods> }> = {
  cat: { name: 'Кот Пулемёт', text: 'Живёт в штабе: восстановление раненых быстрее на 10%.', mods: { recovery: 0.1 } },
  dog: { name: 'Пёс Сапёр', text: 'Охраняет полигон: оборона +10%.', mods: { defense: 0.1 } },
};

/* ═════════════ Новые здания: эффекты ═════════════ */

export const BUILDING_FX = {
  motorpool: { upgradeDiscount: 0.05, pickupLevel: 3 },
  repairyard: { discount: 0.08, wearCut: 0.05 },
  medbay: { recovery: 0.06 },
  analytics: { uncertainty: 0.06, data: 0.03, decodeCost: { data: 60, parts: 100 } as Cost },
  testrange: {},
};
export function repairDiscount(level: number): number {
  return Math.min(0.5, BUILDING_FX.repairyard.discount * level);
}
export function wearCut(level: number): number {
  return Math.min(0.4, BUILDING_FX.repairyard.wearCut * level);
}
