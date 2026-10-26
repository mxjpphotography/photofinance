import { de } from "./de";

interface ErrorLike {
  code?: string;
  message?: string;
}

/**
 * Turns a database error into a German message. Codes are PostgreSQL SQLSTATEs
 * (they come through PostgREST unchanged). Unknown errors fall back to a
 * generic message; the original is logged for debugging.
 */
export function mapDbError(error: unknown): string {
  const { code, message = "" } = (error ?? {}) as ErrorLike;
  const e = de.common.errors;

  if (message.includes("schedule of a rule")) return e.scheduleLocked;
  if (code === "23503") return message.includes("transactions_rule_fk") ? e.ruleHasBookings : e.inUse;
  if (code === "23514" || code === "22023" || code === "22P02" || code === "22003") return e.invalid;
  if (code === "23P01") return e.capacity;
  if (code === "23505") return e.duplicate;
  if (code === "42501") return e.forbidden;
  if (code === "P0002") return e.notFound;

  if (error) console.error("Unmapped error", error);
  return de.common.error;
}
