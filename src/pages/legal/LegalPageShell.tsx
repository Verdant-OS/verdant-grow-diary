import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  buildLegalPageJsonLd,
  VERDANT_LEGAL_PAGE_JSON_LD_SELECTOR,
} from "@/lib/seo/legalPageStructuredData";
import { safeJsonLdStringify } from "@/lib/seoStructuredData";

/**
 * Shared shell for public legal pages (Terms, Privacy, Refund).
 * Uses the app's existing token-based styling; no bespoke palette.
 * Legal pages are public and unauthenticated by design so payment
 * providers and buyers can reach them without a login wall.
 *
 * SEO: each route gets per-page title, description, canonical, and
 * OpenGraph / Twitter metadata via usePageSeo. og:url and the canonical
 * link both resolve to https://verdantgrowdiary.com{path}.
 */
export function LegalPageShell({
  title,
  lastUpdated,
  path,
  description,
  children,
}: {
  title: string;
  lastUpdated: string;
  /** Canonical path (e.g. "/terms") for SEO discovery. */
  path: string;
  description: string;
  children: ReactNode;
}) {
  usePageSeo({
    title: `${title} | Verdant Grow Diary`,
    description,
    path,
  });
  const jsonLd = safeJsonLdStringify(
    buildLegalPageJsonLd({ path, name: title, description }),
  );
  return (
    <>
      <script
        type="application/ld+json"
        data-seo={VERDANT_LEGAL_PAGE_JSON_LD_SELECTOR}
        data-testid={VERDANT_LEGAL_PAGE_JSON_LD_SELECTOR}
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <main className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border/40 px-6 py-4">
          <div className="mx-auto max-w-3xl flex items-center justify-between text-sm">
            <Link to="/welcome" className="font-semibold hover:text-primary">
              Verdant Grow Diary
            </Link>
            <nav className="flex gap-4 text-muted-foreground">
              <Link to="/terms" className="hover:text-foreground">
                Terms of Service
              </Link>
              <Link to="/privacy" className="hover:text-foreground">
                Privacy Policy
              </Link>
              <Link to="/refund" className="hover:text-foreground">
                Refund Policy
              </Link>
            </nav>
          </div>
        </header>
        <article className="mx-auto max-w-3xl px-6 py-10 space-y-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              This page is maintained by Matthew Tyler Cheek (operating Verdant Grow Diary) to
              answer common questions about the service. Please review these terms carefully.
            </p>
          </div>
          <div className="prose prose-invert max-w-none space-y-5 text-sm leading-relaxed [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:text-foreground [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:text-foreground [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_a]:underline [&_a]:text-primary">
            {children}
          </div>
          <footer className="pt-8 border-t border-border/40 text-xs text-muted-foreground">
            Questions? Email{" "}
            <a href="mailto:support@verdantgrowdiary.com">support@verdantgrowdiary.com</a>. Refunds
            are handled by our payment provider — see the <Link to="/refund">Refund Policy</Link>.
          </footer>
        </article>
      </main>
    </>
  );
}
