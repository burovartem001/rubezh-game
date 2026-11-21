/**
 * Системы долгой игры: исследования, события карты, сезоны и недели, контракты, серия входов,
 * оборона полигона, набеги, именные бойцы, престиж и общий свод бонусов (Mods).
 * Только данные и чистые функции — их используют и сервер, и клиент.
 */
import type { Cost, OperatorType } from './config.js';
import { BOND_BONUS, BOND_MAX, FATIGUE_MAX_PENALTY, specByKey } from './content.js';

/* ───────────── Свод бонусов ───────────── */

/** Доли: 0.1 = +10%. Отрицательные значения ухудшают. */
export interface Mods {
  power: number; // сила группы
  recon: number; // разведка
  losses: number; // снижение потерь
  fuel: number; // экономия топлива
  time: number; // сокращение времени походов
  rewards: number; // награды
  data: number; // данные
  uncertainty: number; // точность прогноза
  field: number; // восстановление в поле
  permLoss: number; // снижение безвозвратных потерь
  storage: number; // вместимость хранилищ
  production: number; // производство
  recovery: number; // цена и время восстановления
  decay: number; // замедление потери контроля секторов
  defense: number; // оборона полигона
  equip: number; // усиление оснащения
}
export const MOD_KEYS: (keyof Mods)[] = ['power', 'recon', 'losses', 'fuel', 'time', 'rewards', 'data', 'uncertainty', 'field', 'permLoss', 'storage', 'production', 'recovery', 'decay', 'defense', 'equip'];
export const MOD_NAMES: Record<keyof Mods, string> = {
  power: 'сила группы', recon: 'разведка', losses: 'потери', fuel: 'топливо', time: 'время походов', rewards: 'награды', data: 'данные',
  uncertainty: 'точность прогноза', field: 'восстановление в поле', permLoss: 'безвозвратные потери', storage: 'вместимость складов',
  production: 'производство', recovery: 'восстановление раненых', decay: 'удержание контроля', defense: 'оборона полигона', equip: 'эффект оснащения',
};
/** Для этих бонусов положительное значение уменьшает величину (−). */
const MINUS_KEYS = new Set<keyof Mods>(['losses', 'fuel', 'time', 'permLoss', 'recovery', 'decay']);
export function emptyMods(): Mods {
  return Object.fromEntries(MOD_KEYS.map((k) => [k, 0])) as unknown as Mods;
}
export function addMods(a: Mods, b: Partial<Mods>, k = 1): Mods {
  for (const key of MOD_KEYS) if (b[key]) a[key] += b[key]! * k;
  return a;
}
export function modsText(m: Partial<Mods>): string {
  return MOD_KEYS.filter((k) => m[k])
    .map((k) => {
      const v = m[k]!;
      const sign = MINUS_KEYS.has(k) ? (v > 0 ? '−' : '+') : v > 0 ? '+' : '−';
      return `${MOD_NAMES[k]} ${sign}${Math.round(Math.abs(v) * 100)}%`;
    })
    .join(', ');
}

/* ───────────── Время: недели и сезоны ───────────── */

const DAY = 86_400_000;
/** Отсчёт — понедельник 16.11.2026, 00:00 МСК. */
export const EPOCH = Date.UTC(2026, 10, 15, 21, 0, 0);
export const SEASON_WEEKS = 4;
export function weekIndex(ms: number): number {
  return Math.floor((ms - EPOCH) / (7 * DAY));
}
export function seasonIndex(ms: number): number {
  return Math.floor((ms - EPOCH) / (SEASON_WEEKS * 7 * DAY)) + 1;
}
export function weekKey(i: number) {
  return `W${i}`;
}
export function seasonKey(i: number) {
  return `S${i}`;
}
export function weekEnd(i: number): number {
  return EPOCH + (i + 1) * 7 * DAY;
}
export function seasonEnd(i: number): number {
  return EPOCH + i * SEASON_WEEKS * 7 * DAY;
}

/* ───────────── Сезоны: тема и сюжет ───────────── */

