/**
 * View model adapter for the DevOps Monitor backup-encryption card.
 * Pure: takes a classified status and returns presentation-ready chips
 * with no secrets and no live data assumptions.
 */
import {
  classifyBackupEncryptionStatus,
  type BackupEncryptionStatus,
  type BackupEncryptionStatusInput,
  type BackupRiskLevel,
} from "./backupEncryptionStatusRules";

export interface DevOpsBackupEncryptionViewModel {
  title: string;
  status: BackupEncryptionStatus;
  riskBadge: { label: string; tone: BackupRiskLevel };
  stateBadge: { label: string };
  demoBadge: { label: string } | null;
  staleBadge: { label: string } | null;
  lines: { label: string; value: string }[];
}

const STATE_LABELS: Record<BackupEncryptionStatus["state"], string> = {
  enabled: "Encryption enabled",
  disabled: "Encryption disabled",
  unknown: "Encryption unknown",
  error: "Check failed",
  demo: "Demo status",
};

const RISK_LABELS: Record<BackupRiskLevel, string> = {
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
  unknown: "Unknown",
};

export function buildDevOpsBackupEncryptionViewModel(
  input: BackupEncryptionStatusInput,
): DevOpsBackupEncryptionViewModel {
  const status = classifyBackupEncryptionStatus(input);
  const lines: { label: string; value: string }[] = [
    { label: "Provider", value: status.providerLabel },
    { label: "Last checked", value: status.lastCheckedLabel },
  ];
  if (status.evidenceLabel) {
    lines.push({ label: "Evidence", value: status.evidenceLabel });
  }
  lines.push({ label: "Next step", value: status.nextStep });

  return {
    title: "Backup encryption",
    status,
    riskBadge: { label: RISK_LABELS[status.risk], tone: status.risk },
    stateBadge: { label: STATE_LABELS[status.state] },
    demoBadge: status.isDemo ? { label: "Demo" } : null,
    staleBadge: status.stale ? { label: "Stale" } : null,
    lines,
  };
}
