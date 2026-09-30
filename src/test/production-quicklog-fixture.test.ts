import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { Page, Request, Response } from "@playwright/test";
import {
  buildQuickLogSmokeNote,
  productionFixturePlantId,
  productionFixtureContextMatchesTarget,
  productionFixtureResponseKind,
  projectFixtureOwnedRow,
  validateProductionFixtureTarget,
  validateProductionQuickLogEnv,
  QUICKLOG_SMOKE_BACKEND_ORIGIN,
  type ProductionFixtureEvidence,
} from "../../e2e/lib/productionQuickLogFixtureRules";
import { observeProductionQuickLogFixture } from "../../e2e/lib/productionQuickLogFixtureProof";
import {
  validateFixtureEnv,
  validatePhenoWriteFixtureEnv,
  pageTextMatchesFixture,
} from "../../e2e/lib/fixtureSafety";

const owner = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const foreign = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const plantId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const tentId = "33333333-3333-4333-8333-333333333333";
const growId = "44444444-4444-4444-8444-444444444444";
const plantUrl = `https://verdantgrowdiary.com/plants/${plantId}`;
const expected = { grow: "QA Test Grow", tent: "E2E Test Tent", plant: "E2E Test Plant" };
const env = {
  E2E_FIXTURE_MODE: "true",
  E2E_GROW_1_PLANT_URL: plantUrl,
  E2E_FIXTURE_EXPECTED_GROW_NAME: expected.grow,
  E2E_FIXTURE_EXPECTED_TENT_NAME: expected.tent,
  E2E_FIXTURE_EXPECTED_PLANT_NAME: expected.plant,
};
const target = { plantId, tentId, growId };
function evidence(): ProductionFixtureEvidence {
  return {
    identity: { id: owner, email: "cheekhimself@gmail.com" },
    invalidated: false,
    plants: [
      {
        id: plantId,
        user_id: owner,
        name: expected.plant,
        is_archived: false,
        tent_id: tentId,
        grow_id: growId,
      },
      {
        id: secondId,
        user_id: owner,
        name: "E2E Test Plant 2",
        is_archived: false,
        tent_id: tentId,
        grow_id: growId,
      },
    ],
    tents: [
      { id: tentId, user_id: owner, name: expected.tent, is_archived: false, grow_id: growId },
    ],
    grows: [{ id: growId, user_id: owner, name: expected.grow, is_archived: false }],
  };
}
function harness() {
  const listeners = new Map<string, (event: unknown) => void>();
  let url = plantUrl;
  const page = {
    url: () => url,
    on: (event: string, fn: (value: unknown) => void) => {
      listeners.set(event, fn);
    },
    off: (event: string, fn: (value: unknown) => void) => {
      if (listeners.get(event) === fn) listeners.delete(event);
    },
  } as unknown as Page;
  const proof = observeProductionQuickLogFixture(page);
  function emit(
    endpoint: string,
    body: unknown,
    status = 200,
    method = "GET",
    origin = QUICKLOG_SMOKE_BACKEND_ORIGIN,
  ) {
    listeners.get("response")?.({
      url: () => `${origin}${endpoint}`,
      status: () => status,
      request: () => ({ method: () => method }),
      json: async () => body,
    } as unknown as Response);
  }
  function populate() {
    const data = evidence();
    emit("/auth/v1/user", { ...data.identity, private_unused_field: "discarded" });
    for (const kind of ["plants", "tents", "grows"] as const) emit(`/rest/v1/${kind}`, data[kind]);
  }
  return {
    proof,
    emit,
    populate,
    startRead: (endpoint: string) => {
      const request = {
        url: () => `${QUICKLOG_SMOKE_BACKEND_ORIGIN}${endpoint}`,
        method: () => "GET",
      } as Request;
      listeners.get("request")?.(request);
      return request;
    },
    finishRead: (request: Request) => listeners.get("requestfinished")?.(request),
    failRead: (request: Request) => listeners.get("requestfailed")?.(request),
    navigate: (next: string) => {
      url = next;
    },
  };
}
afterEach(() => vi.useRealTimers());

