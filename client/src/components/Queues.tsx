import React from 'react';
import { BUILDINGS, EQUIPMENT, EXPEDITION_PHASES, MISSIONS, OPERATORS, OperatorType, RARITY_NAMES, VEHICLES, sectorById } from '../../../shared/config';
import type { Expedition, GameState, Job } from '../api';
import { useGame } from '../game';
import { Countdown, JobProgress, Sheet, fmtDur, pad2 } from '../ui';
import { Icon, MISSION_ICON } from '../art/icons';
import { Speech } from '../art/art';
import { EMPTY } from '../../../shared/lore';
import { RESEARCH } from '../../../shared/progression';

export function jobTitle(j: Job): string {
  const p = j.payload;
  switch (j.kind) {
    case 'build': return `${BUILDINGS[p.building as keyof typeof BUILDINGS].name} → ур. ${p.toLevel}`;
    case 'train': return `${OPERATORS[p.type as OperatorType].name} ×${p.count}`;
    case 'rank': return `${OPERATORS[p.type as OperatorType].name}: ранг ${p.toRank}`;
    case 'recover': return `Восстановление: ${Object.values(p.counts as Record<string, number>).reduce((s, v) => s + v, 0)} опер.`;
    case 'vehicle_acquire': return `${VEHICLES[p.type as keyof typeof VEHICLES].name}: подготовка`;
    case 'vehicle_upgrade': return `${VEHICLES[p.type as keyof typeof VEHICLES].name} → ур. ${p.toLevel}`;
    case 'vehicle_repair': return `${VEHICLES[p.type as keyof typeof VEHICLES].name}: ремонт`;
    case 'research': return `Исследование: ${RESEARCH.find((r) => r.key === p.key)?.name ?? p.key}`;
    case 'craft': return `${EQUIPMENT[p.type as keyof typeof EQUIPMENT].name} (${RARITY_NAMES[p.rarity as keyof typeof RARITY_NAMES].toLowerCase()})`;
    case 'drone_model': return `Модель «${p.name}»: сборка`;
    case 'outpost_build': return `Передовой пункт у «${sectorById(p.sectorId)?.name ?? '?'}»`;
    case 'outpost_upgrade': return `Передовой пункт → ур. ${p.toLevel}`;
    default: return j.kind;
  }
}
export function jobIcon(j: Job): string {
  const p = j.payload;
  switch (j.kind) {
    case 'build': return p.building;
    case 'train': case 'rank': return p.type;
    case 'recover': return 'cross';
    case 'research': return 'data';
    case 'craft': return p.type;
    case 'drone_model': return 'drone';
    case 'outpost_build': case 'outpost_upgrade': return 'outpost';
    default: return p.type ?? 'wrench';
  }
}
const QUEUE_ICON: Record<Job['queue'], string> = { build: 'hq', train: 'training', workshop: 'workshop', recovery: 'cross', research: 'data', outpost: 'outpost' };
export const QUEUE_NAMES: Record<Job['queue'], string> = { build: 'Строительство', train: 'Подготовка', workshop: 'Мастерская', recovery: 'Восстановление', research: 'Исследования', outpost: 'Передовые пункты' };

export function expeditionPhase(x: Expedition, now: number) {
  const f = (now - x.startAt) / (x.endAt - x.startAt);
  if (f >= 1) return { name: 'Отчёт готовится', f: 1 };
  const ph = EXPEDITION_PHASES.find((p) => f < p.until) ?? EXPEDITION_PHASES[2];
  return { name: ph.name, f: Math.max(0, f) };
}

export function activeTimers(state: GameState, now: number) {
  const ends = [...state.jobs.map((j) => j.endAt), ...state.expeditions.map((x) => x.endAt)].filter((t) => t > now);
  const count = state.jobs.length + state.expeditions.length;
  return { count, next: ends.length ? fmtDur((Math.min(...ends) - now) / 1000) : '' };
}

export function ExpeditionRow({ x }: { x: Expedition }) {
  const { now } = useGame();
  const s = sectorById(x.sectorId) ?? { id: 0, name: 'чужой полигон' };
  const ph = expeditionPhase(x, now);
  const n = Object.values(x.group).reduce((a, b) => a + (b ?? 0), 0);
  return (
    <div className="qrow exp">
      <div className="between">
        <b className="qtitle">
          <span className="qicon"><Icon name={MISSION_ICON[x.mission]} size={18} /></span>
          {MISSIONS[x.mission].name} · {s.name}
        </b>
        <Countdown start={x.startAt} end={x.endAt} />
      </div>
      <div className="phases" aria-label="Этапы похода">
        {['Подготовка', ...EXPEDITION_PHASES.map((p) => p.name), 'Отчёт'].map((p, i) => {
          const idx = ph.f >= 1 ? 4 : 1 + EXPEDITION_PHASES.findIndex((e) => ph.f < e.until);
          return (
            <span key={p} className={i < idx ? 'done' : i === idx ? 'now' : ''}>
              {p}
            </span>
          );
        })}
      </div>
      <JobProgress start={x.startAt} end={x.endAt} />
      <div className="muted small">
        {s.name} · {n} опер. · {VEHICLES[x.vehicle].name}
      </div>
    </div>
  );
}

export function JobRow({ j }: { j: Job }) {
  return (
    <div className="qrow">
      <div className="between">
        <b className="qtitle">
          <span className="qicon"><Icon name={jobIcon(j)} size={18} /></span>
          {jobTitle(j)}
        </b>
        <Countdown start={j.startAt} end={j.endAt} />
      </div>
      <JobProgress start={j.startAt} end={j.endAt} />
    </div>
  );
}

export function QueuesSheet({ onClose }: { onClose: () => void }) {
  const { state } = useGame();
  const queues: Job['queue'][] = ['build', 'train', 'workshop', 'recovery', 'research'];
  return (
    <Sheet title="Очереди и походы" onClose={onClose}>
      <h3>
        <Icon name="map" size={18} /> Походы · {state.expeditions.length} / {state.slots}
      </h3>
      {state.expeditions.length ? state.expeditions.map((x) => <ExpeditionRow key={x.id} x={x} />) : <Speech who={EMPTY.expeditions.who} compact>{EMPTY.expeditions.text}</Speech>}
      {queues.map((q) => {
        const jobs = state.jobs.filter((j) => j.queue === q);
        return (
          <div key={q}>
            <h3><Icon name={QUEUE_ICON[q]} size={18} /> {QUEUE_NAMES[q]}</h3>
            {jobs.length ? jobs.map((j) => <JobRow key={j.id} j={j} />) : <p className="muted small">Свободна — можно ставить задачу.</p>}
          </div>
        );
      })}
    </Sheet>
  );
}
