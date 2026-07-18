import { useEffect, useState, type ReactNode } from "react";
import LegalFooterLinks from "@/components/LegalFooterLinks";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bell, LogOut, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/store/auth";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { buildSignedOutRedirect } from "@/lib/authRedirectRules";
import { useAlertsList } from "@/hooks/useAlertsList";
import AppSidebar from "./AppSidebar";
import MobileNav from "./MobileNav";
import QuickLog, { type QuickLogPrefill } from "./QuickLog";
import QuickLogV2Sheet from "./QuickLogV2Sheet";
import BrandLogo from "./BrandLogo";
import GlobalFastAddButton from "./GlobalFastAddButton";
import AuthStatusIndicator from "./AuthStatusIndicator";
import SignOutConfirmDialog from "./SignOutConfirmDialog";
import VerificationPendingBanner from "./VerificationPendingBanner";
import { SubscriptionPastDueBanner } from "./SubscriptionPastDueBanner";
import GlobalSearchDialog from "./GlobalSearchDialog";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";
import { isEmailVerificationPending } from "@/lib/emailVerificationRules";
import { resolveMobileQuickLogTarget } from "@/lib/quickLogRouteTargetRules";
import { consumeQuickLogStartIntent } from "@/lib/startScreenPreferences";
import { useCheckoutReturnCompletionTracking } from "@/hooks/useCheckoutReturnCompletionTracking";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";

