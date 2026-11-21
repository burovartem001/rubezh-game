/**
 * Проверки баланса без сервера: всё, что можно купить, помещается в склад того уровня, который к этому моменту
 * реально есть у игрока; таймеры растут монотонно и укладываются в сутки; опыт и цены растут.
 * Запуск: npm run test:balance
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILDINGS, BUILDING_KEYS, CRAFT, LATE_BUILDINGS, MAX_BUILDING_LEVEL, MAX_RANK, MAX_VEHICLE_LEVEL, OPERATORS, PRODUCED_KEYS, SECTORS, TRAINABLE_OPERATORS, VEHICLES,
  XP_THRESHOLDS, buildingUpgradeCost, buildingUpgradeTime, rankRequiredTraining, rankUpgradeCost, storageCap, vehicleUpgradeCost, vehicleUpgradeRequiredWorkshop,
  missionRewards, MISSIONS,
} from '../shared/config.js';
import { RESEARCH_COST } from '../shared/progression.js';
import { CAMPAIGN, CHAPTERS, OUTPOST, chapterLockLevel } from '../shared/content.js';
import { hqCommanderLevel, COMMANDER_MAX_LEVEL } from '../shared/config.js';

const STORE = { supplies: 'supply', parts: 'workshop', fuel: 'fueldepot' } as const;
function fits(cost: Record<string, number | undefined>, storeLevel: number, what: string) {
  for (const r of PRODUCED_KEYS) {
    const v = cost[r] ?? 0;
    assert.ok(v <= storageCap(storeLevel), `${what}: ${r} ${v} > склад ${storageCap(storeLevel)} (ур. ${storeLevel})`);
  }
}

test('каждое улучшение здания помещается в склад', () => {
  for (const k of BUILDING_KEYS) {
    const from = LATE_BUILDINGS.includes(k) ? 0 : 1;
    for (let l = from; l < MAX_BUILDING_LEVEL; l++) {
      // склад игрока обычно не выше командного пункта; для КП L→L+1 склады не выше L
      const store = k === 'hq' ? l : Math.max(1, Math.max(l, BUILDINGS[k].unlockHq ?? 1));
      fits(buildingUpgradeCost(k, l), Math.min(MAX_BUILDING_LEVEL, store), `${BUILDINGS[k].name} ${l}→${l + 1}`);
    }
  }
});

test('прочие траты помещаются в склад', () => {
  for (const [tier, r] of Object.entries(RESEARCH_COST)) fits(r.cost, Math.max(r.comms, 4), `исследование ${tier}`);
  for (const t of TRAINABLE_OPERATORS) for (let r = 2; r <= MAX_RANK; r++) fits(rankUpgradeCost(t, r), rankRequiredTraining(r), `ранг ${OPERATORS[t].name} ${r}`);
  for (let l = 1; l < MAX_VEHICLE_LEVEL; l++) fits(vehicleUpgradeCost(l), vehicleUpgradeRequiredWorkshop(l + 1), `транспорт ${l}→${l + 1}`);
  for (const v of Object.values(VEHICLES)) fits(v.acquireCost, Math.max(1, v.unlockHq === 99 ? 1 : v.unlockHq), `покупка ${v.name}`);
  fits(CRAFT.rare.cost, 6, 'редкое оснащение');
  fits(OUTPOST.buildCost, OUTPOST.hqFirst, 'передовой пункт');
  for (let l = 1; l < OUTPOST.maxLevel; l++) fits(OUTPOST.upgradeCost(l), OUTPOST.hqFirst + 1, `пункт ${l}→${l + 1}`);
});

test('таймеры: первые минуты быстрые, верхние уровни — до суток', () => {
  assert.ok(buildingUpgradeTime('hq', 1) <= 120, 'первое улучшение штаба — пара минут');
  assert.ok(buildingUpgradeTime('hq', 9) <= 32 * 3600, 'последний уровень штаба — не больше ~полутора суток');
  assert.ok(buildingUpgradeTime('hq', 9) >= 12 * 3600, 'последний уровень штаба — не меньше полусуток');
  for (const k of BUILDING_KEYS) {
    for (let l = 1; l < MAX_BUILDING_LEVEL - 1; l++) assert.ok(buildingUpgradeTime(k, l + 1) > buildingUpgradeTime(k, l), `${k}: время растёт`);
    assert.ok(buildingUpgradeTime(k, MAX_BUILDING_LEVEL - 1) <= 32 * 3600, `${k}: последний уровень ≤ ~полутора суток`);
  }
  assert.ok(OPERATORS.scout.time <= 60, 'первый разведчик — за минуту (обучение)');
  assert.ok(SECTORS[0].baseTime * MISSIONS.recon.timeMul <= 180, 'первая вылазка короткая');
  for (const s of SECTORS) assert.ok(s.baseTime * MISSIONS.expedition.timeMul <= 16 * 3600, `экспедиция в «${s.name}» не дольше 16 ч`);
});

test('опыт и награды растут', () => {
  for (let i = 1; i < XP_THRESHOLDS.length; i++) assert.ok(XP_THRESHOLDS[i] > XP_THRESHOLDS[i - 1]);
  for (let d = 1; d < 6; d++) assert.ok((missionRewards('raid', d + 1).supplies ?? 0) > (missionRewards('raid', d).supplies ?? 0));
});

test('привязки к уровню командира достижимы и не обгоняют друг друга', () => {
  for (let l = 1; l < MAX_BUILDING_LEVEL; l++) assert.ok(hqCommanderLevel(l) <= COMMANDER_MAX_LEVEL && hqCommanderLevel(l) <= l, `КП ${l}→${l + 1}`);
  assert.equal(hqCommanderLevel(1), 1, 'первое улучшение штаба — сразу');
  for (let i = 1; i < CHAPTERS.length; i++) assert.ok(CHAPTERS[i].minLevel >= CHAPTERS[i - 1].minLevel);
  assert.equal(chapterLockLevel(CAMPAIGN[0], 1), 0, 'первая глава открыта сразу');
  assert.ok(CHAPTERS.every((c) => c.minLevel <= COMMANDER_MAX_LEVEL));
});
