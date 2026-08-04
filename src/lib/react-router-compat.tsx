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
  Link as TanStackLink,
  Navigate as TanStackNavigate,
  Outlet as TanStackOutlet,
  useNavigate as useTanStackNavigate,
  useParams as useTanStackParams,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";

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
      const location = state.location;
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
 * react-router `useNavigate()`. Supports `navigate("/path", { replace })`,
 * the `{ pathname, search, hash }` object form, and history-delta calls such
 * as `navigate(-1)`.
 */
export function useNavigate(): CompatNavigateFunction {
  const legacy = useContext(LegacyRouterContext);
  if (legacy) return legacy.navigate;
  const navigate = useTanStackNavigate();
  const router = useRouter();

  return ((to: CompatTo | number, options?: CompatNavigateOptions) => {
    if (typeof to === "number") {
      if (to === 0) return;
      // TanStack's history exposes go/back/forward; -1 is the common case.
      if (to < 0) router.history.back();
      else router.history.forward();
      return;
    }
    void navigate({
      to: flattenTo(to),
      replace: options?.replace ?? false,
      ...(options?.state !== undefined ? { state: options.state as never } : {}),
      resetScroll: options?.preventScrollReset !== true,
    } as never);
  }) as CompatNavigateFunction;
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
  return (
    <TanStackLink
      ref={ref}
      to={to as never}
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

/** react-router `<Navigate to="/path" replace />`. */
export function Navigate({ to, replace, state }: CompatNavigateProps) {
  const legacy = useContext(LegacyRouterContext);
  useEffect(() => {
    if (legacy) legacy.navigate(to, { replace, state });
  }, [legacy, replace, state, to]);
  if (legacy) return null;
  return (
    <TanStackNavigate
      to={to as never}
      replace={replace ?? false}
      {...(state !== undefined ? { state: state as never } : {})}
    />
  );
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
  const tanstackSearch = useRouterState({ select: (state) => state.location.searchStr ?? "" });
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
    const { pathname, hash } = router.state.location;
    const suffix = `${serialized ? `?${serialized}` : ""}${hash ? (hash.startsWith("#") ? hash : `#${hash}`) : ""}`;
    void router.navigate({
      to: `${pathname}${suffix}` as never,
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
