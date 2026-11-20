import React, { useEffect, useState } from 'react';
import { EQUIPMENT, OPERATORS, OPERATOR_TYPES, OUTCOME_NAMES, RARITY_NAMES, VEHICLES } from '../../../shared/config';
import { outcomeRangeText } from '../../../shared/calc';
import { Report, api } from '../api';
import { useGame } from '../game';
import { CostLine, RewardLine, Sheet, ago, pad2 } from '../ui';

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
        <h2>Отчёты</h2>
        <span className="muted small">История походов хранится на сервере</span>
      </div>
      {!list.length && <p className="muted">Отчётов пока нет. Отправьте группу на карте — итог появится здесь.</p>}
      <div className="reports">
        {list.map((r) => (
          <button key={r.id} className={`report-item o-${r.outcome} ${r.read ? '' : 'unread'}`} onClick={() => setOpen(r)}>
            <div className="between">
              <b>
                {pad2(r.sectorId)} · {r.sectorName} · {r.missionName}
              </b>
              <span className="muted tiny">{ago(r.createdAt, now)}</span>
            </div>
            <div className="between small">
              <span className="outcome">{OUTCOME_NAMES[r.outcome]}</span>
              <RewardLine cost={r.rewards} />
            </div>
            {(r.totalWounded > 0 || r.totalLost > 0 || r.vehicleDamaged) && (
              <div className="tiny red">
                {r.totalWounded ? `ранены ${r.totalWounded}` : ''}
                {r.totalLost ? ` · потеряны ${r.totalLost}` : ''}
                {r.vehicleDamaged ? ' · транспорт повреждён' : ''}
              </div>
            )}
          </button>
        ))}
      </div>
      {list.length >= 20 && !end && (
        <button className="btn secondary" onClick={more}>
          Показать ещё
        </button>
      )}
      {open && <ReportSheet r={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export function ReportSheet({ r, onClose }: { r: Report; onClose: () => void }) {
  const { go, state } = useGame();
  const groupText = OPERATOR_TYPES.filter((t) => r.group[t]).map((t) => `${OPERATORS[t].name} ×${r.group[t]}`).join(', ');
  const hasWounded = OPERATOR_TYPES.some((t) => state.operators[t].wounded > 0);
  return (
    <Sheet title={`Отчёт · сектор ${pad2(r.sectorId)}`} onClose={onClose} wide>
      <div className={`report-banner o-${r.outcome}`}>
        <span className="kicker">
          {r.missionName} · {r.sectorName}
        </span>
        <h2>{OUTCOME_NAMES[r.outcome]}</h2>
        <span className="small">
          Прогноз был: {outcomeRangeText(r.forecast.outcomeLow, r.forecast.outcomeHigh, OUTCOME_NAMES)} · риск потерь {r.forecast.lossCategory}
        </span>
      </div>
      <div className="spec">
        <span>Группа</span>
        <span>{groupText}</span>
      </div>
      <div className="spec">
        <span>Транспорт</span>
        <span>
          {VEHICLES[r.vehicle].name}
          {r.vehicleDamaged ? <span className="red"> — повреждён</span> : ''}
        </span>
      </div>
      <div className="spec">
        <span>Оснащение</span>
        <span>{r.equipment.length ? r.equipment.map((e) => `${EQUIPMENT[e.type].name} (${RARITY_NAMES[e.rarity].toLowerCase()}, ур. ${e.level})`).join(', ') : 'нет'}</span>
      </div>
      <div className="spec">
        <span>Расход</span>
        <CostLine cost={r.cost} check={false} />
      </div>
      <h3>Итог</h3>
      <div className="spec">
        <span>Награды</span>
        <RewardLine cost={r.rewards} />
      </div>
      {r.drop && <div className="spec amber">{r.drop}</div>}
      <div className="spec">
        <span>Опыт командира</span>
        <b>+{r.xp}{r.levelUp ? ` · новый уровень ${r.levelUp}!` : ''}</b>
      </div>
      <div className="spec">
        <span>Разведанность</span>
        <span>
          {r.recon.before}% → <b>{r.recon.after}%</b>
        </span>
      </div>
      <div className="spec">
        <span>Контроль сектора</span>
        <span>
          {r.control.before}% → <b>{r.control.after}%</b>
        </span>
      </div>
      <h3>Потери</h3>
      {r.totalWounded + r.totalLost + r.totalFieldRecovered === 0 ? (
        <p className="olive">Без потерь — вся группа вернулась в строй.</p>
      ) : (
        <ul className="losses">
          {OPERATOR_TYPES.filter((t) => r.casualties[t]).map((t) => {
            const c = r.casualties[t]!;
            return (
              <li key={t}>
                <b>{OPERATORS[t].name}:</b>
                {c.wounded ? ` ранены ${c.wounded} (нужно восстановление)` : ''}
                {c.fieldRecovered ? ` · восстановлены в поле ${c.fieldRecovered}` : ''}
                {c.lost ? <span className="red"> · безвозвратно {c.lost}</span> : ''}
              </li>
            );
          })}
        </ul>
      )}
      <h3>Почему так</h3>
      <ul className="reasons">
        {r.reasons.map((x, i) => (
          <li key={i} className={x.kind}>
            {x.text}
          </li>
        ))}
      </ul>
      <div className="row wrap">
        {hasWounded && (
          <button className="btn primary small" onClick={() => { onClose(); go('squad', 'operators'); }}>
            К восстановлению
          </button>
        )}
        {state.vehicles[r.vehicle]?.status === 'damaged' && (
          <button className="btn secondary small" onClick={() => { onClose(); go('squad', 'vehicles'); }}>
            К ремонту транспорта
          </button>
        )}
        <button className="btn secondary small" onClick={() => { onClose(); go('map', `sector-${r.sectorId}`); }}>
          Снова в сектор
        </button>
      </div>
    </Sheet>
  );
}
