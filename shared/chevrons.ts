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

export type ChevronCategory = 'start' | 'game' | 'story' | 'event' | 'rating' | 'site';
export const CHEVRON_CATEGORIES: { key: ChevronCategory; name: string; text: string }[] = [
  { key: 'start', name: 'Стартовые', text: 'Выдаются каждому командиру при поступлении на полигон.' },
  { key: 'game', name: 'За достижения в игре', text: 'Открываются сами, когда выполнено условие.' },
  { key: 'story', name: 'За сюжет', text: 'Выдаются по ходу сюжетной кампании.' },
  { key: 'event', name: 'За события', text: 'Высшая ступень события выходных.' },
  { key: 'rating', name: 'За рейтинг и сезоны', text: 'Выдаются по итогам недели и сезона лучшим командирам.' },
  { key: 'site', name: 'Возможно получить за особые заслуги на сайте', text: 'Выдаёт сайт «Учёт дронов» — за особые заслуги. Условия появятся позже.' },
];

export type ChevronShape = 'shield' | 'round' | 'hex' | 'tab' | 'diamond' | 'arch';

/** Серии: уставные (нарисованные знаки полигона) и неуставные (нашивки-картинки с юмором). */
export type ChevronSeries = 'regular' | 'unofficial';
export const CHEVRON_SERIES: { key: ChevronSeries; name: string; text: string }[] = [
  { key: 'regular', name: 'Уставные', text: 'Официальные знаки полигона.' },
  { key: 'unofficial', name: 'Неуставные', text: 'Нашивки «не по уставу» — с юмором и характером. Разной редкости: чем реже, тем труднее получить.' },
];
/** Группы неуставных нашивок — по сюжету картинки. */
export type UnofficialGroup = 'girls' | 'humor' | 'service';
export const UNOFFICIAL_GROUPS: { key: UnofficialGroup; name: string; text: string; icon: string }[] = [
  { key: 'girls', name: 'Боевые подруги', text: 'Пин-ап и портреты: те, кто ждёт, и те, кто сам в строю.', icon: 'heart' },
  { key: 'humor', name: 'С юмором', text: 'Шутки, мемы и правда жизни — то, что помогает не унывать.', icon: 'sparkle' },
  { key: 'service', name: 'Служба и обереги', text: 'Про работу, технику, удачу и то, что хранит в пути.', icon: 'flag' },
];

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
  series?: ChevronSeries; // по умолчанию — уставные
  image?: string; // готовая картинка нашивки (неуставные), путь от корня клиента
  group?: UnofficialGroup; // группа неуставной нашивки
}

