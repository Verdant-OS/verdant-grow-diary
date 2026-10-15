import assert from "node:assert/strict";
import test from "node:test";
import { transition } from "./lib/sentinelHandoffRules.mjs";

const HEAD = "5459c3a18a402d2bf5b00c96b0688c4475dcf93d";
const policy = () => ({
  repository: "Verdant-OS/verdant-grow-diary",
  branch: "codex/sentinel-test",
  head: HEAD,
  taskId: "SENTINEL-TEST",
  holder: "Bloom",
  claimReceipt: "test-fixture:claim",
  contributors: ["Bloom"],
  independentReviewer: "review-child",
  paths: ["scripts/lib/newHandoff.mjs"],
  maxAttempts: 2,
  maxChecks: 2,
  maxRepairs: 1,
  maxHops: 4,
  waitMs: 1000,
  routes: {
    review: {
      from: "Bloom",
      to: "review-child",
      purpose: "review",
      destination: "collaboration:/root/review_child",
      authorizationReceipt: "test-fixture:review-route",
      onSuccess: "report",
      onFailure: "repair",
    },
    report: {
      from: "review-child",
      to: "audit-child",
      purpose: "handoff",
      destination: "collaboration:/root/audit_child",
      authorizationReceipt: "test-fixture:report-route",
      onSuccess: null,
      onFailure: "repairFromReport",
    },
    repair: {
      from: "review-child",
      to: "Bloom",
      purpose: "repair_request",
      destination: "collaboration:/root",
      authorizationReceipt: "test-fixture:repair-route",
      onSuccess: null,
      onFailure: "repairFromHolder",
    },
    repairFromReport: {
      from: "audit-child",
      to: "Bloom",
      purpose: "repair_request",
      destination: "collaboration:/root",
      authorizationReceipt: "test-fixture:repair-route",
      onSuccess: null,
      onFailure: null,
    },
    repairFromHolder: {
      from: "Bloom",
      to: "Bloom",
      purpose: "repair_request",
      destination: "collaboration:/root",
      authorizationReceipt: "test-fixture:repair-route",
      onSuccess: null,
      onFailure: null,
    },
  },
});
function command(type, data = {}, now = 0) {
  return { type, writer: "Bloom", now, ...data };
}
function create(p = policy()) {
  return transition(
    null,
    command("CREATE", {
      input: {
        correlationId: "sentinel-test-1",
        taskId: p.taskId,
        repository: p.repository,
        branch: p.branch,
        head: p.head,
        routeId: "review",
        summary: "Inspect the bounded routing slice read-only.",
      },
    }),
    p,
  ).state;
}
function dispatch(state, p = policy(), now = state.lastAt) {
  return transition(state, command("DISPATCH", {}, now), p);
}
function receipt(state, kind, extra = {}) {
  return {
    kind,
    correlationId: state.correlationId,
    head: state.head,
    repository: state.repository,
    taskId: state.taskId,
    branch: state.branch,
    policyDigest: state.policyDigest,
    dispatchId: state.dispatchId,
    destination: state.destination,
    from: state.to,
    evidence: `test-fixture:${kind}`,
    ...extra,
  };
}
function observed(state, kind, extra = {}, p = policy(), now = 10) {
  return transition(
    state,
    command(
      "RECEIPT",
      {
        receipt: receipt(state, kind, extra),
      },
      now,
    ),
    p,
  ).state;
}
function acknowledged(p = policy()) {
  return observed(dispatch(create(p), p).state, "ACK", {}, p);
}

