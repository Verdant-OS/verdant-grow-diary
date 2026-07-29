import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import {
  AUTHENTICATED_CORE_CENSUS_ROUTES,
  PRIVILEGED_ROUTE_PREFIXES,
  PUBLIC_CORE_CENSUS_ROUTES,
  classifyLink,
  expectedCensusNavigationPath,
  fallbackSelectExerciseFailureIsFatal,
  isReadOnlyEdgeFunction,
  isReadOnlyRpc,
  isPrivilegedRoute,
  isSafelyFillableFieldType,
  matchesKnownAppRoute,
  missingAuthenticatedCensusRoutePatterns,
  missingAuthenticatedDynamicRouteSuccessContracts,
  placeholderValueForField,
  selectAvailableAlternativeValue,
  visibleLinkByHrefSelector,
  type CoreCensusRoute,
} from "../../e2e/lib/coreLinkFormCensus";

const MANIFEST = [
  "*",
  "/",
  "/auth",
  "/grows",
  "/grows/:growId",
  "/plants/:id",
  "/guides/:slug",
  "/pricing",
  "/pheno-hunts/:id/workspace",
] as const;

const CENSUS_SPEC_SOURCE = readFileSync(
  resolve(process.cwd(), "e2e/core-link-form-census.spec.ts"),
  "utf8",
);

