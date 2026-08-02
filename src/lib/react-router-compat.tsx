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
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from "react";
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

/** react-router `useLocation()` shape, sourced from the TanStack router state. */
export function useLocation(): CompatLocation {
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
  // TanStack's UseParamsOptions is heavily generic; cast keeps the legacy
  // non-strict "any route" calling convention without rewriting call sites.
  return useTanStackParams({ strict: false } as never) as T;
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

/** react-router partial location object accepted by `navigate(to)`. */
export interface CompatToObject {
  pathname?: string;
  search?: string;
  hash?: string;
  state?: unknown;
}

export type CompatTo = string | Partial<CompatToObject>;

export type CompatNavigateFunction = {
  (to: CompatTo, options?: CompatNavigateOptions): void;
  (delta: number): void;
};

function serializeCompatTo(to: CompatTo): { path: string; state?: unknown } {
  if (typeof to === "string") {
    return { path: to };
  }
  const pathname = to.pathname ?? "/";
  const search = to.search ? (to.search.startsWith("?") ? to.search : `?${to.search}`) : "";
  const hash = to.hash ? (to.hash.startsWith("#") ? to.hash : `#${to.hash}`) : "";
  return {
    path: `${pathname}${search}${hash}`,
    ...(to.state !== undefined ? { state: to.state } : {}),
  };
}

/**
 * react-router `useNavigate()`. Supports both `navigate("/path", { replace })`,
 * partial location objects, and history-delta calls such as `navigate(-1)`.
 */
export function useNavigate(): CompatNavigateFunction {
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
    const { path, state: toState } = serializeCompatTo(to);
    const state = options?.state !== undefined ? options.state : toState;
    void navigate({
      to: path,
      replace: options?.replace ?? false,
      ...(state !== undefined ? { state: state as never } : {}),
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
  { to, replace, state, preventScrollReset, children, ...rest },
  ref,
) {
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
export function Navigate({ to, replace, state }: CompatNavigateProps) {
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
  const searchStr = useRouterState({ select: (state) => state.location.searchStr ?? "" });
  const router = useRouter();
  const params = new URLSearchParams(searchStr);

  const setSearchParams: CompatSetSearchParams = (next, options) => {
    const resolved = typeof next === "function" ? next(new URLSearchParams(searchStr)) : next;
    const serialized =
      resolved instanceof URLSearchParams
        ? resolved.toString()
        : typeof resolved === "string"
          ? resolved.replace(/^\?/, "")
          : new URLSearchParams(resolved).toString();
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
 * Minimal react-router `matchRoutes` for static route tables in unit tests.
 * Path params use `:name` and `*` is a catch-all. Returns the deepest match.
 */
export type CompatRouteObject = {
  path: string;
  id?: string;
  [key: string]: unknown;
};

export type CompatRouteMatch<T extends CompatRouteObject = CompatRouteObject> = {
  route: T;
  pathname: string;
  params: Record<string, string>;
};

function pathToRegExp(path: string): { regex: RegExp; keys: string[] } {
  const keys: string[] = [];
  // Tokenize :param and * before escaping regex specials so splat paths
  // like "*" and "/files/*" compile (escaping first would leave a bare *).
  const placeholders: string[] = [];
  const withPlaceholders = path
    .replace(/:([A-Za-z0-9_]+)/g, (_m, key: string) => {
      keys.push(key);
      const token = `\0${placeholders.length}\0`;
      placeholders.push("([^/]+)");
      return token;
    })
    .replace(/\*/g, () => {
      const token = `\0${placeholders.length}\0`;
      placeholders.push("(.*)");
      return token;
    });
  let pattern = withPlaceholders.replace(/([.+?^=!:${}()|[\]/\\])/g, "\\$1");
  placeholders.forEach((replacement, index) => {
    pattern = pattern.replace(`\0${index}\0`, replacement);
  });
  return { regex: new RegExp(`^${pattern}$`), keys };
}

export function matchRoutes<T extends CompatRouteObject>(
  routes: T[],
  location: string | { pathname: string },
): CompatRouteMatch<T>[] | null {
  const pathname =
    typeof location === "string" ? (location.split("?")[0] ?? location) : location.pathname;
  const matches: CompatRouteMatch<T>[] = [];
  for (const route of routes) {
    const { regex, keys } = pathToRegExp(route.path);
    const m = pathname.match(regex);
    if (!m) continue;
    const params: Record<string, string> = {};
    keys.forEach((key, i) => {
      params[key] = m[i + 1] ?? "";
    });
    matches.push({ route, pathname, params });
  }
  if (matches.length === 0) return null;
  // Prefer concrete routes over splat; among equals, longer path wins.
  matches.sort((a, b) => {
    const aStar = a.route.path.includes("*") ? 1 : 0;
    const bStar = b.route.path.includes("*") ? 1 : 0;
    if (aStar !== bStar) return aStar - bStar;
    return b.route.path.length - a.route.path.length;
  });
  // If a concrete route matched, drop the catch-all so `.at(-1)` is the leaf.
  const concrete = matches.filter((m) => !m.route.path.includes("*"));
  return concrete.length > 0 ? concrete : matches;
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
 *
 * Props like `initialEntries` are accepted and ignored so createElement /
 * JSX call sites typecheck under strictNullChecks.
 */
export type MemoryRouterInitialEntry =
  | string
  | {
      pathname?: string;
      search?: string;
      hash?: string;
      state?: unknown;
    };

export type MemoryRouterProps = {
  children?: ReactNode;
  initialEntries?: MemoryRouterInitialEntry[];
  initialIndex?: number;
  future?: {
    v7_startTransition?: boolean;
    v7_relativeSplatPath?: boolean;
  };
};

export function BrowserRouter({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
export function MemoryRouter({ children }: MemoryRouterProps) {
  return <>{children}</>;
}
export function Routes({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
export function Route(_props: { path?: string; element?: ReactNode; children?: ReactNode }) {
  return null;
}
