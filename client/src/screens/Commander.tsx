import React, { useEffect, useState } from 'react';
import {
  BRANCH_NAMES, Branch, COMMANDER_MAX_LEVEL, INSIGNIA, PORTRAITS, RESPEC_COST_DATA, SKILLS, SKILL_KEYS, XP_THRESHOLDS, branchPoints, spentPoints,
} from '../../../shared/config';
import { COMMANDER_TITLES } from '../../../shared/lore';
import { useGame } from '../game';
import { Bar, Button, Sprite } from '../ui';
import { Icon } from '../art/icons';
import { RankBadge, Speech } from '../art/art';

const BRANCH_DESC: Record<Branch, { text: string; icon: string }> = {
  command: { text: 'Больше бойцов в группе, меньше потерь, лишний поход одновременно.', icon: 'commander' },
  recon: { text: 'Больше данных и точнее сведения о секторе до отправки.', icon: 'recon' },
  logistics: { text: 'Дешевле походы, богаче трофеи, быстрее восстановление.', icon: 'supplymission' },
};
const STATS: [string, string, string][] = [
  ['expeditionsSent', 'map', 'походов'],
  ['expeditionsWon', 'flag', 'успешных'],
  ['buildsDone', 'hq', 'улучшений'],
  ['woundedTotal', 'cross', 'ранено'],
  ['lostTotal', 'skull', 'потеряно'],
];

