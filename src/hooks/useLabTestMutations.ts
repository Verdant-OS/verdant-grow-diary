/**
 * useLabTestMutations — save / delete a grower's own lab test rows.
 *
 * RLS enforces ownership server-side (insert additionally requires the
 * referenced plant to belong to the caller). On success both mutations
 * prefix-invalidate the "lab_tests" query key so the panel refreshes
 * immediately. Payload validation happens in labResultsRules BEFORE these
 * are called — the hooks trust only an already-validated payload shape.
 *
 * Single table, plain insert/delete. No RPC, no AI, no device control.
 * `lab_tests` is not in generated types until the migration is applied,
 * hence the `as never` casts.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import type { LabTestPayload } from "@/lib/labResultsRules";

export function useSaveLabTest() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ plantId, payload }: { plantId: string; payload: LabTestPayload }) => {
      if (!user) throw new Error("not_authenticated");
      const { error } = await supabase.from("lab_tests" as never).insert({
        user_id: user.id,
        plant_id: plantId,
        ...payload,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lab_tests"] });
    },
  });
}

export function useDeleteLabTest() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ labTestId }: { labTestId: string }) => {
      if (!user) throw new Error("not_authenticated");
      const { error } = await supabase
        .from("lab_tests" as never)
        .delete()
        .eq("id", labTestId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lab_tests"] });
    },
  });
}
