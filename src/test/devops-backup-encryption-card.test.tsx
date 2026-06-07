import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DevOpsBackupEncryptionCard } from "@/components/DevOpsBackupEncryptionCard";

const NOW = new Date("2026-06-07T12:00:00Z");

describe("DevOpsBackupEncryptionCard", () => {
  it("renders healthy state when enabled and fresh", () => {
    render(
      <DevOpsBackupEncryptionCard
        input={{
          state: "enabled",
          provider: "supabase_storage",
          lastCheckedAt: "2026-06-07T11:30:00Z",
          evidenceLabel: "Bucket policy: SSE-S3",
          now: NOW,
        }}
      />,
    );
    expect(screen.getByTestId("risk-badge").textContent).toBe("Healthy");
    expect(screen.getByTestId("status-message").textContent).toMatch(
      /No secrets exposed/,
    );
    expect(screen.getByText("Supabase Storage")).toBeTruthy();
  });

  it("renders critical when disabled with production backups", () => {
    render(
      <DevOpsBackupEncryptionCard
        input={{
          state: "disabled",
          provider: "s3",
          productionBackupsEnabled: true,
          now: NOW,
        }}
      />,
    );
    expect(screen.getByTestId("risk-badge").textContent).toBe("Critical");
  });

  it("renders warning for unknown", () => {
    render(<DevOpsBackupEncryptionCard input={{ state: "unknown", now: NOW }} />);
    expect(screen.getByTestId("risk-badge").textContent).toBe("Warning");
  });

  it("shows Demo badge for demo state", () => {
    render(<DevOpsBackupEncryptionCard input={{ state: "demo", now: NOW }} />);
    expect(screen.getByTestId("demo-badge")).toBeTruthy();
  });

  it("shows Stale badge when lastCheckedAt is old", () => {
    render(
      <DevOpsBackupEncryptionCard
        input={{
          state: "enabled",
          lastCheckedAt: "2026-05-01T00:00:00Z",
          now: NOW,
        }}
      />,
    );
    expect(screen.getByTestId("stale-badge")).toBeTruthy();
  });

  it("never renders raw secrets that were injected via evidence/error", () => {
    const dirty =
      "eyJhbGciOiJIUzI1NiJ9.payload.sig Bearer abcdef123456 AKIAABCDEFGHIJKL vbt_secretxyz123 service_role";
    const { container } = render(
      <DevOpsBackupEncryptionCard
        input={{
          state: "error",
          provider: "s3",
          errorMessage: dirty,
          evidenceLabel: dirty,
          now: NOW,
        }}
      />,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/eyJhbGciOiJIUzI1NiJ9/);
    expect(html).not.toMatch(/AKIAABCDEFGHIJKL/);
    expect(html).not.toMatch(/vbt_secretxyz123/);
    expect(html).not.toMatch(/Bearer abcdef123456/);
    expect(html).not.toMatch(/service_role/i);
  });
});
