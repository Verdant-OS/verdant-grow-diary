/**
 * Vitest-only react-router-compat override.
 *
 * Production `src/lib/react-router-compat.tsx` keeps thin compile shims for
 * MemoryRouter (no real provider) so the product bundle stays free of a
 * test harness. Vitest resolves `@/lib/react-router-compat` to THIS file
 * (see vitest.config.ts) so unit tests that wrap UI in <MemoryRouter>
 * get a real TanStack RouterContextProvider + history subscription.
 *
 * Do not import this module from application code.
 */
/**
 * react-router-dom compatibility layer over TanStack Router.
 *
 * The Classic build used `react-router-dom` v6 in 642 source files. Rewriting
 * every call site to idiomatic TanStack APIs is a large, behaviour-changing
 * refactor; this module keeps the react-router calling convention working
 * unchanged on top of the TanStack router so the migration is mechanical.
 *
 * Idiomatic TanStack (`validateSearch` + `useSearch({ from })`, typed `to`,
 * route-level `loader`s) is an optional follow-up, not a migration task.
 *
 * Read-only shim: no data access, no writes, no side effects beyond navigation.
 */
import {
  Children,
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type AnchorHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Link as TanStackLink,
  Outlet as TanStackOutlet,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate as useTanStackNavigate,
  useParams as useTanStackParams,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { selectCommittedLocation } from "@/lib/routerCommittedLocation";

export { TanStackOutlet as Outlet };

/**
 * TanStack stamps internal fields onto history state (`key`, `__TSR_*`,
 * `__hashScrollIntoViewOptions`, …). React Router exposes user state only
 * and uses `null` when none remains — strip internals for parity.
 */
function isTanStackInternalStateKey(key: string): boolean {
  return key === "key" || key.startsWith("__");
}

function compatLocationState(raw: unknown): unknown {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return raw;
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isTanStackInternalStateKey(k)) continue;
    rest[k] = v;
  }
  return Object.keys(rest).length === 0 ? null : rest;
}

export interface CompatLocation {
  pathname: string;
  search: string;
  hash: string;
  state: unknown;
  key: string;
}

/** react-router `useLocation()` shape, sourced from the TanStack router state. */
export function useLocation(): CompatLocation {
  return useRouterState({
    select: (state) => {
      // Mirror production: a still-mounted page keeps seeing the COMMITTED
      // location while a navigation is pending (same shared rule).
      const location = selectCommittedLocation(state);
      return {
        pathname: location.pathname,
        search: location.searchStr ?? "",
        hash: location.hash ? `#${location.hash.replace(/^#/, "")}` : "",
        state: compatLocationState(location.state),
        key: location.href,
      };
    },
  });
}

const CompatParamsContext = createContext<Record<string, string> | null>(null);

/** react-router `useParams()`. Non-strict so any route can read any param. */
export function useParams<T extends Record<string, string | undefined>>(): T {
  // Prefer params from the legacy `<Routes>` matcher (unit tests). Fall back to
  // params aggregated from TanStack matches when the real route tree is live.
  const fromCompat = useContext(CompatParamsContext);
  const fromMatches = useRouterState({
    select: (state) => {
      const params: Record<string, string> = {};
      for (const match of state.matches) {
        if (match.params && typeof match.params === "object") {
          Object.assign(params, match.params);
        }
      }
      return params;
    },
  });
  if (fromCompat) {
    return { ...fromMatches, ...fromCompat } as T;
  }
  return fromMatches as T;
}

/** True when a TanStack router instance is mounted above this call. */
export function useInRouterContext(): boolean {
  try {
    // useRouter() returns null (and warns) outside a provider — treat that as false.
    return useRouter() != null;
  } catch {
    return false;
  }
}

export interface CompatNavigateOptions {
  replace?: boolean;
  state?: unknown;
  preventScrollReset?: boolean;
}

/** react-router `To` object form: `{ pathname, search, hash }`. */
export interface CompatToObject {
  pathname?: string;
  search?: string;
  hash?: string;
}

export type CompatTo = string | CompatToObject;

export type CompatNavigateFunction = {
  (to: CompatTo, options?: CompatNavigateOptions): void;
  (delta: number): void;
};

