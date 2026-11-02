/**
 * Consent-gated PostHog browser client.
 *
 * posthog-js is imported only after `decidePostHogStartup` says collection
 * is enabled. The Supabase auth client is imported only after that same
 * init, and only when the caller did not inject an identity source. Neither
 * import runs for a missing key, a non-production host, a denied decision,
 * or the grow-help toolkit route.
 *
 * Withdrawal stops replay, resets the device id, opts out, then deletes
 * `ph_<token>_` web storage and cookies. On a production host the cookie
 * expiry also sets `Domain=.verdantgrowdiary.com`, because posthog-js
 * defaults to a cross-subdomain cookie. The `__ph_opt_in_out_<token>` flag
 * stays, so a reload remains opted out. `reset()` returns the SDK to its
 * default opted-in state, so opt-out has to follow it. A granted init calls
 * `opt_in_capturing` with no `$opt_in` event, including after a new session
 * where the SDK reloaded a persisted opt-out. Sign-out resets the distinct
 * id without clearing the device id and leaves capture on while consent remains.
 */

import type { PostHogConfig } from "posthog-js";

import type { AnalyticsConsentDecision } from "@/lib/analyticsConsent";
import { PRICING_ANALYTICS_EVENT } from "@/lib/pricingAnalytics";
import {
  buildPostHogInitOptions,
  decidePostHogStartup,
  mapFunnelEventToPostHog,
  planPostHogPersistenceRemoval,
  posthogCookieExpiryAssignments,
  posthogDistinctId,
  posthogPageviewProperties,
  posthogPersonProperties,
} from "@/lib/posthogAnalyticsRules";

export type PostHogIdentity = {
  id?: string | null;
  email?: string | null;
  created_at?: string | null;
};

type PostHogSdk = {
  init: (token: string, config?: Partial<PostHogConfig>) => unknown;
  capture: (event: string, properties?: Record<string, unknown>) => unknown;
  identify: (distinctId: string, properties?: Record<string, unknown>) => unknown;
  opt_in_capturing: (options?: { captureEventName?: false | null | string }) => void;
  opt_out_capturing: () => void;
  stopSessionRecording: () => void;
  reset: (resetDeviceId?: boolean) => void;
};

const OPT_IN_WITHOUT_EVENT = { captureEventName: false } as const;

export type PostHogClientDeps = {
  loadSdk?: () => Promise<PostHogSdk>;
  readEnv?: () => { key?: string | null; host?: string | null };
  subscribeIdentity?: (
    onChange: (event: string, identity: PostHogIdentity | null) => void,
  ) => () => void;
};

type Status = "idle" | "loading" | "ready" | "stopped" | "failed";

let status: Status = "idle";
let generation = 0;
let sdk: PostHogSdk | null = null;
let projectKey: string | null = null;
let capturing = false;
let identifiedId: string | null = null;
let lastPagePath: string | null = null;
let latestLocation: Pick<Location, "pathname" | "search" | "hash"> = {
  pathname: "/",
  search: "",
  hash: "",
};
let funnelUnsub: (() => void) | null = null;
let identityUnsub: (() => void) | null = null;
let clientDeps: PostHogClientDeps = {};

/** Test seam. Does not call the SDK. */
export function __resetPostHogClientForTests(): void {
  detachSideEffects();
  status = "idle";
  generation = 0;
  sdk = null;
  projectKey = null;
  capturing = false;
  identifiedId = null;
  lastPagePath = null;
  latestLocation = { pathname: "/", search: "", hash: "" };
  clientDeps = {};
}

export function syncPostHogWithConsent(
  decision: AnalyticsConsentDecision,
  location: Pick<Location, "pathname" | "search" | "hash">,
  deps: PostHogClientDeps = {},
): void {
  try {
    latestLocation = location;
    clientDeps = deps;
    const env = (deps.readEnv ?? defaultReadEnv)();
    const startup = decidePostHogStartup({
      decision,
      pathname: location.pathname,
      key: env.key,
      host: env.host,
      hostname: typeof window === "undefined" ? undefined : window.location.hostname,
    });
    if (!startup.enabled) {
      stopCollection();
      return;
    }
    if (sdk && (status === "ready" || status === "stopped")) {
      resume(sdk);
      return;
    }
    if (status === "loading") return;
    beginLoad(startup.key, startup.apiHost, deps);
  } catch {
    // Product measurement must not break the diary.
  }
}

function defaultReadEnv(): { key?: string; host?: string } {
  const env = import.meta.env as { VITE_POSTHOG_KEY?: string; VITE_POSTHOG_HOST?: string };
  return { key: env.VITE_POSTHOG_KEY, host: env.VITE_POSTHOG_HOST };
}

function beginLoad(key: string, apiHost: string, deps: PostHogClientDeps): void {
  const gen = ++generation;
  status = "loading";
  projectKey = key;
  const load = deps.loadSdk ?? defaultLoadSdk;
  void load()
    .then((loaded) => {
      if (gen !== generation) return;
      safe(() => loaded.init(key, buildPostHogInitOptions(apiHost)));
      if (gen !== generation) {
        withdraw(loaded, key);
        return;
      }
      safe(() => loaded.opt_in_capturing(OPT_IN_WITHOUT_EVENT));
      if (gen !== generation) {
        withdraw(loaded, key);
        return;
      }
      sdk = loaded;
      status = "ready";
      capturing = true;
      attachSideEffects(loaded, gen, deps);
      emitPageview(loaded);
    })
    .catch(() => {
      if (gen === generation) status = "failed";
    });
}

