/**
 * Социальные системы: роты (склад, передачи, помощь в стройке, совместный штурм), набеги на чужие полигоны,
 * рейтинг. Изменения чужого полигона не делаются напрямую — они записываются и применяются при входе владельца,
 * поэтому две транзакции никогда не держат замки двух игроков одновременно.
 */
import crypto from 'node:crypto';
import type { Router } from 'express';
import {
  Cost, EQUIPMENT, EquipmentType, MAX_EQUIPMENT_PER_GROUP, OPERATORS, OPERATOR_TYPES, OperatorType, RANK_BONUS, RES_KEYS, Rarity, ResKey,
  SectorDef, VEHICLES, VEHICLE_TYPES, storageCap,
} from '../../../shared/config.js';
import { Group, planExpedition, resolveExpedition } from '../../../shared/calc.js';
import { RESEARCH, PVP, LOOT_PROTECTED_SHARE, addMods, defenseRating, emptyMods, seasonIndex, seasonKey, seasonTheme, weekIndex, weekKey } from '../../../shared/progression.js';
import { pool, type Db } from '../db.js';
import { GameError, PS, bumpStat, costText, expeditionSlots, grant, spend } from './state.js';
import { addPoints, dispatchBonus, pickSoldiers, track } from './meta.js';
import type { Handler } from './actions.js';

const RES_LIST: ResKey[] = ['supplies', 'parts', 'fuel', 'data'];
const COMPANY_COST: Cost = { supplies: 300, parts: 200 };
const COMPANY_LIMIT = 20;

async function log(c: Db, companyId: number, text: string) {
  await c.query('INSERT INTO company_log(company_id, text) VALUES ($1,$2)', [companyId, text]);
}
function resKey(v: unknown): ResKey {
  if (typeof v !== 'string' || !RES_LIST.includes(v as ResKey)) throw new GameError('Неизвестный ресурс');
  return v as ResKey;
}
function amount(v: unknown, max = 5000): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new GameError(`Количество: от 1 до ${max}`);
  return n;
}

/* ───────────── снимок чужого полигона (без замка) ───────────── */

interface Snapshot {
  id: number; callsign: string; level: number; createdAt: number; companyId: number | null;
  res: Record<'supplies' | 'parts' | 'fuel' | 'data', number>; defense: number; loot: Cost;
}
async function snapshot(c: Db, id: number, now: number): Promise<Snapshot> {
  const p = await c.query('SELECT user_id, callsign, cmd_level, created_at, supplies, parts, fuel, data FROM players WHERE user_id=$1', [id]);
  if (!p.rowCount) throw new GameError('Игрок не найден');
  const [b, o, r, cm] = await Promise.all([
    c.query('SELECT key, level FROM buildings WHERE user_id=$1', [id]),
    c.query('SELECT type, available, rank FROM operators WHERE user_id=$1', [id]),
    c.query('SELECT key FROM research WHERE user_id=$1', [id]),
    c.query('SELECT company_id FROM company_members WHERE user_id=$1', [id]),
  ]);
  const lvl = (k: string) => b.rows.find((x) => x.key === k)?.level ?? 1;
  const idle = o.rows.reduce((s, x) => s + x.available * (OPERATORS[x.type as OperatorType]?.power ?? 0) * (1 + RANK_BONUS * (x.rank - 1)), 0);
  const mods = emptyMods();
  for (const k of r.rows) addMods(mods, RESEARCH.find((x) => x.key === k.key)?.mods ?? {});
  addMods(mods, seasonTheme(seasonIndex(now)).mods);
  const row = p.rows[0];
  const res = { supplies: row.supplies, parts: row.parts, fuel: row.fuel, data: row.data };
  const caps: Record<string, number> = { supplies: storageCap(lvl('supply')), parts: storageCap(lvl('workshop')), fuel: storageCap(lvl('fueldepot')) };
  const loot: Cost = {};
  for (const k of ['supplies', 'parts', 'fuel'] as const) {
    const free = res[k] - caps[k] * LOOT_PROTECTED_SHARE;
    if (free > 0) loot[k] = Math.min(PVP.lootMax, Math.floor(free * PVP.lootShare));
  }
  return {
    id, callsign: row.callsign, level: row.cmd_level, createdAt: new Date(row.created_at).getTime(), companyId: cm.rows[0]?.company_id ?? null,
    res, defense: defenseRating(lvl('defense'), idle, mods.defense), loot,
  };
}
/** Причина, по которой полигон сейчас нельзя атаковать (или null). */
async function protection(c: Db, t: Snapshot, attackerId: number, now: number): Promise<string | null> {
  if (t.level < PVP.minLevel) return `Новичок: защищён до ${PVP.minLevel} уровня командира`;
  if (now - t.createdAt < PVP.newbieHours * 3_600_000) return 'Новичок: защищён первые трое суток';
  const shield = await c.query(`SELECT max(at) AS at FROM pvp_hits WHERE defender_id=$1 AND outcome <> 'fail' AND at > to_timestamp($2/1000.0)`, [t.id, now - PVP.shieldHours * 3_600_000]);
  if (shield.rows[0].at) return `Под щитом после недавнего набега (ещё ~${Math.ceil((new Date(shield.rows[0].at).getTime() + PVP.shieldHours * 3_600_000 - now) / 3_600_000)} ч)`;
  const mine = await c.query('SELECT 1 FROM pvp_hits WHERE defender_id=$1 AND attacker_id=$2 AND created_at > to_timestamp($3/1000.0)', [t.id, attackerId, now - PVP.sameTargetHours * 3_600_000]);
  if (mine.rowCount) return `Вы уже ходили на этот полигон — повтор через ${PVP.sameTargetHours} ч`;
  return null;
}

