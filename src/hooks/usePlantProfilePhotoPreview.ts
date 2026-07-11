/**
 * usePlantProfilePhotoPreview — lifecycle hook for the local preview
 * of a plant-profile-photo File the grower has just selected.
 *
 * Responsibilities:
 *  - Create an object URL for the File.
 *  - For HEIC/HEIF, probe browser decode via HTMLImageElement.decode()
 *    (with onload/onerror fallback) and fall back to an accessible
 *    "photo selected" state when the browser cannot render it.
 *  - Protect against stale async results when the grower selects a
 *    new file before the previous decode resolves.
 *  - Revoke object URLs on replace / remove / unmount / fallback.
 *
 * The hook NEVER uploads, converts, resizes, renames, or mutates the
 * File — the original File is preserved for the Save handler.
 */
import { useEffect, useRef, useState } from "react";
import {
  plantProfilePhotoRequiresDecodeProbe,
  type PlantProfilePhotoPreviewState,
} from "@/lib/plantProfilePhotoPreviewRules";

/** Test seam: probe whether the browser can decode this object URL. */
export type PlantProfilePhotoDecodeProbe = (
  objectUrl: string,
  mimeType: string,
) => Promise<boolean>;

const defaultDecodeProbe: PlantProfilePhotoDecodeProbe = (objectUrl) =>
  new Promise((resolve) => {
    if (typeof Image === "undefined") {
      resolve(false);
      return;
    }
    const img = new Image();
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    img.onload = () => {
      if (typeof img.decode === "function") {
        img.decode().then(() => done(true)).catch(() => done(false));
      } else {
        done(true);
      }
    };
    img.onerror = () => done(false);
    try {
      img.src = objectUrl;
    } catch {
      done(false);
    }
  });

export interface UsePlantProfilePhotoPreviewOptions {
  /** Test seam: injected object-URL factory. */
  createObjectURL?: (blob: Blob) => string;
  /** Test seam: injected revoker. */
  revokeObjectURL?: (url: string) => void;
  /** Test seam: injected decode probe. */
  decodeProbe?: PlantProfilePhotoDecodeProbe;
}

interface UsePlantProfilePhotoPreviewInput {
  file: File | null;
  mimeType: string | null;
}

export interface UsePlantProfilePhotoPreviewResult {
  preview: PlantProfilePhotoPreviewState;
}

export function usePlantProfilePhotoPreview(
  input: UsePlantProfilePhotoPreviewInput,
  options: UsePlantProfilePhotoPreviewOptions = {},
): UsePlantProfilePhotoPreviewResult {
  const create =
    options.createObjectURL ??
    ((b: Blob) => URL.createObjectURL(b));
  const revoke =
    options.revokeObjectURL ?? ((u: string) => URL.revokeObjectURL(u));
  const probe = options.decodeProbe ?? defaultDecodeProbe;

  const [preview, setPreview] = useState<PlantProfilePhotoPreviewState>({
    status: "none",
  });

  // Track the currently-live object URL so we can revoke exactly once.
  const activeUrlRef = useRef<string | null>(null);
  const generationRef = useRef(0);

  const revokeActive = () => {
    const url = activeUrlRef.current;
    if (url) {
      try {
        revoke(url);
      } catch {
        /* idempotent */
      }
      activeUrlRef.current = null;
    }
  };

  useEffect(() => {
    // Bump generation on every input change so stale probes are ignored.
    generationRef.current += 1;
    const myGeneration = generationRef.current;

    // Revoke previous object URL before starting a new preview.
    revokeActive();

    const file = input.file;
    const mime = input.mimeType;
    if (!file || !mime) {
      setPreview({ status: "none" });
      return () => {
        // On unmount / next change, revoke whatever is active.
        if (generationRef.current === myGeneration) revokeActive();
      };
    }

    let objectUrl: string;
    try {
      objectUrl = create(file);
    } catch {
      setPreview({
        status: "fallback",
        fileName: file.name,
        mimeType: mime,
        reason: "preview_error",
      });
      return () => {
        if (generationRef.current === myGeneration) revokeActive();
      };
    }
    activeUrlRef.current = objectUrl;

    const needsProbe = plantProfilePhotoRequiresDecodeProbe(mime);

    if (!needsProbe) {
      setPreview({
        status: "image",
        fileName: file.name,
        mimeType: mime,
        objectUrl,
      });
    } else {
      setPreview({
        status: "loading",
        fileName: file.name,
        mimeType: mime,
      });
      probe(objectUrl, mime)
        .then((ok) => {
          // Stale-result guard: ignore if a newer selection took over.
          if (generationRef.current !== myGeneration) return;
          if (ok) {
            setPreview({
              status: "image",
              fileName: file.name,
              mimeType: mime,
              objectUrl,
            });
          } else {
            // Revoke the URL we created for the fallback path.
            revokeActive();
            setPreview({
              status: "fallback",
              fileName: file.name,
              mimeType: mime,
              reason: "browser_decode_unsupported",
            });
          }
        })
        .catch(() => {
          if (generationRef.current !== myGeneration) return;
          revokeActive();
          setPreview({
            status: "fallback",
            fileName: file.name,
            mimeType: mime,
            reason: "preview_error",
          });
        });
    }

    return () => {
      // Only revoke if this effect owns the still-active URL. Newer
      // effect runs bump generation, revoke, and set a new URL.
      if (generationRef.current === myGeneration) {
        revokeActive();
      }
    };
    // We intentionally key on file identity + mime.
  }, [input.file, input.mimeType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Final unmount safety.
  useEffect(() => {
    return () => {
      revokeActive();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { preview };
}
