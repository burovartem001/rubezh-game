import React, { useEffect, useState } from 'react';
import {
  CRAFT, EQUIPMENT, EQUIPMENT_LIMIT, EQUIPMENT_TYPES, EquipmentType, MAX_EQUIPMENT_LEVEL, MAX_RANK, MAX_VEHICLE_LEVEL, OPERATORS, OPERATOR_TYPES,
  OperatorType, RANK_BONUS, RARITIES, RARITY_NAMES, CraftRarity, TRAIN_QUEUE_LIMIT, VEHICLES, VEHICLE_REPAIR_TIME, VEHICLE_TYPES, WORKSHOP_QUEUE_LIMIT,
  WORKSHOP_RARITY_LEVEL, equipmentEffectText, equipmentUpgradeCost, operatorUnlocked, rankRequiredTraining, rankUpgradeCost, rankUpgradeTime,
  recoveryCost, recoveryTime, trainTime, vehicleBonusText, vehicleRepairCost, vehicleUpgradeCost, vehicleUpgradeRequiredWorkshop, vehicleUpgradeTime,
} from '../../../shared/config';
import { EMPTY, EQUIPMENT_LORE, OPERATOR_LORE, VEHICLE_LORE } from '../../../shared/lore';
import { AWARD_EQUIPMENT, AWARD_SOURCE_NAME } from '../../../shared/config';
import { useGame } from '../game';
import { Button, CostLine, Sprite, fmtLong, useAffordable } from '../ui';
import { JobRow } from '../components/Queues';
import { Icon } from '../art/icons';
import { Speech, VehicleArt } from '../art/art';
import { Memorial, SoldierRoster } from './Long';
import { EquipmentWear, ModelsPanel } from './Deep';
import { costScale, instructorMulOf, recoveryMulOf, repairMul, vehicleUpgradeMul, workshopMulAt } from '../../../shared/deepcalc';
import { composeParts } from '../../../shared/progression';
import { BUILDING_FX } from '../../../shared/content';

type SubTab = 'operators' | 'vehicles' | 'equipment';

