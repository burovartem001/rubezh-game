import React, { useEffect, useState } from 'react';
import {
  BRANCH_NAMES, Branch, COMMANDER_MAX_LEVEL, INSIGNIA, PORTRAITS, RESPEC_COST_DATA, SKILLS, SKILL_KEYS, XP_THRESHOLDS, branchPoints, spentPoints,
} from '../../../shared/config';
import { useGame } from '../game';
import { Bar, Button, Sprite } from '../ui';

const BRANCH_DESC: Record<Branch, string> = {
  command: 'Вместимость группы, устойчивость, дополнительный слот похода',
  recon: 'Больше данных, точнее сведения о секторе до отправки',
  logistics: 'Меньше затрат на поход, выше награда, быстрее восстановление',
};

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
      <section className="panel commander">
        <div className="cmd-portrait" style={{ borderColor: ins.color }}>
          <Sprite img="operators" index={state.player.portrait % 4} className="portrait big" focusY={12} />
          <span className="insignia" style={{ background: ins.color }} aria-label={`Шеврон: ${ins.name}`} />
        </div>
        <div className="cmd-info">
          <span className="kicker">Командир взвода БПЛА</span>
          <h1>«{state.player.callsign}»</h1>
          <p className="muted">{state.player.commanderName}</p>
          <div className="between">
            <b>Уровень {c.level}</b>
            <span className="num muted small">{nextXp ? `${c.xp} / ${nextXp} опыта` : `${c.xp} опыта · максимум`}</span>
          </div>
          <Bar value={nextXp ? c.xp - prevXp : 1} max={nextXp ? nextXp - prevXp : 1} />
          <p className={free > 0 ? 'amber' : 'muted'}>{free > 0 ? `Свободных очков навыков: ${free}` : 'Опыт дают походы. Каждый уровень — одно очко навыка.'}</p>
          <button className="btn secondary small" onClick={() => setEdit((e) => !e)}>
            {edit ? 'Скрыть профиль' : 'Профиль и экипировка'}
          </button>
        </div>
      </section>
      {edit && <ProfileEditor onDone={() => setEdit(false)} />}

      <div className="branches">
        {(Object.keys(BRANCH_NAMES) as Branch[]).map((b) => (
          <section key={b} className="panel branch">
            <h2>{BRANCH_NAMES[b]}</h2>
            <p className="muted small">
              {BRANCH_DESC[b]} · вложено {branchPoints(c.skills, b)}
            </p>
            {SKILL_KEYS.filter((k) => SKILLS[k].branch === b).map((k) => {
              const d = SKILLS[k];
              const r = c.skills[k] ?? 0;
              const need = d.needBranchPoints - branchPoints(c.skills, b);
              let why = '';
              if (r >= d.max) why = 'Максимум';
              else if (free <= 0) why = 'Нет свободных очков';
              else if (need > 0) why = `Вложите в ветку ещё ${need}`;
              return (
                <div key={k} className={`skill ${r ? 'has' : ''}`}>
                  <div className="between">
                    <b>{d.name}</b>
                    <span className="pips" aria-label={`${r} из ${d.max}`}>
                      {Array.from({ length: d.max }, (_, i) => (
                        <i key={i} className={i < r ? 'on' : ''} />
                      ))}
                    </span>
                  </div>
                  <div className="small">{r ? `Сейчас: ${d.describe(r)}` : 'Не изучен'}</div>
                  {r < d.max && <div className="small amber">Следующий ранг: {d.describe(r + 1)}</div>}
                  <Button small kind="secondary" onClick={() => act('skill', { key: k })} disabled={!!why} why={why}>
                    Изучить
                  </Button>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <section className="panel">
        <h2>Сброс навыков</h2>
        <p className="muted small">
          {c.freeResetUsed ? `Платный сброс: ${RESPEC_COST_DATA} данных.` : 'Один бесплатный сброс, чтобы исправить ошибочный выбор.'} Доступен, когда нет активных походов.
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

      <section className="panel">
        <h2>Статистика</h2>
        <div className="stats">
          <span>
            <b>{c.stats.expeditionsSent ?? 0}</b> походов отправлено
          </span>
          <span>
            <b>{c.stats.expeditionsWon ?? 0}</b> успешных
          </span>
          <span>
            <b>{c.stats.buildsDone ?? 0}</b> улучшений зданий
          </span>
          <span>
            <b>{c.stats.woundedTotal ?? 0}</b> ранено всего
          </span>
          <span>
            <b>{c.stats.lostTotal ?? 0}</b> безвозвратных потерь
          </span>
          <span>
            <b>{state.sectors.filter((s) => s.control >= 100).length}</b> секторов под контролем
          </span>
        </div>
      </section>
      <Settings />
      <button className="btn secondary" onClick={() => confirm('Выйти из аккаунта? Прогресс сохранён на сервере.') && logout()}>
        Выйти из аккаунта
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
      <h2>Профиль и экипировка</h2>
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
      <Button onClick={async () => (await act('profile', { callsign, commanderName: name, portrait, insignia })) && onDone()}>Сохранить</Button>
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
      <h2>Настройки</h2>
      <label className="toggle">
        <input type="checkbox" checked={reduce} onChange={(e) => setReduce(e.target.checked)} /> Уменьшить анимацию
      </label>
      <label className="toggle">
        <input type="checkbox" checked={large} onChange={(e) => setLarge(e.target.checked)} /> Крупный текст
      </label>
      <p className="muted tiny">Игра сохраняется на сервере автоматически после каждого действия.</p>
    </section>
  );
}
