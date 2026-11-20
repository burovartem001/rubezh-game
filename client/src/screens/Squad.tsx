import React, { useEffect, useState } from 'react';
import {
  CRAFT, EQUIPMENT, EQUIPMENT_LIMIT, EQUIPMENT_TYPES, EquipmentType, MAX_EQUIPMENT_LEVEL, MAX_RANK, MAX_VEHICLE_LEVEL, OPERATORS, OPERATOR_TYPES,
  OperatorType, RANK_BONUS, RARITIES, RARITY_NAMES, Rarity, TRAIN_QUEUE_LIMIT, VEHICLES, VEHICLE_REPAIR_TIME, VEHICLE_TYPES, WORKSHOP_QUEUE_LIMIT,
  WORKSHOP_RARITY_LEVEL, equipmentEffectText, equipmentUpgradeCost, operatorUnlocked, rankRequiredTraining, rankUpgradeCost, rankUpgradeTime,
  recoveryCost, recoveryTime, trainTime, vehicleBonusText, vehicleRepairCost, vehicleUpgradeCost, vehicleUpgradeRequiredWorkshop, vehicleUpgradeTime,
} from '../../../shared/config';
import { useGame } from '../game';
import { Button, CostLine, Sprite, fmtLong, useAffordable } from '../ui';
import { JobRow } from '../components/Queues';

type SubTab = 'operators' | 'vehicles' | 'equipment';

