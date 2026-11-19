import { useEffect } from "react";
import { Link } from "@/lib/react-router-compat";
import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";

// Unsubscribe is now hosted by the email provider: every app email carries its
// own one-click unsubscribe link in the footer. This page remains for links in
// older emails and explains where to go.
export default function Unsubscribe() {
  usePageSeo({
    title: "Unsubscribe | Verdant Grow Diary",
    description: "How to stop receiving emails from Verdant Grow Diary.",
    path: "/unsubscribe",
    noindex: true,
  });

  useEffect(() => {
    // Keep any legacy one-time token out of browser history and copied URLs.
    if (typeof window !== "undefined" && window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground px-4 py-16">
      <div className="mx-auto max-w-md">
        <div className="mb-8 flex justify-center">
          <BrandLogo />
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-semibold">Email preferences</h1>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <p>
              To stop emails from Verdant Grow Diary, use the unsubscribe link at the bottom of any
              recent email from us. It takes effect right away.
            </p>
            <p>
              If that link doesn&rsquo;t work, reply to the email you received and I&rsquo;ll take
              care of it. Password resets and other account emails are not affected.
            </p>
          </div>
          <div className="mt-6 text-xs text-muted-foreground">
            <Link to="/" className="underline" referrerPolicy="no-referrer">
              Return to Verdant
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
