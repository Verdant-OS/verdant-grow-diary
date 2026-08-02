import { Link, useInRouterContext } from "@/lib/react-router-compat";

import { LEGAL_FOOTER_LINKS } from "@/components/LegalFooterLinks";
import { cn } from "@/lib/utils";

const PUBLIC_PAGE_RECOVERY_LINKS = [
  { to: "/welcome", label: "Home" },
  ...LEGAL_FOOTER_LINKS.filter(({ to }) => to === "/terms" || to === "/privacy"),
] as const;

interface PublicPageRecoveryNavProps {
  className?: string;
}

const LINK_CLASSES =
  "rounded-sm underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/**
 * Small recovery path for standalone public pages that render outside AppShell.
 */
export default function PublicPageRecoveryNav({ className }: PublicPageRecoveryNavProps) {
  const inRouter = useInRouterContext();

  return (
    <nav
      aria-label="Public page recovery"
      data-testid="public-page-recovery"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground",
        className,
      )}
    >
      {PUBLIC_PAGE_RECOVERY_LINKS.map(({ to, label }) =>
        inRouter ? (
          <Link key={to} to={to} className={LINK_CLASSES}>
            {label}
          </Link>
        ) : (
          <a key={to} href={to} className={LINK_CLASSES}>
            {label}
          </a>
        ),
      )}
    </nav>
  );
}