/** Flattens react-router's `To` object into a single path string. */
function flattenTo(to: CompatTo): string {
  if (typeof to === "string") return to;
  const search = to.search ? (to.search.startsWith("?") ? to.search : `?${to.search}`) : "";
  const hash = to.hash ? (to.hash.startsWith("#") ? to.hash : `#${to.hash}`) : "";
  return `${to.pathname ?? ""}${search}${hash}`;
}

// Mirrors the product shim (see its docblock for why the query stays in
// `to`: TanStack's default stringifySearch JSON-encodes values).
/**
 * Split the FRAGMENT (only) out of a react-router-style path string.
 *
 * TanStack reads the fragment from its dedicated `hash` option and never
 * re-splits one out of `to`, so a '#' left inside `to` rides into the
 * COMMITTED pathname (`/hunts/55/workspace#notes`). Splitting it is safe:
 * hashes are forwarded verbatim.
 *
 * The QUERY is deliberately left inside `to`, even though it pollutes the
 * committed pathname the same way. TanStack's default `stringifySearch` is
 * JSON-based: passing `{ page: "2" }` through the `search` option emits
 * `?page=%222%22` (quoted so it round-trips as a string, not the number 2).
 * This app builds and reads raw string params, so routing the query through
 * `search` silently rewrites every numeric-looking URL — it broke Action
 * Queue pagination in CI (`expected '"2"' to be '2'`). Splitting the query
 * correctly requires changing the router's search (de)serializer app-wide,
 * which is its own slice with its own evidence. See PR #755 discussion.
 */
function toTanStackTarget(path: string): { to: string; hash?: string } {
  const hashIndex = path.indexOf("#");
  if (hashIndex === -1) return { to: path };
  return {
    to: hashIndex === 0 ? "." : path.slice(0, hashIndex),
    hash: path.slice(hashIndex + 1),
  };
}

/**
 * react-router `useNavigate()`. Supports `navigate("/path", { replace })`,
 * the `{ pathname, search, hash }` object form, and history-delta calls such
 * as `navigate(-1)`.
 */
export function useNavigate(): CompatNavigateFunction {
  const navigate = useTanStackNavigate();
  const router = useRouter();

  // Stable identity: a fresh function every render re-fires product effects that
  // list `navigate` in their dep arrays (e.g. GlobalSearchDialog auth gate) and
  // can cascade into max-update-depth / Vitest OOM under jsdom.
  return useCallback(
    ((to: CompatTo | number, options?: CompatNavigateOptions) => {
      if (typeof to === "number") {
        if (to === 0) return;
        // TanStack's history exposes go/back/forward; -1 is the common case.
        if (to < 0) router.history.back();
        else router.history.forward();
        return;
      }
      const target = toTanStackTarget(flattenTo(to));
      void navigate({
        to: target.to,
        ...(target.hash !== undefined ? { hash: target.hash } : {}),
        replace: options?.replace ?? false,
        ...(options?.state !== undefined ? { state: options.state as never } : {}),
        resetScroll: options?.preventScrollReset !== true,
      } as never);
    }) as CompatNavigateFunction,
    [navigate, router],
  );
}

export interface CompatLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: string;
  replace?: boolean;
  state?: unknown;
  preventScrollReset?: boolean;
  children?: ReactNode;
}

/** react-router `<Link to="/path">` over the TanStack Link. */
export const Link = forwardRef<HTMLAnchorElement, CompatLinkProps>(function Link(
  { to, replace, state, preventScrollReset, children, ...rest },
  ref,
) {
  const target = toTanStackTarget(to);
  return (
    <TanStackLink
      ref={ref}
      to={target.to as never}
      {...(target.hash !== undefined ? { hash: target.hash } : {})}
      replace={replace ?? false}
      {...(state !== undefined ? { state: state as never } : {})}
      resetScroll={preventScrollReset !== true}
      {...rest}
    >
      {children}
    </TanStackLink>
  );
});

export interface CompatNavLinkProps extends Omit<CompatLinkProps, "className" | "children"> {
  className?: string | ((props: { isActive: boolean; isPending: boolean }) => string);
  children?: ReactNode | ((props: { isActive: boolean; isPending: boolean }) => ReactNode);
  end?: boolean;
}

