import React, { useCallback, useEffect, useState } from 'react';
import { ApiError, GameState, NetworkError, api, getToken, setToken } from './api';
import { GameProvider, Tab, useGame } from './game';
import { RES_ICONS, RES_KEYS, RES_NAMES, TUTORIAL } from '../../shared/config';
import { AuthScreen } from './screens/Auth';
import { BaseScreen } from './screens/Base';
import { MapScreen } from './screens/Map';
import { SquadScreen } from './screens/Squad';
import { CommanderScreen } from './screens/Commander';
import { ReportsScreen } from './screens/Reports';
import { QueuesSheet, activeTimers } from './components/Queues';
import { resShort } from './ui';

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
  if (phase === 'loading' || !state)
    return phase === 'error' ? (
      <div className="center-screen">
        <div className="panel">
          <h2>Не удалось загрузить игру</h2>
          <p className="muted">{err} Прогресс хранится на сервере и не потерян.</p>
          <button className="btn primary" onClick={load}>
            Повторить
          </button>
        </div>
      </div>
    ) : (
      <div className="center-screen">
        <div className="loader" aria-label="Загрузка">
          <b>РУБЕЖ</b>
          <span>Связь со штабом…</span>
        </div>
      </div>
    );
  return (
    <GameProvider initial={state} onLogout={() => { setState(null); setPhase('auth'); }}>
      <Shell />
    </GameProvider>
  );
}

const TABS: { key: Tab; name: string; icon: string }[] = [
  { key: 'base', name: 'Полигон', icon: '▣' },
  { key: 'map', name: 'Карта', icon: '◈' },
  { key: 'squad', name: 'Отряд', icon: '◉' },
  { key: 'commander', name: 'Командир', icon: '◆' },
  { key: 'reports', name: 'Отчёты', icon: '▤' },
];

function Shell() {
  const { state, nav, go, offline } = useGame();
  const [queues, setQueues] = useState(false);
  const freePoints = state.commander.level - 1 - Object.values(state.commander.skills).reduce((s, v) => s + (v ?? 0), 0);
  const badge = (t: Tab) => (t === 'reports' ? state.unreadReports : t === 'commander' ? freePoints : 0);
  return (
    <div className="app">
      <aside className="sidenav">
        <div className="brand">
          <b>РУБЕЖ</b>
          <span>
            {state.player.callsign} · ур. {state.commander.level}
          </span>
        </div>
        <nav>
          {TABS.map((t) => (
            <button key={t.key} className={nav.tab === t.key ? 'active' : ''} onClick={() => go(t.key)} aria-current={nav.tab === t.key ? 'page' : undefined}>
              <i aria-hidden>{t.icon}</i> {t.name}
              {badge(t.key) > 0 && <em className="badge">{badge(t.key)}</em>}
            </button>
          ))}
        </nav>
      </aside>
      <div className="main">
        <TopBar onTimers={() => setQueues(true)} />
        {offline && <div className="offline">Нет связи с сервером — переподключаемся. Прогресс сохранён на сервере.</div>}
        <Tutorial />
        <main className="screen">
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
            <i aria-hidden>{t.icon}</i>
            <span>{t.name}</span>
            {badge(t.key) > 0 && <em className="badge">{badge(t.key)}</em>}
          </button>
        ))}
      </nav>
      {queues && <QueuesSheet onClose={() => setQueues(false)} />}
    </div>
  );
}

function TopBar({ onTimers }: { onTimers: () => void }) {
  const { state, res, now } = useGame();
  const timers = activeTimers(state, now);
  return (
    <header className="topbar">
      <div className="resources">
        {RES_KEYS.map((k) => {
          const cap = k === 'data' ? null : state.caps[k];
          const v = res(k);
          const full = cap != null && v >= cap;
          return (
            <div key={k} className={`res ${full ? 'full' : ''}`} title={`${RES_NAMES[k]}${cap ? ` — хранилище ${cap}` : ''}${k !== 'data' ? `, +${state.rates[k as 'supplies']}/ч` : ''}`}>
              <i aria-hidden>{RES_ICONS[k]}</i>
              <b className="num">{v}</b>
              <small>{resShort(k)}</small>
            </div>
          );
        })}
      </div>
      <button className="timers" onClick={onTimers} aria-label="Очереди и походы">
        <span className="dot" data-on={timers.count > 0} />
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
  if (step >= TUTORIAL.length || hidden) return null;
  const s = TUTORIAL[step];
  return (
    <section className="tutorial" aria-label="Обучение">
      <div className="tut-head">
        <span className="kicker">
          Обучение · шаг {step + 1} из {TUTORIAL.length}
        </span>
        <button className="link" onClick={() => setHidden(true)}>
          свернуть
        </button>
      </div>
      <b>{s.title}</b>
      <p>{s.text}</p>
      <div className="row">
        <button className="btn primary small" onClick={() => go(s.goto, s.focus)}>
          Перейти
        </button>
        <button
          className="link"
          onClick={() => {
            if (confirm('Пропустить обучение? Награды за оставшиеся шаги не будут выданы.')) act('skipTutorial');
          }}
        >
          пропустить обучение
        </button>
      </div>
    </section>
  );
}
