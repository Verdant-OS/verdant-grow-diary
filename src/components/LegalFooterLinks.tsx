/**
 * LegalFooterLinks — shared legal-page link row for every footer surface.
 *
 * Presenter only: three React Router links (/terms, /privacy, /refund) with
 * plain accessible text. No internal IDs, no Paddle IDs, no external URLs.
 * Paddle reviewers and search engines discover the legal pages through
 * these links, so every public/app/customer footer renders this component.
 */
import { Link } from "react-router-dom";

export const LEGAL_FOOTER_LINKS = [
  { to: "/terms", label: "Terms" },
  { to: "/privacy", label: "Privacy" },
  { to: "/refund", label: "Refunds" },
] as const;

export default function LegalFooterLinks({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Legal"
      data-testid="legal-footer-links"
      className={className ?? "flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"}
    >
      {LEGAL_FOOTER_LINKS.map((l) => (
        <Link key={l.to} to={l.to} className="hover:text-foreground underline-offset-2 hover:underline">
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
