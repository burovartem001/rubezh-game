import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BUILDINGS, BUILDING_KEYS, BuildingKey, DAILY, DAILY_KEYS, DailyKey, MAX_BUILDING_LEVEL, buildingEffectText, buildingUpgradeCost, buildingUpgradeTime,
} from '../../../shared/config';
import { BUILDING_HOST, BUILDING_LORE, EMPTY, IDLE_TIPS } from '../../../shared/lore';
import { useGame } from '../game';
import { Bar, Button, Countdown, CostLine, JobProgress, RewardLine, Sheet, fmtLong } from '../ui';
import { ExpeditionRow, JobRow } from '../components/Queues';
import { Icon } from '../art/icons';
import { BUILDING_SPOTS, BuildingArt, Drone, Ring, Speech } from '../art/art';
import { HqPanels, ResearchSheet } from './Long';
import { CampaignCard, ConstructorSheet, EventCard, MascotsRow } from './Deep';

const LINKS: Partial<Record<BuildingKey, { tab: 'squad' | 'map'; focus?: string; text: string; icon: string }>> = {
  training: { tab: 'squad', focus: 'operators', text: 'К подготовке операторов', icon: 'squad' },
  workshop: { tab: 'squad', focus: 'equipment', text: 'В мастерскую', icon: 'wrench' },
  supply: { tab: 'squad', focus: 'operators', text: 'К восстановлению раненых', icon: 'cross' },
  fueldepot: { tab: 'squad', focus: 'vehicles', text: 'В автопарк', icon: 'bukhanka' },
  comms: { tab: 'map', text: 'Открыть карту секторов', icon: 'map' },
  motorpool: { tab: 'squad', focus: 'vehicles', text: 'К технике', icon: 'bukhanka' },
  repairyard: { tab: 'squad', focus: 'equipment', text: 'К ремонту оснащения и моделей', icon: 'wrench' },
  medbay: { tab: 'squad', focus: 'operators', text: 'К бойцам', icon: 'cross' },
  analytics: { tab: 'squad', focus: 'equipment', text: 'К чертежам', icon: 'blueprint' },
};
const RESEARCH_LINK: Partial<Record<BuildingKey, boolean>> = { comms: true };
const DAILY_ICON: Record<DailyKey, string> = { dispatch: 'map', train: 'training', build: 'hq', recon: 'recon' };

