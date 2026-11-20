import React, { useEffect, useRef } from 'react';
import type { BuildingKey } from '../../../shared/config';
import { CAST, CastKey } from '../../../shared/lore';
import { Icon } from './icons';

/* ───────────── Кадры из панорамы полигона (img/base.jpg, 16:9) ───────────── */

/** Центры зданий на панораме в долях ширины/высоты. */
export const BUILDING_SPOTS: Record<BuildingKey, { x: number; y: number; zoom: number }> = {
  hq: { x: 0.31, y: 0.36, zoom: 3.2 },
  comms: { x: 0.37, y: 0.17, zoom: 3.4 },
  workshop: { x: 0.53, y: 0.4, zoom: 3 },
  training: { x: 0.69, y: 0.5, zoom: 3.4 },
  fueldepot: { x: 0.9, y: 0.5, zoom: 3.6 },
  supply: { x: 0.87, y: 0.66, zoom: 3.4 },
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

/* ───────────── Персонажи ───────────── */

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
  return (
    <svg className={`drone ${className ?? ''}`} width={size} height={size * 0.6} viewBox="0 0 100 60" aria-hidden>
      <g stroke="#1a1f1c" strokeWidth="3" strokeLinecap="round">
        <line x1="38" y1="30" x2="16" y2="16" />
        <line x1="62" y1="30" x2="84" y2="16" />
        <line x1="38" y1="34" x2="20" y2="44" />
        <line x1="62" y1="34" x2="80" y2="44" />
      </g>
      <rect x="36" y="24" width="28" height="14" rx="4" fill="#3c4a3f" stroke="#1a1f1c" strokeWidth="2" />
      <circle cx="50" cy="40" r="3.5" fill="#edbb76" className="drone-light" />
      {[
        [16, 14],
        [84, 14],
        [20, 44],
        [80, 44],
      ].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <ellipse className="rotor" rx="15" ry="2.6" fill="#d9dccf" opacity=".55" />
        </g>
      ))}
    </svg>
  );
}

/* ───────────── Знаки различия командира ───────────── */

export function RankBadge({ level, size = 64, color = '#edbb76' }: { level: number; size?: number; color?: string }) {
  const chevrons = Math.min(3, Math.ceil(level / 3.4));
  const stars = level >= 10 ? 3 : level >= 7 ? 2 : level >= 4 ? 1 : 0;
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 60 70" className="rank-badge" aria-label={`Уровень ${level}`}>
      <path d="M30 2 L56 12 V38 C56 54 44 64 30 68 C16 64 4 54 4 38 V12 Z" fill="#1c2a25" stroke={color} strokeWidth="2.5" />
      <path d="M30 8 L50 16 V38 C50 50 41 58 30 62 C19 58 10 50 10 38 V16 Z" fill="none" stroke={color} strokeOpacity=".35" strokeWidth="1" />
      {Array.from({ length: stars }, (_, i) => {
        const x = stars === 1 ? 30 : stars === 2 ? 22 + i * 16 : 16 + i * 14;
        return <path key={i} transform={`translate(${x} 22) scale(.42)`} d="M0 -14 L4 -4 L14 -4 L6 3 L9 13 L0 7 L-9 13 L-6 3 L-14 -4 L-4 -4 Z" fill={color} />;
      })}
      {Array.from({ length: chevrons }, (_, i) => (
        <path key={i} d={`M16 ${38 + i * 8} L30 ${46 + i * 8} L44 ${38 + i * 8}`} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      <text x="30" y={stars ? 35 : 30} textAnchor="middle" fontSize="11" fontWeight="800" fill="#eef0e8">
        {level}
      </text>
    </svg>
  );
}

/* ───────────── Печать на отчёте ───────────── */

export function Stamp({ text, tone }: { text: string; tone: 'ok' | 'mid' | 'bad' }) {
  return <div className={`stamp ${tone}`}>{text}</div>;
}

/* ───────────── Праздничная вспышка ───────────── */

export function Burst({ onDone, title, text, icon = 'star' }: { onDone: () => void; title: string; text: string; icon?: string }) {
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
        <div className="burst-icon">
          <Icon name={icon} size={44} stroke={1.6} />
        </div>
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