describe("production Quick Log fixture policy", () => {
  it("accepts the production fixture URL with its explicit tent context", () => {
    const contextual = `${plantUrl}?tentId=${tentId}`;
    expect(productionFixturePlantId(contextual)).toBe(plantId);
    expect(validateProductionQuickLogEnv({ ...env, E2E_GROW_1_PLANT_URL: contextual }).ok).toBe(
      true,
    );
  });
  it("requires the explicitly approved canonical production fixture", () => {
    expect(validateProductionQuickLogEnv(env)).toEqual({ ok: true, errors: [], expected });
    expect(productionFixturePlantId(plantUrl)).toBe(plantId);
  });
  it.each([
    undefined,
    null,
    "",
    "/plants/id",
    `http://verdantgrowdiary.com/plants/${plantId}`,
    `https://verdantgrowdiary.com.evil.example/plants/${plantId}`,
    `https://user:pass@verdantgrowdiary.com/plants/${plantId}`,
    `https://verdantgrowdiary.com:444/plants/${plantId}`,
    `${plantUrl}?unknownId=${growId}`,
    `${plantUrl}#x`,
    `${plantUrl}/`,
    "https://verdantgrowdiary.com/plants/not-a-uuid",
    `http://localhost:5173/plants/${plantId}`,
  ])("rejects non-canonical plant URL %s", (value) => {
    expect(productionFixturePlantId(value)).toBeNull();
  });
  it.each([
    "E2E_FIXTURE_MODE",
    "E2E_FIXTURE_EXPECTED_TENT_NAME",
    "E2E_FIXTURE_EXPECTED_PLANT_NAME",
  ] as const)("requires %s", (key) => {
    expect(validateProductionQuickLogEnv({ ...env, [key]: "" }).ok).toBe(false);
  });
  it("accepts QA names only in the explicit production policy and retains legacy guards", () => {
    expect(
      validateProductionQuickLogEnv({
        ...env,
        E2E_FIXTURE_EXPECTED_GROW_NAME: "QA Save Retrieve",
        E2E_FIXTURE_EXPECTED_TENT_NAME: "QA Tent",
        E2E_FIXTURE_EXPECTED_PLANT_NAME: "QA Plant",
      }).ok,
    ).toBe(true);
    expect(validateFixtureEnv(env).ok).toBe(false);
    expect(validatePhenoWriteFixtureEnv(env).ok).toBe(false);
    const qa = { grow: "QA Grow", tent: "QA Tent", plant: "QA Plant" };
    expect(pageTextMatchesFixture("QA Grow QA Tent QA Plant", qa).ok).toBe(false);
    expect(pageTextMatchesFixture("QA Grow QA Tent QA Plant", qa, { allowQaMarker: true }).ok).toBe(
      true,
    );
  });
  it("refuses a customer account hint and unmarked fixture names", () => {
    expect(
      validateProductionQuickLogEnv({
        ...env,
        E2E_FIXTURE_EXPECTED_ACCOUNT_HINT: "matt@verdantgrowdiary.com",
      }).ok,
    ).toBe(false);
    expect(
      validateProductionQuickLogEnv({ ...env, E2E_FIXTURE_EXPECTED_GROW_NAME: "Skunk Gas Run" }).ok,
    ).toBe(false);
    expect(validateProductionQuickLogEnv(null).ok).toBe(false);
    expect(validateProductionQuickLogEnv(undefined).ok).toBe(false);
  });
  it("accepts matching account, active rows, exact names and relationships", () => {
    expect(validateProductionFixtureTarget(evidence(), target, expected)).toEqual({
      ok: true,
      errors: [],
    });
    expect(
      validateProductionFixtureTarget(
        evidence(),
        { ...target, plantId: secondId },
        expected,
        "E2E Test Plant 2",
      ).ok,
    ).toBe(true);
  });
  it("binds both optional UUID contexts to the owned target and rejects duplicates", () => {
    expect(
      productionFixtureContextMatchesTarget(
        `${plantUrl}?tentId=${tentId}&growId=${growId}`,
        target,
      ),
    ).toBe(true);
    expect(productionFixtureContextMatchesTarget(`${plantUrl}?tentId=${growId}`, target)).toBe(
      false,
    );
    expect(productionFixtureContextMatchesTarget(`${plantUrl}?growId=${tentId}`, target)).toBe(
      false,
    );
    for (const query of [
      `tentId=${tentId}&tentId=${tentId}`,
      "tentId=",
      "growId=not-a-uuid",
      `unknown=${tentId}`,
    ])
      expect(productionFixturePlantId(`${plantUrl}?${query}`)).toBeNull();
  });
  it.each(["plants", "tents", "grows"] as const)(
    "refuses foreign ownership even when the account can read %s",
    (kind) => {
      const data = evidence();
      expect(
        validateProductionFixtureTarget(
          { ...data, [kind]: data[kind].map((row) => ({ ...row, user_id: foreign })) },
          target,
          expected,
        ).ok,
      ).toBe(false);
    },
  );
  it.each(["plants", "tents", "grows"] as const)("refuses absent %s evidence", (kind) => {
    expect(
      validateProductionFixtureTarget({ ...evidence(), [kind]: [] }, target, expected).ok,
    ).toBe(false);
  });
  it.each(["matt@verdantgrowdiary.com", "KEEP@example.com", "", "other@example.com"])(
    "refuses unapproved signed-in email %s",
    (email) => {
      expect(
        validateProductionFixtureTarget(
          { ...evidence(), identity: { id: owner, email } },
          target,
          expected,
        ).ok,
      ).toBe(false);
    },
  );
  it("refuses unknown identity, invalidation, null evidence, wrong names and relationships", () => {
    expect(
      validateProductionFixtureTarget({ ...evidence(), identity: null }, target, expected).ok,
    ).toBe(false);
    expect(
      validateProductionFixtureTarget({ ...evidence(), invalidated: true }, target, expected).ok,
    ).toBe(false);
    expect(validateProductionFixtureTarget(null, null, null).ok).toBe(false);
    expect(validateProductionFixtureTarget(undefined, undefined, undefined).ok).toBe(false);
    expect(
      validateProductionFixtureTarget(evidence(), { ...target, tentId: growId }, expected).ok,
    ).toBe(false);
    expect(
      validateProductionFixtureTarget(evidence(), target, {
        ...expected,
        plant: "Other Test Plant",
      }).ok,
    ).toBe(false);
  });
  it("projects only active ownership fields and ignores partial/invalid rows", () => {
    const row = evidence().plants[0];
    expect(projectFixtureOwnedRow({ ...row, private_unused_field: "discarded" })).toEqual(row);
    for (const invalid of [
      null,
      undefined,
      {},
      { id: plantId, name: expected.plant },
      { ...row, is_archived: true },
      { ...row, user_id: "invalid" },
    ])
      expect(projectFixtureOwnedRow(invalid)).toBeNull();
  });
  it("accepts only successful GETs from the pinned public backend", () => {
    expect(
      productionFixtureResponseKind(`${QUICKLOG_SMOKE_BACKEND_ORIGIN}/auth/v1/user`, "GET", 200),
    ).toBe("identity");
    for (const kind of ["plants", "tents", "grows"] as const)
      expect(
        productionFixtureResponseKind(
          `${QUICKLOG_SMOKE_BACKEND_ORIGIN}/rest/v1/${kind}?select=*`,
          "GET",
          200,
        ),
      ).toBe(kind);
    for (const [url, method, status] of [
      [`${QUICKLOG_SMOKE_BACKEND_ORIGIN}/auth/v1/user`, "GET", 401],
      [`${QUICKLOG_SMOKE_BACKEND_ORIGIN}/rest/v1/plants`, "POST", 200],
      ["https://evil.example/auth/v1/user", "GET", 200],
      [`${QUICKLOG_SMOKE_BACKEND_ORIGIN}/rest/v1/diary_entries`, "GET", 200],
      ["bad", "GET", 200],
    ] as const)
      expect(productionFixtureResponseKind(url, method, status)).toBeNull();
  });
  it("tags both notes with the exact caller time, is deterministic and rejects an invalid clock", () => {
    const date = new Date("2026-09-29T03:00:00Z");
    expect(buildQuickLogSmokeNote(date, 1)).toBe(
      "[smoke 2026-09-29T03:00:00.000Z] Quick Log checklist observation 1",
    );
    expect(buildQuickLogSmokeNote(date, 2)).toContain("observation 2");
    expect(buildQuickLogSmokeNote(date, 1)).toEqual(buildQuickLogSmokeNote(date, 1));
    expect(() => buildQuickLogSmokeNote(new Date(NaN), 1)).toThrow("smoke_clock_invalid");
    const data = evidence();
    const before = JSON.stringify(data);
    expect(validateProductionFixtureTarget(data, target, expected)).toEqual(
      validateProductionFixtureTarget(data, target, expected),
    );
    expect(JSON.stringify(data)).toBe(before);
  });
});