export interface SeasonTheme {
  key: string;
  name: string;
  text: string;
  mods: Partial<Mods>;
  tint: string; // оттенок карты
}
export const SEASON_THEMES: SeasonTheme[] = [
  { key: 'mud', name: 'Распутица', text: 'Дороги раскисли: походы дольше, зато трофеи богаче — противник бросает склады.', mods: { time: -0.1, rewards: 0.1 }, tint: '#8a6d45' },
  { key: 'frost', name: 'Стужа', text: 'Мороз бьёт по батареям, но в чистом небе разведка видит дальше.', mods: { recon: 0.15, fuel: -0.1 }, tint: '#79a6b8' },
  { key: 'offensive', name: 'Наступление', text: 'Противник активен: атаки на полигоны чаще, но и сила групп на подъёме.', mods: { power: 0.08, defense: -0.1 }, tint: '#b5452f' },
  { key: 'heat', name: 'Жара', text: 'Пыль и зной: моторы греются, зато раненые быстрее встают на ноги.', mods: { recovery: 0.2, time: -0.05 }, tint: '#d9a43a' },
];
export function seasonTheme(season: number): SeasonTheme {
  return SEASON_THEMES[(season - 1 + SEASON_THEMES.length * 1000) % SEASON_THEMES.length];
}

/** Сюжет сезона: пять задач подряд, ведут персонажи. Счётчики — в очках сезона. */
export interface SeasonStep {
  who: 'sova' | 'shmel' | 'batya' | 'iskra';
  title: string;
  text: string;
  counter: string;
  target: number;
  reward: Cost;
}
export const SEASON_STORY: SeasonStep[] = [
  { who: 'iskra', title: 'Свежие глаза', text: 'Новый сезон — новая обстановка. Проведи 3 успешные разведки, и я соберу картину.', counter: 'recon_win', target: 3, reward: { data: 25, supplies: 150 } },
  { who: 'batya', title: 'Держим рубеж', text: 'Противник прощупывает полигоны. Отбей одну атаку — Батя проверит, как держит оборона.', counter: 'defended', target: 1, reward: { parts: 250 } },
  { who: 'shmel', title: 'Боевая работа', text: 'Пять успешных рейдов — и ребята поверят, что сезон наш.', counter: 'raid_win', target: 5, reward: { parts: 200, fuel: 150 } },
  { who: 'sova', title: 'Длинная дорога', text: 'Отправь группу в длительную экспедицию и дождись её возвращения.', counter: 'expedition_win', target: 1, reward: { data: 40, supplies: 250 } },
  { who: 'sova', title: 'Герой сезона', text: 'Набери 400 сезонных очков. Это уже не задание, а характер.', counter: 'points', target: 400, reward: { data: 80, parts: 400 } },
];

/** Награды за место в сезоне и неделе. */
export function periodRankReward(kind: 'week' | 'season', rank: number, points: number): { reward: Cost; chevron?: string } {
  const k = kind === 'season' ? 3 : 1;
  if (rank === 1) return { reward: { supplies: 400 * k, parts: 400 * k, data: 50 * k }, chevron: kind === 'season' ? 'seasonChampion' : 'weeklyChampion' };
  if (rank <= 3) return { reward: { supplies: 250 * k, parts: 250 * k, data: 30 * k }, chevron: kind === 'season' ? 'seasonTop3' : 'weeklyTop3' };
  if (rank <= 10) return { reward: { supplies: 150 * k, parts: 150 * k, data: 15 * k }, chevron: kind === 'season' ? 'seasonTop10' : undefined };
  return { reward: { supplies: Math.min(150, 30 + Math.round(points / 5)) * k }, chevron: kind === 'season' && points >= 300 ? 'seasonVeteran' : undefined };
}

/** Очки рейтинга. */
export const POINTS = {
  expedition: (difficulty: number, outcome: string) => Math.round(difficulty * 10 * ({ decisive: 1.3, success: 1, partial: 0.4, fail: 0.1 } as Record<string, number>)[outcome]),
  defended: 15,
  pvpWin: 25,
  research: 10,
  build: 3,
};

/* ───────────── Еженедельные контракты ───────────── */

