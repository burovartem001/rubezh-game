import fs from 'node:fs';
import path from 'node:path';
import express, { NextFunction, Request, Response } from 'express';
import { AuthedRequest, cleanupSessions, login, logout, register, requireAuth } from './auth.js';
import { Db, migrate, pool, tx } from './db.js';
import { ACTIONS } from './game/actions.js';
import { GameError, PS, applyAward, checkTutorial, loadState, saveState, settle, view } from './game/state.js';
import crypto from 'node:crypto';
import { AWARDS, AWARD_KEYS, AwardKey } from '../../shared/config.js';
import { log } from './log.js';
import { APP_ROOT } from './root.js';

const PORT = Number(process.env.PORT ?? 3000);
/** Префикс пути, если игра открывается внутри основного сайта через обратный прокси, например /game. */
const BASE_PATH = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');
/** Кому разрешено встраивать игру во фрейм (CSP frame-ancestors), через пробел. По умолчанию — только сам сайт. */
const FRAME_ANCESTORS = process.env.FRAME_ANCESTORS?.trim() || "'self'";

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', `frame-ancestors ${FRAME_ANCESTORS}`);
  next();
});

const api = express.Router();
api.use(express.json({ limit: '32kb' }));

api.get('/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
});
api.post('/auth/register', register);
api.post('/auth/login', login);
api.post('/auth/logout', logout);

async function fullView(c: Db, ps: PS, now: number) {
  const [recent, unread] = await Promise.all([
    c.query('SELECT id, created_at, is_read, body FROM reports WHERE user_id=$1 ORDER BY created_at DESC, id DESC LIMIT 20', [ps.userId]),
    c.query('SELECT count(*)::int AS n FROM reports WHERE user_id=$1 AND NOT is_read', [ps.userId]),
  ]);
  return {
    ...view(ps, now),
    reports: recent.rows.map((r) => ({ id: r.id, createdAt: new Date(r.created_at).getTime(), read: r.is_read, ...r.body })),
    unreadReports: unread.rows[0].n,
  };
}

api.get('/state', requireAuth, async (req: AuthedRequest, res) => {
  const out = await tx(async (c) => {
    const ps = await loadState(c, req.userId!);
    const now = Date.now();
    await settle(c, ps, now);
    await saveState(c, ps);
    return fullView(c, ps, now);
  });
  res.json(out);
});

api.post('/action', requireAuth, async (req: AuthedRequest, res) => {
  const body = req.body ?? {};
  const type = String(body.action ?? '');
  const handler = Object.hasOwn(ACTIONS, type) ? ACTIONS[type] : undefined;
  if (!handler) return res.status(400).json({ error: 'Неизвестное действие' });
  const requestId = body.requestId == null ? null : String(body.requestId).slice(0, 64);
  const out = await tx(async (c) => {
    const ps = await loadState(c, req.userId!); // замок строки игрока: действия одного игрока выполняются строго по очереди
    const now = Date.now();
    let message: string;
    let replayed = false;
    const prev = requestId ? await c.query('SELECT response FROM action_log WHERE user_id=$1 AND request_id=$2', [ps.userId, requestId]) : null;
    await settle(c, ps, now);
    if (prev?.rowCount) {
      message = prev.rows[0].response.message;
      replayed = true;
    } else {
      message = await handler(c, ps, body, now);
      await checkTutorial(c, ps);
      if (requestId) await c.query('INSERT INTO action_log(user_id,request_id,response) VALUES ($1,$2,$3)', [ps.userId, requestId, JSON.stringify({ message })]);
    }
    await saveState(c, ps);
    return { message, replayed, state: await fullView(c, ps, now) };
  });
  res.json(out);
});

api.get('/reports', requireAuth, async (req: AuthedRequest, res) => {
  const before = Number(req.query.before ?? 0) || Number.MAX_SAFE_INTEGER;
  const r = await pool.query(
    'SELECT id, created_at, is_read, body FROM reports WHERE user_id=$1 AND id < $2 ORDER BY id DESC LIMIT 20',
    [req.userId, before],
  );
  res.json({ reports: r.rows.map((x) => ({ id: x.id, createdAt: new Date(x.created_at).getTime(), read: x.is_read, ...x.body })) });
});

