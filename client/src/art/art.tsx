import React, { useEffect, useRef } from 'react';
import type { BuildingKey, VehicleType } from '../../../shared/config';
import { CAST, CastKey } from '../../../shared/lore';
import { Icon } from './icons';
import { Chevron } from './Chevron';

/* ───────────── Кадры из панорамы полигона (img/base.jpg, 16:9) ───────────── */

/** Центры зданий на панораме в долях ширины/высоты. */
export const BUILDING_SPOTS: Record<BuildingKey, { x: number; y: number; zoom: number }> = {
  hq: { x: 0.31, y: 0.36, zoom: 3.2 },
  comms: { x: 0.37, y: 0.17, zoom: 3.4 },
  workshop: { x: 0.53, y: 0.4, zoom: 3 },
  training: { x: 0.69, y: 0.5, zoom: 3.4 },
  fueldepot: { x: 0.9, y: 0.5, zoom: 3.6 },
  supply: { x: 0.87, y: 0.66, zoom: 3.4 },
  defense: { x: 0.62, y: 0.86, zoom: 3.2 },
  motorpool: { x: 0.72, y: 0.79, zoom: 3.2 },
  repairyard: { x: 0.46, y: 0.6, zoom: 3.4 },
  medbay: { x: 0.14, y: 0.53, zoom: 3.4 },
  analytics: { x: 0.22, y: 0.31, zoom: 3.4 },
  testrange: { x: 0.8, y: 0.4, zoom: 3.4 },
};

/** Фрагмент панорамы, отцентрованный на точке (cx, cy) с увеличением zoom. aspect — ширина/высота рамки. */
export function BaseCrop({ cx, cy, zoom, aspect = 1.4, className, children }: { cx: number; cy: number; zoom: number; aspect?: number; className?: string; children?: React.ReactNode }) {
  const imgAspect = 16 / 9;
  const bgH = (zoom * aspect) / imgAspect; // высота фона в долях высоты рамки
  const px = zoom === 1 ? 50 : Math.max(0, Math.min(100, ((cx * zoom - 0.5) / (zoom - 1)) * 100));
  const py = bgH <= 1 ? 50 : Math.max(0, Math.min(100, ((cy * bgH - 0.5) / (bgH - 1)) * 100));
  return (
    <div
      className={`crop ${className ?? ''}`}
      style={{ aspectRatio: String(aspect), backgroundImage: 'url(img/base.jpg)', backgroundSize: `${zoom * 100}% auto`, backgroundPosition: `${px}% ${py}%` }}
      role="img"
    >
      {children}
    </div>
  );
}
export function BuildingArt({ k, className, aspect, children }: { k: BuildingKey; className?: string; aspect?: number; children?: React.ReactNode }) {
  const s = BUILDING_SPOTS[k];
  return (
    <BaseCrop cx={s.x} cy={s.y} zoom={s.zoom} aspect={aspect} className={className}>
      {children}
    </BaseCrop>
  );
}

/* ───────────── Транспорт целиком ───────────── */

/**
 * Иллюстрация транспорта, вписанная целиком. Обычный транспорт — панели img/vehicles.jpg
 * (4 панели 1:2, машина занимает середину по высоте); наградной — векторные рисунки.
 */
export function VehicleArt({ type, w = 200, className }: { type: VehicleType | 'pickup'; w?: number; className?: string }) {
  const h = Math.round(w * 0.78);
  if (type === 'gyro' || type === 'niva') {
    return (
      <div className={`veh-art award ${className ?? ''}`} style={{ width: w, height: h }} role="img" aria-label={type === 'gyro' ? 'Гироскутер' : 'Золотая Нива'}>
        <img src={`img/art/${type}.webp`} alt="" draggable={false} />
      </div>
    );
  }
  const idx = { moto: 0, ebike: 1, bukhanka: 2, pickup: 3 }[type];
  const panelW = w * 1.04; // чуть шире рамки — скрываем разделители между панелями
  const panelH = panelW * 2;
  const x = w / 2 - (idx + 0.5) * panelW;
  const y = h / 2 - 0.52 * panelH;
  return (
    <div
      className={`veh-art ${className ?? ''}`}
      style={{ width: w, height: h, backgroundImage: 'url(img/vehicles.jpg)', backgroundSize: `${panelW * 4}px ${panelH}px`, backgroundPosition: `${x}px ${y}px` }}
      role="img"
    />
  );
}

