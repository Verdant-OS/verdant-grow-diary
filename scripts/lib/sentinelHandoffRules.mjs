// Host-driven Sentinel routing. No network, tool calls, timers or authority grants.
// The host must persist a transition before acting on its emitted packet.
import { createHash } from "node:crypto";

const REPOSITORY = "Verdant-OS/verdant-grow-diary";
const TERMINAL = new Set(["COMPLETED", "BLOCKED"]);
const text = (v) => typeof v === "string" && v.trim().length > 0 && v.length <= 2000;
const canonical = (v) =>
  JSON.stringify(v, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );
const digest = (v) => createHash("sha256").update(canonical(v)).digest("hex");
function requireValue(condition, code) {
  if (!condition) throw new Error(code);
}

function validatePolicy(p) {
  requireValue(
    p?.repository === REPOSITORY &&
      /^[a-f0-9]{40}$/.test(p.head) &&
      text(p.branch) &&
      text(p.taskId) &&
      text(p.holder) &&
      text(p.claimReceipt),
    "POLICY_REQUIRED",
  );
  requireValue(!/(?:^|\D)(?:1250|1740|2106)(?:\D|$)/.test(p.taskId), "HELD_TASK");
  requireValue(
    Array.isArray(p.paths) &&
      p.paths.length > 0 &&
      p.paths.length <= 20 &&
      p.paths.every(
        (path) =>
          text(path) &&
          !path.includes("\\") &&
          !path.startsWith("/") &&
          !path.split("/").some((part) => part === ".." || part === "." || part === "") &&
          !/^(?:[a-z]:|supabase\/|\.github\/|\.claude\/|\.grok\/|\.agents\/)/i.test(path) &&
          !/(?:\.sql$|lock(?:file)?|census|AGENTS\.md$|CLAUDE\.md$|GEMINI\.md$)/i.test(path) &&
          (!path.toLowerCase().startsWith("docs/agents/") || path === "docs/agents/HANDOFF_LOG.md"),
      ),
    "PROTECTED_SCOPE",
  );
  requireValue(
    Array.isArray(p.contributors) &&
      p.contributors.includes(p.holder) &&
      text(p.independentReviewer),
    "INDEPENDENCE",
  );
  for (const [key, max] of [
    ["maxAttempts", 2],
    ["maxChecks", 2],
    ["maxRepairs", 1],
    ["maxHops", 6],
  ]) {
    requireValue(Number.isInteger(p[key]) && p[key] >= 1 && p[key] <= max, "BOUNDS");
  }
  requireValue(Number.isSafeInteger(p.waitMs) && p.waitMs >= 1 && p.waitMs <= 3600000, "BOUNDS");
  requireValue(
    p.routes && Object.keys(p.routes).length > 0 && Object.keys(p.routes).length <= 20,
    "UNAUTHORIZED_ROUTE",
  );
  for (const route of Object.values(p.routes)) {
    requireValue(
      text(route.from) &&
        text(route.to) &&
        text(route.authorizationReceipt) &&
        /^collaboration:\/root(?:\/[a-z0-9_]+)*$/.test(route.destination) &&
        ["review", "handoff", "repair_request"].includes(route.purpose),
      "UNAUTHORIZED_ROUTE",
    );
    if (route.purpose === "review") {
      requireValue(
        route.to === p.independentReviewer && !p.contributors.includes(route.to),
        "INDEPENDENCE",
      );
    }
    if (route.purpose === "repair_request") requireValue(route.to === p.holder, "WRITER");
    for (const next of [route.onSuccess, route.onFailure]) {
      requireValue(
        next === null ||
          (typeof next === "string" &&
            Object.hasOwn(p.routes, next) &&
            p.routes[next].from === route.to),
        "UNAUTHORIZED_ROUTE",
      );
    }
    if (route.onFailure !== null) {
      requireValue(p.routes[route.onFailure].purpose === "repair_request", "UNAUTHORIZED_ROUTE");
    }
    if (route.onSuccess !== null)
      requireValue(p.routes[route.onSuccess].purpose !== "repair_request", "UNAUTHORIZED_ROUTE");
  }
}

