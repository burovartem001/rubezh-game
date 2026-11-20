import React from 'react';

/** Набор оригинальных линейных иконок 24×24 в едином стиле. Цвет — currentColor. */
const P: Record<string, React.ReactNode> = {
  // ресурсы
  supplies: (<><path d="M3 8l9-4 9 4v9l-9 4-9-4z" /><path d="M3 8l9 4 9-4M12 12v9" /><path d="M7.5 6l9 4" /></>),
  parts: (<><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>),
  fuel: (<><path d="M5 6h9l3 3v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" /><path d="M8 3h4v3M17 9l2-2M9 12c1.5 2 1.5 4 0 5M12 12c1.5 2 1.5 4 0 5" /></>),
  data: (<><rect x="5" y="5" width="14" height="14" rx="2" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /><path d="M9 12l2 2 4-4" /></>),
  // навигация
  base: (<><path d="M3 20h18M5 20V10l7-5 7 5v10" /><path d="M10 20v-5h4v5" /><path d="M12 5V2l3 1-3 1" /></>),
  map: (<><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" /><path d="M9 4v14M15 6v14" /><circle cx="17.5" cy="10" r="1" /></>),
  squad: (<><circle cx="8" cy="8" r="3" /><circle cx="16.5" cy="9" r="2.5" /><path d="M2.5 20c.5-4 3-6 5.5-6s5 2 5.5 6M13.5 14.5c1-1 2-1.5 3-1.5 2.3 0 4 1.8 4.5 5.5" /></>),
  commander: (<><path d="M12 2l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 15.4 6.8 18.1l1-5.8L3.5 8.2l5.9-.9z" /><path d="M8 21l4-2 4 2" /></>),
  reports: (<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 2.5h6V6H9zM8.5 10.5h7M8.5 14h7M8.5 17.5h4" /></>),
  // здания
  hq: (<><path d="M3 21h18M5 21V9h14v12" /><path d="M5 9l2-4h10l2 4M9 13h2M13 13h2M9 17h2M13 17h2" /><path d="M12 5V2" /></>),
  training: (<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /><path d="M20 4l-6 6" /></>),
  workshop: (<><path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L3.5 17.5l3 3 5.7-5.7a4 4 0 0 0 5.3-5.3l-2.6 2.6-2.6-.4-.4-2.6z" /></>),
  supply: (<><rect x="3" y="11" width="8" height="9" /><rect x="13" y="11" width="8" height="9" /><rect x="8" y="3" width="8" height="8" /><path d="M7 11v3M17 11v3M12 3v3" /></>),
  fueldepot: (<><ellipse cx="12" cy="6" rx="7" ry="2.5" /><path d="M5 6v11c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 11.5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" /></>),
  comms: (<><path d="M12 10v11M8 21l4-11 4 11M9.5 16h5" /><circle cx="12" cy="8" r="2" /><path d="M7.8 4.2a6 6 0 0 0 0 7.6M16.2 4.2a6 6 0 0 1 0 7.6M5 2a9.5 9.5 0 0 0 0 12M19 2a9.5 9.5 0 0 1 0 12" /></>),
  // задания
  recon: (<><circle cx="7" cy="14" r="4" /><circle cx="17" cy="14" r="4" /><path d="M11 14h2M5 10l2-6h3l1 6M19 10l-2-6h-3l-1 6" /></>),
  raid: (<><circle cx="12" cy="12" r="7" /><path d="M12 2v5M12 17v5M2 12h5M17 12h5" /><circle cx="12" cy="12" r="1.5" /></>),
  stronghold: (<><path d="M3 21V9h3V6h3v3h6V6h3v3h3v12z" /><path d="M10 21v-5a2 2 0 0 1 4 0v5" /></>),
  supplymission: (<><path d="M2 7h11v9H2zM13 10h5l3 3v3h-8" /><circle cx="6" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>),
  // классы
  scout: (<><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
  fpv: (<><rect x="3" y="8" width="18" height="8" rx="3" /><circle cx="8" cy="12" r="1.6" /><circle cx="16" cy="12" r="1.6" /><path d="M7 8l1-4M17 8l-1-4" /></>),
  heavy: (<><rect x="8" y="9" width="8" height="6" rx="1" /><path d="M8 10L4 6M16 10l4-4M8 14l-4 4M16 14l4 4" /><path d="M1.5 6h5M17.5 6h5M1.5 18h5M17.5 18h5" /><path d="M10 15v3h4v-3" /></>),
  babayaga: (<><circle cx="12" cy="12" r="3" /><path d="M12 9V4M12 15v5M9.4 10.5L5 8M14.6 13.5L19 16M9.4 13.5L5 16M14.6 10.5L19 8" /><path d="M10 4h4M10 20h4M3.5 6.8l2.5 2.4M18 14.8l2.5 2.4M3.5 17.2L6 14.8M18 9.2l2.5-2.4" /></>),
  drone: (<><rect x="9" y="10" width="6" height="4" rx="1" /><path d="M9 11L5.5 7.5M15 11l3.5-3.5M9 13l-3.5 3.5M15 13l3.5 3.5" /><ellipse cx="5" cy="7" rx="3" ry="1" /><ellipse cx="19" cy="7" rx="3" ry="1" /><ellipse cx="5" cy="17" rx="3" ry="1" /><ellipse cx="19" cy="17" rx="3" ry="1" /></>),
  // транспорт
  moto: (<><circle cx="5.5" cy="16" r="3.5" /><circle cx="18.5" cy="16" r="3.5" /><path d="M5.5 16l4-6h5l4 6M9.5 10l-1-3h-2M14.5 10l1.5-3h2.5" /></>),
  ebike: (<><circle cx="5.5" cy="16" r="3.5" /><circle cx="18.5" cy="16" r="3.5" /><path d="M5.5 16l3.5-7h6l3.5 7M9 9l3 7h-6.5M15 9l-3 7M8 6h3M15 9l1-3h2" /><path d="M11 11l1.5-2-.5 2h1.5" /></>),
  bukhanka: (<><path d="M2 17V9c0-2 1-3 3-3h10c3 0 5 3 6 6v5z" /><path d="M2 11h19M6 6v5M11 6v5M16 6v5" /><circle cx="6.5" cy="17.5" r="2" /><circle cx="16.5" cy="17.5" r="2" /></>),
  pickup: (<><path d="M2 17v-5l2-1h5V7h6l3 4h3v6z" /><path d="M9 11h6" /><circle cx="6.5" cy="17.5" r="2" /><circle cx="17" cy="17.5" r="2" /></>),
  // оснащение
  nsu: (<><path d="M12 21V11M8 21h8" /><path d="M12 11l-6-7h12z" /><path d="M9 7.5h6" /></>),
  reb: (<><path d="M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6z" /><path d="M7.5 12c1.5-2 3-2 4.5 0s3 2 4.5 0" /></>),
  commkit: (<><rect x="7" y="7" width="10" height="14" rx="2" /><path d="M10 7l-3-5M10 11h4M10 14h4M10 17h4" /></>),
  repairkit: (<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V4h6v3M12 10.5v6M9 13.5h6" /></>),
  // награды
  veteran: (<><path d="M4 13a8 8 0 0 1 16 0v2H4z" /><path d="M2.5 15h19M8 15v3l4 2 4-2v-3" /><path d="M12 5v3M9 9.5l3-1.5 3 1.5" /></>),
  gyro: (<><ellipse cx="5" cy="15" rx="3" ry="5" /><ellipse cx="19" cy="15" rx="3" ry="5" /><path d="M7.5 12.5h9l-1 3h-7z" /><path d="M9 14h2M13 14h2" /></>),
  niva: (<><path d="M2 16v-3.5L4.5 12l2.5-4h8l3 4 3.5.7V16z" /><path d="M8 8l-1.5 4h11M12 8v4" /><circle cx="6.5" cy="16.5" r="2" /><circle cx="17" cy="16.5" r="2" /><path d="M19.5 4l.5 1.2 1.2.5-1.2.5-.5 1.3-.5-1.3-1.2-.5 1.2-.5z" /></>),
  rebNew: (<><path d="M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6z" /><path d="M13 7l-3 5.5h4L11 18" /></>),
  nsuRubicon: (<><path d="M12 21V11M8 21h8" /><path d="M12 11l-6-7h12z" /><path d="M18.5 13.5l.8 1.7 1.8.3-1.3 1.3.3 1.8-1.6-.9-1.6.9.3-1.8-1.3-1.3 1.8-.3z" /></>),
  pigGear: (<><path d="M8 3l-3 2v15l3 1h8l3-1V5l-3-2-1.5 3h-5z" /><path d="M8 10h8M8 14h8M10 10v4M14 10v4" /></>),
  fpvBoevye: (<><rect x="8.5" y="8" width="7" height="4.5" rx="1" /><path d="M8.5 9L5 6M15.5 9L19 6M8.5 11.5L5 14.5M15.5 11.5l3.5 3" /><circle cx="4.5" cy="5.5" r="2" /><circle cx="19.5" cy="5.5" r="2" /><circle cx="4.5" cy="15" r="2" /><circle cx="19.5" cy="15" r="2" /><circle cx="12" cy="19" r="3" /><path d="M11 20.5v-3h1.5a1 1 0 0 1 0 2H11M10.3 19.5h2.2" /></>),
  mavicField: (<><rect x="9" y="7" width="6" height="5" rx="1.5" /><path d="M9 8L5 5.5M15 8l4-2.5M9 11l-4 2.5M15 11l4 2.5" /><path d="M2.5 5.5h5M16.5 5.5h5M2.5 13.5h5M16.5 13.5h5" /><path d="M2 21c1.5-2 2.5-3 3-5M6 21c.5-1.5 1-2.5 1-4M10 21c0-1.5.5-3 1.5-4M14 21c0-1 .5-2.5 2-4M18 21c.5-1.5 1.5-3 3-4" /></>),
  medal: (<><path d="M8 2l4 7 4-7M6 2h4M14 2h4" /><circle cx="12" cy="15" r="6" /><path d="M12 11.5l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z" /></>),
  // разное
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  star: (<><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></>),
  lock: (<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
  check: (<><path d="M4 12.5l5 5L20 6.5" /></>),
  alert: (<><path d="M12 3l10 17H2z" /><path d="M12 10v4M12 17v.5" /></>),
  cross: (<><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 7.5v9M7.5 12h9" /></>),
  arrow: (<><path d="M5 12h14M13 6l6 6-6 6" /></>),
  back: (<><path d="M19 12H5M11 6l-6 6 6 6" /></>),
  plus: (<><path d="M12 5v14M5 12h14" /></>),
  minus: (<><path d="M5 12h14" /></>),
  close: (<><path d="M6 6l12 12M18 6L6 18" /></>),
  up: (<><path d="M12 19V5M6 11l6-6 6 6" /></>),
  gift: (<><rect x="3" y="9" width="18" height="12" rx="1" /><path d="M3 13h18M12 9v12M12 9c-2-4-6-4-6-1.5S10 9 12 9c2 0 6 1 6-1.5S14 5 12 9" /></>),
  flag: (<><path d="M5 21V3M5 4h12l-2 4 2 4H5" /></>),
  observation: (<><path d="M9 21l2-13h2l2 13M8 21h8M10 13h4M10 17h4" /><path d="M7 8h10l-2-5H9z" /></>),
  warehouse: (<><path d="M2 21V10l10-6 10 6v11" /><path d="M6 21v-8h12v8M6 16h12" /></>),
  route: (<><path d="M8 21L11 3M16 21L13 3" /><path d="M12 6v2M12 11v2M12 16v2" /></>),
  event: (<><path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19" /><circle cx="12" cy="12" r="2.5" /></>),
  settings: (<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>),
  logout: (<><path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5M10 16l-4-4 4-4M6 12h10" /></>),
  heart: (<><path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.7A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z" /></>),
  skull: (<><path d="M5 11a7 7 0 1 1 14 0v3l-2 2v3H7v-3l-2-2z" /><circle cx="9" cy="11.5" r="1.5" /><circle cx="15" cy="11.5" r="1.5" /><path d="M10 19v-2M14 19v-2" /></>),
  wrench: (<><path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L3.5 17.5l3 3 5.7-5.7a4 4 0 0 0 5.3-5.3l-2.6 2.6-2.6-.4-.4-2.6z" /></>),
  sparkle: (<><path d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8z" /></>),
  compass: (<><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>),
  radio: (<><path d="M5 12a7 7 0 0 1 14 0M8 12a4 4 0 0 1 8 0" /><circle cx="12" cy="12" r="1.5" /><path d="M12 13.5V21" /></>),
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 20, className, title, stroke = 1.7, x, y }: { name: string; size?: number; className?: string; title?: string; stroke?: number; x?: number; y?: number }) {
  const body = P[name] ?? P.sparkle;
  return (
    <svg
      className={`ico ${className ?? ''}`}
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {body}
    </svg>
  );
}

export const RES_ICON = { supplies: 'supplies', parts: 'parts', fuel: 'fuel', data: 'data' } as const;
export const MISSION_ICON = { recon: 'recon', raid: 'raid', stronghold: 'stronghold', supply: 'supplymission' } as const;
