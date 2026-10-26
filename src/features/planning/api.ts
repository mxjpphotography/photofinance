import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CalendarEntry } from "../../lib/calendar";
import { supabase } from "../../lib/supabase";
import type { HourCheck, Job, JobQuote } from "../../lib/types";

/**
 * Data access for calendar and jobs. Prices and the monthly hour check are
 * calculated by database functions; this file only fetches and writes.
 */

const KEY = ["planning"] as const;

function check<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data as T;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

// Calendar ---------------------------------------------------------------------

const feedColumns = "id, kind, title, start_date, end_date, start_time, end_time, location, notes, job_id, equipment_id";

/** Everything that overlaps [from, to]: appointments, jobs and (later) blocks and rentals. */
export function useCalendar(from: string, to: string) {
  return useQuery({
    queryKey: [...KEY, "calendar", from, to],
    queryFn: async () =>
      check(
        await supabase
          .from("calendar_feed")
          .select(feedColumns)
          .lte("start_date", to)
          .gte("end_date", from)
          .order("start_date")
          .limit(1000),
      ) as CalendarEntry[],
  });
}

export interface AppointmentInput {
  title: string;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: KEY });
}

export function useCreateAppointment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: AppointmentInput) =>
      check(await supabase.from("calendar_events").insert({ ...input, kind: "appointment" })),
    onSuccess: invalidate,
  });
}

export function useUpdateAppointment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: AppointmentInput }) =>
      check(await supabase.from("calendar_events").update(input).eq("id", id).eq("kind", "appointment")),
    onSuccess: invalidate,
  });
}

export function useDeleteAppointment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) =>
      check(await supabase.from("calendar_events").delete().eq("id", id).eq("kind", "appointment")),
    onSuccess: invalidate,
  });
}

// Jobs -------------------------------------------------------------------------

const jobColumns =
  "id, name, client, start_date, start_time, end_date, end_time, shooting_hours, editing_hours, organisation_hours, travel_costs, other_costs, quoted_price, notes";

export function useJobs() {
  return useQuery({
    queryKey: [...KEY, "jobs"],
    queryFn: async () =>
      (check(await supabase.from("jobs").select(jobColumns).order("start_date", { ascending: false }).limit(500)) as Job[]).map(
        (j) => ({
          ...j,
          shooting_hours: Number(j.shooting_hours),
          editing_hours: Number(j.editing_hours),
          organisation_hours: Number(j.organisation_hours),
          travel_costs: Number(j.travel_costs),
          other_costs: Number(j.other_costs),
          quoted_price: num(j.quoted_price),
        }),
      ),
  });
}

export interface JobInput {
  name: string;
  client: string | null;
  start_date: string;
  start_time: string | null;
  end_date: string | null;
  end_time: string | null;
  shooting_hours: number;
  editing_hours: number;
  organisation_hours: number;
  /** strings with two decimals, e.g. "30.00" */
  travel_costs: string;
  other_costs: string;
  quoted_price: string | null;
  notes: string | null;
}

export function useCreateJob() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: JobInput) => check(await supabase.from("jobs").insert(input).select("id").single()) as { id: string },
    onSuccess: invalidate,
  });
}

export function useUpdateJob() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: JobInput }) =>
      check(await supabase.from("jobs").update(input).eq("id", id)),
    onSuccess: invalidate,
  });
}

export function useDeleteJob() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => check(await supabase.from("jobs").delete().eq("id", id)),
    onSuccess: invalidate,
  });
}

/** The database calculation for one saved job. */
export function useJobQuote(jobId: string | null) {
  return useQuery({
    queryKey: [...KEY, "quote", jobId],
    enabled: jobId !== null,
    queryFn: async () => {
      const rows = check(await supabase.rpc("calculate_job_quote", { p_job_id: jobId })) as Array<Record<string, unknown>>;
      const r = rows[0];
      if (!r) throw { code: "P0002", message: "job not found" };
      return {
        total_hours: Number(r.total_hours),
        planned_costs: Number(r.planned_costs),
        recommended_price: num(r.recommended_price),
        quoted_price: num(r.quoted_price),
        price_used: num(r.price_used),
        taxes_and_reserves: num(r.taxes_and_reserves),
        expected_profit: num(r.expected_profit),
        effective_hourly_rate: num(r.effective_hourly_rate),
        booked_income: Number(r.booked_income),
        missing_settings: (r.missing_settings as string[] | null) ?? [],
      } satisfies JobQuote;
    },
  });
}

export interface HourCheckInput {
  startDate: string;
  shooting: number;
  editing: number;
  organisation: number;
  /** the job being edited, so it is not counted twice */
  excludeJobId: string | null;
}

/** Hours already planned in the month of startDate plus the given ones, against the monthly limit. */
export function useHourCheck(input: HourCheckInput | null) {
  return useQuery({
    queryKey: [...KEY, "hours", input],
    enabled: input !== null,
    // The result depends on other jobs, so never show an old answer as fresh.
    staleTime: 0,
    queryFn: async () => {
      const i = input as HourCheckInput;
      const rows = check(
        await supabase.rpc("check_monthly_hours", {
          p_start_date: i.startDate,
          p_shooting: i.shooting,
          p_editing: i.editing,
          p_organisation: i.organisation,
          p_exclude_job: i.excludeJobId,
        }),
      ) as Array<Record<string, unknown>>;
      const r = rows[0];
      return {
        monthly_limit: num(r?.monthly_limit),
        planned_hours: Number(r?.planned_hours ?? 0),
        new_hours: Number(r?.new_hours ?? 0),
        total_hours: Number(r?.total_hours ?? 0),
        exceeds: Boolean(r?.exceeds),
      } satisfies HourCheck;
    },
  });
}
