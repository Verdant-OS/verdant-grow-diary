/**
 * sensorTiming — the single home for every sensor stale/freshness window.
 *
 * Consolidated by the 2026-07-30 sensor-truth slice (#592). The Sensor Truth
 * Canon follow-up unifies grower-facing values to docs/data-labeling-spec.md
 * and docs/sensor-truth-rules.md:
 *   - Live current-state → 15 minutes
 *   - Manual current-context → 24 hours
 * Source-aware resolution lives in `src/lib/sensorTruthCanon.ts`. Metric-kind
 * windows (environment 15m / soil 60m) stay in the badge freshness resolver.
 *
 * Rules:
 *  - One constant per consuming surface, named for that surface, unit suffix
 *    in the name (_MS / _MINUTES / _HOURS).
 *  - Mirrored edge modules import this file by its EXPLICIT path
 *    (`@/constants/sensorTiming`), never via the `@/constants` barrel — the
 *    edge-shared sync only rewrites explicit `@/constants/*` specifiers.
 *  - Do not add non-timing constants here.
 */

// ---------------------------------------------------------------------------
// 15 minutes — live-reading freshness (docs/data-labeling-spec.md).
// ---------------------------------------------------------------------------

/** Dashboard latest-snapshot freshness (latestSensorSnapshotRules). */
export const SENSOR_FRESH_WINDOW_MINUTES = 15;

// Deliberate exception: liveSourceTruthGateRules.ts keeps its own local
// 15-minute LIVE_SOURCE_TRUTH_STALE_AFTER_MS — that module has a
// no-external-imports contract (live-source-truth-gate-rules.test.ts) and
// cannot import this file. Change both together.

/** EcoWitt live soil ingest acceptance (ecowittLiveSoilIngestRules). */
export const ECOWITT_LIVE_SOIL_STALE_MS = 15 * 60 * 1000;

/** EcoWitt MQTT ingest acceptance (ecowittMqttIngestRules). */
export const ECOWITT_MQTT_STALE_MS = 15 * 60 * 1000;

/** Grow data source label freshness (growDataSourceLabelRules). */
export const GROW_DATA_SOURCE_LABEL_STALE_MS = 15 * 60 * 1000;

/** Bridge troubleshooting "recent ingest" window (ecowittBridgeTroubleshootingRules). */
export const ECOWITT_BRIDGE_TROUBLESHOOTING_STALE_MS = 15 * 60 * 1000;

/** Testbench transport-receiving window (sensorTestbenchIndicatorRules, #584). */
export const SENSOR_TESTBENCH_LIVE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Live current-state staleness for dashboard snapshot + alert persistence
 * (`sensorSnapshot.isStale` default / Sensor Truth Canon live window).
 */
export const SENSOR_SNAPSHOT_STALE_THRESHOLD_MS = 15 * 60 * 1000;

/** Reading normalization staleness for live demotion (sensorReadingNormalizationRules). */
export const SENSOR_READING_NORMALIZATION_STALE_MS = 15 * 60 * 1000;

/** Source-health rollup "active" window (sensorSourceHealthRules). */
export const SENSOR_SOURCE_STALE_MINUTES = 15;

/** AI Coach snapshot context default (overridden per-source via sensorTruthCanon). */
export const DEFAULT_AI_COACH_STALE_THRESHOLD_MS = 15 * 60 * 1000;

/** AI Doctor sensor context default (overridden per-source via sensorTruthCanon). */
export const DEFAULT_AI_SENSOR_STALE_THRESHOLD_MS = 15 * 60 * 1000;

/** Grow Room Mode display default (source-aware via sensorTruthCanon when source known). */
export const GROW_ROOM_MODE_STALE_MINUTES = 15;

// ---------------------------------------------------------------------------
// Longer windows — soil/channel labeling, manual snapshots, status contract.
// ---------------------------------------------------------------------------

/** EcoWitt channel labeling recency (ecowittChannelLabelingRules). */
export const ECOWITT_CHANNEL_LABELING_STALE_AFTER_MS = 60 * 60 * 1000;

/**
 * Manual snapshot "current" window — 24h
 * (manualSensorSnapshotQualityRules, docs/data-labeling-spec.md).
 */
export const MANUAL_SNAPSHOT_CURRENT_STALE_HOURS = 24;

/**
 * AI context sufficiency coarse sensor window — 24h
 * (aiContextSufficiencyRules; aligned with manual current-context).
 */
export const DEFAULT_SENSOR_STALE_MS = 24 * 60 * 60 * 1000;

/** Snapshot status contract default window when source is unknown (sensorSnapshotStatusContract). */
export const DEFAULT_STALE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** EcoWitt ingest validation view recency — 24h (ecowittIngestValidationViewModel). */
export const ECOWITT_INGEST_VALIDATION_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/** No-recent-log recovery nudge — 72h (noRecentLogRecoveryRules). */
export const NO_RECENT_LOG_STALE_AFTER_HOURS = 72;
