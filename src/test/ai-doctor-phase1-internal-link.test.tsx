/**
 * AI Doctor Phase 1 — Internal Link tests.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  AiDoctorPhase1InternalLink,
  buildAiDoctorPhase1InternalLink,
} from "@/components/AiDoctorPhase1InternalLink";

describe("buildAiDoctorPhase1InternalLink", () => {
  it("includes plantId", () => {
    expect(buildAiDoctorPhase1InternalLink({ plantId: "p1" })).toBe(
      "/operator/ai-doctor-phase1?plantId=p1",
    );
  });
  it("includes growId/tentId when present", () => {
    const href = buildAiDoctorPhase1InternalLink({
      plantId: "p1",
      growId: "g1",
      tentId: "t1",
    });
    expect(href).toContain("plantId=p1");
    expect(href).toContain("growId=g1");
    expect(href).toContain("tentId=t1");
  });
  it("omits growId/tentId when null", () => {
    const href = buildAiDoctorPhase1InternalLink({
      plantId: "p1",
      growId: null,
      tentId: null,
    });
    expect(href).not.toContain("growId");
    expect(href).not.toContain("tentId");
  });
});

describe("AiDoctorPhase1InternalLink — clipboard", () => {
  let writeText: ReturnType<typeof vi.fn>;
  const originalClipboard = (navigator as { clipboard?: unknown }).clipboard;

  beforeEach(() => {
    writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });
  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
  });

  it("renders link href and Copy button when clipboard is available", () => {
    render(<AiDoctorPhase1InternalLink plantId="p1" growId="g1" tentId="t1" />);
    expect(screen.getByTestId("ai-doctor-phase1-internal-link")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-internal-link-href").textContent).toContain(
      "plantId=p1",
    );
    expect(screen.getByTestId("ai-doctor-phase1-internal-link-copy")).toBeTruthy();
  });

  it("calls navigator.clipboard.writeText with the link", async () => {
    render(<AiDoctorPhase1InternalLink plantId="p1" />);
    fireEvent.click(screen.getByTestId("ai-doctor-phase1-internal-link-copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("plantId=p1");
    await waitFor(() =>
      expect(screen.getByTestId("ai-doctor-phase1-internal-link-copied")).toBeTruthy(),
    );
  });
});

describe("AiDoctorPhase1InternalLink — clipboard unavailable", () => {
  const originalClipboard = (navigator as { clipboard?: unknown }).clipboard;
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
  });
  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
  });

  it("renders fallback copy instructions when clipboard is unavailable", () => {
    render(<AiDoctorPhase1InternalLink plantId="p1" />);
    expect(screen.queryByTestId("ai-doctor-phase1-internal-link-copy")).toBeNull();
    expect(screen.getByTestId("ai-doctor-phase1-internal-link-manual-copy")).toBeTruthy();
    // Link text remains visible for manual copy.
    expect(screen.getByTestId("ai-doctor-phase1-internal-link-href").textContent).toContain(
      "plantId=p1",
    );
  });
});

describe("static safety — AiDoctorPhase1InternalLink", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../components/AiDoctorPhase1InternalLink.tsx"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("no Supabase/fetch/model/write/device-control surface", () => {
    expect(SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/functions\.invoke/);
    expect(SRC).not.toMatch(/openai|anthropic|gemini|ai-gateway/i);
    expect(SRC).not.toMatch(/action_queue.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/diary.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/timeline.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/alert.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/executeDeviceCommand|deviceControl|sendDeviceCommand/i);
    expect(SRC).not.toMatch(/service_role|bridge[_-]?token/i);
  });
});
