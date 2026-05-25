/**
 * Pure derivation for the Shelly H&T Gen4 setup card.
 *
 * No I/O, no React, no Supabase. Deterministic only.
 *
 * Given the server-resolved configuration flags and the latest Shelly
 * H&T reading (if any), classify the card into one of:
 *
 *   - "not-configured"         — webhook token or tent mapping missing
 *   - "awaiting-first-reading" — configured but no reading received yet
 *   - "receiving"              — fresh reading within stale window
 *   - "stale"                  — reading present but older than stale window
 *
 * Read-only. No alerts, no action_queue, no automation, no device
 * control. Never invents placeholder values.
 */
import { isStale, STALE_THRESHOLD_MS } from "@/lib/sensorSnapshot";
import type { RecentSensorSnapshot } from "@/lib/recentSensorSnapshotHistoryRules";

export type ShellyHtSetupState =
  | "not-configured"
  | "awaiting-first-reading"
  | "receiving"
  | "stale";

export interface ShellyHtSetupStatusInput {
  /** Both server secrets present (token + tent mapping). */
  configured: boolean;
  /** Configured tent is owned by the current user. */
  tentAssignedToCaller: boolean;
  /** Latest Shelly H&T reading (folded snapshot) or null. */
  latest: RecentSensorSnapshot | null;
  now?: number;
}

export interface ShellyHtSetupStatusView {
  state: ShellyHtSetupState;
  headline: string;
  body: string;
  isStale: boolean;
  showLatest: boolean;
}

export function deriveShellyHtSetupStatus(
  input: ShellyHtSetupStatusInput,
): ShellyHtSetupStatusView {
  const now = input.now ?? Date.now();

  if (!input.configured) {
    return {
      state: "not-configured",
      headline: "Not configured",
      body:
        "Add the Shelly H&T Gen4 webhook token and assigned tent on the server to start receiving readings.",
      isStale: false,
      showLatest: false,
    };
  }

  if (!input.latest) {
    return {
      state: "awaiting-first-reading",
      headline: "Waiting for first reading",
      body: input.tentAssignedToCaller
        ? "Configuration looks good. Trigger the Shelly H&T to send its first reading."
        : "Configured for another account's tent. Latest readings will not appear here.",
      isStale: false,
      showLatest: false,
    };
  }

  const stale = isStale(input.latest.ts, now, STALE_THRESHOLD_MS);
  if (stale) {
    return {
      state: "stale",
      headline: "Latest reading is stale",
      body: "No fresh reading received recently. Check the Shelly device, network, or webhook token.",
      isStale: true,
      showLatest: true,
    };
  }

  return {
    state: "receiving",
    headline: "Receiving readings",
    body: "Verdant is logging Shelly H&T Gen4 readings for this tent.",
    isStale: false,
    showLatest: true,
  };
}

/**
 * Find the latest Shelly H&T Gen4 reading from a recent history list.
 * The list is expected to already be newest-first. Returns null when no
 * Shelly entries are present.
 *
 * Uses the existing `deviceDetail` label so we never duplicate device
 * classification logic.
 */
export function findLatestShellyHtSnapshot(
  history: ReadonlyArray<RecentSensorSnapshot> | null | undefined,
  shellyLabel: string,
): RecentSensorSnapshot | null {
  if (!history || history.length === 0) return null;
  for (const r of history) {
    if (r.deviceDetail === shellyLabel) return r;
  }
  return null;
}
