/// <reference types="vite/client" />
import { Suspense } from "react";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/store/auth";
import { GrowsProvider } from "@/store/grows";
import RootErrorBoundary from "@/components/RootErrorBoundary";
import OAuthPostAuthRedirect from "@/components/OAuthPostAuthRedirect";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { AgreementReconsentGate } from "@/components/AgreementReconsentGate";
import { useGoogleAnalyticsPageViews } from "@/hooks/useGoogleAnalyticsPageViews";
import { clearGrowDataMeta } from "@/hooks/useGrowData";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { renderErrorPage } from "@/lib/error-page";
import appCss from "@/styles.css?url";
import { SITE_SOFTWARE_APPLICATION_JSON_LD } from "@/lib/build/siteSoftwareApplicationJsonLd";

const SITE_URL = "https://verdantgrowdiary.com";
const SITE_NAME = "Verdant Grow Diary";
const SITE_DESCRIPTION =
  "Grow logs, sensor-aware insights, environment alerts, and cautious AI coaching for serious cultivators.";
const SITE_IMAGE = `${SITE_URL}/brand/verdant-logo-512.png`;
const GA_MEASUREMENT_ID = "G-B3QRSZEM9S";
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap";

/**
 * Sitewide Organization + WebSite JSON-LD, carried over verbatim from the
 * Classic `index.html`. Per-route JSON-LD from `usePageSeo` layers on top.
 */
const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: SITE_IMAGE,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#organization` },
      description: SITE_DESCRIPTION,
    },
  ],
};

export interface RootRouteContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RootRouteContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0, viewport-fit=cover" },
      { name: "theme-color", content: "#0d1a12" },
      { name: "robots", content: "index, follow" },
      {
        name: "google-site-verification",
        content: "xPFb9yyxbDpIFrPhumD9-10JIkCO_gUlu09ZsF2nevo",
      },
      { title: SITE_NAME },
      { name: "description", content: SITE_DESCRIPTION },
      { property: "og:url", content: SITE_URL },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:title", content: SITE_NAME },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:image", content: SITE_IMAGE },
      { property: "og:image:alt", content: SITE_NAME },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SITE_NAME },
      { name: "twitter:description", content: SITE_DESCRIPTION },
      { name: "twitter:image", content: SITE_IMAGE },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/brand/verdant-logo-180.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "canonical", href: SITE_URL },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: FONT_HREF },
    ],
    scripts: [
      { src: `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`, async: true },
      {
        // React sends an explicit pathname-only page_location. GA's automatic
        // initial view stays disabled so query tokens and hashes never become
        // the browser-location fallback before the router mounts.
        children: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","${GA_MEASUREMENT_ID}",{send_page_view:false});`,
      },
      { type: "application/ld+json", children: JSON.stringify(SITE_JSON_LD) },
      {
        type: "application/ld+json",
        children: JSON.stringify(SITE_SOFTWARE_APPLICATION_JSON_LD),
      },
    ],
  }),
  component: RootComponent,
  errorComponent: RootErrorComponent,
});

function RootErrorComponent({ error }: { error: Error }) {
  reportLovableError(error);
  return (
    <RootDocument>
      <div
        // Branded fallback rendered instead of the framework default.
        dangerouslySetInnerHTML={{ __html: renderErrorPage() }}
      />
    </RootDocument>
  );
}

/**
 * Defense in depth for every private query family. Owner-suffixed keys stop
 * cross-account reuse during render; clearing removes residual rows and
 * cancels active observers before AuthProvider exposes the next identity.
 * Source-disclosure metadata lives outside React Query and needs the same
 * identity fence so one grower's status cannot flash for the next account.
 */
function useClearQueryCacheBeforeAuthIdentityChange() {
  const { queryClient } = Route.useRouteContext();
  return () => {
    queryClient.clear();
    clearGrowDataMeta();
  };
}

function AnalyticsShell() {
  useGoogleAnalyticsPageViews();
  return null;
}

/** Minimal, dependency-free fallback shown while a route chunk loads. */
function PageLoader() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const onBeforeAuthIdentityChange = useClearQueryCacheBeforeAuthIdentityChange();
  return (
    <RootDocument>
      <RootErrorBoundary>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <AuthProvider onBeforeAuthIdentityChange={onBeforeAuthIdentityChange}>
            <OAuthPostAuthRedirect />
            <GrowsProvider>
              <PaymentTestModeBanner />
              <AgreementReconsentGate />
              <AnalyticsShell />
              <Suspense fallback={<PageLoader />}>
                <Outlet />
              </Suspense>
            </GrowsProvider>
          </AuthProvider>
        </TooltipProvider>
      </RootErrorBoundary>
    </RootDocument>
  );
}
