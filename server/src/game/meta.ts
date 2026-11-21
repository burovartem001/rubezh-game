/**
 * Системы долгой игры на сервере: бонусы, именные бойцы, атаки на полигон, удержание секторов,
 * очки рейтинга, сезоны, недельные контракты, серия входов, отложенные начисления (помощь роты, набеги).
 */
import {
  Cost, OPERATORS, OPERATOR_TYPES, OperatorType, RANK_BONUS, RES_KEYS, SECTORS, gameDay, sectorById, storageCap, MISSIONS,
} from '../../../shared/config.js';
import { CHEVRONS, activeSets } from '../../../shared/chevrons.js';
import {
  ATTACK_LOOKBACK, ATTACK_WINDOW, CONTROL_DECAY_PER_HOUR, CONTROL_GRACE, HOT_BONUS, LOOT_PROTECTED_SHARE, Mods, POINTS, RESEARCH, SEASON_STORY,
  SOLDIER_NAMES, SoldierLite, SoldierTrait, TRAITS, addMods, attackInWindow, defenseRating, emptyMods, mapEventAt, modsText, periodRankReward,
  composeParts, dispatchParts, prestigeMods, seasonIndex, seasonKey, seasonTheme, soldierLevel, soldierMods, streakReward, traitExposure, weekIndex, weekKey,
} from '../../../shared/progression.js';
import { ExpeditionResult, rng } from '../../../shared/calc.js';
import { EPOCH, countBondPairs } from '../../../shared/progression.js';
import { FATIGUE_PER_MISSION, eventKey, eventWindow, fatigueNow } from '../../../shared/content.js';
import { deepDispatchParts, deepModParts } from './deep.js';
import type { Db } from '../db.js';
import { ExpRow, PS, bumpStat, costText, grant, grantChevron } from './state.js';

/* ───────────── типы ───────────── */

export interface SoldierRow {
  id: number; type: OperatorType; name: string; trait: SoldierTrait; xp: number; level: number; missions: number; scars: number;
  status: 'ready' | 'mission' | 'wounded' | 'recovering' | 'lost' | 'retired'; expedition_id: number | null; created_at: number; lost_at: number | null;
  spec: string | null; fatigue: number; fatigue_at: number | null; bonds: Record<string, number>; instructor: boolean;
  dirty?: boolean;
}
export interface Meta {
  prestige: number;
  streak: number;
  lastLoginDay: string;
  streakClaimedDay: string;
  attacksCheckedAt: number | null;
  siteUserId: string | null;
  linkCode: string | null;
  linkCodeExp: number | null;
  createdAt: number;
}
export interface Period { period: string; points: number; counters: Record<string, number> }

const ms = (d: Date | string | null) => (d ? new Date(d).getTime() : null);
const H = 3_600_000;

/* ───────────── загрузка и сохранение ───────────── */

export async function loadMeta(c: Db, ps: PS, row: any, now: number) {
  ps.meta = {
    prestige: row.prestige ?? 0,
    streak: row.login_streak ?? 0,
    lastLoginDay: row.last_login_day ?? '',
    streakClaimedDay: row.streak_claimed_day ?? '',
    attacksCheckedAt: ms(row.attacks_checked_at),
    siteUserId: row.site_user_id ?? null,
    linkCode: row.link_code ?? null,
    linkCodeExp: ms(row.link_code_exp),
    createdAt: ms(row.created_at) ?? now,
  };
  const w = weekKey(weekIndex(now));
  const s = seasonKey(seasonIndex(now));
  const evw = eventWindow(now, EPOCH);
  const eKey = eventKey(evw.active ? evw.week : evw.week - 1);
  const [rs, so, wk, sc, cm] = await Promise.all([
    c.query('SELECT key FROM research WHERE user_id=$1', [ps.userId]),
    c.query(
      `(SELECT * FROM soldiers WHERE user_id=$1 AND status NOT IN ('lost','retired'))
       UNION ALL (SELECT * FROM (SELECT * FROM soldiers WHERE user_id=$1 AND status='lost' ORDER BY lost_at DESC LIMIT 30) l)`,
      [ps.userId],
    ),
    c.query('SELECT counters, claimed FROM weekly WHERE user_id=$1 AND week=$2', [ps.userId, w]),
    c.query('SELECT period, points, counters FROM scores WHERE user_id=$1 AND period = ANY($2)', [ps.userId, [w, s, eKey]]),
    c.query('SELECT company_id FROM company_members WHERE user_id=$1', [ps.userId]),
  ]);
  ps.research = new Set(rs.rows.map((r) => r.key));
  ps.soldiers = so.rows.map((r) => ({ ...r, created_at: ms(r.created_at)!, lost_at: ms(r.lost_at), fatigue_at: ms(r.fatigue_at), bonds: r.bonds ?? {} }));
  ps.weekly = { week: w, counters: wk.rows[0]?.counters ?? {}, claimed: wk.rows[0]?.claimed ?? {} };
  const find = (p: string): Period => {
    const r = sc.rows.find((x) => x.period === p);
    return { period: p, points: r?.points ?? 0, counters: r?.counters ?? {} };
  };
  ps.scoreW = find(w);
  ps.scoreS = find(s);
  ps.scoreE = find(eKey);
  ps.companyId = cm.rows[0]?.company_id ?? null;
}

