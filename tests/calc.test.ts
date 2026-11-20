import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planExpedition, resolveExpedition, PlanInput } from '../shared/calc.js';
import { SECTORS, OPERATOR_TYPES, OperatorType, buildingUpgradeCost, storageCap, BUILDING_KEYS, MAX_BUILDING_LEVEL } from '../shared/config.js';

const ranks = Object.fromEntries(OPERATOR_TYPES.map((t) => [t, 1])) as Record<OperatorType, number>;
const base = (over: Partial<PlanInput> = {}): PlanInput => ({
  sector: SECTORS[0], mission: 'raid', group: { scout: 2, fpv: 1 }, ranks,
  vehicle: { type: 'moto', level: 1 }, equipment: [], skills: {}, commsLevel: 1, sectorRecon: 0, ...over,
});

test('итог детерминирован при одном и том же случайном факторе', () => {
  const inp = base();
  const plan = planExpedition(inp);
  assert.deepEqual(resolveExpedition(inp, plan, 12345), resolveExpedition(inp, plan, 12345));
});

test('каждое оснащение, транспорт и навык влияют на расчёт', () => {
  const p0 = planExpedition(base());
  assert.ok(planExpedition(base({ equipment: [{ type: 'nsu', rarity: 'common', level: 1 }] })).power > p0.power, 'НСУ');
  assert.ok(planExpedition(base({ equipment: [{ type: 'reb', rarity: 'common', level: 1 }] })).lossMul < p0.lossMul, 'РЭБ');
  assert.ok(planExpedition(base({ mission: 'recon', equipment: [{ type: 'commkit', rarity: 'common', level: 1 }] })).reconScore > planExpedition(base({ mission: 'recon' })).reconScore, 'связь');
  assert.ok(planExpedition(base({ equipment: [{ type: 'repairkit', rarity: 'common', level: 1 }] })).fieldRecovery > 0, 'ремкомплект');
  assert.ok(planExpedition(base({ vehicle: { type: 'ebike', level: 1 } })).cost.fuel! < p0.cost.fuel!, 'электровелосипед');
  assert.ok(planExpedition(base({ vehicle: { type: 'bukhanka', level: 1 } })).capacity > p0.capacity, 'буханка');
  assert.ok(planExpedition(base()).duration < planExpedition(base({ vehicle: { type: 'ebike', level: 1 } })).duration, 'мотоцикл');
  const skills: Record<string, (p: ReturnType<typeof planExpedition>) => number> = {
    cohesion: (p) => p.capacity, resilience: (p) => -p.lossMul, analytics: (p) => p.dataMul, observation: (p) => -p.uncertainty,
    economy: (p) => -(p.cost.fuel! + p.cost.supplies!), trophies: (p) => p.rewardMul,
  };
  for (const [k, f] of Object.entries(skills)) assert.ok(f(planExpedition(base({ skills: { [k]: 1 } }))) > f(p0), k);
  assert.ok(planExpedition(base({ sectorRecon: 100, skills: { deepRecon: 1 } })).power > planExpedition(base({ sectorRecon: 100 })).power, 'deepRecon');
});

test('ранний этап: без безвозвратных потерь и не больше половины группы', () => {
  for (let seed = 1; seed < 400; seed++) {
    const inp = base({ group: { scout: 4 }, sector: SECTORS[1] });
    const r = resolveExpedition(inp, planExpedition(inp), seed);
    assert.equal(r.totalLost, 0);
    assert.ok(r.totalWounded + r.totalFieldRecovered <= 2);
  }
});

test('первая разведка обученной группой гарантированно успешна', () => {
  const inp = base({ mission: 'recon', group: { scout: 3 }, vehicle: { type: 'ebike', level: 1 } });
  const plan = planExpedition(inp);
  assert.ok(plan.outcomeLow === 'success' || plan.outcomeLow === 'decisive', plan.outcomeLow);
  assert.ok(plan.duration <= 180);
});

test('хранилище вмещает цену следующего улучшения на каждом уровне', () => {
  for (const k of BUILDING_KEYS)
    for (let l = 1; l < MAX_BUILDING_LEVEL; l++) {
      const c = buildingUpgradeCost(k, l);
      assert.ok((c.supplies ?? 0) <= storageCap(l), `${k} ${l}`);
    }
});

test('наградное чуть сильнее стандартного', () => {
  const p = (over: Partial<PlanInput>) => planExpedition(base(over));
  const imp = (type: 'nsu' | 'reb' | 'commkit') => [{ type, rarity: 'improved' as const, level: 1 }];
  const aw = (type: 'nsuRubicon' | 'rebNew' | 'mavicField' | 'pigGear' | 'fpvBoevye') => [{ type, rarity: 'award' as const, level: 1 }];
  assert.ok(p({ equipment: aw('nsuRubicon') }).power > p({ equipment: imp('nsu') }).power, 'НСУ Рубикона');
  assert.ok(p({ equipment: aw('rebNew') }).lossMul < p({ equipment: imp('reb') }).lossMul, 'РЭБ нового образца');
  assert.ok(p({ mission: 'recon', equipment: aw('mavicField') }).reconScore > p({ mission: 'recon', equipment: imp('commkit') }).reconScore, 'Mavic');
  const pig = p({ equipment: aw('pigGear') });
  assert.ok(pig.lossMul < p({}).lossMul && pig.power > p({}).power, 'снаряжение со свиньи');
  assert.ok(p({ equipment: aw('fpvBoevye') }).power > p({}).power, 'FPV на боевые');
  const niva = p({ vehicle: { type: 'niva', level: 1 } });
  const bukh = p({ vehicle: { type: 'bukhanka', level: 1 } });
  assert.ok(niva.capacity > bukh.capacity && niva.cost.fuel! <= bukh.cost.fuel! && niva.duration < bukh.duration && niva.rewardMul > bukh.rewardMul, 'Нива лучше Буханки');
  const gyro = p({ mission: 'recon', vehicle: { type: 'gyro', level: 1 } });
  const ebike = p({ mission: 'recon', vehicle: { type: 'ebike', level: 1 } });
  assert.ok(gyro.cost.fuel! <= ebike.cost.fuel! && gyro.reconScore > ebike.reconScore, 'гироскутер');
  const vet = p({ group: { veteran: 1, scout: 2 } });
  const fpv = p({ group: { fpv: 1, scout: 2 } });
  assert.ok(vet.power > fpv.power && vet.lossMul < fpv.lossMul, 'бывший штурмовик');
});
