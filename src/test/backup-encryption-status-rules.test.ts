import { describe, it, expect } from "vitest";
import {
  classifyBackupEncryptionStatus,
  sanitizeEvidence,
} from "@/lib/backupEncryptionStatusRules";

const NOW = new Date("2026-06-07T12:00:00Z");

describe("classifyBackupEncryptionStatus", () => {
  it("classifies enabled + fresh as healthy", () => {
    const s = classifyBackupEncryptionStatus({
      state: "enabled",
      provider: "supabase_storage",
      lastCheckedAt: "2026-06-07T11:30:00Z",
      now: NOW,
      evidenceLabel: "Bucket policy: SSE-S3",
    });
    expect(s.risk).toBe("healthy");
    expect(s.providerLabel).toBe("Supabase Storage");
    expect(s.stale).toBe(false);
    expect(s.message).toMatch(/No secrets exposed/);
    expect(s.evidenceLabel).toBe("Bucket policy: SSE-S3");
  });

  it("downgrades enabled+stale to warning", () => {
    const s = classifyBackupEncryptionStatus({
      state: "enabled",
      provider: "s3",
      lastCheckedAt: "2026-06-01T00:00:00Z",
      now: NOW,
    });
    expect(s.risk).toBe("warning");
    expect(s.stale).toBe(true);
  });

  it("classifies disabled + production-backups as critical", () => {
    const s = classifyBackupEncryptionStatus({
      state: "disabled",
      provider: "s3",
      productionBackupsEnabled: true,
      now: NOW,
    });
    expect(s.risk).toBe("critical");
    expect(s.message).toMatch(/without confirmed encryption/);
  });

  it("classifies disabled w/o prod backups as warning", () => {
    const s = classifyBackupEncryptionStatus({
      state: "disabled",
      provider: "local_export",
      now: NOW,
    });
    expect(s.risk).toBe("warning");
  });

  it("classifies unknown as warning (never healthy)", () => {
    const s = classifyBackupEncryptionStatus({ state: "unknown", now: NOW });
    expect(s.risk).toBe("warning");
    expect(s.message).toMatch(/unknown/i);
    expect(s.providerLabel).toBe("Unknown provider");
  });

  it("classifies error as critical and sanitizes message", () => {
    const s = classifyBackupEncryptionStatus({
      state: "error",
      now: NOW,
      errorMessage:
        "failed with Bearer eyJabcdefghijklmnop and service_role key",
    });
    expect(s.risk).toBe("critical");
    expect(s.message).not.toMatch(/eyJabcdefghijklmnop/);
    expect(s.message).not.toMatch(/service_role/i);
    expect(s.message).toMatch(/\[redacted\]/);
  });

  it("classifies demo as unknown risk and labels as demo", () => {
    const s = classifyBackupEncryptionStatus({ state: "demo", now: NOW });
    expect(s.risk).toBe("unknown");
    expect(s.isDemo).toBe(true);
    expect(s.message).toMatch(/Demo/);
  });

  it("treats invalid lastCheckedAt as stale", () => {
    const s = classifyBackupEncryptionStatus({
      state: "enabled",
      lastCheckedAt: "not-a-date",
      now: NOW,
    });
    expect(s.stale).toBe(true);
    expect(s.risk).toBe("warning");
  });
});

describe("sanitizeEvidence", () => {
  it("redacts JWTs, bearer tokens, AWS keys, hex blobs, bridge tokens", () => {
    const cases = [
      "eyJhbGciOiJIUzI1NiJ9.payload.sig",
      "Bearer abcdef123456",
      "AKIAABCDEFGHIJKL",
      "vbt_abcdef123456",
      "0123456789abcdef0123456789abcdef",
      "service_role leak",
      "https://x.s3.amazonaws.com/file?X-Amz-Signature=deadbeefcafe",
    ];
    for (const c of cases) {
      expect(sanitizeEvidence(c)).toMatch(/\[redacted\]/);
    }
  });

  it("returns empty for nullish", () => {
    expect(sanitizeEvidence(null)).toBe("");
    expect(sanitizeEvidence(undefined)).toBe("");
  });
});