export async function saveMeta(c: Db, ps: PS) {
  await reconcileSoldiers(c, ps);
  const m = ps.meta;
  await c.query(
    `UPDATE players SET prestige=$2, login_streak=$3, last_login_day=$4, streak_claimed_day=$5, attacks_checked_at=to_timestamp($6/1000.0),
       link_code=$7, link_code_exp=to_timestamp($8/1000.0) WHERE user_id=$1`,
    [ps.userId, m.prestige, m.streak, m.lastLoginDay, m.streakClaimedDay, m.attacksCheckedAt ?? Date.now(), m.linkCode, m.linkCodeExp ?? 0],
  );
  for (const s of ps.soldiers) {
    if (!s.dirty) continue;
    await c.query(
      `UPDATE soldiers SET xp=$2, level=$3, missions=$4, scars=$5, status=$6, expedition_id=$7, lost_at=to_timestamp($8/1000.0),
         spec=$9, fatigue=$10, fatigue_at=to_timestamp($11/1000.0), bonds=$12, instructor=$13 WHERE id=$1`,
      [s.id, s.xp, s.level, s.missions, s.scars, s.status, s.expedition_id, s.lost_at, s.spec, Math.round(s.fatigue), s.fatigue_at, JSON.stringify(s.bonds), s.instructor],
    );
    s.dirty = false;
  }
  await c.query(
    `INSERT INTO weekly(user_id,week,counters,claimed) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,week) DO UPDATE SET counters=$3, claimed=$4`,
    [ps.userId, ps.weekly.week, JSON.stringify(ps.weekly.counters), JSON.stringify(ps.weekly.claimed)],
  );
  for (const p of [ps.scoreW, ps.scoreS, ps.scoreE]) {
    if (!p.points && !Object.keys(p.counters).length) continue;
    await c.query(
      `INSERT INTO scores(user_id,period,points,counters) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,period) DO UPDATE SET points=$3, counters=$4`,
      [ps.userId, p.period, p.points, JSON.stringify(p.counters)],
    );
  }
}

/* ───────────── бонусы ───────────── */

export interface ModPart { label: string; mods: Partial<Mods> }
export function playerModParts(ps: PS, now: number): ModPart[] {
  const parts: ModPart[] = [];
  const res = addMods(emptyMods(), {});
  let any = false;
  for (const r of RESEARCH) if (ps.research?.has(r.key)) { addMods(res, r.mods); any = true; }
  if (any) parts.push({ label: 'Исследования', mods: res });
  if (ps.meta?.prestige) parts.push({ label: `Престиж ${ps.meta.prestige}`, mods: prestigeMods(ps.meta.prestige) });
  const owned = new Set(ps.chevrons.map((c) => c.key));
  for (const st of activeSets(owned)) parts.push({ label: `Комплект «${st.name}»`, mods: st.mods as Partial<Mods> });
  const theme = seasonTheme(seasonIndex(now));
  parts.push({ label: `Сезон «${theme.name}»`, mods: theme.mods });
  parts.push(...deepModParts(ps));
  return parts;
}
export function sumParts(parts: ModPart[]): Mods {
  const m = emptyMods();
  for (const p of parts) addMods(m, p.mods);
  return m;
}
export function playerMods(ps: PS, now = Date.now()): Mods {
  return sumParts(playerModParts(ps, now));
}
export function composeBonus(parts: ModPart[]) {
  return {
    mods: sumParts(parts),
    reasons: parts
      .filter((p) => modsText(p.mods))
      .map((p) => ({ text: `${p.label}: ${modsText(p.mods)}`, kind: (Object.values(p.mods).some((v) => (v ?? 0) < 0) ? 'malus' : 'bonus') as 'bonus' | 'malus' })),
  };
}
/** Бонусы для конкретного похода: всё постоянное + обстановка + горячая цель + именные бойцы. */
export function dispatchBonus(ps: PS, sectorId: number, now: number, chosen: SoldierRow[], group: Partial<Record<OperatorType, number>> = {}, night = false) {
  const lite = chosen.map((x) => ({ type: x.type, level: x.level, trait: x.trait, spec: x.spec, fatigue: fatigueNow(x.fatigue, x.fatigue_at, now) }));
  return composeParts(dispatchParts(playerModParts(ps, now), sectorId, now, lite, countBondPairs(chosen), deepDispatchParts(ps, sectorId, group, now, night)));
}