export function BaseScreen() {
  const { state, nav, now } = useGame();
  const [open, setOpen] = useState<BuildingKey | null>(null);
  useEffect(() => {
    if (nav.tab === 'base' && nav.focus && (BUILDING_KEYS as string[]).includes(nav.focus)) setOpen(nav.focus as BuildingKey);
  }, [nav]);
  const tip = useMemo(() => IDLE_TIPS[Math.floor(Date.now() / 600_000) % IDLE_TIPS.length], []);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) * 0.45;
  }, []);
  const build = state.jobs.find((j) => j.queue === 'build');

  return (
    <>
      <section className="panorama-wrap">
        <div className="panorama-scroll" ref={scroller}>
          <div className="panorama">
            <img src="img/base.jpg" alt="Тыловой полигон" draggable={false} />
            <span className="beacon" style={{ left: '36.9%', top: '6.5%' }} aria-hidden />
            <Drone className="flyby" size={54} />
            <Drone className="flyby two" size={34} />
            {BUILDING_KEYS.map((k) => {
              const s = BUILDING_SPOTS[k];
              const job = state.jobs.find((j) => j.kind === 'build' && j.payload.building === k);
              const f = job ? Math.max(0, Math.min(1, (now - job.startAt) / (job.endAt - job.startAt))) : 0;
              return (
                <button key={k} className={`hotspot ${job ? 'busy' : ''} ${state.buildings[k] === 0 && !job ? 'unbuilt' : ''}`} style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }} onClick={() => setOpen(k)} data-focus={nav.focus === k}>
                  {job ? (
                    <Ring value={f} size={40}>
                      <Icon name="wrench" size={16} />
                    </Ring>
                  ) : (
                    <span className="hs-icon">
                      <Icon name={k} size={20} />
                    </span>
                  )}
                  <span className="hs-label">
                    {BUILDINGS[k].name} <b>{state.buildings[k] || '—'}</b>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="panorama-title">
          <span className="kicker">Тыловой полигон</span>
          <h1>«{state.player.callsign}»</h1>
          <div className="chips-row">
            <span className="pill"><Icon name="hq" size={15} /> штаб {state.buildings.hq} ур.</span>
            <span className="pill"><Icon name="map" size={15} /> походы {state.expeditions.length}/{state.slots}</span>
            <span className={`pill ${build ? 'gold' : ''}`}><Icon name="wrench" size={15} /> {build ? 'стройка идёт' : 'стройка свободна'}</span>
          </div>
        </div>
      </section>

      <Speech who={tip.who}>{tip.text}</Speech>
      <MascotsRow />
      <div className="grid2">
        <CampaignCard />
        <EventCard />
      </div>

      <div className="section-head">
        <h2>
          <Icon name="base" size={22} /> Здания
        </h2>
        <span className="muted small">нажмите, чтобы улучшить</span>
      </div>
      <div className="bld-grid">
        {BUILDING_KEYS.map((k) => {
          const job = state.jobs.find((j) => j.kind === 'build' && j.payload.building === k);
          const lvl = state.buildings[k];
          return (
            <button key={k} className={`bld-card ${job ? 'busy' : ''} ${lvl === 0 && !job ? 'unbuilt' : ''}`} onClick={() => setOpen(k)} data-focus={nav.focus === k}>
              <BuildingArt k={k} aspect={1.6} className="bld-art">
                <span className="lvl-badge">{lvl === 0 ? <Icon name={state.buildings.hq >= (BUILDINGS[k].unlockHq ?? 1) ? 'plus' : 'lock'} size={14} /> : lvl}</span>
                {job && <span className="scaffold" aria-hidden />}
              </BuildingArt>
              <span className="bld-name">
                <Icon name={k} size={16} /> {BUILDINGS[k].name}
              </span>
              <span className="bld-tag">{job ? <>→ {job.payload.toLevel} ур. · <Countdown start={job.startAt} end={job.endAt} /></> : lvl === 0 ? (state.buildings.hq >= (BUILDINGS[k].unlockHq ?? 1) ? 'не построено — можно строить' : `с командного пункта ${BUILDINGS[k].unlockHq} ур.`) : BUILDING_LORE[k].tagline}</span>
              {job && <JobProgress start={job.startAt} end={job.endAt} />}
            </button>
          );
        })}
      </div>

      <div className="grid2">
        <section className="panel">
          <h2>
            <Icon name="clock" size={20} /> Что происходит
          </h2>
          {state.expeditions.map((x) => (
            <ExpeditionRow key={x.id} x={x} />
          ))}
          {state.jobs.map((j) => (
            <JobRow key={j.id} j={j} />
          ))}
          {!state.jobs.length && !state.expeditions.length && <Speech who={EMPTY.queues.who} compact>{EMPTY.queues.text}</Speech>}
        </section>
        <Daily />
      </div>
      <HqPanels />

      {open && <BuildingSheet k={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Daily() {
  const { state, act } = useGame();
  return (
    <section className="panel">
      <h2>
        <Icon name="flag" size={20} /> Приказы дня
      </h2>
      <p className="muted small">Не обязательны, но за них положена премия. Обновляются в полночь по Москве.</p>
      <div className="daily-grid">
        {DAILY_KEYS.map((k) => {
          const d = DAILY[k];
          const v = Math.min(d.target, state.daily.counters[k] ?? 0);
          const claimed = !!state.daily.claimed[k];
          const ready = v >= d.target && !claimed;
          return (
            <div key={k} className={`daily-card ${claimed ? 'claimed' : ''} ${ready ? 'ready' : ''}`}>
              <div className="daily-icon">
                <Icon name={claimed ? 'check' : DAILY_ICON[k]} size={22} />
              </div>
              <div className="daily-body">
                <b>{d.name}</b>
                <Bar value={v} max={d.target} tone={claimed ? 'olive' : undefined} />
                <div className="between small">
                  <RewardLine cost={d.reward} />
                  <span className="num muted">
                    {v}/{d.target}
                  </span>
                </div>
              </div>
              {ready && (
                <button className="btn primary small claim" onClick={() => act('claimDaily', { key: k })}>
                  <Icon name="gift" size={16} /> Забрать
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CtorButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn secondary" onClick={() => setOpen(true)}>
        <Icon name="drone" size={18} /> Конструктор дронов
      </button>
      {open && <ConstructorSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function ResearchButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn secondary" onClick={() => setOpen(true)}>
        <Icon name="data" size={18} /> Исследования
      </button>
      {open && <ResearchSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function BuildingSheet({ k, onClose }: { k: BuildingKey; onClose: () => void }) {
  const { state, act, go } = useGame();
  const d = BUILDINGS[k];
  const lore = BUILDING_LORE[k];
  const lvl = state.buildings[k];
  const job = state.jobs.find((j) => j.kind === 'build' && j.payload.building === k);
  const busy = state.jobs.find((j) => j.queue === 'build');
  const max = lvl >= MAX_BUILDING_LEVEL;
  const cost = buildingUpgradeCost(k, lvl);
  const time = buildingUpgradeTime(k, lvl);
  const { res } = useGame();
  const affordable = Object.entries(cost).every(([r, v]) => res(r as 'supplies') >= (v ?? 0));
  let why = '';
  if (max) why = 'Это предел — здание полностью развито';
  else if (job) why = 'Улучшение уже идёт';
  else if (state.buildings.hq < (d.unlockHq ?? 1)) why = `${d.name} — с командного пункта ${d.unlockHq} уровня`;
  else if (busy) why = 'Бригада занята другим зданием — строим по одному';
  else if (k !== 'hq' && lvl + 1 > state.buildings.hq) why = `Сначала нужен командный пункт ${lvl + 1} уровня`;
  else if (!affordable) why = 'Не хватает ресурсов';
  const link = LINKS[k];
  return (
    <Sheet title={d.name} onClose={onClose}>
      <BuildingArt k={k} aspect={2.2} className="sheet-art">
        <span className="art-caption">
          <span className="kicker">{lore.tagline}</span>
          {lvl === 0 ? <b>Ещё не построено</b> : <><b>Уровень {lvl}</b> из {MAX_BUILDING_LEVEL}</>}
        </span>
      </BuildingArt>
      <div className="level-dots" aria-hidden>
        {Array.from({ length: MAX_BUILDING_LEVEL }, (_, i) => (
          <i key={i} className={i < lvl ? 'on' : job && i === lvl ? 'next' : ''} />
        ))}
      </div>
      <p className="story">{lore.story}</p>
      <Speech who={BUILDING_HOST[k]} compact>
        {lore.quote}
      </Speech>
      <div className="compare">
        <div className="cmp now">
          <span className="kicker">Сейчас</span>
          <p>{lvl === 0 ? 'Здания пока нет.' : buildingEffectText(k, lvl)}</p>
        </div>
        {!max && (
          <>
            <Icon name="arrow" size={22} className="cmp-arrow" />
            <div className="cmp next">
              <span className="kicker">Уровень {lvl + 1}</span>
              <p>{buildingEffectText(k, lvl + 1)}</p>
            </div>
          </>
        )}
      </div>
      {!max && !job && (
        <div className="price">
          <CostLine cost={cost} />
          <span className="time-chip">
            <Icon name="clock" size={15} /> {fmtLong(time)}
          </span>
        </div>
      )}
      {job && (
        <div className="qrow">
          <div className="between">
            <span>
              <Icon name="wrench" size={16} /> Стройка до {job.payload.toLevel} уровня
            </span>
            <Countdown start={job.startAt} end={job.endAt} />
          </div>
          <JobProgress start={job.startAt} end={job.endAt} />
        </div>
      )}
      <Button disabled={!!why} why={why} onClick={async () => { if (await act('build', { building: k })) onClose(); }}>
        <Icon name={lvl === 0 ? 'plus' : 'up'} size={18} /> {max ? 'Максимальный уровень' : lvl === 0 ? 'Построить' : `Улучшить до ${lvl + 1} уровня`}
      </Button>
      {k === 'testrange' && lvl > 0 && <CtorButton />}
      {RESEARCH_LINK[k] && <ResearchButton />}
      {link && (
        <button className="btn secondary" onClick={() => { onClose(); go(link.tab, link.focus); }}>
          <Icon name={link.icon} size={18} /> {link.text}
        </button>
      )}
    </Sheet>
  );
}