export interface ContractTemplate {
  key: string;
  text: (n: number) => string;
  counter: string;
  n: [number, number, number];
  minLevel?: number;
  needCompany?: boolean;
  icon: string;
}
export const CONTRACTS: ContractTemplate[] = [
  { key: 'raids', text: (n) => `Успешных рейдов: ${n}`, counter: 'raid_win', n: [3, 5, 8], icon: 'raid' },
  { key: 'recon', text: (n) => `Успешных разведок: ${n}`, counter: 'recon_win', n: [3, 5, 8], icon: 'recon' },
  { key: 'flawless', text: (n) => `Походов без потерь: ${n}`, counter: 'flawless', n: [2, 4, 6], icon: 'heart' },
  { key: 'builds', text: (n) => `Улучшений зданий: ${n}`, counter: 'build', n: [2, 3, 5], icon: 'hq' },
  { key: 'trained', text: (n) => `Подготовить операторов: ${n}`, counter: 'trained', n: [5, 10, 15], icon: 'training' },
  { key: 'defended', text: (n) => `Отбить атак на полигон: ${n}`, counter: 'defended', n: [1, 2, 3], minLevel: 2, icon: 'reb' },
  { key: 'research', text: (n) => `Завершить исследований: ${n}`, counter: 'research', n: [1, 2, 2], icon: 'data' },
  { key: 'long', text: (n) => `Вернуться из экспедиций: ${n}`, counter: 'expedition_win', n: [1, 2, 3], minLevel: 3, icon: 'compass' },
  { key: 'company', text: (n) => `Урон в штурме роты: ${n}`, counter: 'company_damage', n: [150, 400, 800], needCompany: true, icon: 'stronghold' },
  { key: 'pvp', text: (n) => `Успешных набегов: ${n}`, counter: 'pvp_win', n: [1, 2, 3], minLevel: 4, icon: 'flag' },
];
export const CONTRACT_REWARDS: Cost[] = [
  { supplies: 220, parts: 150 },
  { parts: 250, data: 30 },
  { fuel: 220, supplies: 250, data: 15 },
];
function hash(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}
export interface Contract {
  index: number;
  key: string;
  text: string;
  counter: string;
  target: number;
  reward: Cost;
  icon: string;
}
/** Три контракта недели для игрока: детерминированно по игроку и неделе. */
export function weeklyContracts(userId: number, week: number, level: number, inCompany: boolean): Contract[] {
  const tier = level >= 7 ? 2 : level >= 4 ? 1 : 0;
  const pool = CONTRACTS.filter((c) => (c.minLevel ?? 1) <= level && (!c.needCompany || inCompany));
  const out: Contract[] = [];
  let seed = hash(userId * 7919 + week * 104729);
  const used = new Set<string>();
  while (out.length < 3 && used.size < pool.length) {
    const c = pool[seed % pool.length];
    seed = hash(seed + 1);
    if (used.has(c.key)) continue;
    used.add(c.key);
    const i = out.length;
    const mul = 1 + tier * 0.6;
    const reward: Cost = {};
    for (const [r, v] of Object.entries(CONTRACT_REWARDS[i])) (reward as Record<string, number>)[r] = Math.round(v * mul);
    out.push({ index: i, key: c.key, text: c.text(c.n[tier]), counter: c.counter, target: c.n[tier], reward, icon: c.icon });
  }
  return out;
}

/* ───────────── Серия ежедневных входов ───────────── */

export const STREAK_REWARDS: Cost[] = [
  { supplies: 80 },
  { parts: 80 },
  { fuel: 100 },
  { supplies: 150, data: 5 },
  { parts: 150, data: 5 },
  { fuel: 150, supplies: 150 },
  { data: 40, parts: 250, supplies: 250 },
];
export function streakReward(streak: number): Cost {
  return STREAK_REWARDS[(Math.max(1, streak) - 1) % STREAK_REWARDS.length];
}

/* ───────────── События на карте ───────────── */

