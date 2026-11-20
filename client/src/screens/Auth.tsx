import React, { useState } from 'react';
import { api } from '../api';
import { CAST, CastKey } from '../../../shared/lore';
import { Drone, Portrait } from '../art/art';
import { Icon } from '../art/icons';

export function AuthScreen({ onToken }: { onToken: (t: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [callsign, setCallsign] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = mode === 'login' ? await api.login({ login, password }) : await api.register({ login, password, callsign, commanderName: name });
      onToken(r.token);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-hero" style={{ backgroundImage: 'linear-gradient(180deg, rgba(11,17,19,.2), #0b1113 92%), url(img/base.jpg)' }}>
        <span className="kicker">Браузерная стратегия</span>
        <h1>РУБЕЖ</h1>
        <p>Тыловой полигон. Взвод БПЛА. Походы на карту секторов.</p>
        <Drone className="flyby" size={64} />
      </div>
      <div className="cast-row" aria-label="Команда полигона">
        {(Object.keys(CAST) as CastKey[]).map((k) => (
          <div key={k} className="cast-item">
            <Portrait sprite={CAST[k].sprite} size={58} />
            <b style={{ color: CAST[k].color }}>{CAST[k].name}</b>
            <small>{CAST[k].role}</small>
          </div>
        ))}
      </div>
      <div className="feature-row">
        <span><Icon name="base" size={18} /> строй полигон</span>
        <span><Icon name="squad" size={18} /> собирай отряд</span>
        <span><Icon name="map" size={18} /> отправляй походы</span>
      </div>
      <form className="panel auth-form" onSubmit={submit}>
        <div className="seg" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>
            Новый командир
          </button>
          <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>
            Вход
          </button>
        </div>
        <label>
          Логин
          <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required minLength={3} maxLength={32} autoCapitalize="off" />
        </label>
        <label>
          Пароль
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={6} />
        </label>
        {mode === 'register' && (
          <>
            <label>
              Позывной командира
              <input value={callsign} onChange={(e) => setCallsign(e.target.value)} required minLength={2} maxLength={24} placeholder="например, Ветер" />
            </label>
            <label>
              Имя командира
              <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={40} placeholder="например, Алексей" />
            </label>
          </>
        )}
        {err && <div className="error">{err}</div>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Связь…' : mode === 'login' ? 'Вернуться на полигон' : 'Принять командование'}
        </button>
        <p className="muted tiny">Игровой мир, карта, стороны и характеристики техники вымышлены и условны.</p>
      </form>
    </div>
  );
}
