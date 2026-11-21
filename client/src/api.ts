import type { Cost, MissionType, Outcome, OperatorType, VehicleType, EquipmentType, Rarity, DailyKey, BuildingKey, Skills } from '../../shared/config';
import type { Casualties, Reason } from '../../shared/calc';
import type { Contract, Mods, SoldierTrait } from '../../shared/progression';
import type { DroneSlot } from '../../shared/content';

/* Типы состояния, приходящего с сервера (server/src/game/state.ts → view) */
export interface OpRow { available: number; on_mission: number; wounded: number; recovering: number; lost_total: number; trained: number; rank: number }
export interface Job { id: number; queue: 'build' | 'train' | 'workshop' | 'recovery' | 'research' | 'outpost'; kind: string; payload: any; startAt: number; endAt: number }
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
  kind?: 'expedition' | 'pvp_attack' | 'defense' | 'pvp_defense' | 'outpost';
  target?: { id: number; callsign: string } | null;
  soldiers?: { fallen: string[]; wounded: string[]; patched: string[]; levelUps: { name: string; level: number }[] };
  companyDamage?: number;
  won?: boolean; attack?: number; defense?: number; lost?: Cost; wounded?: string[]; reward?: Cost; attacker?: string; attackerId?: number; at?: number;
  sectorHit?: { id: number; name: string; before: number; after: number } | null;
  // глубина
  broken?: string[];
  campaign?: { title: string; chapter: number };
  blueprint?: string;
  encounter?: { key: string; resolved: boolean; option?: number; result?: string; gains?: string[] };
  sectorName_?: string;
  before?: number; after?: number;
}
export interface Soldier {
  id: number; type: OperatorType; name: string; trait: SoldierTrait; xp: number; level: number; missions: number; scars: number;
  status: 'ready' | 'mission' | 'wounded' | 'recovering' | 'lost'; expedition_id: number | null; created_at: number; lost_at: number | null;
  spec: string | null; fatigue: number; fatigue_at: number | null; bonds: Record<string, number>; instructor: boolean;
}
export interface LeaderRow { rank: number; id: number; callsign: string; portrait: number; chevron: string; level: number; points: number; tag: string | null }
export interface CompanyListItem { id: number; name: string; tag: string; motto: string; members: number }
export interface CompanyOp { week: string; hp: number; damage: number; defeated: boolean; claimed: boolean }
export interface CompanyDetail {
  id: number; name: string; tag: string; motto: string; storage: Record<'supplies' | 'parts' | 'fuel' | 'data', number>; myRole: 'leader' | 'member' | null; myId: number; limit: number;
  members: { id: number; role: string; callsign: string; portrait: number; chevron: string; level: number; weekPoints: number; build: { jobId: number; endAt: number; helps: number; helpedByMe: boolean } | null }[];
  log: { at: number; text: string }[]; op: CompanyOp | null; prevOp: CompanyOp | null; opHpPreview: number;
}
export interface PvpTarget { id: number; callsign: string; portrait: number; chevron: string; level: number; protectedReason: string | null }
export interface PlayerListItem { id: number; callsign: string; commanderName: string; portrait: number; chevron: string; level: number; xp: number; chevrons: number }
export interface PublicProfile {
  id: number; me: boolean; callsign: string; commanderName: string; portrait: number; chevron: string; level: number; xp: number; since: number;
  chevrons: { key: string; source: string; at: number }[];
  awards: { award: string; count: number; at: number }[];
  stats: { expeditionsSent: number; expeditionsWon: number; flawless: number; buildsDone: number; controlled: number };
  achPoints?: number;
  models?: { cls: OperatorType; name: string; color: string }[];
  mascots?: string[];
}
export interface Equipment { id: number; type: EquipmentType; rarity: Rarity; level: number; status: 'ready' | 'mission'; source: string; durability: number }
export interface SectorState { id: number; recon: number; control: number; attempts: number; successes: number; unlocked: boolean; lockReason: string; control_at?: number | null }
export interface GameState {
  serverTime: number;
  player: { callsign: string; commanderName: string; portrait: number; chevron: string };
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
  awards: { id: number; award: string; count: number; reason: string; at: number }[];
  newAwards: { award: string; count: number; reason: string }[];
  chevrons: { key: string; source: string; at: number }[];
  newChevrons: string[];
  research: string[];
  soldiers: Soldier[];
  weekly: { week: string; counters: Record<string, number>; claimed: Record<string, boolean> };
  contracts: Contract[];
  week: { index: number; points: number; endsAt: number };
  season: { index: number; points: number; counters: Record<string, number>; endsAt: number; theme: string };
  streak: { streak: number; claimedToday: boolean; reward: Cost };
  modParts: { label: string; mods: Partial<Mods> }[];
  prestige: number;
  companyId: number | null;
  siteLinked: boolean;
  linkCode: { code: string; until: number } | null;
  defense: number;
  createdAt: number;
  reports: Report[];
  unreadReports: number;
  // глубина и сюжет
  blueprints: string[];
  models: DroneModel[];
  outposts: { id: number; sector_id: number; level: number; checked_at: number }[];
  campaign: { step: number; flags: Record<string, string> };
  event: { key: string; active: boolean; start: number; end: number; nextStart: number; week: number; points: number; claimed: Record<string, number> };
  achievements: { key: string; value: number; tier: number }[];
  achPoints: number;
  mascots: string[];
  instructorsReady: number;
}
export interface DroneModel { cls: OperatorType; name: string; color: string; parts: Record<DroneSlot, string>; durability: number; built_at: number }

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
  players: (q: string) => request<{ me: number; players: PlayerListItem[] }>(`players?q=${encodeURIComponent(q)}`),
  player: (id: number) => request<PublicProfile>(`players/${id}`),
  leaderboard: (period: 'week' | 'season' | 'all') => request<{ period: string; me: number; myRank: number | null; myPoints: number; rows: LeaderRow[] }>(`leaderboard?period=${period}`),
  companies: (q: string) => request<{ companies: CompanyListItem[]; limit: number; cost: Cost }>(`companies?q=${encodeURIComponent(q)}`),
  company: (id: number) => request<CompanyDetail>(`companies/${id}`),
  pvpTargets: () => request<{ minLevel: number; myLevel: number; targets: PvpTarget[] }>('pvp/targets'),
  /**
   * Игровое действие с идентификатором запроса. При обрыве связи повторяется с тем же идентификатором —
   * сервер не выполнит его дважды и не спишет ресурсы повторно.
   */
  async action(type: string, params: Record<string, unknown> = {}) {
    const requestId = uuid();
    let lastErr: unknown;
    for (let i = 0; i < 4; i++) {
      try {
        return await request<{ message: string; data: any; replayed: boolean; state: GameState }>('action', {
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