export interface MapWeather {
  key: string;
  name: string;
  text: string;
  icon: string;
  mods: Partial<Mods>;
  weight: number;
}
export const WEATHER: MapWeather[] = [
  { key: 'clear', name: 'Ясно', text: 'Обычная обстановка.', icon: 'compass', mods: {}, weight: 40 },
  { key: 'fog', name: 'Туман', text: 'Видимость плохая: разведка −20%, прогноз менее точен, но потери ниже.', icon: 'event', mods: { recon: -0.2, uncertainty: -0.3, losses: 0.1 }, weight: 12 },
  { key: 'night', name: 'Ночь без луны', text: 'Темно: сила групп +8%, «Баба-яга» в своей стихии.', icon: 'babayaga', mods: { power: 0.08 }, weight: 12 },
  { key: 'rain', name: 'Ливень', text: 'Дороги размыло: походы дольше на 20%, топливо уходит быстрее.', icon: 'fuel', mods: { time: -0.2, fuel: -0.15 }, weight: 10 },
  { key: 'aid', name: 'Гуманитарный конвой', text: 'В район зашли конвои: награды за задания +25%.', icon: 'supplymission', mods: { rewards: 0.25 }, weight: 10 },
  { key: 'jamming', name: 'Сильные помехи', text: 'Эфир забит: оснащение работает на 30% слабее, данные +20%.', icon: 'reb', mods: { equip: -0.3, data: 0.2 }, weight: 8 },
  { key: 'calm', name: 'Затишье', text: 'Противник притих: потери −15%.', icon: 'heart', mods: { losses: 0.15 }, weight: 8 },
];
export const WEATHER_WINDOW = 6 * 3_600_000;
export const HOT_WINDOW = 3 * 3_600_000;
export const HOT_BONUS: Partial<Mods> = { rewards: 1, data: 0.5 };
export interface MapEvent {
  weather: MapWeather;
  weatherUntil: number;
  hotSector: number;
  hotUntil: number;
}
/** Общая для всех игроков обстановка: погода меняется каждые 6 часов, «горячая цель» — каждые 3 часа. */
export function mapEventAt(ms: number): MapEvent {
  const w = Math.floor(ms / WEATHER_WINDOW);
  const total = WEATHER.reduce((s, x) => s + x.weight, 0);
  let r = hash(w * 2654435761) % total;
  let weather = WEATHER[0];
  for (const x of WEATHER) {
    if (r < x.weight) {
      weather = x;
      break;
    }
    r -= x.weight;
  }
  const h = Math.floor(ms / HOT_WINDOW);
  return { weather, weatherUntil: (w + 1) * WEATHER_WINDOW, hotSector: 1 + (hash(h * 40503 + 17) % 12), hotUntil: (h + 1) * HOT_WINDOW };
}

/* ───────────── Исследования ───────────── */

