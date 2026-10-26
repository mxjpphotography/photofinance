import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { RentalItem, RentalOffer, RentalRequest, RentalStatus } from "../../lib/types";

/** Data access for the rental platform. Availability and permissions are decided by the database. */

const KEY = ["rentals"] as const;

function check<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data as T;
}

export interface OfferFilters {
  query: string;
  categoryId: string;
  start: string;
  end: string;
  onlyAvailable: boolean;
}

/** Other members' offers. Dates are sent only as a complete pair. */
export function useOffers(filters: OfferFilters, enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "offers", filters],
    enabled,
    // Availability changes when others decide, so never trust an old answer.
    staleTime: 0,
    queryFn: async () => {
      const rows = check(
        await supabase.rpc("search_rental_offers", {
          p_query: filters.query.trim() === "" ? null : filters.query.trim(),
          p_category_id: filters.categoryId === "" ? null : filters.categoryId,
          p_start: filters.start === "" ? null : filters.start,
          p_end: filters.end === "" ? null : filters.end,
          p_only_available: filters.onlyAvailable,
        }),
      ) as RentalOffer[];
      return rows.map((r) => ({ ...r, quantity: Number(r.quantity), available_units: Number(r.available_units) }));
    },
  });
}

const itemColumns =
  "id, request_id, requester_id, owner_id, equipment_id, equipment_name, units, start_date, end_date, status, decision_note, created_at";

/** All items the person is involved in, as requester or as owner (RLS decides). */
export function useRentalItems() {
  return useQuery({
    queryKey: [...KEY, "items"],
    staleTime: 0,
    queryFn: async () =>
      (
        check(
          await supabase.from("rental_request_items").select(itemColumns).order("created_at", { ascending: false }).limit(500),
        ) as RentalItem[]
      ).map((i) => ({ ...i, units: Number(i.units) })),
  });
}

export function useRentalRequests() {
  return useQuery({
    queryKey: [...KEY, "requests"],
    staleTime: 0,
    queryFn: async () => check(await supabase.from("rental_requests").select("id, purpose").limit(500)) as RentalRequest[],
  });
}

/** Display names of the people in a list of items (visible because of the rental relationship). */
export function usePersonNames(ids: string[]) {
  const unique = [...new Set(ids)].sort();
  return useQuery({
    queryKey: [...KEY, "names", unique],
    enabled: unique.length > 0,
    queryFn: async () => {
      const rows = check(await supabase.from("profiles").select("id, full_name").in("id", unique)) as Array<{
        id: string;
        full_name: string;
      }>;
      return new Map(rows.map((r) => [r.id, r.full_name]));
    },
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  // Accepted items change equipment availability and show up in the calendar.
  return () =>
    Promise.all(
      [KEY, ["equipment"], ["planning"]].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    ).then(() => undefined);
}

export interface CreateRequestInput {
  items: Array<{ equipment_id: string; units: number }>;
  start: string;
  end: string;
  purpose: string;
}

export function useCreateRequest() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: CreateRequestInput) =>
      check(
        await supabase.rpc("create_rental_request", {
          p_items: input.items,
          p_start: input.start,
          p_end: input.end,
          p_purpose: input.purpose,
        }),
      ),
    onSuccess: invalidate,
  });
}

export interface DecideInput {
  id: string;
  status: Exclude<RentalStatus, "pending">;
  /** only the owner may write a note; leave undefined otherwise */
  note?: string | null;
}

export function useDecideItem() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, status, note }: DecideInput) => {
      const values: { status: string; decision_note?: string | null } = { status };
      if (note !== undefined) values.decision_note = note;
      check(await supabase.from("rental_request_items").update(values).eq("id", id).select("id").single());
    },
    onSuccess: invalidate,
  });
}
