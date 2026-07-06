/**
 * starterSetupSupabaseAdapter — Supabase-backed implementation of the
 * StarterSetupDataAccess adapter consumed by starterSetupService.
 *
 * Owner-scoped by RLS server-side; the user_id filter here is defensive
 * and mirrors the shape of every other authenticated read in the app.
 * Only grow/tent/plant tables are touched — no sensor_readings, no
 * diary_entries, no alerts, no action_queue, no AI Doctor session
 * writes, and no edge-function calls.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  STARTER_GROW_NAME,
  STARTER_PLANT_NAME,
  STARTER_TENT_NAME,
} from "@/lib/starterSetupRules";
import type { StarterSetupDataAccess } from "@/lib/starterSetupService";

export const starterSetupSupabaseAdapter: StarterSetupDataAccess = {
  async listOwnedGrows(userId) {
    const { data, error } = await supabase
      .from("grows")
      .select("id, name")
      .eq("user_id", userId)
      .eq("is_archived", false);
    if (error) throw error;
    return (data ?? []) as ReadonlyArray<{ id: string; name: string | null }>;
  },

  async listOwnedTents(userId, growId) {
    const { data, error } = await supabase
      .from("tents")
      .select("id, name")
      .eq("user_id", userId)
      .eq("grow_id", growId)
      .eq("is_archived", false);
    if (error) throw error;
    return (data ?? []) as ReadonlyArray<{ id: string; name: string | null }>;
  },

  async listOwnedPlants(userId, tentId) {
    const { data, error } = await supabase
      .from("plants")
      .select("id, name")
      .eq("user_id", userId)
      .eq("tent_id", tentId)
      .eq("is_archived", false);
    if (error) throw error;
    return (data ?? []) as ReadonlyArray<{ id: string; name: string | null }>;
  },

  async createStarterGrow(userId) {
    const { data, error } = await supabase
      .from("grows")
      .insert({
        user_id: userId,
        name: STARTER_GROW_NAME,
        grow_type: "tent",
        stage: "seedling",
      } as never)
      .select("id, name")
      .single();
    if (error) throw error;
    return data as { id: string; name: string | null };
  },

  async createStarterTent(userId, growId) {
    const { data, error } = await supabase
      .from("tents")
      .insert({
        user_id: userId,
        name: STARTER_TENT_NAME,
        grow_id: growId,
        stage: "seedling",
      } as never)
      .select("id, name")
      .single();
    if (error) throw error;
    return data as { id: string; name: string | null };
  },

  async createStarterPlant(userId, growId, tentId) {
    const { data, error } = await supabase
      .from("plants")
      .insert({
        user_id: userId,
        name: STARTER_PLANT_NAME,
        grow_id: growId,
        tent_id: tentId,
        stage: "seedling",
        health: "healthy",
      } as never)
      .select("id, name")
      .single();
    if (error) throw error;
    return data as { id: string; name: string | null };
  },
};
