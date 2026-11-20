/**
 * Шевроны — отличительные знаки командира. Один шеврон «носится» и виден другим игрокам в профиле,
 * вся коллекция тоже видна. Рисунки оригинальные (векторные нашивки), мир вымышленный.
 */

export type ChevronRarity = 'common' | 'rare' | 'epic' | 'legendary';
export const CHEVRON_RARITY_NAMES: Record<ChevronRarity, string> = {
  common: 'Обычный',
  rare: 'Редкий',
  epic: 'Эпический',
  legendary: 'Легендарный',
};
export const CHEVRON_RARITY_COLORS: Record<ChevronRarity, string> = {
  common: '#a9b9ad',
  rare: '#79b6c9',
  epic: '#b48ce0',
  legendary: '#edbb76',
};

export type ChevronCategory = 'start' | 'game' | 'site';
export const CHEVRON_CATEGORIES: { key: ChevronCategory; name: string; text: string }[] = [
  { key: 'start', name: 'Стартовые', text: 'Выдаются каждому командиру при поступлении на полигон.' },
  { key: 'game', name: 'За достижения в игре', text: 'Открываются сами, когда выполнено условие.' },
  { key: 'site', name: 'Возможно получить за особые заслуги на сайте', text: 'Выдаёт сайт «Учёт дронов» — за особые заслуги. Условия появятся позже.' },
];

export type ChevronShape = 'shield' | 'round' | 'hex' | 'tab' | 'diamond' | 'arch';
export interface ChevronCondition {
  kind: 'stat' | 'level' | 'tutorial' | 'control' | 'trained';
  key?: string;
  value: number;
  text: string;
}
export interface ChevronDef {
  key: string;
  name: string;
  motto: string; // надпись на нашивке
  category: ChevronCategory;
  rarity: ChevronRarity;
  shape: ChevronShape;
  bg: string;
  bg2: string;
  border: string;
  ink: string;
  icon: string; // имя иконки из client/src/art/icons.tsx
  condition?: ChevronCondition;
}

