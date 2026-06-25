import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSource(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const REVIEW_PACKET_CARD = readSource("src/components/PostGrowReflectionReviewPacketCard.tsx");

const FORBIDDEN_SIDE_EFFECT_TOKENS = [
  "functions.invoke",
  "action_queue",
  "alerts.insert",
  "device-control",
  "deviceControl",
  "mqtt.connect",
  "publish(",
  "service_role",
];

describe("post-grow review packet copy feedback", () => {
  it("changes the copy button label to Copied when clipboard write succeeds", () => {
    expect(REVIEW_PACKET_CARD).toMatch(/const copyButtonLabel/);
    expect(REVIEW_PACKET_CARD).toMatch(/copyState === "copied"/);
    expect(REVIEW_PACKET_CARD).toContain("Copied!");
    expect(REVIEW_PACKET_CARD).toMatch(/\{copyButtonLabel\}/);
  });

  it("announces copy success and clipboard fallback with aria-live status copy", () => {
    expect(REVIEW_PACKET_CARD).toContain("Copied sanitized review packet to clipboard.");
    expect(REVIEW_PACKET_CARD).toContain("Clipboard not available. Download the sanitized packet instead.");
    expect(REVIEW_PACKET_CARD).toContain('role="status"');
    expect(REVIEW_PACKET_CARD).toContain('aria-live="polite"');
    expect(REVIEW_PACKET_CARD).toContain('data-testid="copy-sanitized-review-packet-status"');
  });

  it("keeps feedback temporary instead of persisting stale copied state forever", () => {
    expect(REVIEW_PACKET_CARD).toMatch(/useEffect/);
    expect(REVIEW_PACKET_CARD).toMatch(/setTimeout\(\(\) => setCopyState\("idle"\), 2500\)/);
    expect(REVIEW_PACKET_CARD).toMatch(/clearTimeout\(timeout\)/);
  });

  it("continues exporting only the sanitized review packet text", () => {
    expect(REVIEW_PACKET_CARD).toMatch(/buildReviewPacketJsonText\(packet\)/);
    expect(REVIEW_PACKET_CARD).toContain("Review packet excludes raw candidate content");
    expect(REVIEW_PACKET_CARD).toContain("pasted JSON, credentials, private");
    expect(REVIEW_PACKET_CARD).toContain("metadata, and device targets");
  });

  it("does not introduce persistence, AI calls, alerts, Action Queue writes, or device control", () => {
    expect(REVIEW_PACKET_CARD).not.toMatch(/raw_payload/i);
    expect(REVIEW_PACKET_CARD).not.toMatch(/\.insert\(/);
    expect(REVIEW_PACKET_CARD).not.toMatch(/\.update\(/);
    expect(REVIEW_PACKET_CARD).not.toMatch(/\.delete\(/);
    expect(REVIEW_PACKET_CARD).not.toMatch(/\.upsert\(/);
    for (const token of FORBIDDEN_SIDE_EFFECT_TOKENS) {
      expect(REVIEW_PACKET_CARD).not.toContain(token);
    }
  });
});
