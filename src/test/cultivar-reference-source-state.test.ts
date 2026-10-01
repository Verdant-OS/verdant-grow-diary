import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CULTIVAR_SOURCES,
  VERDANT_CULTIVARS,
  getCultivarGuideSections,
} from "@/constants/strainReferenceLibrary";
import {
  CULTIVAR_REFERENCE_SOURCE_COPY,
  cultivarReferenceSourceNotice,
} from "@/constants/cultivarReferenceSourceCopy";
import type { CultivarDatabaseSnapshot } from "@/lib/cultivarDatabaseReadModel";
import {
  buildCultivarDatabaseSeedPayload,
  cultivarSeedPayloadToSnapshot,
} from "@/lib/cultivarDatabaseSeedPayloadRules";
import {
  CULTIVAR_READ_ROW_CEILING,
  fetchPublishedCultivarSnapshot,
  type CultivarReferenceReadClient,
} from "@/lib/cultivarReferenceService";
import {
  BUNDLED_CULTIVAR_CATALOG,
  resolveCultivarReferenceSource,
} from "@/lib/cultivarReferenceSourceRules";
import { featureFlags } from "@/lib/featureFlags";

const snapshot = (): CultivarDatabaseSnapshot =>
  structuredClone(
    cultivarSeedPayloadToSnapshot(
      buildCultivarDatabaseSeedPayload({
        profiles: VERDANT_CULTIVARS,
        sources: CULTIVAR_SOURCES,
        sectionsFor: getCultivarGuideSections,
      }),
    ),
  );

interface Call {
  table: string;
  method: string;
  args: unknown[];
}

/** A fake client that records every builder call and serves a snapshot. */
function fakeClient(
  data: CultivarDatabaseSnapshot,
  overrides: Partial<Record<string, { data: unknown; error: { message: string } | null }>> = {},
) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      calls.push({ table, method: "from", args: [table] });
      const result = overrides[table] ?? {
        data: (data as Record<string, unknown>)[table],
        error: null,
      };
      const thenable = (filter?: [string, string]) => ({
        then<T>(resolveFn: (value: typeof result) => T) {
          if (!filter) return Promise.resolve(result).then(resolveFn);
          const [column, value] = filter;
          const rows = Array.isArray(result.data)
            ? (result.data as Record<string, unknown>[]).filter((row) => row[column] === value)
            : result.data;
          return Promise.resolve({ ...result, data: rows }).then(resolveFn);
        },
      });
      return {
        select(columns: string) {
          calls.push({ table, method: "select", args: [columns] });
          return Object.assign(thenable(), {
            eq(column: string, value: string) {
              calls.push({ table, method: "eq", args: [column, value] });
              return thenable([column, value]);
            },
          });
        },
      };
    },
  };
  return { client: client as unknown as CultivarReferenceReadClient, calls };
}

describe("cultivar reference service", () => {
  it("issues SELECTs only, on the nine reference tables, with published filters", async () => {
    const { client, calls } = fakeClient(snapshot());
    const result = await fetchPublishedCultivarSnapshot(client);
    expect(result.ok).toBe(true);
    expect([...new Set(calls.map((call) => call.method))].sort()).toEqual(["eq", "from", "select"]);
    expect(calls.filter((call) => call.method === "from").map((call) => call.table)).toHaveLength(
      9,
    );
    expect(calls.filter((call) => call.method === "eq")).toEqual([
      { table: "cultivars", method: "eq", args: ["publication_status", "published"] },
      { table: "cultivar_guides", method: "eq", args: ["publication_status", "published"] },
    ]);
    for (const call of calls.filter((item) => item.method === "select")) {
      expect(call.args[0]).not.toContain("*");
    }
  });

  it("drops non-published rows server-side before mapping", async () => {
    const data = snapshot() as unknown as Record<string, Record<string, unknown>[]>;
    data.cultivars.push({
      ...data.cultivars[0],
      id: "draft",
      slug: "draft-row",
      publication_status: "draft",
    });
    const { client } = fakeClient(data as unknown as CultivarDatabaseSnapshot);
    const result = await fetchPublishedCultivarSnapshot(client);
    expect(result.ok && result.snapshot.cultivars.some((row) => row.slug === "draft-row")).toBe(
      false,
    );
  });

  it("surfaces read errors, missing arrays, truncation, and thrown errors as failures", async () => {
    const base = snapshot();
    const errored = await fetchPublishedCultivarSnapshot(
      fakeClient(base, { cultivar_claims: { data: null, error: { message: "permission denied" } } })
        .client,
    );
    expect(errored).toEqual({ ok: false, error: "cultivar_claims: permission denied" });

    const noRows = await fetchPublishedCultivarSnapshot(
      fakeClient(base, { breeders: { data: null, error: null } }).client,
    );
    expect(noRows.ok).toBe(false);

    const truncated = await fetchPublishedCultivarSnapshot(
      fakeClient(base, {
        cultivar_guide_sections: {
          data: Array.from({ length: CULTIVAR_READ_ROW_CEILING }, () => ({})),
          error: null,
        },
      }).client,
    );
    expect(truncated).toMatchObject({ ok: false, error: expect.stringMatching(/truncated/) });

    const throwing = {
      from() {
        throw new Error("network down");
      },
    } as unknown as CultivarReferenceReadClient;
    expect(await fetchPublishedCultivarSnapshot(throwing)).toEqual({
      ok: false,
      error: "network down",
    });
  });
});

