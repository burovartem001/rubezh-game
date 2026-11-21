/** Интерфейс глубины полигона и сюжета: кампания, события, достижения, конструктор дронов, износ, передовые пункты, встречи. */
import React, { useState } from 'react';
import { MISSIONS, OPERATORS, OperatorType, VEHICLES, sectorById } from '../../../shared/config';
import {
  ACHIEVEMENTS, ACH_POINTS, ACH_TITLES, BLUEPRINT_PARTS, BUILDING_FX, CAMPAIGN, CHAPTERS, chapterLockLevel, CampaignStep, DEFAULT_MODEL, DRONE_PARTS, DRONE_SLOTS, DroneSlot,
  ENCOUNTERS, EVENTS, MASCOTS, PART_ICONS, MAX_INSTRUCTORS, MODEL_CLASSES, MODEL_COLORS, OUTPOST, SPECS, SPEC_LEVEL, achTitle, fatigueNow, healScarsCost, modelCost,
  modelMods, modelTime, partByKey, wearFactor,
} from '../../../shared/content';
import { costScale, equipRepairCostOf, modelRepairCostOf, workshopMulAt } from '../../../shared/deepcalc';
import { SOLDIER_MAX_LEVEL, modsText } from '../../../shared/progression';
import { chevronByKey } from '../../../shared/chevrons';
import type { Cost } from '../../../shared/config';
import type { Equipment, GameState, Report, Soldier } from '../api';
import { useGame } from '../game';
import { Bar, Button, Countdown, CostLine, RewardLine, Sheet, fmtLong, useAffordable } from '../ui';
import { Icon } from '../art/icons';
import { Speech } from '../art/art';
import { Chevron } from '../art/Chevron';
import { DRONE_LAYER_ORDER, DRONE_LAYER_SIZE } from '../art/sprites';

const mod = (n: number, m: number) => ((n % m) + m) % m;
const TIER_NAMES = ['бронза', 'серебро', 'золото'];

/* ═════════════ Кампания ═════════════ */

function goalProgress(state: GameState, st: CampaignStep): { value: number; target: number } {
  const g = st.goal!;
  switch (g.kind) {
    case 'building': return { value: state.buildings[g.key as keyof GameState['buildings']] ?? 0, target: g.value };
    case 'stat': return { value: state.commander.stats[g.key!] ?? 0, target: g.value };
    case 'research': return { value: state.research.includes(g.key!) ? 1 : 0, target: 1 };
    case 'model': return { value: state.models.length, target: g.value };
    case 'outpost': return { value: state.outposts.length, target: g.value };
    case 'control': return { value: state.sectors.filter((s) => s.control >= 100).length, target: g.value };
  }
}
function rewardText(r: CampaignStep['reward']): React.ReactNode {
  if (!r) return null;
  const pos: Cost = {};
  for (const [k, v] of Object.entries(r.res ?? {})) if ((v ?? 0) > 0) (pos as Record<string, number>)[k] = v!;
  return (
    <span className="camp-reward small">
      {Object.keys(pos).length > 0 && <RewardLine cost={pos} />}
      {r.blueprint && <span className="pill small"><Icon name="blueprint" size={13} /> чертёж «{partByKey(r.blueprint)?.name}»</span>}
      {r.chevron && <span className="pill gold small"><Icon name="medal" size={13} /> шеврон «{chevronByKey(r.chevron)?.name}»</span>}
      {r.soldier && <span className="pill small"><Icon name="squad" size={13} /> боец «{r.soldier.name}»</span>}
    </span>
  );
}
function missionLimits(st: CampaignStep): string[] {
  const out: string[] = [];
  if (st.onlyTypes) out.push(`состав: только ${st.onlyTypes.map((t) => OPERATORS[t].name.toLowerCase()).join(', ')}`);
  if (st.minSize) out.push(`от ${st.minSize} операторов`);
  if (st.vehicles) out.push(`транспорт: ${st.vehicles.map((v) => VEHICLES[v].name).join(' или ')}`);
  if (st.needModel) out.push('нужна исправная модель дрона');
  if (st.night) out.push('ночью: сила +8%, разведка −10%');
  if (st.difficulty) out.push(`сложность ${st.difficulty}`);
  return out;
}

