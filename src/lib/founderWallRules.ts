/**
 * Pure rules for the Founders Wall.
 *
 * Two responsibilities:
 *  1. `deriveWallDisplayName` — mirrors the DB view's server-side CASE
 *     for the owner's OWN settings preview only. The public wall reads
 *     `founders_wall_public` where the DB is authoritative and where
 *     `display_name` is truncated / hidden server-side. This helper is
 *     for the signed-in founder to preview what strangers will see.
 *  2. `founderPrefsSchema` — zod schema mirroring the DB CHECK
 *     constraints on `public.founders` so bad prefs never round-trip
 *     to the edge function. Server re-validates.
 *
 * SECURITY NOTES:
 *  - `optional_link` is https-only. `javascript:`, `data:`, `http:`,
 *    relative paths, and whitespace are all rejected here AND at the DB.
 *  - `display_name` is capped at 60 chars, rejects control characters,
 *    and is trimmed. Content-policy is not a code concern beyond this.
 *  - This module is pure — no React, no supabase client, no Deno APIs.
 *    Safe to import from the browser and from Deno tests.
 */
import { z } from "zod";

export type FounderDisplayStyle = "custom_name" | "first_initial" | "number_only" | "hidden";

export interface FounderPrefsInput {
  display_name: string | null;
  display_style: FounderDisplayStyle;
  show_on_wall: boolean;
  optional_link: string | null;
}

export interface FounderRowLike {
  founder_number: number;
  display_name: string | null;
  display_style: FounderDisplayStyle;
  show_on_wall: boolean;
}

/**
 * Mirrors the server-side CASE inside `founders_wall_public`.
 *
 * NEVER call this to render the public wall — the public wall must
 * read the DB view so the raw `display_name` never leaves the DB for
 * `number_only` / `hidden` styles. This is for owner preview only.
 */
export function deriveWallDisplayName(row: FounderRowLike): string | null {
  if (!row.show_on_wall) return null;
  switch (row.display_style) {
    case "hidden":
      return null;
    case "number_only":
      return null;
    case "first_initial": {
      const raw = (row.display_name ?? "").trim();
      if (raw.length === 0) return null;
      // Server: `upper(left(btrim(display_name), 1))`. Match that exactly
      // so owner preview and public wall never disagree.
      return raw.charAt(0).toUpperCase();
    }
    case "custom_name": {
      const raw = (row.display_name ?? "").trim();
      return raw.length === 0 ? null : raw;
    }
    default:
      return null;
  }
}

// Control characters: C0 (0x00-0x1F) + DEL (0x7F) + C1 (0x80-0x9F).
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F-\u009F]/;

const DISPLAY_NAME_MAX = 60;

// Everything except an https:// absolute URL with no whitespace is rejected.
// This mirrors the DB CHECK `founders_optional_link_https_only`.
function isSafeHttpsUrl(value: string): boolean {
  if (value.length === 0) return false;
  if (/\s/.test(value)) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (!parsed.hostname || parsed.hostname.length === 0) return false;
  return true;
}

export const founderPrefsSchema = z.object({
  display_style: z.enum(["custom", "first_initial", "number_only", "hidden"]),
  show_on_wall: z.boolean(),
  display_name: z
    .string()
    .max(DISPLAY_NAME_MAX, `Display name must be ${DISPLAY_NAME_MAX} characters or fewer.`)
    .refine((v) => !CONTROL_CHAR_REGEX.test(v), {
      message: "Display name cannot contain control characters.",
    })
    .nullable(),
  optional_link: z
    .string()
    .max(2048)
    .refine(isSafeHttpsUrl, {
      message: "Link must be an absolute https:// URL.",
    })
    .nullable(),
});

export type FounderPrefsParsed = z.infer<typeof founderPrefsSchema>;

export const FOUNDER_DISPLAY_NAME_MAX = DISPLAY_NAME_MAX;
