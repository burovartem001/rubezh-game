/** Интерфейс систем долгой игры. */
import React, { useEffect, useMemo, useState } from 'react';
import {
  EQUIPMENT, MAX_EQUIPMENT_PER_GROUP, OPERATORS, OPERATOR_TYPES, OperatorType, RES_KEYS, RES_NAMES, ResKey, SectorDef, VEHICLES, VEHICLE_TYPES,
  VehicleType, OUTCOME_NAMES, equipmentEffectText,
} from '../../../shared/config';
import { Group, groupSize, outcomeRangeText, planExpedition } from '../../../shared/calc';
import {
  CHEVRON_SETS, chevronByKey,
} from '../../../shared/chevrons';
import {
  HOT_WINDOW, PRESTIGE_LEVEL, PRESTIGE_MAX, PVP, RESEARCH, RESEARCH_BRANCHES, RESEARCH_COST, SEASON_STORY, SOLDIER_LEVELS, SOLDIER_MAX_LEVEL, STREAK_REWARDS,
  TRAITS, composeParts, dispatchParts, mapEventAt, modsText, prestigeMods, researchPrereq, seasonTheme,
} from '../../../shared/progression';
import { COMMANDER_TITLES } from '../../../shared/lore';
import { CompanyDetail, CompanyListItem, GameState, LeaderRow, PvpTarget, Soldier, api } from '../api';
import { useGame } from '../game';
import { Bar, Button, Countdown, CostLine, JobProgress, RewardLine, Sheet, Sprite, Stepper, fmtDur, fmtLong, useAffordable } from '../ui';
import { Icon } from '../art/icons';
import { Portrait, Speech, VehicleArt } from '../art/art';
import { Chevron } from '../art/Chevron';

function fmtLeft(sec: number): string {
  if (sec >= 48 * 3600) return `${Math.floor(sec / 86400)} дн ${Math.floor((sec % 86400) / 3600)} ч`;
  return fmtLong(sec);
}
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

/** Лучшие свободные бойцы под состав — так же, как выбирает сервер. */
export function pickSoldiersClient(state: GameState, group: Group): Soldier[] {
  const out: Soldier[] = [];
  for (const t of OPERATOR_TYPES) {
    const n = group[t] ?? 0;
    if (!n) continue;
    out.push(...state.soldiers.filter((s) => s.type === t && s.status === 'ready').sort((a, b) => b.level - a.level || b.xp - a.xp).slice(0, n));
  }
  return out;
}
export function bonusFor(state: GameState, sectorId: number, now: number, group: Group) {
  const chosen = pickSoldiersClient(state, group).map((s) => ({ type: s.type, level: s.level, trait: s.trait }));
  return composeParts(dispatchParts(state.modParts, sectorId, now, chosen));
}

/* ═════════════ Полигон: штаб — серия, контракты, сезон, исследования, оборона ═════════════ */

export function HqPanels() {
  const [research, setResearch] = useState(false);
  return (
    <>
      <div className="grid2">
        <StreakCard />
        <SeasonCard />
      </div>
      <div className="grid2">
        <ContractsCard />
        <section className="panel">
          <h2>
            <Icon name="data" size={20} /> Лаборатория и оборона
          </h2>
          <ResearchSummary onOpen={() => setResearch(true)} />
          <DefenseSummary />
        </section>
      </div>
      {research && <ResearchSheet onClose={() => setResearch(false)} />}
    </>
  );
}

function StreakCard() {
  const { state, act } = useGame();
  const s = state.streak;
  const day = ((Math.max(1, s.streak) - 1) % 7) + 1;
  return (
    <section className="panel streak">
      <h2>
        <Icon name="clock" size={20} /> Серия входов · {s.streak} {s.streak === 1 ? 'день' : 'дн.'}
      </h2>
      <div className="streak-days">
        {STREAK_REWARDS.map((r, i) => (
          <div key={i} className={`sday ${i + 1 < day || (i + 1 === day && s.claimedToday) ? 'done' : ''} ${i + 1 === day ? 'today' : ''}`}>
            <b>{i + 1}</b>
            <Icon name={i === 6 ? 'gift' : 'supplies'} size={16} />
          </div>
        ))}
      </div>
      <div className="between">
        <span className="small">
          Сегодня: <RewardLine cost={s.reward} />
        </span>
        {s.claimedToday ? (
          <span className="olive small">
            <Icon name="check" size={14} /> получено
          </span>
        ) : (
          <button className="btn primary small claim" onClick={() => act('claimStreak')}>
            <Icon name="gift" size={16} /> Забрать
          </button>
        )}
      </div>
      <p className="tiny muted">Заходите каждый день: седьмой день — большой паёк. Пропуск сбрасывает серию.</p>
    </section>
  );
}

