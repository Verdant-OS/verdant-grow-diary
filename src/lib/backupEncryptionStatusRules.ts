/**
 * Backup Encryption Status Rules
 *
 * Pure, deterministic helpers that classify whether Verdant backups are
 * configured for encryption. This module is presentation/audit-only:
 *  - never reads secrets
 *  - never returns keys, tokens, signed URLs, or service_role values
 *  - never performs backup, restore, key generation, or rotation
 *
 * Unknown configuration must never be reported as healthy. Disabled
 * encryption is at minimum a warning, and critical when production backups
 * are enabled.
 */

export type BackupEncryptionState =
  | "enabled"
  | "disabled"
  | "unknown"
  | "error"
  | "demo";

export type BackupRiskLevel = "healthy" | "warning" | "critical" | "unknown";

export type BackupProvider =
  | "supabase_storage"
  | "s3"
  | "local_export"
  | "unknown";

export interface BackupEncryptionStatusInput {
  /** Raw configuration state from an operator-trusted source. */
  state: BackupEncryptionState;
  /** Provider identifier; never secrets. */
  provider?: BackupProvider;
  /** Whether production backups are currently enabled. */
  productionBackupsEnabled?: boolean;
  /** ISO timestamp of the last verified check. */
  lastCheckedAt?: string | null;
  /** Short, secret-free evidence label (e.g. "Bucket policy: SSE-S3"). */
  evidenceLabel?: string | null;
  /** Optional error message; will be sanitized before display. */
  errorMessage?: string | null;
  /** Now for staleness math; injected for tests. */
  now?: Date;
  /** Staleness threshold in ms; defaults to 24h. */
  staleAfterMs?: number;
}

export interface BackupEncryptionStatus {
  state: BackupEncryptionState;
  risk: BackupRiskLevel;
  provider: BackupProvider;
  providerLabel: string;
  lastCheckedAt: string | null;
  lastCheckedLabel: string;
  stale: boolean;
  isDemo: boolean;
  evidenceLabel: string;
  message: string;
  nextStep: string;
}

const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

// Patterns that must never appear in evidence/error labels we render.
const SECRET_PATTERNS: RegExp[] = [
  /eyJ[A-Za-z0-9_-]{10,}/g, // JWT
  /sk_(live|test)_[A-Za-z0-9]{6,}/gi, // Stripe-style
  /service[_-]?role/gi,
  /supabase[_-]?service[_-]?key/gi,
  /Bearer\s+[A-Za-z0-9._-]{8,}/gi,
  /https?:\/\/\S*[?&](token|signature|sig|x-amz-signature)=\S+/gi,
  /AKIA[0-9A-Z]{8,}/g, // AWS access key id
  /vbt_[A-Za-z0-9]{6,}/gi, // Verdant bridge token
  /[A-Fa-f0-9]{32,}/g, // long hex (KMS/keys)
];

export function sanitizeEvidence(value: string | null | undefined): string {
  if (!value) return "";
  let out = String(value);
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "[redacted]");
  }
  // Defensive cap to prevent secret-y blobs leaking via length.
  if (out.length > 200) out = `${out.slice(0, 200)}…`;
  return out.trim();
}

const PROVIDER_LABELS: Record<BackupProvider, string> = {
  supabase_storage: "Supabase Storage",
  s3: "S3",
  local_export: "Local export",
  unknown: "Unknown provider",
};

export function classifyBackupEncryptionStatus(
  input: BackupEncryptionStatusInput,
): BackupEncryptionStatus {
  const now = input.now ?? new Date();
  const staleAfterMs = input.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const provider: BackupProvider = input.provider ?? "unknown";
  const productionBackupsEnabled = input.productionBackupsEnabled === true;

  const lastCheckedAt = input.lastCheckedAt ?? null;
  let stale = false;
  let lastCheckedLabel = "Never checked";
  if (lastCheckedAt) {
    const ts = Date.parse(lastCheckedAt);
    if (Number.isFinite(ts)) {
      stale = now.getTime() - ts > staleAfterMs;
      lastCheckedLabel = new Date(ts).toISOString();
    } else {
      lastCheckedLabel = "Invalid timestamp";
      stale = true;
    }
  }

  const evidenceLabel = sanitizeEvidence(input.evidenceLabel);
  const sanitizedError = sanitizeEvidence(input.errorMessage);

  const isDemo = input.state === "demo";

  let risk: BackupRiskLevel;
  let message: string;
  let nextStep: string;

  switch (input.state) {
    case "enabled":
      if (stale) {
        risk = "warning";
        message =
          "Backup encryption appeared enabled, but the status check is stale.";
        nextStep =
          "Re-run the backup encryption verification to refresh status.";
      } else {
        risk = "healthy";
        message = "Backup encryption appears enabled. No secrets exposed.";
        nextStep = "No action required. Continue scheduled verification.";
      }
      break;
    case "disabled":
      if (productionBackupsEnabled) {
        risk = "critical";
        message =
          "Backups appear enabled without confirmed encryption.";
        nextStep =
          "Enable provider-side encryption (SSE) before next scheduled backup.";
      } else {
        risk = "warning";
        message =
          "Backup encryption is disabled. Production backups are not enabled.";
        nextStep =
          "Enable encryption before turning on production backups.";
      }
      break;
    case "error":
      risk = "critical";
      message = sanitizedError
        ? `Backup encryption check failed: ${sanitizedError}`
        : "Backup encryption check failed.";
      nextStep =
        "Investigate the failing encryption check. Do not assume healthy.";
      break;
    case "demo":
      risk = "unknown";
      message = "Demo encryption status only. Not live infrastructure.";
      nextStep =
        "Wire a real status source before relying on this panel.";
      break;
    case "unknown":
    default:
      risk = "warning";
      message =
        "Backup encryption status is unknown. Verify storage provider settings.";
      nextStep =
        "Confirm provider-side encryption (e.g. Supabase Storage / S3 SSE).";
      break;
  }

  return {
    state: input.state,
    risk,
    provider,
    providerLabel: PROVIDER_LABELS[provider],
    lastCheckedAt,
    lastCheckedLabel,
    stale,
    isDemo,
    evidenceLabel,
    message,
    nextStep,
  };
}