export function CommanderScreen() {
  const { state, act, logout } = useGame();
  const c = state.commander;
  const free = c.level - 1 - spentPoints(c.skills);
  const nextXp = c.level < COMMANDER_MAX_LEVEL ? XP_THRESHOLDS[c.level] : null;
  const prevXp = XP_THRESHOLDS[c.level - 1];
  const [edit, setEdit] = useState(false);
  const ins = INSIGNIA[state.player.insignia] ?? INSIGNIA[0];
  return (
    <>
      <section className="cmd-hero">
        <div className="cmd-portrait" style={{ borderColor: ins.color }}>
          <Sprite img="operators" index={state.player.portrait % 4} className="portrait big" focusY={12} />
        </div>
        <div className="cmd-info">
          <span className="kicker">{COMMANDER_TITLES[c.level - 1]}</span>
          <h1>«{state.player.callsign}»</h1>
          <p className="muted">{state.player.commanderName} · командир взвода БПЛА</p>
          <div className="xp">
            <div className="between small">
              <span>
                <Icon name="star" size={14} /> {c.level} уровень
              </span>
              <span className="num muted">{nextXp ? `${c.xp} / ${nextXp}` : `${c.xp} · максимум`}</span>
            </div>
            <Bar value={nextXp ? c.xp - prevXp : 1} max={nextXp ? nextXp - prevXp : 1} />
            {nextXp && (
              <span className="tiny muted">
                до звания «{COMMANDER_TITLES[c.level]}» — {nextXp - c.xp} опыта
              </span>
            )}
          </div>
          <button className="btn secondary small" onClick={() => setEdit((e) => !e)}>
            <Icon name="settings" size={16} /> {edit ? 'Скрыть' : 'Портрет и шеврон'}
          </button>
        </div>
        <RankBadge level={c.level} size={84} color={ins.color} />
      </section>
      {free > 0 ? (
        <Speech who="sova">
          Командир, есть {free} {free === 1 ? 'свободное очко' : 'свободных очка'} навыков. Выберите, в чём станем сильнее.
        </Speech>
      ) : (
        <Speech who="sova" compact>
          Опыт приходит из походов: каждый новый уровень — одно очко навыка.
        </Speech>
      )}
      {edit && <ProfileEditor onDone={() => setEdit(false)} />}

      <div className="branches">
        {(Object.keys(BRANCH_NAMES) as Branch[]).map((b) => (
          <section key={b} className={`branch b-${b}`}>
            <header>
              <span className="branch-icon">
                <Icon name={BRANCH_DESC[b].icon} size={26} />
              </span>
              <div>
                <h2>{BRANCH_NAMES[b]}</h2>
                <p className="tiny muted">{BRANCH_DESC[b].text}</p>
              </div>
              <em className="branch-pts">{branchPoints(c.skills, b)}</em>
            </header>
            <div className="tree">
              {SKILL_KEYS.filter((k) => SKILLS[k].branch === b).map((k) => {
                const d = SKILLS[k];
                const r = c.skills[k] ?? 0;
                const need = d.needBranchPoints - branchPoints(c.skills, b);
                let why = '';
                if (r >= d.max) why = 'Изучен полностью';
                else if (free <= 0) why = 'Нет свободных очков';
                else if (need > 0) why = `Вложите в ветку ещё ${need}`;
                return (
                  <div key={k} className={`node-skill ${r ? 'has' : ''} ${r >= d.max ? 'max' : ''} ${need > 0 ? 'closed' : ''}`}>
                    <span className="node-dot">
                      {r >= d.max ? <Icon name="check" size={16} /> : need > 0 ? <Icon name="lock" size={14} /> : <Icon name="star" size={14} />}
                    </span>
                    <div className="node-body">
                      <div className="between">
                        <b>{d.name}</b>
                        <span className="pips" aria-label={`${r} из ${d.max}`}>
                          {Array.from({ length: d.max }, (_, i) => (
                            <i key={i} className={i < r ? 'on' : ''} />
                          ))}
                        </span>
                      </div>
                      <div className="small">{r ? d.describe(r) : <span className="muted">не изучен</span>}</div>
                      {r < d.max && <div className="tiny amber">дальше: {d.describe(r + 1)}</div>}
                      {r < d.max && (
                        <Button small kind={why ? 'secondary' : 'primary'} onClick={() => act('skill', { key: k })} disabled={!!why} why={why}>
                          <Icon name="plus" size={15} /> Изучить
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <section className="panel">
        <h2>
          <Icon name="reports" size={20} /> Послужной список
        </h2>
        <div className="stat-tiles">
          {STATS.map(([k, ic, label]) => (
            <div key={k} className="stat-tile">
              <Icon name={ic} size={22} />
              <b>{c.stats[k] ?? 0}</b>
              <span>{label}</span>
            </div>
          ))}
          <div className="stat-tile">
            <Icon name="flag" size={22} />
            <b>{state.sectors.filter((s) => s.control >= 100).length}</b>
            <span>под контролем</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>
          <Icon name="back" size={20} /> Сброс навыков
        </h2>
        <p className="muted small">
          {c.freeResetUsed ? `Платный сброс: ${RESPEC_COST_DATA} данных.` : 'Ошиблись с выбором? Один сброс — бесплатно.'} Только когда все группы дома.
        </p>
        <Button
          kind="secondary"
          small
          disabled={spentPoints(c.skills) === 0 || state.expeditions.length > 0}
          why={state.expeditions.length ? 'Дождитесь возвращения групп' : 'Навыки ещё не выбраны'}
          onClick={() => confirm('Сбросить все навыки командира?') && act('resetSkills')}
        >
          Сбросить навыки
        </Button>
      </section>
      <Settings />
      <button className="btn secondary" onClick={() => confirm('Выйти из аккаунта? Прогресс сохранён на сервере.') && logout()}>
        <Icon name="logout" size={18} /> Выйти из аккаунта
      </button>
    </>
  );
}

function ProfileEditor({ onDone }: { onDone: () => void }) {
  const { state, act } = useGame();
  const [callsign, setCallsign] = useState(state.player.callsign);
  const [name, setName] = useState(state.player.commanderName);
  const [portrait, setPortrait] = useState(state.player.portrait);
  const [insignia, setInsignia] = useState(state.player.insignia);
  return (
    <section className="panel">
      <h2>
        <Icon name="settings" size={20} /> Портрет и шеврон
      </h2>
      <label>
        Позывной
        <input value={callsign} onChange={(e) => setCallsign(e.target.value)} maxLength={24} />
      </label>
      <label>
        Имя
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </label>
      <h3>Портрет</h3>
      <div className="portraits">
        {PORTRAITS.map((p, i) => (
          <button key={p} className={portrait === i ? 'on' : ''} onClick={() => setPortrait(i)} aria-label={`Портрет: ${p}`}>
            <Sprite img="operators" index={i} className="portrait" focusY={12} />
            <small>{p}</small>
          </button>
        ))}
      </div>
      <h3>Шеврон</h3>
      <div className="chips">
        {INSIGNIA.map((s, i) => (
          <button key={s.name} className={`chip ${insignia === i ? 'on' : ''}`} onClick={() => setInsignia(i)}>
            <span className="swatch" style={{ background: s.color }} /> {s.name}
          </button>
        ))}
      </div>
      <Button onClick={async () => (await act('profile', { callsign, commanderName: name, portrait, insignia })) && onDone()}>
        <Icon name="check" size={16} /> Сохранить
      </Button>
    </section>
  );
}

function Settings() {
  const read = (k: string) => {
    try {
      return localStorage.getItem(k) === '1';
    } catch {
      return false;
    }
  };
  const [reduce, setReduce] = useState(read('rubezh.reduceMotion'));
  const [large, setLarge] = useState(read('rubezh.largeText'));
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduce);
    document.documentElement.classList.toggle('large-text', large);
    try {
      localStorage.setItem('rubezh.reduceMotion', reduce ? '1' : '0');
      localStorage.setItem('rubezh.largeText', large ? '1' : '0');
    } catch {
      /* без сохранения */
    }
  }, [reduce, large]);
  return (
    <section className="panel">
      <h2>
        <Icon name="settings" size={20} /> Настройки
      </h2>
      <label className="toggle">
        <input type="checkbox" checked={reduce} onChange={(e) => setReduce(e.target.checked)} /> Уменьшить анимацию
      </label>
      <label className="toggle">
        <input type="checkbox" checked={large} onChange={(e) => setLarge(e.target.checked)} /> Крупный текст
      </label>
      <p className="muted tiny">Игра сохраняется на сервере после каждого действия.</p>
    </section>
  );
}
