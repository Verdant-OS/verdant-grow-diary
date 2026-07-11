/**
 * usePlantProfilePhotoSource — resolves a persisted plant profile
 * photo value into a display URL for `<img>`.
 *
 *  - `storage://diary-photos/<owner>/…` values are exchanged for a
 *    short-lived signed URL against the private bucket. Cached via
 *    React Query; refreshed before expiry.
 *  - Legacy http(s), data:, and local blob: previews pass through
 *    unchanged — no storage request is made.
 *  - Invalid or wrong-owner references resolve to `null` so the
 *    presenter falls back to the standard placeholder.
 *
 * Never persists the signed URL, never logs it, never surfaces raw
 * provider errors.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import {
  parsePlantProfilePhotoReference,
  PLANT_PROFILE_PHOTO_BUCKET,
} from "@/lib/plantProfilePhotoStorageRules";

const SIGNED_URL_TTL_SECONDS = 60 * 30; // 30 minutes
const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export interface PlantProfilePhotoSource {
  /** Ready-to-render display URL, or null when the placeholder should show. */
  displayUrl: string | null;
  isLoading: boolean;
  isError: boolean;
}

export function usePlantProfilePhotoSource(
  raw: string | null | undefined,
): PlantProfilePhotoSource {
  const { user } = useAuth();
  const viewerId = user?.id ?? null;
  const ref = parsePlantProfilePhotoReference(raw, { viewerUserId: viewerId });

  const enabled = ref.kind === "storage";
  const path = ref.kind === "storage" ? ref.path : null;

  const query = useQuery({
    enabled,
    queryKey: [
      "plant-profile-photo-signed-url",
      PLANT_PROFILE_PHOTO_BUCKET,
      path,
    ],
    staleTime: SIGNED_URL_TTL_SECONDS * 1000 - REFRESH_BEFORE_EXPIRY_MS,
    gcTime: SIGNED_URL_TTL_SECONDS * 1000,
    retry: 1,
    queryFn: async () => {
      if (!path) return null;
      const { data, error } = await supabase.storage
        .from(PLANT_PROFILE_PHOTO_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) {
        // Sanitized failure — placeholder rendered by caller.
        throw new Error("plant-profile-photo-signed-url-failed");
      }
      return data.signedUrl;
    },
  });

  switch (ref.kind) {
    case "clear":
    case "invalid":
      return { displayUrl: null, isLoading: false, isError: false };
    case "external":
    case "data":
    case "preview":
      return { displayUrl: ref.url, isLoading: false, isError: false };
    case "storage":
      return {
        displayUrl: query.data ?? null,
        isLoading: query.isLoading,
        isError: query.isError,
      };
  }
}