/* ───────────── очки и счётчики ───────────── */

export function track(ps: PS, key: string, n = 1) {
  ps.weekly.counters[key] = (ps.weekly.counters[key] ?? 0) + n;
  ps.scoreS.counters[key] = (ps.scoreS.counters[key] ?? 0) + n;
  // очки события выходных
  const ev = eventWindow(ps.clock ?? Date.now(), EPOCH);
  const pts = ev.active ? ev.event.points[key] ?? 0 : 0;
  if (pts && ps.scoreE.period === eventKey(ev.week)) ps.scoreE.points += Math.round(pts * n);
}
export function addPoints(ps: PS, n: number) {
  if (n <= 0) return;
  ps.scoreW.points += n;
  ps.scoreS.points += n;
}

/* ───────────── именные бойцы ───────────── */

const ALIVE = (s: SoldierRow) => s.status !== 'lost' && s.status !== 'retired';
const STATUS_KEYS = ['ready', 'mission', 'wounded', 'recovering'] as const;

async function newSoldier(c: Db, ps: PS, type: OperatorType): Promise<SoldierRow> {
  const used = new Set(ps.soldiers.filter(ALIVE).map((s) => s.name));
  const free = SOLDIER_NAMES.filter((n) => !used.has(n));
  let name = free.length ? free[Math.floor(Math.random() * free.length)] : `${SOLDIER_NAMES[Math.floor(Math.random() * SOLDIER_NAMES.length)]}-${used.size + 1}`;
  if (used.has(name)) name = `${name}-${used.size + 1}`;
  const traits = Object.keys(TRAITS) as SoldierTrait[];
  const trait = traits[Math.floor(Math.random() * traits.length)];
  return insertSoldier(c, ps, type, name, trait);
}
async function insertSoldier(c: Db, ps: PS, type: OperatorType, name: string, trait: SoldierTrait): Promise<SoldierRow> {
  const r = await c.query(`INSERT INTO soldiers(user_id,type,name,trait,status) VALUES ($1,$2,$3,$4,'ready') RETURNING id, created_at`, [ps.userId, type, name, trait]);
  const s: SoldierRow = {
    id: r.rows[0].id, type, name, trait, xp: 0, level: 1, missions: 0, scars: 0, status: 'ready', expedition_id: null, created_at: ms(r.rows[0].created_at)!, lost_at: null,
    spec: null, fatigue: 0, fatigue_at: null, bonds: {}, instructor: false,
  };
  ps.soldiers.push(s);
  return s;
}
/** Именной боец-награда: увеличивает отряд и сразу получает своё имя. */
export async function grantNamedSoldier(c: Db, ps: PS, type: OperatorType, name: string, trait: string) {
  ps.ops[type].available += 1;
  const t = (Object.keys(TRAITS) as SoldierTrait[]).includes(trait as SoldierTrait) ? (trait as SoldierTrait) : 'tough';
  await insertSoldier(c, ps, type, name, t);
}

