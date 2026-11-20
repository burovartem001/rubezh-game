import React, { useEffect, useState } from 'react';
import {
  AWARDS, AWARD_KEYS, AWARD_SOURCE_NAME, AwardKey, OPERATORS, OperatorType, VEHICLES, VehicleType, equipmentEffectText,
  BRANCH_NAMES, Branch, COMMANDER_MAX_LEVEL, PORTRAITS, RESPEC_COST_DATA, SKILLS, SKILL_KEYS, XP_THRESHOLDS, branchPoints, spentPoints,
} from '../../../shared/config';
import { COMMANDER_TITLES } from '../../../shared/lore';
import { useGame } from '../game';
import { Bar, Button, Sprite } from '../ui';
import { Icon } from '../art/icons';
import { RankBadge, Speech } from '../art/art';
import { Chevron } from '../art/Chevron';
import { chevronByKey } from '../../../shared/chevrons';
import { ChevronsTab, MatesTab, ProfileSheet, chevronColor } from './Mates';
import { CompanyTab, PrestigePanel, SiteLinkPanel } from './Long';

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

type CmdTab = 'profile' | 'chevrons' | 'mates' | 'company';

export function CommanderScreen() {
  const { state } = useGame();
  const [tab, setTab] = useState<CmdTab>('profile');
  const tabs: [CmdTab, string, string, number | string][] = [
    ['profile', 'Профиль', 'commander', ''],
    ['chevrons', 'Шевроны', 'medal', state.chevrons.length],
    ['mates', 'Сослуживцы', 'squad', ''],
    ['company', 'Рота', 'stronghold', ''],
  ];
  const [openPlayer, setOpenPlayer] = useState<number | null>(null);
  return (
    <>
      <div className="seg big icons" role="tablist">
        {tabs.map(([k, n, ic, c]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            <Icon name={ic} size={20} />
            <span>{n}</span>
            {c !== '' && <em>{c}</em>}
          </button>
        ))}
      </div>
      {tab === 'profile' && <ProfileTab onChevrons={() => setTab('chevrons')} />}
      {tab === 'chevrons' && <ChevronsTab />}
      {tab === 'mates' && <MatesTab />}
      {tab === 'company' && <CompanyTab onOpenPlayer={setOpenPlayer} />}
      {openPlayer != null && <ProfileSheet id={openPlayer} onClose={() => setOpenPlayer(null)} />}
    </>
  );
}

function ProfileTab({ onChevrons }: { onChevrons: () => void }) {
  const { state, act, logout } = useGame();
  const c = state.commander;
  const free = c.level - 1 - spentPoints(c.skills);
  const nextXp = c.level < COMMANDER_MAX_LEVEL ? XP_THRESHOLDS[c.level] : null;
  const prevXp = XP_THRESHOLDS[c.level - 1];
  const [edit, setEdit] = useState(false);
  const color = chevronColor(state.player.chevron);
  return (
    <>
      <section className="cmd-hero">
        <div className="cmd-portrait" style={{ borderColor: color }}>
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
            <Icon name="settings" size={16} /> {edit ? 'Скрыть' : 'Позывной и портрет'}
          </button>
        </div>
        <button className="worn-chevron" onClick={onChevrons} aria-label="Шевроны">
          <Chevron def={state.player.chevron} size={78} />
          <span>на рукаве</span>
        </button>
        <RankBadge level={c.level} size={64} color={color} />
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

      <AwardsShowcase />
      <PrestigePanel />
      <SiteLinkPanel />

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

const AWARD_TEXT: Record<AwardKey, string> = {
  veteran: OPERATORS.veteran.strong,
  gyro: VEHICLES.gyro.purpose.replace(/^Наградной: /, ''),
  niva: VEHICLES.niva.purpose.replace(/^Наградная: /, ''),
  rebNew: equipmentEffectText('rebNew', 'award', 1),
  nsuRubicon: equipmentEffectText('nsuRubicon', 'award', 1),
  pigGear: equipmentEffectText('pigGear', 'award', 1),
  fpvBoevye: equipmentEffectText('fpvBoevye', 'award', 1),
  mavicField: equipmentEffectText('mavicField', 'award', 1),
};

function AwardsShowcase() {
  const { state } = useGame();
  const have = (k: AwardKey): number => {
    const d = AWARDS[k];
    if (d.kind === 'operator') {
      const o = state.operators[k as OperatorType];
      return o.available + o.on_mission + o.wounded + o.recovering;
    }
    if (d.kind === 'vehicle') return state.vehicles[k as VehicleType] ? 1 : 0;
    return state.equipment.filter((e) => e.type === k).length;
  };
  const got = AWARD_KEYS.filter((k) => have(k) > 0).length;
  return (
    <section className="panel awards-panel">
      <h2>
        <Icon name="medal" size={20} /> Награды за заслуги · {got}/{AWARD_KEYS.length}
      </h2>
      <p className="muted small">
        Особые бойцы, транспорт и оснащение — чуть сильнее обычных. Их нельзя построить или купить: награды выдаются за заслуги на {AWARD_SOURCE_NAME}.
      </p>
      <div className="award-grid">
        {AWARD_KEYS.map((k) => {
          const n = have(k);
          return (
            <div key={k} className={`award-card ${n ? 'got' : ''}`}>
              <span className="award-icon">
                <Icon name={k} size={28} />
              </span>
              <b>{AWARDS[k].name}</b>
              <small>{AWARD_TEXT[k]}</small>
              <span className={`award-state ${n ? 'on' : ''}`}>{n ? (n > 1 ? `есть ×${n}` : 'получено') : 'ещё не выдано'}</span>
            </div>
          );
        })}
      </div>
      {state.awards.length > 0 && (
        <>
          <h3>История наград</h3>
          <ul className="award-history">
            {state.awards.slice(0, 10).map((a) => (
              <li key={a.id}>
                <Icon name="medal" size={14} /> <b>{AWARDS[a.award as AwardKey]?.name ?? (chevronByKey(a.award) ? `шеврон «${chevronByKey(a.award)!.name}»` : a.award)}</b>
                {a.count > 1 ? ` ×${a.count}` : ''}
                {a.reason ? ` — ${a.reason}` : ''} <span className="muted tiny">{new Date(a.at).toLocaleDateString('ru-RU')}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function ProfileEditor({ onDone }: { onDone: () => void }) {
  const { state, act } = useGame();
  const [callsign, setCallsign] = useState(state.player.callsign);
  const [name, setName] = useState(state.player.commanderName);
  const [portrait, setPortrait] = useState(state.player.portrait);
  return (
    <section className="panel">
      <h2>
        <Icon name="settings" size={20} /> Позывной и портрет
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
      <Button onClick={async () => (await act('profile', { callsign, commanderName: name, portrait })) && onDone()}>
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