function ContractsCard() {
  const { state, act, now } = useGame();
  return (
    <section className="panel">
      <div className="between">
        <h2>
          <Icon name="reports" size={20} /> Контракты недели
        </h2>
        <span className="pill small">
          <Icon name="clock" size={13} /> {fmtLeft(Math.max(0, (state.week.endsAt - now) / 1000))}
        </span>
      </div>
      {state.contracts.map((c) => {
        const v = Math.min(c.target, state.weekly.counters[c.counter] ?? 0);
        const claimed = !!state.weekly.claimed[c.index];
        const ready = v >= c.target && !claimed;
        return (
          <div key={c.index} className={`daily-card ${claimed ? 'claimed' : ''} ${ready ? 'ready' : ''}`}>
            <div className="daily-icon">
              <Icon name={claimed ? 'check' : c.icon} size={22} />
            </div>
            <div className="daily-body">
              <b>{c.text}</b>
              <Bar value={v} max={c.target} tone={claimed ? 'olive' : undefined} />
              <div className="between small">
                <RewardLine cost={c.reward} />
                <span className="num muted">
                  {v}/{c.target}
                </span>
              </div>
            </div>
            {ready && (
              <button className="btn primary small claim" onClick={() => act('claimContract', { index: c.index })}>
                <Icon name="gift" size={16} /> Забрать
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}

function SeasonCard() {
  const { state, now } = useGame();
  const theme = seasonTheme(state.season.index);
  const step = state.season.counters.step ?? 0;
  const st = SEASON_STORY[Math.min(step, SEASON_STORY.length - 1)];
  const v = st.counter === 'points' ? state.season.points : state.season.counters[st.counter] ?? 0;
  return (
    <section className="panel season" style={{ borderColor: theme.tint }}>
      <div className="between">
        <h2>
          <Icon name="flag" size={20} /> Сезон {state.season.index}: «{theme.name}»
        </h2>
        <span className="pill small">
          <Icon name="clock" size={13} /> {fmtLeft(Math.max(0, (state.season.endsAt - now) / 1000))}
        </span>
      </div>
      <p className="small muted">
        {theme.text} <span className="amber">{modsText(theme.mods)}</span>
      </p>
      <div className="season-steps" aria-label="Сюжет сезона">
        {SEASON_STORY.map((s, i) => (
          <i key={i} className={i < step ? 'done' : i === step ? 'now' : ''} title={s.title} />
        ))}
      </div>
      {step >= SEASON_STORY.length ? (
        <Speech who="sova" compact>
          Сюжет сезона пройден. Шеврон «Герой сезона» — ваш. Дальше — борьба за место в рейтинге.
        </Speech>
      ) : (
        <Speech who={st.who} compact action={<div className="small"><Bar value={Math.min(v, st.target)} max={st.target} /> <span className="num muted">{Math.min(v, st.target)} / {st.target}</span> · награда <RewardLine cost={st.reward} /></div>}>
          <b>{st.title}.</b> {st.text}
        </Speech>
      )}
      <div className="between small">
        <span>
          <Icon name="star" size={14} /> Очки: неделя <b>{state.week.points}</b> · сезон <b>{state.season.points}</b>
        </span>
      </div>
    </section>
  );
}

function ResearchSummary({ onOpen }: { onOpen: () => void }) {
  const { state } = useGame();
  const job = state.jobs.find((j) => j.queue === 'research');
  const def = job ? RESEARCH.find((r) => r.key === job.payload.key) : null;
  return (
    <div className="lab-sum">
      <div className="between">
        <span>
          <Icon name="data" size={16} /> Изучено {state.research.length} из {RESEARCH.length}
        </span>
        <button className="btn secondary small" onClick={onOpen}>
          Исследования
        </button>
      </div>
      {job && def ? (
        <div className="qrow">
          <div className="between small">
            <span>«{def.name}»</span>
            <Countdown start={job.startAt} end={job.endAt} />
          </div>
          <JobProgress start={job.startAt} end={job.endAt} />
        </div>
      ) : (
        <p className="tiny muted">Лаборатория свободна — данные можно превратить в постоянные бонусы.</p>
      )}
    </div>
  );
}

function DefenseSummary() {
  const { state } = useGame();
  return (
    <div className="def-sum">
      <div className="between">
        <span>
          <Icon name="reb" size={16} /> Оборона полигона: <b>{state.defense}</b>
        </span>
        <span className="tiny muted">здание {state.buildings.defense} ур. + дежурные</span>
      </div>
      <p className="tiny muted">
        Противник проверяет полигоны примерно раз в 8 часов, другие командиры могут прийти с набегом. Чем больше свободных операторов дома и выше уровень обороны — тем надёжнее.
      </p>
    </div>
  );
}

export function ResearchSheet({ onClose }: { onClose: () => void }) {
  const { state, act } = useGame();
  const affordable = useAffordable();
  const busy = state.jobs.find((j) => j.queue === 'research');
  const done = new Set(state.research);
  return (
    <Sheet title="Исследования" onClose={onClose} wide>
      <Speech who="iskra" compact>
        Данные — это не просто цифры. Отдай их в лабораторию, и каждый поход станет чуть легче. Навсегда.
      </Speech>
      {busy && (
        <div className="qrow">
          <div className="between">
            <b>
              <Icon name="data" size={16} /> {RESEARCH.find((r) => r.key === busy.payload.key)?.name}
            </b>
            <Countdown start={busy.startAt} end={busy.endAt} />
          </div>
          <JobProgress start={busy.startAt} end={busy.endAt} />
        </div>
      )}
      <div className="research-grid">
        {RESEARCH_BRANCHES.map((b) => (
          <section key={b.key} className="branch">
            <header>
              <span className="branch-icon">
                <Icon name={b.icon} size={24} />
              </span>
              <h3>{b.name}</h3>
            </header>
            <div className="tree">
              {RESEARCH.filter((r) => r.branch === b.key).map((r) => {
                const tier = RESEARCH_COST[r.tier];
                const pre = researchPrereq(r);
                const isDone = done.has(r.key);
                const inWork = busy?.payload.key === r.key;
                let why = '';
                if (isDone) why = 'Изучено';
                else if (inWork) why = 'Идёт исследование';
                else if (busy) why = 'Лаборатория занята';
                else if (pre && !done.has(pre)) why = `Сначала «${RESEARCH.find((x) => x.key === pre)?.name}»`;
                else if (state.buildings.comms < tier.comms) why = `Нужен узел связи ${tier.comms} ур.`;
                else if (!affordable(tier.cost)) why = 'Не хватает ресурсов';
                return (
                  <div key={r.key} className={`node-skill ${isDone ? 'has max' : ''} ${why && !isDone ? 'closed' : ''}`}>
                    <span className="node-dot">{isDone ? <Icon name="check" size={16} /> : <b className="tiny">{r.tier}</b>}</span>
                    <div className="node-body">
                      <b>{r.name}</b>
                      <div className="small amber">{modsText(r.mods)}</div>
                      <div className="tiny muted">{r.text}</div>
                      {!isDone && (
                        <>
                          <div className="small">
                            <CostLine cost={tier.cost} /> · <Icon name="clock" size={13} /> {fmtLong(tier.time)}
                          </div>
                          <Button small kind={why ? 'secondary' : 'primary'} disabled={!!why} why={why} onClick={() => act('research', { key: r.key })}>
                            Изучить
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Sheet>
  );
}

/* ═════════════ Отряд: именные бойцы ═════════════ */

const STATUS_RU: Record<Soldier['status'], string> = { ready: 'в строю', mission: 'в походе', wounded: 'ранен', recovering: 'на восстановлении', lost: 'погиб' };

export function SoldierRoster({ type }: { type: OperatorType }) {
  const { state } = useGame();
  const list = state.soldiers.filter((s) => s.type === type && s.status !== 'lost').sort((a, b) => b.level - a.level || b.xp - a.xp);
  if (!list.length) return null;
  return (
    <details className="roster-box">
      <summary>
        <Icon name="squad" size={15} /> Бойцы поимённо · {list.length}
      </summary>
      <div className="soldiers">
        {list.map((s) => (
          <div key={s.id} className={`soldier s-${s.status}`}>
            <span className="sol-lvl" aria-label={`Уровень ${s.level}`}>
              {Array.from({ length: SOLDIER_MAX_LEVEL }, (_, i) => (
                <i key={i} className={i < s.level ? 'on' : ''} />
              ))}
            </span>
            <span className="sol-info">
              <b>«{s.name}»</b>
              <small>
                {TRAITS[s.trait].name} · {STATUS_RU[s.status]} · походов {s.missions}
                {s.scars ? ` · шрамов ${s.scars}` : ''}
              </small>
              {s.level < SOLDIER_MAX_LEVEL && <Bar value={s.xp - SOLDIER_LEVELS[s.level - 1]} max={SOLDIER_LEVELS[s.level] - SOLDIER_LEVELS[s.level - 1]} />}
            </span>
          </div>
        ))}
      </div>
      <p className="tiny muted">В поход уходят самые опытные. Опыт и черты бойцов дают группе бонусы — смотрите прогноз.</p>
    </details>
  );
}

export function Memorial() {
  const { state } = useGame();
  const lost = state.soldiers.filter((s) => s.status === 'lost');
  if (!lost.length) return null;
  return (
    <section className="panel memorial">
      <h2>
        <Icon name="flag" size={20} /> Помним
      </h2>
      <p className="small muted">Бойцы, которые не вернулись из походов. Их позывные остаются в истории полигона.</p>
      <div className="memorial-list">
        {lost.map((s) => (
          <span key={s.id} className="mem">
            <b>«{s.name}»</b>
            <small>
              {OPERATORS[s.type].name.toLowerCase()} · ур. {s.level} · {s.missions} походов{s.lost_at ? ` · ${fmtDate(s.lost_at)}` : ''}
            </small>
          </span>
        ))}
      </div>
    </section>
  );
}

/* ═════════════ Командир: комплекты, престиж, привязка к сайту ═════════════ */

export function SetsPanel() {
  const { state } = useGame();
  const owned = new Set(state.chevrons.map((c) => c.key));
  return (
    <section className="panel">
      <h2>
        <Icon name="sparkle" size={20} /> Комплекты
      </h2>
      <p className="small muted">Соберите все нашивки комплекта — получите постоянный бонус.</p>
      <div className="sets">
        {CHEVRON_SETS.map((st) => {
          const got = st.keys.filter((k) => owned.has(k)).length;
          const done = got === st.keys.length;
          return (
            <div key={st.key} className={`set-card ${done ? 'done' : ''}`}>
              <div className="between">
                <b>{st.name}</b>
                <span className={`pill small ${done ? 'gold' : ''}`}>{done ? 'активен' : `${got}/${st.keys.length}`}</span>
              </div>
              <div className="set-row">
                {st.keys.map((k) => (
                  <Chevron key={k} def={k} size={34} dim={!owned.has(k)} />
                ))}
              </div>
              <small className="amber">Бонус: {st.text}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function PrestigePanel() {
  const { state, act } = useGame();
  const can = state.commander.level >= PRESTIGE_LEVEL && state.prestige < PRESTIGE_MAX;
  const next = prestigeMods(state.prestige + 1);
  return (
    <section className="panel prestige">
      <h2>
        <Icon name="up" size={20} /> Новый рубеж · престиж {state.prestige}/{PRESTIGE_MAX}
      </h2>
      {state.prestige > 0 && <p className="small amber">Сейчас: {modsText(prestigeMods(state.prestige))}</p>}
      <p className="small muted">
        На {PRESTIGE_LEVEL} уровне командира полигон можно перевести на новый рубеж: здания, отряд, карта и уровень командира начинаются заново, а исследования, оснащение, нашивки, награды и рота остаются. Взамен — постоянный бонус и шеврон.
      </p>
      {state.prestige < PRESTIGE_MAX && <p className="small">Следующий престиж: <span className="amber">{modsText(next)}</span></p>}
      <Button
        disabled={!can}
        why={state.prestige >= PRESTIGE_MAX ? 'Максимальный престиж' : `Нужен командир ${PRESTIGE_LEVEL} уровня`}
        kind="secondary"
        onClick={() => confirm('Перевести полигон на новый рубеж? Здания, отряд, карта и уровень командира начнутся заново. Это необратимо.') && act('prestige')}
      >
        <Icon name="up" size={16} /> Перевести полигон
      </Button>
    </section>
  );
}

export function SiteLinkPanel() {
  const { state, act, now } = useGame();
  const [code, setCode] = useState<string | null>(state.linkCode?.code ?? null);
  return (
    <section className="panel">
      <h2>
        <Icon name="radio" size={20} /> Связь с «Учётом дронов»
      </h2>
      {state.siteLinked ? (
        <p className="olive small">
          <Icon name="check" size={14} /> Аккаунт привязан. Награды за заслуги на сайте будут приходить сюда.
        </p>
      ) : (
        <p className="small muted">Привяжите аккаунт сайта, чтобы получать награды за реальные заслуги: нашивки, особых бойцов, транспорт и оснащение.</p>
      )}
      {code && state.linkCode && state.linkCode.until > now ? (
        <div className="link-code">
          <span className="tiny muted">Код для сайта (ещё {fmtDur((state.linkCode.until - now) / 1000)}):</span>
          <b className="num">{code}</b>
        </div>
      ) : null}
      <button
        className="btn secondary small"
        onClick={async () => {
          const r = await act('linkCode');
          if (r) setCode(r.data?.code ?? null);
        }}
      >
        <Icon name="radio" size={16} /> {state.siteLinked ? 'Перепривязать' : 'Получить код привязки'}
      </button>
    </section>
  );
}

/* ═════════════ Рейтинг ═════════════ */

export function Leaderboard({ onOpen }: { onOpen: (id: number) => void }) {
  const [period, setPeriod] = useState<'week' | 'season' | 'all'>('week');
  const [data, setData] = useState<{ myRank: number | null; myPoints: number; me: number; rows: LeaderRow[] } | null>(null);
  useEffect(() => {
    setData(null);
    api.leaderboard(period).then(setData).catch(() => setData({ myRank: null, myPoints: 0, me: 0, rows: [] }));
  }, [period]);
  return (
    <section className="panel">
      <div className="seg">
        {(
          [
            ['week', 'Неделя'],
            ['season', 'Сезон'],
            ['all', 'За всё время'],
          ] as const
        ).map(([k, n]) => (
          <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>
            {n}
          </button>
        ))}
      </div>
      {period !== 'all' && data && (
        <p className="small">
          {data.myRank ? (
            <>
              Ваше место: <b className="amber">{data.myRank}</b> · {data.myPoints} очков
            </>
          ) : (
            <span className="muted">Вы ещё не набрали очков в этом периоде.</span>
          )}{' '}
          <span className="muted tiny">Награды по итогам: топ-1, топ-3, топ-10 и всем участникам.</span>
        </p>
      )}
      {!data && <p className="muted">Связь со штабом…</p>}
      <div className="mates">
        {data?.rows.map((p) => (
          <button key={p.id} className={`mate ${p.id === data.me ? 'me' : ''} ${p.rank <= 3 ? `top${p.rank}` : ''}`} onClick={() => onOpen(p.id)}>
            <span className="mate-rank num">{p.rank}</span>
            <Sprite img="operators" index={p.portrait % 4} className="mate-portrait" focusY={12} />
            <span className="mate-info">
              <b>
                «{p.callsign}» {p.tag && <em className="tag-co">[{p.tag}]</em>}
              </b>
              <small>
                {COMMANDER_TITLES[p.level - 1]} · ур. {p.level}
              </small>
            </span>
            <span className="lb-points num">{p.points}</span>
            <Chevron def={p.chevron} size={36} />
          </button>
        ))}
      </div>
    </section>
  );
}

/* ═════════════ Рота ═════════════ */

export function CompanyTab({ onOpenPlayer }: { onOpenPlayer: (id: number) => void }) {
  const { state } = useGame();
  if (!state.companyId) return <CompanyList />;
  return <CompanyView id={state.companyId} onOpenPlayer={onOpenPlayer} />;
}

function CompanyList() {
  const { act } = useGame();
  const [q, setQ] = useState('');
  const [list, setList] = useState<CompanyListItem[] | null>(null);
  const [meta, setMeta] = useState<{ limit: number; cost: any } | null>(null);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [motto, setMotto] = useState('');
  useEffect(() => {
    const t = setTimeout(() => api.companies(q).then((r) => { setList(r.companies); setMeta({ limit: r.limit, cost: r.cost }); }).catch(() => setList([])), 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <>
      <Speech who="sova">
        Вместе проще: общий склад, помощь в стройке и еженедельный штурм укрепрайона всей ротой. Вступите в роту или основайте свою.
      </Speech>
      <section className="panel">
        <h2>
          <Icon name="squad" size={20} /> Роты
        </h2>
        <label className="search">
          <Icon name="recon" size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по названию или тегу" aria-label="Поиск роты" />
        </label>
        {!list && <p className="muted">Связь со штабом…</p>}
        {list && !list.length && <p className="muted">Рот пока нет — станьте первым.</p>}
        <div className="mates">
          {list?.map((c) => (
            <div key={c.id} className="mate">
              <span className="co-tag">{c.tag}</span>
              <span className="mate-info">
                <b>{c.name}</b>
                <small className="muted">
                  {c.members}/{meta?.limit ?? 20} командиров{c.motto ? ` · «${c.motto}»` : ''}
                </small>
              </span>
              <button className="btn primary small" disabled={c.members >= (meta?.limit ?? 20)} onClick={() => act('companyJoin', { id: c.id })}>
                Вступить
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>
          <Icon name="flag" size={20} /> Основать роту
        </h2>
        <label>
          Название
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="например, Ночные совы" />
        </label>
        <label>
          Тег (2–5 букв)
          <input value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} maxLength={5} placeholder="СОВА" />
        </label>
        <label>
          Девиз
          <input value={motto} onChange={(e) => setMotto(e.target.value)} maxLength={80} placeholder="необязательно" />
        </label>
        <p className="small">
          Цена: <CostLine cost={meta?.cost ?? { supplies: 300, parts: 200 }} />
        </p>
        <Button onClick={() => act('companyCreate', { name, tag, motto })} disabled={name.trim().length < 3 || tag.trim().length < 2} why="Укажите название и тег">
          <Icon name="flag" size={16} /> Основать
        </Button>
      </section>
    </>
  );
}

function CompanyView({ id, onOpenPlayer }: { id: number; onOpenPlayer: (id: number) => void }) {
  const { state, act, now } = useGame();
  const [d, setD] = useState<CompanyDetail | null>(null);
  const [donRes, setDonRes] = useState<ResKey>('supplies');
  const [donAmt, setDonAmt] = useState(100);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    api.company(id).then(setD).catch(() => setD(null));
  }, [id, tick, state.serverTime]);
  const reload = () => setTick((x) => x + 1);
  if (!d) return <p className="muted">Связь со штабом роты…</p>;
  const op = d.op;
  const hp = op?.hp ?? d.opHpPreview;
  return (
    <>
      <section className="panel company-head">
        <span className="co-tag big">{d.tag}</span>
        <div>
          <h2>{d.name}</h2>
          {d.motto && <p className="quote">«{d.motto}»</p>}
          <p className="small muted">
            {d.members.length}/{d.limit} командиров · вы {d.myRole === 'leader' ? 'командир роты' : 'боец роты'}
          </p>
        </div>
      </section>

      <section className="panel op">
        <h2>
          <Icon name="stronghold" size={20} /> Штурм укрепрайона · неделя
        </h2>
        <p className="small muted">Каждый успешный боевой поход бойцов роты бьёт по укрепрайону. Взяли — награду получает каждый.</p>
        <div className="between small">
          <span>
            Урон: <b>{op?.damage ?? 0}</b> / {hp}
          </span>
          <span className="muted">до конца недели {fmtLeft(Math.max(0, (state.week.endsAt - now) / 1000))}</span>
        </div>
        <Bar value={op?.damage ?? 0} max={hp} tone={op?.defeated ? 'olive' : 'red'} />
        {op?.defeated &&
          (op.claimed ? (
            <p className="olive small">
              <Icon name="check" size={14} /> Награда получена
            </p>
          ) : (
            <Button onClick={async () => { await act('companyClaimOp'); reload(); }}>
              <Icon name="gift" size={16} /> Забрать награду: <RewardLine cost={{ supplies: 300, parts: 300, data: 40 }} />
            </Button>
          ))}
        {d.prevOp?.defeated && !d.prevOp.claimed && (
          <Button kind="secondary" onClick={async () => { await act('companyClaimOp', { week: 'prev' }); reload(); }}>
            Награда за прошлую неделю
          </Button>
        )}
      </section>

      <section className="panel">
        <h2>
          <Icon name="supply" size={20} /> Склад роты
        </h2>
        <div className="loot">
          {RES_KEYS.map((k) => (
            <div key={k} className={`loot-tile res-${k}`}>
              <Icon name={k} size={22} />
              <b>{d.storage[k]}</b>
              <span>{RES_NAMES[k].toLowerCase()}</span>
            </div>
          ))}
        </div>
        <div className="donate">
          <select value={donRes} onChange={(e) => setDonRes(e.target.value as ResKey)} aria-label="Ресурс">
            {RES_KEYS.map((k) => (
              <option key={k} value={k}>
                {RES_NAMES[k]}
              </option>
            ))}
          </select>
          <input type="number" min={1} max={5000} value={donAmt} onChange={(e) => setDonAmt(Math.max(1, Math.min(5000, Number(e.target.value) || 1)))} aria-label="Количество" />
          <button className="btn secondary small" onClick={async () => { await act('companyDonate', { res: donRes, amount: donAmt }); reload(); }}>
            Сдать на склад
          </button>
        </div>
        {d.myRole === 'leader' && <p className="tiny muted">Как командир роты вы можете выдавать со склада — кнопка «Выдать» у бойца ниже.</p>}
      </section>

      <section className="panel">
        <h2>
          <Icon name="squad" size={20} /> Состав
        </h2>
        <div className="mates">
          {d.members.map((m) => (
            <div key={m.id} className={`mate ${m.id === d.myId ? 'me' : ''}`}>
              <button className="mate-open" onClick={() => onOpenPlayer(m.id)} aria-label={`Профиль «${m.callsign}»`}>
                <Sprite img="operators" index={m.portrait % 4} className="mate-portrait" focusY={12} />
              </button>
              <span className="mate-info">
                <b>
                  «{m.callsign}» {m.role === 'leader' && <em className="you">командир</em>}
                </b>
                <small>
                  ур. {m.level} · {m.weekPoints} очков за неделю
                </small>
                {m.build && (
                  <small className="amber">
                    <Icon name="wrench" size={12} /> стройка · ещё {fmtDur(Math.max(0, (m.build.endAt - now) / 1000))} · помощь {m.build.helps}/5
                  </small>
                )}
              </span>
              {m.build && m.id !== d.myId && !m.build.helpedByMe && m.build.helps < 5 && (
                <button className="btn primary small" onClick={async () => { await act('helpBuild', { userId: m.id }); reload(); }}>
                  Помочь
                </button>
              )}
              {d.myRole === 'leader' && m.id !== d.myId && (
                <button
                  className="btn secondary small"
                  onClick={async () => {
                    const amt = Number(prompt(`Сколько выдать «${m.callsign}» (${RES_NAMES[donRes].toLowerCase()})?`, '100'));
                    if (amt > 0) { await act('companyGive', { userId: m.id, res: donRes, amount: Math.floor(amt) }); reload(); }
                  }}
                >
                  Выдать
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>
          <Icon name="reports" size={20} /> Журнал роты
        </h2>
        <ul className="award-history">
          {d.log.map((l, i) => (
            <li key={i}>
              <span className="muted tiny">{new Date(l.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span> {l.text}
            </li>
          ))}
        </ul>
        <button className="btn danger small" onClick={async () => { if (confirm('Покинуть роту?')) await act('companyLeave'); }}>
          Покинуть роту
        </button>
      </section>
    </>
  );
}

/* ═════════════ Карта: обстановка и набеги ═════════════ */

export function MapEventBanner() {
  const { now, state } = useGame();
  const ev = mapEventAt(now);
  const hot = SECTOR_NAME(ev.hotSector);
  const hotOpen = state.sectors.find((s) => s.id === ev.hotSector)?.unlocked;
  return (
    <div className="event-banner">
      <span className="ev-weather">
        <Icon name={ev.weather.icon} size={20} />
        <span>
          <b>{ev.weather.name}</b> <small className="muted">ещё {fmtLong(Math.max(0, (ev.weatherUntil - now) / 1000))}</small>
          <small>{ev.weather.text}</small>
        </span>
      </span>
      <span className={`ev-hot ${hotOpen ? '' : 'off'}`}>
        <Icon name="event" size={18} />
        <span>
          <b>Горячая цель: {hot}</b>
          <small>
            награды ×2, данные +50% · {fmtLong(Math.max(0, (ev.hotUntil - now) / 1000))}
            {!hotOpen && ' · сектор пока закрыт'}
          </small>
        </span>
      </span>
    </div>
  );
}
function SECTOR_NAME(id: number) {
  return ['', 'Лесополоса', 'Старая ферма', 'Грунтовка Б-3', 'Водонапорная башня', 'Элеватор', 'Высота 112', 'Речной переезд', 'Карьер', 'Посадка Дубовая', 'Депо', 'Узел Северный', 'Терриконы'][id] ?? '';
}
export { HOT_WINDOW };

export function PvpTab({ onOpenPlayer }: { onOpenPlayer: (id: number) => void }) {
  const { state } = useGame();
  const [data, setData] = useState<{ minLevel: number; myLevel: number; targets: PvpTarget[] } | null>(null);
  const [raid, setRaid] = useState<PvpTarget | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    api.pvpTargets().then(setData).catch(() => setData({ minLevel: PVP.minLevel, myLevel: state.commander.level, targets: [] }));
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const locked = state.commander.level < PVP.minLevel;
  return (
    <>
      <Speech who="shmel">
        Набеги на соседние полигоны: разведай оборону, собери группу и вывези чужие запасы. Новичков и тех, кого недавно навещали, не трогаем — так договорились.
      </Speech>
      <section className="panel">
        <div className="between">
          <h2>
            <Icon name="flag" size={20} /> Цели для набега
          </h2>
          <button className="btn secondary small" onClick={() => setTick((x) => x + 1)}>
            Обновить
          </button>
        </div>
        <p className="small muted">
          Командиры вашего уровня (±{PVP.levelSpread}). Защищены: до {PVP.minLevel} уровня и первые трое суток, {PVP.shieldHours} ч после набега. Неотбираемый запас — {Math.round(0.4 * 100)}% вместимости складов.
        </p>
        {locked && <div className="warn-box small">Набеги открываются с {PVP.minLevel} уровня командира.</div>}
        {!data && <p className="muted">Связь со штабом…</p>}
        {data && !data.targets.length && <p className="muted">Подходящих целей сейчас нет.</p>}
        <div className="mates">
          {data?.targets.map((t) => (
            <div key={t.id} className="mate">
              <button className="mate-open" onClick={() => onOpenPlayer(t.id)} aria-label={`Профиль «${t.callsign}»`}>
                <Sprite img="operators" index={t.portrait % 4} className="mate-portrait" focusY={12} />
              </button>
              <span className="mate-info">
                <b>«{t.callsign}»</b>
                <small>ур. {t.level}</small>
                {t.protectedReason && <small className="muted">🛡 {t.protectedReason}</small>}
              </span>
              <Chevron def={t.chevron} size={34} />
              <button className="btn primary small" disabled={locked || !!t.protectedReason} onClick={() => setRaid(t)}>
                Набег
              </button>
            </div>
          ))}
        </div>
      </section>
      {raid && <RaidBuilder target={raid} onClose={() => { setRaid(null); setTick((x) => x + 1); }} />}
    </>
  );
}

export function RaidBuilder({ target, onClose }: { target: { id: number; callsign: string }; onClose: () => void }) {
  const { state, act, now } = useGame();
  const affordable = useAffordable();
  const [intel, setIntel] = useState<{ defense: number; loot: Record<string, number>; protectedReason: string | null } | null>(null);
  const readyV = VEHICLE_TYPES.filter((v) => state.vehicles[v]?.status === 'ready');
  const [vehicle, setVehicle] = useState<VehicleType | undefined>(readyV.includes('bukhanka') ? 'bukhanka' : readyV.includes('niva') ? 'niva' : readyV[0]);
  const [group, setGroup] = useState<Group>(() => {
    const g: Group = {};
    let left = 4;
    for (const t of ['veteran', 'fpv', 'heavy', 'babayaga', 'scout'] as OperatorType[]) {
      const n = Math.min(state.operators[t].available, left);
      if (n > 0) g[t] = n;
      left -= n;
    }
    return g;
  });
  const ready = state.equipment.filter((e) => e.status === 'ready');
  const [eqIds, setEqIds] = useState<number[]>([]);
  const ranks = Object.fromEntries(OPERATOR_TYPES.map((t) => [t, state.operators[t].rank])) as Record<OperatorType, number>;
  const sector: SectorDef = { id: 0, name: `Полигон «${target.callsign}»`, type: 'stronghold', difficulty: intel ? Math.max(1, Math.min(6, Math.round(intel.defense / 25))) : 3, x: 0, y: 0, links: [], comms: 1, after: [], baseTime: PVP.baseTime, fuel: PVP.fuel, rewardMul: 1 };
  const plan = vehicle
    ? planExpedition({
        sector, mission: 'pvp', group, ranks, vehicle: { type: vehicle, level: state.vehicles[vehicle]!.level },
        equipment: ready.filter((e) => eqIds.includes(e.id)), skills: state.commander.skills, commsLevel: state.buildings.comms, sectorRecon: 0,
        bonus: bonusFor(state, 0, now, group), override: { enemy: intel?.defense ?? 40, rewards: intel?.loot ?? {} },
      })
    : null;
  const size = groupSize(group);
  let why = '';
  if (state.expeditions.length >= state.slots) why = 'Все группы в поле';
  else if (!vehicle) why = 'Нет свободного транспорта';
  else if (size < 1) why = 'Добавьте бойцов';
  else if (plan && size > plan.capacity) why = `Вместимость — ${plan.capacity}`;
  else if (plan && !affordable(plan.cost)) why = 'Не хватает ресурсов';
  else if (intel?.protectedReason) why = intel.protectedReason;
  return (
    <Sheet title={`Набег: «${target.callsign}»`} onClose={onClose} wide>
      <div className="brief">
        <Icon name="flag" size={28} />
        <p>
          <b>Задача:</b> пройти оборону полигона и вывезти часть запасов. Успех даёт очки рейтинга и {PVP.shieldHours} ч щита соседу.
        </p>
      </div>
      {intel ? (
        <div className="intel">
          <span>
            <Icon name="reb" size={16} /> Оборона ~<b>{intel.defense}</b>
          </span>
          <span>
            Можно вывезти до: <RewardLine cost={intel.loot} />
          </span>
          {intel.protectedReason && <span className="red small">{intel.protectedReason}</span>}
        </div>
      ) : (
        <Button
          kind="secondary"
          small
          onClick={async () => {
            const r = await act('pvpScout', { targetId: target.id });
            if (r) setIntel(r.data);
          }}
        >
          <Icon name="recon" size={16} /> Разведать оборону · <CostLine cost={PVP.scoutCost} />
        </Button>
      )}
      <h3>
        <Icon name="squad" size={18} /> Группа · {size}/{plan?.capacity ?? '—'}
      </h3>
      <div className="pick-list">
        {OPERATOR_TYPES.map((t) => {
          const o = state.operators[t];
          if (!o.available && !(group[t] ?? 0)) return null;
          return (
            <div key={t} className={`pick-card ${(group[t] ?? 0) > 0 ? 'on' : ''}`}>
              <Portrait sprite={OPERATORS[t].sprite} size={44} />
              <span className="pick-info">
                <b>{OPERATORS[t].name}</b>
                <small className="muted">свободно {o.available}</small>
              </span>
              <Stepper value={group[t] ?? 0} max={o.available} onChange={(v) => setGroup((g) => ({ ...g, [t]: v }))} label={OPERATORS[t].name} />
            </div>
          );
        })}
      </div>
      <h3>
        <Icon name="bukhanka" size={18} /> Транспорт
      </h3>
      <div className="veh-pick">
        {VEHICLE_TYPES.filter((v) => state.vehicles[v]).map((v) => (
          <button key={v} className={`veh-card ${vehicle === v ? 'on' : ''}`} disabled={state.vehicles[v]!.status !== 'ready'} onClick={() => setVehicle(v)}>
            <VehicleArt type={v} w={110} className="veh-img" />
            <b>{VEHICLES[v].name}</b>
          </button>
        ))}
      </div>
      {ready.length > 0 && (
        <>
          <h3>
            <Icon name="repairkit" size={18} /> Оснащение
          </h3>
          <div className="eq-pick">
            {ready.map((e) => (
              <button
                key={e.id}
                className={`eq-chip rarity-${e.rarity} ${eqIds.includes(e.id) ? 'on' : ''}`}
                onClick={() =>
                  setEqIds((cur) => {
                    if (cur.includes(e.id)) return cur.filter((x) => x !== e.id);
                    const rest = cur.filter((x) => EQUIPMENT[ready.find((q) => q.id === x)!.type].kind !== EQUIPMENT[e.type].kind);
                    return [...rest, e.id].slice(-MAX_EQUIPMENT_PER_GROUP);
                  })
                }
              >
                <span className="eq-icon small">
                  <Icon name={e.type} size={20} />
                </span>
                <span>
                  <b>{EQUIPMENT[e.type].name}</b>
                  <small>{equipmentEffectText(e.type, e.rarity, e.level)}</small>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {plan && (
        <div className="forecast">
          <h3>
            <Icon name="compass" size={18} /> Прогноз {intel ? '' : '(без разведки — вслепую)'}
          </h3>
          {intel ? (
            <p>
              <b>{outcomeRangeText(plan.outcomeLow, plan.outcomeHigh, OUTCOME_NAMES)}</b> · риск потерь {plan.lossCategory}
            </p>
          ) : (
            <p className="muted small">Оборона неизвестна. Разведайте полигон, чтобы увидеть прогноз и добычу.</p>
          )}
          <div className="fc-grid">
            <div>
              <span className="muted tiny">Сила группы</span>
              <b>{plan.power}</b>
            </div>
            <div>
              <span className="muted tiny">Расход</span>
              <CostLine cost={plan.cost} />
            </div>
            <div>
              <span className="muted tiny">В пути</span>
              <b>{fmtLong(plan.duration)}</b>
            </div>
          </div>
        </div>
      )}
      <Button disabled={!!why} why={why} onClick={async () => { if (await act('pvpRaid', { targetId: target.id, group, vehicle, equipment: eqIds })) onClose(); }}>
        <Icon name="flag" size={18} /> В набег
      </Button>
    </Sheet>
  );
}

/* ═════════════ Отчёты: оборона и набеги ═════════════ */

export function DefenseReportBody({ r }: { r: any }) {
  const pvp = r.kind === 'pvp_defense';
  return (
    <>
      <div className={`report-hero ${r.won ? 'o-success' : 'o-fail'}`}>
        <div>
          <span className="kicker">{pvp ? `Набег «${r.attacker}»` : 'Атака противника на полигон'}</span>
          <h2>{r.won ? 'Отбили!' : 'Прорвались'}</h2>
          <p className="small">
            Сила нападения {r.attack} против обороны {r.defense}.
          </p>
        </div>
        <div className={`stamp ${r.won ? 'ok' : 'bad'}`}>{r.won ? 'ОТБИТО' : 'ПРОРЫВ'}</div>
      </div>
      {r.won ? (
        <Speech who="batya">Пусть знают: к нам лучше не соваться. {Object.keys(r.reward ?? {}).length ? <>С трофеев: <RewardLine cost={r.reward} /></> : null}</Speech>
      ) : (
        <Speech who="batya">
          Потрепали нас. Потеряно: {Object.keys(r.lost ?? {}).length ? <CostLine cost={r.lost} check={false} /> : 'ничего ценного'}.
          {r.wounded?.length ? ` Ранены: ${r.wounded.join(', ').toLowerCase()}.` : ''}
          {r.sectorHit ? ` Контроль сектора «${r.sectorHit.name}»: ${r.sectorHit.before}% → ${r.sectorHit.after}%.` : ''} Поднимайте оборону и держите людей дома.
        </Speech>
      )}
    </>
  );
}

export function SoldierNews({ s }: { s?: { fallen: string[]; wounded: string[]; patched: string[]; levelUps: { name: string; level: number }[] } }) {
  if (!s) return null;
  const any = s.fallen.length || s.wounded.length || s.patched.length || s.levelUps.length;
  if (!any) return null;
  return (
    <div className="soldier-news">
      {s.levelUps.map((l) => (
        <span key={l.name} className="sn up">
          <Icon name="up" size={13} /> «{l.name}» — уровень {l.level}
        </span>
      ))}
      {s.wounded.map((n) => (
        <span key={n} className="sn wnd">
          <Icon name="cross" size={13} /> «{n}» ранен
        </span>
      ))}
      {s.patched.map((n) => (
        <span key={n} className="sn ok">
          <Icon name="repairkit" size={13} /> «{n}» подлатан в поле
        </span>
      ))}
      {s.fallen.map((n) => (
        <span key={n} className="sn lost">
          <Icon name="flag" size={13} /> «{n}» не вернулся
        </span>
      ))}
    </div>
  );
}

export function useMemoNow() {
  const { now } = useGame();
  return useMemo(() => now, [Math.floor(now / 60000)]); // eslint-disable-line react-hooks/exhaustive-deps
}
export { chevronByKey };