export function SquadScreen() {
  const { nav, state } = useGame();
  const initial: SubTab = nav.focus === 'equipment' ? 'equipment' : nav.focus === 'ebike' || nav.focus === 'vehicles' ? 'vehicles' : 'operators';
  const [tab, setTab] = useState<SubTab>(initial);
  useEffect(() => setTab(initial), [nav]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = OPERATOR_TYPES.reduce((s, t) => s + state.operators[t].available + state.operators[t].on_mission, 0);
  const tabs: [SubTab, string, string, number][] = [
    ['operators', 'Бойцы', 'squad', total],
    ['vehicles', 'Автопарк', 'bukhanka', Object.keys(state.vehicles).length],
    ['equipment', 'Оснащение', 'repairkit', state.equipment.length],
  ];
  return (
    <>
      <div className="seg big icons" role="tablist">
        {tabs.map(([k, n, ic, c]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            <Icon name={ic} size={20} />
            <span>{n}</span>
            <em>{c}</em>
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
  const recMul = recoveryMulOf(composeParts(state.modParts).mods.recovery);
  const recCost = { supplies: Math.round((recoveryCost(wounded, medic).supplies ?? 0) * recMul) };
  const instrMul = instructorMulOf(state.soldiers);
  const queueFull = trainJobs.length >= TRAIN_QUEUE_LIMIT;
  return (
    <>
      {(trainJobs.length > 0 || recJobs.length > 0) && (
        <section className="panel">
          <h3>
            <Icon name="training" size={18} /> На площадке · {trainJobs.length}/{TRAIN_QUEUE_LIMIT}
          </h3>
          {trainJobs.map((j) => <JobRow key={j.id} j={j} />)}
          {recJobs.map((j) => <JobRow key={j.id} j={j} />)}
        </section>
      )}
      {totalWounded > 0 && (
        <section className="panel warn">
          <Speech
            who="batya"
            compact
            action={
              <div className="row">
                <span className="small">
                  <CostLine cost={recCost} /> · <Icon name="clock" size={14} /> {fmtLong(Math.round(recoveryTime(totalWounded, medic) * recMul))}
                </span>
                <Button small onClick={() => act('recover')} disabled={!affordable(recCost)} why="Не хватает припасов">
                  <Icon name="cross" size={16} /> Подлатать всех
                </Button>
              </div>
            }
          >
            В медпункте {totalWounded}: {OPERATOR_TYPES.filter((t) => wounded[t]).map((t) => `${OPERATORS[t].name.toLowerCase()} — ${wounded[t]}`).join(', ')}. Пока не отлежатся, в поход не пущу.
          </Speech>
        </section>
      )}
      <div className="cards">
        {OPERATOR_TYPES.map((t) => {
          const d = OPERATORS[t];
          const lore = OPERATOR_LORE[t];
          const o = state.operators[t];
          const award = !!d.award;
          const owned = o.available + o.on_mission + o.wounded + o.recovering > 0;
          const unlocked = award ? owned : operatorUnlocked(t, tl, state.buildings.hq);
          const inTrain = trainJobs.filter((j) => j.kind === 'train' && j.payload.type === t).reduce((s, j) => s + j.payload.count, 0);
          const time = Math.round(trainTime(t, tl) * instrMul);
          const nextRank = o.rank + 1;
          const rankJob = trainJobs.find((j) => j.kind === 'rank' && j.payload.type === t);
          const rankCost = rankUpgradeCost(t, nextRank);
          let rankWhy = '';
          if (o.rank >= MAX_RANK) rankWhy = 'Выше некуда';
          else if (rankJob) rankWhy = 'Уже тренируются';
          else if (tl < rankRequiredTraining(nextRank)) rankWhy = `Нужен центр подготовки ${rankRequiredTraining(nextRank)} ур.`;
          else if (!affordable(rankCost)) rankWhy = 'Не хватает ресурсов';
          return (
            <article key={t} className={`hero-card ${unlocked ? '' : 'locked'} ${award ? 'award' : ''}`} data-focus={nav.focus === t}>
              <div className="hero-art">
                <Sprite img="operators" index={d.sprite} className="hero-img" focusY={10} />
                <span className="hero-rank">
                  {Array.from({ length: MAX_RANK }, (_, i) => (
                    <i key={i} className={i < o.rank ? 'on' : ''} />
                  ))}
                </span>
                {award && (
                  <span className="award-ribbon">
                    <Icon name="medal" size={14} /> за заслуги
                  </span>
                )}
                {!unlocked && (
                  <span className="hero-lock">
                    <Icon name={award ? 'medal' : 'lock'} size={28} />
                  </span>
                )}
              </div>
              <div className="hero-body">
                <span className="kicker">{lore.nick}</span>
                <h3>
                  <Icon name={t} size={18} /> {d.name}
                </h3>
                <p className="small">{lore.story}</p>
                <p className="quote">{lore.quote}</p>
                <div className="stat-chips">
                  <span className="sc ok" title="Готовы к походу"><Icon name="check" size={14} /> {o.available}</span>
                  <span className="sc" title="В походе"><Icon name="map" size={14} /> {o.on_mission}</span>
                  <span className="sc warn" title="Ранены и на восстановлении"><Icon name="cross" size={14} /> {o.wounded + o.recovering}</span>
                  {o.lost_total > 0 && <span className="sc bad" title="Безвозвратные потери"><Icon name="skull" size={14} /> {o.lost_total}</span>}
                  {inTrain > 0 && <span className="sc gold" title="В обучении"><Icon name="training" size={14} /> +{inTrain}</span>}
                </div>
                <div className="power-row tiny">
                  <span><Icon name="raid" size={13} /> сила {d.power}</span>
                  <span><Icon name="recon" size={13} /> разведка {d.recon}</span>
                  <span><Icon name="supplies" size={13} /> паёк {d.upkeep}</span>
                </div>
                {unlocked ? (
                  <>
                    {!award && (
                    <div className="train-row">
                      <span className="small">
                        <CostLine cost={d.cost} /> · <Icon name="clock" size={14} /> {fmtLong(time)}
                      </span>
                      <div className="row">
                        <Button small onClick={() => act('train', { type: t, count: 1 })} disabled={queueFull || !affordable(d.cost)} why={queueFull ? 'Площадка занята' : 'Не хватает ресурсов'}>
                          <Icon name="plus" size={16} /> Обучить
                        </Button>
                        <Button small kind="secondary" onClick={() => act('train', { type: t, count: 5 })} disabled={queueFull || !affordable(d.cost, 5)}>
                          ×5
                        </Button>
                      </div>
                    </div>
                    )}
                    {o.rank < MAX_RANK && (
                      <details className="rank-up">
                        <summary>
                          <Icon name="up" size={15} /> Ранг {nextRank}: +{Math.round(RANK_BONUS * 100)}% к силе и разведке
                        </summary>
                        <div className="small">
                          <CostLine cost={rankCost} /> · <Icon name="clock" size={14} /> {fmtLong(Math.round(rankUpgradeTime(nextRank, tl) * instrMul))}
                        </div>
                        <Button small kind="secondary" onClick={() => act('rankUp', { type: t })} disabled={!!rankWhy} why={rankWhy}>
                          Тренировать
                        </Button>
                      </details>
                    )}
                  </>
                ) : (
                  award ? (
                    <div className="award-box small">
                      <Icon name="medal" size={16} /> Не обучается: приходит в отряд только за особые заслуги — {AWARD_SOURCE_NAME}.
                    </div>
                  ) : (
                    <div className="warn-box small">
                      <Icon name="lock" size={14} /> Откроется: центр подготовки {d.unlock.training} ур.{d.unlock.hq ? `, командный пункт ${d.unlock.hq} ур.` : ''}
                    </div>
                  )
                )}
                <SoldierRoster type={t} />
              </div>
            </article>
          );
        })}
      </div>
      <Memorial />
    </>
  );
}

function Vehicles() {
  const { state, act, nav, now } = useGame();
  const affordable = useAffordable();
  const wsJobs = state.jobs.filter((j) => j.queue === 'workshop');
  const wsFull = wsJobs.length >= WORKSHOP_QUEUE_LIMIT;
  return (
    <>
      {wsJobs.length > 0 && (
        <section className="panel">
          <h3>
            <Icon name="workshop" size={18} /> В мастерской · {wsJobs.length}/{WORKSHOP_QUEUE_LIMIT}
          </h3>
          {wsJobs.map((j) => <JobRow key={j.id} j={j} />)}
        </section>
      )}
      <div className="cards">
        {VEHICLE_TYPES.map((t) => {
          const d = VEHICLES[t];
          const v = state.vehicles[t];
          const pending = wsJobs.find((j) => j.kind === 'vehicle_acquire' && j.payload.type === t);
          const status = v ? { ready: 'на ходу', mission: 'в походе', damaged: 'сломан', workshop: 'в мастерской' }[v.status] : '';
          let body: React.ReactNode;
          if (!v) {
            const locked = state.buildings.hq < d.unlockHq;
            const needPool = t === 'pickup' && (state.buildings.motorpool ?? 0) < BUILDING_FX.motorpool.pickupLevel;
            body = d.award ? (
              <div className="award-box small"><Icon name="medal" size={16} /> Не строится и не покупается: выдаётся за особые заслуги — {AWARD_SOURCE_NAME}.</div>
            ) : locked ? (
              <div className="warn-box small"><Icon name="lock" size={14} /> Появится, когда командный пункт дорастёт до {d.unlockHq} уровня</div>
            ) : needPool ? (
              <div className="warn-box small"><Icon name="lock" size={14} /> Нужен автопарк {BUILDING_FX.motorpool.pickupLevel} уровня — там под пикап освободят бокс</div>
            ) : pending ? (
              <p className="amber small"><Icon name="wrench" size={14} /> Батя уже возится с ним в мастерской…</p>
            ) : (
              <div className="train-row">
                <span className="small"><CostLine cost={d.acquireCost} /> · <Icon name="clock" size={14} /> {fmtLong(d.acquireTime)}</span>
                <Button small onClick={() => act('acquireVehicle', { type: t })} disabled={wsFull || !affordable(d.acquireCost)} why={wsFull ? 'Мастерская занята' : 'Не хватает ресурсов'}>
                  <Icon name="plus" size={16} /> Получить
                </Button>
              </div>
            );
          } else {
            const upCost = costScale(vehicleUpgradeCost(v.level), vehicleUpgradeMul(state.buildings.motorpool ?? 0));
            const repCost = costScale(vehicleRepairCost(v.level), repairMul(state.buildings.repairyard ?? 0, now));
            const needWs = vehicleUpgradeRequiredWorkshop(v.level + 1);
            let upWhy = '';
            if (v.level >= MAX_VEHICLE_LEVEL) upWhy = 'Лучше уже не сделать';
            else if (v.status !== 'ready') upWhy = `Сейчас ${status}`;
            else if (state.buildings.workshop < needWs) upWhy = `Нужна мастерская ${needWs} ур.`;
            else if (wsFull) upWhy = 'Мастерская занята';
            else if (!affordable(upCost)) upWhy = 'Не хватает ресурсов';
            body = (
              <>
                {v.status === 'damaged' && (
                  <div className="train-row">
                    <span className="small red"><Icon name="alert" size={14} /> Нужен ремонт: <CostLine cost={repCost} /> · {fmtLong(VEHICLE_REPAIR_TIME)}</span>
                    <Button small onClick={() => act('repairVehicle', { type: t })} disabled={wsFull || !affordable(repCost)} why={wsFull ? 'Мастерская занята' : 'Не хватает ресурсов'}>
                      <Icon name="wrench" size={16} /> Починить
                    </Button>
                  </div>
                )}
                {v.level < MAX_VEHICLE_LEVEL && (
                  <details className="rank-up">
                    <summary><Icon name="up" size={15} /> Уровень {v.level + 1}: {vehicleBonusText(t, v.level + 1)}</summary>
                    <div className="small"><CostLine cost={upCost} /> · <Icon name="clock" size={14} /> {fmtLong(vehicleUpgradeTime(v.level))}</div>
                    <Button small kind="secondary" onClick={() => act('upgradeVehicle', { type: t })} disabled={!!upWhy} why={upWhy}>
                      Улучшить
                    </Button>
                  </details>
                )}
              </>
            );
          }
          return (
            <article key={t} className={`veh-big ${v ? '' : 'locked'} ${d.award ? 'award' : ''}`} data-focus={nav.focus === t}>
              <div className="veh-stage">
                <VehicleArt type={t} w={230} />
                {d.award && <span className="award-ribbon"><Icon name="medal" size={14} /> за заслуги</span>}
              </div>
              <div className="hero-body">
                <div className="between">
                  <h3><Icon name={t} size={20} /> {d.name}</h3>
                  {v && <span className={`status-pill s-${v.status}`}>{status} · {v.level} ур.</span>}
                </div>
                <p className="small">{VEHICLE_LORE[t].story}</p>
                <p className="quote">{VEHICLE_LORE[t].quote}</p>
                <div className="bonus-chip"><Icon name="sparkle" size={14} /> {vehicleBonusText(t, v?.level ?? 1)}</div>
                {body}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function Equipment() {
  const { state, act, now } = useGame();
  const affordable = useAffordable();
  const ws = state.buildings.workshop;
  const [rarity, setRarity] = useState<CraftRarity>('common');
  const wsJobs = state.jobs.filter((j) => j.queue === 'workshop');
  const pendingCraft = wsJobs.filter((j) => j.kind === 'craft').length;
  const full = state.equipment.length + pendingCraft >= EQUIPMENT_LIMIT;
  const wsFull = wsJobs.length >= WORKSHOP_QUEUE_LIMIT;
  return (
    <>
      <ModelsPanel />
      <div className="section-head">
        <h2><Icon name="supply" size={20} /> Склад · {state.equipment.length}/{EQUIPMENT_LIMIT}</h2>
        <span className="muted small">в поход — до двух разных предметов</span>
      </div>
      {state.equipment.length === 0 && <Speech who={EMPTY.equipment.who}>{EMPTY.equipment.text}</Speech>}
      <div className="eq-grid">
        {state.equipment.map((e) => {
          const cost = equipmentUpgradeCost(e.rarity, e.level);
          const why = e.level >= MAX_EQUIPMENT_LEVEL ? 'Максимум' : e.status !== 'ready' ? 'В походе' : !affordable(cost) ? 'Не хватает ресурсов' : '';
          return (
            <div key={e.id} className={`eq-card rarity-${e.rarity}`}>
              <div className="eq-top">
                <span className="eq-icon"><Icon name={e.type} size={28} /></span>
                <span>
                  <b>{EQUIPMENT[e.type].name}</b>
                  <span className={`tag r-${e.rarity}`}>{e.rarity === 'award' && <Icon name="medal" size={12} />} {RARITY_NAMES[e.rarity]} · {e.level} ур.</span>
                </span>
              </div>
              <p className="small amber">{equipmentEffectText(e.type, e.rarity, e.level)}</p>
              <p className="tiny muted">
                {e.status === 'mission' ? <><Icon name="map" size={12} /> сейчас в походе</> : <>из: {e.source}</>}
              </p>
              <EquipmentWear e={e} />
              <div className="row">
                {e.level < MAX_EQUIPMENT_LEVEL && (
                  <Button small kind="secondary" onClick={() => act('upgradeEquipment', { id: e.id })} disabled={!!why} why={why}>
                    <Icon name="up" size={15} /> <CostLine cost={cost} check={false} />
                  </Button>
                )}
                {e.rarity !== 'award' && (
                  <Button small kind="danger" disabled={e.status !== 'ready'} onClick={() => { if (confirm(`Разобрать «${EQUIPMENT[e.type].name}»? Вернётся половина комплектующих.`)) act('dismantleEquipment', { id: e.id }); }}>
                    Разобрать
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <section className="panel awards-panel">
        <h2>
          <Icon name="medal" size={20} /> Наградное оснащение · {AWARD_EQUIPMENT.filter((t) => state.equipment.some((e) => e.type === t)).length}/{AWARD_EQUIPMENT.length}
        </h2>
        <p className="muted small">
          Чуть сильнее стандартного. Не собирается в мастерской и не разбирается — выдаётся за особые заслуги, {AWARD_SOURCE_NAME}.
        </p>
        <div className="eq-grid">
          {AWARD_EQUIPMENT.map((t) => {
            const n = state.equipment.filter((e) => e.type === t).length;
            return (
              <div key={t} className={`eq-card rarity-award ${n ? '' : 'not-owned'}`}>
                <div className="eq-top">
                  <span className="eq-icon"><Icon name={t} size={28} /></span>
                  <span>
                    <b>{EQUIPMENT[t].name}</b>
                    <span className="tag r-award"><Icon name="medal" size={12} /> Наградной</span>
                  </span>
                </div>
                <p className="tiny muted">{EQUIPMENT_LORE[t]}</p>
                <p className="small amber">{equipmentEffectText(t, 'award', 1)}</p>
                <span className={`award-state ${n ? 'on' : ''}`}>{n ? (n > 1 ? `на складе ×${n}` : 'на складе') : 'ещё не выдано'}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel workshop">
        <h2><Icon name="workshop" size={20} /> Мастерская Бати · {ws} ур.</h2>
        <Speech who="batya" compact>Выбирай, что собрать. Чем лучше мастерская — тем редкие вещи мне по силам.</Speech>
        {wsJobs.map((j) => <JobRow key={j.id} j={j} />)}
        <div className="seg">
          {RARITIES.map((r) => (
            <button key={r} className={`${rarity === r ? 'on' : ''} r-${r}`} onClick={() => setRarity(r)}>
              {ws < WORKSHOP_RARITY_LEVEL[r] && <Icon name="lock" size={13} />} {RARITY_NAMES[r]}
            </button>
          ))}
        </div>
        <p className="small">
          Цена сборки: <CostLine cost={costScale(CRAFT[rarity].cost, workshopMulAt(now))} /> · <Icon name="clock" size={14} /> {fmtLong(CRAFT[rarity].time)}
        </p>
        <div className="eq-grid">
          {EQUIPMENT_TYPES.map((t: EquipmentType) => {
            let why = '';
            if (ws < WORKSHOP_RARITY_LEVEL[rarity]) why = `Нужна мастерская ${WORKSHOP_RARITY_LEVEL[rarity]} ур.`;
            else if (full) why = 'Склад забит';
            else if (wsFull) why = 'Мастерская занята';
            else if (!affordable(costScale(CRAFT[rarity].cost, workshopMulAt(now)))) why = 'Не хватает ресурсов';
            return (
              <div key={t} className={`eq-card blueprint rarity-${rarity}`}>
                <div className="eq-top">
                  <span className="eq-icon"><Icon name={t} size={28} /></span>
                  <b>{EQUIPMENT[t].name}</b>
                </div>
                <p className="tiny muted">{EQUIPMENT_LORE[t]}</p>
                <p className="small amber">{equipmentEffectText(t, rarity, 1)}</p>
                <Button small onClick={() => act('craft', { type: t, rarity })} disabled={!!why} why={why}>
                  <Icon name="wrench" size={15} /> Собрать
                </Button>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
