import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { runInNewContext } from "node:vm";
import { load } from "js-yaml";
import type { Page, Request, Response, Route, WebSocketRoute } from "@playwright/test";
import {
  classifyBlockedReadonlyRequest,
  installSignedInReadonlyProof,
  isFixtureOperatorRoleRead,
  isFixtureDiaryPhotoSignRead,
  isCompleteFixtureDiaryPhotoSignResponse,
} from "../../e2e/lib/signedInReadonlyProof";
import { QUICKLOG_SMOKE_BACKEND_ORIGIN } from "../../e2e/lib/productionQuickLogFixtureRules";

const account = { id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", email: "cheekhimself@gmail.com" };
const identityUrl = QUICKLOG_SMOKE_BACKEND_ORIGIN + "/auth/v1/user";
const photoEndpoint = QUICKLOG_SMOKE_BACKEND_ORIGIN + "/storage/v1/object/sign/diary-photos";
const photoPath = account.id + "/grow/photo.jpg";
async function harness() {
  const listeners = new Map<string, (value: unknown) => void>();
  let handler: (route: Route) => Promise<void>;
  let socketHandler: (socket: WebSocketRoute) => void;
  let url = "https://verdantgrowdiary.com/dashboard";
  const context = {
    route: vi.fn(async (_pattern, fn) => {
      handler = fn;
    }),
    routeWebSocket: vi.fn(async (_pattern, fn) => {
      socketHandler = fn;
    }),
  };
  const page = {
    context: () => context,
    url: () => url,
    on: (event: string, listener: (value: unknown) => void) => listeners.set(event, listener),
    off: (event: string) => listeners.delete(event),
  } as unknown as Page;
  const proof = await installSignedInReadonlyProof(page);
  const request = (method = "GET", target = identityUrl, body?: unknown) =>
    ({ method: () => method, url: () => target, postDataJSON: () => body }) as Request;
  const emit = (body: unknown = account, status = 200, target = identityUrl, method = "GET") => {
    const req = request(method, target);
    listeners.get("response")?.({
      request: () => req,
      url: () => target,
      status: () => status,
      json: async () => body,
    } as unknown as Response);
  };
  async function route(
    method: string,
    target = "https://verdantgrowdiary.com/asset.js",
    body?: unknown,
  ) {
    const req = request(method, target, body);
    const value = { request: () => req, abort: vi.fn(), continue: vi.fn() };
    await handler!(value as unknown as Route);
    return value;
  }
  return {
    proof,
    page,
    context,
    emit,
    route,
    listeners,
    request,
    respond: (req: Request, body: unknown, status = 200) =>
      listeners.get("response")?.({
        request: () => req,
        url: () => req.url(),
        status: () => status,
        json: async () => body,
      } as unknown as Response),
    navigate: (value: string) => {
      url = value;
    },
    socket: () => {
      const close = vi.fn();
      socketHandler!({ close } as unknown as WebSocketRoute);
      return close;
    },
  };
}

describe("signed-in read-only production proof", () => {
  it("permits only the proved fixture's normal diary-photo display signing read", async () => {
    const h = await harness();
    h.emit();
    await h.proof.assertReady();
    const path = account.id + "/grow/photo.jpg";
    const request = await h.route(
      "POST",
      QUICKLOG_SMOKE_BACKEND_ORIGIN + "/storage/v1/object/sign/diary-photos",
      {
        paths: [path],
        expiresIn: 3600,
      },
    );
    expect(request.continue).toHaveBeenCalledOnce();
    expect(request.abort).not.toHaveBeenCalled();
    await expect(h.proof.assertReady()).rejects.toThrow("proof_unavailable");
    h.respond(request.request(), [
      {
        path,
        error: null,
        signedURL: "/object/sign/diary-photos/" + path + "?token=synthetic-test-only",
      },
    ]);
    h.listeners.get("requestfinished")?.(request.request());
    await expect(h.proof.assertReady()).resolves.toBeUndefined();
    expect(h.proof.blockedRequests()).toEqual([]);
    expect(h.proof.allowedPhotoReads()).toBe(1);
  });
  it.each([
    null,
    undefined,
    [],
    {},
    { paths: [], expiresIn: 3600 },
    { paths: [photoPath], expiresIn: 0 },
    { paths: [photoPath], expiresIn: "3600" },
    { paths: [photoPath], expiresIn: 3600, transform: { width: 1 } },
    { paths: [photoPath, photoPath], expiresIn: 3600 },
    { paths: ["bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb/grow/photo.jpg"], expiresIn: 3600 },
    { paths: [account.id + "/../photo.jpg"], expiresIn: 3600 },
    { paths: [account.id + "/%2e%2e/photo.jpg"], expiresIn: 3600 },
    { paths: [photoPath + "?private=true"], expiresIn: 3600 },
    { paths: [null], expiresIn: 3600 },
    {
      paths: Array.from({ length: 101 }, (_, i) => account.id + "/grow/" + i + ".jpg"),
      expiresIn: 3600,
    },
  ])("rejects unapproved photo signing arguments %#", (body) => {
    expect(isFixtureDiaryPhotoSignRead("POST", photoEndpoint, body, account.id)).toBe(false);
  });
  it.each([
    ["PUT", photoEndpoint, account.id],
    ["POST", photoEndpoint + "?extra=true", account.id],
    [
      "POST",
      QUICKLOG_SMOKE_BACKEND_ORIGIN + "/storage/v1/object/upload/sign/diary-photos",
      account.id,
    ],
    ["POST", QUICKLOG_SMOKE_BACKEND_ORIGIN + "/storage/v1/object/sign/another-bucket", account.id],
    ["POST", "https://evil.example/storage/v1/object/sign/diary-photos", account.id],
    ["POST", photoEndpoint, null],
    ["POST", photoEndpoint, "invalid"],
  ])("rejects unapproved photo endpoint, method or identity %#", (method, url, id) => {
    expect(
      isFixtureDiaryPhotoSignRead(method, url, { paths: [photoPath], expiresIn: 3600 }, id),
    ).toBe(false);
  });
  it.each([
    null,
    {},
    [],
    [
      {
        path: photoPath,
        error: "unavailable",
        signedURL: "/object/sign/diary-photos/" + photoPath + "?token=synthetic",
      },
    ],
    [{ path: "other", error: null, signedURL: "invalid" }],
    [{ path: photoPath, error: null, signedURL: null }],
    [{ path: photoPath, error: null, signedURL: "https://evil.example/private?token=synthetic" }],
    [{ path: photoPath, error: null, signedURL: "/object/sign/diary-photos/" + photoPath }],
    [
      {
        path: photoPath,
        error: null,
        signedURL: "/object/sign/diary-photos/" + photoPath + "?token=synthetic&extra=1",
      },
    ],
    [
      {
        path: photoPath,
        error: null,
        signedURL: "/object/sign/diary-photos/" + photoPath + "?token=synthetic#fragment",
      },
    ],
  ])("invalidates a missing, incomplete or invalid photo response %#", async (body) => {
    const h = await harness();
    h.emit();
    await h.proof.assertReady();
    const request = await h.route("POST", photoEndpoint, { paths: [photoPath], expiresIn: 3600 });
    h.respond(request.request(), body);
    h.listeners.get("requestfinished")?.(request.request());
    await expect(h.proof.assertReady()).rejects.toThrow("proof_unavailable");
  });
  it("invalidates failed photo transport and does not permit signing after disposal", async () => {
    const h = await harness();
    h.emit();
    await h.proof.assertReady();
    const body = { paths: [photoPath], expiresIn: 3600 };
    const request = await h.route("POST", photoEndpoint, body);
    h.listeners.get("requestfailed")?.(request.request());
    await expect(h.proof.assertReady()).rejects.toThrow("proof_unavailable");
    h.proof.dispose();
    const after = await h.route("POST", photoEndpoint, body);
    expect(after.abort).toHaveBeenCalledOnce();
    expect(after.continue).not.toHaveBeenCalled();
    expect(h.proof.allowedPhotoReads()).toBe(1);
    expect(h.proof.blockedRequests()).toEqual([
      { method: "POST", capability: "backend-storage:diary-photo-sign" },
    ]);
  });
  it("is deterministic, bounded and does not mutate the request or response", () => {
    const body = { paths: [photoPath], expiresIn: 3600 };
    const response = [
      {
        path: photoPath,
        error: null,
        signedURL: "/object/sign/diary-photos/" + photoPath + "?token=synthetic",
      },
    ];
    const before = JSON.stringify({ body, response });
    for (let i = 0; i < 2; i++) {
      expect(isFixtureDiaryPhotoSignRead("POST", photoEndpoint, body, account.id)).toBe(true);
      expect(isCompleteFixtureDiaryPhotoSignResponse(response, body.paths)).toBe(true);
    }
    expect(JSON.stringify({ body, response })).toBe(before);
    expect(isCompleteFixtureDiaryPhotoSignResponse(response, [])).toBe(false);
    expect(
      isCompleteFixtureDiaryPhotoSignResponse([...response, ...response], [photoPath, "missing"]),
    ).toBe(false);
  });
  it("permits the existing boolean operator lookup for the positively proved fixture account", async () => {
    const h = await harness();
    h.emit();
    await h.proof.assertReady();
    const route = await h.route("POST", QUICKLOG_SMOKE_BACKEND_ORIGIN + "/rest/v1/rpc/has_role", {
      _user_id: account.id,
      _role: "operator",
    });
    expect(route.continue).toHaveBeenCalledOnce();
    expect(route.abort).not.toHaveBeenCalled();
    expect(h.proof.blockedWrites()).toBe(0);
    await expect(h.proof.assertReady()).rejects.toThrow("proof_unavailable");
    h.respond(route.request(), false);
    h.listeners.get("requestfinished")?.(route.request());
    await expect(h.proof.waitForAccount()).resolves.toBeUndefined();
    expect(h.proof.allowedRoleReads()).toBe(1);
  });
  it.each([
    null,
    undefined,
    {},
    [],
    { _user_id: account.id, _role: "customer" },
    { _user_id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb", _role: "operator" },
    { _user_id: account.id, _role: "operator", extra: true },
  ])("refuses unapproved role arguments %j", (body) => {
    expect(
      isFixtureOperatorRoleRead(
        "POST",
        QUICKLOG_SMOKE_BACKEND_ORIGIN + "/rest/v1/rpc/has_role",
        body,
        account.id,
      ),
    ).toBe(false);
  });
  it.each(["GET", "PUT", "PATCH", "DELETE"])("does not exempt role requests using %s", (method) => {
    expect(
      isFixtureOperatorRoleRead(
        method,
        QUICKLOG_SMOKE_BACKEND_ORIGIN + "/rest/v1/rpc/has_role",
        { _user_id: account.id, _role: "operator" },
        account.id,
      ),
    ).toBe(false);
  });
  it.each([null, "", "invalid"])(
    "does not exempt a role lookup without a proved account id %j",
    (id) => {
      expect(
        isFixtureOperatorRoleRead(
          "POST",
          QUICKLOG_SMOKE_BACKEND_ORIGIN + "/rest/v1/rpc/has_role",
          { _user_id: account.id, _role: "operator" },
          id,
        ),
      ).toBe(false);
    },
  );
  it.each([
    "https://evil.example/rest/v1/rpc/has_role",
    QUICKLOG_SMOKE_BACKEND_ORIGIN + "/rest/v1/rpc/has_role?injected=true",
    QUICKLOG_SMOKE_BACKEND_ORIGIN + "/rest/v1/rpc/other",
  ])("does not exempt another endpoint %s", (endpoint) => {
    expect(
      isFixtureOperatorRoleRead(
        "POST",
        endpoint,
        { _user_id: account.id, _role: "operator" },
        account.id,
      ),
    ).toBe(false);
  });
  it.each([null, {}, "true", 1])(
    "invalidates a permitted role request with non-boolean response %j",
    async (body) => {
      const h = await harness();
      h.emit();
      await h.proof.assertReady();
      const route = await h.route("POST", QUICKLOG_SMOKE_BACKEND_ORIGIN + "/rest/v1/rpc/has_role", {
        _user_id: account.id,
        _role: "operator",
      });
      h.respond(route.request(), body);
      h.listeners.get("requestfinished")?.(route.request());
      await expect(h.proof.assertReady()).rejects.toThrow("proof_unavailable");
    },
  );
  it("invalidates a failed permitted role request", async () => {
    const h = await harness();
    h.emit();
    await h.proof.assertReady();
    const route = await h.route("POST", QUICKLOG_SMOKE_BACKEND_ORIGIN + "/rest/v1/rpc/has_role", {
      _user_id: account.id,
      _role: "operator",
    });
    h.listeners.get("requestfailed")?.(route.request());
    await expect(h.proof.assertReady()).rejects.toThrow("proof_unavailable");
  });
  it.each([
    ["/auth/v1/token?private=discarded", "backend-auth"],
    ["/rest/v1/rpc/has_role?private=discarded", "backend-rpc:has_role"],
    ["/rest/v1/rpc/private_not_exported", "backend-rpc"],
    ["/rest/v1/plants?private=discarded", "backend-table"],
    ["/functions/v1/private_not_exported", "backend-function"],
  ])("records only the request class for %s", (endpoint, capability) => {
    const result = classifyBlockedReadonlyRequest("POST", QUICKLOG_SMOKE_BACKEND_ORIGIN + endpoint);
    expect(result).toEqual({ method: "POST", capability });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it.each([null, undefined, "invalid", "data:text/plain,private"])(
    "handles unknown request target %j without exporting it",
    (target) => {
      expect(classifyBlockedReadonlyRequest("private-method", target)).toEqual({
        method: "OTHER",
        capability: "other",
      });
    },
  );
  it.each([
    [QUICKLOG_SMOKE_BACKEND_ORIGIN + "/private?token=secret", "backend-other"],
    ["https://verdantgrowdiary.com/private?token=secret", "application-other"],
    ["https://evil.example/private?token=secret", "external"],
  ])("diagnoses only the origin class without allowing %s", async (target, capability) => {
    const expected = { method: "POST", capability };
    expect(classifyBlockedReadonlyRequest("POST", target)).toEqual(expected);
    expect(JSON.stringify(expected)).not.toMatch(/secret|private|evil|token/);
    const h = await harness();
    h.emit();
    await h.proof.assertReady();
    const request = await h.route("POST", target, { private: "secret" });
    expect(request.abort).toHaveBeenCalledOnce();
    expect(request.continue).not.toHaveBeenCalled();
    expect(h.proof.blockedRequests()).toEqual([expected]);
    expect(h.proof.blockedWrites()).toBe(1);
    await expect(h.proof.assertReady()).rejects.toThrow("proof_unavailable");
  });
  it("accepts only the normal server-validated fixture account without requiring plant rows", async () => {
    const h = await harness();
    h.emit({ ...account, token_like_unused_field: "private-unused" });
    await expect(h.proof.assertReady()).resolves.toBeUndefined();
    expect(h.context.route).toHaveBeenCalledWith("**/*", expect.any(Function));
    expect(h.context.routeWebSocket).toHaveBeenCalledWith("**/*", expect.any(Function));
    expect(h.proof.blockedWrites()).toBe(0);
  });
  it("refuses an unresolved first identity", async () => {
    const h = await harness();
    await expect(h.proof.assertReady()).rejects.toThrow("proof_unavailable");
  });
  it.each([
    null,
    {},
    { ...account, id: "" },
    { ...account, id: "invalid" },
    { ...account, email: null },
    { ...account, email: "matt@verdantgrowdiary.com" },
  ])("refuses malformed or foreign identity %j", async (body) => {
    const h = await harness();
    h.emit(body);
    await expect(h.proof.assertReady()).rejects.toThrow("proof_unavailable");
    h.emit();
    await expect(h.proof.assertReady()).rejects.toThrow("proof_unavailable");
  });
  it.each([401, 403, 500])("invalidates previous account proof on HTTP %i", async (status) => {
    const h = await harness();
    h.emit();
    await h.proof.assertReady();
    h.emit(account, status);
    await expect(h.proof.assertReady()).rejects.toThrow("proof_unavailable");
  });
  it("invalidates even a second account id with the approved email", async () => {
    const h = await harness();
    h.emit();
    await h.proof.assertReady();
    h.emit({ ...account, id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb" });
    await expect(h.proof.assertReady()).rejects.toThrow("proof_unavailable");
  });
  it.each(["https://evil.example/auth/v1/user", identityUrl + "/extra"])(
    "ignores untrusted identity endpoint %s",
    async (target) => {
      const h = await harness();
      h.emit(account, 200, target);
      await expect(h.proof.assertReady()).rejects.toThrow("proof_unavailable");
    },
  );
  it("does not treat POST identity payload as proof", async () => {
    const h = await harness();
    h.emit(account, 200, identityUrl, "POST");
    await expect(h.proof.assertReady()).rejects.toThrow("proof_unavailable");
  });
  it("refuses pending or failed account revalidation", async () => {
    const h = await harness();
    h.emit();
    await h.proof.assertReady();
    const request = h.request();
    h.listeners.get("request")?.(request);
    await expect(h.proof.assertReady()).rejects.toThrow("proof_unavailable");
    h.listeners.get("requestfailed")?.(request);
    h.emit();
    await expect(h.proof.assertReady()).rejects.toThrow("proof_unavailable");
  });
  it("allows a settled successful identity revalidation", async () => {
    const h = await harness();
    const request = h.request();
    h.listeners.get("request")?.(request);
    h.emit();
    h.listeners.get("requestfinished")?.(request);
    await expect(h.proof.waitForAccount()).resolves.toBeUndefined();
  });
  it.each(["POST", "PUT", "PATCH", "DELETE", "TRACE", "CONNECT", "unknown"])(
    "aborts %s before the server sees it and invalidates timing",
    async (method) => {
      const h = await harness();
      h.emit();
      await h.proof.assertReady();
      const route = await h.route(
        method,
        QUICKLOG_SMOKE_BACKEND_ORIGIN + "/rest/v1/rpc/read_named_rpc",
      );
      expect(route.abort).toHaveBeenCalledWith("blockedbyclient");
      expect(route.continue).not.toHaveBeenCalled();
      expect(h.proof.blockedWrites()).toBe(1);
      await expect(h.proof.assertReady()).rejects.toThrow("proof_unavailable");
    },
  );
  it.each(["GET", "HEAD", "OPTIONS"])(
    "allows read method %s without fabricating a response",
    async (method) => {
      const h = await harness();
      const route = await h.route(method);
      expect(route.continue).toHaveBeenCalledOnce();
      expect(route.abort).not.toHaveBeenCalled();
    },
  );
  it("blocks backend row reads for the wrong account", async () => {
    const h = await harness();
    h.emit({ ...account, email: "matt@verdantgrowdiary.com" });
    await expect(h.proof.assertReady()).rejects.toThrow("proof_unavailable");
    const route = await h.route("GET", QUICKLOG_SMOKE_BACKEND_ORIGIN + "/rest/v1/plants");
    expect(route.abort).toHaveBeenCalled();
    expect(route.continue).not.toHaveBeenCalled();
  });
  it("allows backend reads only after positive fixture-account proof", async () => {
    const h = await harness();
    h.emit();
    await h.proof.assertReady();
    const route = await h.route("GET", QUICKLOG_SMOKE_BACKEND_ORIGIN + "/rest/v1/plants");
    expect(route.continue).toHaveBeenCalledOnce();
    expect(route.abort).not.toHaveBeenCalled();
  });
  it("blocks WebSockets and withholds readiness", async () => {
    const h = await harness();
    h.emit();
    await h.proof.assertReady();
    expect(h.socket()).toHaveBeenCalledOnce();
    await expect(h.proof.assertReady()).rejects.toThrow("proof_unavailable");
  });
  it("does not release the network barrier when the proof is disposed", async () => {
    const h = await harness();
    h.emit();
    await h.proof.assertReady();
    h.proof.dispose();
    expect(h.listeners.size).toBe(0);
    for (const method of ["GET", "POST"]) {
      const route = await h.route(method);
      expect(route.abort).toHaveBeenCalledOnce();
      expect(route.continue).not.toHaveBeenCalled();
    }
    await expect(h.proof.assertReady()).rejects.toThrow("proof_unavailable");
  });
  it("refuses a redirect off the production origin", async () => {
    const h = await harness();
    h.emit();
    await h.proof.assertReady();
    h.navigate("https://evil.example");
    await expect(h.proof.assertReady()).rejects.toThrow("production_origin_required");
  });
});

describe("performance workflow credential and timing boundaries", () => {
  const workflows = [
    [".github/workflows/signed-in-readonly-performance.yml", "signed-in-readonly-performance"],
    [".github/workflows/quicklog-smoke.yml", "quicklog-smoke"],
  ] as const;
  const trusted = {
    repository: "Verdant-OS/verdant-grow-diary",
    actor: "cheekhimself",
    triggering_actor: "cheekhimself",
    ref: "refs/heads/verdant-grow-diary",
    sha: "a".repeat(40),
    run_attempt: "1",
    event_name: "workflow_dispatch",
    head_ref: "codex/chem-signedin-performance-001",
    event: { pull_request: { head: { repo: { full_name: "Verdant-OS/verdant-grow-diary" } } } },
  };
  for (const [file, key] of workflows) {
    const workflow = load(fs.readFileSync(file, "utf8")) as {
      jobs: Record<
        string,
        {
          if: string;
          env: Record<string, string>;
          steps: {
            name: string;
            env?: Record<string, string>;
            run?: string;
            with?: Record<string, string>;
          }[];
        }
      >;
    };
    const job = workflow.jobs[key];
    it.each([
      ["owner deploy dispatch", {}, true],
      ["owner deploy push", { event_name: "push" }, true],
      ["arbitrary branch", { ref: "refs/heads/unreviewed" }, false],
      [
        "named repair branch dispatch",
        { ref: "refs/heads/codex/chem-signedin-performance-001" },
        false,
      ],
      ["fork PR", { event_name: "pull_request", repository: "outsider/fork" }, false],
      ["same-repo named PR", { event_name: "pull_request", ref: "refs/pull/1793/merge" }, false],
      ["PR event forged deploy ref", { event_name: "pull_request" }, false],
      ["foreign actor", { actor: "outsider" }, false],
      ["foreign rerun actor", { triggering_actor: "outsider" }, false],
      ["second attempt", { run_attempt: "2" }, false],
      ["foreign repository", { repository: "Verdant-OS/another-repo" }, false],
      ["tag ref", { ref: "refs/tags/verdant-grow-diary" }, false],
      ["empty ref", { ref: "" }, false],
      ["workflow-run event", { event_name: "workflow_run" }, false],
    ])(`${key} gates %s before allocating credentials`, (_name, override, expected) => {
      // These job expressions use only the shared GitHub/JS equality and
      // boolean-operator subset. Evaluate the parsed YAML, not a copied rule.
      expect(
        runInNewContext(
          job.if,
          {
            github: { ...trusted, ...override },
            inputs: { run_mode: "quicklog_smoke" },
          },
          { timeout: 100 },
        ),
      ).toBe(expected);
    });
    it(`${key} pins source and confines credentials to login/proof steps`, () => {
      expect(JSON.stringify(job.env)).not.toContain("secrets.");
      const checkout = job.steps.find((step) => step.name.startsWith("Checkout"))!;
      expect(checkout.with).toMatchObject({
        ref: "${{ github.sha }}",
        "persist-credentials": false,
      });
      const credentialSteps = job.steps.filter((step) =>
        (JSON.stringify(step.env) ?? "").includes("secrets."),
      );
      expect(credentialSteps.map((step) => step.name)).toEqual(
        key === "quicklog-smoke"
          ? [
              "Verify required configuration",
              "Bootstrap disposable E2E fixture",
              "Verify disposable E2E fixture",
              "Run Quick Log Playwright smoke",
            ]
          : ["Verify production fixture configuration", "Measure three signed-in read-only routes"],
      );
      for (const step of credentialSteps) {
        expect(step.env).toEqual({
          E2E_TEST_EMAIL: "${{ secrets.E2E_TEST_EMAIL }}",
          E2E_TEST_PASSWORD: "${{ secrets.E2E_TEST_PASSWORD }}",
        });
      }
    });
  }
  it("enables zero-retry Quick Log timing with a pinned source SHA and sanitized upload", () => {
    const workflow = load(fs.readFileSync(workflows[1][0], "utf8")) as any;
    const job = workflow.jobs["quicklog-smoke"];
    expect(job.env.E2E_MEASURE_SIGNED_IN_PERFORMANCE).toBe("true");
    expect(job.env.PLAYWRIGHT_RETRIES).toBe("0");
    expect(job.concurrency).toEqual({
      group: "quicklog-production-fixture",
      "cancel-in-progress": false,
    });
    const pin = job.steps.find((step: any) => step.name === "Pin Quick Log proof SHA");
    expect(pin.run).toContain("git rev-parse HEAD");
    expect(pin.run).toContain("E2E_EXPECTED_SHA=$expected_sha");
    expect(pin.run).not.toContain("version.json");
    expect(job.steps.indexOf(pin)).toBeLessThan(
      job.steps.findIndex((step: any) => step.name === "Verify disposable E2E fixture"),
    );
    const upload = job.steps.find(
      (step: any) => step.name === "Upload sanitized Quick Log timing receipt",
    );
    expect(upload.with.path).toBe("test-results/**/*quicklog-save-confirmed-performance.json");
    const source = fs.readFileSync("e2e/quicklog-smoke.spec.ts", "utf8");
    expect(source).toContain('testInfo.outputPath("quicklog-save-confirmed-performance.json")');
    expect(source).toContain(
      "fs.writeFileSync(receiptPath, JSON.stringify(result.receipt, null, 2))",
    );
  });
  it("does not select Quick Log credentials for another dispatch mode", () => {
    const workflow = load(fs.readFileSync(workflows[1][0], "utf8")) as any;
    expect(
      runInNewContext(
        workflow.jobs["quicklog-smoke"].if,
        {
          github: trusted,
          inputs: { run_mode: "one_tent_proof" },
        },
        { timeout: 100 },
      ),
    ).toBe(false);
  });
  it("refuses a deployment mismatch and foreign fixture login before Quick Log navigation", () => {
    const source = fs.readFileSync("e2e/quicklog-smoke.spec.ts", "utf8");
    expect(source.indexOf("const identity = await readLivePerformanceIdentity(page)")).toBeLessThan(
      source.indexOf("await page.goto(PLANT_URL!)"),
    );
    expect(source).toContain("commit: expectedSha");
    expect(source).toContain("dirty: false");
    const workflow = load(fs.readFileSync(workflows[1][0], "utf8")) as any;
    const preflight = workflow.jobs["quicklog-smoke"].steps.find(
      (step: any) => step.name === "Verify required configuration",
    ).run;
    expect(preflight).toContain('"$E2E_BASE_URL" != "https://verdantgrowdiary.com"');
    expect(preflight).toContain('"$E2E_TEST_EMAIL" != "cheekhimself@gmail.com"');
  });
});

describe("read-only performance lane wiring", () => {
  const workflow = load(
    fs.readFileSync(".github/workflows/signed-in-readonly-performance.yml", "utf8"),
  ) as {
    on: Record<string, unknown>;
    permissions: Record<string, string>;
    jobs: Record<
      string,
      {
        if: string;
        env: Record<string, string>;
        steps: { name: string; run?: string; with?: Record<string, string>; uses?: string }[];
      }
    >;
  };
  const job = workflow.jobs["signed-in-readonly-performance"];
  it("keeps PR regression checks credential-free while restricting login to the deploy branch", () => {
    expect(workflow.on.pull_request).not.toHaveProperty("branches");
    expect(workflow.on).not.toHaveProperty(["pull", "request", "target"].join("_"));
    expect(job.if).toContain("github.ref == 'refs/heads/verdant-grow-diary'");
    const regression = workflow.jobs["performance-safety-regressions"];
    expect(regression).not.toHaveProperty("env");
    expect(JSON.stringify(regression)).not.toContain("secrets.");
    expect(
      regression.steps.some((step) => step.run?.includes("signed-in-readonly-proof.test.ts")),
    ).toBe(true);
    expect(workflow.permissions).toEqual({ contents: "read" });
  });
  it("requires the approved fixture email and production host without changing variables", () => {
    expect(job.env.E2E_BASE_URL).toBe("${{ vars.E2E_BASE_URL }}");
    const preflight = job.steps.find(
      (step) => step.name === "Verify production fixture configuration",
    )!.run!;
    expect(preflight).toContain('"https://verdantgrowdiary.com"');
    expect(preflight).toContain('"cheekhimself@gmail.com"');
    expect(preflight).toContain("exit 1");
  });
  it("executes only three read-only routes once with one Chromium worker", () => {
    const execution = job.steps.find(
      (step) => step.name === "Measure three signed-in read-only routes",
    )!.run!;
    expect(execution).toBe(
      "bunx playwright test e2e/signed-in-performance.spec.ts --project=chromium-authed --workers=1 --retries=0 --reporter=list",
    );
    expect(job.env.PLAYWRIGHT_RETRIES).toBe("0");
    expect(job.env.E2E_MEASURE_SIGNED_IN_PERFORMANCE).toBe("true");
    expect(execution).not.toContain("quicklog-smoke");
  });
  it("pins the real deploy branch before comparing metadata rather than substituting the live SHA", () => {
    const pin = job.steps.find((step) => step.name === "Pin current deploy SHA")!.run!;
    expect(pin).toContain("git rev-parse HEAD");
    expect(pin).toContain('[ "$expected_sha" = "$GITHUB_SHA" ]');
    expect(pin).not.toContain("version.json");
    expect(pin).toContain("E2E_EXPECTED_SHA=$expected_sha");
  });
  it("uploads sanitized timing receipts alone, with no auth-state or browser artifact directories", () => {
    const artifact = job.steps.find(
      (step) => step.name === "Upload sanitized timing receipts only",
    )!;
    expect(artifact.with!.path).toBe("test-results/**/*-performance.json");
    const source = fs.readFileSync("e2e/signed-in-performance.spec.ts", "utf8");
    expect(source).toContain('trace: "off"');
    expect(source).toContain('video: "off"');
    expect(source).toContain('screenshot: "off"');
    expect(source).toContain('serviceWorkers: "block"');
    expect(source).toContain("assertComplete: proof.waitForAccount");
    expect(source).not.toContain("validateQuickLogFixturePage");
  });
});