function event(state, now, status, detail) {
  state.status = status;
  state.lastAt = now;
  state.nextAction = detail;
  state.history.push({
    at: now,
    status,
    detail,
    routeId: state.routeId,
    dispatchId: state.dispatchId ?? null,
  });
}
function block(state, now, code, detail) {
  state.blocker = { code, detail, owner: state.holder };
  event(state, now, "BLOCKED", `${code}: ${detail} Owner: ${state.holder}.`);
}
function setRoute(state, routeId, p, now) {
  const route = p.routes[routeId];
  Object.assign(state, {
    routeId,
    from: route.from,
    to: route.to,
    destination: route.destination,
    purpose: route.purpose,
    attempt: 0,
    checks: 0,
    checkPending: false,
    dispatchId: null,
    deadline: null,
    deliveryAck: null,
    returnReceipt: null,
  });
  event(
    state,
    now,
    "READY",
    `Send read-only ${route.purpose} to ${route.to}; sole writer remains ${p.holder}.`,
  );
}
function packet(state, p) {
  const repair =
    state.purpose === "repair_request"
      ? `Repair ${state.repairs}/${p.maxRepairs}: ${state.error.repair}`
      : "Read-only bounded task";
  return {
    correlationId: state.correlationId,
    taskId: state.taskId,
    head: state.head,
    repository: state.repository,
    branch: state.branch,
    policyDigest: state.policyDigest,
    dispatchId: state.dispatchId,
    from: state.from,
    to: state.to,
    destination: state.destination,
    purpose: state.purpose,
    summary: state.summary,
    error: state.error,
    readable: [
      "HANDOFF",
      `Correlation: ${state.correlationId}`,
      `Task: ${state.taskId}`,
      `Repository: ${state.repository}`,
      `Branch: ${state.branch}`,
      `Exact head: ${state.head}`,
      `Dispatch: ${state.dispatchId}`,
      `From: ${state.from} -> To: ${state.to}`,
      `Policy digest: ${state.policyDigest}`,
      `Verified destination: ${state.destination}`,
      `Authorization receipt: ${p.routes[state.routeId].authorizationReceipt}`,
      `Scope: ${p.paths.join(", ")}`,
      `Request: ${state.summary}`,
      repair,
      `Error: ${state.error ? `${state.error.code}: ${state.error.detail}` : "none"}`,
      `ACK and RETURN must echo repository, taskId, branch, head, policyDigest, correlationId, dispatchId and destination; set from to ${state.to} and include actual channel evidence.`,
      `Read-only request; sole writer: ${p.holder}. No claim transfer or independent acceptance implied.`,
      "No merge, deploy, production write, protected-file edit, credentials/settings change or external communication.",
      `Delivery checks <= ${p.maxChecks}; send attempts <= ${p.maxAttempts}; route hops <= ${p.maxHops}.`,
    ].join("\n"),
  };
}

