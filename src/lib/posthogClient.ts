/**
 * Consent-gated PostHog browser client.
 *
 * posthog-js is imported only after `decidePostHogStartup` says collection
 * is enabled. The Supabase auth client is imported only after that same
 * init, and only when the caller did not inject an identity source. Neither
 * import runs for a missing key, a non-production host, a denied decision,
 * or the grow-help toolkit route.
 *
 * Withdrawal stops replay, resets the SDK, then opts out. `reset()` returns
 * the SDK to its default opted-in state, so opt-out has to follow it.
 * Sign-out resets the distinct id and leaves capture on while consent remains.
 */

import type { PostHogConfig } from "posthog-js";

import type { AnalyticsConsentDecision } from "@/lib/analyticsConsent";
import { PRICING_ANALYTICS_EVENT } from "@/lib/pricingAnalytics";
import {
  buildPostHogInitOptions,
  decidePostHogStartup,
  mapFunnelEventToPostHog,
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
  opt_in_capturing: () => void;
  opt_out_capturing: () => void;
  stopSessionRecording: () => void;
  reset: () => void;
};

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
  const load = deps.loadSdk ?? defaultLoadSdk;
  void load()
    .then((loaded) => {
      if (gen !== generation) return;
      safe(() => loaded.init(key, buildPostHogInitOptions(apiHost)));
      if (gen !== generation) {
        withdraw(loaded);
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
    safe(() => loaded.opt_in_capturing());
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
  if (sdk && capturing) withdraw(sdk);
  capturing = false;
  status = sdk ? "stopped" : "idle";
}

function withdraw(loaded: PostHogSdk): void {
  safe(() => loaded.stopSessionRecording());
  safe(() => loaded.reset());
  safe(() => loaded.opt_out_capturing());
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