export function CampaignCard() {
  const { state } = useGame();
  const [open, setOpen] = useState(false);
  const st = CAMPAIGN[state.campaign.step];
  const ch = CHAPTERS.find((c) => c.n === (st?.chapter ?? 5))!;
  const done = !st;
  const lockLvl = chapterLockLevel(st, state.commander.level);
  const action = !st ? 'Кампания пройдена' : lockLvl ? `с ${lockLvl} ур. командира` : st.kind === 'scene' ? 'Новая сцена' : st.kind === 'choice' ? 'Нужно решение' : st.kind === 'mission' ? 'Задание готово' : 'Цель';
  return (
    <>
      <button className={`camp-card ${done ? 'done' : ''} ${st && (st.kind === 'scene' || st.kind === 'choice') ? 'ping' : ''}`} onClick={() => setOpen(true)}>
        <span className="camp-icon"><Icon name="book" size={28} /></span>
        <span className="camp-body">
          <span className="kicker">Кампания · глава {ch.n} из {CHAPTERS.length}</span>
          <b>{done ? 'Рубеж наш' : `«${ch.name}»: ${st.title}`}</b>
          <span className="small muted">{done ? 'Все главы пройдены. Спасибо за службу, командир.' : ch.text}</span>
          <span className="camp-prog" aria-label={`Пройдено ${state.campaign.step} из ${CAMPAIGN.length}`}>
            {CAMPAIGN.map((_, i) => <i key={i} className={i < state.campaign.step ? 'on' : i === state.campaign.step ? 'now' : ''} />)}
          </span>
        </span>
        <span className={`pill ${done ? '' : 'gold'} small`}>{action}</span>
      </button>
      {open && <CampaignSheet onClose={() => setOpen(false)} />}
    </>
  );
}

export function CampaignSheet({ onClose }: { onClose: () => void }) {
  const { state, act, go } = useGame();
  const step = state.campaign.step;
  const st = CAMPAIGN[step];
  const flags = state.campaign.flags;
  const lines = (st?.lines ?? []).filter((l) => !l.flag || flags[l.flag[0]] === l.flag[1]);
  const [chapter, setChapter] = useState(st?.chapter ?? CHAPTERS.length);
  return (
    <Sheet title="Сюжетная кампания" onClose={onClose} wide>
      <div className="chapters" role="tablist">
        {CHAPTERS.map((c) => {
          const steps = CAMPAIGN.map((s, i) => ({ s, i })).filter((x) => x.s.chapter === c.n);
          const doneN = steps.filter((x) => x.i < step).length;
          const locked = steps[0].i > step || state.commander.level < c.minLevel;
          return (
            <button key={c.n} role="tab" aria-selected={chapter === c.n} className={`chapter ${chapter === c.n ? 'on' : ''} ${locked ? 'locked' : ''} ${doneN === steps.length ? 'done' : ''}`} onClick={() => !locked && setChapter(c.n)} disabled={locked}>
              <span className="kicker">Глава {c.n}</span>
              <b>{locked ? (state.commander.level < c.minLevel ? `с ${c.minLevel} ур.` : '???') : c.name}</b>
              <small>{doneN}/{steps.length}</small>
            </button>
          );
        })}
      </div>
      <ol className="camp-steps">
        {CAMPAIGN.map((s, i) => ({ s, i })).filter((x) => x.s.chapter === chapter).map(({ s, i }) => (
          <li key={s.key} className={i < step ? 'done' : i === step ? 'now' : 'next'}>
            <Icon name={i < step ? 'check' : s.kind === 'mission' ? 'flag' : s.kind === 'goal' ? 'compass' : s.kind === 'choice' ? 'route' : 'radio'} size={16} />
            <span>{i <= step ? s.title : 'Скоро'}</span>
            {i < step && s.kind === 'choice' && flags[s.key] && <small className="muted"> — {s.options?.find((o) => o.key === flags[s.key])?.label.toLowerCase()}</small>}
          </li>
        ))}
      </ol>

      {!st && (
        <Speech who="sova">Кампания пройдена. Рубеж — наш. Дальше — карта, рота и события выходных: служба продолжается.</Speech>
      )}
      {st && st.chapter === chapter && chapterLockLevel(st, state.commander.level) > 0 && (
        <Speech who="sova">
          Глава {st.chapter} «{CHAPTERS[st.chapter - 1].name}» откроется, когда командир дорастёт до {chapterLockLevel(st, state.commander.level)} уровня. Опыт дают походы — чем сложнее сектор, тем больше.
        </Speech>
      )}
      {st && st.chapter === chapter && !chapterLockLevel(st, state.commander.level) && (
        <div className="camp-now">
          <h3>
            <Icon name="flag" size={18} /> Сейчас: {st.title}
          </h3>
          {(st.kind === 'scene' || st.kind === 'choice') && (
            <div className="dialog">
              {lines.map((l, i) => (
                <div key={i} className="dialog-line" style={{ animationDelay: `${0.1 + i * 0.35}s` }}>
                  <Speech who={l.who} compact>{l.text}</Speech>
                </div>
              ))}
            </div>
          )}
          {st.kind === 'scene' && (
            <>
              {rewardText(st.reward)}
              <Button onClick={() => act('campaignAck', { key: st.key })}>
                <Icon name="arrow" size={18} /> Дальше
              </Button>
            </>
          )}
          {st.kind === 'choice' && (
            <div className="choices">
              {st.options!.map((o) => (
                <div key={o.key} className="choice">
                  <b>{o.label}</b>
                  {rewardText(o.reward)}
                  {(o.reward.res?.supplies ?? 0) < 0 && <span className="small red">−{-o.reward.res!.supplies!} припасов</span>}
                  <Button kind="secondary" small onClick={() => { if (confirm(`Решение «${o.label}» нельзя будет изменить. Уверены?`)) act('campaignChoose', { key: st.key, option: o.key }); }}>
                    Выбрать
                  </Button>
                </div>
              ))}
              <p className="tiny muted">Выбор меняет реплики героев и награду, но не закрывает дальнейший путь.</p>
            </div>
          )}
          {st.kind === 'goal' && (() => {
            const p = goalProgress(state, st);
            return (
              <div className="camp-goal">
                <p>{st.goal!.text}</p>
                <Bar value={Math.min(p.value, p.target)} max={p.target} />
                <div className="between small">
                  {rewardText(st.reward)}
                  <span className="num muted">{Math.min(p.value, p.target)}/{p.target}</span>
                </div>
                <p className="tiny muted">Цель засчитывается сама, как только условие выполнено.</p>
              </div>
            );
          })()}
          {st.kind === 'mission' && (() => {
            const s = sectorById(st.sectorId!)!;
            const ss = state.sectors.find((x) => x.id === s.id)!;
            return (
              <div className="camp-goal">
                <p>
                  <b>{MISSIONS[st.mission!].name}</b> в секторе «{s.name}». {missionLimits(st).join(' · ')}.
                </p>
                {rewardText(st.reward)}
                <Button
                  disabled={!ss.unlocked}
                  why={!ss.unlocked ? `Сектор ещё в тумане: ${ss.lockReason}` : ''}
                  onClick={() => { onClose(); go('map', `campaign-${st.key}`); }}
                >
                  <Icon name="squad" size={18} /> Собрать группу
                </Button>
                <p className="tiny muted">Сюжет продвинется только при успехе. Неудачу можно повторить.</p>
              </div>
            );
          })()}
        </div>
      )}
    </Sheet>
  );
}

