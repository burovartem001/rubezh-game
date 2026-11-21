/**
 * Общий для сервера и клиента расчёт бонусов похода от моделей дронов, передовых пунктов,
 * события выходных и ночного задания кампании — чтобы прогноз в интерфейсе совпадал с сервером.
 */
import { OperatorType, sectorById } from './config.js';
import { BUILDING_FX, DroneSlot, INSTRUCTOR_BONUS, MAX_INSTRUCTORS, OUTPOST, WORKSHOP_DISCOUNT, eventWindow, modelsBonus, repairDiscount } from './content.js';
import { EPOCH, Mods } from './progression.js';

export interface ModelLite { cls: OperatorType; name: string; parts: Record<DroneSlot, string>; durability: number }
export interface OutpostLite { id: number; sector_id: number; level: number; removed?: boolean }

export function bestOutpostFor<T extends OutpostLite>(outposts: T[], sectorId: number): T | null {
  if (!sectorId) return null;
  let best: T | null = null;
  for (const o of outposts) {
    if (o.removed || o.level <= 0) continue;
    const s = sectorById(o.sector_id);
    if (!s) continue;
    if ((o.sector_id === sectorId || s.links.includes(sectorId)) && (!best || o.level > best.level)) best = o;
  }
  return best;
}

export function deepParts(
  d: { models: ModelLite[]; outposts: OutpostLite[]; testrange: number },
  sectorId: number,
  group: Partial<Record<OperatorType, number>>,
  now: number,
  night: boolean,
): { label: string; mods: Partial<Mods> }[] {
  const parts: { label: string; mods: Partial<Mods> }[] = [];
  const mb = modelsBonus(d.models, group, d.testrange);
  if (mb.names.length) parts.push({ label: `Модели дронов ${mb.names.join(', ')}`, mods: mb.mods });
  const op = bestOutpostFor(d.outposts, sectorId);
  if (op) parts.push({ label: `Передовой пункт у «${sectorById(op.sector_id)?.name}»`, mods: { time: OUTPOST.timeCut(op.level), fuel: OUTPOST.fuelCut(op.level) } });
  const ev = eventWindow(now, EPOCH);
  if (ev.active && Object.keys(ev.event.mods).length) parts.push({ label: `Событие «${ev.event.name}»`, mods: ev.event.mods });
  if (night) parts.push({ label: 'Ночное задание', mods: { power: 0.08, recon: -0.1 } });
  return parts;
}

/* ── стоимость ремонта и скидки (одна формула для сервера и интерфейса) ── */

export function costScale(c: Partial<Record<string, number>>, k: number): Record<string, number> {
  const o: Record<string, number> = {};
  for (const [r, v] of Object.entries(c)) if (v) o[r] = Math.max(1, Math.round(v * k));
  return o;
}
export function workshopMulAt(now: number): number {
  const ev = eventWindow(now, EPOCH);
  return ev.active && ev.event.key === 'workshop' ? 1 - WORKSHOP_DISCOUNT : 1;
}
export function repairMul(repairyard: number, now: number): number {
  return (1 - repairDiscount(repairyard)) * workshopMulAt(now);
}
export function vehicleUpgradeMul(motorpool: number): number {
  return 1 - Math.min(0.5, BUILDING_FX.motorpool.upgradeDiscount * motorpool);
}
export function equipRepairCostOf(rarity: string, durability: number, repairyard: number, now: number) {
  const r = ({ common: 1, improved: 1.5, rare: 2.2, award: 2 } as Record<string, number>)[rarity] ?? 1;
  return costScale({ parts: Math.ceil((100 - durability) * 1.5 * r) }, repairMul(repairyard, now));
}
export function modelRepairCostOf(durability: number, repairyard: number, now: number) {
  return costScale({ parts: Math.ceil((100 - durability) * 3) }, repairMul(repairyard, now));
}

/** Ускорение подготовки от инструкторов (только живые и свободные бойцы). */
export function instructorMulOf(soldiers: { instructor?: boolean; status: string }[]): number {
  const n = Math.min(MAX_INSTRUCTORS, soldiers.filter((s) => s.instructor && s.status === 'ready').length);
  return 1 - INSTRUCTOR_BONUS * n;
}
/** Множитель цены и времени восстановления раненых от модификатора recovery. */
export function recoveryMulOf(recovery: number): number {
  return 1 - Math.min(0.7, Math.max(-0.5, recovery));
}
