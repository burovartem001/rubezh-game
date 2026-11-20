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
        {type === 'gyro' ? <GyroSvg /> : <NivaSvg />}
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

function GyroSvg() {
  return (
    <svg viewBox="0 0 200 156" width="100%" height="100%">
      <defs>
        <linearGradient id="gyroBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7d8a5c" />
          <stop offset="1" stopColor="#4c5737" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="132" rx="80" ry="10" fill="#8d7b5c" opacity=".35" />
      {/* дальнее колесо */}
      <ellipse cx="146" cy="88" rx="22" ry="34" fill="#2b2a26" stroke="#1a1916" strokeWidth="2" />
      <ellipse cx="146" cy="88" rx="12" ry="20" fill="#8c8f86" stroke="#3b3a33" strokeWidth="2" />
      <path d="M126 70 Q130 48 150 50 Q168 54 168 80 L160 82 Q158 62 148 62 Q138 62 136 72 Z" fill="url(#gyroBody)" stroke="#2f3524" strokeWidth="2.5" strokeLinejoin="round" />
      {/* платформа */}
      <path d="M58 82 L146 62 L152 82 L64 106 Z" fill="url(#gyroBody)" stroke="#2f3524" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M64 106 L152 82 L152 90 L66 115 Z" fill="#39412a" stroke="#2f3524" strokeWidth="2" strokeLinejoin="round" />
      <path d="M74 88 L98 82 L101 90 L77 96 Z M110 79 L134 73 L137 81 L113 87 Z" fill="#1f211c" />
      <path d="M68 111 L148 88" stroke="#8fd3e0" strokeWidth="2.5" strokeLinecap="round" className="drone-light" />
      {/* ближнее колесо */}
      <ellipse cx="56" cy="100" rx="26" ry="40" fill="#2b2a26" stroke="#1a1916" strokeWidth="2" />
      <ellipse cx="56" cy="100" rx="14" ry="24" fill="#a3a69c" stroke="#3b3a33" strokeWidth="2" />
      <ellipse cx="56" cy="100" rx="5" ry="8" fill="#5b5d56" />
      {/* крылья над колёсами — узнаваемый силуэт гироскутера */}
      <path d="M30 92 Q32 52 60 56 Q74 58 78 76 L66 80 Q62 68 54 68 Q42 70 40 92 Z" fill="url(#gyroBody)" stroke="#2f3524" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="44" cy="74" r="3" fill="#8fd3e0" className="drone-light" />
      <circle cx="160" cy="66" r="2.5" fill="#8fd3e0" className="drone-light" />
    </svg>
  );
}

function NivaSvg() {
  return (
    <svg viewBox="0 0 200 156" width="100%" height="100%">
      <defs>
        <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6dc8a" />
          <stop offset=".45" stopColor="#d4a93e" />
          <stop offset="1" stopColor="#8f6518" />
        </linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6c7a80" />
          <stop offset="1" stopColor="#2c3438" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="134" rx="88" ry="9" fill="#8d7b5c" opacity=".35" />
      {/* багажник на крыше */}
      <path d="M66 40 H150 M70 40 v-6 M146 40 v-6 M66 34 H150" stroke="#2e2a24" strokeWidth="2.5" fill="none" />
      {/* кузов */}
      <path d="M12 116 L13 90 Q14 80 26 78 L58 74 L74 46 Q77 41 84 41 H148 Q155 41 158 48 L170 74 L184 78 Q192 80 192 90 V116 Z" fill="url(#gold)" stroke="#3b2a0c" strokeWidth="2.5" strokeLinejoin="round" />
      {/* окна */}
      <path d="M80 72 L90 50 H112 V72 Z" fill="url(#glass)" stroke="#3b2a0c" strokeWidth="2" />
      <path d="M118 50 H146 Q150 50 152 54 L160 72 H118 Z" fill="url(#glass)" stroke="#3b2a0c" strokeWidth="2" />
      <path d="M86 66 L94 52" stroke="#c9d6da" strokeWidth="2" opacity=".6" />
      <path d="M124 66 L130 53" stroke="#c9d6da" strokeWidth="2" opacity=".6" />
      {/* двери, ручки, молдинг */}
      <path d="M114 74 V112 M62 76 V112" stroke="#7a5512" strokeWidth="1.8" />
      <path d="M100 82 h8 M140 82 h8" stroke="#3b2a0c" strokeWidth="3" strokeLinecap="round" />
      <path d="M16 96 H188" stroke="#fff3c4" strokeWidth="1.5" opacity=".7" />
      {/* бамперы и фары */}
      <rect x="182" y="104" width="12" height="10" rx="2" fill="#26231e" />
      <rect x="8" y="104" width="12" height="10" rx="2" fill="#26231e" />
      <circle cx="186" cy="88" r="5" fill="#fff5c9" stroke="#3b2a0c" strokeWidth="1.5" />
      <rect x="14" y="84" width="6" height="8" rx="1.5" fill="#c0392b" stroke="#3b2a0c" strokeWidth="1" />
      {/* колёса */}
      {[50, 152].map((x) => (
        <g key={x}>
          <path d={`M${x - 26} 116 a26 26 0 0 1 52 0`} fill="#4a3510" />
          <circle cx={x} cy="118" r="20" fill="#24221e" stroke="#11100e" strokeWidth="2" />
          <circle cx={x} cy="118" r="10" fill="url(#gold)" stroke="#3b2a0c" strokeWidth="1.5" />
          <circle cx={x} cy="118" r="3" fill="#3b2a0c" />
        </g>
      ))}
      {/* блики */}
      {[
        [40, 30],
        [176, 50],
        [100, 24],
      ].map(([x, y], i) => (
        <path key={i} className="glint" d={`M${x} ${y - 7} L${x + 2} ${y - 2} L${x + 7} ${y} L${x + 2} ${y + 2} L${x} ${y + 7} L${x - 2} ${y + 2} L${x - 7} ${y} L${x - 2} ${y - 2} Z`} fill="#fff3c4" style={{ animationDelay: `${i * 0.6}s` }} />
      ))}
    </svg>
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
