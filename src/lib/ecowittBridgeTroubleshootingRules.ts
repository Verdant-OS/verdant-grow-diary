/**
 * ecowittBridgeTroubleshootingRules — pure rules for the in-app EcoWitt
 * bridge operator troubleshooting panel.
 *
 * Hard constraints (Verdant sensor truth + safety):
 *   - Pure. No I/O. No React. No Supabase. No fetch. No timers.
 *   - NEVER returns/handles token VALUES. Token state is "present" |
 *     "missing" | "unknown" only.
 *   - Unknown state is "needs verification" — NEVER healthy.
 *   - Source must be "live", provider "ecowitt", transport "mqtt".
 *   - VPD: only valid when both temp & RH valid. Missing VPD stays null,
 *     NEVER 0.
 */

export type TroubleshootingStatus = "ok" | "warn" | "error" | "unknown";

export interface TroubleshootingCheck {
  id: string;
  label: string;
  status: TroubleshootingStatus;
  /** Plain-language detail. Must never include token values. */
  detail: string;
}

export interface TroubleshootingNextAction {
  id: string;
  label: string;
}

export interface TroubleshootingInput {
  /** Operator-visible env summary (presence only, never values). */
  env?: {
    tentIdConfigured?: boolean;
    plantIdConfigured?: boolean;
    ingestUrlConfigured?: boolean;
    /** ONLY "present" | "missing" | "unknown" — never the value. */
    bridgeTokenStatus?: "present" | "missing" | "unknown";
    channelMapJsonValid?: boolean | "unset";
    sendModeRequested?: boolean;
  };
  /** Last accepted ecowitt live reading summary (presenter-supplied). */
  lastReading?: {
    capturedAt?: string | null;
    source?: string | null;
    provider?: string | null;
    transport?: string | null;
    humidityPct?: number | null;
    soilMoisturePct?: number | null;
    airTempC?: number | null;
    vpdKpa?: number | null;
  } | null;
  /** Injected clock for deterministic tests. */
  now?: Date;
  /** Stale window in ms; defaults to 15 min. */
  staleMs?: number;
}

export interface TroubleshootingReport {
  overall: TroubleshootingStatus;
  checks: TroubleshootingCheck[];
  nextActions: TroubleshootingNextAction[];
}

export const TROUBLESHOOTING_NEXT_ACTIONS: ReadonlyArray<TroubleshootingNextAction> = [
  { id: "dry_run_first", label: "Run dry-run first" },
  { id: "mqtt_explorer", label: "Check MQTT Explorer for ecowitt/#" },
  { id: "upload_target", label: "Verify EcoWitt custom upload points to local PC/Pi" },
  { id: "temp_rh_mapping", label: "Check temp/RH mapping" },
  { id: "soil_channel_mapping", label: "Check soil moisture channel mapping" },
  { id: "no_router_ports", label: "Do not open router ports" },
];

const DEFAULT_STALE_MS = 15 * 60 * 1000;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function rollup(checks: TroubleshootingCheck[]): TroubleshootingStatus {
  if (checks.some((c) => c.status === "error")) return "error";
  if (checks.some((c) => c.status === "unknown")) return "unknown";
  if (checks.some((c) => c.status === "warn")) return "warn";
  return "ok";
}