/* ═════════════ События выходных ═════════════ */

export function EventCard() {
  const { state, act, now } = useGame();
  const ev = state.event;
  const claimWeek = ev.active ? ev.week : ev.week - 1;
  const def = EVENTS[mod(claimWeek, EVENTS.length)];
  const next = EVENTS[mod(ev.week, EVENTS.length)];
  const showTiers = ev.active || ev.points > 0;
  return (
    <section className={`panel event-card ${ev.active ? 'live' : ''}`}>
      <div className="between">
        <h2>
          <Icon name={ev.active ? def.icon : 'event'} size={20} /> {ev.active ? `Событие: ${def.name}` : 'События выходных'}
        </h2>
        {ev.active ? (
          <span className="pill gold small"><Icon name="clock" size={13} /> ещё <Countdown start={ev.start} end={ev.end} /></span>
        ) : (
          <span className="pill small"><Icon name="clock" size={13} /> через {fmtLong(Math.max(0, (ev.nextStart - now) / 1000))}</span>
        )}
      </div>
      {ev.active ? (
        <p className="small">{def.text}</p>
      ) : (
        <p className="small muted">
          С пятницы 18:00 до понедельника 06:00 (МСК). Следующее — <b>«{next.name}»</b>: {next.text}
        </p>
      )}
      {showTiers && (
        <>
          <div className="between small">
            <span>Очки события{!ev.active ? ` «${def.name}»` : ''}: <b className="num">{ev.points}</b></span>
            <span className="muted tiny">{Object.entries(def.points).map(([k, v]) => `${POINT_NAMES[k] ?? k} +${v}`).join(' · ')}</span>
          </div>
          <div className="ev-tiers">
            {def.tiers.map((t, i) => {
              const claimed = !!ev.claimed[`claimed${i}`];
              const ready = ev.points >= t.points && !claimed;
              return (
                <div key={i} className={`ev-tier ${claimed ? 'claimed' : ready ? 'ready' : ''}`}>
                  <span className="num">{t.points}</span>
                  <Bar value={Math.min(ev.points, t.points)} max={t.points} tone={claimed ? 'olive' : undefined} />
                  <span className="small">
                    <RewardLine cost={t.reward} />
                    {t.blueprint && <span className="pill small"><Icon name="blueprint" size={12} /> чертёж</span>}
                    {t.chevron && <Chevron def={t.chevron} size={30} />}
                  </span>
                  {ready ? (
                    <button className="btn primary small" onClick={() => act('eventClaim', { tier: i })}>
                      <Icon name="gift" size={15} /> Забрать
                    </button>
                  ) : (
                    <Icon name={claimed ? 'check' : 'lock'} size={16} className="muted" />
                  )}
                </div>
              );
            })}
          </div>
          {!ev.active && <p className="tiny muted">Награды прошлого события можно забрать до начала следующего.</p>}
        </>
      )}
    </section>
  );
}
const POINT_NAMES: Record<string, string> = {
  raid_win: 'рейд', stronghold_win: 'штурм', expedition_win: 'экспедиция', supply_win: 'снабжение', recon_win: 'разведка', research: 'исследование',
  craft: 'сборка', repair: 'ремонт', model: 'модель', defended: 'отбитая атака', pvp_win: 'набег',
};