export type ResearchBranch = 'comm' | 'uav' | 'log' | 'med';
export const RESEARCH_BRANCHES: { key: ResearchBranch; name: string; icon: string; who: 'iskra' | 'shmel' | 'batya' | 'sova' }[] = [
  { key: 'comm', name: 'Связь и разведка', icon: 'comms', who: 'iskra' },
  { key: 'uav', name: 'БПЛА и оборона', icon: 'drone', who: 'shmel' },
  { key: 'log', name: 'Логистика', icon: 'supplymission', who: 'batya' },
  { key: 'med', name: 'Медицина', icon: 'cross', who: 'sova' },
];
export interface ResearchDef {
  key: string;
  branch: ResearchBranch;
  tier: 1 | 2 | 3 | 4;
  name: string;
  text: string;
  mods: Partial<Mods>;
}
export const RESEARCH: ResearchDef[] = [
  { key: 'comm1', branch: 'comm', tier: 1, name: 'Шифрованный канал', text: 'Группы спокойнее работают в эфире.', mods: { recon: 0.1 } },
  { key: 'comm2', branch: 'comm', tier: 2, name: 'Ретрансляторы', text: 'Сведения о противнике точнее.', mods: { uncertainty: 0.25 } },
  { key: 'comm3', branch: 'comm', tier: 3, name: 'Сеть наблюдения', text: 'Захваченные секторы держатся дольше.', mods: { decay: 0.5 } },
  { key: 'comm4', branch: 'comm', tier: 4, name: 'Аналитический центр', text: 'Из каждого похода — больше данных.', mods: { data: 0.25, recon: 0.1 } },
  { key: 'uav1', branch: 'uav', tier: 1, name: 'Лёгкие рамы', text: 'Дроны быстрее и злее.', mods: { power: 0.05 } },
  { key: 'uav2', branch: 'uav', tier: 2, name: 'Доработка оснащения', text: 'Всё оснащение работает сильнее.', mods: { equip: 0.15 } },
  { key: 'uav3', branch: 'uav', tier: 3, name: 'ПВО полигона', text: 'Полигон отбивается увереннее.', mods: { defense: 0.25, power: 0.03 } },
  { key: 'uav4', branch: 'uav', tier: 4, name: 'Тактика роя', text: 'Слаженная работа больших групп.', mods: { power: 0.1 } },
  { key: 'log1', branch: 'log', tier: 1, name: 'Маршрутные карты', text: 'Меньше лишних километров.', mods: { fuel: 0.15 } },
  { key: 'log2', branch: 'log', tier: 2, name: 'Стеллажи и навесы', text: 'Склады вмещают больше.', mods: { storage: 0.25 } },
  { key: 'log3', branch: 'log', tier: 3, name: 'Конвейер', text: 'Производство работает без простоев.', mods: { production: 0.2 } },
  { key: 'log4', branch: 'log', tier: 4, name: 'Быстрые колонны', text: 'Походы короче, трофеи — больше.', mods: { time: 0.15, rewards: 0.05 } },
  { key: 'med1', branch: 'med', tier: 1, name: 'Индивидуальные аптечки', text: 'Меньше потерь в любом задании.', mods: { losses: 0.08 } },
  { key: 'med2', branch: 'med', tier: 2, name: 'Эвакуация', text: 'Тяжёлых выносят — безвозвратных вдвое меньше.', mods: { permLoss: 0.5 } },
  { key: 'med3', branch: 'med', tier: 3, name: 'Полевой госпиталь', text: 'Восстановление дешевле и быстрее.', mods: { recovery: 0.3 } },
  { key: 'med4', branch: 'med', tier: 4, name: 'Реабилитация', text: 'Больше раненых встают в поле.', mods: { field: 0.15, losses: 0.05 } },
];
export const RESEARCH_COST: Record<number, { cost: Cost; time: number; comms: number }> = {
  1: { cost: { data: 40, parts: 200 }, time: 1800, comms: 1 },
  2: { cost: { data: 120, parts: 600 }, time: 7200, comms: 3 },
  3: { cost: { data: 300, parts: 1500, supplies: 1000 }, time: 21600, comms: 5 },
  4: { cost: { data: 600, parts: 3500, supplies: 2500 }, time: 50400, comms: 7 },
};
export function researchByKey(key: string) {
  return RESEARCH.find((r) => r.key === key);
}
export function researchPrereq(r: ResearchDef): string | null {
  return r.tier === 1 ? null : `${r.branch}${r.tier - 1}`;
}

/* ───────────── Престиж ───────────── */

export const PRESTIGE_MAX = 5;
export const PRESTIGE_LEVEL = 10;
export function prestigeMods(prestige: number): Partial<Mods> {
  const p = Math.min(PRESTIGE_MAX, prestige);
  return p ? { production: 0.05 * p, rewards: 0.05 * p, power: 0.02 * p } : {};
}

/* ───────────── Оборона полигона и контроль секторов ───────────── */

export const ATTACK_WINDOW = 8 * 3_600_000;
export const ATTACK_CHANCE = 0.5;
export const ATTACK_LOOKBACK = 24 * 3_600_000; // после долгого отсутствия учитываем атаки только за последние сутки
export const CONTROL_GRACE = 48 * 3_600_000; // двое суток контроль держится без потерь
export const CONTROL_DECAY_PER_HOUR = 2;
export const LOOT_PROTECTED_SHARE = 0.4; // доля вместимости, которую нельзя отнять
/** Атака противника в окне w: есть ли, когда и какой силы. */
export function attackInWindow(userId: number, w: number, maxDifficulty: number, themeKey: string, extraChance = 0): { at: number; strength: number } | null {
  const h = hash(userId * 31337 + w * 7);
  const chance = Math.min(0.95, (themeKey === 'offensive' ? ATTACK_CHANCE + 0.15 : ATTACK_CHANCE) + extraChance);
  if ((h % 1000) / 1000 >= chance) return null;
  const at = w * ATTACK_WINDOW + (hash(h + 3) % ATTACK_WINDOW);
  const rnd = 0.8 + (hash(h + 5) % 400) / 1000;
  return { at, strength: Math.round((12 + 9 * Math.pow(Math.max(1, maxDifficulty), 1.3)) * rnd) };
}
export function defenseRating(defLevel: number, idlePower: number, defenseMod: number): number {
  return Math.round((8 + defLevel * 10) * (1 + defenseMod) + idlePower * 0.35);
}

