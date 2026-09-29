import type { Page, Request, Response, Route } from "@playwright/test";
import {
  QUICKLOG_SMOKE_ACCOUNT_EMAIL,
  QUICKLOG_SMOKE_BACKEND_ORIGIN,
} from "./productionQuickLogFixtureRules";
import { PERFORMANCE_ORIGIN } from "./signedInPerformanceRules";

const userEndpoint = QUICKLOG_SMOKE_BACKEND_ORIGIN + "/auth/v1/user";
const operatorRoleEndpoint = QUICKLOG_SMOKE_BACKEND_ORIGIN + "/rest/v1/rpc/has_role";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUserRead = (request: Request) =>
  request.method() === "GET" && request.url().split("?")[0] === userEndpoint;

export type BlockedReadonlyRequest = {
  method: "POST" | "PUT" | "PATCH" | "DELETE" | "WEBSOCKET" | "OTHER";
  capability:
    | "backend-auth"
    | "backend-rpc:has_role"
    | "backend-rpc"
    | "backend-table"
    | "backend-function"
    | "websocket"
    | "other";
};
/** A finite diagnostic vocabulary: no URL, query, row id or payload is exported. */
export function classifyBlockedReadonlyRequest(
  method: unknown,
  target: unknown,
): BlockedReadonlyRequest {
  const safeMethod: BlockedReadonlyRequest["method"] =
    method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE"
      ? method
      : "OTHER";
  let capability: BlockedReadonlyRequest["capability"] = "other";
  try {
    const url = new URL(typeof target === "string" ? target : "");
    if (url.origin === QUICKLOG_SMOKE_BACKEND_ORIGIN) {
      if (url.pathname.startsWith("/auth/")) capability = "backend-auth";
      else if (url.pathname === "/rest/v1/rpc/has_role") capability = "backend-rpc:has_role";
      else if (url.pathname.startsWith("/rest/v1/rpc/")) capability = "backend-rpc";
      else if (url.pathname.startsWith("/rest/")) capability = "backend-table";
      else if (url.pathname.startsWith("/functions/")) capability = "backend-function";
    }
  } catch {
    /* Invalid targets remain an opaque diagnostic. */
  }
  return { method: safeMethod, capability };
}

/** Existing app query only: has_role is a STABLE boolean SELECT in its source
 * contract. No generic RPC permission, elevated role or arbitrary user lookup.
 */
export function isFixtureOperatorRoleRead(
  method: unknown,
  target: unknown,
  body: unknown,
  accountId: unknown,
): boolean {
  if (
    method !== "POST" ||
    target !== operatorRoleEndpoint ||
    typeof accountId !== "string" ||
    !uuid.test(accountId)
  )
    return false;
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const value = body as Record<string, unknown>;
  return (
    Object.keys(value).length === 2 &&
    Object.hasOwn(value, "_user_id") &&
    Object.hasOwn(value, "_role") &&
    value._user_id === accountId &&
    value._role === "operator"
  );
}

/** Normal app identity reads only. No credentials, payloads or row data in receipts.
 * Mutations and WebSockets are blocked before the first navigation. The sole
 * POST exception is the existing fixture-account operator role SELECT above.
 */
