import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

import {
  normalizeDiaryEntries,
  type NormalizedDiaryEntry,
} from "@/lib/diaryEntryRules";
import { buildPhotoHistory } from "@/lib/photoHistoryRules";
import { typedWateringWriteEnabled } from "@/lib/featureFlags";

const REPO_ROOT = process.cwd();

function rg(args: string[]): string {
  try {
    return execSync(`rg ${args.map((a) => JSON.stringify(a)).join(" ")}`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string };
    if (e && e.status === 1) return "";
    throw err;
  }
}

function normalize(raw: unknown[]): NormalizedDiaryEntry[] {
  return normalizeDiaryEntries({ rawEntries: raw });
}

const validPhoto = {
  id: "p1",
  grow_id: "g1",
  plant_id: "pl1",
  tent_id: "t1",
  stage: "flower",
  entry_at: "2025-05-10T12:00:00.000Z",
  entry_type: "photo",
  note: "Week 5 — frosty colas forming.",
  photo_url: "https://example.com/photos/abc.jpg",
  details: {},
};

describe("buildPhotoHistory", () => {
  it("derives a photo row from a valid diary entry", () => {
    const rows = buildPhotoHistory(normalize([validPhoto]));
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.id).toBe("p1");
    expect(r.growId).toBe("g1");
    expect(r.plantId).toBe("pl1");
    expect(r.tentId).toBe("t1");
    expect(r.stage).toBe("flower");
    expect(r.eventType).toBe("photo");
    expect(r.photoUrl).toBe("https://example.com/photos/abc.jpg");
    expect(r.caption).toContain("frosty");
    expect(r.warnings).toEqual([]);
    expect(r.occurredAt).toBe("2025-05-10T12:00:00.000Z");
  });

  it("returns empty array for empty input", () => {
    expect(buildPhotoHistory([])).toEqual([]);
    expect(buildPhotoHistory(normalize([]))).toEqual([]);
  });

  it("non-photo entries without a URL are excluded", () => {
    const note = { ...validPhoto, id: "n1", entry_type: "note", photo_url: null };
    const watering = {
      ...validPhoto,
      id: "w1",
      entry_type: "watering",
      photo_url: null,
      details: { watering_amount_ml: 500 },
    };
    expect(buildPhotoHistory(normalize([note, watering]))).toEqual([]);
  });

  it("non-photo entries WITH a valid URL are surfaced (gallery includes attached media)", () => {
    const noteWithPhoto = {
      ...validPhoto,
      id: "np1",
      entry_type: "note",
      photo_url: "https://cdn.example.com/x.png",
    };
    const rows = buildPhotoHistory(normalize([noteWithPhoto]));
    expect(rows).toHaveLength(1);
    expect(rows[0].photoUrl).toBe("https://cdn.example.com/x.png");
    expect(rows[0].eventType).toBe("note");
  });

  it("photo entry with missing URL surfaces a warning (not dropped, not crashed)", () => {
    const e = { ...validPhoto, id: "m1", photo_url: null };
    const rows = buildPhotoHistory(normalize([e]));
    expect(rows).toHaveLength(1);
    expect(rows[0].photoUrl).toBeNull();
    expect(rows[0].warnings.join("|")).toMatch(/photo_url/i);
  });

  it("photo entry with blank URL surfaces a warning", () => {
    const e = { ...validPhoto, id: "b1", photo_url: "   " };
    const rows = buildPhotoHistory(normalize([e]));
    expect(rows).toHaveLength(1);
    expect(rows[0].photoUrl).toBeNull();
    expect(rows[0].warnings.join("|")).toMatch(/photo_url/i);
  });

  it("photo entry with unsupported protocol surfaces a warning and drops the URL", () => {
    const js = { ...validPhoto, id: "j1", photo_url: "javascript:alert(1)" };
    const data = { ...validPhoto, id: "d1", photo_url: "data:image/png;base64,AAAA" };
    const rowsJs = buildPhotoHistory(normalize([js]));
    const rowsData = buildPhotoHistory(normalize([data]));
    expect(rowsJs[0].photoUrl).toBeNull();
    expect(rowsJs[0].warnings.join("|")).toMatch(/photo_url/i);
    expect(rowsData[0].photoUrl).toBeNull();
    expect(rowsData[0].warnings.join("|")).toMatch(/photo_url/i);
  });

  it("photo entry with malformed URL surfaces a warning", () => {
    const e = { ...validPhoto, id: "x1", photo_url: "not a url" };
    const rows = buildPhotoHistory(normalize([e]));
    expect(rows).toHaveLength(1);
    expect(rows[0].photoUrl).toBeNull();
    expect(rows[0].warnings.join("|")).toMatch(/photo_url/i);
  });

  it("caption preview renders safely (very long note is truncated)", () => {
    const long = "a".repeat(500);
    const e = { ...validPhoto, id: "c1", note: long };
    const rows = buildPhotoHistory(normalize([e]));
    expect(rows).toHaveLength(1);
    expect(rows[0].caption.length).toBeLessThanOrEqual(200);
    expect(typeof rows[0].caption).toBe("string");
  });

  it("missing/empty note yields an empty caption string (no crash)", () => {
    const e = { ...validPhoto, id: "nc1", note: null };
    const rows = buildPhotoHistory(normalize([e]));
    expect(rows).toHaveLength(1);
    expect(rows[0].caption).toBe("");
  });

  it("orders rows newest-first deterministically", () => {
    const a = { ...validPhoto, id: "a", entry_at: "2025-05-01T00:00:00Z" };
    const b = { ...validPhoto, id: "b", entry_at: "2025-05-03T00:00:00Z" };
    const c = { ...validPhoto, id: "c", entry_at: "2025-05-02T00:00:00Z" };
    const rows = buildPhotoHistory(normalize([a, b, c]));
    expect(rows.map((r) => r.id)).toEqual(["b", "c", "a"]);
    const rows2 = buildPhotoHistory(normalize([c, a, b]));
    expect(rows2.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("entries with no valid timestamp sort last, stable by id", () => {
    const bad = { ...validPhoto, id: "z", entry_at: "not-a-date" };
    const good = { ...validPhoto, id: "y", entry_at: "2025-05-10T00:00:00Z" };
    const rows = buildPhotoHistory(normalize([bad, good]));
    expect(rows.map((r) => r.id)).toEqual(["y", "z"]);
  });
});

describe("PhotoHistoryPanel runtime safety", () => {
  it("typedWateringWriteEnabled remains false", () => {
    expect(typedWateringWriteEnabled).toBe(false);
  });

  it("no runtime code calls create_watering_event RPC", () => {
    const hits = rg(["-n", "create_watering_event", "src"])
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((line) => {
        const path = line.split(":")[0];
        if (path === "src/integrations/supabase/types.ts") return false;
        if (path === "src/lib/quickLogTypedEventPayloadRules.ts") return false;
        if (path === "src/lib/writeWateringTypedEvent.ts") return false;
        if (path === "src/lib/featureFlags.ts") return false;
        if (path.startsWith("src/test/")) return false;
        return true;
      });
    expect(hits).toEqual([]);
  });

  it("PhotoHistoryPanel does not read raw diary details JSON or perform writes", () => {
    const src = readFileSync(
      resolve(REPO_ROOT, "src/components/PhotoHistoryPanel.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/\.details\?\./);
    expect(src).not.toMatch(/\["details"\]/);
    expect(src).not.toMatch(/JSON\.parse/);
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.upsert\s*\(/);
    expect(src).not.toMatch(/create_watering_event/);
    expect(src).not.toMatch(/service_role/i);
  });
});
