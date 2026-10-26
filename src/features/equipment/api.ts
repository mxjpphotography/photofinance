import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import type { Equipment, EquipmentBlock, EquipmentCategory, EquipmentOverview, RentalListing } from "../../lib/types";

/** Data access for own equipment, blocks and the rental listing switch. */

const KEY = ["equipment"] as const;

function check<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data as T;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function useEquipmentCategories() {
  return useQuery({
    queryKey: [...KEY, "categories"],
    queryFn: async () =>
      check(await supabase.from("equipment_categories").select("id, name, is_active").order("sort_order")) as EquipmentCategory[],
  });
}

export function useEquipment() {
  return useQuery({
    queryKey: [...KEY, "list"],
    queryFn: async () =>
      (
        check(
          await supabase
            .from("equipment")
            .select("id, name, category_id, manufacturer, model, description, quantity, purchase_value, availability_status")
            .order("name")
            .limit(1000),
        ) as Equipment[]
      ).map((e) => ({ ...e, quantity: Number(e.quantity), purchase_value: num(e.purchase_value) })),
  });
}

export function useEquipmentOverview() {
  return useQuery({
    queryKey: [...KEY, "overview"],
    queryFn: async () => check(await supabase.rpc("equipment_overview")) as EquipmentOverview[],
  });
}

export function useListings() {
  return useQuery({
    queryKey: [...KEY, "listings"],
    queryFn: async () =>
      check(await supabase.from("rental_listings").select("id, equipment_id, is_active, public_note")) as RentalListing[],
  });
}

/** Blocks that have not ended yet. Past ones are history and not shown. */
export function useBlocks(today: string) {
  return useQuery({
    queryKey: [...KEY, "blocks", today],
    queryFn: async () =>
      check(
        await supabase
          .from("equipment_blocks")
          .select("id, equipment_id, units, start_date, end_date, reason")
          .gte("end_date", today)
          .order("start_date")
          .limit(1000),
      ) as EquipmentBlock[],
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  // The calendar feed shows blocks, so it has to refresh too.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: KEY }),
      queryClient.invalidateQueries({ queryKey: ["planning"] }),
    ]).then(() => undefined);
}

export interface EquipmentInput {
  name: string;
  category_id: string | null;
  manufacturer: string | null;
  model: string | null;
  description: string | null;
  quantity: number;
  /** string with two decimals or null */
  purchase_value: string | null;
  availability_status: "available" | "unavailable";
}

export interface SaveEquipmentArgs {
  id: string | null;
  input: EquipmentInput;
  offer: boolean;
  publicNote: string | null;
}

/** Creates or updates an item and then sets its rental listing, in that order. */
export function useSaveEquipment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, input, offer, publicNote }: SaveEquipmentArgs) => {
      let equipmentId = id;
      if (id) {
        check(await supabase.from("equipment").update(input).eq("id", id).select("id").single());
      } else {
        equipmentId = (check(await supabase.from("equipment").insert(input).select("id").single()) as { id: string }).id;
      }
      // Only touch the listing when there is something to say: offering, or an existing listing to switch off.
      const existing = check(await supabase.from("rental_listings").select("id").eq("equipment_id", equipmentId).maybeSingle()) as {
        id: string;
      } | null;
      if (offer || existing) {
        check(
          await supabase
            .from("rental_listings")
            .upsert({ equipment_id: equipmentId, is_active: offer, public_note: publicNote }, { onConflict: "equipment_id" })
            .select("id")
            .single(),
        );
      }
    },
    onSuccess: invalidate,
  });
}

export function useDeleteEquipment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => check(await supabase.from("equipment").delete().eq("id", id)),
    onSuccess: invalidate,
  });
}

export interface BlockInput {
  equipment_id: string;
  units: number;
  start_date: string;
  end_date: string;
  reason: string | null;
}

export function useCreateBlock() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: BlockInput) => check(await supabase.from("equipment_blocks").insert(input)),
    onSuccess: invalidate,
  });
}

export function useDeleteBlock() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => check(await supabase.from("equipment_blocks").delete().eq("id", id)),
    onSuccess: invalidate,
  });
}
