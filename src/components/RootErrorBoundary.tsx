import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Top-level error boundary.
 *
 * Wraps the entire app so a render error in any route (or a failed lazy chunk
 * fetch) shows an honest recovery screen instead of a blank white page. It is
 * deliberately dependency-free: no Supabase, no fetch/beacon, no data hooks —
 * so it is safe to sit above the read-only public routes as well as the
 * authenticated app, and it still renders if a chunk or provider failed.
 *
 * It never claims anything about data integrity it cannot guarantee; it only
 * reports that the page hit an unexpected error and offers a reload.
 */
interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class RootErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface for local debugging and any console-based monitoring. Best-effort
    // analytics exception ping if gtag is already present; no network client is
    // imported here on purpose.
    console.error("[RootErrorBoundary] Uncaught render error:", error, info);
    const g = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
    if (typeof g === "function") {
      g("event", "exception", { description: String(error?.message ?? error), fatal: false });
    }
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
          background: "#0d1a12",
          color: "#e5f6ec",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
          This page ran into an unexpected error
        </h1>
        <p style={{ maxWidth: "28rem", color: "#a7c4b1", margin: 0 }}>
          Something on this screen failed to load. Reloading usually fixes it. If it keeps
          happening, please let us know what you were doing.
        </p>
        <div
          style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}
        >
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              background: "#4ade80",
              color: "#0d1a12",
              border: "none",
              borderRadius: "0.5rem",
              padding: "0.6rem 1.1rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload page
          </button>
          <a
            href="/welcome"
            style={{
              display: "inline-flex",
              alignItems: "center",
              border: "1px solid rgba(229,246,236,0.3)",
              borderRadius: "0.5rem",
              padding: "0.6rem 1.1rem",
              color: "#e5f6ec",
              textDecoration: "none",
            }}
          >
            Back to home
          </a>
        </div>
      </div>
    );
  }
}