/* ═════════════ Достижения ═════════════ */

export function AchievementsPanel() {
  const { state } = useGame();
  const [open, setOpen] = useState(false);
  const got = state.achievements.filter((a) => a.tier > 0).length;
  const title = achTitle(state.achPoints);
  const nextT = ACH_TITLES.find(([p]) => p > state.achPoints);
  return (
    <section className="panel">
      <div className="between">
        <h2>
          <Icon name="trophy" size={20} /> Достижения · {got}/{ACHIEVEMENTS.length}
        </h2>
        <span className="pill gold small"><Icon name="star" size={13} /> {title}</span>
      </div>
      <Bar value={state.achPoints - (ACH_TITLES.filter(([p]) => p <= state.achPoints).pop()?.[0] ?? 0)} max={nextT ? nextT[0] - (ACH_TITLES.filter(([p]) => p <= state.achPoints).pop()?.[0] ?? 0) : 1} />
      <p className="tiny muted">
        {state.achPoints} очков{nextT ? ` · до звания «${nextT[1]}» — ${nextT[0] - state.achPoints}` : ' · высшее звание'}. Звание видят сослуживцы в профиле.
      </p>
      <div className="ach-mini">
        {state.achievements.filter((a) => a.tier > 0).slice(0, 8).map((a) => {
          const d = ACHIEVEMENTS.find((x) => x.key === a.key)!;
          return (
            <span key={a.key} className={`ach-badge t${a.tier}`} title={`${d.name} — ${TIER_NAMES[a.tier - 1]}`}>
              <Icon name={d.icon} size={18} />
            </span>
          );
        })}
      </div>
      <button className="btn secondary" onClick={() => setOpen(true)}>
        <Icon name="trophy" size={18} /> Все достижения
      </button>
      {open && <AchievementsSheet onClose={() => setOpen(false)} />}
    </section>
  );
}