/* ───────── Интеграция с сайтом «Учёт дронов»: выдача наград за заслуги ─────────
 * Выключена, пока не задан INTEGRATION_KEY. Сайт передаёт ключ в заголовке Authorization: Bearer <ключ>.
 * GET  /api/integration/awards            — каталог наград
 * POST /api/integration/award             — { login, award, count?, reason?, externalId? }
 * externalId (например, id события на сайте) защищает от повторной выдачи при повторе запроса.
 */
function integrationAuth(req: Request, res: Response, next: NextFunction) {
  const key = process.env.INTEGRATION_KEY ?? '';
  if (key.length < 16) return res.status(503).json({ error: 'Интеграция не настроена' });
  const got = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(got);
  const b = Buffer.from(key);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    log.warn('integration auth failed', { ip: req.ip });
    return res.status(401).json({ error: 'Неверный ключ интеграции' });
  }
  next();
}
api.get('/integration/awards', integrationAuth, (_req, res) => {
  res.json({ awards: AWARD_KEYS.map((k) => ({ key: k, kind: AWARDS[k].kind, name: AWARDS[k].name })) });
});
api.post('/integration/award', integrationAuth, async (req, res) => {
  const b = req.body ?? {};
  const login = String(b.login ?? '').trim().toLowerCase();
  const award = String(b.award ?? '') as AwardKey;
  const count = Number(b.count ?? 1);
  const reason = String(b.reason ?? '').trim().slice(0, 200);
  const externalId = b.externalId == null ? null : String(b.externalId).slice(0, 100);
  if (!AWARD_KEYS.includes(award)) return res.status(400).json({ error: 'Неизвестная награда', awards: AWARD_KEYS });
  if (!Number.isInteger(count) || count < 1 || count > 50) return res.status(400).json({ error: 'count: от 1 до 50' });
  const u = await pool.query('SELECT id FROM users WHERE login=$1', [login]);
  if (!u.rowCount) return res.status(404).json({ error: 'Игрок с таким логином не найден' });
  const out = await tx(async (c) => {
    const ps = await loadState(c, u.rows[0].id);
    const now = Date.now();
    if (externalId) {
      const dup = await c.query(`SELECT id FROM awards WHERE source='uchet-dronov' AND external_id=$1`, [externalId]);
      if (dup.rowCount) return { ok: true, duplicate: true };
    }
    await settle(c, ps, now, { showAwards: false });
    const text = await applyAward(c, ps, award, count);
    const r = await c.query(
      `INSERT INTO awards(user_id, award, count, reason, source, external_id) VALUES ($1,$2,$3,$4,'uchet-dronov',$5) RETURNING id`,
      [ps.userId, award, count, reason, externalId],
    );
    await saveState(c, ps);
    log.info('award granted', { userId: ps.userId, award, count });
    return { ok: true, duplicate: false, id: r.rows[0].id, granted: text };
  });
  res.json(out);
});

api.use((_req, res) => res.status(404).json({ error: 'Не найдено' }));
api.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof GameError) return res.status(400).json({ error: err.message });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Неверный запрос' });
  log.error('request failed', { path: req.path, message: err?.message, code: err?.code });
  res.status(500).json({ error: 'Ошибка сервера. Прогресс не потерян — повторите действие' });
});

const root = express.Router();
root.use('/api', api);
const clientDir = path.join(APP_ROOT, 'dist', 'client');
if (fs.existsSync(clientDir)) {
  root.use('/assets', express.static(path.join(clientDir, 'assets'), { immutable: true, maxAge: '365d' }));
  root.use(express.static(clientDir, { index: false, maxAge: '1h' }));
  root.get(/.*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}
app.use(BASE_PATH || '/', root);

async function main() {
  await migrate();
  await cleanupSessions().catch(() => {});
  setInterval(() => cleanupSessions().catch(() => {}), 6 * 3600_000).unref();
  const server = app.listen(PORT, () => log.info('server started', { port: PORT, basePath: BASE_PATH || '/' }));
  const stop = () => {
    log.info('shutting down');
    server.close(() => pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (process.argv.includes('--migrate-only')) {
  migrate().then(() => pool.end()).then(() => log.info('migrations done'), (e) => { log.error('migration failed', { message: e.message }); process.exit(1); });
} else {
  main().catch((e) => {
    log.error('startup failed', { message: e?.message });
    process.exit(1);
  });
}