/** react-router `<NavLink>` including the function-valued className/children. */
export const NavLink = forwardRef<HTMLAnchorElement, CompatNavLinkProps>(function NavLink(
  { to, className, children, end, ...rest },
  ref,
) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isActive =
    end === true ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
  const renderProps = { isActive, isPending: false };
  const resolvedClassName = typeof className === "function" ? className(renderProps) : className;
  const resolvedChildren = typeof children === "function" ? children(renderProps) : children;

  return (
    <Link
      ref={ref}
      to={to}
      {...(resolvedClassName !== undefined ? { className: resolvedClassName } : {})}
      {...(isActive ? { "aria-current": "page" as const } : {})}
      {...rest}
    >
      {resolvedChildren}
    </Link>
  );
});

export interface CompatNavigateProps {
  to: string;
  replace?: boolean;
  state?: unknown;
}

/** react-router `<Navigate to="/path" replace />`. */
// Mirrors the product shim: an input-keyed effect, NOT TanStack's <Navigate>
// (which re-issues per router-state re-render and loops mid-transition — see
// src/lib/react-router-compat.tsx Navigate docblock). Keeping the vitest
// double behaviorally aligned means unit tests exercise the same navigation
// semantics the product ships.
export function Navigate({ to, replace, state }: CompatNavigateProps) {
  const nav = useNavigate();
  useEffect(() => {
    nav(to, {
      replace: replace ?? false,
      ...(state !== undefined ? { state } : {}),
    });
  }, [nav, to, replace, state]);
  return null;
}

export type CompatSetSearchParams = (
  next:
    | URLSearchParams
    | Record<string, string>
    | string
    | ((current: URLSearchParams) => URLSearchParams | Record<string, string> | string),
  options?: { replace?: boolean; preventScrollReset?: boolean },
) => void;

/**
 * react-router `useSearchParams()` over the TanStack router.
 *
 * Returns the live `URLSearchParams` plus a setter accepting the same shapes
 * react-router accepted (object, string, URLSearchParams, or updater fn).
 */