function AchievementsSheet({ onClose }: { onClose: () => void }) {
  const { state } = useGame();
  return (
    <Sheet title="Достижения" onClose={onClose} wide>
      <p className="small muted">
        У каждого достижения три ступени: бронза ({ACH_POINTS[0]} очков), серебро ({ACH_POINTS[1]}) и золото ({ACH_POINTS[2]}). Награды приходят сразу.
      </p>
      <div className="ach-grid">
        {ACHIEVEMENTS.map((d) => {
          const a = state.achievements.find((x) => x.key === d.key) ?? { value: 0, tier: 0 };
          const target = a.tier >= 3 ? d.tiers[2] : d.tiers[a.tier];
          return (
            <div key={d.key} className={`ach-card t${a.tier}`}>
              <span className={`ach-badge t${a.tier}`}><Icon name={d.icon} size={22} /></span>
              <span className="ach-body">
                <b>{d.name}</b>
                <small className="muted">{d.text}: {a.value}{a.tier < 3 ? ` / ${target}` : ''}</small>
                <Bar value={Math.min(a.value, target)} max={target} tone={a.tier >= 3 ? 'olive' : undefined} />
                <span className="ach-steps">
                  {d.tiers.map((t, i) => <i key={i} className={i < a.tier ? `on t${i + 1}` : ''} title={`${TIER_NAMES[i]}: ${t}`} />)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

/* ═════════════ Конструктор дронов и модели ═════════════ */

const LAYER_KEY: Record<string, string> = {
  f_light: 'frame_light', f_std: 'frame_universal', f_heavy: 'frame_heavy', f_carbon: 'frame_carbon',
  m_std: 'motors_standard', m_fast: 'motors_speed', m_torque: 'motors_torque', m_silent: 'motors_silent',
  b_std: 'battery_standard', b_ext: 'battery_capacity', b_cold: 'battery_cold',
  c_std: 'camera_standard', c_zoom: 'camera_zoom', c_thermal: 'camera_thermal', c_night: 'camera_night',
  p_std: 'payload_standard', p_heavy: 'payload_heavy', p_cluster: 'payload_cluster',
  l_std: 'link_standard', l_long: 'link_long', l_mesh: 'link_mesh',
};
/** Модульный дрон из нарисованных слоёв; рама перекрашивается в цвет модели. */
function DroneSketch({ color, parts, size = 120 }: { color: string; parts: Record<DroneSlot, string>; size?: number }) {
  const url = (slot: DroneSlot) => `img/drone/${LAYER_KEY[parts[slot]] ?? LAYER_KEY[DEFAULT_MODEL[slot]]}.webp`;
  const frame = url('frame');
  return (
    <span className="drone-sketch" style={{ width: size, height: (size * DRONE_LAYER_SIZE.h) / DRONE_LAYER_SIZE.w }} aria-hidden>
      {DRONE_LAYER_ORDER.map((slot) => (
        <React.Fragment key={slot}>
          <img src={url(slot)} alt="" draggable={false} />
          {slot === 'frame' && parts.frame !== 'f_carbon' && (
            <i className="tint" style={{ background: color, WebkitMaskImage: `url(${frame})`, maskImage: `url(${frame})` }} />
          )}
        </React.Fragment>
      ))}
    </span>
  );
}

export function ConstructorSheet({ onClose, initial }: { onClose: () => void; initial?: OperatorType }) {
  const { state, act, now } = useGame();
  const affordable = useAffordable();
  const [cls, setCls] = useState<OperatorType>(initial ?? 'fpv');
  const existing = state.models.find((m) => m.cls === cls);
  const [parts, setParts] = useState<Record<DroneSlot, string>>(existing?.parts ?? DEFAULT_MODEL);
  const [name, setName] = useState(existing?.name ?? '');
  const [color, setColor] = useState(existing?.color ?? MODEL_COLORS[0]);
  const pickCls = (c: OperatorType) => {
    setCls(c);
    const m = state.models.find((x) => x.cls === c);
    setParts(m?.parts ?? DEFAULT_MODEL);
    setName(m?.name ?? '');
    setColor(m?.color ?? MODEL_COLORS[0]);
  };
  const cost = costScale(modelCost(parts), workshopMulAt(now)) as Cost;
  const mods = modelMods(parts);
  const wsJobs = state.jobs.filter((j) => j.queue === 'workshop');
  let why = '';
  if ((state.buildings.testrange ?? 0) < 1) why = 'Сначала постройте «Полигон испытаний»';
  else if (state.jobs.some((j) => j.kind === 'drone_model')) why = 'Одна модель собирается за раз';
  else if (wsJobs.length >= 3) why = 'Очередь мастерской заполнена';
  else if (name.trim().length < 2) why = 'Назовите модель (от 2 символов)';
  else if (!affordable(cost)) why = 'Не хватает ресурсов';
  const k = 1 + 0.04 * (state.buildings.testrange ?? 0);
  return (
    <Sheet title="Конструктор дронов" onClose={onClose} wide>
      <Speech who="batya" compact>
        Модель — это дрон под конкретный класс операторов. Чем больше в группе операторов этого класса, тем сильнее её эффект. Новая модель заменяет старую.
      </Speech>
      <div className="seg small" role="tablist">
        {MODEL_CLASSES.map((c) => (
          <button key={c} role="tab" aria-selected={cls === c} className={cls === c ? 'on' : ''} onClick={() => pickCls(c)}>
            <Icon name={c} size={16} /> {OPERATORS[c].name}
          </button>
        ))}
      </div>
      <div className="ctor">
        <div className="ctor-preview">
          <DroneSketch color={color} parts={parts} size={190} />
          <input className="input" value={name} maxLength={24} placeholder="Название модели" onChange={(e) => setName(e.target.value)} aria-label="Название модели" />
          <div className="swatches" role="radiogroup" aria-label="Окраска">
            {MODEL_COLORS.map((c) => (
              <button key={c} role="radio" aria-checked={color === c} className={color === c ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Цвет ${c}`} />
            ))}
          </div>
          <div className="ctor-stats">
            <span className="kicker">Эффект при полном составе</span>
            <b>{modsText(Object.fromEntries(Object.entries(mods).map(([a, b]) => [a, (b as number) * k]))) || '—'}</b>
            {existing && (
              <span className="tiny muted">
                Сейчас «{existing.name}»: {modsText(Object.fromEntries(Object.entries(modelMods(existing.parts)).map(([a, b]) => [a, (b as number) * k]))) || '—'}
              </span>
            )}
            {state.buildings.testrange > 1 && <span className="tiny muted">Полигон испытаний {state.buildings.testrange} ур.: эффект +{Math.round((k - 1) * 100)}%</span>}
          </div>
        </div>
        <div className="ctor-slots">
          {DRONE_SLOTS.map((sl) => (
            <div key={sl.key} className="ctor-slot">
              <span className="kicker"><Icon name={sl.icon} size={13} /> {sl.name}</span>
              <div className="part-row">
                {DRONE_PARTS.filter((p) => p.slot === sl.key).map((p) => {
                  const locked = !!p.blueprint && !state.blueprints.includes(p.key);
                  return (
                    <button
                      key={p.key}
                      className={`part ${parts[sl.key] === p.key ? 'on' : ''} ${locked ? 'locked' : ''} ${p.blueprint ? 'bp' : ''}`}
                      disabled={locked}
                      onClick={() => setParts((x) => ({ ...x, [sl.key]: p.key }))}
                      title={locked ? 'Нужен чертёж' : p.text}
                    >
                      <b>{locked ? <Icon name="lock" size={14} /> : PART_ICONS[p.key] ? <Icon name={PART_ICONS[p.key]} size={18} /> : null} {p.name}</b>
                      <small>{modsText(p.mods)}</small>
                      <small className="muted"><CostLine cost={p.cost} check={false} /></small>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="price">
        <CostLine cost={cost} />
        <span className="time-chip"><Icon name="clock" size={15} /> {fmtLong(modelTime(parts))}</span>
        {workshopMulAt(now) < 1 && <span className="pill gold small">скидка недели мастерской</span>}
      </div>
      <Button disabled={!!why} why={why} onClick={async () => { if (await act('buildModel', { cls, name: name.trim(), color, parts })) onClose(); }}>
        <Icon name="drone" size={18} /> {existing ? 'Собрать новую модель' : 'Собрать модель'}
      </Button>
    </Sheet>
  );
}

function Durability({ value }: { value: number }) {
  return (
    <span className="dura" title={`Прочность ${value}%`}>
      <Bar value={value} tone={value < 25 ? 'red' : value >= 50 ? 'olive' : undefined} />
      <small className={value <= 0 ? 'red' : value < 50 ? 'amber' : 'muted'}>
        {value <= 0 ? 'сломано' : `прочность ${value}%${value < 50 ? ` · эффект ${Math.round(wearFactor(value) * 100)}%` : ''}`}
      </small>
    </span>
  );
}

export function EquipmentWear({ e }: { e: Equipment }) {
  const { state, act, now } = useGame();
  const affordable = useAffordable();
  const d = e.durability ?? 100;
  if (d >= 100) return <Durability value={100} />;
  const cost = equipRepairCostOf(e.rarity, d, state.buildings.repairyard ?? 0, now) as Cost;
  const why = e.status !== 'ready' ? 'В походе' : !affordable(cost) ? 'Не хватает ресурсов' : '';
  return (
    <>
      <Durability value={d} />
      <Button small kind="secondary" disabled={!!why} why={why} onClick={() => act('repairEquipment', { id: e.id })}>
        <Icon name="wrench" size={15} /> Ремонт <CostLine cost={cost} check={false} />
      </Button>
    </>
  );
}

export function ModelsPanel() {
  const { state, act, now } = useGame();
  const affordable = useAffordable();
  const [ctor, setCtor] = useState<OperatorType | null>(null);
  const tr = state.buildings.testrange ?? 0;
  const job = state.jobs.find((j) => j.kind === 'drone_model');
  return (
    <section className="panel">
      <div className="between">
        <h2>
          <Icon name="drone" size={20} /> Модели дронов · {state.models.length}/{MODEL_CLASSES.length}
        </h2>
        {tr > 0 && (
          <button className="btn primary small" onClick={() => setCtor('fpv')}>
            <Icon name="plus" size={15} /> Конструктор
          </button>
        )}
      </div>
      {tr < 1 ? (
        <Speech who="batya" compact>
          Свои дроны соберём, когда построишь «Полигон испытаний» (с командного пункта 4 уровня). Будет и рама, и моторы, и камера — всё под задачу.
        </Speech>
      ) : (
        <div className="models">
          {MODEL_CLASSES.map((c) => {
            const m = state.models.find((x) => x.cls === c);
            if (!m)
              return (
                <button key={c} className="model-card empty" onClick={() => setCtor(c)}>
                  <Icon name={c} size={22} />
                  <span><b>{OPERATORS[c].name}</b><small className="muted">модели нет — собрать</small></span>
                </button>
              );
            const cost = modelRepairCostOf(m.durability, state.buildings.repairyard ?? 0, now) as Cost;
            return (
              <div key={c} className="model-card">
                <DroneSketch color={m.color} parts={m.parts} size={86} />
                <span className="model-info">
                  <b>«{m.name}»</b>
                  <small className="muted">{OPERATORS[c].name.toLowerCase()} · {modsText(modelMods(m.parts))}</small>
                  <Durability value={m.durability} />
                  <span className="row">
                    {m.durability < 100 && (
                      <Button small kind="secondary" disabled={!affordable(cost)} why="Не хватает ресурсов" onClick={() => act('repairModel', { cls: c })}>
                        <Icon name="wrench" size={14} /> <CostLine cost={cost} check={false} />
                      </Button>
                    )}
                    <button className="link" onClick={() => setCtor(c)}>переделать</button>
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
      {job && <p className="small amber"><Icon name="wrench" size={14} /> Собирается «{job.payload.name}» — <Countdown start={job.startAt} end={job.endAt} /></p>}
      {tr > 0 && <BlueprintsBox />}
      {ctor && <ConstructorSheet initial={ctor} onClose={() => setCtor(null)} />}
    </section>
  );
}

function BlueprintsBox() {
  const { state, act } = useGame();
  const affordable = useAffordable();
  const an = state.buildings.analytics ?? 0;
  const left = BLUEPRINT_PARTS.filter((p) => !state.blueprints.includes(p));
  const cost = BUILDING_FX.analytics.decodeCost;
  return (
    <details className="roster-box">
      <summary>
        <Icon name="blueprint" size={15} /> Чертежи · {state.blueprints.length}/{BLUEPRINT_PARTS.length}
      </summary>
      <div className="bp-list">
        {BLUEPRINT_PARTS.map((k) => {
          const p = partByKey(k)!;
          const have = state.blueprints.includes(k);
          return (
            <span key={k} className={`bp ${have ? 'on' : ''}`}>
              <Icon name={have ? PART_ICONS[k] ?? 'blueprint' : 'lock'} size={18} /> {have ? p.name : '???'}
              {have && <small className="muted"> · {modsText(p.mods)}</small>}
            </span>
          );
        })}
      </div>
      <p className="tiny muted">Чертежи достаются за сюжет, опорные пункты, события выходных и случайные находки.</p>
      {an > 0 && left.length > 0 && (
        <Button small kind="secondary" disabled={!affordable(cost)} why="Не хватает ресурсов" onClick={() => act('decodeBlueprint')}>
          <Icon name="analytics" size={15} /> Расшифровать чертёж · <CostLine cost={cost} check={false} />
        </Button>
      )}
    </details>
  );
}

/* ═════════════ Передовые пункты ═════════════ */

export function outpostLimit(hq: number) {
  return hq >= OUTPOST.hqSecond ? 2 : hq >= OUTPOST.hqFirst ? 1 : 0;
}

export function OutpostsPanel() {
  const { state, act } = useGame();
  const affordable = useAffordable();
  const max = outpostLimit(state.buildings.hq);
  const busy = state.jobs.find((j) => j.queue === 'outpost');
  if (!max && !state.outposts.length)
    return (
      <p className="small muted panel-note">
        <Icon name="outpost" size={15} /> Передовые пункты — с командного пункта {OUTPOST.hqFirst} уровня: походы рядом короче и дешевле.
      </p>
    );
  return (
    <section className="panel">
      <h2>
        <Icon name="outpost" size={20} /> Передовые пункты · {state.outposts.length}/{max}
      </h2>
      <p className="small muted">
        Пункт ставится в секторе с контролем от {OUTPOST.minControl}%. Походы в этот и соседние секторы — быстрее и экономнее. Противник иногда атакует пункты: держите оборону полигона.
      </p>
      {state.outposts.map((o) => {
        const s = sectorById(o.sector_id);
        const cost = OUTPOST.upgradeCost(o.level);
        const why = o.level >= OUTPOST.maxLevel ? 'Максимум' : busy ? 'Бригада занята' : !affordable(cost) ? 'Не хватает ресурсов' : '';
        return (
          <div key={o.id} className="outpost-row">
            <span className="qicon"><Icon name="outpost" size={20} /></span>
            <span className="grow">
              <b>«{s?.name}» · {o.level} ур.</b>
              <small className="muted">
                путь −{Math.round(OUTPOST.timeCut(o.level) * 100)}%, топливо −{Math.round(OUTPOST.fuelCut(o.level) * 100)}% · оборона {OUTPOST.defense(o.level, state.defense)}
              </small>
            </span>
            {o.level < OUTPOST.maxLevel && (
              <Button small kind="secondary" disabled={!!why} why={why} onClick={() => act('outpostUpgrade', { id: o.id })}>
                <Icon name="up" size={14} /> <CostLine cost={cost} check={false} /> · {fmtLong(OUTPOST.upgradeTime(o.level))}
              </Button>
            )}
          </div>
        );
      })}
      {busy && <p className="small amber"><Icon name="wrench" size={14} /> Бригада работает — <Countdown start={busy.startAt} end={busy.endAt} /></p>}
      {state.outposts.length < max && !busy && <p className="tiny muted">Чтобы поставить новый пункт, откройте сектор под контролем на карте.</p>}
    </section>
  );
}

export function OutpostSectorBlock({ sectorId }: { sectorId: number }) {
  const { state, act } = useGame();
  const affordable = useAffordable();
  const here = state.outposts.find((o) => o.sector_id === sectorId);
  const ss = state.sectors.find((s) => s.id === sectorId)!;
  const max = outpostLimit(state.buildings.hq);
  const building = state.jobs.find((j) => j.kind === 'outpost_build');
  if (here)
    return (
      <div className="outpost-here small">
        <Icon name="outpost" size={16} /> Здесь стоит наш передовой пункт {here.level} ур.: путь −{Math.round(OUTPOST.timeCut(here.level) * 100)}%, топливо −{Math.round(OUTPOST.fuelCut(here.level) * 100)}%.
      </div>
    );
  if (building?.payload.sectorId === sectorId) return <div className="outpost-here small"><Icon name="wrench" size={16} /> Строим передовой пункт — <Countdown start={building.startAt} end={building.endAt} /></div>;
  if (!max || ss.control < OUTPOST.minControl) return null;
  const used = state.outposts.length + (building ? 1 : 0);
  let why = '';
  if (used >= max) why = `Сейчас можно держать не больше ${max}`;
  else if (state.jobs.some((j) => j.queue === 'outpost')) why = 'Бригада занята';
  else if (!affordable(OUTPOST.buildCost)) why = 'Не хватает ресурсов';
  return (
    <div className="outpost-build">
      <span className="small"><Icon name="outpost" size={16} /> Сектор под контролем — можно поставить передовой пункт. <CostLine cost={OUTPOST.buildCost} /> · {fmtLong(OUTPOST.buildTime)}</span>
      <Button small disabled={!!why} why={why} onClick={() => act('outpostBuild', { sectorId })}>
        <Icon name="plus" size={15} /> Поставить пункт
      </Button>
    </div>
  );
}

/* ═════════════ Случайные встречи ═════════════ */

export function EncounterBlock({ r }: { r: Report }) {
  const { act, state } = useGame();
  const enc = state.reports.find((x) => x.id === r.id)?.encounter ?? r.encounter;
  const [local, setLocal] = useState<Report['encounter'] | null>(null);
  const e = local ?? enc;
  if (!e) return null;
  const def = ENCOUNTERS.find((x) => x.key === e.key);
  if (!def) return null;
  return (
    <section className="encounter">
      <h3>
        <Icon name="sparkle" size={18} /> В пути: {def.title}
      </h3>
      <Speech who={def.who}>{def.text}</Speech>
      {e.resolved ? (
        <div className="enc-result">
          <span className="kicker">Решение: {def.options[e.option ?? 0]?.label}</span>
          <p>{e.result}</p>
          {!!e.gains?.length && <p className="small amber">{e.gains.join(', ')}</p>}
        </div>
      ) : (
        <div className="choices">
          {def.options.map((o, i) => (
            <Button key={i} kind={i === 0 ? 'primary' : 'secondary'} small onClick={async () => { const x = await act('encounterChoose', { reportId: r.id, option: i }); if (x) setLocal(x.data); }}>
              {o.label}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}

/* ═════════════ Бойцы: специализация, инструкторы, усталость, расчёты ═════════════ */

export function SoldierDeep({ s }: { s: Soldier }) {
  const { state, act, now } = useGame();
  const affordable = useAffordable();
  const fat = Math.round(fatigueNow(s.fatigue, s.fatigue_at, now));
  const spec = SPECS.find((x) => x.key === s.spec);
  const options = SPECS.filter((x) => x.type === s.type);
  const mates = Object.entries(s.bonds ?? {}).filter(([, n]) => n >= 10).map(([id]) => state.soldiers.find((x) => x.id === Number(id))).filter((x) => x && x.status !== 'lost');
  const instructors = state.soldiers.filter((x) => x.instructor && x.status !== 'lost').length;
  return (
    <span className="sol-deep">
      {fat > 0 && <span className={`tag ${fat >= 60 ? 'r-bad' : ''}`}><Icon name="fatigue" size={14} /> усталость {fat}%</span>}
      {spec && <span className="tag gold"><Icon name="star" size={11} /> {spec.name}: {spec.text.toLowerCase()}</span>}
      {s.instructor && <span className="tag"><Icon name="instructor" size={14} /> инструктор</span>}
      {mates.length > 0 && <span className="tag"><Icon name="bond" size={14} /> расчёт с {mates.map((m) => `«${m!.name}»`).join(', ')}</span>}
      {s.status !== 'lost' && (
        <span className="sol-actions">
          {!s.spec && s.level >= SPEC_LEVEL && options.map((o) => (
            <button key={o.key} className="btn secondary small" title={o.text} onClick={() => { if (confirm(`«${s.name}» станет «${o.name}» (${o.text}). Специализацию нельзя сменить.`)) act('soldierSpec', { id: s.id, spec: o.key }); }}>
              {o.name}
            </button>
          ))}
          {s.level >= SOLDIER_MAX_LEVEL && (s.instructor || instructors < MAX_INSTRUCTORS) && (
            <button className="link" onClick={() => act('setInstructor', { id: s.id, on: !s.instructor })}>
              {s.instructor ? 'вернуть в строй' : 'назначить инструктором'}
            </button>
          )}
          {s.scars > 0 && (state.buildings.medbay ?? 0) > 0 && (
            <button className="link" disabled={!affordable(healScarsCost(s.scars))} onClick={() => act('healScars', { id: s.id })}>
              свести шрамы ({healScarsCost(s.scars).supplies} припасов)
            </button>
          )}
        </span>
      )}
    </span>
  );
}

/* ═════════════ Талисманы ═════════════ */

export function MascotsRow() {
  const { state } = useGame();
  if (!state.mascots.length) return null;
  return (
    <div className="mascots">
      {state.mascots.map((k) => (
        <span key={k} className="mascot">
          <Icon name={k === 'cat' || k === 'dog' ? k : 'paw'} size={26} /> <b>{MASCOTS[k]?.name}</b> <small className="muted">{MASCOTS[k]?.text}</small>
        </span>
      ))}
    </div>
  );
}