describe("read-only production fixture observer", () => {
  it("accepts the matching tent context with grow name derived from owned evidence", async () => {
    const h = harness();
    h.populate();
    const contextual = `${plantUrl}?tentId=${tentId}`;
    h.navigate(contextual);
    const result = await h.proof.assertInitial({
      ...env,
      E2E_GROW_1_PLANT_URL: contextual,
      E2E_FIXTURE_EXPECTED_GROW_NAME: "",
    });
    expect(result.expected.grow).toBe(expected.grow);
    await expect(
      h.proof.assertTarget({ ...target, plantId: secondId }, result.expected, "E2E Test Plant 2"),
    ).resolves.toBeUndefined();
  });
  it("invalidates the proof if the route's tent context changes after verification", async () => {
    const h = harness();
    h.populate();
    await h.proof.assertInitial(env);
    h.navigate(`${plantUrl}?tentId=${growId}`);
    await expect(h.proof.assertTarget(target, expected, expected.plant)).rejects.toThrow(
      "fixture_evidence_invalidated",
    );
  });
  it("refuses mismatched tent/grow URL context despite valid ownership", async () => {
    for (const query of [`tentId=${growId}`, `growId=${tentId}`]) {
      const h = harness();
      h.populate();
      await expect(
        h.proof.assertInitial({ ...env, E2E_GROW_1_PLANT_URL: `${plantUrl}?${query}` }),
      ).rejects.toThrow("context_mismatch");
    }
  });
  it("does not derive a grow name from an unowned or unmarked row", async () => {
    for (const row of [
      { ...evidence().grows[0], user_id: foreign },
      { ...evidence().grows[0], name: "Skunk Gas Run" },
    ]) {
      vi.useFakeTimers();
      const h = harness();
      h.populate();
      h.emit("/rest/v1/grows", [row]);
      const failure = expect(
        h.proof.assertInitial({ ...env, E2E_FIXTURE_EXPECTED_GROW_NAME: "" }),
      ).rejects.toThrow("ownership refused");
      await vi.advanceTimersByTimeAsync(20_100);
      await failure;
      vi.useRealTimers();
    }
  });
  it("derives an omitted grow name only from the positively owned grow read", async () => {
    const h = harness();
    h.populate();
    const result = await h.proof.assertInitial({ ...env, E2E_FIXTURE_EXPECTED_GROW_NAME: "" });
    expect(result.expected.grow).toBe(expected.grow);
  });
  it("clears prior proof for a null default-select ownership response", async () => {
    const h = harness();
    h.populate();
    await h.proof.assertInitial(env);
    h.emit("/rest/v1/plants", null);
    await expect(h.proof.assertTarget(target, expected, expected.plant)).rejects.toThrow(
      "plant_owned_fixture_required",
    );
  });
  it("does not reuse older ownership after a successful empty full-row read", async () => {
    const h = harness();
    h.populate();
    await h.proof.assertInitial(env);
    h.emit(`/rest/v1/plants?select=*&id=eq.${plantId}`, []);
    await expect(h.proof.assertTarget(target, expected, expected.plant)).rejects.toThrow(
      "plant_owned_fixture_required",
    );
    await expect(
      h.proof.assertTarget({ ...target, plantId: secondId }, expected, "E2E Test Plant 2"),
    ).resolves.toBeUndefined();
  });
  it("does not reuse rows omitted from a new complete all-plant snapshot", async () => {
    const h = harness();
    h.populate();
    await h.proof.assertInitial(env);
    h.emit("/rest/v1/plants?select=*&is_archived=eq.false", []);
    await expect(h.proof.assertTarget(target, expected, expected.plant)).rejects.toThrow(
      "plant_owned_fixture_required",
    );
  });
  it("blocks a save while a new authoritative read is still in flight", async () => {
    const h = harness();
    h.populate();
    await h.proof.assertInitial(env);
    const request = h.startRead("/auth/v1/user");
    await expect(h.proof.assertTarget(target, expected, expected.plant)).rejects.toThrow(
      "fixture_reads_in_flight",
    );
    h.finishRead(request);
    await expect(h.proof.assertTarget(target, expected, expected.plant)).resolves.toBeUndefined();
  });
  it("invalidates earlier proof after an authoritative request fails without a response", async () => {
    const h = harness();
    h.populate();
    await h.proof.assertInitial(env);
    const request = h.startRead("/rest/v1/plants");
    h.failRead(request);
    await expect(h.proof.assertTarget(target, expected, expected.plant)).rejects.toThrow(
      "fixture_evidence_invalidated",
    );
  });
  it("accepts observed server identity and rows without issuing requests or reading tokens", async () => {
    const h = harness();
    h.populate();
    expect(await h.proof.assertInitial(env)).toEqual({ ok: true, errors: [], expected });
    await expect(
      h.proof.assertTarget({ ...target, plantId: secondId }, expected, "E2E Test Plant 2"),
    ).resolves.toBeUndefined();
    h.proof.dispose();
  });
  it("refuses a target whose ownership was never observed", async () => {
    const h = harness();
    await expect(h.proof.assertTarget(target, expected, expected.plant)).rejects.toThrow(
      "save refused",
    );
  });
  it("does not accept an identity from another backend or a write response", async () => {
    const h = harness();
    const data = evidence();
    h.emit("/auth/v1/user", data.identity, 200, "GET", "https://evil.example");
    for (const kind of ["plants", "tents", "grows"] as const)
      h.emit(`/rest/v1/${kind}`, data[kind], 200, "POST");
    await expect(h.proof.assertTarget(target, expected, expected.plant)).rejects.toThrow(
      "approved_server_account_required",
    );
  });
  it.each(["identity", "owner", "archive", "tent", "grow", "name", "failed-read"])(
    "invalidates prior proof after %s changes",
    async (change) => {
      const h = harness();
      h.populate();
      await h.proof.assertInitial(env);
      if (change === "identity")
        h.emit("/auth/v1/user", { id: foreign, email: "matt@verdantgrowdiary.com" });
      else if (change === "failed-read") h.emit("/rest/v1/plants", {}, 503);
      else
        h.emit("/rest/v1/plants", [
          {
            ...evidence().plants[0],
            ...(change === "owner"
              ? { user_id: foreign }
              : change === "archive"
                ? { is_archived: true }
                : change === "tent"
                  ? { tent_id: growId }
                  : change === "grow"
                    ? { grow_id: tentId }
                    : { name: "Other Test Plant" }),
          },
        ]);
      await expect(h.proof.assertTarget(target, expected, expected.plant)).rejects.toThrow(
        "fixture_evidence_invalidated",
      );
    },
  );
  it("rejects malformed identity and failed revalidation", async () => {
    for (const [body, status] of [
      [{}, 200],
      [null, 401],
    ] as const) {
      const h = harness();
      h.populate();
      await h.proof.assertInitial(env);
      h.emit("/auth/v1/user", body, status);
      await expect(h.proof.assertTarget(target, expected, expected.plant)).rejects.toThrow(
        "fixture_evidence_invalidated",
      );
    }
  });
  it("rejects an auth redirect or a different initial route", async () => {
    const h = harness();
    h.populate();
    h.navigate("https://verdantgrowdiary.com/auth");
    await expect(h.proof.assertInitial(env)).rejects.toThrow("route_mismatch");
    await expect(h.proof.assertTarget(target, expected, expected.plant)).rejects.toThrow(
      "fixture_evidence_invalidated",
    );
  });
  it("times out missing ownership rather than using fixture names as proof", async () => {
    vi.useFakeTimers();
    const h = harness();
    const failure = expect(h.proof.assertInitial(env)).rejects.toThrow("ownership refused");
    await vi.advanceTimersByTimeAsync(20_100);
    await failure;
  });
  it("partial name-directory rows do not overwrite complete ownership evidence", async () => {
    const h = harness();
    h.populate();
    await h.proof.assertInitial(env);
    h.emit("/rest/v1/plants?select=id,name", [{ id: plantId, name: expected.plant }]);
    await expect(h.proof.assertTarget(target, expected, expected.plant)).resolves.toBeUndefined();
  });
  it("rejects a malformed full-row response rather than treating it as a name directory", async () => {
    const h = harness();
    h.populate();
    await h.proof.assertInitial(env);
    h.emit("/rest/v1/plants?select=*", [{ id: plantId, name: expected.plant }]);
    await expect(h.proof.assertTarget(target, expected, expected.plant)).rejects.toThrow(
      "plant_owned_fixture_required",
    );
  });
});