/* ───────────── действия ───────────── */

export const SOCIAL_ACTIONS: Record<string, Handler> = {
  async companyCreate(c, ps, a) {
    if (ps.companyId) throw new GameError('Вы уже состоите в роте');
    const name = String(a.name ?? '').trim();
    const tag = String(a.tag ?? '').trim().toUpperCase();
    const motto = String(a.motto ?? '').trim().slice(0, 80);
    if (name.length < 3 || name.length > 30) throw new GameError('Название роты: от 3 до 30 символов');
    if (!/^[A-ZА-ЯЁ0-9]{2,5}$/.test(tag)) throw new GameError('Тег: 2–5 букв или цифр');
    spend(ps, COMPANY_COST);
    let id: number;
    try {
      const r = await c.query('INSERT INTO companies(name, tag, motto, created_by) VALUES ($1,$2,$3,$4) RETURNING id', [name, tag, motto, ps.userId]);
      id = r.rows[0].id;
    } catch (e: any) {
      if (e?.code === '23505') throw new GameError('Рота с таким названием уже есть');
      throw e;
    }
    await c.query(`INSERT INTO company_members(user_id, company_id, role) VALUES ($1,$2,'leader')`, [ps.userId, id]);
    await log(c, id, `«${ps.p.callsign}» основал роту`);
    ps.companyId = id;
    bumpStat(ps, 'companyFounded');
    return { message: `Рота «${name}» [${tag}] основана`, data: { id } };
  },
  async companyJoin(c, ps, a) {
    if (ps.companyId) throw new GameError('Сначала выйдите из текущей роты');
    const id = Number(a.id);
    const co = await c.query('SELECT id, name FROM companies WHERE id=$1 FOR UPDATE', [id]);
    if (!co.rowCount) throw new GameError('Рота не найдена');
    const n = await c.query('SELECT count(*)::int AS n FROM company_members WHERE company_id=$1', [id]);
    if (n.rows[0].n >= COMPANY_LIMIT) throw new GameError(`В роте уже ${COMPANY_LIMIT} командиров`);
    await c.query('INSERT INTO company_members(user_id, company_id) VALUES ($1,$2)', [ps.userId, id]);
    await log(c, id, `«${ps.p.callsign}» вступил в роту`);
    ps.companyId = id;
    return `Вы вступили в роту «${co.rows[0].name}»`;
  },
  async companyLeave(c, ps) {
    if (!ps.companyId) throw new GameError('Вы не состоите в роте');
    const id = ps.companyId;
    await c.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [id]);
    const me = await c.query('DELETE FROM company_members WHERE user_id=$1 RETURNING role', [ps.userId]);
    const left = await c.query('SELECT user_id FROM company_members WHERE company_id=$1 ORDER BY joined_at LIMIT 1', [id]);
    if (!left.rowCount) {
      await c.query('DELETE FROM companies WHERE id=$1', [id]);
    } else {
      if (me.rows[0]?.role === 'leader') await c.query(`UPDATE company_members SET role='leader' WHERE user_id=$1`, [left.rows[0].user_id]);
      await log(c, id, `«${ps.p.callsign}» покинул роту`);
    }
    ps.companyId = null;
    return 'Вы покинули роту';
  },
  async companyDonate(c, ps, a) {
    if (!ps.companyId) throw new GameError('Вы не состоите в роте');
    const r = resKey(a.res);
    const n = amount(a.amount);
    spend(ps, { [r]: n });
    await c.query(`UPDATE companies SET ${r} = ${r} + $2 WHERE id=$1`, [ps.companyId, n]);
    await log(c, ps.companyId, `«${ps.p.callsign}» сдал на склад роты: ${costText({ [r]: n })}`);
    bumpStat(ps, 'donated', n);
    return `На склад роты: ${costText({ [r]: n })}`;
  },
  async companyGive(c, ps, a) {
    if (!ps.companyId) throw new GameError('Вы не состоите в роте');
    const role = await c.query('SELECT role FROM company_members WHERE user_id=$1', [ps.userId]);
    if (role.rows[0]?.role !== 'leader') throw new GameError('Выдавать со склада может только командир роты');
    const to = Number(a.userId);
    const target = await c.query('SELECT p.callsign FROM company_members m JOIN players p ON p.user_id=m.user_id WHERE m.user_id=$1 AND m.company_id=$2', [to, ps.companyId]);
    if (!target.rowCount) throw new GameError('Этот командир не в вашей роте');
    const r = resKey(a.res);
    const n = amount(a.amount);
    const upd = await c.query(`UPDATE companies SET ${r} = ${r} - $2 WHERE id=$1 AND ${r} >= $2`, [ps.companyId, n]);
    if (!upd.rowCount) throw new GameError('На складе роты столько нет');
    await c.query('INSERT INTO pending_grants(user_id, cost, text) VALUES ($1,$2,$3)', [to, JSON.stringify({ [r]: n }), `Рота выдала со склада: ${costText({ [r]: n })}`]);
    await log(c, ps.companyId, `Командир роты выдал «${target.rows[0].callsign}»: ${costText({ [r]: n })}`);
    return `Выдано «${target.rows[0].callsign}»: ${costText({ [r]: n })}`;
  },
  async helpBuild(c, ps, a, now) {
    if (!ps.companyId) throw new GameError('Помогать можно сослуживцам по роте');
    const to = Number(a.userId);
    if (to === ps.userId) throw new GameError('Себе помочь нельзя — только товарищам');
    const same = await c.query('SELECT 1 FROM company_members WHERE user_id=$1 AND company_id=$2', [to, ps.companyId]);
    if (!same.rowCount) throw new GameError('Этот командир не в вашей роте');
    const job = await c.query(`SELECT id, start_at, end_at FROM jobs WHERE user_id=$1 AND queue='build' AND NOT done AND end_at > to_timestamp($2/1000.0) ORDER BY end_at LIMIT 1`, [to, now]);
    if (!job.rowCount) throw new GameError('У сослуживца сейчас нет стройки');
    const j = job.rows[0];
    const cnt = await c.query('SELECT count(*)::int AS n FROM company_helps WHERE job_id=$1', [j.id]);
    if (cnt.rows[0].n >= 5) throw new GameError('Этой стройке уже помогли 5 раз');
    const total = (new Date(j.end_at).getTime() - new Date(j.start_at).getTime()) / 1000;
    const seconds = Math.max(30, Math.round(total * 0.06));
    const ins = await c.query('INSERT INTO company_helps(job_id, helper_id, target_id, seconds) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [j.id, ps.userId, to, seconds]);
    if (!ins.rowCount) throw new GameError('Вы уже помогли с этой стройкой');
    grant(ps, { data: 2 });
    bumpStat(ps, 'helps');
    track(ps, 'helps');
    return `Помощь отправлена: стройка сослуживца короче на ${seconds} с. Вам +2 данных`;
  },
  async companyClaimOp(c, ps, a, now) {
    if (!ps.companyId) throw new GameError('Вы не состоите в роте');
    const wk = a.week === 'prev' ? weekKey(weekIndex(now) - 1) : weekKey(weekIndex(now));
    const op = await c.query('SELECT defeated_at FROM company_ops WHERE company_id=$1 AND week=$2', [ps.companyId, wk]);
    if (!op.rows[0]?.defeated_at) throw new GameError('Укрепрайон ещё не взят');
    const ins = await c.query('INSERT INTO company_op_claims(company_id, week, user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [ps.companyId, wk, ps.userId]);
    if (!ins.rowCount) throw new GameError('Награда уже получена');
    const reward: Cost = { supplies: 300, parts: 300, data: 40 };
    grant(ps, reward);
    bumpStat(ps, 'companyWins');
    addPoints(ps, 20);
    return `Награда за штурм укрепрайона: ${costText(reward)}`;
  },

  async pvpScout(c, ps, a, now) {
    const id = Number(a.targetId);
    if (id === ps.userId) throw new GameError('Свой полигон и так знаете');
    const t = await snapshot(c, id, now);
    spend(ps, PVP.scoutCost);
    const fuzz = (v: number) => Math.round(v * (0.85 + Math.random() * 0.3));
    const prot = await protection(c, t, ps.userId, now);
    const intel = {
      targetId: id, callsign: t.callsign, defense: fuzz(t.defense), loot: Object.fromEntries(Object.entries(t.loot).map(([k, v]) => [k, fuzz(v as number)])),
      protectedReason: prot, at: now,
    };
    return { message: `Разведка полигона «${t.callsign}»: оборона ~${intel.defense}${prot ? `. ${prot}` : ''}`, data: intel };
  },
  async pvpRaid(c, ps, a, now) {
    if (ps.p.cmd_level < PVP.minLevel) throw new GameError(`Набеги доступны с ${PVP.minLevel} уровня командира`);
    const id = Number(a.targetId);
    if (!Number.isInteger(id) || id === ps.userId) throw new GameError('Неверная цель');
    const t = await snapshot(c, id, now);
    if (ps.companyId && t.companyId === ps.companyId) throw new GameError('Своих не трогаем — это сослуживец по роте');
    const prot = await protection(c, t, ps.userId, now);
    if (prot) throw new GameError(prot);
    if (ps.expeditions.length >= expeditionSlots(ps)) throw new GameError('Все слоты походов заняты');

    const group: Group = {};
    for (const tt of OPERATOR_TYPES) {
      const n = Number(a.group?.[tt] ?? 0);
      if (!Number.isInteger(n) || n < 0 || n > 50) throw new GameError('Неверный состав группы');
      if (n > ps.ops[tt].available) throw new GameError(`${OPERATORS[tt].name}: свободно только ${ps.ops[tt].available}`);
      if (n) group[tt] = n;
    }
    const vType = String(a.vehicle) as (typeof VEHICLE_TYPES)[number];
    const v = ps.vehicles[vType];
    if (!VEHICLE_TYPES.includes(vType) || !v || v.status !== 'ready') throw new GameError('Транспорт недоступен');
    const ids: number[] = Array.isArray(a.equipment) ? ([...new Set(a.equipment.map(Number))] as number[]) : [];
    if (ids.length > MAX_EQUIPMENT_PER_GROUP) throw new GameError('Не больше двух предметов оснащения');
    const eq = ids.map((eid) => {
      const e = ps.equipment.find((x) => x.id === eid);
      if (!e || e.status !== 'ready') throw new GameError('Оснащение недоступно');
      return e;
    });
    if (new Set(eq.map((e) => EQUIPMENT[e.type].kind)).size !== eq.length) throw new GameError('Нельзя взять два предмета с одинаковым эффектом');

    const sector: SectorDef = {
      id: 0, name: `Полигон «${t.callsign}»`, type: 'stronghold', difficulty: Math.max(1, Math.min(6, Math.round(t.defense / 25))),
      x: 0, y: 0, links: [], comms: 1, after: [], baseTime: PVP.baseTime, fuel: PVP.fuel, rewardMul: 1,
    };
    const chosen = pickSoldiers(ps, group);
    const ranks = Object.fromEntries(OPERATOR_TYPES.map((x) => [x, ps.ops[x].rank])) as Record<OperatorType, number>;
    const input = {
      sector, mission: 'pvp' as const, group, ranks, vehicle: { type: vType, level: v.level },
      equipment: eq.map((e) => ({ id: e.id, type: e.type as EquipmentType, rarity: e.rarity as Rarity, level: e.level })),
      skills: ps.p.skills, commsLevel: ps.buildings.comms, sectorRecon: 0,
      bonus: dispatchBonus(ps, 0, now, chosen.map((x) => ({ type: x.type, level: x.level, trait: x.trait }))),
      override: { enemy: t.defense, rewards: t.loot },
    };
    const plan = planExpedition(input);
    if (plan.size < 1) throw new GameError('В группе должен быть хотя бы один оператор');
    if (plan.size > plan.capacity) throw new GameError(`Вместимость группы — ${plan.capacity}`);
    spend(ps, plan.cost);
    const seed = crypto.randomInt(1, 2 ** 31 - 1);
    const result = resolveExpedition(input, plan, seed);
    if (result.outcome === 'fail') result.rewards = {};
    (plan as any).target = { id: t.id, callsign: t.callsign };
    for (const tt of OPERATOR_TYPES) {
      const n = group[tt] ?? 0;
      ps.ops[tt].available -= n;
      ps.ops[tt].on_mission += n;
    }
    v.status = 'mission';
    for (const e of eq) { e.status = 'mission'; e.dirty = true; }
    const end = now + plan.duration * 1000;
    const r = await c.query(
      `INSERT INTO expeditions(user_id,sector_id,mission,group_comp,vehicle,equipment,cost,plan,result,seed,start_at,end_at,target_id)
       VALUES ($1,0,'pvp',$2,$3,$4,$5,$6,$7,$8,to_timestamp($9/1000.0),to_timestamp($10/1000.0),$11) RETURNING id`,
      [ps.userId, JSON.stringify(group), vType, JSON.stringify(ids), JSON.stringify(plan.cost), JSON.stringify(plan), JSON.stringify(result), seed, now, end, t.id],
    );
    const expId = r.rows[0].id;
    await c.query(
      `INSERT INTO pvp_hits(attacker_id, defender_id, expedition_id, at, outcome, loot, attacker_callsign, attack_power, defense)
       VALUES ($1,$2,$3,to_timestamp($4/1000.0),$5,$6,$7,$8,$9)`,
      [ps.userId, t.id, expId, end, result.outcome, JSON.stringify(result.rewards), ps.p.callsign, Math.round(plan.power), t.defense],
    );
    ps.expeditions.push({ id: expId, sector_id: 0, mission: 'pvp', group_comp: group, vehicle: vType, equipment: ids, cost: plan.cost, plan, result, start_at: now, end_at: end, status: 'active', seed } as any);
    for (const so of chosen) { so.status = 'mission'; so.expedition_id = expId; so.dirty = true; }
    bumpStat(ps, 'pvpSent');
    return `Группа ушла в набег на полигон «${t.callsign}». Расход: ${costText(plan.cost)}`;
  },
};

/* ───────────── маршруты для чтения ───────────── */

export function registerSocialRoutes(api: Router, requireAuth: any) {
  api.get('/leaderboard', requireAuth, async (req: any, res) => {
    const now = Date.now();
    const kind = String(req.query.period ?? 'week');
    const period = kind === 'season' ? seasonKey(seasonIndex(now)) : kind === 'all' ? null : weekKey(weekIndex(now));
    const rows = period
      ? await pool.query(
          `SELECT p.user_id, p.callsign, p.portrait, p.chevron, p.cmd_level, s.points, c.tag
             FROM scores s JOIN players p ON p.user_id=s.user_id
             LEFT JOIN company_members m ON m.user_id=p.user_id LEFT JOIN companies c ON c.id=m.company_id
            WHERE s.period=$1 AND s.points > 0 ORDER BY s.points DESC, p.user_id LIMIT 50`,
          [period],
        )
      : await pool.query(
          `SELECT p.user_id, p.callsign, p.portrait, p.chevron, p.cmd_level, p.cmd_xp AS points, c.tag
             FROM players p LEFT JOIN company_members m ON m.user_id=p.user_id LEFT JOIN companies c ON c.id=m.company_id
            ORDER BY p.cmd_xp DESC, p.user_id LIMIT 50`,
        );
    let myRank: number | null = null;
    let myPoints = 0;
    if (period) {
      const me = await pool.query('SELECT points FROM scores WHERE user_id=$1 AND period=$2', [req.userId, period]);
      myPoints = me.rows[0]?.points ?? 0;
      if (myPoints > 0) myRank = (await pool.query('SELECT count(*)::int AS n FROM scores WHERE period=$1 AND points > $2', [period, myPoints])).rows[0].n + 1;
    }
    res.json({
      period: kind, me: req.userId, myRank, myPoints,
      rows: rows.rows.map((x, i) => ({ rank: i + 1, id: x.user_id, callsign: x.callsign, portrait: x.portrait, chevron: x.chevron, level: x.cmd_level, points: x.points, tag: x.tag })),
    });
  });

  api.get('/companies', requireAuth, async (req: any, res) => {
    const q = String(req.query.q ?? '').trim().slice(0, 30);
    const r = await pool.query(
      `SELECT c.id, c.name, c.tag, c.motto, count(m.user_id)::int AS members
         FROM companies c LEFT JOIN company_members m ON m.company_id=c.id
        WHERE ($1 = '' OR c.name ILIKE '%' || $1 || '%' OR c.tag ILIKE '%' || $1 || '%')
        GROUP BY c.id ORDER BY members DESC, c.id LIMIT 50`,
      [q],
    );
    res.json({ companies: r.rows, limit: COMPANY_LIMIT, cost: COMPANY_COST });
  });

  api.get('/companies/:id', requireAuth, async (req: any, res) => {
    const id = Number(req.params.id);
    const now = Date.now();
    const co = await pool.query('SELECT * FROM companies WHERE id=$1', [id]);
    if (!co.rowCount) return res.status(404).json({ error: 'Рота не найдена' });
    const wk = weekKey(weekIndex(now));
    const prev = weekKey(weekIndex(now) - 1);
    const [mem, lg, ops, claims, jobs, helped] = await Promise.all([
      pool.query(
        `SELECT m.user_id, m.role, p.callsign, p.portrait, p.chevron, p.cmd_level, coalesce(s.points,0) AS week_points
           FROM company_members m JOIN players p ON p.user_id=m.user_id
           LEFT JOIN scores s ON s.user_id=m.user_id AND s.period=$2
          WHERE m.company_id=$1 ORDER BY m.role, p.cmd_xp DESC`,
        [id, wk],
      ),
      pool.query('SELECT at, text FROM company_log WHERE company_id=$1 ORDER BY at DESC LIMIT 25', [id]),
      pool.query('SELECT week, hp, damage, defeated_at FROM company_ops WHERE company_id=$1 AND week = ANY($2)', [id, [wk, prev]]),
      pool.query('SELECT week FROM company_op_claims WHERE company_id=$1 AND user_id=$2', [id, req.userId]),
      pool.query(
        `SELECT j.user_id, j.id, j.end_at, (SELECT count(*)::int FROM company_helps h WHERE h.job_id=j.id) AS helps
           FROM jobs j JOIN company_members m ON m.user_id=j.user_id
          WHERE m.company_id=$1 AND j.queue='build' AND NOT j.done AND j.end_at > now()`,
        [id],
      ),
      pool.query('SELECT job_id FROM company_helps WHERE helper_id=$1', [req.userId]),
    ]);
    const myHelps = new Set(helped.rows.map((x) => Number(x.job_id)));
    const opOf = (w: string) => {
      const o = ops.rows.find((x) => x.week === w);
      return o ? { week: w, hp: o.hp, damage: o.damage, defeated: !!o.defeated_at, claimed: claims.rows.some((x) => x.week === w) } : null;
    };
    const c = co.rows[0];
    const me = mem.rows.find((m) => Number(m.user_id) === req.userId);
    res.json({
      id: c.id, name: c.name, tag: c.tag, motto: c.motto, storage: { supplies: c.supplies, parts: c.parts, fuel: c.fuel, data: c.data },
      myRole: me?.role ?? null, myId: req.userId, limit: COMPANY_LIMIT,
      members: mem.rows.map((m) => {
        const j = jobs.rows.find((x) => Number(x.user_id) === Number(m.user_id));
        return {
          id: Number(m.user_id), role: m.role, callsign: m.callsign, portrait: m.portrait, chevron: m.chevron, level: m.cmd_level, weekPoints: m.week_points,
          build: j ? { jobId: Number(j.id), endAt: new Date(j.end_at).getTime(), helps: j.helps, helpedByMe: myHelps.has(Number(j.id)) } : null,
        };
      }),
      log: lg.rows.map((x) => ({ at: new Date(x.at).getTime(), text: x.text })),
      op: opOf(wk),
      prevOp: opOf(prev),
      opHpPreview: 800 * Math.max(2, mem.rowCount ?? 0),
    });
  });

  api.get('/pvp/targets', requireAuth, async (req: any, res) => {
    const now = Date.now();
    const me = await pool.query('SELECT p.cmd_level, m.company_id FROM players p LEFT JOIN company_members m ON m.user_id=p.user_id WHERE p.user_id=$1', [req.userId]);
    const lvl = me.rows[0]?.cmd_level ?? 1;
    const company = me.rows[0]?.company_id ?? null;
    const r = await pool.query(
      `SELECT p.user_id, p.callsign, p.portrait, p.chevron, p.cmd_level, p.created_at,
              (SELECT max(at) FROM pvp_hits h WHERE h.defender_id=p.user_id AND h.outcome <> 'fail') AS last_hit,
              (SELECT max(created_at) FROM pvp_hits h WHERE h.defender_id=p.user_id AND h.attacker_id=$1) AS my_last
         FROM players p LEFT JOIN company_members m ON m.user_id=p.user_id
        WHERE p.user_id <> $1 AND p.cmd_level BETWEEN $2 AND $3 AND ($4::bigint IS NULL OR m.company_id IS DISTINCT FROM $4)
        ORDER BY abs(p.cmd_level - $5), random() LIMIT 25`,
      [req.userId, Math.max(1, lvl - PVP.levelSpread), lvl + PVP.levelSpread, company, lvl],
    );
    res.json({
      minLevel: PVP.minLevel, myLevel: lvl,
      targets: r.rows.map((x) => {
        let reason: string | null = null;
        if (x.cmd_level < PVP.minLevel || now - new Date(x.created_at).getTime() < PVP.newbieHours * 3_600_000) reason = 'новичок под защитой';
        else if (x.last_hit && new Date(x.last_hit).getTime() > now - PVP.shieldHours * 3_600_000) reason = 'под щитом после набега';
        else if (x.my_last && new Date(x.my_last).getTime() > now - PVP.sameTargetHours * 3_600_000) reason = 'вы недавно здесь были';
        return { id: Number(x.user_id), callsign: x.callsign, portrait: x.portrait, chevron: x.chevron, level: x.cmd_level, protectedReason: reason };
      }),
    });
  });
}
export { RES_KEYS, VEHICLES };