/** Именные бойцы всегда соответствуют счётчикам отряда (счётчики — главный источник истины). */
export async function reconcileSoldiers(c: Db, ps: PS) {
  if (!ps.soldiers) return;
  for (const t of OPERATOR_TYPES) {
    const o = ps.ops[t];
    const want: Record<string, number> = { ready: o.available, mission: o.on_mission, wounded: o.wounded, recovering: o.recovering };
    const total = want.ready + want.mission + want.wounded + want.recovering;
    let alive = ps.soldiers.filter((s) => s.type === t && ALIVE(s));
    if (alive.length > total) {
      const extra = [...alive].sort((a, b) => a.level - b.level || a.xp - b.xp).slice(0, alive.length - total);
      for (const s of extra) {
        s.status = 'retired';
        s.expedition_id = null;
        s.dirty = true;
      }
      alive = alive.filter((s) => !extra.includes(s));
    }
    while (alive.length < total) alive.push(await newSoldier(c, ps, t));
    const pool: SoldierRow[] = [];
    for (const s of alive) {
      if (want[s.status] > 0) want[s.status]--;
      else pool.push(s);
    }
    for (const st of STATUS_KEYS) {
      while (want[st] > 0 && pool.length) {
        const s = pool.pop()!;
        s.status = st;
        if (st !== 'mission') s.expedition_id = null;
        s.dirty = true;
        want[st]--;
      }
    }
  }
}

/** Лучшие свободные бойцы под состав группы. */
export function pickSoldiers(ps: PS, group: Partial<Record<OperatorType, number>>): SoldierRow[] {
  const out: SoldierRow[] = [];
  for (const t of OPERATOR_TYPES) {
    const n = group[t] ?? 0;
    if (!n) continue;
    const now = Date.now();
    const score = (s: SoldierRow) => (s.instructor ? -1000 : 0) + s.level * 10 - fatigueNow(s.fatigue, s.fatigue_at, now) / 10;
    const ready = ps.soldiers.filter((s) => s.type === t && s.status === 'ready').sort((a, b) => score(b) - score(a) || b.xp - a.xp);
    out.push(...ready.slice(0, n));
  }
  return out;
}

/** Опыт, ранения и потери именных бойцов по итогу похода. */
export function soldiersAfterExpedition(ps: PS, x: ExpRow, res: ExpeditionResult, t: number, difficulty: number, seed: number) {
  const rand = rng(seed ^ 0x5bd1e995);
  const members = ps.soldiers.filter((s) => s.status === 'mission' && s.expedition_id === x.id);
  const fallen: string[] = [];
  const wounded: string[] = [];
  const patched: string[] = [];
  const levelUps: { name: string; level: number }[] = [];
  for (const type of OPERATOR_TYPES) {
    const n = x.group_comp[type] ?? 0;
    if (!n) continue;
    let pool = members.filter((s) => s.type === type);
    if (pool.length < n) {
      const extra = ps.soldiers.filter((s) => s.type === type && s.status === 'mission' && s.expedition_id == null && !pool.includes(s));
      pool = [...pool, ...extra.slice(0, n - pool.length)];
    }
    const cas = res.casualties[type] ?? { wounded: 0, lost: 0, fieldRecovered: 0 };
    const take = (k: number) => {
      const out: SoldierRow[] = [];
      for (let i = 0; i < k && pool.length; i++) {
        const w = pool.map((s) => traitExposure(s.trait));
        let r = rand() * w.reduce((a, b) => a + b, 0);
        let idx = 0;
        while (idx < pool.length - 1 && r >= w[idx]) r -= w[idx++];
        out.push(pool.splice(idx, 1)[0]);
      }
      return out;
    };
    for (const s of take(cas.lost)) {
      s.status = 'lost';
      s.instructor = false;
      s.lost_at = t;
      s.expedition_id = null;
      s.dirty = true;
      fallen.push(s.name);
    }
    for (const s of take(cas.wounded)) {
      s.status = 'wounded';
      s.scars++;
      s.expedition_id = null;
      s.dirty = true;
      wounded.push(s.name);
      gainXp(s, difficulty, res.outcome, levelUps);
    }
    for (const s of take(cas.fieldRecovered)) {
      s.scars++;
      patched.push(s.name);
      pool.push(s);
    }
    for (const s of pool) {
      s.status = 'ready';
      s.expedition_id = null;
      s.dirty = true;
      gainXp(s, difficulty, res.outcome, levelUps);
    }
  }
  // усталость и слаженность расчётов
  for (const s of members) {
    if (s.status === 'lost') continue;
    s.fatigue = Math.min(100, fatigueNow(s.fatigue, s.fatigue_at, t) + FATIGUE_PER_MISSION);
    s.fatigue_at = t;
    for (const o of members) if (o !== s) s.bonds[String(o.id)] = (s.bonds[String(o.id)] ?? 0) + 1;
    s.dirty = true;
  }
  return { fallen, wounded, patched, levelUps };
}
function gainXp(s: SoldierRow, difficulty: number, outcome: string, levelUps: { name: string; level: number }[]) {
  s.missions++;
  const before = s.level;
  s.xp += Math.round(8 * difficulty * (outcome === 'decisive' ? 1.5 : outcome === 'fail' ? 0.4 : 1));
  s.level = soldierLevel(s.xp);
  if (s.level > before) levelUps.push({ name: s.name, level: s.level });
  s.dirty = true;
}