/** Все шевроны пока одной редкости — «Обычный». Редкость меняется здесь, интерфейс подхватит. */
export const CHEVRONS: ChevronDef[] = [
  // ── стартовые
  { key: 'polygon', name: 'Тыловой полигон', motto: 'ПОЛИГОН', category: 'start', rarity: 'common', shape: 'shield', bg: '#4b5a3c', bg2: '#2e3a26', border: '#c9b37a', ink: '#efe3c6', icon: 'base' },
  { key: 'platoon', name: 'Взвод БПЛА', motto: 'ВЗВОД БПЛА', category: 'start', rarity: 'common', shape: 'round', bg: '#2f3d3a', bg2: '#1b2624', border: '#8fa77d', ink: '#e6eadf', icon: 'drone' },

  // ── за достижения в игре
  { key: 'course', name: 'Курс молодого оператора', motto: 'КМО', category: 'game', rarity: 'common', shape: 'tab', bg: '#3a4a5a', bg2: '#23303c', border: '#9fc3d6', ink: '#e6f0f5', icon: 'training',
    condition: { kind: 'tutorial', value: 1, text: 'Пройти обучение' } },
  { key: 'firstFlight', name: 'Первый вылет', motto: 'ПЕРВЫЙ ВЫЛЕТ', category: 'game', rarity: 'common', shape: 'arch', bg: '#5a4a2c', bg2: '#3a2f1b', border: '#edbb76', ink: '#fff0d4', icon: 'flag',
    condition: { kind: 'stat', key: 'expeditionsDone', value: 1, text: 'Вернуться из первого похода' } },
  { key: 'eyes', name: 'Глаза и уши', motto: 'РАЗВЕДКА', category: 'game', rarity: 'common', shape: 'diamond', bg: '#2c4a4f', bg2: '#183033', border: '#79b6c9', ink: '#e2f3f6', icon: 'recon',
    condition: { kind: 'stat', key: 'won_recon', value: 10, text: '10 успешных разведок' } },
  { key: 'raider', name: 'Рейдер', motto: 'РЕЙД', category: 'game', rarity: 'common', shape: 'shield', bg: '#5a2f2a', bg2: '#381c19', border: '#e0a08f', ink: '#fbe4dc', icon: 'raid',
    condition: { kind: 'stat', key: 'won_raid', value: 10, text: '10 успешных рейдов' } },
  { key: 'stormer', name: 'Штурм опорника', motto: 'ШТУРМ', category: 'game', rarity: 'common', shape: 'hex', bg: '#4a3a2a', bg2: '#2d2318', border: '#d9902a', ink: '#fbe9cc', icon: 'stronghold',
    condition: { kind: 'stat', key: 'won_stronghold', value: 1, text: 'Взять опорный пункт' } },
  { key: 'convoy', name: 'Перехватчик', motto: 'СНАБЖЕНИЕ', category: 'game', rarity: 'common', shape: 'tab', bg: '#3e4a2c', bg2: '#262e1a', border: '#b9c98a', ink: '#eef3dc', icon: 'supplymission',
    condition: { kind: 'stat', key: 'won_supply', value: 5, text: '5 успешных заданий «Снабжение»' } },
  { key: 'flawless', name: 'Все дома', motto: 'БЕЗ ПОТЕРЬ', category: 'game', rarity: 'common', shape: 'round', bg: '#2f4a3a', bg2: '#1a2d22', border: '#a9cf87', ink: '#e8f5dc', icon: 'heart',
    condition: { kind: 'stat', key: 'flawless', value: 10, text: '10 успешных походов без потерь' } },
  { key: 'foreman', name: 'Прораб', motto: 'СТРОЙБАТ', category: 'game', rarity: 'common', shape: 'arch', bg: '#4f4a33', bg2: '#302d1e', border: '#e3c98a', ink: '#fbf2d8', icon: 'hq',
    condition: { kind: 'stat', key: 'buildsDone', value: 20, text: 'Завершить 20 улучшений зданий' } },
  { key: 'instructor', name: 'Наставник', motto: 'НАСТАВНИК', category: 'game', rarity: 'common', shape: 'diamond', bg: '#4a3a4f', bg2: '#2c2230', border: '#c9a6d6', ink: '#f4e8f8', icon: 'squad',
    condition: { kind: 'trained', value: 30, text: 'Подготовить 30 операторов' } },
  { key: 'master', name: 'Хозяин карты', motto: 'КОНТРОЛЬ', category: 'game', rarity: 'common', shape: 'hex', bg: '#2a3f4a', bg2: '#18262d', border: '#9cc0c2', ink: '#e4f2f3', icon: 'map',
    condition: { kind: 'control', value: 3, text: 'Взять под контроль 3 сектора' } },
  { key: 'platoonCmd', name: 'Командир взвода', motto: 'КОМВЗВОДА', category: 'game', rarity: 'common', shape: 'shield', bg: '#3a3a4f', bg2: '#22222f', border: '#b8bde0', ink: '#eceef9', icon: 'commander',
    condition: { kind: 'level', value: 5, text: 'Командир 5 уровня' } },
  { key: 'legend', name: 'Легенда рубежа', motto: 'ЛЕГЕНДА', category: 'game', rarity: 'common', shape: 'round', bg: '#5a4520', bg2: '#33260f', border: '#f6dc8a', ink: '#fff6d6', icon: 'star',
    condition: { kind: 'level', value: 10, text: 'Командир 10 уровня' } },

  // ── за особые заслуги на сайте «Учёт дронов»
  { key: 'siteAccountant', name: 'Лучший учётчик', motto: 'УЧЁТ', category: 'site', rarity: 'common', shape: 'shield', bg: '#1f3b4d', bg2: '#11222d', border: '#f6dc8a', ink: '#fff6d6', icon: 'reports' },
  { key: 'siteProp', name: 'Золотой пропеллер', motto: 'ЗОЛОТОЙ ПРОПЕЛЛЕР', category: 'site', rarity: 'common', shape: 'round', bg: '#4d3a14', bg2: '#2b200a', border: '#f6dc8a', ink: '#fff6d6', icon: 'fpv' },
  { key: 'siteHands', name: 'Золотые руки', motto: 'ЛАБОРАТОРИЯ', category: 'site', rarity: 'common', shape: 'hex', bg: '#3d3a2a', bg2: '#24221a', border: '#f6dc8a', ink: '#fff6d6', icon: 'wrench' },
  { key: 'siteNight', name: 'Ночная смена', motto: 'НОЧНАЯ СМЕНА', category: 'site', rarity: 'common', shape: 'arch', bg: '#1d2340', bg2: '#0f1326', border: '#f6dc8a', ink: '#fff6d6', icon: 'babayaga' },
  { key: 'siteSupport', name: 'Опора взвода', motto: 'ОПОРА', category: 'site', rarity: 'common', shape: 'diamond', bg: '#3a2a40', bg2: '#221828', border: '#f6dc8a', ink: '#fff6d6', icon: 'supply' },
  { key: 'siteVeteran', name: 'Ветеран учёта', motto: 'ВЕТЕРАН', category: 'site', rarity: 'common', shape: 'tab', bg: '#40322a', bg2: '#261d18', border: '#f6dc8a', ink: '#fff6d6', icon: 'medal' },
];

export const DEFAULT_CHEVRON = 'polygon';
export const START_CHEVRONS = CHEVRONS.filter((c) => c.category === 'start').map((c) => c.key);
export const SITE_CHEVRONS = CHEVRONS.filter((c) => c.category === 'site').map((c) => c.key);
export function chevronByKey(key: string): ChevronDef | undefined {
  return CHEVRONS.find((c) => c.key === key);
}

/** Данные игрока, нужные для проверки условий. */
export interface ChevronProgress {
  stats: Record<string, number>;
  level: number;
  tutorialDone: boolean;
  controlled: number;
  trained: number;
}
export function chevronProgress(c: ChevronDef, p: ChevronProgress): { have: number; need: number } {
  const cond = c.condition;
  if (!cond) return { have: 0, need: 1 };
  switch (cond.kind) {
    case 'stat':
      return { have: p.stats[cond.key!] ?? 0, need: cond.value };
    case 'level':
      return { have: p.level, need: cond.value };
    case 'tutorial':
      return { have: p.tutorialDone ? 1 : 0, need: 1 };
    case 'control':
      return { have: p.controlled, need: cond.value };
    case 'trained':
      return { have: p.trained, need: cond.value };
  }
}
export function chevronEarned(c: ChevronDef, p: ChevronProgress): boolean {
  if (c.category !== 'game') return false;
  const { have, need } = chevronProgress(c, p);
  return have >= need;
}