export function buildTroubleshootingReport(
  input: TroubleshootingInput,
): TroubleshootingReport {
  const checks: TroubleshootingCheck[] = [];
  const env = input.env ?? {};
  const reading = input.lastReading ?? null;
  const now = input.now ?? new Date();
  const staleMs = input.staleMs ?? DEFAULT_STALE_MS;

  // --- env: tent id ---
  checks.push({
    id: "tent_id",
    label: "VERDANT_TENT_ID",
    status: env.tentIdConfigured === true ? "ok" : env.tentIdConfigured === false ? "error" : "unknown",
    detail:
      env.tentIdConfigured === true
        ? "Tent ID configured."
        : env.tentIdConfigured === false
          ? "Tent ID missing — set VERDANT_TENT_ID."
          : "Tent ID status not provided — needs verification.",
  });

  // --- env: send-mode readiness ---
  if (env.sendModeRequested) {
    checks.push({
      id: "ingest_url",
      label: "VERDANT_INGEST_URL",
      status:
        env.ingestUrlConfigured === true
          ? "ok"
          : env.ingestUrlConfigured === false
            ? "error"
            : "unknown",
      detail:
        env.ingestUrlConfigured === true
          ? "Ingest URL configured."
          : env.ingestUrlConfigured === false
            ? "Ingest URL missing — required for --send."
            : "Ingest URL status not provided — needs verification.",
    });
  }

  // --- env: bridge token (presence only, NEVER value) ---
  const tok = env.bridgeTokenStatus ?? "unknown";
  checks.push({
    id: "bridge_token",
    label: "VERDANT_BRIDGE_TOKEN",
    status: tok === "present" ? "ok" : tok === "missing" ? (env.sendModeRequested ? "error" : "warn") : "unknown",
    detail:
      tok === "present"
        ? "Bridge token present (value never displayed)."
        : tok === "missing"
          ? "Bridge token missing."
          : "Bridge token status unknown — needs verification.",
  });

  // --- env: channel map ---
  if (env.channelMapJsonValid === "unset") {
    checks.push({
      id: "channel_map",
      label: "ECOWITT_SOIL_CHANNEL_MAP_JSON",
      status: "warn",
      detail: "No soil channel map set — soil probes will be skipped.",
    });
  } else if (env.channelMapJsonValid === true) {
    checks.push({
      id: "channel_map",
      label: "ECOWITT_SOIL_CHANNEL_MAP_JSON",
      status: "ok",
      detail: "Channel map JSON is valid.",
    });
  } else if (env.channelMapJsonValid === false) {
    checks.push({
      id: "channel_map",
      label: "ECOWITT_SOIL_CHANNEL_MAP_JSON",
      status: "error",
      detail: "Channel map JSON is invalid.",
    });
  } else {
    checks.push({
      id: "channel_map",
      label: "ECOWITT_SOIL_CHANNEL_MAP_JSON",
      status: "unknown",
      detail: "Channel map status not provided — needs verification.",
    });
  }

  // --- last reading present? ---
  if (!reading) {
    checks.push({
      id: "last_reading",
      label: "Last EcoWitt live reading",
      status: "unknown",
      detail: "No accepted live reading observed yet — needs verification.",
    });
  } else {
    checks.push({
      id: "last_reading",
      label: "Last EcoWitt live reading",
      status: "ok",
      detail: "Accepted live reading found.",
    });

    // freshness
    let freshStatus: TroubleshootingStatus = "unknown";
    let freshDetail = "Captured timestamp missing — needs verification.";
    if (reading.capturedAt) {
      const t = Date.parse(reading.capturedAt);
      if (Number.isFinite(t)) {
        const ageMs = now.getTime() - t;
        if (ageMs < 0 || ageMs <= staleMs) {
          freshStatus = "ok";
          freshDetail = "Reading is fresh.";
        } else {
          freshStatus = "warn";
          freshDetail = "Reading is stale.";
        }
      }
    }
    checks.push({
      id: "freshness",
      label: "Last reading freshness",
      status: freshStatus,
      detail: freshDetail,
    });

    // canonical source
    checks.push({
      id: "source_live",
      label: "Canonical source",
      status: reading.source === "live" ? "ok" : reading.source ? "error" : "unknown",
      detail:
        reading.source === "live"
          ? "source = live."
          : reading.source
            ? `Expected source "live", got "${reading.source}".`
            : "Source unknown — needs verification.",
    });
    checks.push({
      id: "provider_ecowitt",
      label: "Provider",
      status: reading.provider === "ecowitt" ? "ok" : reading.provider ? "error" : "unknown",
      detail:
        reading.provider === "ecowitt"
          ? "provider = ecowitt."
          : reading.provider
            ? `Expected provider "ecowitt", got "${reading.provider}".`
            : "Provider unknown — needs verification.",
    });
    checks.push({
      id: "transport_mqtt",
      label: "Transport",
      status: reading.transport === "mqtt" ? "ok" : reading.transport ? "warn" : "unknown",
      detail:
        reading.transport === "mqtt"
          ? "transport = mqtt."
          : reading.transport
            ? `Expected transport "mqtt", got "${reading.transport}".`
            : "Transport unknown — needs verification.",
    });

    // humidity
    if (isFiniteNumber(reading.humidityPct)) {
      const h = reading.humidityPct;
      const validH = h > 0 && h < 100;
      checks.push({
        id: "humidity",
        label: "Humidity",
        status: validH ? "ok" : "error",
        detail: validH ? "Humidity within realistic bounds." : "Humidity stuck/invalid.",
      });
    } else {
      checks.push({
        id: "humidity",
        label: "Humidity",
        status: "unknown",
        detail: "Humidity missing — needs verification.",
      });
    }

    // soil moisture
    if (isFiniteNumber(reading.soilMoisturePct)) {
      const s = reading.soilMoisturePct;
      const validS = s > 0 && s < 100;
      checks.push({
        id: "soil_moisture",
        label: "Soil moisture",
        status: validS ? "ok" : "error",
        detail: validS ? "Soil moisture within realistic bounds." : "Soil moisture stuck/invalid.",
      });
    } else {
      checks.push({
        id: "soil_moisture",
        label: "Soil moisture",
        status: "warn",
        detail: "Soil moisture not present in last reading.",
      });
    }

    // VPD presence — must be null/blank when missing; NEVER 0
    const tempOk = isFiniteNumber(reading.airTempC);
    const humOk = isFiniteNumber(reading.humidityPct) && reading.humidityPct! > 0 && reading.humidityPct! < 100;
    if (tempOk && humOk) {
      if (isFiniteNumber(reading.vpdKpa) && reading.vpdKpa !== 0) {
        checks.push({
          id: "vpd",
          label: "VPD",
          status: "ok",
          detail: "VPD derived from temp + RH.",
        });
      } else if (reading.vpdKpa === 0) {
        checks.push({
          id: "vpd",
          label: "VPD",
          status: "error",
          detail: "VPD reported as 0 — invalid placeholder.",
        });
      } else {
        checks.push({
          id: "vpd",
          label: "VPD",
          status: "warn",
          detail: "Temp/RH valid but VPD missing — verify derivation.",
        });
      }
    } else {
      checks.push({
        id: "vpd",
        label: "VPD",
        status: "warn",
        detail: "Temp or RH missing — VPD intentionally blank.",
      });
    }
  }

  return {
    overall: rollup(checks),
    checks,
    nextActions: [...TROUBLESHOOTING_NEXT_ACTIONS],
  };
}