export default function AppShell({ children }: { children?: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  // Protected-route boundary: re-validate session against the auth server.
  // Keep both session checks on the same signed-out destination. Sending the
  // server revalidation to /auth while the shell sent cached-session misses to
  // /welcome created a race at the public root and bypassed the landing page.
  // The destination stays /welcome; buildSignedOutRedirect only appends a
  // manifest-validated redirectTo so a signed-out deep link (e.g. a /plants
  // bookmark) can be restored after sign-in instead of silently dropped.
  const signedOutRedirect = buildSignedOutRedirect(
    location.pathname,
    location.search,
    location.hash,
  );
  const { status: authStatus } = useRequireAuth(signedOutRedirect);
  const { loading: entitlementLoading, entitlement } = useMyEntitlements();
  // Real persisted alerts (open only). RLS-scoped to the signed-in user.
  // Replaces the prior mock badge to remove the demo-vs-live mismatch.
  // Gated on a resolved session: an unauthenticated load (about to redirect
  // to /welcome) must not fire GET /rest/v1/alerts at all — the
  // never-healthy E2E spec forbids that request along the redirect path.
  const { alerts: openAlerts } = useAlertsList({ status: "open" }, { enabled: !loading && !!user });
  const nav = useNavigate();
  const [openLog, setOpenLog] = useState(false);
  const [openScopedLog, setOpenScopedLog] = useState(false);
  const [prefill, setPrefill] = useState<QuickLogPrefill | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const mobileQuickLogTarget = resolveMobileQuickLogTarget(location.pathname);

  // This shell lives inside the route-level Suspense boundary. Tracking here
  // waits for server-auth revalidation and the paid entitlement read as well
  // as the authenticated destination subtree (including lazy chunks and route
  // gates). A cached session, a loading/denied gate, or a free fallback must
  // never count as proof that the grower reached the paid destination.
  const paidDestinationReady =
    !loading &&
    Boolean(user) &&
    authStatus === "authenticated" &&
    !entitlementLoading &&
    entitlement.isActive &&
    entitlement.effectivePlanId !== "free";
  useCheckoutReturnCompletionTracking(paidDestinationReady);

  // Global ⌘K / Ctrl+K shortcut to open the search palette.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<QuickLogPrefill>).detail ?? null;
      setPrefill(detail);
      setOpenLog(true);
    }
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, onOpen as EventListener);
    return () => window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, onOpen as EventListener);
  }, []);

  // The saved "Quick Log" start-screen choice carries a transparent one-shot
  // query intent. Consume it only after AppShell is mounted, open the existing
  // Quick Log dialog, then remove the marker so refresh/back does not reopen it.
  useEffect(() => {
    const nextSearch = consumeQuickLogStartIntent(location.search);
    if (nextSearch === null) return;
    setPrefill(null);
    setOpenLog(true);
    nav(
      {
        pathname: location.pathname,
        search: nextSearch,
        hash: location.hash,
      },
      { replace: true },
    );
  }, [location.hash, location.pathname, location.search, nav]);

  // Redirect from an effect, not during render: router state must not be
  // updated while AppShell is rendering (React update-during-render error,
  // asserted clean by the never-healthy E2E console check).
  useEffect(() => {
    if (!loading && !user) nav(signedOutRedirect, { replace: true });
  }, [loading, user, nav, signedOutRedirect]);

  // Never carry an open tent-scoped sheet across routes. Without this reset,
  // leaving Tent A and later entering Tent B could reopen the sheet with stale
  // UI state or silently retarget an in-progress log.
  useEffect(() => {
    setOpenScopedLog(false);
  }, [mobileQuickLogTarget]);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  if (!user) return null;

  const unread = openAlerts.filter((a) => a.status === "open").length;
  const pageContent = children ?? <Outlet />;

  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen flex w-full">
        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <AppSidebar />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border/40">
            <div className="h-14 px-3 md:px-5 flex items-center gap-3">
              <div className="hidden md:block">
                <SidebarTrigger />
              </div>
              <div className="md:hidden">
                <BrandLogo size="md" showText />
              </div>

              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  aria-label="Open global search"
                  data-testid="global-search-trigger"
                  className="hidden md:inline-flex items-center gap-2 px-3 h-9 rounded-lg border border-border/50 bg-secondary/30 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition"
                >
                  <Search className="h-4 w-4" />
                  <span className="hidden lg:inline">Search…</span>
                  <kbd className="hidden lg:inline ml-2 text-[10px] px-1.5 py-0.5 rounded bg-background/60 border border-border/40">
                    ⌘K
                  </kbd>
                </button>
                {/* Quick Log is the single grower-facing logging entry
                    point on desktop. The dropdown surfaces event-type
                    presets (diary note, watering, feeding, training,
                    photo, environment, diagnosis, harvest) and opens the
                    existing Quick Log sheet via the wired window event.
                    The previous standalone "Quick log" button has been
                    removed to eliminate duplicate add/log CTAs. */}
                <GlobalFastAddButton className="hidden md:inline-flex" />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => nav("/alerts")}
                  aria-label="Alerts"
                  className="relative"
                >
                  <Bell className="h-4 w-4" />
                  {unread > 0 && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
                  )}
                </Button>
                <AuthStatusIndicator className="hidden sm:inline-flex" />
                <SignOutConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon" aria-label="Sign out">
                      <LogOut className="h-4 w-4" />
                    </Button>
                  }
                />
              </div>
            </div>
          </header>

          <SubscriptionPastDueBanner loading={entitlementLoading} entitlement={entitlement} />

          <main className="flex-1 px-4 md:px-6 lg:px-8 py-5 pb-28 md:pb-8 max-w-[1400px] w-full mx-auto">
            {isEmailVerificationPending(user) ? (
              <VerificationPendingBanner email={user.email ?? ""} />
            ) : (
              pageContent
            )}
            {/* In-flow legal footer: stays at the end of scrolled content
                (never fixed), so the mobile FAB cannot clip it. */}
            <footer
              data-testid="app-shell-legal-footer"
              className="mt-10 border-t border-border/40 pt-4"
            >
              <LegalFooterLinks className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground" />
            </footer>
          </main>
        </div>

        {/* Mobile floating + */}
        <button
          onClick={() => {
            if (mobileQuickLogTarget) {
              setOpenScopedLog(true);
            } else {
              setPrefill(null);
              setOpenLog(true);
            }
          }}
          aria-label="Open Quick Log"
          data-testid="mobile-quick-log-fab"
          className="md:hidden fixed z-40 bottom-20 right-4 h-14 w-14 rounded-full gradient-leaf shadow-elevated flex items-center justify-center text-primary-foreground hover:scale-105 transition active:scale-95 glow-accent"
        >
          <Plus className="h-6 w-6" />
        </button>

        <MobileNav />

        <QuickLog
          open={openLog}
          onOpenChange={(o) => {
            setOpenLog(o);
            if (!o) setPrefill(null);
          }}
          prefill={prefill}
          onCreated={() => window.dispatchEvent(new Event("verdant:entry-created"))}
        />

        {mobileQuickLogTarget ? (
          <QuickLogV2Sheet
            open={openScopedLog}
            onOpenChange={setOpenScopedLog}
            defaultTargetKey={mobileQuickLogTarget}
          />
        ) : null}

        <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      </div>
    </SidebarProvider>
  );
}