export function SquadScreen() {
  const { nav } = useGame();
  const initial: SubTab = nav.focus === 'equipment' ? 'equipment' : nav.focus === 'ebike' || nav.focus === 'vehicles' ? 'vehicles' : 'operators';
  const [tab, setTab] = useState<SubTab>(initial);
  useEffect(() => setTab(initial), [nav]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="seg big" role="tablist">
        {(
          [
            ['operators', 'Операторы'],
            ['vehicles', 'Транспорт'],
            ['equipment', 'Оснащение'],
          ] as [SubTab, string][]
        ).map(([k, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {n}
          </button>
        ))}
      </div>
      {tab === 'operators' && <Operators />}
      {tab === 'vehicles' && <Vehicles />}
      {tab === 'equipment' && <Equipment />}
    </>
  );
}

function Operators() {
  const { state, act, nav } = useGame();
  const affordable = useAffordable();
  const tl = state.buildings.training;
  const trainJobs = state.jobs.filter((j) => j.queue === 'train');
  const recJobs = state.jobs.filter((j) => j.queue === 'recovery');
  const wounded = Object.fromEntries(OPERATOR_TYPES.map((t) => [t, state.operators[t].wounded])) as Record<OperatorType, number>;
  const totalWounded = OPERATOR_TYPES.reduce((s, t) => s + wounded[t], 0);
  const medic = state.commander.skills.medic ?? 0;
  const total = OPERATOR_TYPES.reduce((s, t) => s + state.operators[t].available, 0);
  const queueFull = trainJobs.length >= TRAIN_QUEUE_LIMIT;
  return (
    <>
      <div className="section-head">
        <h2>Личный состав · {total} доступно</h2>
        <span className="muted small">Центр подготовки ур. {tl}</span>
      </div>
      {(trainJobs.length > 0 || recJobs.length > 0) && (
        <section className="panel">
          <h3>Очередь подготовки · {trainJobs.length}/{TRAIN_QUEUE_LIMIT}</h3>
          {trainJobs.map((j) => (
            <JobRow key={j.id} j={j} />
          ))}
          {recJobs.map((j) => (
            <JobRow key={j.id} j={j} />
          ))}
        </section>
      )}
      {totalWounded > 0 && (
        <section className="panel warn">
          <h3>Ранены: {totalWounded}</h3>
          <p className="muted small">
            {OPERATOR_TYPES.filter((t) => wounded[t]).map((t) => `${OPERATORS[t].name} — ${wounded[t]}`).join(', ')}. Раненые не участвуют в походах, пока не пройдут восстановление.
          </p>
          <div className="between">
            <span>
              <CostLine cost={recoveryCost(wounded, medic)} /> · {fmtLong(recoveryTime(totalWounded, medic))}
            </span>
          </div>
          <Button onClick={() => act('recover')} disabled={!affordable(recoveryCost(wounded, medic))} why="Не хватает припасов">
            Восстановить всех
          </Button>
        </section>
      )}
      <div className="cards">
        {OPERATOR_TYPES.map((t) => {
          const d = OPERATORS[t];
          const o = state.operators[t];
          const unlocked = operatorUnlocked(t, tl, state.buildings.hq);
          const inTrain = trainJobs.filter((j) => j.kind === 'train' && j.payload.type === t).reduce((s, j) => s + j.payload.count, 0);
          const time = trainTime(t, tl);
          const nextRank = o.rank + 1;
          const rankJob = trainJobs.find((j) => j.kind === 'rank' && j.payload.type === t);
          const rankCost = rankUpgradeCost(t, nextRank);
          let rankWhy = '';
          if (o.rank >= MAX_RANK) rankWhy = 'Максимальный ранг';
          else if (rankJob) rankWhy = 'Повышение уже в очереди';
          else if (tl < rankRequiredTraining(nextRank)) rankWhy = `Нужен центр подготовки ${rankRequiredTraining(nextRank)} ур.`;
          else if (!affordable(rankCost)) rankWhy = 'Не хватает ресурсов';
          return (
            <article key={t} className={`card unit ${unlocked ? '' : 'locked'}`} data-focus={nav.focus === t}>
              <Sprite img="operators" index={d.sprite} className="portrait" />
              <div className="card-body">
                <div className="between">
                  <h3>{d.name}</h3>
                  <span className="tag">ранг {o.rank}</span>
                </div>
                <p className="small">{d.role}</p>
                <p className="tiny muted">
                  <span className="olive">+ {d.strong}</span>
                  <br />
                  <span className="red">− {d.weak}</span>
                </p>
                <div className="counts">
                  <span>
                    <b>{o.available}</b> доступны
                  </span>
                  <span>
                    <b>{o.on_mission}</b> в походе
                  </span>
                  <span>
                    <b>{o.wounded + o.recovering}</b> ранены/восст.
                  </span>
                  {o.lost_total > 0 && (
                    <span className="red">
                      <b>{o.lost_total}</b> потеряно
                    </span>
                  )}
                  {inTrain > 0 && (
                    <span className="amber">
                      <b>{inTrain}</b> в обучении
                    </span>
                  )}
                </div>
                <div className="tiny muted">
                  Сила {d.power} · разведка {d.recon} · припасы на поход {d.upkeep}
                </div>
                {unlocked ? (
                  <>
                    <div className="spec small">
                      <span>Подготовка</span>
                      <span>
                        <CostLine cost={d.cost} /> · {fmtLong(time)}
                      </span>
                    </div>
                    <div className="row">
                      <Button small onClick={() => act('train', { type: t, count: 1 })} disabled={queueFull || !affordable(d.cost)} why={queueFull ? 'Очередь заполнена' : 'Не хватает ресурсов'}>
                        Обучить ×1
                      </Button>
                      <Button small kind="secondary" onClick={() => act('train', { type: t, count: 5 })} disabled={queueFull || !affordable(d.cost, 5)}>
                        ×5
                      </Button>
                    </div>
                    {o.rank < MAX_RANK && (
                      <div className="spec small">
                        <span>
                          Ранг {nextRank}: +{Math.round(RANK_BONUS * 100)}% к силе и разведке
                        </span>
                        <span>
                          <CostLine cost={rankCost} /> · {fmtLong(rankUpgradeTime(nextRank, tl))}
                        </span>
                      </div>
                    )}
                    <Button small kind="secondary" onClick={() => act('rankUp', { type: t })} disabled={!!rankWhy} why={rankWhy}>
                      Повысить ранг
                    </Button>
                  </>
                ) : (
                  <div className="warn-box small">
                    Откроется: центр подготовки {d.unlock.training} ур.{d.unlock.hq ? `, командный пункт ${d.unlock.hq} ур.` : ''}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function Vehicles() {
  const { state, act, nav } = useGame();
  const affordable = useAffordable();
  const wsJobs = state.jobs.filter((j) => j.queue === 'workshop');
  const wsFull = wsJobs.length >= WORKSHOP_QUEUE_LIMIT;
  return (
    <>
      <div className="section-head">
        <h2>Автопарк</h2>
        <span className="muted small">В походе используется один транспорт</span>
      </div>
      {wsJobs.length > 0 && (
        <section className="panel">
          <h3>Мастерская · {wsJobs.length}/{WORKSHOP_QUEUE_LIMIT}</h3>
          {wsJobs.map((j) => (
            <JobRow key={j.id} j={j} />
          ))}
        </section>
      )}
      <div className="cards">
        {VEHICLE_TYPES.map((t) => {
          const d = VEHICLES[t];
          const v = state.vehicles[t];
          const pending = wsJobs.find((j) => j.kind === 'vehicle_acquire' && j.payload.type === t);
          let body: React.ReactNode;
          if (!v) {
            const locked = state.buildings.hq < d.unlockHq;
            body = (
              <>
                <p className="small">Бонус: {vehicleBonusText(t, 1)}</p>
                {locked ? (
                  <div className="warn-box small">Откроется на командном пункте {d.unlockHq} уровня</div>
                ) : pending ? (
                  <p className="amber small">Готовится в мастерской…</p>
                ) : (
                  <>
                    <div className="spec small">
                      <span>Получить</span>
                      <span>
                        <CostLine cost={d.acquireCost} /> · {fmtLong(d.acquireTime)}
                      </span>
                    </div>
                    <Button small onClick={() => act('acquireVehicle', { type: t })} disabled={wsFull || !affordable(d.acquireCost)} why={wsFull ? 'Очередь мастерской заполнена' : 'Не хватает ресурсов'}>
                      Получить
                    </Button>
                  </>
                )}
              </>
            );
          } else {
            const status = { ready: 'готов', mission: 'в походе', damaged: 'повреждён', workshop: 'в мастерской' }[v.status];
            const upCost = vehicleUpgradeCost(v.level);
            const needWs = vehicleUpgradeRequiredWorkshop(v.level + 1);
            let upWhy = '';
            if (v.level >= MAX_VEHICLE_LEVEL) upWhy = 'Максимальный уровень';
            else if (v.status !== 'ready') upWhy = `Сейчас: ${status}`;
            else if (state.buildings.workshop < needWs) upWhy = `Нужна мастерская ${needWs} ур.`;
            else if (wsFull) upWhy = 'Очередь мастерской заполнена';
            else if (!affordable(upCost)) upWhy = 'Не хватает ресурсов';
            body = (
              <>
                <p className="small">
                  Ур. {v.level} · <span className={v.status === 'damaged' ? 'red' : v.status === 'ready' ? 'olive' : 'amber'}>{status}</span>
                </p>
                <p className="small">Бонус: {vehicleBonusText(t, v.level)}</p>
                {v.status === 'damaged' && (
                  <>
                    <div className="spec small">
                      <span>Ремонт</span>
                      <span>
                        <CostLine cost={vehicleRepairCost(v.level)} /> · {fmtLong(VEHICLE_REPAIR_TIME)}
                      </span>
                    </div>
                    <Button small onClick={() => act('repairVehicle', { type: t })} disabled={wsFull || !affordable(vehicleRepairCost(v.level))} why={wsFull ? 'Очередь мастерской заполнена' : 'Не хватает ресурсов'}>
                      Отремонтировать
                    </Button>
                  </>
                )}
                {v.level < MAX_VEHICLE_LEVEL && (
                  <div className="spec small">
                    <span>Ур. {v.level + 1}: {vehicleBonusText(t, v.level + 1)}</span>
                    <span>
                      <CostLine cost={upCost} /> · {fmtLong(vehicleUpgradeTime(v.level))}
                    </span>
                  </div>
                )}
                <Button small kind="secondary" onClick={() => act('upgradeVehicle', { type: t })} disabled={!!upWhy} why={upWhy}>
                  Улучшить
                </Button>
              </>
            );
          }
          return (
            <article key={t} className="card unit" data-focus={nav.focus === t}>
              <Sprite img="vehicles" index={d.sprite} className="vehicle" focusY={60} />
              <div className="card-body">
                <h3>{d.name}</h3>
                <p className="muted small">{d.purpose}</p>
                {body}
              </div>
            </article>
          );
        })}
        <article className="card unit locked">
          <Sprite img="vehicles" index={3} className="vehicle" focusY={60} />
          <div className="card-body">
            <h3>Пикап</h3>
            <p className="muted small">Экспедиции и вывоз наград: больше допустимый объём добычи.</p>
            <div className="warn-box small">Появится на следующем этапе развития игры</div>
          </div>
        </article>
      </div>
    </>
  );
}

function Equipment() {
  const { state, act } = useGame();
  const affordable = useAffordable();
  const ws = state.buildings.workshop;
  const [rarity, setRarity] = useState<Rarity>('common');
  const wsJobs = state.jobs.filter((j) => j.queue === 'workshop');
  const pendingCraft = wsJobs.filter((j) => j.kind === 'craft').length;
  const full = state.equipment.length + pendingCraft >= EQUIPMENT_LIMIT;
  const wsFull = wsJobs.length >= WORKSHOP_QUEUE_LIMIT;
  return (
    <>
      <div className="section-head">
        <h2>
          Склад оснащения · {state.equipment.length}/{EQUIPMENT_LIMIT}
        </h2>
        <span className="muted small">В группу — до двух предметов разных типов</span>
      </div>
      {state.equipment.length === 0 && <p className="muted">Пока пусто. Первый предмет выдаётся в обучении, остальные — из мастерской и походов.</p>}
      <div className="eq-list">
        {state.equipment.map((e) => {
          const cost = equipmentUpgradeCost(e.rarity, e.level);
          const why = e.level >= MAX_EQUIPMENT_LEVEL ? 'Максимальный уровень' : e.status !== 'ready' ? 'В походе' : !affordable(cost) ? 'Не хватает ресурсов' : '';
          return (
            <div key={e.id} className={`eq rarity-${e.rarity}`}>
              <div className="eq-icon" aria-hidden>
                {EQUIPMENT[e.type].icon}
              </div>
              <div className="eq-body">
                <div className="between">
                  <b>{EQUIPMENT[e.type].name}</b>
                  <span className={`tag r-${e.rarity}`}>{RARITY_NAMES[e.rarity]}</span>
                </div>
                <div className="small">
                  Ур. {e.level} · {equipmentEffectText(e.type, e.rarity, e.level)}
                </div>
                <div className="tiny muted">
                  {e.status === 'mission' ? 'в походе' : 'на складе'} · источник: {e.source}
                  {e.level < MAX_EQUIPMENT_LEVEL && (
                    <>
                      {' '}· ур. {e.level + 1}: {equipmentEffectText(e.type, e.rarity, e.level + 1)}
                    </>
                  )}
                </div>
                <div className="row">
                  {e.level < MAX_EQUIPMENT_LEVEL && (
                    <span className="small">
                      <CostLine cost={cost} />
                    </span>
                  )}
                  <Button small kind="secondary" onClick={() => act('upgradeEquipment', { id: e.id })} disabled={!!why} why={why}>
                    Улучшить
                  </Button>
                  <Button
                    small
                    kind="danger"
                    disabled={e.status !== 'ready'}
                    onClick={() => {
                      if (confirm(`Разобрать «${EQUIPMENT[e.type].name}»? Вернётся половина комплектующих.`)) act('dismantleEquipment', { id: e.id });
                    }}
                  >
                    Разобрать
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <section className="panel">
        <h2>Мастерская БПЛА · ур. {ws}</h2>
        {wsJobs.map((j) => (
          <JobRow key={j.id} j={j} />
        ))}
        <div className="seg">
          {RARITIES.map((r) => (
            <button key={r} className={rarity === r ? 'on' : ''} onClick={() => setRarity(r)}>
              {RARITY_NAMES[r]}
              {ws < WORKSHOP_RARITY_LEVEL[r] ? ` · ур. ${WORKSHOP_RARITY_LEVEL[r]}` : ''}
            </button>
          ))}
        </div>
        <p className="small">
          Сборка: <CostLine cost={CRAFT[rarity].cost} /> · {fmtLong(CRAFT[rarity].time)}
        </p>
        <div className="eq-list">
          {EQUIPMENT_TYPES.map((t: EquipmentType) => {
            let why = '';
            if (ws < WORKSHOP_RARITY_LEVEL[rarity]) why = `Нужна мастерская ${WORKSHOP_RARITY_LEVEL[rarity]} уровня`;
            else if (full) why = 'Склад оснащения заполнен';
            else if (wsFull) why = 'Очередь мастерской заполнена';
            else if (!affordable(CRAFT[rarity].cost)) why = 'Не хватает ресурсов';
            return (
              <div key={t} className="eq">
                <div className="eq-icon" aria-hidden>
                  {EQUIPMENT[t].icon}
                </div>
                <div className="eq-body">
                  <b>{EQUIPMENT[t].name}</b>
                  <div className="small">{equipmentEffectText(t, rarity, 1)}</div>
                  <Button small onClick={() => act('craft', { type: t, rarity })} disabled={!!why} why={why}>
                    Собрать
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
