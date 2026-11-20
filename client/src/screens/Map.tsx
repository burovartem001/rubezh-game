import React, { useEffect, useState } from 'react';
import {
  EQUIPMENT, MAX_EQUIPMENT_PER_GROUP, MISSIONS, MissionType, OPERATORS, OPERATOR_TYPES, OUTCOME_NAMES, OUTCOME_ORDER, OperatorType, RARITY_NAMES,
  SECTORS, SECTOR_MISSIONS, SECTOR_TYPE_NAMES, SectorDef, VEHICLES, VEHICLE_TYPES, VehicleType, equipmentEffectText, missionRewards,
  sectorById, vehicleBonusText,
} from '../../../shared/config';
import { Group, groupSize, planExpedition } from '../../../shared/calc';
import { MISSION_LORE, SECTOR_LORE, SECTOR_TYPE_LORE } from '../../../shared/lore';
import { useGame } from '../game';
import { Bar, Button, CostLine, RewardLine, Sheet, Sprite, Stepper, fmtLong, pad2, useAffordable } from '../ui';
import { ExpeditionRow } from '../components/Queues';
import { Icon, MISSION_ICON } from '../art/icons';
import { MapArt } from '../art/MapArt';
import { Portrait, Speech, VehicleArt } from '../art/art';
import { MapEventBanner, PvpTab, bonusFor } from './Long';
import { ProfileSheet } from './Mates';
import { CONTROL_GRACE, mapEventAt, seasonTheme } from '../../../shared/progression';
import { EquipKind, equipmentPower } from '../../../shared/config';

const TYPE_ICON = { observation: 'observation', warehouse: 'warehouse', stronghold: 'stronghold', route: 'route', event: 'event' } as const;
const DIFF_NAMES = ['', 'спокойно', 'терпимо', 'горячо', 'опасно', 'очень опасно', 'смертельно опасно'];

export function MapScreen() {
  const { state, nav, now } = useGame();
  const [sel, setSel] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    if (nav.tab === 'map' && nav.focus?.startsWith('sector-')) setSel(Number(nav.focus.slice(7)));
  }, [nav]);
  const ss = (id: number) => state.sectors.find((s) => s.id === id)!;
  const opened = SECTORS.filter((s) => ss(s.id).unlocked);
  const controlled = state.sectors.filter((s) => s.control >= 100).length;
  const [tab, setTab] = useState<'sectors' | 'pvp'>('sectors');
  const [openPlayer, setOpenPlayer] = useState<number | null>(null);
  const ev = mapEventAt(now);

  if (tab === 'pvp')
    return (
      <>
        <MapTabs tab={tab} setTab={setTab} />
        <PvpTab onOpenPlayer={setOpenPlayer} />
        {openPlayer != null && <ProfileSheet id={openPlayer} onClose={() => setOpenPlayer(null)} />}
      </>
    );

  return (
    <>
      <MapTabs tab={tab} setTab={setTab} />
      <MapEventBanner />
      <div className="section-head">
        <h2>
          <Icon name="map" size={22} /> Карта секторов
        </h2>
        <div className="chips-row">
          <span className="pill"><Icon name="compass" size={15} /> открыто {opened.length}/12</span>
          <span className="pill"><Icon name="flag" size={15} /> под контролем {controlled}</span>
          <span className="pill gold"><Icon name="drone" size={15} /> в походе {state.expeditions.length}/{state.slots}</span>
        </div>
      </div>
      <div className="map-wrap">
        <div className="map-scroll">
          <div style={{ width: `${zoom * 100}%` }}>
            <MapArt sectors={state.sectors} expeditions={state.expeditions} now={now} selected={sel} onSelect={setSel} hot={ev.hotSector} tint={seasonTheme(state.season.index).tint} />
          </div>
        </div>
        <div className="map-tools">
          <button className="icon-btn" onClick={() => setZoom((z) => Math.min(2.5, z + 0.5))} aria-label="Приблизить">
            <Icon name="plus" size={20} />
          </button>
          <button className="icon-btn" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label="Отдалить">
            <Icon name="minus" size={20} />
          </button>
        </div>
      </div>
      <div className="legend small">
        <span><i className="lg open" /> можно идти</span>
        <span><i className="lg visited" /> уже были</span>
        <span><i className="lg controlled" /> под контролем</span>
        <span><i className="lg locked" /> в тумане</span>
      </div>

      {state.expeditions.length > 0 && (
        <section className="panel">
          <h2>
            <Icon name="radio" size={20} /> В эфире
          </h2>
          {state.expeditions.map((x) => (
            <ExpeditionRow key={x.id} x={x} />
          ))}
        </section>
      )}

      <div className="section-head">
        <h2>
          <Icon name="flag" size={20} /> Доступные секторы
        </h2>
      </div>
      <section className="sector-list">
        {opened.map((s) => {
          const st = ss(s.id);
          const busy = state.expeditions.some((x) => x.sectorId === s.id);
          return (
            <button key={s.id} className={`sector-card t-${s.type}`} onClick={() => setSel(s.id)}>
              <span className="sector-badge">
                <Icon name={TYPE_ICON[s.type]} size={24} />
                <em>{pad2(s.id)}</em>
              </span>
              <span className="sector-info">
                <b>{s.name}</b>
                <small>{SECTOR_TYPE_NAMES[s.type]}</small>
                <span className="diff" aria-label={`Сложность ${s.difficulty}`}>
                  {Array.from({ length: 6 }, (_, i) => (
                    <i key={i} className={i < s.difficulty ? 'on' : ''} />
                  ))}
                  <span>{DIFF_NAMES[s.difficulty]}</span>
                </span>
                <Bar value={st.recon} />
              </span>
              <span className="sector-side">
                {busy ? <span className="pill gold small"><Icon name="drone" size={14} /> там группа</span> : <Icon name="arrow" size={20} />}
                <small className="muted">разв. {st.recon}%</small>
              </span>
            </button>
          );
        })}
      </section>
      {sel != null && <SectorSheet id={sel} onClose={() => setSel(null)} />}
    </>
  );
}

