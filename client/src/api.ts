import type { Cost, MissionType, Outcome, OperatorType, VehicleType, EquipmentType, Rarity, DailyKey, BuildingKey, Skills } from '../../shared/config';
import type { Casualties, Reason } from '../../shared/calc';

/* Типы состояния, приходящего с сервера (server/src/game/state.ts → view) */
export interface OpRow { available: number; on_mission: number; wounded: number; recovering: number; lost_total: number; trained: number; rank: number }
export interface Job { id: number; queue: 'build' | 'train' | 'workshop' | 'recovery'; kind: string; payload: any; startAt: number; endAt: number }
export interface Expedition {
  id: number; sectorId: number; mission: MissionType; group: Partial<Record<OperatorType, number>>; vehicle: VehicleType; equipment: number[];
  cost: Cost; startAt: number; endAt: number; forecast: { outcomeLow: Outcome; outcomeHigh: Outcome; lossCategory: string };
}
export interface Report {
  id: number; createdAt: number; read: boolean; expeditionId: number; sectorId: number; sectorName: string; mission: MissionType; missionName: string;
  group: Partial<Record<OperatorType, number>>; vehicle: VehicleType; equipment: { type: EquipmentType; rarity: Rarity; level: number }[];
  startAt: number; endAt: number; cost: Cost; forecast: { outcomeLow: Outcome; outcomeHigh: Outcome; lossCategory: string };
  outcome: Outcome; ratio: number; casualties: Partial<Record<OperatorType, Casualties>>; totalWounded: number; totalLost: number; totalFieldRecovered: number;
  vehicleDamaged: boolean; rewards: Cost; xp: number; levelUp: number | null; drop: string | null;
  recon: { before: number; after: number }; control: { before: number; after: number }; reasons: Reason[];
}
export interface Equipment { id: number; type: EquipmentType; rarity: Rarity; level: number; status: 'ready' | 'mission'; source: string }
export interface SectorState { id: number; recon: number; control: number; attempts: number; successes: number; unlocked: boolean; lockReason: string }
export interface GameState {
  serverTime: number;
  player: { callsign: string; commanderName: string; portrait: number; insignia: number };
  resources: Record<'supplies' | 'parts' | 'fuel' | 'data', number>;
  resAt: number;
  caps: { supplies: number; parts: number; fuel: number; data: null };
  rates: { supplies: number; parts: number; fuel: number };
  buildings: Record<BuildingKey, number>;
  operators: Record<OperatorType, OpRow>;
  vehicles: Partial<Record<VehicleType, { level: number; status: 'ready' | 'mission' | 'damaged' | 'workshop' }>>;
  equipment: Equipment[];
  jobs: Job[];
  sectors: SectorState[];
  expeditions: Expedition[];
  slots: number;
  commander: { level: number; xp: number; skills: Skills; freeResetUsed: boolean; stats: Record<string, number> };
  tutorialStep: number;
  daily: { day: string; counters: Partial<Record<DailyKey, number>>; claimed: Partial<Record<DailyKey, boolean>> };
  notices: { kind: 'info' | 'success' | 'warn'; text: string }[];
  reports: Report[];
  unreadReports: number;
}

const TOKEN_KEY = 'rubezh.token';
let memToken: string | null = null;
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? memToken;
  } catch {
    return memToken;
  }
}
export function setToken(t: string | null) {
  memToken = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* хранилище недоступно — токен живёт до перезагрузки */
  }
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
export class NetworkError extends Error {}

/** Адрес API относительно страницы — игра работает и в корне домена, и под префиксом (например /game/). */
const apiUrl = (p: string) => new URL('api/' + p, document.baseURI).toString();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}), ...(init?.headers ?? {}) },
    });
  } catch {
    throw new NetworkError('Нет связи с сервером');
  }
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* пустой ответ */
  }
  if (!res.ok) {
    if (res.status >= 502 && res.status <= 504) throw new NetworkError('Сервер недоступен');
    throw new ApiError(body?.error ?? `Ошибка ${res.status}`, res.status);
  }
  return body as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
}

export const api = {
  register: (b: { login: string; password: string; callsign: string; commanderName: string }) =>
    request<{ token: string }>('auth/register', { method: 'POST', body: JSON.stringify(b) }),
  login: (b: { login: string; password: string }) => request<{ token: string }>('auth/login', { method: 'POST', body: JSON.stringify(b) }),
  logout: () => request('auth/logout', { method: 'POST' }),
  state: () => request<GameState>('state'),
  reports: (before: number) => request<{ reports: Report[] }>(`reports?before=${before}`),
  /**
   * Игровое действие с идентификатором запроса. При обрыве связи повторяется с тем же идентификатором —
   * сервер не выполнит его дважды и не спишет ресурсы повторно.
   */
  async action(type: string, params: Record<string, unknown> = {}) {
    const requestId = uuid();
    let lastErr: unknown;
    for (let i = 0; i < 4; i++) {
      try {
        return await request<{ message: string; replayed: boolean; state: GameState }>('action', {
          method: 'POST',
          body: JSON.stringify({ ...params, action: type, requestId }),
        });
      } catch (e) {
        if (!(e instanceof NetworkError)) throw e;
        lastErr = e;
        await sleep(800 * (i + 1));
      }
    }
    throw lastErr;
  },
};
