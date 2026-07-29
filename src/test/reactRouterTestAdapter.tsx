import {
  BrowserRouter as ReactRouterBrowserRouter,
  MemoryRouter as ReactRouterMemoryRouter,
  type BrowserRouterProps,
  type FutureConfig,
  type MemoryRouterProps,
} from "react-router-dom/dist/index.js";

// A test-only adapter must preserve React Router DOM's full public surface.
// eslint-disable-next-line react-refresh/only-export-components
export * from "react-router-dom/dist/index.js";

const TEST_ROUTER_FUTURE_FLAGS = {
  v7_relativeSplatPath: true,
  v7_startTransition: true,
} satisfies Partial<FutureConfig>;

export function BrowserRouter({ future, ...props }: BrowserRouterProps) {
  return (
    <ReactRouterBrowserRouter {...props} future={{ ...TEST_ROUTER_FUTURE_FLAGS, ...future }} />
  );
}

export function MemoryRouter({ future, ...props }: MemoryRouterProps) {
  return <ReactRouterMemoryRouter {...props} future={{ ...TEST_ROUTER_FUTURE_FLAGS, ...future }} />;
}
