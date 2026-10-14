import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const TIMELINE = readFileSync(resolve(__dirname, "../pages/Timeline.tsx"), "utf8");

describe("text-note timeline cards", () => {
  it("does not paint an empty photo well on entries that have no photo", () => {
    expect(TIMELINE).not.toContain("aspect-[4/3] bg-secondary/40");
  });

  it("renders the note body in foreground text", () => {
    const body = TIMELINE.match(
      /data-testid="timeline-entry-body"[\s\S]{0,400}className="[^"]*text-foreground/,
    );
    const classBefore = TIMELINE.match(
      /className="([^"]*text-foreground[^"]*)"[\s\S]{0,200}data-testid="timeline-entry-body"/,
    );
    expect(body ?? classBefore).not.toBeNull();
  });
});
