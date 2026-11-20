import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, GameState, NetworkError, api, setToken } from './api';
import { PRODUCED_KEYS, ResKey } from '../../shared/config';
import { Icon } from './art/icons';

function toastIcon(t: Toast): string {
  const x = t.text.toLowerCase();
  if (t.kind === 'error') return 'alert';
  if (x.includes('поход') || x.includes('группа')) return 'map';
  if (x.includes('улучш')) return 'up';
  if (x.includes('подготов') || x.includes('ранг')) return 'training';
  if (x.includes('оснащ') || x.includes('сборка')) return 'repairkit';
  if (x.includes('командир') || x.includes('уровн')) return 'star';
  if (x.includes('цель') || x.includes('обучени')) return 'flag';
  if (x.includes('восстанов')) return 'cross';
  if (x.includes('ремонт') || x.includes('автопарк')) return 'wrench';
  return t.kind === 'success' ? 'check' : 'radio';
}

export type Tab = 'base' | 'map' | 'squad' | 'commander' | 'reports';
export interface Toast { id: number; kind: 'info' | 'success' | 'warn' | 'error'; text: string }
export interface NavTarget { tab: Tab; focus?: string }

interface Ctx {
  state: GameState;
  now: number; // серверное время (с поправкой на разницу часов)
  busy: boolean;
  offline: boolean;
  act: (type: string, params?: Record<string, unknown>) => Promise<boolean>;
  refresh: () => Promise<void>;
  res: (k: ResKey) => number;
  nav: NavTarget;
  go: (tab: Tab, focus?: string) => void;
  toast: (kind: Toast['kind'], text: string) => void;
  logout: () => void;
  setState: (s: GameState) => void;
}
const GameCtx = createContext<Ctx | null>(null);
export const useGame = () => useContext(GameCtx)!;

let toastSeq = 1;

export function GameProvider({ initial, onLogout, children }: { initial: GameState; onLogout: () => void; children: React.ReactNode }) {
  const [state, setStateRaw] = useState(initial);
  const [offset, setOffset] = useState(initial.serverTime - Date.now());
  const [tick, setTick] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [nav, setNav] = useState<NavTarget>({ tab: 'base' });
  const refreshing = useRef(false);

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    if (!text) return;
    const id = toastSeq++;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 4500);
  }, []);

  const setState = useCallback(
    (s: GameState) => {
      setStateRaw(s);
      setOffset(s.serverTime - Date.now());
      for (const n of s.notices) toast(n.kind, n.text);
    },
    [toast],
  );

  const logout = useCallback(() => {
    api.logout().catch(() => {});
    setToken(null);
    onLogout();
  }, [onLogout]);

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        setToken(null);
        onLogout();
        return;
      }
      if (e instanceof NetworkError) {
        setOffline(true);
        toast('error', 'Нет связи с сервером. Прогресс сохранён на сервере — действие можно повторить.');
        return;
      }
      toast('error', e instanceof Error ? e.message : 'Ошибка');
    },
    [onLogout, toast],
  );

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      setState(await api.state());
      setOffline(false);
    } catch (e) {
      if (e instanceof NetworkError) setOffline(true);
      else handleError(e);
    } finally {
      refreshing.current = false;
    }
  }, [handleError, setState]);

  const act = useCallback(
    async (type: string, params: Record<string, unknown> = {}) => {
      setBusy(true);
      try {
        const r = await api.action(type, params);
        setState(r.state);
        setOffline(false);
        if (r.message) toast('info', r.message);
        return true;
      } catch (e) {
        handleError(e);
        // после ошибки сверяемся с сервером: показываем фактическое состояние
        refresh();
        return false;
      } finally {
        setBusy(false);
      }
    },
    [handleError, refresh, setState, toast],
  );

  // часы интерфейса
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const now = tick + offset;

  // обновление: по ближайшему таймеру, периодически, при возвращении во вкладку и восстановлении сети
  const nextEnd = useMemo(() => {
    const ends = [...state.jobs.map((j) => j.endAt), ...state.expeditions.map((x) => x.endAt)].filter((t) => t > state.serverTime);
    return ends.length ? Math.min(...ends) : null;
  }, [state]);
  useEffect(() => {
    if (nextEnd == null) return;
    const delay = Math.max(300, nextEnd - (Date.now() + offset) + 400);
    const t = setTimeout(refresh, Math.min(delay, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [nextEnd, offset, refresh]);
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && refresh(), 30_000);
    const vis = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('online', refresh);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('online', refresh);
    };
  }, [refresh]);
  useEffect(() => {
    if (!offline) return;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [offline, refresh]);

  // ресурсы с учётом производства между запросами
  const res = useCallback(
    (k: ResKey) => {
      const base = state.resources[k];
      if (!(PRODUCED_KEYS as readonly string[]).includes(k)) return Math.floor(base);
      const pk = k as 'supplies' | 'parts' | 'fuel';
      const cap = state.caps[pk];
      if (base >= cap) return Math.floor(base);
      const v = base + (state.rates[pk] * Math.max(0, now - state.resAt)) / 3_600_000;
      return Math.floor(Math.min(cap, v));
    },
    [state, now],
  );

  const go = useCallback((tab: Tab, focus?: string) => {
    setNav({ tab, focus });
    window.scrollTo?.({ top: 0 });
  }, []);

  const value: Ctx = { state, now, busy, offline, act, refresh, res, nav, go, toast, logout, setState };
  return (
    <GameCtx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
            <Icon name={toastIcon(t)} size={20} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </GameCtx.Provider>
  );
}