function MapTabs({ tab, setTab }: { tab: 'sectors' | 'pvp'; setTab: (t: 'sectors' | 'pvp') => void }) {
  return (
    <div className="seg big icons" role="tablist">
      <button role="tab" aria-selected={tab === 'sectors'} className={tab === 'sectors' ? 'on' : ''} onClick={() => setTab('sectors')}>
        <Icon name="map" size={20} />
        <span>Секторы</span>
      </button>
      <button role="tab" aria-selected={tab === 'pvp'} className={tab === 'pvp' ? 'on' : ''} onClick={() => setTab('pvp')}>
        <Icon name="flag" size={20} />
        <span>Набеги</span>
      </button>
    </div>
  );
}

function SectorSheet({ id, onClose }: { id: number; onClose: () => void }) {
  const { state, now } = useGame();
  const s = sectorById(id)!;
  const st = state.sectors.find((x) => x.id === id)!;
  const [mission, setMission] = useState<MissionType | null>(null);
  if (mission) return <GroupBuilder sector={s} mission={mission} onBack={() => setMission(null)} onClose={onClose} />;
  return (
    <Sheet title={`Сектор ${pad2(s.id)}`} onClose={onClose}>
      <div className={`sector-hero t-${s.type} ${st.unlocked ? '' : 'locked'}`}>
        <div className="sector-hero-icon">
          <Icon name={st.unlocked ? TYPE_ICON[s.type] : 'lock'} size={40} stroke={1.5} />
        </div>
        <div>
          <span className="kicker">{st.unlocked ? SECTOR_TYPE_NAMES[s.type] : 'Закрытый район'}</span>
          <h2>{st.unlocked ? s.name : 'Туман войны'}</h2>
          {st.unlocked && (
            <span className="diff big">
              {Array.from({ length: 6 }, (_, i) => (
                <i key={i} className={i < s.difficulty ? 'on' : ''} />
              ))}
              <span>{DIFF_NAMES[s.difficulty]}</span>
            </span>
          )}
        </div>
      </div>
      {!st.unlocked ? (
        <Speech who="iskra">
          Пока не слышу, что там творится. {st.lockReason}. Тогда и посмотрим.
        </Speech>
      ) : (
        <>
          <p className="story">{SECTOR_LORE[s.id]} <span className="muted">{SECTOR_TYPE_LORE[s.type]}</span></p>
          <div className="meters">
            <div>
              <span className="meter-label"><Icon name="recon" size={16} /> Разведанность <b>{st.recon}%</b></span>
              <Bar value={st.recon} />
            </div>
            <div>
              <span className="meter-label"><Icon name="flag" size={16} /> Контроль <b>{st.control}%</b></span>
              <Bar value={st.control} tone="olive" />
              {st.control > 0 && st.control_at != null && (
                <span className="tiny muted">
                  {now - st.control_at < CONTROL_GRACE
                    ? `держится ещё ${fmtLong((CONTROL_GRACE - (now - st.control_at)) / 1000)}, затем начнёт падать`
                    : 'контроль падает — нужен успешный рейд или штурм'}
                </span>
              )}
            </div>
          </div>
          {st.recon < 100 && (
            <p className="muted small">
              <Icon name="sparkle" size={14} /> Каждый процент разведки — плюс к силе группы (до +15%) и точнее прогноз.
            </p>
          )}
          <h3>Что можно сделать</h3>
          {SECTOR_MISSIONS[s.type].map((m) => {
            const def = MISSIONS[m];
            const locked = st.recon < def.minRecon;
            return (
              <div key={m} className={`mission-card m-${m} ${locked ? 'locked' : ''}`}>
                <div className="mission-icon">
                  <Icon name={MISSION_ICON[m]} size={28} />
                </div>
                <div className="mission-body">
                  <div className="between">
                    <b>{def.name}</b>
                    <span className="time-chip">
                      <Icon name="clock" size={14} /> ~{fmtLong(s.baseTime * def.timeMul)}
                    </span>
                  </div>
                  <p className="small">{MISSION_LORE[m].brief}</p>
                  <div className="small">
                    <RewardLine cost={missionRewards(m, s.difficulty)} />
                    {m === 'stronghold' && (
                      <span className="pill gold small">
                        <Icon name="gift" size={13} /> шанс оснащения
                      </span>
                    )}
                  </div>
                  <Button small disabled={locked} why={locked ? `Нужна разведанность ${def.minRecon}% — сейчас ${st.recon}%` : ''} onClick={() => setMission(m)}>
                    <Icon name="squad" size={16} /> Собрать группу
                  </Button>
                </div>
              </div>
            );
          })}
        </>
      )}
    </Sheet>
  );
}

