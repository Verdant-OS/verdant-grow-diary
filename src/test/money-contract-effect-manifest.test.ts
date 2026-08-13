/**
 * Contract for scripts/lib/moneyContractEffectManifest.mjs.
 *
 * Why it exists: migration-drift-probe.yml and money-migration-drift-alert.yml
 * both answer "did this migration RUN?" by reading schema_migrations. Neither
 * can answer "is what it did still true?" — and in this repo that gap is not
 * theoretical. 20260727050000_ai_credit_service_contract_forward_reassert.sql
 * exists BECAUSE a later immutable export reintroduced earlier function bodies
 * over a contract that had already been applied; schema_migrations would have
 * reported that migration applied the whole time.
 *
 * The load-bearing properties are that the manifest is derived from the real
 * migration (not hand-restated, which could drift), that it enumerates ALL
 * overloads rather than only the pinned signature (the documented failure
 * mode is an export reintroducing an EARLIER overload beside the current
 * one), and that it never asserts pass/fail on the caller's behalf.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseContractSql,
  sqlNameArray,
  buildIntrospectionSql,
  compare,
} from "../../scripts/lib/moneyContractEffectManifest.mjs";

const ROOT = resolve(__dirname, "../..");
const CONTRACT_SQL = readFileSync(
  resolve(
    ROOT,
    "supabase/migrations/20260727050000_ai_credit_service_contract_forward_reassert.sql",
  ),
  "utf8",
);

describe("moneyContractEffectManifest — parses the REAL contract migration", () => {
  const parsed = parseContractSql(CONTRACT_SQL);

  it("finds both money functions the migration defines", () => {
    expect(parsed.function_names).toEqual(["ai_credit_refund", "ai_credit_spend"]);
  });

  it("finds the results table it locks down", () => {
    expect(parsed.tables).toContain("ai_credit_spend_results");
  });

  it("captures service_role as the intended sole executor of both functions", () => {
    const byName = (name: string) =>
      parsed.intended_execute_grants.filter((g) => g.name === name).map((g) => g.grantee);
    expect(byName("ai_credit_spend")).toEqual(["service_role"]);
    expect(byName("ai_credit_refund")).toEqual(["service_role"]);
  });

  it("produces a non-empty manifest — a parser matching nothing would be vacuous", () => {
    // This is the guard the CLI script's loadContract() checks before ever
    // querying production. Pinning it here means a regex regression is caught
    // by a fast unit test instead of by the introspection tool going silent.
    expect(parsed.function_names.length).toBeGreaterThan(0);
  });
});

describe("moneyContractEffectManifest — parseContractSql on synthetic input", () => {
  it("is case-insensitive and tolerates CREATE OR REPLACE", () => {
    const sql = `create or replace function public.my_fn(a uuid) returns void as $$ select 1 $$ language sql;`;
    expect(parseContractSql(sql).function_names).toEqual(["my_fn"]);
  });

  it("returns an empty manifest for SQL with no target objects, rather than throwing", () => {
    // Emptiness is a caller decision (loadContract() bails on it); the parser
    // itself must not decide that for every caller.
    const parsed = parseContractSql("SELECT 1;");
    expect(parsed.function_names).toEqual([]);
    expect(parsed.tables).toEqual([]);
    expect(parsed.intended_execute_grants).toEqual([]);
  });

  it("captures multiple distinct grantees for the same function", () => {
    const sql = [
      "GRANT EXECUTE ON FUNCTION public.multi_fn(uuid) TO service_role;",
      "GRANT EXECUTE ON FUNCTION public.multi_fn(uuid) TO authenticated;",
    ].join("\n");
    const grantees = parseContractSql(sql).intended_execute_grants.map((g) => g.grantee);
    expect(grantees.sort()).toEqual(["authenticated", "service_role"]);
  });
});

describe("moneyContractEffectManifest — sqlNameArray refuses unsafe input", () => {
  it("builds a well-formed array literal for clean identifiers", () => {
    expect(sqlNameArray(["ai_credit_spend", "ai_credit_refund"])).toBe(
      "ARRAY['ai_credit_spend','ai_credit_refund']::text[]",
    );
  });

  it("throws rather than interpolating a quote or other SQL metacharacter", () => {
    // Defence in depth: names here originate from our own migration, but this
    // guard is the only thing standing between a future regex mismatch and
    // string-building a query. It must actually throw, not just documented to.
    expect(() => sqlNameArray(["ai_credit_spend'; DROP TABLE users; --"])).toThrow(
      /unsafe identifier/,
    );
  });

  it("throws on an empty-string identifier rather than emitting ARRAY['']", () => {
    expect(() => sqlNameArray([""])).toThrow(/unsafe identifier/);
  });
});

describe("moneyContractEffectManifest — buildIntrospectionSql", () => {
  it("embeds the parsed function names as an ANY(ARRAY[...]) filter", () => {
    const contract = { function_names: ["ai_credit_spend"], tables: ["ai_credit_spend_results"] };
    const sql = buildIntrospectionSql(contract);
    expect(sql).toContain("p.proname = ANY(ARRAY['ai_credit_spend']::text[])");
    expect(sql).toContain("c.relname = ANY(ARRAY['ai_credit_spend_results']::text[])");
  });

  it("reads ALL overloads of a name, not a specific signature", () => {
    // The documented failure mode: an export reintroducing an earlier
    // overload beside the current one. Filtering by proname (not by argument
    // types) is what makes that visible.
    const sql = buildIntrospectionSql({ function_names: ["ai_credit_spend"], tables: [] });
    expect(sql).not.toMatch(/pronargs|proargtypes/);
    expect(sql).toContain("p.proname = ANY(");
  });

  it("treats a NULL acl as the built-in default, not as 'no grants'", () => {
    // For a function, NULL proacl means everyone gets EXECUTE by default.
    // Reading NULL as empty would report a wide-open function as locked down.
    const sql = buildIntrospectionSql({ function_names: ["x"], tables: [] });
    expect(sql).toContain("coalesce(p.proacl, acldefault('f', p.proowner))");
  });

  it("propagates sqlNameArray's rejection rather than swallowing it", () => {
    expect(() =>
      buildIntrospectionSql({ function_names: ["ok"], tables: ["bad'; DROP TABLE x; --"] }),
    ).toThrow(/unsafe identifier/);
  });
});

describe("moneyContractEffectManifest — compare() never decides pass/fail", () => {
  const contract = {
    function_names: ["ai_credit_spend"],
    tables: ["ai_credit_spend_results"],
    intended_execute_grants: [{ name: "ai_credit_spend", arg_types: [], grantee: "service_role" }],
  };

  it("flags an absent function without asserting anything about it", () => {
    const notes = compare(contract, { functions: [], tables: [] });
    const note = notes.find((n) => n.object === "ai_credit_spend");
    expect(note?.observation).toBe("absent");
  });

  it("flags multiple overloads AND still reports each one's grantees", () => {
    const observed = {
      functions: [
        {
          signature: "public.ai_credit_spend(uuid)",
          name: "ai_credit_spend",
          acl: [{ grantee: "service_role", privilege: "EXECUTE" }],
          security_definer: true,
          config: ["search_path=public,pg_temp"],
        },
        {
          signature: "public.ai_credit_spend(uuid,text)",
          name: "ai_credit_spend",
          acl: [{ grantee: "PUBLIC", privilege: "EXECUTE" }],
          security_definer: true,
          config: [],
        },
      ],
      tables: [],
    };
    const notes = compare(contract, observed);
    const overloadNote = notes.find((n) => n.observation === "multiple_overloads");
    expect(overloadNote?.signatures).toHaveLength(2);
    // The stale overload's PUBLIC grant must still surface — that's the
    // whole point of enumerating every overload instead of one signature.
    const grantNotes = notes.filter((n) => n.observation === "execute_grantees");
    expect(grantNotes.some((n) => n.detail === "PUBLIC")).toBe(true);
  });

  it("reports observed grants next to intended grants without judging the gap", () => {
    const observed = {
      functions: [
        {
          signature: "public.ai_credit_spend(uuid)",
          name: "ai_credit_spend",
          acl: [{ grantee: "authenticated", privilege: "EXECUTE" }], // wrong role, on purpose
          security_definer: true,
          config: [],
        },
      ],
      tables: [],
    };
    const note = compare(contract, observed).find((n) => n.observation === "execute_grantees");
    expect(note?.detail).toBe("authenticated");
    expect(note?.intended_by_migration).toBe("service_role");
    // compare() does not have a "matches"/"violates" field — the mismatch is
    // left for a human or a future gate to judge from these two values.
    expect(note).not.toHaveProperty("matches");
    expect(note).not.toHaveProperty("ok");
    expect(note).not.toHaveProperty("pass");
  });

  it("reports table grants and RLS state as observations", () => {
    const observed = {
      functions: [],
      tables: [
        {
          name: "ai_credit_spend_results",
          rls: false,
          acl: [{ grantee: "service_role", privilege: "SELECT" }],
        },
      ],
    };
    const note = compare(contract, observed).find(
      (n) => n.object === "table ai_credit_spend_results",
    );
    expect(note?.detail).toBe("service_role:SELECT");
    expect(note?.rls).toBe(false);
  });
});