/* ───────────── досчёт систем при входе ───────────── */

function idlePower(ps: PS): number {
  return OPERATOR_TYPES.reduce((s, t) => s + ps.ops[t].available * OPERATORS[t].power * (1 + RANK_BONUS * (ps.ops[t].rank - 1)), 0);
}
export function defenseOf(ps: PS, now: number): number {
  return defenseRating(ps.buildings.defense ?? 1, idlePower(ps), playerMods(ps, now).defense);
}
function lootable(ps: PS, share: number, max: number): Cost {
  const caps: Record<string, number> = { supplies: storageCap(ps.buildings.supply), parts: storageCap(ps.buildings.workshop), fuel: storageCap(ps.buildings.fueldepot) };
  const out: Cost = {};
  for (const r of ['supplies', 'parts', 'fuel'] as const) {
    const free = ps.p[r] - caps[r] * LOOT_PROTECTED_SHARE;
    if (free > 0) out[r] = Math.min(max, Math.floor(free * share));
  }
  return out;
}
function take(ps: PS, cost: Cost): Cost {
  const real: Cost = {};
  for (const r of RES_KEYS) {
    const v = Math.min(Math.floor(ps.p[r]), cost[r] ?? 0);
    if (v > 0) {
      ps.p[r] -= v;
      real[r] = v;
    }
  }
  return real;
}
async function report(c: Db, ps: PS, at: number, body: object) {
  await c.query('INSERT INTO reports(user_id, expedition_id, created_at, body) VALUES ($1,NULL,to_timestamp($2/1000.0),$3)', [ps.userId, at, JSON.stringify(body)]);
}

export async function settleMeta(c: Db, ps: PS, now: number) {
  // серия ежедневных входов
  const day = gameDay(now);
  if (ps.meta.lastLoginDay !== day) {
    ps.meta.streak = ps.meta.lastLoginDay === gameDay(now - 86_400_000) ? ps.meta.streak + 1 : 1;
    ps.meta.lastLoginDay = day;
    ps.p.stats.maxStreak = Math.max(ps.p.stats.maxStreak ?? 0, ps.meta.streak);
  }

  // отложенные начисления: передачи со склада роты
  const grants = await c.query('UPDATE pending_grants SET applied=true WHERE user_id=$1 AND NOT applied RETURNING cost, text', [ps.userId]);
  for (const g of grants.rows) {
    grant(ps, g.cost);
    ps.notices.push({ kind: 'success', text: g.text });
  }

  // набеги других командиров на этот полигон
  const hits = await c.query(
    `UPDATE pvp_hits SET applied=true WHERE defender_id=$1 AND NOT applied AND at <= to_timestamp($2/1000.0) RETURNING *`,
    [ps.userId, now],
  );
  for (const h of hits.rows) {
    const won = h.outcome === 'fail';
    const at = new Date(h.at).getTime();
    ps.clock = at;
    let lost: Cost = {};
    if (!won) lost = take(ps, h.loot);
    else {
      grant(ps, { parts: 30, data: 5 });
      bumpStat(ps, 'pvp_defended');
      track(ps, 'defended');
      addPoints(ps, 10);
    }
    bumpStat(ps, 'raidedTimes');
    await report(c, ps, at, {
      kind: 'pvp_defense', at, attacker: h.attacker_callsign, attackerId: h.attacker_id, won, attack: h.attack_power, defense: h.defense,
      lost, reward: won ? { parts: 30, data: 5 } : {},
    });
    ps.notices.push({ kind: won ? 'success' : 'warn', text: won ? `Набег «${h.attacker_callsign}» отбит!` : `«${h.attacker_callsign}» совершил набег на полигон: потеряно ${costText(lost) || 'немного'}` });
  }

  // атаки противника на полигон
  if (ps.p.tutorial_step >= 7 && ps.p.cmd_level >= 2) {
    const start = Math.max(ps.meta.attacksCheckedAt ?? now, now - ATTACK_LOOKBACK);
    const maxDiff = Math.max(1, ...SECTORS.filter((s) => (ps.sectors[s.id]?.successes ?? 0) > 0).map((s) => s.difficulty));
    const theme = seasonTheme(seasonIndex(now)).key;
    for (let w = Math.floor(start / ATTACK_WINDOW); w <= Math.floor(now / ATTACK_WINDOW); w++) {
      const ev = eventWindow(now, EPOCH);
      const a = attackInWindow(ps.userId, w, maxDiff, theme, ev.active ? ev.event.attackBoost ?? 0 : 0);
      if (!a || a.at <= start || a.at > now) continue;
      await resolveAttack(c, ps, a.at, a.strength, w);
    }
  }
  ps.meta.attacksCheckedAt = now;

  // постепенная потеря контроля над секторами
  const decayMul = Math.max(0, 1 - playerMods(ps, now).decay);
  for (const sec of Object.values(ps.sectors)) {
    if (sec.control <= 0 || sec.control_at == null) continue;
    const rate = CONTROL_DECAY_PER_HOUR * decayMul;
    if (rate <= 0) continue;
    const elapsed = now - sec.control_at - CONTROL_GRACE;
    if (elapsed <= 0) continue;
    const dec = Math.floor((elapsed / H) * rate);
    if (dec <= 0) continue;
    const real = Math.min(sec.control, dec);
    sec.control -= real;
    sec.control_at += (dec / rate) * H;
  }

  // итоги прошлой недели и прошлого сезона
  await claimPeriod(c, ps, 'week', weekIndex(now) - 1);
  await claimPeriod(c, ps, 'season', seasonIndex(now) - 1);

  // сюжет сезона
  advanceSeasonStory(ps);
  ps.clock = undefined;
}