/* ───────────── Набеги на чужие полигоны ───────────── */

export const PVP = {
  minLevel: 3,
  newbieHours: 72,
  shieldHours: 8,
  sameTargetHours: 12,
  scoutCost: { data: 10 } as Cost,
  baseTime: 600,
  fuel: 25,
  lootShare: 0.2,
  lootMax: 400,
  levelSpread: 2,
};

/* ───────────── Именные бойцы ───────────── */

export type SoldierTrait = 'careful' | 'sharp' | 'eagle' | 'medic' | 'lucky' | 'tough';
export const TRAITS: Record<SoldierTrait, { name: string; text: string }> = {
  careful: { name: 'Осторожный', text: 'Реже попадает под удар; группа теряет меньше' },
  sharp: { name: 'Меткий', text: '+4% к силе группы' },
  eagle: { name: 'Зоркий', text: '+7% к разведке группы' },
  medic: { name: 'Санинструктор', text: '+10% раненых встают в поле' },
  lucky: { name: 'Везучий', text: 'Его словно обходит стороной' },
  tough: { name: 'Двужильный', text: 'Группа держится дольше: потери −4%' },
};
export const SOLDIER_LEVELS = [0, 40, 120, 250, 450];
export const SOLDIER_MAX_LEVEL = 5;
export function soldierLevel(xp: number): number {
  let l = 1;
  for (let i = 0; i < SOLDIER_LEVELS.length; i++) if (xp >= SOLDIER_LEVELS[i]) l = i + 1;
  return l;
}
export const SOLDIER_NAMES = [
  'Гром', 'Тень', 'Кедр', 'Сыч', 'Шрам', 'Лис', 'Бобёр', 'Жук', 'Ветерок', 'Граф', 'Дед', 'Малой', 'Сапёр', 'Кот', 'Ёж', 'Кит', 'Тихий', 'Борода',
  'Медведь', 'Пчела', 'Барс', 'Сокол', 'Ястреб', 'Филин', 'Грач', 'Ворон', 'Компас', 'Мотор', 'Паяльник', 'Пропеллер', 'Антенна', 'Батарейка',
  'Кузя', 'Шайба', 'Боцман', 'Профессор', 'Студент', 'Химик', 'Физик', 'Лирик', 'Север', 'Юг', 'Байкал', 'Урал', 'Алтай', 'Тайга', 'Степь',
  'Клён', 'Дуб', 'Ясень', 'Самурай', 'Монах', 'Цыган', 'Казак', 'Пират', 'Корсар', 'Штиль', 'Шторм', 'Туман', 'Иней', 'Гвоздь', 'Болт', 'Ключ',
  'Хохол', 'Рыжий', 'Белый', 'Чёрный', 'Седой', 'Лысый', 'Кучер', 'Лесник', 'Егерь', 'Рыбак', 'Охотник', 'Шахтёр', 'Сварщик', 'Токарь',
];
export interface SoldierLite {
  type: OperatorType;
  level: number;
  trait: SoldierTrait;
  spec?: string | null;
  fatigue?: number; // текущая усталость 0–100
}
/** Бонусы группы от именных бойцов: опыт и черты характера. */
export function soldierMods(list: SoldierLite[], bondPairs = 0): { mods: Partial<Mods>; text: string[] } {
  if (!list.length) return { mods: {}, text: [] };
  const base = soldierModsBase(list);
  const extra: Record<string, number> = {};
  const add = (m: Partial<Mods>, k = 1) => { for (const [mk, v] of Object.entries(m)) extra[mk] = (extra[mk] ?? 0) + (v as number) * k; };
  const specs: string[] = [];
  for (const s of list) {
    const sp = specByKey(s.spec);
    if (sp) { add(sp.mods); specs.push(sp.name.toLowerCase()); }
  }
  const avgFat = list.reduce((sum, s) => sum + (s.fatigue ?? 0), 0) / list.length;
  if (avgFat > 0) add({ power: -(avgFat / 100) * FATIGUE_MAX_PENALTY });
  const bond = Math.min(BOND_MAX, bondPairs * BOND_BONUS);
  if (bond) add({ power: bond });
  for (const [mk, v] of Object.entries(extra)) (base.mods as Record<string, number>)[mk] = ((base.mods as Record<string, number>)[mk] ?? 0) + v;
  if (specs.length) base.text.push(`специализации: ${[...new Set(specs)].join(', ')}`);
  if (avgFat >= 10) base.text.push(`усталость ${Math.round(avgFat)}%`);
  if (bond) base.text.push(`слаженные расчёты ×${bondPairs}`);
  return base;
}
function soldierModsBase(list: SoldierLite[]): { mods: Partial<Mods>; text: string[] } {
  const avgLevel = list.reduce((s, x) => s + x.level, 0) / list.length;
  const count = (t: SoldierTrait) => list.filter((x) => x.trait === t).length;
  const mods: Partial<Mods> = {
    power: (avgLevel - 1) * 0.04 + Math.min(0.12, 0.04 * count('sharp')),
    recon: Math.min(0.21, 0.07 * count('eagle')),
    field: Math.min(0.3, 0.1 * count('medic')),
    losses: Math.min(0.24, 0.04 * count('tough') + 0.04 * count('careful')),
  };
  const text: string[] = [];
  if (avgLevel > 1) text.push(`опыт бойцов (средний уровень ${avgLevel.toFixed(1)})`);
  for (const t of Object.keys(TRAITS) as SoldierTrait[]) if (count(t)) text.push(`${TRAITS[t].name.toLowerCase()} ×${count(t)}`);
  return { mods, text };
}
export function traitExposure(t: SoldierTrait): number {
  return t === 'careful' ? 0.6 : t === 'lucky' ? 0.7 : 1;
}

