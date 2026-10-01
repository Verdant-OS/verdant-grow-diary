import type { Page, Request, Response } from "@playwright/test";
import type { FixtureSafetyEnv, FixtureEnvValidation } from "./fixtureSafety";
import {
  productionFixturePlantId,
  productionFixtureContextMatchesTarget,
  productionFixtureResponseKind,
  projectFixtureOwnedRow,
  validateProductionFixtureTarget,
  validateProductionQuickLogEnv,
  QUICKLOG_SMOKE_BACKEND_ORIGIN,
  productionQuickLogAccountEmail,
  type FixtureIdentity,
  type FixtureOwnedRow,
  type FixtureTarget,
} from "./productionQuickLogFixtureRules";

/** Observe normal app reads only. No new requests, credentials, storage reads or writes. */
export function observeProductionQuickLogFixture(page: Page) {
  let identity: FixtureIdentity | null = null;
  let invalidated = false;
  let initialTarget: FixtureTarget | null = null;
  const rows = {
    plants: new Map<string, FixtureOwnedRow>(),
    tents: new Map<string, FixtureOwnedRow>(),
    grows: new Map<string, FixtureOwnedRow>(),
  };
  const pending = new Set<Promise<void>>();
  const pendingReads = new Set<Request>();
  const requestListener = (request: Request) => {
    if (productionFixtureResponseKind(request.url(), request.method(), 200))
      pendingReads.add(request);
  };
  const finishedListener = (request: Request) => pendingReads.delete(request);
  const failedListener = (request: Request) => {
    if (pendingReads.delete(request)) invalidated = true;
  };

  async function capture(response: Response): Promise<void> {
    const request = response.request();
    const kind = productionFixtureResponseKind(response.url(), request.method(), response.status());
    if (!kind) {
      // A subsequent rejected user revalidation voids the earlier account proof.
      if (
        response.url().split("?")[0] === `${QUICKLOG_SMOKE_BACKEND_ORIGIN}/auth/v1/user` &&
        request.method() === "GET"
      )
        invalidated = true;
      if (
        request.method() === "GET" &&
        productionFixtureResponseKind(response.url(), "GET", 200) !== null
      )
        invalidated = true;
      return;
    }
    try {
      const body: unknown = await response.json();
      if (kind === "identity") {
        const value = body as Record<string, unknown> | null;
        if (!value || typeof value.id !== "string" || typeof value.email !== "string") {
          invalidated = true;
          return;
        }
        const next = { id: value.id, email: value.email };
        if (identity && (identity.id !== next.id || identity.email !== next.email))
          invalidated = true;
        identity = next;
      } else {
        const observed = new Set<string>();
        for (const value of Array.isArray(body) ? body : [body]) {
          if (value && typeof value === "object") {
            const candidate = value as Record<string, unknown>;
            const previous =
              typeof candidate.id === "string" ? rows[kind].get(candidate.id) : undefined;
            if (
              previous &&
              (candidate.is_archived === true ||
                (typeof candidate.user_id === "string" && candidate.user_id !== previous.user_id) ||
                (typeof candidate.grow_id === "string" && candidate.grow_id !== previous.grow_id) ||
                (typeof candidate.tent_id === "string" && candidate.tent_id !== previous.tent_id) ||
                (typeof candidate.name === "string" && candidate.name !== previous.name))
            )
              invalidated = true;
          }
          const row = projectFixtureOwnedRow(value);
          if (!row) continue; // Partial name-directory reads cannot establish ownership.
          const previous = rows[kind].get(row.id);
          if (previous && JSON.stringify(previous) !== JSON.stringify(row)) invalidated = true;
          rows[kind].set(row.id, row);
          observed.add(row.id);
        }
        // A successful empty/partial replacement must not leave older full
        // rows usable. Name-only directory reads are not ownership snapshots.
        const query = new URL(response.url()).searchParams;
        if ((query.get("select") ?? "*") === "*") {
          const scopedId = query.get("id");
          const scopedTent = query.get("tent_id");
          const scopedGrow = query.get("grow_id");
          for (const [id, row] of rows[kind]) {
            const inScope = scopedId
              ? scopedId === `eq.${id}`
              : scopedTent
                ? scopedTent === `eq.${row.tent_id}`
                : scopedGrow
                  ? scopedGrow === `eq.${row.grow_id}`
                  : true;
            if (inScope && !observed.has(id)) rows[kind].delete(id);
          }
        }
      }
    } catch {
      invalidated = true;
    }
  }
  const listener = (response: Response) => {
    const task = capture(response);
    pending.add(task);
    void task.finally(() => {
      pending.delete(task);
      pendingReads.delete(response.request());
    });
  };
  page.on("request", requestListener);
  page.on("requestfinished", finishedListener);
  page.on("requestfailed", failedListener);
  page.on("response", listener);

  async function check(
    target: FixtureTarget,
    expected: FixtureEnvValidation["expected"],
    plantName?: string,
  ) {
    // A response can land while an earlier capture is awaited; drain until quiet.
    while (pending.size) await Promise.all([...pending]);
    if (!productionFixturePlantId(page.url())) invalidated = true;
    if (initialTarget && !productionFixtureContextMatchesTarget(page.url(), initialTarget))
      invalidated = true;
    if (pendingReads.size) return { ok: false, errors: ["fixture_reads_in_flight"] };
    return validateProductionFixtureTarget(
      {
        identity,
        invalidated,
        plants: [...rows.plants.values()],
        tents: [...rows.tents.values()],
        grows: [...rows.grows.values()],
      },
      target,
      expected,
      plantName,
    );
  }

  return {
    async assertInitial(env: FixtureSafetyEnv): Promise<FixtureEnvValidation> {
      const config = validateProductionQuickLogEnv(env);
      if (!config.ok)
        throw new Error(`Production fixture configuration refused: ${config.errors.join(", ")}`);
      const plantId = productionFixturePlantId(env.E2E_GROW_1_PLANT_URL)!;
      if (productionFixturePlantId(page.url()) !== plantId)
        throw new Error("production_fixture_route_mismatch");
      const deadline = Date.now() + 20_000;
      let errors = ["owned_fixture_reads_missing"];
      while (Date.now() < deadline) {
        await Promise.all([...pending]);
        const plant = rows.plants.get(plantId);
        const target = { plantId, tentId: plant?.tent_id ?? "", growId: plant?.grow_id ?? "" };
        const resolved = {
          ...config,
          expected: {
            ...config.expected,
            grow: config.expected.grow || rows.grows.get(target.growId)?.name || "",
          },
        };
        const result = await check(target, resolved.expected);
        if (result.ok) {
          if (
            !productionFixtureContextMatchesTarget(env.E2E_GROW_1_PLANT_URL!, target) ||
            !productionFixtureContextMatchesTarget(page.url(), target)
          )
            throw new Error("production_fixture_context_mismatch");
          initialTarget = target;
          return resolved;
        }
        errors = result.errors;
        if (
          invalidated ||
          (identity && identity.email.toLowerCase() !== productionQuickLogAccountEmail(plantId))
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`Production fixture ownership refused: ${errors.join(", ")}`);
    },
    async assertTarget(
      target: FixtureTarget,
      expected: FixtureEnvValidation["expected"],
      plantName: string,
    ) {
      const result = await check(target, expected, plantName);
      if (!result.ok)
        throw new Error(`Production fixture save refused: ${result.errors.join(", ")}`);
    },
    dispose() {
      page.off("request", requestListener);
      page.off("requestfinished", finishedListener);
      page.off("requestfailed", failedListener);
      page.off("response", listener);
    },
  };
}
export type ProductionQuickLogFixtureProof = ReturnType<typeof observeProductionQuickLogFixture>;
