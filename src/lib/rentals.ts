import type { RentalItem } from "./types";

export type ItemAction = "accept" | "decline" | "cancel";

/**
 * What the person may do with an item. Mirrors the database trigger (the
 * trigger is the real protection, this only decides which buttons to show):
 * the owner accepts or declines pending items, the requester withdraws pending
 * ones, and either side can cancel an accepted one.
 */
export function actionsFor(item: Pick<RentalItem, "status" | "owner_id" | "requester_id">, me: string): ItemAction[] {
  if (item.status === "pending") {
    if (me === item.owner_id) return ["accept", "decline"];
    if (me === item.requester_id) return ["cancel"];
  }
  if (item.status === "accepted" && (me === item.owner_id || me === item.requester_id)) return ["cancel"];
  return [];
}

/** A request must start today or later and end on or after its start (inclusive days, at most 365 apart). */
export function validRequestPeriod(start: string, end: string, today: string): boolean {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(start) || !iso.test(end)) return false;
  if (start < today || end < start) return false;
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
  return days <= 365;
}

/** Items of one request stay together; groups are ordered newest request first. */
export function groupByRequest<T extends { request_id: string; created_at: string }>(items: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(item.request_id);
    if (list) list.push(item);
    else groups.set(item.request_id, [item]);
  }
  return [...groups.values()].sort((a, b) => b[0].created_at.localeCompare(a[0].created_at));
}

/** Units the person may ask for: at most what is free, never below 1 for a listed item. */
export function maxUnits(offer: { quantity: number; available_units: number }, periodGiven: boolean): number {
  return Math.max(1, periodGiven ? offer.available_units : offer.quantity);
}
