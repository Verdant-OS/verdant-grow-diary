import type { Page, Request, Response, Route } from "@playwright/test";
import {
  QUICKLOG_SMOKE_ACCOUNT_EMAIL,
  QUICKLOG_SMOKE_BACKEND_ORIGIN,
} from "./productionQuickLogFixtureRules";
import { PERFORMANCE_ORIGIN } from "./signedInPerformanceRules";

const userEndpoint = QUICKLOG_SMOKE_BACKEND_ORIGIN + "/auth/v1/user";
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

/** Normal app identity reads only. No credentials, payloads or row data in receipts.
 * All non-read HTTP methods and WebSockets are blocked before the first navigation.
 * POST read RPCs are deliberately blocked too: no inferred SQL purity exemption.
 */
export async function installSignedInReadonlyProof(page: Page) {
  let accountId: string | null = null;
  let invalidated = false;
  let disposed = false;
  let blockedWrites = 0;
  const blockedRequests: BlockedReadonlyRequest[] = [];
  const pendingReads = new Set<Request>();
  const pendingBodies = new Set<Promise<void>>();
  const context = page.context();

  const requestListener = (request: Request) => {
    if (isUserRead(request)) pendingReads.add(request);
  };
  const finishedListener = (request: Request) => pendingReads.delete(request);
  const failedListener = (request: Request) => {
    if (pendingReads.delete(request)) invalidated = true;
  };
  const responseListener = (response: Response) => {
    if (!isUserRead(response.request()) || response.url().split("?")[0] !== userEndpoint) return;
    const capture = (async () => {
      try {
        if (response.status() !== 200) throw new Error("identity_rejected");
        const value: unknown = await response.json();
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
    if (disposed || invalidated || !accountId || pendingReads.size || blockedWrites)
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
      (!accountId || pendingReads.size || pendingBodies.size) &&
      Date.now() < deadline
    )
      await new Promise((resolve) => setTimeout(resolve, 25));
    await assertReady();
  }
  const routeHandler = async (route: Route) => {
    const request = route.request();
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
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