describe("production smoke save integration", () => {
  const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8");
  it("installs proof before navigation and disposes it in both entry points", () => {
    for (const file of ["e2e/quicklog-smoke.spec.ts", "e2e/fixture-safety.spec.ts"]) {
      const source = read(file);
      const observeIndex = source.indexOf("observeProductionQuickLogFixture(page)");
      expect(observeIndex).toBeGreaterThanOrEqual(0);
      expect(observeIndex).toBeLessThan(source.indexOf("await page.goto("));
      expect(source).toContain("productionProof.dispose()");
      expect(source).toContain("productionProof);");
    }
  });
  it("checks ownership immediately before both saves and tags both persisted notes", () => {
    const source = read("e2e/quicklog-smoke.spec.ts");
    expect(source).not.toContain('.fill("Smoke checklist observation")');
    expect(source).toContain("buildQuickLogSmokeNote(smokeTime, 1)");
    expect(source).toContain("buildQuickLogSmokeNote(smokeTime, 2)");
    for (const step of [15, 21]) {
      const block =
        source.split(`await report.run(${step},`)[1]?.split("await report.run(")[0] ?? "";
      expect(block.indexOf("productionProof.assertTarget(")).toBeGreaterThanOrEqual(0);
      expect(block.indexOf("productionProof.assertTarget(")).toBeLessThan(
        block.indexOf('getByTestId("quick-log-save").click()'),
      );
    }
  });
});
