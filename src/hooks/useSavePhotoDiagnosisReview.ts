/**
 * useSavePhotoDiagnosisReview — append one grower-authored review note for
 * an existing photo diary entry.
 *
 * The source photo is never changed. This hook writes one new, typed
 * `diary_entries` row, lets database auth own `user_id`, and refreshes the
 * existing plant-memory reads. It never invokes AI, queues an action, or
 * touches a device.
 */
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  buildPhotoDiagnosisDiaryDraft,
  type PhotoDiagnosisPhotoInput,
  type PhotoDiagnosisReviewStatus,
} from "@/lib/photoDiagnosisNoteRules";
import { applyQuickLogV2Refresh } from "@/lib/quickLogV2RefreshRules";

export interface SavePhotoDiagnosisReviewInput {
  photo: PhotoDiagnosisPhotoInput;
  observation: string;
  reviewStatus: PhotoDiagnosisReviewStatus;
  /** Test seam; production callers omit this and use the current instant. */
  recordedAt?: string;
}

export interface SavePhotoDiagnosisReviewResult {
  ok: boolean;
  reason?: string;
}

export interface UseSavePhotoDiagnosisReviewOptions {
  /** Injectable clock keeps the diary timestamp deterministic in tests. */
  now?: () => Date;
}

export function useSavePhotoDiagnosisReview(options: UseSavePhotoDiagnosisReviewOptions = {}) {
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const now = options.now;

  const save = useCallback(
    async (input: SavePhotoDiagnosisReviewInput): Promise<SavePhotoDiagnosisReviewResult> => {
      const built = buildPhotoDiagnosisDiaryDraft(input.photo, {
        observation: input.observation,
        review_status: input.reviewStatus,
        recorded_at: input.recordedAt ?? (now ? now() : new Date()).toISOString(),
      });

      if (built.ok === false) {
        return { ok: false, reason: built.reason };
      }

      setIsSaving(true);
      try {
        const { draft } = built;
        const { error } = await supabase.from("diary_entries").insert({
          grow_id: draft.grow_id,
          plant_id: draft.plant_id,
          tent_id: draft.tent_id,
          note: draft.note,
          entry_at: draft.details.recorded_at,
          details: draft.details as unknown as Json,
        });

        if (error) {
          toast.error("Could not save your grower review", {
            description: "Please try again.",
          });
          return { ok: false, reason: "insert_failed" };
        }

        const plantId = draft.plant_id;
        if (plantId) {
          applyQuickLogV2Refresh(queryClient, {
            targetType: "plant",
            targetId: plantId,
            tentId: draft.tent_id,
          });
        } else {
          queryClient.invalidateQueries({ queryKey: ["diary_entries"] });
          queryClient.invalidateQueries({ queryKey: ["timeline"] });
        }

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("verdant:entry-created", {
              detail: {
                plantId: draft.plant_id,
                createdAt: draft.details.recorded_at,
              },
            }),
          );
        }
        toast.success("Grower review saved to plant memory.");
        return { ok: true };
      } catch {
        toast.error("Could not save your grower review", {
          description: "Please try again.",
        });
        return { ok: false, reason: "unexpected_error" };
      } finally {
        setIsSaving(false);
      }
    },
    [now, queryClient],
  );

  return { save, isSaving };
}
