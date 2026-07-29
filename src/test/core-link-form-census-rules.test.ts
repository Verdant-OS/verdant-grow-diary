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
    // EVERY select — named or not — exercises through the pinned node: an
    // accessible name can migrate to a sibling combobox when the value it
    // derives from changes, so name-resolved exercise/verification is unsafe.
    // The named locator survives only for restoration, where re-resolution
    // across re-renders is exactly what cleanup wants.
    expect(CENSUS_SPEC_SOURCE).toContain("const snapshotTarget = pinnedControl;");
    expect(CENSUS_SPEC_SOURCE).toContain(
      "const selectSnapshot = await snapshotTarget.evaluate((element) => {",
    );
    expect(CENSUS_SPEC_SOURCE).toContain(
      "selectAvailableAlternativeValue(selectSnapshot.options, original)",
    );
    expect(CENSUS_SPEC_SOURCE).not.toContain("const alternative = await control.evaluate");
    expect(CENSUS_SPEC_SOURCE).not.toContain(
      "await stableControl.selectOption(alternative, { timeout: 5_000 });",
    );
    expect(CENSUS_SPEC_SOURCE).not.toContain("await expect(stableControl).toHaveValue(");
    expect(CENSUS_SPEC_SOURCE).toContain(
      "await stableControl.selectOption(original, { timeout: 5_000 }).catch(() => undefined);",
    );
    expect(CENSUS_SPEC_SOURCE).not.toContain(
      "await control.selectOption(alternative, { timeout: 5_000 });",
    );
  });

  it("downgrades nth-fallback select churn to an unexercised audit instead of a census failure", () => {
    // The identity/state verdict applies to EVERY select — named ones too,
    // since an accessible name can migrate between comboboxes; there is no
    // named-path unconditional rethrow anymore.
    expect(CENSUS_SPEC_SOURCE).not.toContain("if (hasStableNamedControl) throw error;");
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
    // A downgraded select whose index was displaced re-audits the replacement
    // once, pre- or post-dispatch alike — displaced surface stays audited.
    expect(CENSUS_SPEC_SOURCE).toContain(
      "Whatever displaced the pinned select at this index is unaudited",
    );
    // A dispatched alternative is restored on the logical replacement (a live
    // node still holding the alternative) before the census continues, and an
    // unrestorable alternative fails the census — filters and derived state
    // must not stay mutated for the rest of the route's audit.
    expect(CENSUS_SPEC_SOURCE).toContain("const liveHoldsAlternative = await control");
    expect(CENSUS_SPEC_SOURCE).toContain("kept the census alternative and could not be restored");
  });

  it("keeps a stable-but-broken fallback select fatal while downgrading verified churn", () => {
    const option = (value: string, disabled = false) => ({ value, disabled });
    const state = (
      options: { value: string; disabled: boolean }[],
      disabled = false,
      visible = true,
      receivesEvents = true,
    ) => ({
      disabled,
      visible,
      receivesEvents,
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

    // Event blockage (an overlay at the control's center, or pointer-events
    // none) is churn on either end: blocked at snapshot proves a transition
    // after the earlier checks; blocked at catch means the action timed out
    // on the hit target, not on a value that failed to stick.
    const blockedSnapshot = state([option(""), option("all"), option("keep")], false, true, false);
    expect(
      fallbackSelectExerciseFailureIsFatal(
        blockedSnapshot,
        state([option(""), option("all"), option("keep")], false, true, false),
        true,
      ),
    ).toBe(false);
    expect(
      fallbackSelectExerciseFailureIsFatal(
        snapshot,
        state([option(""), option("all"), option("keep")], false, true, false),
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
    // Hit-target state is observed on both ends with positive-evidence-only
    // semantics: pointer-events none or a foreign element at the center marks
    // blocked; a null (off-viewport) hit counts as unobstructed.
    expect(CENSUS_SPEC_SOURCE).toContain("controlReceivesEvents:");
    expect(CENSUS_SPEC_SOURCE).toContain("receivesEvents: selectSnapshot.controlReceivesEvents,");
    expect(CENSUS_SPEC_SOURCE).toContain(
      'if (getComputedStyle(select).pointerEvents === "none") return false;',
    );
    expect(CENSUS_SPEC_SOURCE).toContain("select.getBoundingClientRect().width > 0 &&");
    expect(CENSUS_SPEC_SOURCE).toContain("select.getBoundingClientRect().height > 0 &&");
    // The select identity REUSES the node pinned for the name/type reads —
    // a fresh handle here could pin a sibling after a reorder while name and
    // type still describe the original.
    expect(CENSUS_SPEC_SOURCE).toContain("const snapshotTarget = pinnedControl;");
    // The fill exercise resolves through the same pinned node too. Strictness
    // is identity-scoped: a connected pinned node that dropped the value still
    // fails the census, while a node the page replaced mid-exercise (e.g. a
    // controlled date input remounting on fill) downgrades with a phase-tagged
    // reason — proven live by the date-field remount both CI and local runs
    // reproduced.
    expect(CENSUS_SPEC_SOURCE).toContain("const fillTarget = pinnedControl ?? control;");
    expect(CENSUS_SPEC_SOURCE).toContain("await fillTarget.fill(placeholder, { timeout: 5_000 });");
    expect(CENSUS_SPEC_SOURCE).not.toContain("await control.fill(placeholder");
    expect(CENSUS_SPEC_SOURCE).toContain("if (pinnedStillConnected) throw error;");
    expect(CENSUS_SPEC_SOURCE).toContain(
      '"re-rendered in response to a fill before value verification"',
    );
    expect(CENSUS_SPEC_SOURCE).toContain('"re-rendered before the fill could be dispatched"');
    // Restore prefers the pinned handle while connected (a reorder without
    // detachment must not restore a sibling), and falls back to the live
    // locator only on remount — where the replacement holds the dispatched
    // placeholder and page content derived from the field (e.g. hrefs
    // embedding date values) must return to its original shape before the
    // link phase collects hrefs.
    // Every restore verifies the value PERSISTED on a connected node — a
    // resolving fill() is not persistence when a handler can revert it.
    expect(CENSUS_SPEC_SOURCE).toContain("async function fillAndVerify(");
    expect(CENSUS_SPEC_SOURCE).toContain(
      "let restored = await fillAndVerify(fillTarget, original);",
    );
    expect(CENSUS_SPEC_SOURCE).toContain(
      "const restoredReplacement = await fillAndVerify(control, original);",
    );
    // A name that only settled during the retry window rechecks the pinned
    // node's visibility before any exercise — a control hidden by the same
    // transition that named it is skipped, not timed out fatally.
    expect(CENSUS_SPEC_SOURCE).toContain('if (nameRequiredSettling && name !== "") {');
    // Fallback restores only write into a live node that still HOLDS the
    // dispatched placeholder (the logical replacement) — a shifted unrelated
    // sibling is never overwritten; a vanished placeholder owes no cleanup
    // and the displaced index is re-audited instead.
    expect(CENSUS_SPEC_SOURCE).toContain("const liveHoldsPlaceholder = await control");
    expect(CENSUS_SPEC_SOURCE).toContain("if (liveHoldsPlaceholder) {");
    // Restored values must HOLD through a settle re-sample — a first matching
    // poll sample is not stability against a delayed normalize/revert.
    expect(CENSUS_SPEC_SOURCE).toContain(
      "await new Promise((resolve) => setTimeout(resolve, 250));",
    );
    // Select replacement identity requires the snapshotted option list, not
    // just a colliding current value like "all".
    expect(CENSUS_SPEC_SOURCE).toContain("select.value === expected.alternative &&");
    // Downgrade-path cleanup only runs when a fill actually dispatched — a
    // pre-dispatch detachment changed nothing, and restoring into whatever
    // now holds the index would corrupt an unrelated control. A pre-dispatch
    // detachment also re-audits a displaced index so the replacement is not
    // orphaned, and a field that accepted the placeholder but cannot be
    // restored fails the census outright.
    expect(CENSUS_SPEC_SOURCE).toContain("if (fillDispatched) {");
    expect(CENSUS_SPEC_SOURCE).toContain(
      "Whatever displaced the pinned input at this index is unaudited",
    );
    expect(CENSUS_SPEC_SOURCE).toContain(
      "accepted the census placeholder but could not be restored",
    );
    // The downgrade-path remount restore is verified too — a replacement that
    // rejects the original value fails the census instead of leaving
    // placeholder-derived state to corrupt later audits.
    expect(CENSUS_SPEC_SOURCE).toContain(
      "remounted after a fill and its replacement could not be restored",
    );
    // The link phase re-loads a source page once when a collected href is not
    // visible on revisit — data-dependent links get one settled render before
    // the unchanged strict assertion.
    expect(CENSUS_SPEC_SOURCE).toContain("const anchorVisibleOnFirstRender = await anchor");
    expect(CENSUS_SPEC_SOURCE).toContain("if (!anchorVisibleOnFirstRender) {");
  });

  it("settles a transiently unnamed control before asserting it lacks a user-facing name", () => {
    // A sibling exercise can re-render the page mid-read, so an empty
    // accessible name is re-read before it fails the census — through a
    // PINNED node, so a transient reorder cannot lend the unnamed control a
    // named sibling's name — and only a node that vanished or stayed hidden
    // through the settle window is skipped rather than reported as unnamed.
    // The node is pinned FIRST — before even the visibility gates — and every
    // per-control read goes through that pinned element, so no read can
    // straddle a reorder onto a sibling.
    expect(CENSUS_SPEC_SOURCE).toContain(
      "const pinnedControl = await control.elementHandle({ timeout: 1_000 }).catch(() => null);",
    );
    // Every pinned-state-driven skip first asks whether the live index still
    // holds the pinned node, and re-audits once (bounded) when it does not —
    // a visible replacement of a hidden/detached/unpinnable predecessor gets
    // its own audit pass instead of escaping the census.
    expect(CENSUS_SPEC_SOURCE).toContain("const liveIndexHoldsPinnedNode = async ()");
    expect(CENSUS_SPEC_SOURCE).toContain("const reauditIndexOnce = (): void => {");
    expect(CENSUS_SPEC_SOURCE).toContain(
      "if (!(await liveIndexHoldsPinnedNode())) reauditIndexOnce();",
    );
    expect(CENSUS_SPEC_SOURCE).toContain(
      "if (await isVisuallyHiddenImplementationControl(pinnedControl)) {",
    );
    expect(CENSUS_SPEC_SOURCE).not.toContain("if (!(await control.isVisible())) continue;");
    expect(CENSUS_SPEC_SOURCE).toContain(
      'for (let attempt = 0; name === "" && pinnedControl && attempt < 5; attempt += 1) {',
    );
    expect(CENSUS_SPEC_SOURCE).toContain(
      "name = normalizeText(await accessibleNameForControl(pinnedControl)",
    );
    expect(CENSUS_SPEC_SOURCE).toContain(
      "const type = await controlType(pinnedControl ?? control);",
    );
    // After the name/type reads, an identity gate re-audits the index once if
    // the live element is no longer the pinned node, and the actionability
    // reads go through the pinned node — later checks and actions can never
    // describe a different control than the one named above.
    expect(CENSUS_SPEC_SOURCE).toContain(
      ".evaluate((element, pinned) => element === pinned, pinnedControl, { timeout: 1_000 })",
    );
    // Actionability read failures (detached mid-read) stay null and trigger
    // the bounded index re-audit instead of classifying the old node as
    // read-only and orphaning its replacement.
    expect(CENSUS_SPEC_SOURCE).toContain(
      "const disabled = await pinnedControl.isDisabled().catch(() => null);",
    );
    expect(CENSUS_SPEC_SOURCE).toContain(
      "const editable = await pinnedControl.isEditable().catch(() => null);",
    );
    expect(CENSUS_SPEC_SOURCE).toContain("if (disabled === null || editable === null) {");
    // An index whose live element is no longer the pinned node — detached OR
    // displaced by a visible replacement — is re-audited once (bounded by the
    // set) so an unnamed replacement cannot slip through unaudited.
    expect(CENSUS_SPEC_SOURCE).toContain("const reauditedIndexes = new Set<number>();");
    expect(CENSUS_SPEC_SOURCE).toContain(
      ".evaluate((element, pinned) => pinned !== null && element === pinned, pinnedControl, {",
    );
    expect(CENSUS_SPEC_SOURCE).toContain(
      "if (!indexStillPinnedNode && !reauditedIndexes.has(index)) {",
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