/** Pure transition: commands/receipts are observations supplied by the trusted host. */
export function transition(previous, command, policy) {
  validatePolicy(policy);
  requireValue(command.writer === policy.holder, "WRITER");
  requireValue(
    Number.isSafeInteger(command.now) &&
      command.now >= 0 &&
      (!previous || command.now >= previous.lastAt),
    "CLOCK",
  );
  const policyDigest = digest(policy);
  if (previous) requireValue(previous.policyDigest === policyDigest, "POLICY_DRIFT");
  let state = previous ? structuredClone(previous) : null;
  let action = null;
  const { now } = command;
  if (command.type === "CREATE") {
    requireValue(!state, "EXISTS");
    const input = command.input;
    requireValue(
      input &&
        text(input.correlationId) &&
        text(input.summary) &&
        ["repository", "branch", "head", "taskId"].every((key) => input[key] === policy[key]) &&
        Object.hasOwn(policy.routes, input.routeId) &&
        policy.routes[input.routeId].from === policy.holder &&
        policy.routes[input.routeId].purpose !== "repair_request",
      "INPUT_BINDING",
    );
    state = {
      version: 1,
      policyDigest,
      correlationId: input.correlationId,
      repository: input.repository,
      branch: input.branch,
      head: input.head,
      taskId: input.taskId,
      holder: policy.holder,
      summary: input.summary,
      error: null,
      hops: 1,
      repairs: 0,
      acceptance: "NOT_MEASURED",
      receipts: [],
      history: [],
    };
    setRoute(state, input.routeId, policy, now);
  } else {
    requireValue(state, "CREATE_REQUIRED");
    if (command.type === "RECEIPT") {
      const r = command.receipt;
      requireValue(r && text(r.evidence), "RECEIPT_EVIDENCE");
      const duplicate = state.receipts.find(
        (saved) =>
          saved.kind === r.kind &&
          saved.dispatchId === r.dispatchId &&
          saved.evidence === r.evidence,
      );
      if (duplicate) {
        requireValue(canonical(duplicate) === canonical(r), "RECEIPT_CONFLICT");
        return { state: previous, action: null };
      }
      requireValue(!TERMINAL.has(state.status), "TERMINAL");
      requireValue(
        state.dispatchId &&
          r.correlationId === state.correlationId &&
          r.repository === state.repository &&
          r.taskId === state.taskId &&
          r.branch === state.branch &&
          r.policyDigest === state.policyDigest &&
          r.head === state.head &&
          r.dispatchId === state.dispatchId &&
          r.destination === state.destination &&
          r.from === state.to,
        "RECEIPT_BINDING",
      );
      if (r.kind === "RETURN") {
        requireValue(state.status === "ACKNOWLEDGED", "ACK_REQUIRED");
        requireValue(["PASS", "FAIL"].includes(r.outcome) && text(r.summary), "RETURN_REQUIRED");
        if (r.outcome === "FAIL")
          requireValue(
            r.error && ["code", "detail", "repair"].every((key) => text(r.error[key])),
            "CONCRETE_ERROR",
          );
        state.receipts.push(structuredClone(r));
        state.returnReceipt = r;
        event(state, now, "RETURNED", `${state.to} returned ${r.outcome}: ${r.summary}`);
        state.summary = r.summary;
        state.error = r.outcome === "FAIL" ? r.error : null;
        const next = policy.routes[state.routeId][r.outcome === "PASS" ? "onSuccess" : "onFailure"];
        if (r.outcome === "FAIL" && state.repairs >= policy.maxRepairs) {
          block(
            state,
            now,
            "REPAIR_LIMIT",
            "Bounded repair request exhausted; holder must report the concrete error.",
          );
        } else if (r.outcome === "FAIL" && !next) {
          block(
            state,
            now,
            "NO_REPAIR_ROUTE",
            "No authorized repair recipient; holder must report the concrete error.",
          );
        } else if (!next) {
          event(
            state,
            now,
            "COMPLETED",
            "Return receipt recorded; independent acceptance remains NOT_MEASURED.",
          );
        } else if (state.hops >= policy.maxHops) {
          block(
            state,
            now,
            "HOP_LIMIT",
            "Route bound reached; holder must select an explicitly authorized next slice.",
          );
        } else {
          if (r.outcome === "FAIL") state.repairs++;
          state.hops++;
          setRoute(state, next, policy, now);
        }
      } else if (r.kind === "ACK") {
        requireValue(["AWAITING_ACK", "READY"].includes(state.status), "ACK_STATE");
        state.receipts.push(structuredClone(r));
        state.deliveryAck = r;
        state.checks = 0;
        state.checkPending = false;
        state.deadline = now + policy.waitMs;
        event(
          state,
          now,
          "ACKNOWLEDGED",
          `${state.to} acknowledged delivery; await exact-head return receipt.`,
        );
      } else if (r.kind === "NOT_DELIVERED") {
        requireValue(state.status === "AWAITING_ACK" && state.checkPending, "CHECK_REQUIRED");
        state.receipts.push(structuredClone(r));
        state.checkPending = false;
        if (state.attempt >= policy.maxAttempts)
          block(state, now, "DELIVERY_LIMIT", "Verified non-delivery exhausted send attempts.");
        else
          event(
            state,
            now,
            "READY",
            "Host verified non-delivery; one bounded retry may be reserved.",
          );
      } else {
        requireValue(r.kind === "UNCERTAIN", "RECEIPT_KIND");
        if (
          state.receipts.filter(
            (saved) => saved.kind === "UNCERTAIN" && saved.dispatchId === r.dispatchId,
          ).length >= policy.maxChecks
        ) {
          block(
            state,
            now,
            "OBSERVATION_LIMIT",
            "Uncertainty observation bound reached. Reconcile the same dispatch; do not resend.",
          );
        } else {
          state.receipts.push(structuredClone(r));
          state.checkPending = false;
          event(
            state,
            now,
            state.status === "READY" ? "AWAITING_ACK" : state.status,
            "Delivery/return uncertain. Check the same dispatch; do not resend.",
          );
        }
      }
    } else if (command.type === "DISPATCH") {
      if (state.status === "READY") {
        state.attempt++;
        state.dispatchId = `${state.correlationId}/${state.policyDigest}/hop-${state.hops}/attempt-${state.attempt}`;
        state.deadline = now + policy.waitMs;
        event(
          state,
          now,
          "AWAITING_ACK",
          `Reserved ${state.dispatchId}; delivery not yet acknowledged. Never re-emit under uncertainty.`,
        );
        action = { type: "DISPATCH", packet: packet(state, policy) };
      }
    } else if (command.type === "TICK") {
      if (["AWAITING_ACK", "ACKNOWLEDGED"].includes(state.status) && now >= state.deadline) {
        if (state.checks >= policy.maxChecks) {
          block(
            state,
            now,
            state.status === "AWAITING_ACK" ? "ACK_MISSING" : "RETURN_MISSING",
            "Receipt checks exhausted. Reconcile the same dispatch in the existing channel; do not redispatch.",
          );
        } else {
          state.checks++;
          state.checkPending = true;
          state.deadline = now + policy.waitMs;
          event(
            state,
            now,
            state.status,
            `Receipt check ${state.checks}/${policy.maxChecks}; do not resend work.`,
          );
          action = {
            type: state.status === "AWAITING_ACK" ? "CHECK_DELIVERY" : "CHECK_RETURN",
            packet: packet(state, policy),
          };
        }
      }
    } else requireValue(command.type === "STATUS", "COMMAND");
  }
  return { state, action };
}
