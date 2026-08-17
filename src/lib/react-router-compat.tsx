/* eslint-disable react-hooks/rules-of-hooks -- dual LegacyRouterContext / TanStack path: hooks after legacy early-return is intentional for the vitest MemoryRouter shim */
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
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";
import {
  Outlet as TanStackOutlet,
  createLink,
  useNavigate as useTanStackNavigate,
  useParams as useTanStackParams,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { selectCommittedLocation } from "@/lib/routerCommittedLocation";

export { TanStackOutlet as Outlet };

export interface CompatLocation {
  pathname: string;
  search: string;
  hash: string;
  state: unknown;
  key: string;
}

interface LegacyRouterContextValue {
  location: CompatLocation;
  params: Record<string, string>;
  navigate: (to: CompatTo | number, options?: CompatNavigateOptions) => void;
}

const LegacyRouterContext = createContext<LegacyRouterContextValue | null>(null);

function parseLegacyLocation(entry: string): CompatLocation {
  const url = new URL(entry, "https://verdant.test");
  return {
    pathname: url.pathname || "/",
    search: url.search,
    hash: url.hash,
    state: null,
    key: `${url.pathname}${url.search}${url.hash}`,
  };
}

/** react-router `useLocation()` shape, sourced from the TanStack router state. */
export function useLocation(): CompatLocation {
  const legacy = useContext(LegacyRouterContext);
  if (legacy) return legacy.location;
  return useRouterState({
    select: (state) => {
      // Same pending-navigation rule as useSearchParams below: while a
      // navigation is in flight, `state.location` is the TARGET; the pages
      // still on screen must keep seeing the committed (resolved) location.
      const location = selectCommittedLocation(state);
      return {
        pathname: location.pathname,
        search: location.searchStr ?? "",
        hash: location.hash ? `#${location.hash.replace(/^#/, "")}` : "",
        state: location.state,
        key: location.href,
      };
    },
  });
}

/** react-router `useParams()`. Non-strict so any route can read any param. */
export function useParams<T extends Record<string, string | undefined>>(): T {
  const legacy = useContext(LegacyRouterContext);
  if (legacy) return legacy.params as T;
  // TanStack's non-strict overload is not expressible against the generated
  // route register without naming a `from`; the shim is intentionally
  // route-agnostic, so the options object is passed through untyped.
  return (useTanStackParams as unknown as (options: { strict: false }) => T)({
    strict: false,
  });
}

/** Always true — the app is always inside the TanStack router. */
export function useInRouterContext(): boolean {
  return true;
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
  const legacy = useContext(LegacyRouterContext);
  if (legacy) return legacy.navigate;
  const navigate = useTanStackNavigate();
  const router = useRouter();

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

interface CompatTanStackAnchorProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  compatAriaCurrent?: AnchorHTMLAttributes<HTMLAnchorElement>["aria-current"];
  disabled?: boolean;
  "data-status"?: string;
}

/**
 * TanStack Link always appends its own active aria-current after activeProps.
 * A react-router plain Link has no active-state semantics, while NavLink below
 * supplies aria-current explicitly. The supported custom-link host lets us
 * discard TanStack's automatic marker and restore only the caller's value.
 */
const CompatTanStackAnchor = forwardRef<HTMLAnchorElement, CompatTanStackAnchorProps>(
  function CompatTanStackAnchor(
    {
      compatAriaCurrent,
      "aria-current": _tanStackAriaCurrent,
      "data-status": _tanStackDataStatus,
      disabled: _tanStackDisabled,
      ...anchorProps
    },
    ref,
  ) {
    return (
      <a
        ref={ref}
        {...anchorProps}
        {...(compatAriaCurrent !== undefined ? { "aria-current": compatAriaCurrent } : {})}
      />
    );
  },
);
const TanStackCompatLink = createLink(CompatTanStackAnchor);

/** react-router `<Link to="/path">` over the TanStack Link. */
export const Link = forwardRef<HTMLAnchorElement, CompatLinkProps>(function Link(
  { to, replace, state, preventScrollReset, children, onClick, ...rest },
  ref,
) {
  const legacy = useContext(LegacyRouterContext);
  if (legacy) {
    return (
      <a
        ref={ref}
        href={flattenTo(to)}
        {...rest}
        onClick={(event) => {
          onClick?.(event);
          if (
            !event.defaultPrevented &&
            event.button === 0 &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.shiftKey
          ) {
            event.preventDefault();
            legacy.navigate(to, { replace, state, preventScrollReset });
          }
        }}
      >
        {children}
      </a>
    );
  }
  const target = toTanStackTarget(to);
  const explicitAriaCurrent = rest["aria-current"];
  return (
    <TanStackCompatLink
      ref={ref}
      to={target.to as never}
      {...(target.hash !== undefined ? { hash: target.hash } : {})}
      replace={replace ?? false}
      {...(state !== undefined ? { state: state as never } : {})}
      resetScroll={preventScrollReset !== true}
      {...rest}
      activeProps={{}}
      compatAriaCurrent={explicitAriaCurrent}
    >
      {children}
    </TanStackCompatLink>
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
  const pathname = useLocation().pathname;
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

/**
 * react-router `<Navigate to="/path" replace />`.
 *
 * Implemented as an input-keyed effect rather than TanStack's `<Navigate>`:
 * that component re-navigates whenever its props OBJECT identity changes, and
 * a wrapper necessarily builds fresh props every render. While the issued
 * navigation is pending, the still-mounted source route re-renders per
 * router-state change (e.g. RouteAliasRedirect subscribes via useLocation),
 * so each re-render re-issued the navigation and restarted the transition —
 * looping until React threw "Maximum update depth exceeded" (observed on the
 * /features → /welcome alias; regression-tested in
 * src/test/react-router-compat-navigate-real.test.tsx). react-router
 * semantics: navigate on mount, and again only when a navigation input
 * (`to`/`replace`/`state`) changes — router-state re-renders change none.
 *
 * Uses this module's own `useNavigate()` so the legacy
 * MemoryRouter/BrowserRouter context keeps working without a TanStack
 * provider (the compat hook early-returns `legacy.navigate` there).
 */
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
  const legacy = useContext(LegacyRouterContext);
  // Always subscribe so hooks order is stable; prefer legacy MemoryRouter search when present.
  // During a pending navigation, TanStack's `state.location` is already the
  // in-flight TARGET location while the previous page is still mounted. A
  // still-rendered page reading the target's search here would see its own
  // params vanish mid-transition (react-router semantics: a rendered page
  // sees the location it was rendered for). Prefer `resolvedLocation` (the
  // committed location) while a navigation is pending.
  const tanstackSearch = useRouterState({
    select: (state) => selectCommittedLocation(state).searchStr ?? "",
  });
  const router = useRouter();
  const searchRaw = legacy ? (legacy.location.search ?? "") : tanstackSearch;
  const searchKey = searchRaw.startsWith("?") ? searchRaw.slice(1) : searchRaw;
  // Stabilize identity: a fresh URLSearchParams every render breaks effects that
  // depend on [searchParams] (infinite setState loops under MemoryRouter/TanStack).
  const params = useMemo(() => new URLSearchParams(searchKey), [searchKey]);

  const setSearchParams: CompatSetSearchParams = (next, options) => {
    const resolved = typeof next === "function" ? next(new URLSearchParams(searchKey)) : next;
    const serialized =
      resolved instanceof URLSearchParams
        ? resolved.toString()
        : typeof resolved === "string"
          ? resolved.replace(/^\?/, "")
          : new URLSearchParams(resolved).toString();
    if (legacy) {
      legacy.navigate(
        `${legacy.location.pathname}${serialized ? `?${serialized}` : ""}${legacy.location.hash}`,
        options,
      );
      return;
    }
    // Setter operates from the COMMITTED page location too: while a
    // navigation is pending, building the next URL from the in-flight
    // target would move the wrong page's search params.
    const { pathname, hash } = selectCommittedLocation(router.state);
    const normalizedHash = hash ? hash.replace(/^#/, "") : undefined;
    // Query stays string-serialized in `to` so TanStack's JSON search
    // serializer cannot quote numeric-looking string values. The fragment is
    // still carried separately so changing a filter does not silently drop
    // the grower's current anchor.
    void router.navigate({
      to: `${pathname}${serialized ? `?${serialized}` : ""}` as never,
      ...(normalizedHash ? { hash: normalizedHash } : {}),
      replace: options?.replace ?? false,
      resetScroll: options?.preventScrollReset !== true,
    } as never);
  };

  return [params, setSearchParams];
}

/**
 * Legacy router-primitive compile shims.
 *
 * A number of existing unit tests wrap components in `<MemoryRouter>` /
 * `<BrowserRouter>`. Under TanStack Start the real router is provided by the
 * route tree, so these render their children unchanged. They exist so legacy
 * test files keep compiling — they do NOT provide routing, and tests that
 * assert on navigation through them need rewriting against the TanStack
 * router. Do not use them in application code.
 */
interface LegacyRouterShellProps {
  children?: ReactNode;
  /** Accepted for compile compatibility with react-router; ignored. */
  initialEntries?: unknown;
  /** Accepted for compile compatibility with react-router; ignored. */
  initialIndex?: number;
  /** Accepted for compile compatibility with react-router; ignored. */
  basename?: string;
  /** Accepted for compile compatibility with react-router v6 future flags; ignored. */
  future?: Record<string, boolean>;
}

export function BrowserRouter({ children }: LegacyRouterShellProps) {
  const entry =
    typeof window === "undefined"
      ? "/"
      : `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return <LegacyRouter initialEntry={entry}>{children}</LegacyRouter>;
}
export function MemoryRouter({ children, initialEntries }: LegacyRouterShellProps) {
  const entries = Array.isArray(initialEntries)
    ? initialEntries.filter((entry): entry is string => typeof entry === "string")
    : [];
  return <LegacyRouter initialEntry={entries.at(-1) ?? "/"}>{children}</LegacyRouter>;
}

function LegacyRouter({ children, initialEntry }: { children?: ReactNode; initialEntry: string }) {
  const [location, setLocation] = useState(() => parseLegacyLocation(initialEntry));
  const navigate = useCallback<LegacyRouterContextValue["navigate"]>((to) => {
    if (typeof to === "number") return;
    setLocation(parseLegacyLocation(flattenTo(to)));
  }, []);
  const value = useMemo<LegacyRouterContextValue>(
    () => ({ location, params: {}, navigate }),
    [location, navigate],
  );
  return <LegacyRouterContext.Provider value={value}>{children}</LegacyRouterContext.Provider>;
}
export function Routes({ children }: { children?: ReactNode }) {
  const legacy = useContext(LegacyRouterContext);
  if (!legacy) return <>{children}</>;
  for (const child of Children.toArray(children)) {
    if (!isValidElement<{ path?: string; element?: ReactNode; children?: ReactNode }>(child))
      continue;
    const params = child.props.path ? matchOne(child.props.path, legacy.location.pathname) : {};
    if (params === null) continue;
    return (
      <LegacyRouterContext.Provider value={{ ...legacy, params }}>
        {child.props.element ?? child.props.children}
      </LegacyRouterContext.Provider>
    );
  }
  return null;
}
export function Route(_props: { path?: string; element?: ReactNode; children?: ReactNode }) {
  return null;
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
