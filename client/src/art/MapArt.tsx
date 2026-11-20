import React, { useMemo } from 'react';
import { HOME, SECTORS, sectorById } from '../../../shared/config';
import type { Expedition, SectorState } from '../api';
import { Icon } from './icons';

/** Нарисованная от руки карта местности: пергамент, рельеф, вода, леса, дороги, туман войны. Вымышленная. */

const TYPE_ICON = { observation: 'observation', warehouse: 'warehouse', stronghold: 'stronghold', route: 'route', event: 'event' } as const;

// детерминированный «случайный» генератор для деревьев и штриховки
function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a * 16807) % 2147483647;
    return (a - 1) / 2147483646;
  };
}

function Trees({ cx, cy, rx, ry, n, seed }: { cx: number; cy: number; rx: number; ry: number; n: number; seed: number }) {
  const r = prng(seed);
  const pts = Array.from({ length: n }, () => {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r());
    return [cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, 0.9 + r() * 0.7] as const;
  }).sort((p, q) => p[1] - q[1]);
  return (
    <g className="trees">
      {pts.map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${s.toFixed(2)})`}>
          <line x1="0" y1="0" x2="0" y2="1" className="trunk" />
          <circle cx="0" cy="-.3" r="1" className="crown" />
        </g>
      ))}
    </g>
  );
}

function Field({ x, y, w, h, rot, seed }: { x: number; y: number; w: number; h: number; rot: number; seed: number }) {
  const lines = [];
  for (let i = 1; i < h / 0.9; i++) lines.push(<line key={i} x1={0} y1={i * 0.9} x2={w} y2={i * 0.9} />);
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`} className="field" data-seed={seed}>
      <rect width={w} height={h} rx=".6" />
      {lines}
    </g>
  );
}