test("success advances to the next authorized owner with exact-head return receipt", () => {
  const state = acknowledged();
  const next = observed(state, "RETURN", { outcome: "PASS", summary: "Inspection done." });
  assert.equal(next.status, "READY");
  assert.equal(next.to, "audit-child");
  assert.equal(next.holder, "Bloom");
  assert.equal(next.receipts.length, 2);
  assert.equal(next.receipts[1].head, HEAD);
  assert.equal(next.acceptance, "NOT_MEASURED");
  assert.equal(dispatch(next).action.packet.correlationId, "sentinel-test-1");
});
test("failure returns concrete error and a bounded repair request to the sole holder", () => {
  const next = observed(acknowledged(), "RETURN", {
    outcome: "FAIL",
    summary: "Receipt binding failed.",
    error: {
      code: "HEAD_MISMATCH",
      detail: "Expected exact reviewed head.",
      repair: "Bind the acknowledgment to the reviewed head.",
    },
  });
  const result = dispatch(next);
  assert.equal(next.to, "Bloom");
  assert.equal(next.repairs, 1);
  assert.equal(result.action.packet.error.code, "HEAD_MISMATCH");
  assert.match(result.action.packet.readable, /Repair 1\/1/);
  assert.match(result.action.packet.readable, /sole writer: Bloom/);
});
test("repeated repair failure stops at its bound", () => {
  const failure = {
    outcome: "FAIL",
    summary: "Failed.",
    error: { code: "BAD_HEAD", detail: "Wrong head.", repair: "Recheck head." },
  };
  let state = observed(acknowledged(), "RETURN", failure);
  state = observed(dispatch(state).state, "ACK");
  state = observed(state, "RETURN", failure);
  assert.equal(state.status, "BLOCKED");
  assert.equal(state.blocker.code, "REPAIR_LIMIT");
  assert.equal(dispatch(state).action, null);
});
test("missing acknowledgment checks delivery twice then gives an explicit blocker", () => {
  let state = dispatch(create()).state;
  let result = transition(state, command("TICK", {}, 1000), policy());
  assert.equal(result.action.type, "CHECK_DELIVERY");
  state = observed(result.state, "UNCERTAIN", {}, policy(), 1001);
  result = transition(state, command("TICK", {}, 2000), policy());
  assert.equal(result.action.type, "CHECK_DELIVERY");
  result = transition(result.state, command("TICK", {}, 3000), policy());
  assert.equal(result.state.blocker.code, "ACK_MISSING");
  assert.equal(result.action, null);
});
test("proved non-delivery permits a bounded retry with a new attempt id", () => {
  let state = dispatch(create()).state;
  const first = state.dispatchId;
  state = transition(state, command("TICK", {}, 1000), policy()).state;
  state = observed(state, "NOT_DELIVERED", {}, policy(), 1001);
  const retry = dispatch(state, policy(), 1002);
  assert.equal(retry.state.attempt, 2);
  assert.notEqual(retry.state.dispatchId, first);
  state = transition(retry.state, command("TICK", {}, 2002), policy()).state;
  state = observed(state, "NOT_DELIVERED", {}, policy(), 2003);
  assert.equal(state.blocker.code, "DELIVERY_LIMIT");
});
test("duplicate or uncertain dispatch never emits a second packet, including restart", () => {
  const first = dispatch(create());
  const restarted = JSON.parse(JSON.stringify(first.state));
  assert.equal(dispatch(restarted).action, null);
  const uncertain = observed(restarted, "UNCERTAIN");
  assert.equal(dispatch(uncertain).action, null);
  assert.equal(uncertain.attempt, 1);
  assert.throws(() => transition(restarted, command("CREATE", { input: {} }), policy()), /EXISTS/);
});
test("duplicate acknowledgment and return receipts are idempotent after advancing", () => {
  let state = acknowledged();
  const ack = state.receipts[0];
  const returned = receipt(state, "RETURN", { outcome: "PASS", summary: "Done." });
  state = transition(state, command("RECEIPT", { receipt: returned }, 20), policy()).state;
  assert.deepEqual(
    transition(state, command("RECEIPT", { receipt: ack }, 21), policy()).state,
    state,
  );
  assert.deepEqual(
    transition(state, command("RECEIPT", { receipt: returned }, 21), policy()).state,
    state,
  );
});
test("unauthorized external or missing-receipt routes fail before dispatch", () => {
  const p = policy();
  p.routes.review.destination = "https://guessed-grok-channel.invalid";
  assert.throws(() => create(p), /UNAUTHORIZED_ROUTE/);
  p.routes.review.destination = "collaboration:/root/review_child";
  p.routes.review.authorizationReceipt = "";
  assert.throws(() => create(p), /UNAUTHORIZED_ROUTE/);
});
test("independent acceptance cannot route to a contributor", () => {
  const p = policy();
  p.contributors.push("review-child");
  assert.throws(() => create(p), /INDEPENDENCE/);
});
test("only the effective holder writes; policy/head drift and stale receipts fail closed", () => {
  const state = dispatch(create()).state;
  assert.throws(
    () => transition(state, { ...command("DISPATCH"), writer: "other" }, policy()),
    /WRITER/,
  );
  const changed = policy();
  changed.head = "a".repeat(40);
  assert.throws(() => dispatch(state, changed), /POLICY_DRIFT/);
  assert.throws(() => observed(state, "ACK", { head: "b".repeat(40) }), /RECEIPT_BINDING/);
  assert.throws(
    () => observed(state, "ACK", { destination: "collaboration:/root/other" }),
    /RECEIPT_BINDING/,
  );
});
test("missing error details, return before ack, false non-delivery, and clock rollback are rejected", () => {
  const state = dispatch(create()).state;
  assert.throws(
    () => observed(state, "RETURN", { outcome: "PASS", summary: "Done." }),
    /ACK_REQUIRED/,
  );
  assert.throws(() => observed(state, "NOT_DELIVERED"), /CHECK_REQUIRED/);
  const ack = observed(state, "ACK");
  assert.throws(
    () => observed(ack, "RETURN", { outcome: "FAIL", summary: "Failed." }),
    /CONCRETE_ERROR/,
  );
  assert.throws(() => transition(ack, command("TICK", {}, 9), policy()), /CLOCK/);
});
test("acknowledged but missing return is bounded and never resends work", () => {
  let state = acknowledged();
  for (const now of [1010, 2010]) {
    const result = transition(state, command("TICK", {}, now), policy());
    assert.equal(result.action.type, "CHECK_RETURN");
    state = result.state;
    assert.equal(dispatch(state, policy(), now).action, null);
  }
  state = transition(state, command("TICK", {}, 3010), policy()).state;
  assert.equal(state.blocker.code, "RETURN_MISSING");
});
test("named holds and invalid limits are rejected", () => {
  for (const taskId of ["PR-1250", "PR-1740", "PR-2106"]) {
    const p = policy();
    p.taskId = taskId;
    assert.throws(() => create(p), /HELD_TASK/);
  }
  const p = policy();
  p.maxAttempts = 100;
  assert.throws(() => create(p), /BOUNDS/);
});
test("later uncertainty revokes proved-absent retry eligibility", () => {
  let state = dispatch(create()).state;
  state = transition(state, command("TICK", {}, 1000), policy()).state;
  state = observed(state, "NOT_DELIVERED", {}, policy(), 1001);
  assert.equal(state.status, "READY");
  state = observed(state, "UNCERTAIN", {}, policy(), 1002);
  assert.equal(state.status, "AWAITING_ACK");
  assert.equal(dispatch(state, policy(), 1003).action, null);
  assert.equal(state.attempt, 1);
});
test("a late acknowledgment revokes retry eligibility before another send", () => {
  let state = dispatch(create()).state;
  state = transition(state, command("TICK", {}, 1000), policy()).state;
  state = observed(state, "NOT_DELIVERED", {}, policy(), 1001);
  state = observed(state, "ACK", {}, policy(), 1002);
  assert.equal(state.status, "ACKNOWLEDGED");
  assert.equal(dispatch(state, policy(), 1003).action, null);
});
test("success cannot enter a repair route and protected paths reject casing aliases", () => {
  const p = policy();
  p.routes.review.onSuccess = "repair";
  assert.throws(() => create(p), /UNAUTHORIZED_ROUTE/);
  for (const path of ["DOCS/AGENTS/OWNERSHIP.md", "scripts//double.mjs"]) {
    const scoped = policy();
    scoped.paths = [path];
    assert.throws(() => create(scoped), /PROTECTED_SCOPE/);
  }
});
test("receipts cannot be replayed across tasks that reuse a correlation id", () => {
  const first = dispatch(create()).state;
  const otherPolicy = policy();
  otherPolicy.taskId = "OTHER-TASK";
  const second = dispatch(create(otherPolicy), otherPolicy).state;
  assert.throws(
    () =>
      transition(
        second,
        command(
          "RECEIPT",
          {
            receipt: receipt(first, "ACK"),
          },
          10,
        ),
        otherPolicy,
      ),
    /RECEIPT_BINDING/,
  );
});
test("distinct uncertainty observations are bounded instead of growing forever", () => {
  let state = dispatch(create()).state;
  for (let n = 1; n <= 3; n++)
    state = observed(state, "UNCERTAIN", { evidence: `fixture:uncertain-${n}` }, policy(), n);
  assert.equal(state.status, "BLOCKED");
  assert.equal(state.blocker.code, "OBSERVATION_LIMIT");
  assert.equal(state.receipts.length, 2);
  assert.equal(dispatch(state).action, null);
});