export async function installSignedInReadonlyProof(page: Page) {
  let accountId: string | null = null;
  let invalidated = false;
  let disposed = false;
  let blockedWrites = 0;
  const blockedRequests: BlockedReadonlyRequest[] = [];
  const pendingReads = new Set<Request>();
  const pendingRoleReads = new Set<Request>();
  const allowedRoleRequests = new Set<Request>();
  let allowedRoleReads = 0;
  const pendingBodies = new Set<Promise<void>>();
  const context = page.context();

  const requestListener = (request: Request) => {
    if (isUserRead(request)) pendingReads.add(request);
  };
  const finishedListener = (request: Request) => {
    pendingReads.delete(request);
    pendingRoleReads.delete(request);
  };
  const failedListener = (request: Request) => {
    if (pendingReads.delete(request)) invalidated = true;
    if (pendingRoleReads.delete(request)) invalidated = true;
  };
  const responseListener = (response: Response) => {
    const roleRead = allowedRoleRequests.has(response.request());
    if (
      !roleRead &&
      (!isUserRead(response.request()) || response.url().split("?")[0] !== userEndpoint)
    )
      return;
    const capture = (async () => {
      try {
        if (response.status() !== 200) throw new Error("identity_rejected");
        const value: unknown = await response.json();
        if (roleRead) {
          if (typeof value !== "boolean") throw new Error("role_read_not_boolean");
          return;
        }
        const body = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
        if (
          !body ||
          typeof body.id !== "string" ||
          !uuid.test(body.id) ||
          body.email !== QUICKLOG_SMOKE_ACCOUNT_EMAIL ||
          (accountId !== null && accountId !== body.id)
        )
          throw new Error("fixture_account_required");
        accountId = body.id;
      } catch {
        invalidated = true;
      }
    })();
    pendingBodies.add(capture);
    void capture.finally(() => pendingBodies.delete(capture));
  };
  page.on("request", requestListener);
  page.on("requestfinished", finishedListener);
  page.on("requestfailed", failedListener);
  page.on("response", responseListener);

  async function assertReady() {
    await Promise.all([...pendingBodies]);
    if (
      disposed ||
      invalidated ||
      !accountId ||
      pendingReads.size ||
      pendingRoleReads.size ||
      blockedWrites
    )
      throw new Error("read_only_fixture_account_proof_unavailable");
    if (new URL(page.url()).origin !== PERFORMANCE_ORIGIN)
      throw new Error("production_origin_required");
  }
  async function waitForAccount() {
    const deadline = Date.now() + 20_000;
    while (
      !disposed &&
      !invalidated &&
      !blockedWrites &&
      (!accountId || pendingReads.size || pendingRoleReads.size || pendingBodies.size) &&
      Date.now() < deadline
    )
      await new Promise((resolve) => setTimeout(resolve, 25));
    await assertReady();
  }
  const routeHandler = async (route: Route) => {
    const request = route.request();
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      if (!disposed && request.method() === "POST" && request.url() === operatorRoleEndpoint) {
        try {
          await waitForAccount();
          if (
            isFixtureOperatorRoleRead(
              request.method(),
              request.url(),
              request.postDataJSON(),
              accountId,
            )
          ) {
            allowedRoleRequests.add(request);
            pendingRoleReads.add(request);
            allowedRoleReads += 1;
            await route.continue();
            return;
          }
        } catch {
          /* Missing proof or malformed arguments must stay blocked. */
        }
      }
      blockedWrites += 1;
      if (blockedRequests.length < 64)
        blockedRequests.push(classifyBlockedReadonlyRequest(request.method(), request.url()));
      await route.abort("blockedbyclient");
      return;
    }
    if (disposed) {
      await route.abort("blockedbyclient");
      return;
    }
    // No backend row read can precede the fixture-account proof. Identity and
    // public assets remain accessible; wrong-account navigation is refused.
    if (request.url().startsWith(QUICKLOG_SMOKE_BACKEND_ORIGIN + "/rest/")) {
      try {
        await waitForAccount();
      } catch {
        invalidated = true;
        await route.abort("blockedbyclient");
        return;
      }
    }
    await route.continue();
  };
  await context.route("**/*", routeHandler);
  await context.routeWebSocket("**/*", (socket) => {
    blockedWrites += 1;
    if (blockedRequests.length < 64)
      blockedRequests.push({ method: "WEBSOCKET", capability: "websocket" });
    socket.close();
  });
  return {
    waitForAccount,
    assertReady,
    blockedWrites: () => blockedWrites,
    allowedRoleReads: () => allowedRoleReads,
    blockedRequests: () => blockedRequests.map((item) => ({ ...item })),
    dispose: () => {
      disposed = true;
      page.off("request", requestListener);
      page.off("requestfinished", finishedListener);
      page.off("requestfailed", failedListener);
      page.off("response", responseListener);
      // Keep barriers installed until this test's context closes. Removing
      // them while the app is mounted could let an automatic retry write.
    },
  };
}