/** Уставные шевроны пока одной редкости — «Обычный»; неуставные — разной. Редкость меняется здесь, интерфейс подхватит. */
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

  { key: 'defender', name: 'Стена', motto: 'ОБОРОНА', category: 'game', rarity: 'common', shape: 'shield', bg: '#3a3f46', bg2: '#22262b', border: '#c9cfd6', ink: '#eef1f4', icon: 'reb',
    condition: { kind: 'stat', key: 'defended', value: 10, text: 'Отбить 10 атак на полигон' } },
  { key: 'longHaul', name: 'Дальний рейс', motto: 'ЭКСПЕДИЦИЯ', category: 'game', rarity: 'common', shape: 'arch', bg: '#4a3f2a', bg2: '#2d2618', border: '#d9b56a', ink: '#fbefd2', icon: 'compass',
    condition: { kind: 'stat', key: 'won_expedition', value: 5, text: '5 успешных экспедиций' } },
  { key: 'scientist', name: 'Учёный совет', motto: 'НАУКА', category: 'game', rarity: 'common', shape: 'hex', bg: '#2a3a4f', bg2: '#18222f', border: '#8fc1c9', ink: '#e4f2f6', icon: 'data',
    condition: { kind: 'stat', key: 'researchDone', value: 8, text: 'Завершить 8 исследований' } },
  { key: 'pvpRaider', name: 'Гость без приглашения', motto: 'НАБЕГ', category: 'game', rarity: 'common', shape: 'diamond', bg: '#4f2a2a', bg2: '#2f1818', border: '#e0a08f', ink: '#fbe4dc', icon: 'flag',
    condition: { kind: 'stat', key: 'pvp_win', value: 5, text: '5 успешных набегов' } },
  { key: 'goodNeighbor', name: 'Плечо товарища', motto: 'ВЗАИМОПОМОЩЬ', category: 'game', rarity: 'common', shape: 'round', bg: '#2f4a3a', bg2: '#1a2d22', border: '#c7dda6', ink: '#eef6e6', icon: 'squad',
    condition: { kind: 'stat', key: 'helps', value: 10, text: 'Помочь сослуживцам 10 раз' } },
  { key: 'companyFounder', name: 'Основатель роты', motto: 'РОТА', category: 'game', rarity: 'common', shape: 'tab', bg: '#3f3a2a', bg2: '#25221a', border: '#e3c98a', ink: '#fbf2d8', icon: 'commander',
    condition: { kind: 'stat', key: 'companyFounded', value: 1, text: 'Основать роту' } },
  { key: 'companyVictor', name: 'Штурм удался', motto: 'РОТНЫЙ ШТУРМ', category: 'game', rarity: 'common', shape: 'hex', bg: '#4f3a2a', bg2: '#2f2218', border: '#edbb76', ink: '#fff0d4', icon: 'stronghold',
    condition: { kind: 'stat', key: 'companyWins', value: 1, text: 'Победить укрепрайон вместе с ротой' } },
  { key: 'streak7', name: 'Неделя без выходных', motto: '7 ДНЕЙ', category: 'game', rarity: 'common', shape: 'round', bg: '#3a2f4f', bg2: '#221b2f', border: '#c9a6d6', ink: '#f4e8f8', icon: 'clock',
    condition: { kind: 'stat', key: 'maxStreak', value: 7, text: 'Заходить 7 дней подряд' } },
  { key: 'streak30', name: 'Месяц на посту', motto: '30 ДНЕЙ', category: 'game', rarity: 'common', shape: 'shield', bg: '#2f2a4f', bg2: '#1b182f', border: '#b8bde0', ink: '#eceef9', icon: 'clock',
    condition: { kind: 'stat', key: 'maxStreak', value: 30, text: 'Заходить 30 дней подряд' } },
  { key: 'seasonHero', name: 'Герой сезона', motto: 'СЕЗОН', category: 'game', rarity: 'common', shape: 'arch', bg: '#4f2a3a', bg2: '#2f1822', border: '#f0a48f', ink: '#fbe4ec', icon: 'star',
    condition: { kind: 'stat', key: 'seasonStoryDone', value: 1, text: 'Пройти сюжет сезона до конца' } },
  { key: 'prestige', name: 'Новый рубеж', motto: 'ПРЕСТИЖ', category: 'game', rarity: 'common', shape: 'diamond', bg: '#4d3a14', bg2: '#2b200a', border: '#f6dc8a', ink: '#fff6d6', icon: 'up',
    condition: { kind: 'stat', key: 'prestige', value: 1, text: 'Перевести полигон на новый рубеж (престиж)' } },

  // ── за сюжет
  { key: 'storyHelper', name: 'Сосед в беде', motto: 'ВЗАИМОВЫРУЧКА', category: 'story', rarity: 'common', shape: 'round', bg: '#3a4f2a', bg2: '#222f18', border: '#c7dda6', ink: '#eef6e6', icon: 'heart' },
  { key: 'campaignHero', name: 'Сигнал заглушён', motto: 'РУБЕЖ НАШ', category: 'story', rarity: 'common', shape: 'shield', bg: '#4f1f1f', bg2: '#2f1212', border: '#f6dc8a', ink: '#fff6d6', icon: 'radio' },
  { key: 'mechanicGold', name: 'Золотые руки полигона', motto: 'КОНСТРУКТОР', category: 'game', rarity: 'common', shape: 'hex', bg: '#3d3a2a', bg2: '#24221a', border: '#e3c98a', ink: '#fbf2d8', icon: 'drone',
    condition: { kind: 'stat', key: 'modelsBuilt', value: 5, text: 'Собрать 5 моделей дронов' } },
  { key: 'achiever', name: 'Мастер полигона', motto: 'ДОСТИЖЕНИЯ', category: 'game', rarity: 'common', shape: 'arch', bg: '#2a3a4f', bg2: '#18222f', border: '#f6dc8a', ink: '#fff6d6', icon: 'star',
    condition: { kind: 'stat', key: 'achPoints', value: 300, text: 'Набрать 300 очков достижений' } },
  // ── за события
  { key: 'evNight', name: 'Ночной охотник', motto: 'НОЧНАЯ ОХОТА', category: 'event', rarity: 'common', shape: 'round', bg: '#1d2340', bg2: '#0f1326', border: '#b8bde0', ink: '#eceef9', icon: 'babayaga' },
  { key: 'evConvoy', name: 'Гроза конвоев', motto: 'КОНВОЙ', category: 'event', rarity: 'common', shape: 'tab', bg: '#3e4a2c', bg2: '#262e1a', border: '#b9c98a', ink: '#eef3dc', icon: 'supplymission' },
  { key: 'evStorm', name: 'Сквозь бурю', motto: 'БУРЯ', category: 'event', rarity: 'common', shape: 'diamond', bg: '#2c3a4f', bg2: '#182230', border: '#9fc3d6', ink: '#e6f0f5', icon: 'event' },
  { key: 'evWorkshop', name: 'Мастер недели', motto: 'МАСТЕРСКАЯ', category: 'event', rarity: 'common', shape: 'hex', bg: '#4a3a2a', bg2: '#2d2318', border: '#e3c98a', ink: '#fbf2d8', icon: 'workshop' },
  { key: 'evRubezh', name: 'Стена рубежа', motto: 'ОБОРОНА РУБЕЖА', category: 'event', rarity: 'common', shape: 'shield', bg: '#4f2a2a', bg2: '#2f1818', border: '#e0a08f', ink: '#fbe4dc', icon: 'reb' },

  // ── за рейтинг и сезоны
  { key: 'weeklyTop3', name: 'Тройка недели', motto: 'ТОП-3', category: 'rating', rarity: 'common', shape: 'shield', bg: '#3a3a4f', bg2: '#22222f', border: '#c9cfd6', ink: '#eef1f4', icon: 'star' },
  { key: 'weeklyChampion', name: 'Лучший за неделю', motto: 'ЧЕМПИОН НЕДЕЛИ', category: 'rating', rarity: 'common', shape: 'round', bg: '#4d3a14', bg2: '#2b200a', border: '#f6dc8a', ink: '#fff6d6', icon: 'star' },
  { key: 'seasonVeteran', name: 'Ветеран сезона', motto: 'ВЕТЕРАН СЕЗОНА', category: 'rating', rarity: 'common', shape: 'tab', bg: '#2f3d3a', bg2: '#1b2624', border: '#8fa77d', ink: '#e6eadf', icon: 'flag' },
  { key: 'seasonTop10', name: 'Десятка сезона', motto: 'ТОП-10', category: 'rating', rarity: 'common', shape: 'hex', bg: '#2a3a4f', bg2: '#18222f', border: '#9fc3d6', ink: '#e6f0f5', icon: 'medal' },
  { key: 'seasonTop3', name: 'Призёр сезона', motto: 'ТОП-3 СЕЗОНА', category: 'rating', rarity: 'common', shape: 'shield', bg: '#4a3a4f', bg2: '#2c2230', border: '#c9a6d6', ink: '#f4e8f8', icon: 'medal' },
  { key: 'seasonChampion', name: 'Чемпион сезона', motto: 'ЧЕМПИОН', category: 'rating', rarity: 'common', shape: 'arch', bg: '#5a4520', bg2: '#33260f', border: '#f6dc8a', ink: '#fff6d6', icon: 'star' },

  // ── за особые заслуги на сайте «Учёт дронов»
  { key: 'siteAccountant', name: 'Лучший учётчик', motto: 'УЧЁТ', category: 'site', rarity: 'common', shape: 'shield', bg: '#1f3b4d', bg2: '#11222d', border: '#f6dc8a', ink: '#fff6d6', icon: 'reports' },
  { key: 'siteProp', name: 'Золотой пропеллер', motto: 'ЗОЛОТОЙ ПРОПЕЛЛЕР', category: 'site', rarity: 'common', shape: 'round', bg: '#4d3a14', bg2: '#2b200a', border: '#f6dc8a', ink: '#fff6d6', icon: 'fpv' },
  { key: 'siteHands', name: 'Золотые руки', motto: 'ЛАБОРАТОРИЯ', category: 'site', rarity: 'common', shape: 'hex', bg: '#3d3a2a', bg2: '#24221a', border: '#f6dc8a', ink: '#fff6d6', icon: 'wrench' },
  { key: 'siteNight', name: 'Ночная смена', motto: 'НОЧНАЯ СМЕНА', category: 'site', rarity: 'common', shape: 'arch', bg: '#1d2340', bg2: '#0f1326', border: '#f6dc8a', ink: '#fff6d6', icon: 'babayaga' },
  { key: 'siteSupport', name: 'Опора взвода', motto: 'ОПОРА', category: 'site', rarity: 'common', shape: 'diamond', bg: '#3a2a40', bg2: '#221828', border: '#f6dc8a', ink: '#fff6d6', icon: 'supply' },
  { key: 'siteVeteran', name: 'Ветеран учёта', motto: 'ВЕТЕРАН', category: 'site', rarity: 'common', shape: 'tab', bg: '#40322a', bg2: '#261d18', border: '#f6dc8a', ink: '#fff6d6', icon: 'medal' },

  // ── неуставные: нашивки-картинки, разная редкость ──
  // за достижения в игре
  { key: 'u_smileRum', name: 'Улыбайтесь, это всех раздражает', motto: '', category: 'game', rarity: 'common', series: 'unofficial', group: 'humor', image: 'img/patches/smileRum.webp', shape: 'tab', bg: '', bg2: '', border: '#6b7a3c', ink: '', icon: '',
    condition: { kind: 'stat', key: 'failed', value: 3, text: 'Пережить 3 сорванных задания' } },
  { key: 'u_medkit', name: 'Аптечка при себе', motto: '', category: 'game', rarity: 'common', series: 'unofficial', group: 'girls', image: 'img/patches/medkit.webp', shape: 'tab', bg: '', bg2: '', border: '#6b7a3c', ink: '', icon: '',
    condition: { kind: 'stat', key: 'recovered', value: 10, text: 'Вернуть в строй 10 раненых' } },
  { key: 'u_loveIsHug', name: 'Love is (объятия)', motto: '', category: 'game', rarity: 'common', series: 'unofficial', group: 'humor', image: 'img/patches/loveIsHug.webp', shape: 'tab', bg: '', bg2: '', border: '#a5503f', ink: '', icon: '',
    condition: { kind: 'level', value: 3, text: 'Командир 3 уровня' } },
  { key: 'u_pirateKnife', name: 'Человек как нож', motto: '', category: 'game', rarity: 'rare', series: 'unofficial', group: 'humor', image: 'img/patches/pirateKnife.webp', shape: 'tab', bg: '', bg2: '', border: '#2f5aa8', ink: '', icon: '',
    condition: { kind: 'stat', key: 'expeditionsWon', value: 25, text: '25 успешных походов' } },
  { key: 'u_remote', name: 'Работаем на удалёнке', motto: '', category: 'game', rarity: 'rare', series: 'unofficial', group: 'service', image: 'img/patches/remote.webp', shape: 'tab', bg: '', bg2: '', border: '#d9902a', ink: '', icon: '',
    condition: { kind: 'stat', key: 'won_recon', value: 15, text: '15 успешных разведок' } },
  { key: 'u_rearCovered', name: 'Тыл прикрыт', motto: '', category: 'game', rarity: 'rare', series: 'unofficial', group: 'girls', image: 'img/patches/rearCovered.webp', shape: 'tab', bg: '', bg2: '', border: '#a5503f', ink: '', icon: '',
    condition: { kind: 'stat', key: 'flawless', value: 20, text: '20 успешных походов без потерь' } },
  { key: 'u_goodGuys', name: 'И собрались все добрые', motto: '', category: 'game', rarity: 'epic', series: 'unofficial', group: 'humor', image: 'img/patches/goodGuys.webp', shape: 'tab', bg: '', bg2: '', border: '#e6ddc9', ink: '', icon: '',
    condition: { kind: 'stat', key: 'won_raid', value: 30, text: '30 успешных рейдов' } },
  { key: 'u_loveIs', name: 'Love is', motto: '', category: 'game', rarity: 'epic', series: 'unofficial', group: 'humor', image: 'img/patches/loveIs.webp', shape: 'tab', bg: '', bg2: '', border: '#c0392b', ink: '', icon: '',
    condition: { kind: 'stat', key: 'decisive', value: 20, text: '20 решительных успехов' } },
  // возможно получить за особые заслуги на сайте
  { key: 'u_onlyNow', name: 'Только сейчас!', motto: '', category: 'site', rarity: 'rare', series: 'unofficial', group: 'girls', image: 'img/patches/onlyNow.webp', shape: 'tab', bg: '', bg2: '', border: '#a5503f', ink: '', icon: '' },
  { key: 'u_kingRedwar', name: 'Король REDWAR', motto: '', category: 'site', rarity: 'epic', series: 'unofficial', group: 'service', image: 'img/patches/kingRedwar.webp', shape: 'tab', bg: '', bg2: '', border: '#c0392b', ink: '', icon: '' },
  { key: 'u_kingHearts', name: 'Король червей', motto: '', category: 'site', rarity: 'legendary', series: 'unofficial', group: 'service', image: 'img/patches/kingHearts.webp', shape: 'tab', bg: '', bg2: '', border: '#c0392b', ink: '', icon: '' },
  { key: 'u_madeInRussia', name: 'Made in Russia', motto: '', category: 'site', rarity: 'legendary', series: 'unofficial', group: 'girls', image: 'img/patches/madeInRussia.webp', shape: 'tab', bg: '', bg2: '', border: '#a5503f', ink: '', icon: '' },
  // ── неуставные, вторая поставка ──
  // за достижения в игре
  { key: 'u_doge', name: 'Доге с ночником', motto: '', category: 'game', rarity: 'common', series: 'unofficial', group: 'humor', image: 'img/patches/doge.webp', shape: 'tab', bg: '', bg2: '', border: '#5b6fa8', ink: '', icon: '',
    condition: { kind: 'stat', key: 'encounters', value: 5, text: '5 случайных встреч в походах' } },
  { key: 'u_ptsd', name: 'У вас ПТСР', motto: '', category: 'game', rarity: 'common', series: 'unofficial', group: 'humor', image: 'img/patches/ptsd.webp', shape: 'tab', bg: '', bg2: '', border: '#d9a43a', ink: '', icon: '',
    condition: { kind: 'stat', key: 'expeditionsSent', value: 100, text: 'Отправить 100 походов' } },
  { key: 'u_uaz', name: 'Козлик', motto: '', category: 'game', rarity: 'common', series: 'unofficial', group: 'service', image: 'img/patches/uaz.webp', shape: 'tab', bg: '', bg2: '', border: '#6b7a3c', ink: '', icon: '',
    condition: { kind: 'stat', key: 'repairs', value: 10, text: 'Сделать 10 ремонтов' } },
  { key: 'u_suspenders', name: 'Подтяжки', motto: '', category: 'game', rarity: 'common', series: 'unofficial', group: 'girls', image: 'img/patches/suspenders.webp', shape: 'tab', bg: '', bg2: '', border: '#7c8a86', ink: '', icon: '',
    condition: { kind: 'stat', key: 'modelsBuilt', value: 2, text: 'Собрать 2 модели дронов' } },
  { key: 'u_driver', name: 'Водила', motto: '', category: 'game', rarity: 'rare', series: 'unofficial', group: 'service', image: 'img/patches/driver.webp', shape: 'tab', bg: '', bg2: '', border: '#9aa58c', ink: '', icon: '',
    condition: { kind: 'stat', key: 'won_supply', value: 25, text: '25 успешных заданий «Снабжение»' } },
  { key: 'u_posadki', name: 'Run Through The Posadki', motto: '', category: 'game', rarity: 'rare', series: 'unofficial', group: 'humor', image: 'img/patches/posadki.webp', shape: 'tab', bg: '', bg2: '', border: '#5a3ea8', ink: '', icon: '',
    condition: { kind: 'stat', key: 'won_raid', value: 60, text: '60 успешных рейдов' } },
  { key: 'u_hideSeek', name: 'Кто не спрятался', motto: '', category: 'game', rarity: 'rare', series: 'unofficial', group: 'service', image: 'img/patches/hideSeek.webp', shape: 'tab', bg: '', bg2: '', border: '#d6cdb4', ink: '', icon: '',
    condition: { kind: 'stat', key: 'won_stronghold', value: 10, text: 'Взять 10 опорных пунктов' } },
  { key: 'u_milf', name: 'Специалист по милфам', motto: '', category: 'game', rarity: 'rare', series: 'unofficial', group: 'humor', image: 'img/patches/milf.webp', shape: 'tab', bg: '', bg2: '', border: '#e6ddc9', ink: '', icon: '',
    condition: { kind: 'level', value: 6, text: 'Командир 6 уровня' } },
  { key: 'u_glasses', name: 'Очки и калаш', motto: '', category: 'game', rarity: 'rare', series: 'unofficial', group: 'girls', image: 'img/patches/glasses.webp', shape: 'tab', bg: '', bg2: '', border: '#2fa3a3', ink: '', icon: '',
    condition: { kind: 'stat', key: 'won_expedition', value: 10, text: '10 успешных экспедиций' } },
  { key: 'u_wolfGirl', name: 'Волчица', motto: '', category: 'game', rarity: 'rare', series: 'unofficial', group: 'girls', image: 'img/patches/wolfGirl.webp', shape: 'tab', bg: '', bg2: '', border: '#7a2e3a', ink: '', icon: '',
    condition: { kind: 'stat', key: 'maxStreak', value: 14, text: 'Заходить 14 дней подряд' } },
  { key: 'u_fpvGirl', name: 'Пилотесса FPV', motto: '', category: 'game', rarity: 'epic', series: 'unofficial', group: 'girls', image: 'img/patches/fpvGirl.webp', shape: 'tab', bg: '', bg2: '', border: '#8fa77d', ink: '', icon: '',
    condition: { kind: 'stat', key: 'campaignSteps', value: 20, text: 'Пройти сюжетную кампанию' } },
  { key: 'u_headEyes', name: 'Голова, глаза', motto: '', category: 'game', rarity: 'epic', series: 'unofficial', group: 'girls', image: 'img/patches/headEyes.webp', shape: 'tab', bg: '', bg2: '', border: '#c0392b', ink: '', icon: '',
    condition: { kind: 'stat', key: 'defended', value: 25, text: 'Отбить 25 атак на полигон' } },
  { key: 'u_freckles', name: 'Веснушки', motto: '', category: 'game', rarity: 'epic', series: 'unofficial', group: 'girls', image: 'img/patches/freckles.webp', shape: 'tab', bg: '', bg2: '', border: '#7a2e2e', ink: '', icon: '',
    condition: { kind: 'level', value: 9, text: 'Командир 9 уровня' } },
  { key: 'u_gosuslugi', name: 'Девушка на госуслугах', motto: '', category: 'game', rarity: 'legendary', series: 'unofficial', group: 'girls', image: 'img/patches/gosuslugi.webp', shape: 'tab', bg: '', bg2: '', border: '#2f5aa8', ink: '', icon: '',
    condition: { kind: 'stat', key: 'achPoints', value: 600, text: 'Набрать 600 очков достижений' } },
  // возможно получить за особые заслуги на сайте
  { key: 'u_nikolai', name: 'Святитель Николай', motto: '', category: 'site', rarity: 'epic', series: 'unofficial', group: 'service', image: 'img/patches/nikolai.webp', shape: 'tab', bg: '', bg2: '', border: '#c9a23a', ink: '', icon: '' },
  { key: 'u_rubezhGirl', name: 'Девушка «Рубежа»', motto: '', category: 'site', rarity: 'legendary', series: 'unofficial', group: 'girls', image: 'img/patches/rubezhGirl.webp', shape: 'tab', bg: '', bg2: '', border: '#6b7a3c', ink: '', icon: '' },
  // ── неуставные, третья поставка ──
  { key: 'u_roof', name: 'Крыша едет', motto: '', category: 'game', rarity: 'common', series: 'unofficial', group: 'humor', image: 'img/patches/roof.webp', shape: 'tab', bg: '', bg2: '', border: '#c0392b', ink: '', icon: '',
    condition: { kind: 'stat', key: 'failed', value: 10, text: 'Пережить 10 сорванных заданий' } },
  { key: 'u_grenade', name: 'Лови гранату!', motto: '', category: 'game', rarity: 'common', series: 'unofficial', group: 'humor', image: 'img/patches/grenade.webp', shape: 'tab', bg: '', bg2: '', border: '#d9a43a', ink: '', icon: '',
    condition: { kind: 'stat', key: 'raidWithEquipment', value: 10, text: '10 рейдов с оснащением' } },
  { key: 'u_dressedDevil', name: 'Одеты, как чёрт', motto: '', category: 'game', rarity: 'common', series: 'unofficial', group: 'humor', image: 'img/patches/dressedDevil.webp', shape: 'tab', bg: '', bg2: '', border: '#d9902a', ink: '', icon: '',
    condition: { kind: 'level', value: 4, text: 'Командир 4 уровня' } },
  { key: 'u_animeSmile', name: 'Улыбка', motto: '', category: 'game', rarity: 'common', series: 'unofficial', group: 'girls', image: 'img/patches/animeSmile.webp', shape: 'tab', bg: '', bg2: '', border: '#9aa3a8', ink: '', icon: '',
    condition: { kind: 'stat', key: 'researchDone', value: 4, text: 'Завершить 4 исследования' } },
  { key: 'u_duck', name: 'Нижняя подсветка ВКЛ', motto: '', category: 'game', rarity: 'rare', series: 'unofficial', group: 'humor', image: 'img/patches/duck.webp', shape: 'tab', bg: '', bg2: '', border: '#d6cdb4', ink: '', icon: '',
    condition: { kind: 'stat', key: 'won_recon', value: 40, text: '40 успешных разведок' } },
  { key: 'u_mole', name: 'Крот-снайпер', motto: '', category: 'game', rarity: 'rare', series: 'unofficial', group: 'service', image: 'img/patches/mole.webp', shape: 'tab', bg: '', bg2: '', border: '#6b7a3c', ink: '', icon: '',
    condition: { kind: 'stat', key: 'decisive', value: 50, text: '50 решительных успехов' } },
  { key: 'u_hardToFind', name: 'Сложно найти', motto: '', category: 'game', rarity: 'rare', series: 'unofficial', group: 'service', image: 'img/patches/hardToFind.webp', shape: 'tab', bg: '', bg2: '', border: '#d9a43a', ink: '', icon: '',
    condition: { kind: 'stat', key: 'expeditionsWon', value: 100, text: '100 успешных походов' } },
  { key: 'u_peaceGirl', name: 'Мир', motto: '', category: 'game', rarity: 'rare', series: 'unofficial', group: 'girls', image: 'img/patches/peaceGirl.webp', shape: 'tab', bg: '', bg2: '', border: '#4f7fb3', ink: '', icon: '',
    condition: { kind: 'stat', key: 'helps', value: 15, text: 'Помочь сослуживцам 15 раз' } },
  { key: 'u_kinderGirl', name: 'Сюрприз', motto: '', category: 'game', rarity: 'rare', series: 'unofficial', group: 'girls', image: 'img/patches/kinderGirl.webp', shape: 'tab', bg: '', bg2: '', border: '#e0602e', ink: '', icon: '',
    condition: { kind: 'stat', key: 'eventTiers', value: 8, text: 'Забрать 8 ступеней событий выходных' } },
  { key: 'u_tigerDog', name: 'Вот такая вот…', motto: '', category: 'game', rarity: 'rare', series: 'unofficial', group: 'humor', image: 'img/patches/tigerDog.webp', shape: 'tab', bg: '', bg2: '', border: '#d9a43a', ink: '', icon: '',
    condition: { kind: 'stat', key: 'encounters', value: 15, text: '15 случайных встреч в походах' } },
  { key: 'u_grandpa', name: 'Дед в броне', motto: '', category: 'game', rarity: 'epic', series: 'unofficial', group: 'humor', image: 'img/patches/grandpa.webp', shape: 'tab', bg: '', bg2: '', border: '#8a9a5b', ink: '', icon: '',
    condition: { kind: 'level', value: 8, text: 'Командир 8 уровня' } },
  { key: 'u_beerGirl', name: 'Два пива', motto: '', category: 'game', rarity: 'epic', series: 'unofficial', group: 'girls', image: 'img/patches/beerGirl.webp', shape: 'tab', bg: '', bg2: '', border: '#6b7a3c', ink: '', icon: '',
    condition: { kind: 'stat', key: 'donated', value: 3000, text: 'Сдать на склад роты 3000 ресурсов' } },
  { key: 'u_envyDead', name: 'Будут завидовать мёртвым', motto: '', category: 'game', rarity: 'epic', series: 'unofficial', group: 'humor', image: 'img/patches/envyDead.webp', shape: 'tab', bg: '', bg2: '', border: '#2f5aa8', ink: '', icon: '',
    condition: { kind: 'stat', key: 'won_expedition', value: 30, text: '30 успешных экспедиций' } },
  { key: 'u_penguins', name: 'OTMOROZKI', motto: '', category: 'game', rarity: 'epic', series: 'unofficial', group: 'humor', image: 'img/patches/penguins.webp', shape: 'tab', bg: '', bg2: '', border: '#9aa3a8', ink: '', icon: '',
    condition: { kind: 'stat', key: 'companyWins', value: 3, text: 'Победить укрепрайон с ротой 3 раза' } },
  { key: 'u_bereginya', name: 'Берегиня', motto: '', category: 'site', rarity: 'epic', series: 'unofficial', group: 'service', image: 'img/patches/bereginya.webp', shape: 'tab', bg: '', bg2: '', border: '#e6ddc9', ink: '', icon: '' },
  { key: 'u_redSuit', name: 'Пилот в красном', motto: '', category: 'site', rarity: 'legendary', series: 'unofficial', group: 'girls', image: 'img/patches/redSuit.webp', shape: 'tab', bg: '', bg2: '', border: '#c0392b', ink: '', icon: '' },
  // ── неуставные, четвёртая поставка ──
  { key: 'u_returnFire', name: 'Only you can return fire', motto: '', category: 'game', rarity: 'common', series: 'unofficial', group: 'humor', image: 'img/patches/returnFire.webp', shape: 'tab', bg: '', bg2: '', border: '#c0392b', ink: '', icon: '',
    condition: { kind: 'stat', key: 'won_raid', value: 15, text: '15 успешных рейдов' } },
  { key: 'u_helmetFriends', name: 'Каска не по размеру', motto: '', category: 'game', rarity: 'common', series: 'unofficial', group: 'humor', image: 'img/patches/helmetFriends.webp', shape: 'tab', bg: '', bg2: '', border: '#6b7a3c', ink: '', icon: '',
    condition: { kind: 'trained', value: 15, text: 'Подготовить 15 операторов' } },
  { key: 'u_bombRiders', name: 'Верхом на бомбе', motto: '', category: 'game', rarity: 'common', series: 'unofficial', group: 'humor', image: 'img/patches/bombRiders.webp', shape: 'tab', bg: '', bg2: '', border: '#9aa3a8', ink: '', icon: '',
    condition: { kind: 'stat', key: 'buildsDone', value: 15, text: 'Завершить 15 улучшений зданий' } },
  { key: 'u_candyGirl', name: 'Конфеты и гильзы', motto: '', category: 'game', rarity: 'common', series: 'unofficial', group: 'girls', image: 'img/patches/candyGirl.webp', shape: 'tab', bg: '', bg2: '', border: '#7c8a86', ink: '', icon: '',
    condition: { kind: 'stat', key: 'recovered', value: 25, text: 'Вернуть в строй 25 раненых' } },
  { key: 'u_handToHand', name: 'Вперёд, в рукопашную!', motto: '', category: 'game', rarity: 'rare', series: 'unofficial', group: 'humor', image: 'img/patches/handToHand.webp', shape: 'tab', bg: '', bg2: '', border: '#2f5aa8', ink: '', icon: '',
    condition: { kind: 'stat', key: 'won_stronghold', value: 5, text: 'Взять 5 опорных пунктов' } },
  { key: 'u_angryNose', name: 'Суровый нос', motto: '', category: 'game', rarity: 'rare', series: 'unofficial', group: 'humor', image: 'img/patches/angryNose.webp', shape: 'tab', bg: '', bg2: '', border: '#3f5d6b', ink: '', icon: '',
    condition: { kind: 'stat', key: 'pvp_win', value: 10, text: '10 успешных набегов' } },
  { key: 'u_ghostBride', name: 'Призрак в кокошнике', motto: '', category: 'game', rarity: 'rare', series: 'unofficial', group: 'humor', image: 'img/patches/ghostBride.webp', shape: 'tab', bg: '', bg2: '', border: '#9aa3a8', ink: '', icon: '',
    condition: { kind: 'stat', key: 'flawless', value: 40, text: '40 походов без потерь' } },
  { key: 'u_zeroVisibility', name: 'Нулевая видимость', motto: '', category: 'game', rarity: 'rare', series: 'unofficial', group: 'service', image: 'img/patches/zeroVisibility.webp', shape: 'tab', bg: '', bg2: '', border: '#6b7a3c', ink: '', icon: '',
    condition: { kind: 'stat', key: 'won_recon', value: 25, text: '25 успешных разведок' } },
  { key: 'u_yuri', name: 'Горничная Юри', motto: '', category: 'game', rarity: 'rare', series: 'unofficial', group: 'girls', image: 'img/patches/yuri.webp', shape: 'tab', bg: '', bg2: '', border: '#2f5aa8', ink: '', icon: '',
    condition: { kind: 'stat', key: 'modelsBuilt', value: 5, text: 'Собрать 5 моделей дронов' } },
  { key: 'u_visorGirl', name: 'Забрало', motto: '', category: 'game', rarity: 'rare', series: 'unofficial', group: 'girls', image: 'img/patches/visorGirl.webp', shape: 'tab', bg: '', bg2: '', border: '#7a2e2e', ink: '', icon: '',
    condition: { kind: 'stat', key: 'defended', value: 15, text: 'Отбить 15 атак на полигон' } },
  { key: 'u_chibiPilot', name: 'Мегафон', motto: '', category: 'game', rarity: 'rare', series: 'unofficial', group: 'girls', image: 'img/patches/chibiPilot.webp', shape: 'tab', bg: '', bg2: '', border: '#d9a43a', ink: '', icon: '',
    condition: { kind: 'stat', key: 'repairs', value: 25, text: 'Сделать 25 ремонтов' } },
  { key: 'u_mamaOk', name: 'Мама, я в порядке!', motto: '', category: 'game', rarity: 'epic', series: 'unofficial', group: 'service', image: 'img/patches/mamaOk.webp', shape: 'tab', bg: '', bg2: '', border: '#6b7a3c', ink: '', icon: '',
    condition: { kind: 'stat', key: 'flawless', value: 75, text: '75 походов без потерь' } },
  { key: 'u_armorThen', name: 'Доспех тогда и сейчас', motto: '', category: 'game', rarity: 'epic', series: 'unofficial', group: 'service', image: 'img/patches/armorThen.webp', shape: 'tab', bg: '', bg2: '', border: '#c0392b', ink: '', icon: '',
    condition: { kind: 'stat', key: 'researchDone', value: 12, text: 'Завершить 12 исследований' } },
  { key: 'u_redUniform', name: 'Мундир', motto: '', category: 'game', rarity: 'epic', series: 'unofficial', group: 'girls', image: 'img/patches/redUniform.webp', shape: 'tab', bg: '', bg2: '', border: '#c0392b', ink: '', icon: '',
    condition: { kind: 'stat', key: 'maxStreak', value: 30, text: 'Заходить 30 дней подряд' } },
  { key: 'u_redHairPilot', name: 'Рыжая', motto: '', category: 'site', rarity: 'epic', series: 'unofficial', group: 'girls', image: 'img/patches/redHairPilot.webp', shape: 'tab', bg: '', bg2: '', border: '#c0392b', ink: '', icon: '' },
  { key: 'u_weRussians', name: 'Мы русские — с нами Бог', motto: '', category: 'site', rarity: 'legendary', series: 'unofficial', group: 'service', image: 'img/patches/weRussians.webp', shape: 'tab', bg: '', bg2: '', border: '#d9a43a', ink: '', icon: '' },
];
// уставные шевроны нарисованы отдельными картинками-нашивками (img/chevrons/<key>.webp)
for (const c of CHEVRONS) if (!c.image) c.image = `img/chevrons/${c.key}.webp`;