async function defaultLoadSdk(): Promise<PostHogSdk> {
  const module = await import("posthog-js");
  return module.default as PostHogSdk;
}

function resume(loaded: PostHogSdk): void {
  if (!capturing) {
    safe(() => loaded.opt_in_capturing(OPT_IN_WITHOUT_EVENT));
    capturing = true;
    status = "ready";
    attachSideEffects(loaded, generation, clientDeps);
  }
  emitPageview(loaded);
}

function stopCollection(): void {
  generation += 1;
  detachSideEffects();
  lastPagePath = null;
  identifiedId = null;
  const loaded = sdk;
  const key = projectKey;
  if (loaded && capturing) withdraw(loaded, key);
  capturing = false;
  status = sdk ? "stopped" : "idle";
}

function withdraw(loaded: PostHogSdk, key: string | null): void {
  safe(() => loaded.stopSessionRecording());
  safe(() => loaded.reset(true));
  safe(() => loaded.opt_out_capturing());
  clearPersistedPostHogState(key);
}

function clearPersistedPostHogState(key: string | null): void {
  if (!key || typeof window === "undefined") return;
  const plan = planPostHogPersistenceRemoval({
    token: key,
    localKeys: storageKeys(window.localStorage),
    sessionKeys: storageKeys(window.sessionStorage),
    cookie: document.cookie,
  });
  if (!plan) return;
  for (const name of plan.localKeys) window.localStorage.removeItem(name);
  for (const name of plan.sessionKeys) window.sessionStorage.removeItem(name);
  for (const assignment of posthogCookieExpiryAssignments({
    cookieNames: plan.cookieNames,
    hostname: window.location.hostname,
  })) {
    document.cookie = assignment;
  }
}

function storageKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) keys.push(key);
  }
  return keys;
}

function emitPageview(loaded: PostHogSdk): void {
  if (!capturing) return;
  const input = `${latestLocation.pathname}${latestLocation.search}${latestLocation.hash}`;
  const origin =
    typeof window === "undefined" ? "https://verdantgrowdiary.com" : window.location.origin;
  const properties = posthogPageviewProperties(origin || "https://verdantgrowdiary.com", input);
  if (properties.$pathname === lastPagePath) return;
  lastPagePath = properties.$pathname;
  safe(() => loaded.capture("$pageview", properties));
}

function attachSideEffects(loaded: PostHogSdk, gen: number, deps: PostHogClientDeps): void {
  detachSideEffects();
  if (typeof window !== "undefined") {
    const onFunnel = (event: Event) => {
      if (gen !== generation || !capturing) return;
      const detail = (event as CustomEvent<{ name?: string; props?: Record<string, unknown> }>)
        .detail;
      if (!detail?.name) return;
      for (const mapped of mapFunnelEventToPostHog(detail.name, detail.props)) {
        safe(() => loaded.capture(mapped.name, mapped.properties));
      }
    };
    window.addEventListener(PRICING_ANALYTICS_EVENT, onFunnel);
    funnelUnsub = () => window.removeEventListener(PRICING_ANALYTICS_EVENT, onFunnel);
  }
  if (deps.subscribeIdentity) {
    identityUnsub = deps.subscribeIdentity((event, identity) => {
      if (gen !== generation || !capturing) return;
      if (event === "SIGNED_OUT") {
        identifiedId = null;
        safe(() => loaded.reset());
        return;
      }
      applyIdentity(loaded, identity);
    });
    return;
  }
  void attachSupabaseIdentity(loaded, gen);
}

async function attachSupabaseIdentity(loaded: PostHogSdk, gen: number): Promise<void> {
  try {
    const { supabase } = (await import("@/integrations/supabase/client")) as {
      supabase: {
        auth: {
          getSession: () => Promise<{ data: { session: { user: PostHogIdentity } | null } }>;
          onAuthStateChange: (
            callback: (event: string, session: { user: PostHogIdentity } | null) => void,
          ) => { data: { subscription: { unsubscribe: () => void } } };
        };
      };
    };
    if (gen !== generation || !capturing) return;
    const { data } = await supabase.auth.getSession();
    if (gen !== generation || !capturing) return;
    applyIdentity(loaded, data.session?.user ?? null);
    const { data: auth } = supabase.auth.onAuthStateChange((event, session) => {
      if (gen !== generation || !capturing) return;
      if (event === "SIGNED_OUT") {
        identifiedId = null;
        safe(() => loaded.reset());
        return;
      }
      applyIdentity(loaded, session?.user ?? null);
    });
    if (gen !== generation) {
      auth.subscription.unsubscribe();
      return;
    }
    identityUnsub = () => auth.subscription.unsubscribe();
  } catch {
    // Identity is optional. Events can still be anonymous.
  }
}

function applyIdentity(loaded: PostHogSdk, identity: PostHogIdentity | null): void {
  const id = posthogDistinctId(identity?.id);
  if (!id || id === identifiedId) return;
  identifiedId = id;
  const properties = posthogPersonProperties({
    createdAt: identity?.created_at,
    email: identity?.email,
  });
  safe(() => loaded.identify(id, properties));
}

function detachSideEffects(): void {
  funnelUnsub?.();
  funnelUnsub = null;
  identityUnsub?.();
  identityUnsub = null;
}

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    // Analytics must never break the product.
  }
}