async function resolveAttack(c: Db, ps: PS, at: number, strength: number, w: number) {
  ps.clock = at;
  const rand = rng(ps.userId * 7 + w);
  const defense = defenseOf(ps, at);
  const roll = 0.85 + rand() * 0.3;
  const won = defense * roll >= strength;
  let lost: Cost = {};
  const woundedOut: string[] = [];
  let sectorHit: { id: number; name: string; before: number; after: number } | null = null;
  let reward: Cost = {};
  if (won) {
    reward = { parts: 20 + 5 * (ps.buildings.defense ?? 1), data: 3 };
    grant(ps, reward);
    bumpStat(ps, 'defended');
    track(ps, 'defended');
    addPoints(ps, POINTS.defended);
  } else {
    lost = take(ps, lootable(ps, 0.15, 300));
    // до двух свободных операторов получают ранения
    for (let i = 0; i < 2; i++) {
      const avail = OPERATOR_TYPES.filter((t) => ps.ops[t].available > 0);
      if (!avail.length || rand() < 0.45) continue;
      const t = avail[Math.floor(rand() * avail.length)];
      ps.ops[t].available--;
      ps.ops[t].wounded++;
      woundedOut.push(OPERATORS[t].name);
    }
    const controlled = Object.entries(ps.sectors).filter(([, s]) => s.control > 0).sort((a, b) => b[1].control - a[1].control);
    if (controlled.length) {
      const [id, s] = controlled[0];
      const before = s.control;
      s.control = Math.max(0, s.control - 25);
      sectorHit = { id: Number(id), name: sectorById(Number(id))!.name, before, after: s.control };
    }
    bumpStat(ps, 'attacksLost');
  }
  await report(c, ps, at, { kind: 'defense', at, won, attack: strength, defense: Math.round(defense * roll), lost, wounded: woundedOut, sectorHit, reward });
  ps.notices.push({ kind: won ? 'success' : 'warn', text: won ? 'Атака на полигон отбита!' : 'Противник атаковал полигон — подробности в отчётах' });
}

