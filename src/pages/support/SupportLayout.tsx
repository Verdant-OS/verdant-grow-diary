import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";

/**
 * Shared layout for public support pages (/feedback, /contact).
 *
 * Presenter only. Dark-first, mobile-first. Uses design tokens from
 * index.css so it respects the app's existing theme. Legal footer
 * links are intentionally minimal — support pages are for humans,
 * not marketing.
 */
export function SupportLayout({
  title,
  description,
  path,
  children,
}: {
  title: string;
  description: string;
  path: string;
  children: ReactNode;
}) {
  usePageSeo({
    title: `${title} | Verdant Grow Diary`,
    description,
    path,
  });
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/welcome" className="font-display text-base font-semibold tracking-tight hover:text-primary">
            Verdant Grow Diary
          </Link>
          <nav aria-label="Support" className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/feedback" className="hover:text-foreground">
              Feedback
            </Link>
            <Link to="/contact" className="hover:text-foreground">
              Contact
            </Link>
            <Link to="/dashboard" className="hidden text-xs text-muted-foreground/80 hover:text-foreground sm:inline">
              Back to app
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">{children}</main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:px-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <a href="mailto:support@verdantgrowdiary.com" className="hover:text-foreground">
              support@verdantgrowdiary.com
            </a>
            <p>Grower stays in control.</p>
          </div>
          <p className="max-w-sm sm:text-right">
            Your plant data stays yours. Never used to train models. See{" "}
            <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
              Privacy
            </Link>
            .
          </p>
        </div>
      </footer>
    </div>
  );
}

export function PrivacyNote() {
  return (
    <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      Feedback and messages are never used to train models or shared. Your plant data stays yours.
    </p>
  );
}
