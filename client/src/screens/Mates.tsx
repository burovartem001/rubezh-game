import { MASCOTS, achTitle } from '../../../shared/content';
import { OPERATORS } from '../../../shared/config';
import React, { useEffect, useState } from 'react';
import { AWARDS, TUTORIAL } from '../../../shared/config';
import {
  CHEVRONS, CHEVRON_CATEGORIES, CHEVRON_RARITY_COLORS, CHEVRON_RARITY_NAMES, CHEVRON_SERIES, ChevronDef, ChevronSeries, UNOFFICIAL_GROUPS, chevronByKey, chevronProgress, chevronSeries,
} from '../../../shared/chevrons';
import { COMMANDER_TITLES } from '../../../shared/lore';
import { PlayerListItem, PublicProfile, api } from '../api';
import { useGame } from '../game';
import { Bar, Sheet, Sprite } from '../ui';
import { Icon } from '../art/icons';
import { RankBadge, Speech } from '../art/art';
import { Chevron } from '../art/Chevron';
import { Leaderboard, RaidBuilder, SetsPanel } from './Long';

function PvpButtons({ id, callsign }: { id: number; callsign: string }) {
  const [raid, setRaid] = useState(false);
  return (
    <div className="row wrap">
      <button className="btn secondary small" onClick={() => setRaid(true)}>
        <Icon name="flag" size={16} /> Разведка и набег
      </button>
      {raid && <RaidBuilder target={{ id, callsign }} onClose={() => setRaid(false)} />}
    </div>
  );
}

export function chevronColor(key: string): string {
  return chevronByKey(key)?.border ?? '#edbb76';
}
function RarityTag({ c }: { c: ChevronDef }) {
  return (
    <span className="rarity-tag" style={{ color: CHEVRON_RARITY_COLORS[c.rarity], borderColor: CHEVRON_RARITY_COLORS[c.rarity] }}>
      {CHEVRON_RARITY_NAMES[c.rarity]}
    </span>
  );
}
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

/* ───────────── Коллекция своих шевронов ───────────── */

