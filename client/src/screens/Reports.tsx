import React, { useEffect, useState } from 'react';
import { EQUIPMENT, OPERATORS, OPERATOR_TYPES, OUTCOME_NAMES, RARITY_NAMES, RES_KEYS, RES_NAMES, VEHICLES } from '../../../shared/config';
import { outcomeRangeText } from '../../../shared/calc';
import { EMPTY, OUTCOME_LORE, expeditionStory } from '../../../shared/lore';
import { Report, api } from '../api';
import { useGame } from '../game';
import { CostLine, RewardLine, Sheet, ago, pad2 } from '../ui';
import { Icon, MISSION_ICON } from '../art/icons';
import { Portrait, Speech, Stamp } from '../art/art';
import { DefenseReportBody, SoldierNews } from './Long';

const tone = (o: Report['outcome']) => (o === 'fail' ? 'bad' : o === 'partial' ? 'mid' : 'ok');

export function ReportsScreen() {
  const { state, act, now, toast } = useGame();
  const [older, setOlder] = useState<Report[]>([]);
  const [open, setOpen] = useState<Report | null>(null);
  const [end, setEnd] = useState(false);
  useEffect(() => {
    if (state.unreadReports > 0) act('readReports');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const list = [...state.reports, ...older.filter((o) => !state.reports.some((r) => r.id === o.id))];
  async function more() {
    try {
      const last = list[list.length - 1];
      const r = await api.reports(last ? last.id : 0);
      if (r.reports.length < 20) setEnd(true);
      setOlder((o) => [...o, ...r.reports]);
    } catch {
      toast('error', 'Не удалось загрузить отчёты');
    }
  }
  return (
    <>
      <div className="section-head">
        <h2>
          <Icon name="reports" size={22} /> Журнал походов
        </h2>
        <span className="muted small">{list.length ? `записей: ${list.length}${end ? '' : '+'}` : ''}</span>
      </div>
      {!list.length && <Speech who={EMPTY.reports.who}>{EMPTY.reports.text}</Speech>}
      <div className="reports">
        {list.map((r) =>
          r.kind === 'defense' || r.kind === 'pvp_defense' ? (
            <button key={r.id} className={`report-card o-${r.won ? 'success' : 'fail'} ${r.read ? '' : 'unread'}`} onClick={() => setOpen(r)}>
              <span className="rc-icon">
                <Icon name={r.kind === 'defense' ? 'reb' : 'flag'} size={24} />
              </span>
              <span className="rc-body">
                <span className="between">
                  <b>{r.kind === 'defense' ? 'Атака на полигон' : `Набег «${r.attacker}»`}</b>
                  <span className="muted tiny">{ago(r.createdAt, now)}</span>
                </span>
                <span className="rc-line">
                  <span className={`rc-outcome t-${r.won ? 'ok' : 'bad'}`}>{r.won ? 'ОТБИТО' : 'ПРОРЫВ'}</span>
                  {r.won ? <RewardLine cost={r.reward ?? {}} /> : <span className="small red">потеряно: <CostLine cost={r.lost ?? {}} check={false} /></span>}
                </span>
              </span>
              {!r.read && <i className="unread-dot" aria-label="новый" />}
            </button>
          ) : (
          <button key={r.id} className={`report-card o-${r.outcome} ${r.read ? '' : 'unread'}`} onClick={() => setOpen(r)}>
            <span className="rc-icon">
              <Icon name={MISSION_ICON[r.mission]} size={24} />
            </span>
            <span className="rc-body">
              <span className="between">
                <b>
                  {r.missionName} · {r.sectorName}
                </b>
                <span className="muted tiny">{ago(r.createdAt, now)}</span>
              </span>
              <span className="rc-line">
                <span className={`rc-outcome t-${tone(r.outcome)}`}>{OUTCOME_LORE[r.outcome].stamp}</span>
                <RewardLine cost={r.rewards} />
              </span>
              {(r.totalWounded > 0 || r.totalLost > 0 || r.vehicleDamaged || r.levelUp || r.drop) && (
                <span className="rc-tags tiny">
                  {r.totalWounded > 0 && <span className="t-warn"><Icon name="cross" size={12} /> {r.totalWounded}</span>}
                  {r.totalLost > 0 && <span className="t-bad"><Icon name="skull" size={12} /> {r.totalLost}</span>}
                  {r.vehicleDamaged && <span className="t-warn"><Icon name="wrench" size={12} /> ремонт</span>}
                  {r.levelUp && <span className="t-gold"><Icon name="star" size={12} /> уровень {r.levelUp}</span>}
                  {r.drop && <span className="t-gold"><Icon name="gift" size={12} /> трофей</span>}
                </span>
              )}
            </span>
            {!r.read && <i className="unread-dot" aria-label="новый" />}
          </button>
          ),
        )}
      </div>
      {list.length >= 20 && !end && (
        <button className="btn secondary" onClick={more}>
          Листать дальше
        </button>
      )}
      {open && <ReportSheet r={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export function ReportSheet({ r, onClose }: { r: Report; onClose: () => void }) {
  if (r.kind === 'defense' || r.kind === 'pvp_defense')
    return (
      <Sheet title={r.kind === 'defense' ? 'Атака на полигон' : 'Набег на полигон'} onClose={onClose}>
        <DefenseReportBody r={r} />
      </Sheet>
    );
  return <ExpeditionReport r={r} onClose={onClose} />;
}

function ExpeditionReport({ r, onClose }: { r: Report; onClose: () => void }) {
  const { go, state } = useGame();
  const story = expeditionStory({
    id: r.id,
    callsign: state.player.callsign,
    sectorName: r.sectorName,
    mission: r.mission,
    vehicleName: VEHICLES[r.vehicle].name,
    outcome: r.outcome,
    totalWounded: r.totalWounded,
    totalLost: r.totalLost,
    totalFieldRecovered: r.totalFieldRecovered,
    vehicleDamaged: r.vehicleDamaged,
    hasEquipment: r.equipment.length > 0,
    reconAfter: r.recon.after,
    drop: r.drop,
  });
  const hasWounded = OPERATOR_TYPES.some((t) => state.operators[t].wounded > 0);
  const [why, setWhy] = useState(false);
  return (
    <Sheet title={r.kind === 'pvp_attack' ? 'Отчёт · набег' : `Отчёт · сектор ${pad2(r.sectorId)}`} onClose={onClose} wide>
      <div className={`report-hero o-${r.outcome}`}>
        <div>
          <span className="kicker">
            {r.missionName} · {r.sectorName}
          </span>
          <h2>{OUTCOME_NAMES[r.outcome]}</h2>
          <p className="small">{OUTCOME_LORE[r.outcome].line}</p>
        </div>
        <Stamp text={OUTCOME_LORE[r.outcome].stamp} tone={tone(r.outcome)} />
      </div>

      <div className="story-line">
        {story.map((s, i) => (
          <div key={i} className="story-step" style={{ animationDelay: `${0.15 + i * 0.25}s` }}>
            <span className="story-dot" />
            <div>
              <span className="kicker">{s.phase}</span>
              <p>{s.text}</p>
            </div>
          </div>
        ))}
      </div>

      <SoldierNews s={r.soldiers} />
      {(r.companyDamage ?? 0) > 0 && (
        <p className="small amber">
          <Icon name="stronghold" size={14} /> Урон по укрепрайону роты: {r.companyDamage}
        </p>
      )}
      <h3>
        <Icon name="gift" size={18} /> Трофеи
      </h3>
      <div className="loot">
        {RES_KEYS.filter((k) => r.rewards[k]).map((k) => (
          <div key={k} className={`loot-tile res-${k}`}>
            <Icon name={k} size={26} />
            <b>+{r.rewards[k]}</b>
            <span>{RES_NAMES[k].toLowerCase()}</span>
          </div>
        ))}
        <div className="loot-tile xp">
          <Icon name="star" size={26} />
          <b>+{r.xp}</b>
          <span>{r.levelUp ? `опыт · уровень ${r.levelUp}!` : 'опыт'}</span>
        </div>
      </div>
      {r.drop && (
        <div className="drop-banner">
          <Icon name="sparkle" size={20} /> {r.drop}
        </div>
      )}

      <div className="meters two">
        <div className="mini-stat">
          <Icon name="recon" size={18} />
          <span>Разведка</span>
          <b>
            {r.recon.before}% → {r.recon.after}%
          </b>
        </div>
        <div className="mini-stat">
          <Icon name="flag" size={18} />
          <span>Контроль</span>
          <b>
            {r.control.before}% → {r.control.after}%
          </b>
        </div>
      </div>

      <h3>
        <Icon name="squad" size={18} /> Группа
      </h3>
      <div className="roster">
        {OPERATOR_TYPES.filter((t) => r.group[t]).map((t) => {
          const c = r.casualties[t];
          return (
            <div key={t} className="roster-item">
              <Portrait sprite={OPERATORS[t].sprite} size={44} />
              <span>
                <b>
                  {OPERATORS[t].name} ×{r.group[t]}
                </b>
                <small>
                  {!c ? (
                    <span className="olive">все в строю</span>
                  ) : (
                    <>
                      {c.wounded ? <span className="amber">ранены {c.wounded} </span> : ''}
                      {c.fieldRecovered ? <span className="olive">подлатаны в поле {c.fieldRecovered} </span> : ''}
                      {c.lost ? <span className="red">не вернулись {c.lost}</span> : ''}
                    </>
                  )}
                </small>
              </span>
            </div>
          );
        })}
      </div>
      <p className="small muted">
        <Icon name={r.vehicle} size={15} /> {VEHICLES[r.vehicle].name}
        {r.vehicleDamaged ? <span className="red"> — повреждён</span> : ''}
        {r.equipment.length > 0 && <> · {r.equipment.map((e) => `${EQUIPMENT[e.type].name} (${RARITY_NAMES[e.rarity].toLowerCase()})`).join(', ')}</>} · расход <CostLine cost={r.cost} check={false} />
      </p>

      <button className="why-toggle" onClick={() => setWhy((w) => !w)} aria-expanded={why}>
        <Portrait sprite={0} size={32} /> Разбор штаба: почему так вышло <Icon name={why ? 'up' : 'arrow'} size={16} />
      </button>
      {why && (
        <>
          <p className="small muted">
            Прогноз был: {outcomeRangeText(r.forecast.outcomeLow, r.forecast.outcomeHigh, OUTCOME_NAMES)}, риск потерь {r.forecast.lossCategory}.
          </p>
          <ul className="reasons">
            {r.reasons.map((x, i) => (
              <li key={i} className={x.kind}>
                {x.text}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="row wrap">
        {hasWounded && (
          <button className="btn primary small" onClick={() => { onClose(); go('squad', 'operators'); }}>
            <Icon name="cross" size={16} /> В медпункт
          </button>
        )}
        {state.vehicles[r.vehicle]?.status === 'damaged' && (
          <button className="btn secondary small" onClick={() => { onClose(); go('squad', 'vehicles'); }}>
            <Icon name="wrench" size={16} /> В ремонт
          </button>
        )}
        {r.kind !== 'pvp_attack' && (
          <button className="btn secondary small" onClick={() => { onClose(); go('map', `sector-${r.sectorId}`); }}>
            <Icon name="map" size={16} /> Снова в сектор
          </button>
        )}
      </div>
    </Sheet>
  );
}