export function Portrait({ sprite, size = 56, className, focusY = 14 }: { sprite: number; size?: number; className?: string; focusY?: number }) {
  return (
    <div
      className={`portrait-round ${className ?? ''}`}
      style={{ width: size, height: size, backgroundImage: 'url(img/operators.jpg)', backgroundPosition: `${(sprite / 3) * 100}% ${focusY}%` }}
      role="img"
    />
  );
}

export function Speech({ who, children, compact, action }: { who: CastKey; children: React.ReactNode; compact?: boolean; action?: React.ReactNode }) {
  const c = CAST[who];
  return (
    <div className={`speech ${compact ? 'compact' : ''}`}>
      <Portrait sprite={c.sprite} size={compact ? 44 : 60} className="speaker" />
      <div className="bubble" style={{ borderColor: c.color }}>
        <div className="speaker-name" style={{ color: c.color }}>
          {c.name} <span>· {c.role}</span>
        </div>
        <div className="speech-text">{children}</div>
        {action}
      </div>
    </div>
  );
}

/* ───────────── Анимированный дрон ───────────── */

export function Drone({ className, size = 46 }: { className?: string; size?: number }) {
  return <img className={`drone ${className ?? ''}`} src="img/art/drone.webp" style={{ width: size, height: Math.round(size * 0.6) }} alt="" aria-hidden draggable={false} />;
}

/* ───────────── Знаки различия командира ───────────── */

export function RankBadge({ level, size = 64, color = '#edbb76' }: { level: number; size?: number; color?: string }) {
  const tier = Math.max(1, Math.min(3, Math.ceil(level / 3.4)));
  const stars = level >= 10 ? 3 : level >= 7 ? 2 : level >= 4 ? 1 : 0;
  return (
    <span className="rank-badge" style={{ width: size, height: size * 1.15 }} role="img" aria-label={`Уровень ${level}`}>
      <img src={`img/art/rank${tier}.webp`} alt="" draggable={false} />
      <b style={{ fontSize: size * 0.26, color: '#eef0e8', top: stars ? '30%' : '34%' }}>{level}</b>
      {stars > 0 && <i style={{ fontSize: size * 0.14, color }}>{'★'.repeat(stars)}</i>}
    </span>
  );
}

/* ───────────── Печать на отчёте ───────────── */

export function Stamp({ text, tone }: { text: string; tone: 'ok' | 'mid' | 'bad' }) {
  return <div className={`stamp ${tone}`}>{text}</div>;
}

/* ───────────── Праздничная вспышка ───────────── */

export function Burst({ onDone, title, text, icon = 'star', chevron }: { onDone: () => void; title: string; text: string; icon?: string; chevron?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(onDone, 4200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="burst" ref={ref} onClick={onDone} role="alert">
      <div className="burst-card">
        <div className="burst-rays" aria-hidden />
        {Array.from({ length: 14 }, (_, i) => (
          <i key={i} className="spark" style={{ ['--a' as string]: `${(i / 14) * 360}deg`, ['--d' as string]: `${(i % 3) * 0.08}s` }} />
        ))}
        {chevron ? (
          <div className="burst-chevron"><Chevron def={chevron} size={96} /></div>
        ) : (
          <div className="burst-icon">
            <Icon name={icon} size={44} stroke={1.6} />
          </div>
        )}
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
    </div>
  );
}

/* ───────────── Кольцо таймера ───────────── */

export function Ring({ value, size = 44, children }: { value: number; size?: number; children?: React.ReactNode }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 44 44" width={size} height={size}>
        <circle cx="22" cy="22" r={r} fill="none" stroke="#35423b" strokeWidth="4" />
        <circle cx="22" cy="22" r={r} fill="none" stroke="#edbb76" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} transform="rotate(-90 22 22)" />
      </svg>
      <div className="ring-in">{children}</div>
    </div>
  );
}