export function useSearchParams(): [URLSearchParams, CompatSetSearchParams] {
  const searchStr = useRouterState({
    select: (state) => selectCommittedLocation(state).searchStr ?? "",
  });
  const router = useRouter();
  const searchKey = searchStr.startsWith("?") ? searchStr.slice(1) : searchStr;
  const params = useMemo(() => new URLSearchParams(searchKey), [searchKey]);

  const setSearchParams: CompatSetSearchParams = (next, options) => {
    const resolved = typeof next === "function" ? next(new URLSearchParams(searchKey)) : next;
    const serialized =
      resolved instanceof URLSearchParams
        ? resolved.toString()
        : typeof resolved === "string"
          ? resolved.replace(/^\?/, "")
          : new URLSearchParams(resolved).toString();
    // Setter operates from the COMMITTED page location (mirrors production).
    const { pathname, hash } = selectCommittedLocation(router.state);
    const normalizedHash = hash ? hash.replace(/^#/, "") : undefined;
    void router.navigate({
      // Query stays string-serialized in `to` — TanStack's default
      // stringifySearch is JSON-based and would emit ?page=%222%22.
      to: `${pathname}${serialized ? `?${serialized}` : ""}` as never,
      ...(normalizedHash ? { hash: normalizedHash } : {}),
      replace: options?.replace ?? false,
      resetScroll: options?.preventScrollReset !== true,
    } as never);
  };

  return [params, setSearchParams];
}

/**
 * Test / legacy shell: provide a real TanStack router so compat Link /
 * useNavigate / useSearchParams work under Vitest.
 *
 * Uses `RouterContextProvider` (not `RouterProvider`):
 * - Context injects the router instance so `useRouter()` / Link are non-null
 *   (fixes `reading 'isServer'` when context is missing).
 * - `RouterProvider` hardcodes children to `<Matches />` and never renders
 *   arbitrary test UI. Even after `router.load()`, Matches would only mount
 *   our null stub route components — not the caller's tree.
 * - Matching/loading algorithms live in router-core (`router.load`).
 *   `Matches`/`Transitioner` are the React wiring that subscribe to history
 *   and render the match tree; we skip them and reimplement only the
 *   history → `load` subscription so location/nav stay live.
 *
 * Application code should not use these — the Start route tree owns the
 * production provider. Hundreds of unit tests still wrap UI in
 * `<MemoryRouter>` / `<BrowserRouter>` from the react-router era.
 */
interface LegacyRouterShellProps {
  children?: ReactNode;
  /** react-router memory history entries (`string` or location-like object). */
  initialEntries?: unknown;
  /** Index into `initialEntries` (default: last entry, matching react-router). */
  initialIndex?: number;
  /** Accepted for compile compatibility; ignored (no basename support). */
  basename?: string;
  /** Accepted for compile compatibility with react-router v6 future flags; ignored. */
  future?: Record<string, boolean>;
}

interface NormalizedMemoryEntry {
  href: string;
  /** react-router location.state for this entry (may be undefined). */
  state: unknown;
}

function normalizeInitialEntries(initialEntries: unknown): NormalizedMemoryEntry[] {
  if (!Array.isArray(initialEntries) || initialEntries.length === 0) {
    return [{ href: "/", state: undefined }];
  }
  return initialEntries.map((entry) => {
    if (typeof entry === "string") {
      return { href: entry.length > 0 ? entry : "/", state: undefined };
    }
    if (entry && typeof entry === "object") {
      const loc = entry as {
        pathname?: unknown;
        search?: unknown;
        hash?: unknown;
        state?: unknown;
      };
      const pathname =
        typeof loc.pathname === "string" && loc.pathname.length > 0 ? loc.pathname : "/";
      const rawSearch = typeof loc.search === "string" ? loc.search : "";
      const search = rawSearch ? (rawSearch.startsWith("?") ? rawSearch : `?${rawSearch}`) : "";
      const rawHash = typeof loc.hash === "string" ? loc.hash : "";
      const hash = rawHash ? (rawHash.startsWith("#") ? rawHash : `#${rawHash}`) : "";
      return {
        href: `${pathname}${search}${hash}`,
        state: "state" in loc ? loc.state : undefined,
      };
    }
    return { href: "/", state: undefined };
  });
}

function createTestMemoryRouter(entries: NormalizedMemoryEntry[], initialIndex?: number) {
  // Root + index + splat so buildLocation/matchRoute can resolve any path.
  // Route `component`s are unused under RouterContextProvider (we render test
  // children ourselves); they exist only so the route tree is valid for load().
  const rootRoute = createRootRoute({
    component: () => null,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  });
  const splatRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "$",
    component: () => null,
  });
  const hrefs = entries.map((e) => e.href);
  const index = initialIndex ?? hrefs.length - 1;
  const history = createMemoryHistory({
    initialEntries: hrefs,
    initialIndex: index,
  });

  // createMemoryHistory only accepts string hrefs. Stamp react-router
  // location.state onto the active entry so hooks that read location.state
  // (checkout return markers, etc.) see the same payload RR would provide.
  const active = entries[index];
  if (active && active.state !== undefined) {
    history.replace(active.href, active.state);
  }

  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute, splatRoute]),
    history,
    // Vitest/jsdom has `document`, but be explicit so Link does not take the
    // SSR branch when tools evaluate outside a browser-like global.
    isServer: false,
    defaultPendingMinMs: 0,
    defaultPendingMs: 0,
  });
}