function autoGroup(mission: MissionType, avail: Record<OperatorType, number>, cap: number): Group {
  const order: OperatorType[] = mission === 'recon' ? ['scout', 'babayaga', 'heavy', 'veteran', 'fpv'] : ['veteran', 'fpv', 'heavy', 'babayaga', 'scout'];
  const g: Group = {};
  let left = cap;
  for (const t of order) {
    const n = Math.min(avail[t], left);
    if (n > 0) g[t] = n;
    left -= n;
  }
  return g;
}

function OutcomeMeter({ low, high }: { low: string; high: string }) {
  const li = OUTCOME_ORDER.indexOf(low as never);
  const hi = OUTCOME_ORDER.indexOf(high as never);
  return (
    <div className="outcome-meter" aria-label={`Прогноз: от ${OUTCOME_NAMES[low as 'fail']} до ${OUTCOME_NAMES[high as 'fail']}`}>
      {OUTCOME_ORDER.map((o, i) => (
        <span key={o} className={`seg-o o-${o} ${i >= li && i <= hi ? 'in' : ''}`}>
          {OUTCOME_NAMES[o].replace('Задание не выполнено', 'Провал')}
        </span>
      ))}
    </div>
  );
}

function GroupBuilder({ sector, mission, onBack, onClose }: { sector: SectorDef; mission: MissionType; onBack: () => void; onClose: () => void }) {
  const { state, act, go, now } = useGame();
  const affordable = useAffordable();
  const st = state.sectors.find((x) => x.id === sector.id)!;
  const readyVehicles = VEHICLE_TYPES.filter((v) => state.vehicles[v]?.status === 'ready');
  const preferred: VehicleType | undefined = mission === 'recon' && readyVehicles.includes('ebike') ? 'ebike' : readyVehicles[0];
  const [vehicle, setVehicle] = useState<VehicleType | undefined>(preferred);
  const avail = Object.fromEntries(OPERATOR_TYPES.map((t) => [t, state.operators[t].available])) as Record<OperatorType, number>;
  const ranks = Object.fromEntries(OPERATOR_TYPES.map((t) => [t, state.operators[t].rank])) as Record<OperatorType, number>;
  const vLevel = vehicle ? state.vehicles[vehicle]!.level : 1;
  const capFor = (v?: VehicleType) =>
    planExpedition({ sector, mission, group: {}, ranks, vehicle: { type: v ?? 'moto', level: v ? state.vehicles[v]!.level : 1 }, equipment: [], skills: state.commander.skills, commsLevel: state.buildings.comms, sectorRecon: st.recon }).capacity;
  const [group, setGroup] = useState<Group>(() => autoGroup(mission, avail, capFor(preferred)));
  const readyEq = state.equipment.filter((e) => e.status === 'ready');
  const [eqIds, setEqIds] = useState<number[]>(() => {
    const pick: number[] = [];
    const want: EquipKind[] = mission === 'recon' ? ['recon', 'field', 'losses'] : ['fpv', 'power', 'losses', 'field', 'recon'];
    for (const t of want) {
      if (pick.length >= MAX_EQUIPMENT_PER_GROUP) break;
      const best = readyEq.filter((e) => EQUIPMENT[e.type].kind === t).sort((a, b) => equipmentPower(b.type, b.rarity, b.level) - equipmentPower(a.type, a.rarity, a.level))[0];
      if (best) pick.push(best.id);
    }
    return pick;
  });
  const equipment = readyEq.filter((e) => eqIds.includes(e.id));
  const plan = vehicle
    ? planExpedition({ sector, mission, group, ranks, vehicle: { type: vehicle, level: vLevel }, equipment, skills: state.commander.skills, commsLevel: state.buildings.comms, sectorRecon: st.recon, bonus: bonusFor(state, sector.id, now, group) })
    : null;
  const size = groupSize(group);
  const slotsFree = state.expeditions.length < state.slots;

  let why = '';
  if (!slotsFree) why = 'Все группы в поле — дождитесь возвращения';
  else if (!vehicle) why = 'Нет свободного транспорта: он в походе, в ремонте или в мастерской';
  else if (size < 1) why = 'Добавьте хотя бы одного оператора';
  else if (plan && size > plan.capacity) why = `В транспорт помещается ${plan.capacity}`;
  else if (plan && !affordable(plan.cost)) why = 'Не хватает ресурсов на поход';

  const toggleEq = (id: number) => {
    const e = readyEq.find((x) => x.id === id)!;
    setEqIds((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      const withoutSameType = cur.filter((x) => { const y = readyEq.find((q) => q.id === x); return !y || EQUIPMENT[y.type].kind !== EQUIPMENT[e.type].kind; });
      return [...withoutSameType, id].slice(-MAX_EQUIPMENT_PER_GROUP);
    });
  };

  return (
    <Sheet title={`${MISSIONS[mission].name}: ${sector.name}`} onClose={onClose} wide>
      <button className="link" onClick={onBack}>
        <Icon name="back" size={16} /> к сектору
      </button>
      <div className="brief">
        <Icon name={MISSION_ICON[mission]} size={30} />
        <p>
          <b>Задача:</b> {MISSION_LORE[mission].verb} сектор «{sector.name}». {MISSION_LORE[mission].brief}
        </p>
      </div>

      <h3>
        <Icon name="squad" size={18} /> Группа · {size} из {plan?.capacity ?? '—'} мест
      </h3>
      <div className="seats" aria-hidden>
        {Array.from({ length: plan?.capacity ?? 4 }, (_, i) => (
          <i key={i} className={i < size ? 'on' : ''} />
        ))}
      </div>
      <div className="pick-list">
        {OPERATOR_TYPES.map((t) => {
          const o = state.operators[t];
          if (!o.available && !o.on_mission && !o.wounded) return null;
          return (
            <div key={t} className={`pick-card ${(group[t] ?? 0) > 0 ? 'on' : ''}`}>
              <Portrait sprite={OPERATORS[t].sprite} size={52} />
              <span className="pick-info">
                <b>{OPERATORS[t].name}</b>
                <small className="muted">
                  свободно {o.available}
                  {o.on_mission ? ` · в поле ${o.on_mission}` : ''}
                  {o.wounded ? ` · ранены ${o.wounded}` : ''}
                </small>
              </span>
              <Stepper value={group[t] ?? 0} max={o.available} onChange={(v) => setGroup((g) => ({ ...g, [t]: v }))} label={OPERATORS[t].name} />
            </div>
          );
        })}
      </div>
      <button className="link" onClick={() => setGroup(autoGroup(mission, avail, plan?.capacity ?? 4))}>
        <Icon name="sparkle" size={15} /> подобрать состав за меня
      </button>

      <h3>
        <Icon name="bukhanka" size={18} /> Транспорт
      </h3>
      <div className="veh-pick">
        {VEHICLE_TYPES.map((v) => {
          const row = state.vehicles[v];
          if (!row) return null;
          const ok = row.status === 'ready';
          return (
            <button key={v} className={`veh-card ${vehicle === v ? 'on' : ''}`} disabled={!ok} onClick={() => setVehicle(v)}>
              <VehicleArt type={v} w={124} className="veh-img" />
              <b>{VEHICLES[v].name}</b>
              <small>{ok ? vehicleBonusText(v, row.level) : row.status === 'mission' ? 'в походе' : row.status === 'damaged' ? 'сломан' : 'в мастерской'}</small>
            </button>
          );
        })}
      </div>

      <h3>
        <Icon name="repairkit" size={18} /> Оснащение · до {MAX_EQUIPMENT_PER_GROUP}, с разным эффектом
      </h3>
      {readyEq.length ? (
        <div className="eq-pick">
          {readyEq.map((e) => (
            <button key={e.id} className={`eq-chip rarity-${e.rarity} ${eqIds.includes(e.id) ? 'on' : ''}`} onClick={() => toggleEq(e.id)}>
              <span className="eq-icon small"><Icon name={e.type} size={20} /></span>
              <span>
                <b>{EQUIPMENT[e.type].name}</b>
                <small>
                  {RARITY_NAMES[e.rarity]} {e.level} ур. · {equipmentEffectText(e.type, e.rarity, e.level)}
                </small>
              </span>
              {eqIds.includes(e.id) && <Icon name="check" size={18} className="tick" />}
            </button>
          ))}
        </div>
      ) : (
        <Speech who="batya" compact>Оснащения на складе нет. Загляни в мастерскую — соберу.</Speech>
      )}

      {plan && (
        <div className="forecast">
          <div className="between">
            <h3>
              <Icon name="compass" size={18} /> Прогноз штаба
            </h3>
            <span className={`risk r-${plan.lossCategory}`}>
              <Icon name="heart" size={14} /> риск {plan.lossCategory}
            </span>
          </div>
          <OutcomeMeter low={plan.outcomeLow} high={plan.outcomeHigh} />
          <div className="vs">
            <div>
              <span className="muted tiny">{MISSIONS[mission].combat ? 'Наша сила' : 'Наша разведка'}</span>
              <b>{MISSIONS[mission].combat ? plan.power : plan.reconScore}</b>
            </div>
            <span className="vs-x">против</span>
            <div>
              <span className="muted tiny">Противник</span>
              <b>
                ~{plan.enemy} <small>±{Math.round(plan.uncertainty * 100)}%</small>
              </b>
            </div>
          </div>
          <div className="fc-grid">
            <div>
              <span className="muted tiny">Добыча</span>
              <RewardLine cost={plan.rewardsHigh} />
            </div>
            <div>
              <span className="muted tiny">Расход</span>
              <CostLine cost={plan.cost} />
            </div>
            <div>
              <span className="muted tiny">В пути</span>
              <b>
                <Icon name="clock" size={14} /> {fmtLong(plan.duration)}
              </b>
            </div>
          </div>
          {plan.reasons.length > 0 && (
            <ul className="reasons">
              {plan.reasons.map((r, i) => (
                <li key={i} className={r.kind}>
                  {r.text}
                </li>
              ))}
            </ul>
          )}
          <p className="muted tiny">Это оценка, а не обещание: точный итог решится в поле и придёт в отчёте.</p>
        </div>
      )}
      {plan && !affordable(plan.cost) && (plan.cost.fuel ?? 0) > 0 && (
        <Speech who="batya" compact>
          Баки пустые! Топливо даёт{' '}
          <button className="link" onClick={() => { onClose(); go('base', 'fueldepot'); }}>
            склад ГСМ
          </button>
          , а ещё его можно отбить заданием «Снабжение».
        </Speech>
      )}
      <Button disabled={!!why} why={why} onClick={async () => { if (await act('dispatch', { sectorId: sector.id, mission, group, vehicle, equipment: eqIds })) onClose(); }}>
        <Icon name="flag" size={18} /> Отправить группу
      </Button>
    </Sheet>
  );
}
