import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, GameState, NetworkError, api, getToken, setToken } from './api';
import { GameProvider, Tab, useGame } from './game';
import { AWARDS, RES_KEYS, RES_NAMES, TUTORIAL } from '../../shared/config';
import { COMMANDER_TITLES, LOADING_LINES } from '../../shared/lore';
import { AuthScreen } from './screens/Auth';
import { BaseScreen } from './screens/Base';
import { MapScreen } from './screens/Map';
import { SquadScreen } from './screens/Squad';
import { CommanderScreen } from './screens/Commander';
import { ReportsScreen } from './screens/Reports';
import { QueuesSheet, activeTimers } from './components/Queues';
import { resShort } from './ui';
import { Icon } from './art/icons';
import { Burst, Drone, Speech } from './art/art';
import { chevronByKey } from '../../shared/chevrons';

export function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [phase, setPhase] = useState<'loading' | 'auth' | 'game' | 'error'>(getToken() ? 'loading' : 'auth');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      setState(await api.state());
      setPhase('game');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setToken(null);
        setPhase('auth');
      } else {
        setErr(e instanceof NetworkError ? 'Нет связи с сервером.' : e instanceof Error ? e.message : 'Ошибка');
        setPhase('error');
      }
    }
  }, []);
  useEffect(() => {
    if (getToken()) load();
  }, [load]);

  if (phase === 'auth')
    return (
      <AuthScreen
        onToken={(t) => {
          setToken(t);
          load();
        }}
      />
    );
  if (phase === 'error')
    return (
      <div className="center-screen">
        <div className="panel">
          <Speech who="iskra">
            Связь пропала: {err} Прогресс хранится на сервере и никуда не делся — попробуем ещё раз.
          </Speech>
          <button className="btn primary" onClick={load}>
            Повторить
          </button>
        </div>
      </div>
    );
  if (phase === 'loading' || !state) return <Loader />;
  return (
    <GameProvider initial={state} onLogout={() => { setState(null); setPhase('auth'); }}>
      <Shell />
    </GameProvider>
  );
}

function Loader() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => x + 1), 1400);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="center-screen">
      <div className="loader" aria-label="Загрузка">
        <Drone size={96} className="hover" />
        <b>РУБЕЖ</b>
        <span key={i}>{LOADING_LINES[i % LOADING_LINES.length]}</span>
      </div>
    </div>
  );
}

const TABS: { key: Tab; name: string; icon: string }[] = [
  { key: 'base', name: 'Полигон', icon: 'base' },
  { key: 'map', name: 'Карта', icon: 'map' },
  { key: 'squad', name: 'Отряд', icon: 'squad' },
  { key: 'commander', name: 'Командир', icon: 'commander' },
  { key: 'reports', name: 'Отчёты', icon: 'reports' },
];

function Shell() {
  const { state, nav, go, offline } = useGame();
  const [queues, setQueues] = useState(false);
  const [burst, setBurst] = useState<{ title: string; text: string; icon: string; chevron?: string } | null>(null);
  const lvl = useRef(state.commander.level);
  const step = useRef(state.tutorialStep);
  useEffect(() => {
    if (state.commander.level > lvl.current) {
      setBurst({ title: `Уровень ${state.commander.level}!`, text: `${COMMANDER_TITLES[state.commander.level - 1]}. Доступно новое очко навыка.`, icon: 'star' });
    } else if (state.newChevrons?.length) {
      const c = chevronByKey(state.newChevrons[0]);
      if (c) setBurst({ title: 'Новый шеврон!', text: `«${c.name}» — теперь в коллекции. Наденьте его в профиле командира, чтобы видели сослуживцы.`, icon: 'medal', chevron: c.key });
    } else if (state.newAwards?.length) {
      const a = state.newAwards[0];
      setBurst({ title: 'Награда за заслуги!', chevron: chevronByKey(a.award) ? a.award : undefined, text: `${AWARDS[a.award as keyof typeof AWARDS]?.name ?? (chevronByKey(a.award) ? `Шеврон «${chevronByKey(a.award)!.name}»` : a.award)}${a.count > 1 ? ` ×${a.count}` : ''}${a.reason ? ` — ${a.reason}` : ''}. Подарок от сайта «Учёт дронов».`, icon: 'medal' });
    } else if (state.tutorialStep === TUTORIAL.length && step.current < TUTORIAL.length) {
      setBurst({ title: 'Обучение пройдено', text: 'Полигон ваш, командир. Дальше — новые секторы и большие цели.', icon: 'flag' });
    }
    lvl.current = state.commander.level;
    step.current = state.tutorialStep;
  }, [state.commander.level, state.tutorialStep, state.newAwards, state.newChevrons]);
  const freePoints = state.commander.level - 1 - Object.values(state.commander.skills).reduce((s, v) => s + (v ?? 0), 0);
  const badge = (t: Tab) => (t === 'reports' ? state.unreadReports : t === 'commander' ? freePoints : t === 'map' ? state.expeditions.length : 0);
  return (
    <div className="app">
      <aside className="sidenav">
        <div className="brand">
          <Drone size={54} className="hover" />
          <b>РУБЕЖ</b>
          <span>
            «{state.player.callsign}» · {COMMANDER_TITLES[state.commander.level - 1].toLowerCase()}
          </span>
        </div>
        <nav>
          {TABS.map((t) => (
            <button key={t.key} className={nav.tab === t.key ? 'active' : ''} onClick={() => go(t.key)} aria-current={nav.tab === t.key ? 'page' : undefined}>
              <Icon name={t.icon} size={22} /> {t.name}
              {badge(t.key) > 0 && <em className="badge">{badge(t.key)}</em>}
            </button>
          ))}
        </nav>
        <div className="side-foot muted tiny">Мир и техника вымышлены, параметры условны.</div>
      </aside>
      <div className="main">
        <TopBar onTimers={() => setQueues(true)} />
        {offline && (
          <div className="offline">
            <Icon name="radio" size={18} /> Нет связи — переподключаемся. Прогресс сохранён на сервере.
          </div>
        )}
        <Tutorial />
        <main className="screen" key={nav.tab}>
          {nav.tab === 'base' && <BaseScreen />}
          {nav.tab === 'map' && <MapScreen />}
          {nav.tab === 'squad' && <SquadScreen />}
          {nav.tab === 'commander' && <CommanderScreen />}
          {nav.tab === 'reports' && <ReportsScreen />}
        </main>
      </div>
      <nav className="bottomnav">
        {TABS.map((t) => (
          <button key={t.key} className={nav.tab === t.key ? 'active' : ''} onClick={() => go(t.key)} aria-current={nav.tab === t.key ? 'page' : undefined}>
            <Icon name={t.icon} size={24} />
            <span>{t.name}</span>
            {badge(t.key) > 0 && <em className="badge">{badge(t.key)}</em>}
          </button>
        ))}
      </nav>
      {queues && <QueuesSheet onClose={() => setQueues(false)} />}
      {burst && <Burst {...burst} onDone={() => setBurst(null)} />}
    </div>
  );
}