describe("cultivar reference source resolution", () => {
  it("defaults to the bundled library with the release flag off", () => {
    expect(featureFlags.cultivarDatabaseReadsEnabled).toBe(false);
    const resolution = resolveCultivarReferenceSource({
      databaseReadsEnabled: false,
      query: { status: "success", result: { ok: true, snapshot: snapshot() } },
    });
    expect(resolution).toMatchObject({ state: "bundled_fallback", reason: "flag_disabled" });
    expect(resolution.catalog).toBe(BUNDLED_CULTIVAR_CATALOG);
    expect(cultivarReferenceSourceNotice(resolution.reason)).toBeNull();
  });

  it("shows the labelled bundled library while loading and on read errors", () => {
    const loading = resolveCultivarReferenceSource({
      databaseReadsEnabled: true,
      query: { status: "pending" },
    });
    expect(loading).toMatchObject({ state: "loading", reason: "database_pending" });
    expect(loading.catalog).toBe(BUNDLED_CULTIVAR_CATALOG);

    for (const query of [
      { status: "error" as const, error: "boom" },
      { status: "success" as const, result: { ok: false as const, error: "denied" } },
    ]) {
      const resolution = resolveCultivarReferenceSource({ databaseReadsEnabled: true, query });
      expect(resolution).toMatchObject({ state: "error", reason: "database_error" });
      expect(resolution.catalog).toBe(BUNDLED_CULTIVAR_CATALOG);
      expect(cultivarReferenceSourceNotice(resolution.reason)).toBe(
        CULTIVAR_REFERENCE_SOURCE_COPY.database_error,
      );
    }
  });

  it("uses the database catalog only when every row maps", () => {
    const resolution = resolveCultivarReferenceSource({
      databaseReadsEnabled: true,
      query: { status: "success", result: { ok: true, snapshot: snapshot() } },
    });
    expect(resolution).toMatchObject({ state: "database", reason: null, refusedRowIssues: 0 });
    expect(resolution.catalog.origin).toBe("database");
    expect(resolution.catalog.profiles).toHaveLength(10);
    const gg4 = resolution.catalog.findBySlug("gg4");
    expect(gg4 && resolution.catalog.sectionsFor(gg4)).toHaveLength(14);
    expect(resolution.catalog.findBySlug("not-real")).toBeUndefined();
    expect(cultivarReferenceSourceNotice(resolution.reason)).toMatch(/sample reference data/i);
  });

  it("falls back as a whole, never partially, when any row is refused", () => {
    const data = snapshot() as unknown as Record<string, Record<string, unknown>[]>;
    data.cultivars[0].data_origin = "ai_draft";
    const resolution = resolveCultivarReferenceSource({
      databaseReadsEnabled: true,
      query: {
        status: "success",
        result: { ok: true, snapshot: data as unknown as CultivarDatabaseSnapshot },
      },
    });
    expect(resolution).toMatchObject({ state: "bundled_fallback", reason: "database_invalid" });
    expect(resolution.refusedRowIssues).toBeGreaterThan(0);
    expect(resolution.catalog).toBe(BUNDLED_CULTIVAR_CATALOG);
  });

  it("never upgrades evidence state on any fallback path", () => {
    const empty = resolveCultivarReferenceSource({
      databaseReadsEnabled: true,
      query: {
        status: "success",
        result: {
          ok: true,
          snapshot: Object.fromEntries(
            Object.keys(snapshot()).map((table) => [table, []]),
          ) as unknown as CultivarDatabaseSnapshot,
        },
      },
    });
    expect(empty).toMatchObject({ state: "bundled_fallback", reason: "database_empty" });
    for (const profile of empty.catalog.profiles) {
      expect(profile.verificationStatus).toBe("sample");
    }
    for (const notice of Object.values(CULTIVAR_REFERENCE_SOURCE_COPY)) {
      expect(notice).toMatch(/sample reference/i);
      expect(notice).not.toMatch(/\blive\b|verified|shipped/i);
    }
  });
});

describe("cultivar V1.1 read path static safety", () => {
  const FILES = [
    "src/lib/cultivarDatabaseReadModel.ts",
    "src/lib/cultivarDatabaseParityRules.ts",
    "src/lib/cultivarDatabaseSeedPayloadRules.ts",
    "src/lib/cultivarReferenceService.ts",
    "src/lib/cultivarReferenceSourceRules.ts",
    "src/hooks/usePublishedCultivars.ts",
    "src/constants/cultivarReferenceSourceCopy.ts",
    "scripts/audit-cultivar-database-parity.ts",
  ];
  const executable = FILES.map((file) =>
    readFileSync(resolve(process.cwd(), file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, ""),
  ).join("\n");

  it("has no writes, RPCs, Edge Function calls, or service-role usage", () => {
    expect(executable).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
    expect(executable).not.toMatch(/\.rpc\s*\(|functions\.invoke/);
    // The audit script reads SUPABASE_SERVICE_ROLE_KEY only to refuse it.
    expect(executable).not.toMatch(/createClient\([^)]*SERVICE_ROLE/);
    expect(executable).not.toMatch(/service_role/);
  });

  it("reads no private grow tables and touches no alert, action, or device path", () => {
    for (const table of ["plants", "grows", "tents", "sensor_readings", "alerts", "action_queue"]) {
      expect(executable).not.toMatch(new RegExp(`from\\(\\s*["']${table}["']`));
    }
    expect(executable).not.toMatch(/createAlert|createAction|device_command|mqtt/i);
  });

  it("does not read the Math.random or wall-clock in pure modules", () => {
    const pure = FILES.slice(0, 5)
      .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
      .join("\n");
    expect(pure).not.toMatch(/Math\.random|Date\.now\(|new Date\(\)/);
  });
});
