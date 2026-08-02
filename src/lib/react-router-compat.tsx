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
  return useTanStackParams({ strict: false }) as T;
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

export type CompatNavigateFunction = {
  (to: string, options?: CompatNavigateOptions): void;
  (delta: number): void;
};

/**
 * react-router `useNavigate()`. Supports both `navigate("/path", { replace })`
 * and history-delta calls such as `navigate(-1)`.
 */
export function useNavigate(): CompatNavigateFunction {
  const navigate = useTanStackNavigate();
  const router = useRouter();

  return ((to: string | number, options?: CompatNavigateOptions) => {
    if (typeof to === "number") {
      if (to === 0) return;
      // TanStack's history exposes go/back/forward; -1 is the common case.
      if (to < 0) router.history.back();
      else router.history.forward();
      return;
    }
    void navigate({
      to,
      replace: options?.replace ?? false,
      ...(options?.state !== undefined ? { state: options.state as never } : {}),
      resetScroll: options?.preventScrollReset !== true,
    } as never);
  }) as CompatNavigateFunction;
}

export interface CompatLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
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
  const isActive = end === true ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
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
}

export function BrowserRouter({ children }: LegacyRouterShellProps) {
  return <>{children}</>;
}
export function MemoryRouter({ children }: LegacyRouterShellProps) {
  return <>{children}</>;
}
export function Routes({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
export function Route(_props: { path?: string; element?: ReactNode; children?: ReactNode }) {
  return null;
}
