import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type {
  CategoryTotal,
  FinanceCategory,
  ForecastRow,
  IntervalUnit,
  MonthlyBalanceRow,
  RecurrenceRule,
  Transaction,
  UserSettings,
} from "../../lib/types";

/**
 * Data access for finance. All calculations (budget, monthly balances,
 * category totals, forecasts, recurring generation) run in the database; this
 * file only fetches and writes.
 */

const KEY = ["finance"] as const;

const transactionColumns =
  "id, label, amount, category_id, booked_on, recurrence_rule_id, occurrence_date, kind, job_id";

function check<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data as T;
}

// Reads ------------------------------------------------------------------------

export function useCategories() {
  return useQuery({
    queryKey: [...KEY, "categories"],
    staleTime: 5 * 60_000,
    queryFn: async () =>
      check(
        await supabase.from("finance_categories").select("*").order("sort_order").order("name"),
      ) as FinanceCategory[],
  });
}

export function useBudgetTotal() {
  return useQuery({
    queryKey: [...KEY, "budget"],
    queryFn: async () => Number(check(await supabase.rpc("budget_total"))),
  });
}

export function useMonthlyBalance(months: number) {
  return useQuery({
    queryKey: [...KEY, "monthly", months],
    queryFn: async () =>
      (check(await supabase.rpc("monthly_balance", { p_months: months })) as MonthlyBalanceRow[]).map((r) => ({
        month: r.month,
        income: Number(r.income),
        expense: Number(r.expense),
        balance: Number(r.balance),
        income_recurring: Number(r.income_recurring),
        income_one_time: Number(r.income_one_time),
        expense_recurring: Number(r.expense_recurring),
        expense_one_time: Number(r.expense_one_time),
      })),
  });
}

export function useCategoryTotals(from: string, to: string) {
  return useQuery({
    queryKey: [...KEY, "category-totals", from, to],
    queryFn: async () =>
      (check(await supabase.rpc("category_totals", { p_from: from, p_to: to })) as CategoryTotal[]).map((r) => ({
        ...r,
        total: Number(r.total),
        recurring_total: Number(r.recurring_total),
        booking_count: Number(r.booking_count),
      })),
  });
}

export interface TransactionFilters {
  from?: string;
  to?: string;
  /** a category id, or "none" for bookings without a category */
  categoryId?: string;
  kind?: "income" | "expense";
  recurrence?: "one_time" | "recurring";
  includeFuture: boolean;
  today: string;
}

export const TRANSACTION_LIMIT = 500;

export function useTransactions(filters: TransactionFilters) {
  return useQuery({
    queryKey: [...KEY, "transactions", filters],
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select(transactionColumns)
        .order("booked_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(TRANSACTION_LIMIT);

      if (filters.from) query = query.gte("booked_on", filters.from);
      if (filters.to) query = query.lte("booked_on", filters.to);
      // The budget only counts bookings that are due, so the list does the same by default.
      if (!filters.includeFuture) query = query.lte("booked_on", filters.today);
      if (filters.categoryId === "none") query = query.is("category_id", null);
      else if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
      if (filters.kind) query = query.eq("kind", filters.kind);
      if (filters.recurrence === "one_time") query = query.is("recurrence_rule_id", null);
      if (filters.recurrence === "recurring") query = query.not("recurrence_rule_id", "is", null);

      return (check(await query) as Transaction[]).map((t) => ({ ...t, amount: Number(t.amount) }));
    },
  });
}

export function useRules() {
  return useQuery({
    queryKey: [...KEY, "rules"],
    queryFn: async () =>
      (
        check(
          await supabase
            .from("recurrence_rules")
            .select("*")
            .order("is_active", { ascending: false })
            .order("created_at", { ascending: false }),
        ) as RecurrenceRule[]
      ).map((r) => ({ ...r, amount: Number(r.amount) })),
  });
}

export function useForecast(until: string) {
  return useQuery({
    queryKey: [...KEY, "forecast", until],
    queryFn: async () =>
      (check(await supabase.rpc("forecast_recurring", { p_until: until })) as ForecastRow[]).map((r) => ({
        ...r,
        amount: Number(r.amount),
      })),
  });
}

export function useUserSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const row = check(await supabase.from("user_settings").select("*").maybeSingle()) as UserSettings | null;
      if (!row) return null;
      const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      return {
        ...row,
        target_hourly_rate: num(row.target_hourly_rate),
        billable_hours_per_month: num(row.billable_hours_per_month),
        tax_rate: num(row.tax_rate),
        reserve_rate: num(row.reserve_rate),
      } satisfies UserSettings;
    },
  });
}

// Writes -----------------------------------------------------------------------

function useInvalidate() {
  const queryClient = useQueryClient();
  // Bookings can be linked to jobs, whose calculation shows the booked income.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: KEY }),
      queryClient.invalidateQueries({ queryKey: ["planning"] }),
    ]).then(() => undefined);
}

export interface TransactionInput {
  label: string;
  /** string with exactly two decimals, e.g. "-49.90" */
  amount: string;
  category_id: string | null;
  booked_on: string;
  /** optional link to a job, so booked income can be compared with the quote */
  job_id?: string | null;
}

export function useCreateTransaction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (values: TransactionInput) => {
      check(await supabase.from("transactions").insert(values).select("id").single());
    },
    onSuccess: invalidate,
  });
}

export function useUpdateTransaction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: TransactionInput }) => {
      check(await supabase.from("transactions").update(values).eq("id", id).select("id").single());
    },
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await supabase.from("transactions").delete().eq("id", id);
      if (result.error) throw result.error;
    },
    onSuccess: invalidate,
  });
}

export interface RuleInput {
  label: string;
  amount: string;
  category_id: string | null;
  interval_unit: IntervalUnit;
  interval_count: number;
  start_date: string;
  end_date: string | null;
}

/** Creates a rule and immediately materialises everything that is already due. */
export function useCreateRule() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (values: RuleInput) => {
      check(await supabase.from("recurrence_rules").insert(values).select("id").single());
      const generated = await supabase.rpc("generate_due_transactions");
      if (generated.error) throw generated.error;
    },
    onSuccess: invalidate,
  });
}

export interface RuleEdit {
  label: string;
  amount: string;
  category_id: string | null;
  end_date: string | null;
}

export function useUpdateRule() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: RuleEdit | { is_active: boolean } }) => {
      check(await supabase.from("recurrence_rules").update(values).eq("id", id).select("id").single());
    },
    onSuccess: invalidate,
  });
}

export function useDeleteRule() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await supabase.from("recurrence_rules").delete().eq("id", id);
      if (result.error) throw result.error;
    },
    onSuccess: invalidate,
  });
}

/** Called once after sign-in: books everything that became due since the last visit. */
export function useGenerateDueOnStart() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async () => {
      const result = await supabase.rpc("generate_due_transactions");
      if (result.error) throw result.error;
      return Number(result.data);
    },
    onSuccess: (created) => {
      if (created > 0) void invalidate();
    },
  });
}

export function useUpdateSettings(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: Partial<Omit<UserSettings, "user_id" | "timezone">>) => {
      check(await supabase.from("user_settings").update(values).eq("user_id", userId).select("user_id").single());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });
}