function TopBar({ onTimers }: { onTimers: () => void }) {
  const { state, res, now } = useGame();
  const timers = activeTimers(state, now);
  const prev = useRef<Record<string, number>>({});
  return (
    <header className="topbar">
      <div className="resources">
        {RES_KEYS.map((k) => {
          const cap = k === 'data' ? null : state.caps[k];
          const v = res(k);
          const full = cap != null && v >= cap;
          const jumped = prev.current[k] != null && v - prev.current[k] >= 5;
          prev.current[k] = v;
          return (
            <div
              key={k + (jumped ? v : '')}
              className={`res res-${k} ${full ? 'full' : ''} ${jumped ? 'jump' : ''}`}
              title={`${RES_NAMES[k]}${cap ? ` — хранилище ${cap}` : ''}${k !== 'data' ? `, +${state.rates[k as 'supplies']}/ч` : ''}`}
            >
              <Icon name={k} size={20} />
              <b className="num">{v}</b>
              <small>{full ? 'полно' : resShort(k)}</small>
            </div>
          );
        })}
      </div>
      <button className={`timers ${timers.count ? 'on' : ''}`} onClick={onTimers} aria-label="Очереди и походы">
        <Icon name="clock" size={18} />
        {timers.count ? (
          <>
            <b>{timers.count}</b> <span className="num">{timers.next}</span>
          </>
        ) : (
          <span>очереди</span>
        )}
      </button>
    </header>
  );
}

function Tutorial() {
  const { state, go, act } = useGame();
  const [hidden, setHidden] = useState(false);
  const step = state.tutorialStep;
  if (step >= TUTORIAL.length) return null;
  const s = TUTORIAL[step];
  const who = s.focus === 'ebike' ? 'batya' : s.goto === 'squad' || s.focus === 'training' ? 'shmel' : s.goto === 'map' ? 'iskra' : 'sova';
  if (hidden)
    return (
      <button className="tut-mini" onClick={() => setHidden(false)}>
        <Icon name="flag" size={16} /> Задание {step + 1}/{TUTORIAL.length}: {s.title}
      </button>
    );
  return (
    <section className="tutorial" aria-label="Обучение">
      <div className="tut-head">
        <span className="kicker">
          Задание {step + 1} из {TUTORIAL.length}
        </span>
        <div className="tut-dots" aria-hidden>
          {TUTORIAL.map((_, i) => (
            <i key={i} className={i < step ? 'done' : i === step ? 'now' : ''} />
          ))}
        </div>
        <button className="link" onClick={() => setHidden(true)}>
          свернуть
        </button>
      </div>
      <Speech
        who={who}
        compact
        action={
          <div className="row">
            <button className="btn primary small" onClick={() => go(s.goto, s.focus)}>
              {s.title} <Icon name="arrow" size={16} />
            </button>
            <button
              className="link"
              onClick={() => {
                if (confirm('Пропустить обучение? Награды за оставшиеся шаги не будут выданы.')) act('skipTutorial');
              }}
            >
              пропустить
            </button>
          </div>
        }
      >
        {s.text}
      </Speech>
    </section>
  );
}
