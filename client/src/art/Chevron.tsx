import React, { useEffect, useId, useState } from 'react';
import { CHEVRON_CATEGORIES, CHEVRON_RARITY_COLORS, CHEVRON_RARITY_NAMES, ChevronDef, ChevronShape, chevronByKey } from '../../../shared/chevrons';
import { Icon } from './icons';

/** Контуры нашивок в поле 100×120. */
const SHAPES: Record<ChevronShape, string> = {
  shield: 'M50 4 L92 16 V58 C92 88 72 106 50 116 C28 106 8 88 8 58 V16 Z',
  round: 'M50 14 A46 46 0 1 1 49.9 14 Z',
  hex: 'M50 6 L94 32 V88 L50 114 L6 88 V32 Z',
  tab: 'M14 20 H86 Q94 20 94 28 V92 Q94 100 86 100 H14 Q6 100 6 92 V28 Q6 20 14 20 Z',
  diamond: 'M50 4 L96 60 L50 116 L4 60 Z',
  arch: 'M8 112 V50 A42 42 0 0 1 92 50 V112 Z',
};
const ICON_Y: Record<ChevronShape, number> = { shield: 30, round: 30, hex: 30, tab: 30, diamond: 32, arch: 36 };
const BAND_Y: Record<ChevronShape, number> = { shield: 76, round: 78, hex: 78, tab: 74, diamond: 74, arch: 82 };

const inner = (k: number) => `translate(50 60) scale(${k}) translate(-50 -60)`;

/** Нарисованный шеврон. dim — ещё не получен (силуэт). */
/** Открыть нашивку на весь экран (окно ChevronViewer, оно встроено в каркас игры). */
export function zoomChevron(key: string, locked = false) {
  window.dispatchEvent(new CustomEvent('chevron:zoom', { detail: { key, locked } }));
}

export function Chevron({ def, size = 72, dim, className, zoom = true }: { def: ChevronDef | string | undefined; size?: number; dim?: boolean; className?: string; zoom?: boolean }) {
  const d = typeof def === 'string' ? chevronByKey(def) : def;
  const uid = useId().replace(/[:]/g, '');
  if (!d) return null;
  if (d.image) {
    const open = (e: React.SyntheticEvent) => {
      e.stopPropagation();
      e.preventDefault();
      zoomChevron(d.key, !!dim);
    };
    return (
      <span
        className={`chevron patch r-${d.rarity} ${dim ? 'dim' : ''} ${zoom ? 'zoomable' : ''} ${className ?? ''}`}
        style={{ width: size, height: size * 1.2 }}
        {...(zoom
          ? { role: 'button', tabIndex: 0, title: 'Открыть на весь экран', onClick: open, onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && open(e) }
          : {})}
      >
        <img src={d.image} alt={`Нашивка «${d.name}»`} loading="lazy" draggable={false} />
      </span>
    );
  }
  const path = SHAPES[d.shape];
  const glow = CHEVRON_RARITY_COLORS[d.rarity];
  const motto = d.motto;
  const fs = Math.min(10, 110 / Math.max(motto.length, 1));
  const maxW = d.shape === 'diamond' ? 56 : d.shape === 'round' ? 58 : d.shape === 'shield' ? 66 : 70;
  const fit = motto.length * fs * 0.72 > maxW ? { textLength: maxW, lengthAdjust: 'spacingAndGlyphs' as const } : {};
  const iconY = ICON_Y[d.shape];
  const bandY = BAND_Y[d.shape];
  return (
    <svg
      className={`chevron ${dim ? 'dim' : ''} ${className ?? ''}`}
      width={size}
      height={size * 1.2}
      viewBox="0 0 100 120"
      role="img"
      aria-label={`Шеврон «${d.name}»`}
    >
      <defs>
        <linearGradient id={`g${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={d.bg} />
          <stop offset="1" stopColor={d.bg2} />
        </linearGradient>
        <clipPath id={`c${uid}`}>
          <path d={path} transform={inner(0.88)} />
        </clipPath>
        <pattern id={`t${uid}`} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="3" stroke="#000" strokeOpacity=".12" strokeWidth="1" />
        </pattern>
      </defs>
      {/* кант */}
      <path d={path} fill={d.border} stroke={glow} strokeWidth="1.5" />
      {/* поле с фактурой ткани */}
      <path d={path} transform={inner(0.88)} fill={`url(#g${uid})`} />
      <path d={path} transform={inner(0.88)} fill={`url(#t${uid})`} />
      {/* вышитый шов */}
      <path d={path} transform={inner(0.8)} fill="none" stroke={d.ink} strokeOpacity=".55" strokeWidth="1.2" strokeDasharray="3 2.2" />
      {/* лента с девизом */}
      <g clipPath={`url(#c${uid})`}>
        <rect x="0" y={bandY} width="100" height="16" fill="#000" fillOpacity=".35" />
        <line x1="0" y1={bandY} x2="100" y2={bandY} stroke={d.border} strokeWidth="1" />
        <line x1="0" y1={bandY + 16} x2="100" y2={bandY + 16} stroke={d.border} strokeWidth="1" />
      </g>
      <text x="50" y={bandY + 11.2} textAnchor="middle" fontSize={fs} fontWeight="800" fill={d.ink} letterSpacing=".6" fontFamily="Arial, sans-serif" {...fit}>
        {motto}
      </text>
      {/* герб */}
      <g style={{ color: d.ink }}>
        <circle cx="50" cy={iconY + 17} r="19" fill="#000" fillOpacity=".18" />
        <Icon name={d.icon} size={30} x={35} y={iconY + 2} stroke={1.9} />
      </g>
      {/* звёздочки-заклёпки */}
      <circle cx="50" cy={d.shape === 'round' ? 22 : 13} r="2" fill={d.border} />
    </svg>
  );
}

/** Нашивка на весь экран: крупная картинка, название, редкость и как получить. Закрывается касанием или Esc. */
export function ChevronViewer() {
  const [cur, setCur] = useState<{ key: string; locked: boolean } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setCur((e as CustomEvent).detail);
    window.addEventListener('chevron:zoom', on);
    return () => window.removeEventListener('chevron:zoom', on);
  }, []);
  useEffect(() => {
    if (!cur) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setCur(null);
    window.addEventListener('keydown', k);
    document.body.classList.add('noscroll');
    return () => {
      window.removeEventListener('keydown', k);
      document.body.classList.remove('noscroll');
    };
  }, [cur]);
  const d = cur ? chevronByKey(cur.key) : undefined;
  if (!cur || !d?.image) return null;
  const color = CHEVRON_RARITY_COLORS[d.rarity];
  const how = d.condition?.text ?? (d.category === 'site' ? 'Выдаёт сайт «Учёт дронов» за особые заслуги' : CHEVRON_CATEGORIES.find((c) => c.key === d.category)?.text);
  return (
    <div className="chev-viewer" role="dialog" aria-modal="true" aria-label={`Нашивка «${d.name}»`} onClick={() => setCur(null)}>
      <button className="chev-viewer-close" aria-label="Закрыть" onClick={() => setCur(null)}>
        <Icon name="close" size={26} />
      </button>
      <img className={`r-${d.rarity}`} src={d.image} alt={`Нашивка «${d.name}»`} draggable={false} />
      <div className="chev-viewer-info">
        <b>{d.name}</b>
        <span className="rarity-tag" style={{ color, borderColor: color }}>{CHEVRON_RARITY_NAMES[d.rarity]}</span>
        {how && <small>{how}</small>}
        {cur.locked && <small className="locked">Ещё не получена</small>}
      </div>
    </div>
  );
}