describe("core link and form census rules", () => {
  it("matches exact and dynamic manifest routes without allowing the catch-all", () => {
    expect(matchesKnownAppRoute("/grows", MANIFEST)).toBe(true);
    expect(matchesKnownAppRoute("/grows/11111111-1111-4111-8111-111111111111", MANIFEST)).toBe(
      true,
    );
    expect(matchesKnownAppRoute("/plants/plant-1", MANIFEST)).toBe(true);
    expect(matchesKnownAppRoute("/not-a-real-route", MANIFEST)).toBe(false);
  });

  it.each([
    ["", "unsafe"],
    ["javascript:alert(1)", "unsafe"],
    ["data:text/html,unsafe", "unsafe"],
    ["#root-zone", "fragment"],
    ["mailto:grower@example.invalid", "contact"],
    ["tel:+15550100199", "contact"],
    ["https://example.com/guide", "external"],
    ["/unknown", "unknown-route"],
    ["/auth", "navigate"],
    ["/guides/cronk-nutrients-grow-diary", "navigate"],
    ["/grows/grow-1?tab=plants#top", "navigate"],
    ["/pricing", "navigate"],
    ["/pheno-hunts/hunt-1/workspace", "navigate"],
    ["/operator/ecowitt", "excluded-privileged"],
    ["/internal/sensor-truth-audit", "excluded-privileged"],
  ] as const)("classifies %s as %s", (href, expected) => {
    expect(classifyLink({ href }, MANIFEST).disposition).toBe(expected);
  });

  it("allows explicit downloads without treating their asset path as an app route", () => {
    expect(
      classifyLink({ href: "/exports/example.csv", download: true }, MANIFEST).disposition,
    ).toBe("download");
  });

  it("builds one exact live locator for same-href links across re-renders", () => {
    expect(
      visibleLinkByHrefSelector(
        '/pheno-hunts/hunt-1/workspace?note="quoted"\\value#phenotype-notes',
      ),
    ).toBe(
      'a[href="/pheno-hunts/hunt-1/workspace?note=\\"quoted\\"\\\\value#phenotype-notes"]:visible',
    );
  });

  it("mutates and restores controlled selects through the reacquired live locator", () => {
    // The snapshot reads through the pinned fallback node when one exists so
    // the snapshot and the identity handle always describe the same element.
    expect(CENSUS_SPEC_SOURCE).toContain(
      "const snapshotTarget = fallbackSnapshotHandle ?? stableControl;",
    );
    expect(CENSUS_SPEC_SOURCE).toContain(
      "const selectSnapshot = await snapshotTarget.evaluate((element) => {",
    );
    expect(CENSUS_SPEC_SOURCE).toContain(
      "selectAvailableAlternativeValue(selectSnapshot.options, original)",
    );
    expect(CENSUS_SPEC_SOURCE).not.toContain("const alternative = await control.evaluate");
    expect(CENSUS_SPEC_SOURCE).toContain(
      "await stableControl.selectOption(alternative, { timeout: 5_000 });",
    );
    expect(CENSUS_SPEC_SOURCE).toContain(
      "await stableControl.selectOption(original, { timeout: 5_000 }).catch(() => undefined);",
    );
    expect(CENSUS_SPEC_SOURCE).not.toContain(
      "await control.selectOption(alternative, { timeout: 5_000 });",
    );
  });

  it("downgrades nth-fallback select churn to an unexercised audit instead of a census failure", () => {
    expect(CENSUS_SPEC_SOURCE).toContain("if (hasStableNamedControl) throw error;");
    // Pre-dispatch churn and post-dispatch re-renders carry distinct reasons
    // so the census report records WHEN the churn hit.
    expect(CENSUS_SPEC_SOURCE).toContain(
      '"re-rendered mid-exercise without a unique accessible-name locator"',
    );
    expect(CENSUS_SPEC_SOURCE).toContain(
      '"re-rendered in response to selection before value verification"',
    );
    expect(CENSUS_SPEC_SOURCE).toContain('? "re-rendered in response to selection');
    // The fallback exercise acts THROUGH the pinned handle, making action and
    // identity atomic — an index reorder can never route the selection or its
    // verification to a look-alike sibling.
    expect(CENSUS_SPEC_SOURCE).toContain(
      "await snapshotTarget.selectOption(alternative, { timeout: 5_000 });",
    );
    // The success poll only accepts a CONNECTED node's value — a retained
    // handle can read a detached node's stale value, which must not count.
    expect(CENSUS_SPEC_SOURCE).toContain(
      "element.isConnected ? (element as HTMLSelectElement).value : null,",
    );
    // A fallback control that cannot be pinned is never exercised through the
    // live locator — that would allow snapshotting one select and acting on a
    // look-alike at the same index.
    expect(CENSUS_SPEC_SOURCE).toContain(
      'reason: "could not pin the control before exercising it"',
    );
    // A retained handle can evaluate a DETACHED node with its state intact, so
    // the fatal verdict requires the node to still be connected.
    expect(CENSUS_SPEC_SOURCE).toContain("connected: select.isConnected,");
    expect(CENSUS_SPEC_SOURCE).toContain("liveState?.connected ?? false,");
  });

  it("keeps a stable-but-broken fallback select fatal while downgrading verified churn", () => {
    const option = (value: string, disabled = false) => ({ value, disabled });
    const state = (
      options: { value: string; disabled: boolean }[],
      disabled = false,
      visible = true,
    ) => ({
      disabled,
      visible,
      options,
    });
    const snapshot = state([option(""), option("all"), option("keep")]);

    // The same pinned DOM node still showing the snapshotted state never
    // churned, so a value that did not stick is a broken onChange and the
    // census must keep failing.
    expect(
      fallbackSelectExerciseFailureIsFatal(
        snapshot,
        state([option(""), option("all"), option("keep")]),
        true,
      ),
    ).toBe(true);

    // Identical options on a DIFFERENT node: the nth() index moved to a
    // look-alike sibling (repeated selects share option lists) — churn.
    expect(
      fallbackSelectExerciseFailureIsFatal(
        snapshot,
        state([option(""), option("all"), option("keep")]),
        false,
      ),
    ).toBe(false);

    // The same node whose options were rewritten in place by a re-render
    // (fewer, extra, or renamed) is churn too, not a defect.
    expect(
      fallbackSelectExerciseFailureIsFatal(snapshot, state([option(""), option("all")]), true),
    ).toBe(false);
    expect(
      fallbackSelectExerciseFailureIsFatal(
        snapshot,
        state([option(""), option("all"), option("keep"), option("cull")]),
        true,
      ),
    ).toBe(false);
    expect(
      fallbackSelectExerciseFailureIsFatal(
        snapshot,
        state([option(""), option("all"), option("cull")]),
        true,
      ),
    ).toBe(false);

    // Same node, same values, but the alternative was disabled in place —
    // the option state churned even though the value list looks identical.
    expect(
      fallbackSelectExerciseFailureIsFatal(
        snapshot,
        state([option(""), option("all"), option("keep", true)]),
        true,
      ),
    ).toBe(false);

    // Same node, same options, but the WHOLE control was disabled in place
    // (an async loading state) — churn, not a broken onChange.
    expect(
      fallbackSelectExerciseFailureIsFatal(
        snapshot,
        state([option(""), option("all"), option("keep")], true),
        true,
      ),
    ).toBe(false);

    // A control that was ALREADY disabled when snapshotted (it got disabled
    // between the editable check and the snapshot) can never prove a broken
    // onChange — even if the catch-time state matches the snapshot exactly.
    const disabledSnapshot = state([option(""), option("all"), option("keep")], true);
    expect(
      fallbackSelectExerciseFailureIsFatal(
        disabledSnapshot,
        state([option(""), option("all"), option("keep")], true),
        true,
      ),
    ).toBe(false);

    // Visibility transitions are churn on either end: hidden when snapshotted
    // (transition arrived after the visible check), or hidden by catch time
    // (the action timed out on actionability, not a dropped value).
    const hiddenSnapshot = state([option(""), option("all"), option("keep")], false, false);
    expect(
      fallbackSelectExerciseFailureIsFatal(
        hiddenSnapshot,
        state([option(""), option("all"), option("keep")], false, false),
        true,
      ),
    ).toBe(false);
    expect(
      fallbackSelectExerciseFailureIsFatal(
        snapshot,
        state([option(""), option("all"), option("keep")], false, false),
        true,
      ),
    ).toBe(false);

    // An element that cannot be resolved at all at catch time is churn.
    expect(fallbackSelectExerciseFailureIsFatal(snapshot, undefined, false)).toBe(false);

    // The census spec must actually consult the helper on the fallback path,
    // feeding it the pinned-node identity signal and the control state.
    expect(CENSUS_SPEC_SOURCE).toContain("fallbackSelectExerciseFailureIsFatal(");
    // Effective disablement (:disabled matches direct attributes AND an
    // ancestor <fieldset disabled>) — the same semantics Playwright honors.
    expect(CENSUS_SPEC_SOURCE).toContain('controlDisabled: select.matches(":disabled"),');
    expect(CENSUS_SPEC_SOURCE).toContain('disabled: select.matches(":disabled"),');
    // Effective visibility is observed on both ends so a control hidden by an
    // async transition reads as churn, not as a broken stable select. The box
    // must have nonzero AREA — getClientRects() can return a zero-area rect
    // that Playwright's actionability still treats as invisible.
    expect(CENSUS_SPEC_SOURCE).toContain("controlVisible:");
    expect(CENSUS_SPEC_SOURCE).toContain("visible: selectSnapshot.controlVisible,");
    expect(CENSUS_SPEC_SOURCE).toContain("select.getBoundingClientRect().width > 0 &&");
    expect(CENSUS_SPEC_SOURCE).toContain("select.getBoundingClientRect().height > 0 &&");
    expect(CENSUS_SPEC_SOURCE).toContain(
      "await stableControl.elementHandle({ timeout: 5_000 }).catch(() => null);",
    );
  });

  it("settles a transiently unnamed control before asserting it lacks a user-facing name", () => {
    // A sibling exercise can re-render the page mid-read, so an empty
    // accessible name is re-read before it fails the census — through a
    // PINNED node, so a transient reorder cannot lend the unnamed control a
    // named sibling's name — and only a node that vanished or stayed hidden
    // through the settle window is skipped rather than reported as unnamed.
    expect(CENSUS_SPEC_SOURCE).toContain(
      "const unnamedHandle = await control.elementHandle({ timeout: 1_000 }).catch(() => null);",
    );
    expect(CENSUS_SPEC_SOURCE).toContain(
      'for (let attempt = 0; name === "" && unnamedHandle && attempt < 5; attempt += 1) {',
    );
    expect(CENSUS_SPEC_SOURCE).toContain(
      "name = normalizeText(await accessibleNameForControl(unnamedHandle)",
    );
    // An index whose live element is no longer the pinned node — detached OR
    // displaced by a visible replacement — is re-audited once (bounded by the
    // set) so an unnamed replacement cannot slip through unaudited.
    expect(CENSUS_SPEC_SOURCE).toContain("const reauditedUnnamedIndexes = new Set<number>();");
    expect(CENSUS_SPEC_SOURCE).toContain(
      ".evaluate((element, pinned) => pinned !== null && element === pinned, unnamedHandle, {",
    );
    expect(CENSUS_SPEC_SOURCE).toContain(
      "if (!indexStillPinnedNode && !reauditedUnnamedIndexes.has(index)) {",
    );
    expect(CENSUS_SPEC_SOURCE).toContain("index -= 1;");
  });

  it("derives a select alternative from the reacquired control's current options", () => {
    const staleAlternative = selectAvailableAlternativeValue(
      [
        { value: "all", disabled: false },
        { value: "keep", disabled: false },
      ],
      "all",
    );
    const liveAlternative = selectAvailableAlternativeValue(
      [
        { value: "all", disabled: false },
        { value: "undecided", disabled: false },
        { value: "cull", disabled: true },
      ],
      "all",
    );

    expect(staleAlternative).toBe("keep");
    expect(liveAlternative).toBe("undecided");
    expect(liveAlternative).not.toBe(staleAlternative);
  });

  it("skips a select when its current live options have no safe alternative", () => {
    expect(
      selectAvailableAlternativeValue(
        [
          { value: "", disabled: false },
          { value: "all", disabled: false },
          { value: "keep", disabled: true },
        ],
        "all",
      ),
    ).toBeUndefined();
  });

  it("expects signed-out links to auth routes to land on the welcome gate", () => {
    const routes = [
      { path: "/pheno-hunts/:id/compare", access: "public" },
      { path: "/pheno-hunts/:id/workspace", access: "auth" },
    ] as const;

    expect(expectedCensusNavigationPath("/pheno-hunts/hunt-1/workspace", routes, false)).toBe(
      "/welcome",
    );
    expect(expectedCensusNavigationPath("/pheno-hunts/hunt-1/workspace", routes, true)).toBe(
      "/pheno-hunts/hunt-1/workspace",
    );
    expect(expectedCensusNavigationPath("/pheno-hunts/hunt-1/compare", routes, false)).toBe(
      "/pheno-hunts/hunt-1/compare",
    );
  });

  it("resolves the most specific route deterministically before applying access behavior", () => {
    const routes = [
      { path: "/pheno-hunts/:id/:view", access: "auth" },
      { path: "/pheno-hunts/:id/compare", access: "public" },
    ] as const;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(expectedCensusNavigationPath("/pheno-hunts/hunt-1/compare", routes, false)).toBe(
        "/pheno-hunts/hunt-1/compare",
      );
    }
  });

  it.each(["text", "search", "email", "password", "number", "date", "datetime-local", "time"])(
    "allows deterministic filling for %s fields",
    (type) => {
      expect(isSafelyFillableFieldType(type)).toBe(true);
    },
  );

  it.each(["hidden", "file", "checkbox", "radio", "range", "submit"])(
    "keeps %s controls audit-only",
    (type) => {
      expect(isSafelyFillableFieldType(type)).toBe(false);
    },
  );

  it.each([
    "check-entitlement",
    "count-sessions",
    "get-latest-snapshot",
    "health",
    "list-recent-diary-entries",
    "preview-import",
    "resolve-plan",
    "status",
    "environment-summary-report-entitlement",
    "founder-slots-remaining",
    "premium-export-entitlement",
  ])("classifies the read-only edge function %s without weakening the mutation fence", (name) => {
    expect(isReadOnlyEdgeFunction(name)).toBe(true);
  });

  it.each([
    "ai-doctor-review",
    "create-checkout-session",
    "delete-account",
    "paddle-webhook",
    "save-diary-entry",
  ])("keeps the mutating edge function %s behind the mutation fence", (name) => {
    expect(isReadOnlyEdgeFunction(name)).toBe(false);
  });

  it.each([
    "genetics_trace_resolve",
    "get_latest_tent_sensor_snapshot",
    "has_role",
    "verdant_search",
  ])("allows the explicitly reviewed read-only RPC %s", (name) => {
    expect(isReadOnlyRpc(name)).toBe(true);
  });

  it.each([
    "action_queue_transition",
    "check_then_write",
    "count_and_increment",
    "get_or_create_profile",
    "list_and_delete_grows",
    "preview_and_save",
    "resolve_and_persist_alert",
  ])("keeps the read-like mutating RPC %s behind the mutation fence", (name) => {
    expect(isReadOnlyRpc(name)).toBe(false);
  });

  it("builds safe, deterministic placeholder values", () => {
    expect(placeholderValueForField({ type: "email", accessibleName: "Email" })).toBe(
      "verdant-census@example.invalid",
    );
    expect(placeholderValueForField({ type: "number", accessibleName: "Relative humidity" })).toBe(
      "55",
    );
    expect(placeholderValueForField({ type: "number", accessibleName: "EC" })).toBe("1.5");
    expect(
      placeholderValueForField({
        type: "number",
        accessibleName: "Temperature in Celsius",
        min: "-10",
        max: "50",
      }),
    ).toBe("50");
    expect(
      placeholderValueForField({
        type: "number",
        accessibleName: "Days",
        min: "3",
        max: "9",
        step: "2",
      }),
    ).toBe("5");
    expect(
      placeholderValueForField({ type: "textarea", accessibleName: "Observation notes" }),
    ).toContain("No live data");
  });

  it.each(PRIVILEGED_ROUTE_PREFIXES)(
    "keeps privileged route %s outside the grower census",
    (prefix) => {
      expect(isPrivilegedRoute(prefix)).toBe(true);
      expect(isPrivilegedRoute(`${prefix}/nested`)).toBe(true);
    },
  );

  it("does not duplicate a route inside either census lane", () => {
    const paths = [
      ...PUBLIC_CORE_CENSUS_ROUTES.map((route) => route.path),
      ...AUTHENTICATED_CORE_CENSUS_ROUTES.map((route) => route.path),
    ];
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("schedules a concrete browser census visit for every authenticated route", () => {
    expect(
      missingAuthenticatedCensusRoutePatterns(APP_ROUTES, AUTHENTICATED_CORE_CENSUS_ROUTES),
    ).toEqual([]);
  });

  it("does not let the static breeding/new visit cover the breeding detail pattern", () => {
    const withoutBreedingDetail = AUTHENTICATED_CORE_CENSUS_ROUTES.filter(
      (route) => route.path !== "/breeding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );

    expect(missingAuthenticatedCensusRoutePatterns(APP_ROUTES, withoutBreedingDetail)).toEqual([
      "/breeding/:programId",
    ]);
  });

  it("requires a success-state content contract for every authenticated dynamic route", () => {
    expect(
      missingAuthenticatedDynamicRouteSuccessContracts(
        APP_ROUTES,
        AUTHENTICATED_CORE_CENSUS_ROUTES,
      ),
    ).toEqual([]);
  });

  it("reports the manifest pattern when a dynamic route loses its success contract", () => {
    const withoutBreedingDetailContract = AUTHENTICATED_CORE_CENSUS_ROUTES.map((route) =>
      route.path === "/breeding/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        ? { ...route, expectedContent: undefined }
        : route,
    ) as readonly CoreCensusRoute[];

    expect(
      missingAuthenticatedDynamicRouteSuccessContracts(APP_ROUTES, withoutBreedingDetailContract),
    ).toEqual(["/breeding/:programId"]);
  });
});
