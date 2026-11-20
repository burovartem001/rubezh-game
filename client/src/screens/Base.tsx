import React, { useEffect, useState } from 'react';
import {
  BUILDINGS, BUILDING_KEYS, BuildingKey, DAILY, DAILY_KEYS, MAX_BUILDING_LEVEL, buildingEffectText, buildingUpgradeCost, buildingUpgradeTime,
} from '../../../shared/config';
import { useGame } from '../game';
import { Bar, Button, Countdown, CostLine, JobProgress, RewardLine, Sheet, fmtLong, pad2, useAffordable } from '../ui';
import { ExpeditionRow, JobRow } from '../components/Queues';

const GLYPH: Record<BuildingKey, string> = { hq: '⌂', training: '◎', workshop: '⚙', supply: '▣', fueldepot: '◉', comms: '⌁' };
const LINKS: Partial<Record<BuildingKey, { tab: 'squad' | 'map'; focus?: string; text: string }>> = {
  training: { tab: 'squad', focus: 'operators', text: 'Открыть подготовку операторов' },
  workshop: { tab: 'squad', focus: 'equipment', text: 'Открыть мастерскую и оснащение' },
  comms: { tab: 'map', text: 'Открыть карту секторов' },
};

export function BaseScreen() {
  const { state, nav } = useGame();
  const [open, setOpen] = useState<BuildingKey | null>(null);
  useEffect(() => {
    if (nav.tab === 'base' && nav.focus && (BUILDING_KEYS as string[]).includes(nav.focus)) setOpen(nav.focus as BuildingKey);
  }, [nav]);
  const build = state.jobs.find((j) => j.queue === 'build');
  return (
    <>
      <section className="hero" style={{ backgroundImage: 'linear-gradient(90deg, rgba(12,22,23,.94), rgba(15,29,25,.6) 55%, rgba(0,0,0,0) 90%), url(img/base.jpg)' }}>
        <span className="kicker">Тыловой полигон</span>
        <h1>
          {state.player.callsign}
        </h1>
        <p>
          Командный пункт · ур. {state.buildings.hq} · походов {state.expeditions.length}/{state.slots}
        </p>
      </section>

      <section>
        <div className="section-head">
          <h2>План базы</h2>
          <span className="muted small">{build ? 'Идёт строительство' : 'Строительная очередь свободна'}</span>
        </div>
        <div className="plan">
          {BUILDING_KEYS.map((k, i) => {
            const job = state.jobs.find((j) => j.kind === 'build' && j.payload.building === k);
            const lvl = state.buildings[k];
            return (
              <button key={k} className={`bld bld-${k} ${job ? 'busy' : ''}`} onClick={() => setOpen(k)} data-focus={nav.focus === k}>
                <span className="bld-num">{pad2(i + 1)}</span>
                <span className="bld-glyph" aria-hidden>
                  {GLYPH[k]}
                </span>
                <b>{BUILDINGS[k].name}</b>
                <span className="bld-lvl">
                  ур. {lvl}
                  {job ? (
                    <>
                      {' '}→ {job.payload.toLevel} · <Countdown start={job.startAt} end={job.endAt} />
                    </>
                  ) : null}
                </span>
                {job && <JobProgress start={job.startAt} end={job.endAt} />}
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid2">
        <section className="panel">
          <h2>Очереди</h2>
          {state.expeditions.map((x) => (
            <ExpeditionRow key={x.id} x={x} />
          ))}
          {state.jobs.map((j) => (
            <JobRow key={j.id} j={j} />
          ))}
          {!state.jobs.length && !state.expeditions.length && <p className="muted">Все очереди свободны — самое время улучшить здание или отправить группу.</p>}
        </section>
        <Daily />
      </div>

      {open && <BuildingSheet k={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Daily() {
  const { state, act } = useGame();
  return (
    <section className="panel">
      <h2>Ежедневные задания</h2>
      <p className="muted small">Поощряют разные действия и не блокируют основной прогресс. Обновляются в 00:00 МСК.</p>
      {DAILY_KEYS.map((k) => {
        const d = DAILY[k];
        const v = Math.min(d.target, state.daily.counters[k] ?? 0);
        const claimed = state.daily.claimed[k];
        return (
          <div key={k} className="daily">
            <div className="between">
              <span>{d.name}</span>
              <span className="num muted">
                {v}/{d.target}
              </span>
            </div>
            <Bar value={v} max={d.target} tone={claimed ? 'olive' : undefined} />
            <div className="between">
              <RewardLine cost={d.reward} />
              {claimed ? (
                <span className="olive small">получено</span>
              ) : (
                <Button small onClick={() => act('claimDaily', { key: k })} disabled={v < d.target} kind="secondary">
                  Забрать
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function BuildingSheet({ k, onClose }: { k: BuildingKey; onClose: () => void }) {
  const { state, act, go } = useGame();
  const affordable = useAffordable();
  const d = BUILDINGS[k];
  const lvl = state.buildings[k];
  const job = state.jobs.find((j) => j.kind === 'build' && j.payload.building === k);
  const busy = state.jobs.find((j) => j.queue === 'build');
  const max = lvl >= MAX_BUILDING_LEVEL;
  const cost = buildingUpgradeCost(k, lvl);
  const time = buildingUpgradeTime(k, lvl);
  let why = '';
  if (max) why = 'Достигнут максимальный уровень';
  else if (job) why = 'Улучшение уже идёт';
  else if (busy) why = 'Строительная очередь занята другим зданием';
  else if (k !== 'hq' && lvl + 1 > state.buildings.hq) why = `Сначала улучшите командный пункт до ${lvl + 1} уровня`;
  else if (!affordable(cost)) why = 'Не хватает ресурсов';
  const link = LINKS[k];
  return (
    <Sheet title={d.name} onClose={onClose}>
      <p className="muted">{d.purpose}</p>
      <div className="spec">
        <span>Уровень</span>
        <b>
          {lvl} / {MAX_BUILDING_LEVEL}
        </b>
      </div>
      <div className="spec">
        <span>Сейчас</span>
        <span>{buildingEffectText(k, lvl)}</span>
      </div>
      {!max && (
        <>
          <div className="spec">
            <span>Уровень {lvl + 1}</span>
            <span className="amber">{buildingEffectText(k, lvl + 1)}</span>
          </div>
          <div className="spec">
            <span>Цена</span>
            <CostLine cost={cost} />
          </div>
          <div className="spec">
            <span>Время</span>
            <b>{fmtLong(time)}</b>
          </div>
        </>
      )}
      {job && (
        <div className="qrow">
          <div className="between">
            <span>Улучшение до {job.payload.toLevel}</span>
            <Countdown start={job.startAt} end={job.endAt} />
          </div>
          <JobProgress start={job.startAt} end={job.endAt} />
        </div>
      )}
      <Button
        disabled={!!why}
        why={why}
        onClick={async () => {
          if (await act('build', { building: k })) onClose();
        }}
      >
        {max ? 'Максимальный уровень' : `Улучшить до ${lvl + 1} уровня`}
      </Button>
      {link && (
        <button
          className="btn secondary"
          onClick={() => {
            onClose();
            go(link.tab, link.focus);
          }}
        >
          {link.text}
        </button>
      )}
    </Sheet>
  );
}
