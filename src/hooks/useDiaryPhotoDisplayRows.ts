/**
 * useDiaryPhotoDisplayRows — convert owned private diary photo references to
 * short-lived display URLs without persisting or exposing storage paths.
 *
 * The caller still owns its diary query. This hook only projects copies of
 * those rows for an image presenter; it never writes a diary row or storage
 * object. Paths are accepted for signing only after the pure owner guard in
 * `diaryPhotoDisplayRules` succeeds.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import {
  DIARY_PHOTO_BUCKET,
  parseDiaryPhotoDisplayReferenceFromRow,
  type DiaryPhotoReferenceRowLike,
} from "@/lib/diaryPhotoDisplayRules";

const SIGNED_URL_TTL_SECONDS = 30 * 60;
const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;

export type DiaryPhotoDisplayRow = DiaryPhotoReferenceRowLike & Record<string, unknown>;

export interface UseDiaryPhotoDisplayRowsResult {
  /** Copies of the supplied rows with only safe http(s) photo URLs exposed. */
  rows: DiaryPhotoDisplayRow[];
  /** True while owned private paths are being exchanged for display URLs. */
  isResolvingPrivatePhotos: boolean;
  /** A private-photo signing request failed; external photos may still render. */
  hasPrivatePhotoError: boolean;
  /** At least one supported persisted photo reference exists, even if it is loading. */
  hasPhotoReference: boolean;
}

export function useDiaryPhotoDisplayRows(
  rawRows: ReadonlyArray<DiaryPhotoDisplayRow> | null | undefined,
): UseDiaryPhotoDisplayRowsResult {
  const { user } = useAuth();
  const viewerUserId = user?.id ?? null;
  const rows = useMemo(() => rawRows ?? [], [rawRows]);

  const parsedRows = useMemo(
    () =>
      rows.map((row) => ({
        row,
        reference: parseDiaryPhotoDisplayReferenceFromRow(row, {
          viewerUserId,
        }),
      })),
    [rows, viewerUserId],
  );

  const storagePaths = useMemo(() => {
    const paths = new Set<string>();
    for (const { reference } of parsedRows) {
      if (reference.kind === "storage") paths.add(reference.path);
    }
    return Array.from(paths).sort();
  }, [parsedRows]);

  const signedQuery = useQuery({
    enabled: storagePaths.length > 0,
    queryKey: ["diary-photo-display-url", DIARY_PHOTO_BUCKET, viewerUserId, storagePaths],
    staleTime: SIGNED_URL_TTL_SECONDS * 1000 - REFRESH_BEFORE_EXPIRY_MS,
    gcTime: SIGNED_URL_TTL_SECONDS * 1000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(DIARY_PHOTO_BUCKET)
        .createSignedUrls(storagePaths, SIGNED_URL_TTL_SECONDS);
      if (error) throw new Error("diary-photo-display-url-failed");

      const signedByPath = new Map<string, string>();
      for (const signed of data ?? []) {
        if (
          typeof signed.path === "string" &&
          typeof signed.signedUrl === "string" &&
          signed.signedUrl.length > 0
        ) {
          signedByPath.set(signed.path, signed.signedUrl);
        }
      }
      return signedByPath;
    },
  });

  const rowsForDisplay = useMemo(() => {
    const signedByPath = signedQuery.data ?? new Map<string, string>();
    return parsedRows.map(({ row, reference }) => {
      if (reference.kind === "external") {
        return { ...row, photo_url: reference.url };
      }
      if (reference.kind === "storage") {
        return { ...row, photo_url: signedByPath.get(reference.path) ?? null };
      }
      // Never pass an unvalidated private path or an unsupported protocol to
      // the generic diary normalizer / image presenter.
      return { ...row, photo_url: null };
    });
  }, [parsedRows, signedQuery.data]);

  return {
    rows: rowsForDisplay,
    isResolvingPrivatePhotos:
      storagePaths.length > 0 && (signedQuery.isLoading || signedQuery.isFetching),
    hasPrivatePhotoError: storagePaths.length > 0 && signedQuery.isError,
    hasPhotoReference: parsedRows.some(
      ({ reference }) => reference.kind === "external" || reference.kind === "storage",
    ),
  };
}
