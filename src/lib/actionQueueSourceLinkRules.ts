/**
 * actionQueueSourceLinkRules — pure helpers that derive a safe
 * "Go to source" route for an Action Queue row.
 *
 * Hard constraints:
 *  - No I/O, no React, no Supabase, no AI calls.
 *  - Returns a route string + a grower-readable label only. Never
 *    leaks raw IDs into the visible label.
 *  - Conservatively returns `null` when context is missing or the
 *    derived route would be unsafe. Callers MUST treat null as
 *    "Source link unavailable" — never as "safe to navigate anyway".
 *  - Never describes unknown context as healthy / safe / approved.
 */

import {
  extractSourceAlertId,
  extractSourceAiDoctorSessionId,
} from "@/lib/actionQueueProvenanceRules";
import {
  alertDetailPath,
  aiDoctorSessionDetailPath,
} from "@/lib/routes";

export interface ActionQueueSourceLinkInput {
  source?: string | null;
  reason?: string | null;
  grow_id?: string | null;
  tent_id?: string | null;
  plant_id?: string | null;
}

export interface ActionQueueSourceLink {
  /** Internal route — already produced by a typed `routes.ts` helper. */
  href: string;
  /** Grower-readable label. Never contains a raw UUID. */
  label: string;
  /** Discriminant for telemetry / tests. */
  kind: "alert" | "ai_doctor" | "plant" | "tent" | "grow";
}

export const SOURCE_LINK_UNAVAILABLE_COPY = "Source link unavailable.";

// Conservative allow-list of route shapes for plant/tent/grow fallbacks.
// We never construct app-specific routes outside this list.
const PLANT_ROUTE = (id: string) => `/plants/${id}`;
const TENT_ROUTE = (id: string) => `/tents/${id}`;
const GROW_ROUTE = (id: string) => `/grows/${id}`;

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function isSafeId(id: string | null | undefined): id is string {
  return typeof id === "string" && SAFE_ID_RE.test(id);
}

/**
 * Derive a safe route + grower-facing label for the originating source
 * of an Action Queue row. Returns `null` when the row provides no safe
 * destination. The caller renders `SOURCE_LINK_UNAVAILABLE_COPY` in
 * that case — it must NOT fabricate a link.
 */
export function buildActionQueueSourceLink(
  input: ActionQueueSourceLinkInput,
): ActionQueueSourceLink | null {
  const source = (input.source ?? "").trim();

  // Alert source: requires the canonical source label AND a parseable
  // back-pointer token. Either alone is insufficient.
  if (source === "environment_alert") {
    const alertId = extractSourceAlertId(input.reason);
    if (isSafeId(alertId)) {
      return {
        href: alertDetailPath(alertId),
        label: "View originating alert",
        kind: "alert",
      };
    }
    return null;
  }

  // AI Doctor source: same shape, different token + route.
  if (source === "ai_doctor") {
    const sessionId = extractSourceAiDoctorSessionId(input.reason);
    if (isSafeId(sessionId)) {
      return {
        href: aiDoctorSessionDetailPath(sessionId),
        label: "View AI Doctor session",
        kind: "ai_doctor",
      };
    }
    return null;
  }

  // Manual / unknown source: fall back to the most-specific related
  // context route the grower can safely open. Plant > Tent > Grow.
  // Never include the raw UUID in the visible label.
  if (isSafeId(input.plant_id)) {
    return {
      href: PLANT_ROUTE(input.plant_id),
      label: "Open related plant",
      kind: "plant",
    };
  }
  if (isSafeId(input.tent_id)) {
    return {
      href: TENT_ROUTE(input.tent_id),
      label: "Open related tent",
      kind: "tent",
    };
  }
  if (isSafeId(input.grow_id)) {
    return {
      href: GROW_ROUTE(input.grow_id),
      label: "Open related grow",
      kind: "grow",
    };
  }

  return null;
}
