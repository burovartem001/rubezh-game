import React, { useEffect, useMemo, useState } from 'react';
import {
  EQUIPMENT, HOME, MAX_EQUIPMENT_PER_GROUP, MISSIONS, MissionType, OPERATORS, OPERATOR_TYPES, OUTCOME_NAMES, OperatorType, RARITY_NAMES,
  SECTORS, SECTOR_MISSIONS, SECTOR_TYPE_NAMES, SectorDef, VEHICLES, VEHICLE_TYPES, VehicleType, equipmentEffectText, missionRewards,
  sectorById, vehicleBonusText,
} from '../../../shared/config';
import { Group, groupSize, outcomeRangeText, planExpedition } from '../../../shared/calc';
import { useGame } from '../game';
import { Bar, Button, CostLine, RewardLine, Sheet, fmtLong, pad2, useAffordable } from '../ui';
import { ExpeditionRow, expeditionPhase } from '../components/Queues';

const TYPE_GLYPH = { observation: '◎', warehouse: '▣', stronghold: '◆', route: '⇢', event: '✦' } as const;

export function MapScreen() {
  const { state, nav, now } = useGame();
  const [sel, setSel] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    if (nav.tab === 'map' && nav.focus?.startsWith('sector-')) setSel(Number(nav.focus.slice(7)));
  }, [nav]);
  const ss = (id: number) => state.sectors.find((s) => s.id === id)!;
  const pos = (id: number) => (id === 0 ? HOME : sectorById(id)!);
  const edges = useMemo(() => {
    const out: [number, number][] = [];
    for (const s of SECTORS) for (const l of s.links) if (l < s.id) out.push([l, s.id]);
    return out;
  }, []);
  const known = (id: number) => id === 0 || ss(id).unlocked || SECTORS.find((s) => s.id === id)!.links.some((l) => l === 0 || ss(l)?.unlocked);

  return (
    <>
      <div className="section-head">
        <h2>Карта секторов</h2>
        <span className="muted small">
          ◇ {Math.floor(state.resources.data)} данных · походы {state.expeditions.length}/{state.slots}
        </span>
      </div>
      <div className="map-wrap">
        <div className="map-scroll">
          <svg className="map" viewBox="0 0 100 100" style={{ width: `${zoom * 100}%` }} role="img" aria-label="Схема секторов">
            <defs>
              <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M10 0H0V10" fill="none" stroke="#2c3d36" strokeWidth=".2" />
              </pattern>
              <radialGradient id="fog" cx="50%" cy="100%" r="90%">
                <stop offset="0" stopColor="#2f4a3f" />
                <stop offset="1" stopColor="#0f1a1b" />
              </radialGradient>
            </defs>
            <rect width="100" height="100" fill="url(#fog)" />
            <rect width="100" height="100" fill="url(#grid)" />
            {/* условная линия соприкосновения */}
            <path d="M0 16 C 20 20, 35 8, 55 14 S 85 22, 100 12" fill="none" stroke="#b36d5e" strokeWidth=".5" strokeDasharray="1.5 1.2" opacity=".7" />
            <text x="2" y="12" className="map-label red">УСЛОВНАЯ ЛБС</text>
            {edges.map(([a, b]) => {
              const A = pos(a), B = pos(b);
              const vis = known(a) && known(b);
              const open = (a === 0 || ss(a).unlocked) && ss(b).unlocked;
              return <line key={`${a}-${b}`} x1={A.x} y1={A.y} x2={B.x} y2={B.y} className={`edge ${open ? 'open' : vis ? 'vis' : 'hid'}`} />;
            })}
            {state.expeditions.map((x) => {
              const S = sectorById(x.sectorId)!;
              const f = expeditionPhase(x, now).f;
              const k = Math.min(1, Math.max(0, f < 0.4 ? f / 0.4 : f < 0.6 ? 1 : 1 - (f - 0.6) / 0.4));
              const cx = HOME.x + (S.x - HOME.x) * k;
              const cy = HOME.y + (S.y - HOME.y) * k;
              return (
                <g key={x.id}>
                  <line x1={HOME.x} y1={HOME.y} x2={S.x} y2={S.y} className="route" />
                  <circle cx={cx} cy={cy} r="1.6" className="unit" />
                </g>
              );
            })}
            <g className="node home">
              <rect x={HOME.x - 4} y={HOME.y - 3} width="8" height="6" rx="1" />
              <text x={HOME.x} y={HOME.y + 1.1} textAnchor="middle">⌂</text>
              <text x={HOME.x} y={HOME.y + 6.5} textAnchor="middle" className="map-label">ПОЛИГОН</text>
            </g>
            {SECTORS.map((s) => {
              const st = ss(s.id);
              const vis = known(s.id);
              const cls = !st.unlocked ? 'locked' : st.control >= 100 ? 'controlled' : st.successes > 0 ? 'visited' : 'open';
              const active = state.expeditions.some((x) => x.sectorId === s.id);
              return (
                <g
                  key={s.id}
                  className={`node ${cls} ${sel === s.id ? 'sel' : ''} ${vis ? '' : 'fog'} ${active ? 'active' : ''}`}
                  onClick={() => setSel(s.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Сектор ${s.id}: ${vis ? s.name : 'не разведан'}`}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSel(s.id)}
                >
                  <circle cx={s.x} cy={s.y} r="7" className="hit" />
                  <circle cx={s.x} cy={s.y} r="3.6" className="ring" />
                  <text x={s.x} y={s.y + 1.2} textAnchor="middle" className="glyph">
                    {vis ? TYPE_GLYPH[s.type] : '?'}
                  </text>
                  <text x={s.x} y={s.y - 4.8} textAnchor="middle" className="map-num">
                    {pad2(s.id)}
                  </text>
                  {vis && (
                    <text x={s.x} y={s.y + 6.6} textAnchor="middle" className="map-label">
                      {s.name.toUpperCase()}
                    </text>
                  )}
                  {st.unlocked && st.recon > 0 && <rect x={s.x - 3.5} y={s.y + 7.6} width={(7 * st.recon) / 100} height=".7" className="recon-bar" />}
                </g>
              );
            })}
          </svg>
        </div>
        <div className="map-tools">
          <button className="icon-btn" onClick={() => setZoom((z) => Math.min(2.5, z + 0.5))} aria-label="Приблизить">
            +
          </button>
          <button className="icon-btn" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label="Отдалить">
            −
          </button>
        </div>
      </div>
      <div className="legend small">
        <span><i className="lg open" /> доступен</span>
        <span><i className="lg visited" /> пройден</span>
        <span><i className="lg controlled" /> под контролем</span>
        <span><i className="lg locked" /> закрыт</span>
      </div>
      {state.expeditions.length > 0 && (
        <section className="panel">
          <h2>Группы в походе</h2>
          {state.expeditions.map((x) => (
            <ExpeditionRow key={x.id} x={x} />
          ))}
        </section>
      )}
      <section className="sector-list">
        {SECTORS.filter((s) => ss(s.id).unlocked).map((s) => (
          <button key={s.id} className="sector-item" onClick={() => setSel(s.id)}>
            <span className="glyph">{TYPE_GLYPH[s.type]}</span>
            <span>
              <b>
                {pad2(s.id)} · {s.name}
              </b>
              <small className="muted">
                {SECTOR_TYPE_NAMES[s.type]} · сложность {s.difficulty} · разведка {ss(s.id).recon}%
              </small>
            </span>
          </button>
        ))}
      </section>
      {sel != null && <SectorSheet id={sel} onClose={() => setSel(null)} />}
    </>
  );
}

function SectorSheet({ id, onClose }: { id: number; onClose: () => void }) {
  const { state } = useGame();
  const s = sectorById(id)!;
  const st = state.sectors.find((x) => x.id === id)!;
  const [mission, setMission] = useState<MissionType | null>(null);
  if (mission) return <GroupBuilder sector={s} mission={mission} onBack={() => setMission(null)} onClose={onClose} />;
  const diff = ['—', 'низкая', 'низкая', 'средняя', 'высокая', 'высокая', 'очень высокая'][s.difficulty];
  return (
    <Sheet title={`Сектор ${pad2(s.id)} · ${st.unlocked ? s.name : 'закрыт'}`} onClose={onClose}>
      {!st.unlocked ? (
        <>
          <p className="muted">Вымышленный игровой сектор. Сведений пока нет.</p>
          <div className="warn-box">Чтобы открыть: {st.lockReason}</div>
        </>
      ) : (
        <>
          <p className="muted">
            {SECTOR_TYPE_NAMES[s.type]} · сложность {s.difficulty} ({diff}) · походов {st.attempts}, успешных {st.successes}
          </p>
          <div className="spec">
            <span>Разведанность</span>
            <b>{st.recon}%</b>
          </div>
          <Bar value={st.recon} />
          <p className="muted small">
            Разведка даёт до +15% к силе группы и сужает прогноз. {st.recon < 50 ? 'Условия опорного пункта раскрываются с 50%.' : ''}
          </p>
          <div className="spec">
            <span>Контроль сектора</span>
            <b>{st.control}%</b>
          </div>
          <Bar value={st.control} tone="olive" />
          <h3>Задания</h3>
          {SECTOR_MISSIONS[s.type].map((m) => {
            const def = MISSIONS[m];
            const locked = st.recon < def.minRecon;
            return (
              <div key={m} className="mission">
                <div className="between">
                  <b>{def.name}</b>
                  <span className="muted small">~{fmtLong(s.baseTime * def.timeMul)}</span>
                </div>
                <p className="muted small">{def.desc}</p>
                <div className="between">
                  <span className="small">
                    Награда: <RewardLine cost={missionRewards(m, s.difficulty)} />
                    {m === 'stronghold' && <span className="amber"> + шанс оснащения</span>}
                  </span>
                </div>
                <Button
                  small
                  disabled={locked}
                  why={locked ? `Нужна разведанность от ${def.minRecon}% (сейчас ${st.recon}%)` : ''}
                  onClick={() => setMission(m)}
                >
                  Собрать группу
                </Button>
              </div>
            );
          })}
        </>
      )}
    </Sheet>
  );
}

function autoGroup(mission: MissionType, avail: Record<OperatorType, number>, cap: number): Group {
  const order: OperatorType[] = mission === 'recon' ? ['scout', 'babayaga', 'heavy', 'fpv'] : ['fpv', 'heavy', 'babayaga', 'scout'];
  const g: Group = {};
  let left = cap;
  for (const t of order) {
    const n = Math.min(avail[t], left);
    if (n > 0) g[t] = n;
    left -= n;
  }
  return g;
}

function GroupBuilder({ sector, mission, onBack, onClose }: { sector: SectorDef; mission: MissionType; onBack: () => void; onClose: () => void }) {
  const { state, act, go } = useGame();
  const affordable = useAffordable();
  const st = state.sectors.find((x) => x.id === sector.id)!;
  const readyVehicles = VEHICLE_TYPES.filter((v) => state.vehicles[v]?.status === 'ready');
  const preferred: VehicleType | undefined = mission === 'recon' && readyVehicles.includes('ebike') ? 'ebike' : readyVehicles[0];
  const [vehicle, setVehicle] = useState<VehicleType | undefined>(preferred);
  const avail = Object.fromEntries(OPERATOR_TYPES.map((t) => [t, state.operators[t].available])) as Record<OperatorType, number>;
  const ranks = Object.fromEntries(OPERATOR_TYPES.map((t) => [t, state.operators[t].rank])) as Record<OperatorType, number>;
  const vLevel = vehicle ? state.vehicles[vehicle]!.level : 1;
  const capFor = (v?: VehicleType) => planExpedition({
    sector, mission, group: {}, ranks, vehicle: { type: v ?? 'moto', level: v ? state.vehicles[v]!.level : 1 }, equipment: [], skills: state.commander.skills,
    commsLevel: state.buildings.comms, sectorRecon: st.recon,
  }).capacity;
  const [group, setGroup] = useState<Group>(() => autoGroup(mission, avail, capFor(preferred)));
  const readyEq = state.equipment.filter((e) => e.status === 'ready');
  const [eqIds, setEqIds] = useState<number[]>(() => {
    // по умолчанию — лучшие подходящие предметы разных типов
    const pick: number[] = [];
    const want = mission === 'recon' ? ['commkit', 'repairkit', 'reb'] : ['nsu', 'reb', 'repairkit', 'commkit'];
    for (const t of want) {
      if (pick.length >= MAX_EQUIPMENT_PER_GROUP) break;
      const best = readyEq.filter((e) => e.type === t).sort((a, b) => b.level - a.level)[0];
      if (best) pick.push(best.id);
    }
    return pick;
  });
  const equipment = readyEq.filter((e) => eqIds.includes(e.id));
  const plan = vehicle
    ? planExpedition({ sector, mission, group, ranks, vehicle: { type: vehicle, level: vLevel }, equipment, skills: state.commander.skills, commsLevel: state.buildings.comms, sectorRecon: st.recon })
    : null;
  const size = groupSize(group);
  const slotsFree = state.expeditions.length < state.slots;

  let why = '';
  if (!slotsFree) why = 'Все слоты походов заняты — дождитесь возвращения группы';
  else if (!vehicle) why = 'Нет готового транспорта (в походе, в ремонте или в мастерской)';
  else if (size < 1) why = 'Добавьте хотя бы одного оператора';
  else if (plan && size > plan.capacity) why = `Вместимость группы — ${plan.capacity}`;
  else if (plan && !affordable(plan.cost)) why = 'Не хватает ресурсов на поход';

  const toggleEq = (id: number) => {
    const e = readyEq.find((x) => x.id === id)!;
    setEqIds((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      const withoutSameType = cur.filter((x) => readyEq.find((y) => y.id === x)?.type !== e.type);
      return [...withoutSameType, id].slice(-MAX_EQUIPMENT_PER_GROUP);
    });
  };
  const busyOps = OPERATOR_TYPES.reduce((s, t) => s + state.operators[t].on_mission, 0);

  return (
    <Sheet title={`${MISSIONS[mission].name} · сектор ${pad2(sector.id)}`} onClose={onClose} wide>
      <button className="link" onClick={onBack}>
        ← к сектору
      </button>
      <h3>
        Операторы · {size}/{plan?.capacity ?? '—'}
      </h3>
      {busyOps > 0 && <p className="muted small">В походе: {busyOps} — они вернутся после завершения своих заданий.</p>}
      {OPERATOR_TYPES.map((t) => {
        const total = state.operators[t].available;
        if (!total && !state.operators[t].on_mission && !state.operators[t].wounded) return null;
        return (
          <div key={t} className="pick-row">
            <span>
              <b>{OPERATORS[t].name}</b>
              <small className="muted">
                свободно {total}
                {state.operators[t].on_mission ? ` · в походе ${state.operators[t].on_mission}` : ''}
                {state.operators[t].wounded ? ` · ранены ${state.operators[t].wounded}` : ''}
              </small>
            </span>
            <StepperInline value={group[t] ?? 0} max={total} onChange={(v) => setGroup((g) => ({ ...g, [t]: v }))} label={OPERATORS[t].name} />
          </div>
        );
      })}
      <button className="link" onClick={() => setGroup(autoGroup(mission, avail, plan?.capacity ?? 4))}>
        подобрать состав автоматически
      </button>

      <h3>Транспорт · один на группу</h3>
      <div className="chips">
        {VEHICLE_TYPES.map((v) => {
          const row = state.vehicles[v];
          if (!row) return null;
          const ok = row.status === 'ready';
          return (
            <button
              key={v}
              className={`chip ${vehicle === v ? 'on' : ''}`}
              disabled={!ok}
              onClick={() => {
                setVehicle(v);
              }}
            >
              <b>{VEHICLES[v].name}</b>
              <small>{ok ? vehicleBonusText(v, row.level) : row.status === 'mission' ? 'в походе' : row.status === 'damaged' ? 'нужен ремонт' : 'в мастерской'}</small>
            </button>
          );
        })}
      </div>

      <h3>Оснащение · до {MAX_EQUIPMENT_PER_GROUP}, разных типов</h3>
      {readyEq.length ? (
        <div className="chips">
          {readyEq.map((e) => (
            <button key={e.id} className={`chip ${eqIds.includes(e.id) ? 'on' : ''}`} onClick={() => toggleEq(e.id)}>
              <b>
                {EQUIPMENT[e.type].icon} {EQUIPMENT[e.type].name}
              </b>
              <small>
                {RARITY_NAMES[e.rarity]} · ур. {e.level} · {equipmentEffectText(e.type, e.rarity, e.level)}
              </small>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted small">Свободного оснащения нет. Его собирают в мастерской и получают в походах.</p>
      )}

      {plan && (
        <div className="forecast">
          <h3>Прогноз</h3>
          <div className="spec">
            <span>Исход</span>
            <b className={plan.outcomeHigh === 'fail' ? 'red' : plan.outcomeLow === 'fail' ? 'amber' : 'olive'}>{outcomeRangeText(plan.outcomeLow, plan.outcomeHigh, OUTCOME_NAMES)}</b>
          </div>
          <div className="spec">
            <span>Риск существенных потерь</span>
            <b className={plan.lossCategory === 'высокая' ? 'red' : plan.lossCategory === 'средняя' ? 'amber' : 'olive'}>{plan.lossCategory}</b>
          </div>
          <div className="spec">
            <span>{MISSIONS[mission].combat ? 'Боевой рейтинг' : 'Разведка'} / противник</span>
            <span className="num">
              {MISSIONS[mission].combat ? plan.power : plan.reconScore} / ~{plan.enemy} (±{Math.round(plan.uncertainty * 100)}%)
            </span>
          </div>
          <div className="spec">
            <span>Награда</span>
            <span>
              <RewardLine cost={plan.rewardsLow} /> … <RewardLine cost={plan.rewardsHigh} />
            </span>
          </div>
          <div className="spec">
            <span>Время</span>
            <b>{fmtLong(plan.duration)}</b>
          </div>
          <div className="spec">
            <span>Расход</span>
            <CostLine cost={plan.cost} />
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
          <p className="muted tiny">Прогноз — диапазон, а не гарантия. Точный итог фиксируется при отправке и раскрывается в отчёте.</p>
        </div>
      )}
      {plan && !affordable(plan.cost) && (plan.cost.fuel ?? 0) > 0 && (
        <div className="warn-box">
          Не хватает ресурсов. Топливо производит{' '}
          <button className="link" onClick={() => { onClose(); go('base', 'fueldepot'); }}>
            склад ГСМ
          </button>
          , его также приносят задания «Снабжение».
        </div>
      )}
      <Button
        disabled={!!why}
        why={why}
        onClick={async () => {
          if (await act('dispatch', { sectorId: sector.id, mission, group, vehicle, equipment: eqIds })) onClose();
        }}
      >
        Отправить группу
      </Button>
    </Sheet>
  );
}

function StepperInline(p: { value: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="stepper" aria-label={p.label}>
      <button type="button" disabled={p.value <= 0} onClick={() => p.onChange(p.value - 1)} aria-label={`Меньше: ${p.label}`}>
        −
      </button>
      <b className="num">{p.value}</b>
      <button type="button" disabled={p.value >= p.max} onClick={() => p.onChange(p.value + 1)} aria-label={`Больше: ${p.label}`}>
        +
      </button>
    </div>
  );
}