async function claimPeriod(c: Db, ps: PS, kind: 'week' | 'season', idx: number) {
  const statKey = kind === 'week' ? 'weekClaimed' : 'seasonClaimed';
  if (idx < (kind === 'week' ? 0 : 1) || ps.p.stats[statKey] === idx) return;
  ps.p.stats[statKey] = idx;
  const period = kind === 'week' ? weekKey(idx) : seasonKey(idx);
  const me = await c.query('SELECT points FROM scores WHERE user_id=$1 AND period=$2', [ps.userId, period]);
  const points = me.rows[0]?.points ?? 0;
  if (points <= 0) return;
  const r = await c.query('SELECT count(*)::int AS n FROM scores WHERE period=$1 AND points > $2', [period, points]);
  const rank = r.rows[0].n + 1;
  const { reward, chevron } = periodRankReward(kind, rank, points);
  grant(ps, reward);
  const name = kind === 'week' ? 'недели' : 'сезона';
  ps.notices.push({ kind: 'success', text: `Итоги ${name}: ${rank} место (${points} очков). Награда: ${costText(reward)}` });
  if (chevron && (await grantChevron(c, ps, chevron, 'rating'))) {
    ps.newChevrons.push(chevron);
    ps.notices.push({ kind: 'success', text: `Новый шеврон: «${CHEVRONS.find((x) => x.key === chevron)?.name}»` });
  }
}

export function advanceSeasonStory(ps: PS) {
  const ctr = ps.scoreS.counters;
  ctr.points = ps.scoreS.points;
  let step = ctr.step ?? 0;
  while (step < SEASON_STORY.length && (ctr[SEASON_STORY[step].counter] ?? 0) >= SEASON_STORY[step].target) {
    const st = SEASON_STORY[step];
    grant(ps, st.reward);
    ps.notices.push({ kind: 'success', text: `Сюжет сезона: «${st.title}» выполнено. Награда: ${costText(st.reward)}` });
    step++;
    if (step === SEASON_STORY.length) bumpStat(ps, 'seasonStoryDone');
  }
  ctr.step = step;
}

/** Учёт похода для рейтинга, контрактов и сюжета. */
export function trackExpedition(ps: PS, x: ExpRow, res: ExpeditionResult, difficulty: number) {
  const won = res.outcome === 'success' || res.outcome === 'decisive';
  addPoints(ps, x.mission === 'pvp' ? (won ? POINTS.pvpWin : 0) : POINTS.expedition(difficulty, res.outcome));
  if (!won) return;
  const key = { recon: 'recon_win', raid: 'raid_win', stronghold: 'stronghold_win', supply: 'supply_win', expedition: 'expedition_win', pvp: 'pvp_win' }[x.mission];
  if (key) track(ps, key);
  if (x.mission === 'pvp') bumpStat(ps, 'pvp_win');
  if (res.totalWounded + res.totalLost + res.totalFieldRecovered === 0) track(ps, 'flawless');
}

/** Урон по укрепрайону роты от успешного боевого похода. */
export async function companyDamage(c: Db, ps: PS, x: ExpRow, res: ExpeditionResult, difficulty: number, weekKeyNow: string) {
  if (!ps.companyId || !MISSIONS[x.mission].combat) return 0;
  if (res.outcome !== 'success' && res.outcome !== 'decisive') return 0;
  const dmg = Math.round(x.plan.power * Math.max(1, difficulty) * (res.outcome === 'decisive' ? 1.3 : 1));
  const members = await c.query('SELECT count(*)::int AS n FROM company_members WHERE company_id=$1', [ps.companyId]);
  const hp = 800 * Math.max(2, members.rows[0].n);
  const r = await c.query(
    `INSERT INTO company_ops(company_id, week, hp, damage) VALUES ($1,$2,$3,$4)
     ON CONFLICT (company_id, week) DO UPDATE SET damage = company_ops.damage + $4
     RETURNING hp, damage, defeated_at`,
    [ps.companyId, weekKeyNow, hp, dmg],
  );
  const op = r.rows[0];
  if (op.damage >= op.hp && !op.defeated_at) {
    await c.query('UPDATE company_ops SET defeated_at=now() WHERE company_id=$1 AND week=$2 AND defeated_at IS NULL', [ps.companyId, weekKeyNow]);
    await c.query('INSERT INTO company_log(company_id, text) VALUES ($1,$2)', [ps.companyId, `Укрепрайон взят! Добивающий удар — «${ps.p.callsign}». Награды ждут в штабе роты.`]);
  }
  track(ps, 'company_damage', dmg);
  return dmg;
}

export function streakInfo(ps: PS, now: number) {
  return { streak: ps.meta.streak, claimedToday: ps.meta.streakClaimedDay === gameDay(now), reward: streakReward(ps.meta.streak) };
}
