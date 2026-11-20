import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { pool, tx } from './db.js';
import { createPlayer } from './game/state.js';
import { log } from './log.js';

const SESSION_DAYS = Number(process.env.SESSION_DAYS ?? 60);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((res, rej) =>
    crypto.scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))),
  );
}
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, , , , saltB64, keyB64] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'));
  const want = Buffer.from(keyB64, 'base64');
  return want.length === key.length && crypto.timingSafeEqual(want, key);
}
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

async function newSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query(`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2, now() + ($3 || ' days')::interval)`, [sha256(token), userId, String(SESSION_DAYS)]);
  return token;
}

/* Ограничение частоты: окно в памяти процесса (достаточно для одного экземпляра сервиса) */
const buckets = new Map<string, { n: number; reset: number }>();
function limited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return false;
  }
  b.n++;
  return b.n > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60_000).unref();

const LOGIN_RE = /^[a-zA-Z0-9а-яА-ЯёЁ_.-]{3,32}$/;

export async function register(req: Request, res: Response) {
  const ip = req.ip ?? 'unknown';
  if (limited(`reg:${ip}`, 10, 3600_000)) return res.status(429).json({ error: 'Слишком много регистраций с этого адреса, попробуйте позже' });
  const login = String(req.body?.login ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  const callsign = String(req.body?.callsign ?? '').trim();
  const commanderName = String(req.body?.commanderName ?? '').trim();
  if (!LOGIN_RE.test(login)) return res.status(400).json({ error: 'Логин: 3–32 символа, буквы, цифры, точка, дефис, подчёркивание' });
  if (password.length < 6 || password.length > 128) return res.status(400).json({ error: 'Пароль: от 6 символов' });
  if (callsign.length < 2 || callsign.length > 24) return res.status(400).json({ error: 'Позывной: от 2 до 24 символов' });
  if (commanderName.length < 2 || commanderName.length > 40) return res.status(400).json({ error: 'Имя командира: от 2 до 40 символов' });
  const hash = await hashPassword(password);
  try {
    const userId = await tx(async (c) => {
      const u = await c.query('INSERT INTO users(login,password_hash) VALUES ($1,$2) RETURNING id', [login, hash]);
      await createPlayer(c, u.rows[0].id, callsign, commanderName, Date.now());
      return u.rows[0].id as number;
    });
    log.info('user registered', { userId });
    res.json({ token: await newSession(userId) });
  } catch (e: any) {
    if (e?.code === '23505') return res.status(409).json({ error: 'Такой логин уже занят' });
    throw e;
  }
}

export async function login(req: Request, res: Response) {
  const ip = req.ip ?? 'unknown';
  const login = String(req.body?.login ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (limited(`login-ip:${ip}`, 30, 15 * 60_000) || limited(`login:${login}`, 10, 15 * 60_000)) {
    log.warn('login rate limited', { ip });
    return res.status(429).json({ error: 'Слишком много попыток входа. Подождите 15 минут' });
  }
  const r = await pool.query('SELECT id, password_hash FROM users WHERE login=$1', [login]);
  const ok = r.rowCount ? await verifyPassword(password, r.rows[0].password_hash) : (await hashPassword(password), false);
  if (!ok) return res.status(401).json({ error: 'Неверный логин или пароль' });
  res.json({ token: await newSession(r.rows[0].id) });
}

export async function logout(req: Request, res: Response) {
  const token = bearer(req);
  if (token) await pool.query('DELETE FROM sessions WHERE token_hash=$1', [sha256(token)]);
  res.json({ ok: true });
}

function bearer(req: Request): string | null {
  const h = req.headers.authorization ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

export interface AuthedRequest extends Request {
  userId?: number;
}
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Нужен вход' });
  const r = await pool.query('SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at > now()', [sha256(token)]);
  if (!r.rowCount) return res.status(401).json({ error: 'Сессия истекла — войдите снова' });
  req.userId = r.rows[0].user_id;
  next();
}

export async function cleanupSessions() {
  await pool.query('DELETE FROM sessions WHERE expires_at < now()');
  await pool.query(`DELETE FROM action_log WHERE created_at < now() - interval '2 days'`);
}