export const DEFAULT_CHEVRON = 'polygon';

/** Комплекты: собрал все нашивки набора — получил постоянный бонус. */
export interface ChevronSet {
  key: string;
  name: string;
  keys: string[];
  mods: Record<string, number>; // ключи Mods из progression.ts
  text: string;
}
export const CHEVRON_SETS: ChevronSet[] = [
  { key: 'cadet', name: 'Курсант', keys: ['polygon', 'platoon', 'course', 'firstFlight'], mods: { rewards: 0.03 }, text: 'награды +3%' },
  { key: 'warpath', name: 'Боевой путь', keys: ['raider', 'stormer', 'convoy', 'eyes'], mods: { power: 0.04 }, text: 'сила группы +4%' },
  { key: 'keeper', name: 'Хозяйство', keys: ['foreman', 'instructor', 'defender'], mods: { production: 0.05 }, text: 'производство +5%' },
  { key: 'pirates', name: 'Пиратский набор', keys: ['u_pirateKnife', 'u_smileRum'], mods: { rewards: 0.04 }, text: 'награды +4%' },
  { key: 'kings', name: 'Короли', keys: ['u_kingHearts', 'u_kingRedwar'], mods: { power: 0.05 }, text: 'сила группы +5%' },
  { key: 'love', name: 'Love is', keys: ['u_loveIs', 'u_loveIsHug'], mods: { losses: 0.04 }, text: 'потери −4%' },
  { key: 'night', name: 'Ночная работа', keys: ['u_remote', 'siteNight'], mods: { recon: 0.06 }, text: 'разведка +6%' },
  { key: 'site', name: 'Гордость «Учёта»', keys: ['siteAccountant', 'siteProp', 'siteHands', 'siteNight', 'siteSupport', 'siteVeteran'], mods: { data: 0.1, rewards: 0.05 }, text: 'данные +10%, награды +5%' },
];
export function activeSets(owned: Set<string>): ChevronSet[] {
  return CHEVRON_SETS.filter((st) => st.keys.every((k) => owned.has(k)));
}
export const START_CHEVRONS = CHEVRONS.filter((c) => c.category === 'start').map((c) => c.key);
export const SITE_CHEVRONS = CHEVRONS.filter((c) => c.category === 'site').map((c) => c.key);
export function chevronSeries(c: ChevronDef): ChevronSeries {
  return c.series ?? 'regular';
}
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