export function MapArt({
  sectors, expeditions, now, selected, onSelect,
}: { sectors: SectorState[]; expeditions: Expedition[]; now: number; selected: number | null; onSelect: (id: number) => void }) {
  const ss = (id: number) => sectors.find((s) => s.id === id)!;
  const pos = (id: number) => (id === 0 ? HOME : sectorById(id)!);
  const known = (id: number) => id === 0 || ss(id).unlocked || SECTORS.find((s) => s.id === id)!.links.some((l) => l === 0 || ss(l)?.unlocked);
  const edges = useMemo(() => {
    const out: [number, number][] = [];
    for (const s of SECTORS) for (const l of s.links) if (l < s.id) out.push([l, s.id]);
    return out;
  }, []);
  const road = (a: number, b: number) => {
    const A = pos(a), B = pos(b);
    const mx = (A.x + B.x) / 2 + (B.y - A.y) * 0.12;
    const my = (A.y + B.y) / 2 - (B.x - A.x) * 0.12;
    return `M${A.x} ${A.y} Q${mx} ${my} ${B.x} ${B.y}`;
  };

  return (
    <svg className="mapart" viewBox="0 0 100 100" role="img" aria-label="Нарисованная карта секторов">
      <defs>
        <filter id="paper" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="7" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 .55  0 0 0 0 .45  0 0 0 0 .3  0 0 0 .22 0" />
          <feComposite in2="SourceGraphic" operator="in" />
          <feBlend in="SourceGraphic" mode="multiply" />
        </filter>
        <filter id="rough">
          <feTurbulence type="fractalNoise" baseFrequency=".35" numOctaves="2" seed="3" result="t" />
          <feDisplacementMap in="SourceGraphic" in2="t" scale="1.2" />
        </filter>
        <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
          <stop offset=".62" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#3b2f1c" stopOpacity=".45" />
        </radialGradient>
        <pattern id="hatchRed" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="1.6" stroke="#a5503f" strokeWidth=".35" />
        </pattern>
        <radialGradient id="fogG">
          <stop offset="0" stopColor="#59605a" stopOpacity=".92" />
          <stop offset=".7" stopColor="#6b6f66" stopOpacity=".7" />
          <stop offset="1" stopColor="#6b6f66" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* пергамент */}
      <rect width="100" height="100" fill="#e3d7bc" filter="url(#paper)" />

      {/* сторона противника за линией */}
      <path d="M0 0 H100 V12 C 85 22, 70 14, 55 14 S 20 20, 0 16 Z" fill="url(#hatchRed)" opacity=".5" />

      {/* поля */}
      <Field x={52} y={78} w={10} h={7} rot={-8} seed={1} />
      <Field x={66} y={66} w={9} h={6} rot={12} seed={2} />
      <Field x={8} y={72} w={10} h={8} rot={4} seed={3} />
      <Field x={42} y={30} w={9} h={6} rot={-14} seed={4} />
      <Field x={80} y={38} w={10} h={7} rot={8} seed={5} />
      <Field x={22} y={46} w={7} h={6} rot={20} seed={6} />

      {/* рельеф: высота 112 */}
      <g className="contour" filter="url(#rough)">
        {[9, 7, 5, 3].map((r, i) => (
          <ellipse key={r} cx="67" cy="48" rx={r * 1.3} ry={r} opacity={0.5 + i * 0.12} />
        ))}
        <text x="72" y="44" className="tiny-ink">112</text>
      </g>
      {/* карьер */}
      <g className="quarry" filter="url(#rough)">
        <ellipse cx="33" cy="42" rx="7" ry="4.6" />
        <ellipse cx="33" cy="42" rx="5" ry="3.2" />
        <ellipse cx="33" cy="42" rx="3" ry="1.8" className="pit" />
      </g>
      {/* терриконы */}
      <g className="terricon">
        <path d="M54 12 L59 4 L64 12 Z" />
        <path d="M60 13 L66 3.5 L72 13 Z" />
        <path d="M67 12 L71 6 L75 12 Z" />
      </g>

      {/* река и озерцо */}
      <path className="river-bank" d="M101 50 C 92 54, 88 57, 84 61 S 72 64, 63 65.5 S 50 66, 42 67.5 S 26 66, 16 68.5 S 4 71, -1 70" />
      <path className="river" d="M101 50 C 92 54, 88 57, 84 61 S 72 64, 63 65.5 S 50 66, 42 67.5 S 26 66, 16 68.5 S 4 71, -1 70" />
      <ellipse cx="9" cy="54" rx="4" ry="2.4" className="lake" />

      {/* железная дорога */}
      <path className="rail" d="M101 24 C 90 26, 80 29, 72 31 S 56 35, 44 34" />
      <path className="rail-ties" d="M101 24 C 90 26, 80 29, 72 31 S 56 35, 44 34" />

      {/* леса */}
      <Trees cx={34} cy={80} rx={7} ry={1.6} n={16} seed={11} />
      <Trees cx={14} cy={34} rx={3} ry={8} n={20} seed={12} />
      <Trees cx={26} cy={22} rx={6} ry={4} n={18} seed={13} />
      <Trees cx={88} cy={72} rx={5} ry={3} n={12} seed={14} />
      <Trees cx={50} cy={46} rx={4} ry={2.4} n={10} seed={15} />
      <Trees cx={6} cy={88} rx={5} ry={4} n={14} seed={16} />
      <Trees cx={90} cy={88} rx={6} ry={4} n={14} seed={17} />
      <Trees cx={82} cy={42} rx={3} ry={2} n={8} seed={18} />

      {/* постройки у секторов */}
      <g className="houses">
        <rect x="62.5" y="70.5" width="2.2" height="1.6" /><rect x="65" y="71.5" width="1.6" height="1.4" /><path d="M62.3 70.6 l1.3 -1 1.3 1" />
        <rect x="45.5" y="53.5" width="1.6" height="4" /><rect x="47.3" y="54.5" width="1.6" height="3" /><rect x="49.1" y="55" width="1.6" height="2.5" />
        <rect x="76" y="27.2" width="4" height="1.4" /><rect x="70" y="28.5" width="4" height="1.4" />
        <path d="M20 57 l-1 -5 h2 z" /><circle cx="20" cy="51.6" r=".8" />
        <rect x="47" y="89" width="6" height="4" className="home-plot" />
      </g>

      {/* линия соприкосновения */}
      <path className="front" d="M0 16 C 20 20, 35 13, 55 14 S 85 22, 100 12" />
      <text x="17" y="15.5" className="ink-label red">УСЛОВНАЯ ЛБС</text>

      {/* дороги между секторами */}
      {edges.map(([a, b]) => {
        const vis = known(a) && known(b);
        const open = (a === 0 || ss(a).unlocked) && ss(b).unlocked;
        if (!vis) return null;
        return <path key={`${a}-${b}`} d={road(a, b)} className={`road ${open ? 'open' : 'dim'}`} />;
      })}

      {/* туман войны над закрытыми секторами */}
      {SECTORS.filter((s) => !ss(s.id).unlocked).map((s) => (
        <g key={s.id} className="fog">
          <circle cx={s.x} cy={s.y} r="10" fill="url(#fogG)" />
          <circle cx={s.x + 4} cy={s.y - 3} r="7" fill="url(#fogG)" />
          <circle cx={s.x - 5} cy={s.y + 2} r="6" fill="url(#fogG)" />
        </g>
      ))}

      {/* маршруты групп в походе */}
      {expeditions.map((x) => {
        const S = sectorById(x.sectorId)!;
        const f = Math.max(0, Math.min(1, (now - x.startAt) / (x.endAt - x.startAt)));
        const k = f < 0.4 ? f / 0.4 : f < 0.6 ? 1 : 1 - (f - 0.6) / 0.4;
        const cx = HOME.x + (S.x - HOME.x) * k;
        const cy = HOME.y + (S.y - HOME.y) * k;
        return (
          <g key={x.id}>
            <line x1={HOME.x} y1={HOME.y} x2={S.x} y2={S.y} className="route-ink" />
            <g transform={`translate(${cx} ${cy})`} className="map-unit">
              <circle r="2.6" className="unit-halo" />
              <Icon name="drone" size={4} x={-2} y={-2} stroke={2.2} />
            </g>
          </g>
        );
      })}

      {/* полигон игрока */}
      <g className="home-pin">
        <circle cx={HOME.x} cy={HOME.y} r="4.2" />
        <Icon name="base" size={4.6} x={HOME.x - 2.3} y={HOME.y - 2.5} stroke={2} />
        <text x={HOME.x} y={HOME.y + 7.4} textAnchor="middle" className="ink-label home">ПОЛИГОН</text>
      </g>

      {/* секторы */}
      {SECTORS.map((s) => {
        const st = ss(s.id);
        const vis = known(s.id);
        const cls = !st.unlocked ? 'locked' : st.control >= 100 ? 'controlled' : st.successes > 0 ? 'visited' : 'open';
        const busy = expeditions.some((x) => x.sectorId === s.id);
        return (
          <g
            key={s.id}
            className={`pin ${cls} ${selected === s.id ? 'sel' : ''} ${busy ? 'busy' : ''} ${vis ? '' : 'unknown'}`}
            onClick={() => onSelect(s.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(s.id)}
            role="button"
            tabIndex={0}
            aria-label={`Сектор ${s.id}${vis ? `: ${s.name}` : ''}${st.unlocked ? '' : ', закрыт'}`}
          >
            <circle cx={s.x} cy={s.y} r="7.5" className="hit" />
            {cls === 'open' && <circle cx={s.x} cy={s.y} r="4.4" className="pulse" />}
            <circle cx={s.x} cy={s.y} r="4" className="disc" />
            {vis && st.unlocked ? (
              <Icon name={TYPE_ICON[s.type]} size={4.6} x={s.x - 2.3} y={s.y - 2.3} stroke={2} />
            ) : (
              <Icon name={vis ? 'lock' : 'compass'} size={4} x={s.x - 2} y={s.y - 2} stroke={2} />
            )}
            <text x={s.x + 3.4} y={s.y - 3.2} className="pin-num">{String(s.id).padStart(2, '0')}</text>
            {vis && (
              <text x={s.x} y={s.y + 7.2} textAnchor="middle" className="ink-label">
                {s.name}
              </text>
            )}
            {st.unlocked && st.recon > 0 && (
              <g className="recon-meter">
                <rect x={s.x - 3.5} y={s.y + 8.3} width="7" height=".8" rx=".4" className="track" />
                <rect x={s.x - 3.5} y={s.y + 8.3} width={(7 * st.recon) / 100} height=".8" rx=".4" className="fill" />
              </g>
            )}
            {st.control >= 100 && <path d={`M${s.x + 2.6} ${s.y - 6.5} v4 M${s.x + 2.6} ${s.y - 6.5} h2.4 l-.8 1 .8 1 h-2.4`} className="flag" />}
          </g>
        );
      })}

      {/* роза ветров */}
      <g className="compass-rose" transform="translate(9 9)">
        <circle r="5.2" />
        <path d="M0 -5 L1.2 0 L0 5 L-1.2 0 Z" className="needle" />
        <path d="M-5 0 L0 1 L5 0 L0 -1 Z" />
        <text y="-6" textAnchor="middle">С</text>
      </g>
      {/* масштаб и подпись */}
      <g className="scale" transform="translate(70 96)">
        <rect width="5" height=".9" /><rect x="5" width="5" height=".9" className="w" /><rect x="10" width="5" height=".9" />
        <text x="16" y=".9">2 км (условно)</text>
      </g>
      <rect width="100" height="100" fill="url(#vignette)" pointerEvents="none" />
      <rect x=".6" y=".6" width="98.8" height="98.8" className="frame" />
    </svg>
  );
}
