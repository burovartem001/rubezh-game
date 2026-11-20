import React, { useEffect } from 'react';
import { Cost, RES_KEYS, RES_NAMES, ResKey } from '../../shared/config';
import { useGame } from './game';
import { Icon } from './art/icons';

export function fmtDur(sec: number): string {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
export function fmtLong(sec: number): string {
  sec = Math.round(sec);
  if (sec < 60) return `${sec} с`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} мин${sec % 60 ? ` ${sec % 60} с` : ''}`;
  return `${Math.floor(m / 60)} ч ${m % 60} мин`;
}
export const pad2 = (n: number) => String(n).padStart(2, '0');
export function ago(ms: number, now: number): string {
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  return new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Стоимость с подсветкой нехватки. */
export function CostLine({ cost, check = true, mult = 1 }: { cost: Cost; check?: boolean; mult?: number }) {
  const { res } = useGame();
  const keys = RES_KEYS.filter((k) => cost[k]);
  if (!keys.length) return <span className="muted">бесплатно</span>;
  return (
    <span className="costline">
      {keys.map((k) => {
        const need = Math.round(cost[k]! * mult);
        const lack = check && res(k) < need;
        return (
          <span key={k} className={`cost ${lack ? 'lack' : ''}`} title={RES_NAMES[k]}>
            <Icon name={k} size={15} /> {need}
            <span className="sr">{RES_NAMES[k]}</span>
            {lack && <small> (не хватает {need - res(k)})</small>}
          </span>
        );
      })}
    </span>
  );
}
export function useAffordable() {
  const { res } = useGame();
  return (cost: Cost, mult = 1) => RES_KEYS.every((k) => res(k) >= Math.round((cost[k] ?? 0) * mult));
}
export function RewardLine({ cost }: { cost: Cost }) {
  const keys = RES_KEYS.filter((k) => cost[k]);
  if (!keys.length) return <span className="muted">—</span>;
  return (
    <span className="costline">
      {keys.map((k) => (
        <span key={k} className="cost gain" title={RES_NAMES[k]}>
          <Icon name={k} size={15} /> +{cost[k]}
          <span className="sr">{RES_NAMES[k]}</span>
        </span>
      ))}
    </span>
  );
}

export function Bar({ value, max = 100, tone }: { value: number; max?: number; tone?: 'olive' | 'red' }) {
  const p = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`bar ${tone ?? ''}`} role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${p}%` }} />
    </div>
  );
}

export function Countdown({ start, end }: { start: number; end: number }) {
  const { now } = useGame();
  const left = (end - now) / 1000;
  const waiting = now < start;
  return (
    <span className="countdown">
      {waiting ? `в очереди · ${fmtDur((end - start) / 1000)}` : left > 0 ? fmtDur(left) : 'завершается…'}
    </span>
  );
}
export function JobProgress({ start, end }: { start: number; end: number }) {
  const { now } = useGame();
  const p = now <= start ? 0 : ((now - start) / (end - start)) * 100;
  return <Bar value={p} />;
}

export function Sheet({ title, onClose, children, wide }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.classList.add('noscroll');
    return () => {
      window.removeEventListener('keydown', k);
      document.body.classList.remove('noscroll');
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Stepper({ value, min = 0, max, onChange, label }: { value: number; min?: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="stepper" aria-label={label}>
      <button type="button" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Меньше: ${label}`}>
        <Icon name="minus" size={18} />
      </button>
      <b className="num">{value}</b>
      <button type="button" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`Больше: ${label}`}>
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}

/** Фрагмент иллюстрации: 4 панели по горизонтали. */
export function Sprite({ img, index, className, focusY = 18 }: { img: 'operators' | 'vehicles'; index: number; className?: string; focusY?: number }) {
  return (
    <div
      className={`sprite ${className ?? ''}`}
      role="img"
      style={{
        backgroundImage: `url(img/${img}.jpg)`,
        backgroundPosition: `${(index / 3) * 100}% ${focusY}%`,
      }}
    />
  );
}

export function Button({
  children, onClick, disabled, kind = 'primary', why, small,
}: { children: React.ReactNode; onClick: () => void; disabled?: boolean; kind?: 'primary' | 'secondary' | 'danger'; why?: string; small?: boolean }) {
  const { busy } = useGame();
  return (
    <div className="btnwrap">
      <button type="button" className={`btn ${kind} ${small ? 'small' : ''}`} disabled={disabled || busy} onClick={onClick}>
        {children}
      </button>
      {disabled && why && <div className="why">{why}</div>}
    </div>
  );
}

export function resShort(k: ResKey) {
  return { supplies: 'припасы', parts: 'компл.', fuel: 'топливо', data: 'данные' }[k];
}