export function ChevronsTab() {
  const { state, act } = useGame();
  const [preview, setPreview] = useState(false);
  const [series, setSeries] = useState<ChevronSeries>('regular');
  const owned = new Map(state.chevrons.map((c) => [c.key, c]));
  const worn = chevronByKey(state.player.chevron);
  const prog = {
    stats: state.commander.stats,
    level: state.commander.level,
    tutorialDone: state.tutorialStep >= TUTORIAL.length,
    controlled: state.sectors.filter((s) => s.control >= 100).length,
    trained: Object.values(state.operators).reduce((s, o) => s + o.trained, 0),
  };
  return (
    <>
      <section className="worn-panel">
        {worn && <Chevron def={worn} size={110} className="worn-big" />}
        <div>
          <span className="kicker">На рукаве</span>
          <h2>{worn?.name}</h2>
          {worn && <RarityTag c={worn} />}
          <p className="small muted">Этот шеврон видят сослуживцы в вашем профиле, а также всю коллекцию. Отличительный знак и повод похвастаться.</p>
          <button className="btn secondary small" onClick={() => setPreview(true)}>
            <Icon name="recon" size={16} /> Как меня видят другие
          </button>
        </div>
      </section>

      <div className="seg big" role="tablist">
        {CHEVRON_SERIES.map((sr) => {
          const all = CHEVRONS.filter((c) => chevronSeries(c) === sr.key);
          return (
            <button key={sr.key} role="tab" aria-selected={series === sr.key} className={series === sr.key ? 'on' : ''} onClick={() => setSeries(sr.key)}>
              {sr.name} · {all.filter((c) => owned.has(c.key)).length}/{all.length}
            </button>
          );
        })}
      </div>
      <p className="muted small">{CHEVRON_SERIES.find((x) => x.key === series)!.text}</p>

      {(series === 'unofficial'
        ? UNOFFICIAL_GROUPS.map((g) => ({ key: g.key, name: g.name, text: g.text, icon: g.icon, list: CHEVRONS.filter((c) => chevronSeries(c) === 'unofficial' && c.group === g.key) }))
        : CHEVRON_CATEGORIES.map((cat) => ({ key: cat.key, name: cat.name, text: cat.text, icon: cat.key === 'site' ? 'medal' : cat.key === 'game' ? 'flag' : 'base', list: CHEVRONS.filter((c) => c.category === cat.key && chevronSeries(c) === series) }))
      ).map((cat) => {
        const list = cat.list;
        if (!list.length) return null;
        const got = list.filter((c) => owned.has(c.key)).length;
        return (
          <section key={cat.key} className={`panel chev-cat cat-${cat.key} ${series === 'unofficial' ? 'unofficial' : ''}`}>
            <div className="between">
              <h2>
                <Icon name={cat.icon} size={20} /> {cat.name}
              </h2>
              <span className="pill small">
                {got}/{list.length}
              </span>
            </div>
            <p className="muted small">{cat.text}</p>
            <div className="chev-grid">
              {list.map((c) => {
                const mine = owned.get(c.key);
                const isWorn = state.player.chevron === c.key;
                const p = chevronProgress(c, prog);
                return (
                  <div key={c.key} className={`chev-card ${mine ? 'got' : ''} ${isWorn ? 'worn' : ''}`}>
                    <Chevron def={c} size={74} dim={!mine} />
                    <b>{c.name}</b>
                    <RarityTag c={c} />
                    {series === 'unofficial' && c.category === 'site' && (
                      <span className="tag gold"><Icon name="medal" size={12} /> за заслуги на сайте</span>
                    )}
                    {mine ? (
                      isWorn ? (
                        <span className="chev-state on">
                          <Icon name="check" size={13} /> на рукаве
                        </span>
                      ) : (
                        <button className="btn primary small" onClick={() => act('wearChevron', { key: c.key })}>
                          Надеть
                        </button>
                      )
                    ) : c.condition ? (
                      <div className="chev-progress">
                        <small>{c.condition.text}</small>
                        <Bar value={Math.min(p.have, p.need)} max={p.need} />
                        <small className="num muted">
                          {Math.min(p.have, p.need)} / {p.need}
                        </small>
                      </div>
                    ) : (
                      <small className="muted">{c.category === 'site' ? 'Выдаёт сайт «Учёт дронов»' : 'Пока не получен'}</small>
                    )}
                    {mine && <small className="tiny muted">с {fmtDate(mine.at)}</small>}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      <SetsPanel />
      {preview && <MyProfilePreview onClose={() => setPreview(false)} />}
    </>
  );
}

function MyProfilePreview({ onClose }: { onClose: () => void }) {
  const [me, setMe] = useState<number | null>(null);
  useEffect(() => {
    api.players('').then((r) => setMe(r.me)).catch(() => setMe(-1));
  }, []);
  if (me == null) return null;
  return <ProfileSheet id={me} onClose={onClose} />;
}

/* ───────────── Сослуживцы ───────────── */

export function MatesTab() {
  const [q, setQ] = useState('');
  const [list, setList] = useState<PlayerListItem[] | null>(null);
  const [me, setMe] = useState(0);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      api
        .players(q)
        .then((r) => {
          setList(r.players);
          setMe(r.me);
          setErr('');
        })
        .catch(() => setErr('Не удалось загрузить список — проверьте связь'));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <>
      <Speech who="sova" compact>
        Здесь все командиры полигонов. Загляните в профиль — посмотрите, кто чем может похвастаться.
      </Speech>
      <h2 className="section-title">
        <Icon name="star" size={20} /> Рейтинг
      </h2>
      <Leaderboard onOpen={setOpen} />
      <h2 className="section-title">
        <Icon name="recon" size={20} /> Поиск
      </h2>
      <label className="search">
        <Icon name="recon" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по позывному или имени" aria-label="Поиск сослуживцев" />
      </label>
      {err && <div className="warn-box small">{err}</div>}
      {!list && !err && <p className="muted">Связь со штабом…</p>}
      {list && !list.length && <p className="muted">Никого не нашли.</p>}
      <div className="mates">
        {list?.map((p, i) => (
          <button key={p.id} className={`mate ${p.id === me ? 'me' : ''}`} onClick={() => setOpen(p.id)}>
            <span className="mate-rank num">{q ? '' : i + 1}</span>
            <Sprite img="operators" index={p.portrait % 4} className="mate-portrait" focusY={12} />
            <span className="mate-info">
              <b>
                «{p.callsign}» {p.id === me && <em className="you">вы</em>}
              </b>
              <small>
                {COMMANDER_TITLES[p.level - 1]} · ур. {p.level}
              </small>
              <small className="muted">
                <Icon name="medal" size={12} /> шевронов: {p.chevrons}
              </small>
            </span>
            <Chevron def={p.chevron} size={44} />
          </button>
        ))}
      </div>
      {open != null && <ProfileSheet id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/* ───────────── Публичный профиль ───────────── */

export function ProfileSheet({ id, onClose }: { id: number; onClose: () => void }) {
  const [p, setP] = useState<PublicProfile | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.player(id).then(setP).catch(() => setErr('Не удалось открыть профиль'));
  }, [id]);
  const worn = p ? chevronByKey(p.chevron) : undefined;
  const ownedKeys = new Set(p?.chevrons.map((c) => c.key));
  return (
    <Sheet title={p ? `«${p.callsign}»${p.me ? ' · это вы' : ''}` : 'Профиль'} onClose={onClose} wide>
      {err && <div className="warn-box">{err}</div>}
      {!p && !err && <p className="muted">Связь со штабом…</p>}
      {p && (
        <>
          <section className="pub-hero" style={{ borderColor: worn?.border }}>
            <Sprite img="operators" index={p.portrait % 4} className="pub-portrait" focusY={12} />
            <div className="pub-info">
              <span className="kicker">{COMMANDER_TITLES[p.level - 1]}</span>
              <h2>«{p.callsign}»</h2>
              <p className="muted small">{p.commanderName} · на полигоне с {fmtDate(p.since)}</p>
              <RankBadge level={p.level} size={48} color={worn?.border} />
            </div>
            {worn && (
              <div className="pub-worn">
                <Chevron def={worn} size={92} />
                <small>{worn.name}</small>
              </div>
            )}
          </section>
          <div className="stat-tiles">
            <div className="stat-tile"><Icon name="map" size={20} /><b>{p.stats.expeditionsSent}</b><span>походов</span></div>
            <div className="stat-tile"><Icon name="flag" size={20} /><b>{p.stats.expeditionsWon}</b><span>успешных</span></div>
            <div className="stat-tile"><Icon name="heart" size={20} /><b>{p.stats.flawless}</b><span>без потерь</span></div>
            <div className="stat-tile"><Icon name="hq" size={20} /><b>{p.stats.buildsDone}</b><span>улучшений</span></div>
            <div className="stat-tile"><Icon name="compass" size={20} /><b>{p.stats.controlled}</b><span>секторов</span></div>
            <div className="stat-tile"><Icon name="medal" size={20} /><b>{p.chevrons.length}</b><span>шевронов</span></div>
          </div>
          {(p.achPoints ?? 0) > 0 && (
            <p className="small">
              <Icon name="trophy" size={15} /> Звание по достижениям: <b>{achTitle(p.achPoints ?? 0)}</b> · {p.achPoints} очков
            </p>
          )}
          {!!p.models?.length && (
            <p className="small">
              <Icon name="drone" size={15} /> Модели дронов: {p.models.map((m) => (
                <span key={m.cls} className="pill small" style={{ borderColor: m.color }}>«{m.name}» · {OPERATORS[m.cls].name.toLowerCase()}</span>
              ))}
            </p>
          )}
          {!!p.mascots?.length && (
            <p className="small">
              <Icon name="paw" size={15} /> Талисманы: {p.mascots.map((k) => MASCOTS[k]?.name).filter(Boolean).join(', ')}
            </p>
          )}
          <h3>
            <Icon name="medal" size={18} /> Коллекция шевронов · {p.chevrons.length}/{CHEVRONS.length}
          </h3>
          {CHEVRON_SERIES.flatMap((sr) => CHEVRON_CATEGORIES.map((cat) => ({ sr, cat }))).map(({ sr, cat }) => {
            const have = CHEVRONS.filter((c) => c.category === cat.key && chevronSeries(c) === sr.key && ownedKeys.has(c.key));
            if (!have.length) return null;
            return (
              <div key={sr.key + cat.key} className="pub-cat">
                <span className="kicker">
                  {sr.name} · {cat.name}
                </span>
                <div className="pub-chevrons">
                  {have.map((c) => (
                    <div key={c.key} className="pub-chev" title={c.name}>
                      <Chevron def={c} size={56} />
                      <small>{c.name}</small>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {!p.me && <PvpButtons id={p.id} callsign={p.callsign} />}
          {p.awards.length > 0 && (
            <>
              <h3>
                <Icon name="gift" size={18} /> Награды за заслуги
              </h3>
              <ul className="award-history">
                {p.awards.map((a, i) => (
                  <li key={i}>
                    <Icon name="medal" size={14} /> <b>{AWARDS[a.award as keyof typeof AWARDS]?.name ?? (chevronByKey(a.award) ? `шеврон «${chevronByKey(a.award)!.name}»` : a.award)}</b>
                    {a.count > 1 ? ` ×${a.count}` : ''} <span className="muted tiny">{new Date(a.at).toLocaleDateString('ru-RU')}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}