function MemoryRouterProvider({ children, initialEntries, initialIndex }: LegacyRouterShellProps) {
  // Serialize so inline `initialEntries={[...]}` arrays don't rebuild the router
  // on every parent render (would remount the whole tree mid-test).
  const entriesKey = useMemo(
    () => JSON.stringify(normalizeInitialEntries(initialEntries)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by serialized entries
    [JSON.stringify(initialEntries ?? null)],
  );
  const index = typeof initialIndex === "number" ? initialIndex : undefined;

  const router = useMemo(() => {
    const entries = JSON.parse(entriesKey) as NormalizedMemoryEntry[];
    return createTestMemoryRouter(
      entries.length > 0 ? entries : [{ href: "/", state: undefined }],
      index,
    );
  }, [entriesKey, index]);

  // Mirror Transitioner's history wiring (see @tanstack/react-router Transitioner):
  //   history.subscribe(router.load) + initial load on mount.
  // Without this, commitLocation sees zero history subscribers and may load
  // once, but back/forward and some navigations won't refresh useRouterState.
  useEffect(() => {
    const unsub = router.history.subscribe(router.load);
    void router.load();
    return unsub;
  }, [router]);

  return <RouterContextProvider router={router}>{children}</RouterContextProvider>;
}

/** @deprecated App shell uses TanStack Start. Prefer real routes in product code. */
export function BrowserRouter(props: LegacyRouterShellProps) {
  return <MemoryRouterProvider {...props} />;
}

/** @deprecated App shell uses TanStack Start. Prefer real routes in product code. */
export function MemoryRouter(props: LegacyRouterShellProps) {
  return <MemoryRouterProvider {...props} />;
}

export interface CompatRouteProps {
  path?: string;
  element?: ReactNode;
  children?: ReactNode;
  index?: boolean;
}

/**
 * Declarative route leaf for the legacy `<Routes>` matcher. Renders nothing on
 * its own — `<Routes>` inspects props and mounts `element` when the path matches.
 */
export function Route(_props: CompatRouteProps) {
  return null;
}

function isRouteElement(node: ReactNode): node is ReactElement<CompatRouteProps> {
  return isValidElement(node) && node.type === Route;
}

function routePattern(props: CompatRouteProps): string {
  if (props.index) return "/";
  if (typeof props.path === "string" && props.path.length > 0) return props.path;
  return "/";
}

function routeMatchScore(pattern: string): number {
  if (pattern === "*") return 0;
  if (pattern.includes(":") || pattern.includes("*")) return 1;
  return 2;
}

/**
 * Minimal react-router `<Routes>` matcher for unit tests. Picks the best flat
 * `<Route path element>` child against the current memory-history pathname.
 * Nested route trees and relative paths are not supported.
 */
export function Routes({ children }: { children?: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const routes = Children.toArray(children).filter(isRouteElement);

  let best: ReactElement<CompatRouteProps> | null = null;
  let bestParams: Record<string, string> = {};
  let bestScore = -1;
  for (const route of routes) {
    const pattern = routePattern(route.props);
    const params = matchOne(pattern, pathname);
    if (params == null) continue;
    const score = routeMatchScore(pattern);
    if (score > bestScore) {
      best = route;
      bestParams = params;
      bestScore = score;
    }
  }
  if (!best?.props.element) return null;
  return (
    <CompatParamsContext.Provider value={bestParams}>
      {best.props.element}
    </CompatParamsContext.Provider>
  );
}

export interface CompatRouteObject {
  path: string;
  id?: string;
}

export interface CompatRouteMatch<T extends CompatRouteObject = CompatRouteObject> {
  route: T;
  params: Record<string, string>;
  pathname: string;
}

function matchOne(pattern: string, pathname: string): Record<string, string> | null {
  if (pattern === "*") return {};
  const pSegs = pattern.replace(/^\//, "").split("/").filter(Boolean);
  const uSegs = pathname.replace(/^\//, "").split("/").filter(Boolean);
  const params: Record<string, string> = {};
  const splatAt = pSegs.indexOf("*");
  if (splatAt === -1 && pSegs.length !== uSegs.length) return null;
  for (let i = 0; i < pSegs.length; i += 1) {
    const p = pSegs[i];
    if (p === "*") return params;
    const u = uSegs[i];
    if (u === undefined) return null;
    if (p !== undefined && p.startsWith(":")) params[p.slice(1)] = u;
    else if (p !== u) return null;
  }
  return params;
}

/**
 * Minimal react-router `matchRoutes` stand-in for flat route manifests.
 * Static segments beat params, and `*` is always the last resort.
 */
export function matchRoutes<T extends CompatRouteObject>(
  routes: readonly T[],
  location: string | { pathname?: string },
): CompatRouteMatch<T>[] | null {
  const pathname = typeof location === "string" ? location : (location.pathname ?? "/");
  const ranked = [...routes]
    .map((route, index) => ({ route, index }))
    .sort((a, b) => {
      const score = (path: string) =>
        path === "*" ? 2 : path.includes(":") || path.includes("*") ? 1 : 0;
      const diff = score(a.route.path) - score(b.route.path);
      return diff !== 0 ? diff : a.index - b.index;
    });
  for (const { route } of ranked) {
    const params = matchOne(route.path, pathname);
    if (params) return [{ route, params, pathname }];
  }
  return null;
}