/** Сводит именованные части бонусов в один набор и строки для «почему так». */
export function composeParts(parts: { label: string; mods: Partial<Mods> }[]) {
  const mods = emptyMods();
  for (const p of parts) addMods(mods, p.mods);
  return {
    mods,
    reasons: parts
      .filter((p) => modsText(p.mods))
      .map((p) => ({ text: `${p.label}: ${modsText(p.mods)}`, kind: (Object.values(p.mods).some((v) => (v ?? 0) < 0) ? 'malus' : 'bonus') as 'bonus' | 'malus' })),
  };
}
/** Части бонусов конкретного похода (клиентский предпросмотр повторяет серверный расчёт). */
export function dispatchParts(base: { label: string; mods: Partial<Mods> }[], sectorId: number, now: number, chosen: SoldierLite[], bondPairs = 0, extra: { label: string; mods: Partial<Mods> }[] = []) {
  const parts = [...base, ...extra];
  const ev = mapEventAt(now);
  if (Object.keys(ev.weather.mods).length) parts.push({ label: `Обстановка «${ev.weather.name}»`, mods: ev.weather.mods });
  if (sectorId && sectorId === ev.hotSector) parts.push({ label: 'Горячая цель', mods: HOT_BONUS });
  const sm = soldierMods(chosen, bondPairs);
  if (sm.text.length) parts.push({ label: `Бойцы (${sm.text.join(', ')})`, mods: sm.mods });
  return parts;
}
/** Сколько пар бойцов в группе — сработавшиеся расчёты (10+ общих походов). */
export function countBondPairs(list: { id: number; bonds?: Record<string, number> }[], need = 10): number {
  let n = 0;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if ((list[i].bonds?.[String(list[j].id)] ?? 0) >= need) n++;
  return n;
}
