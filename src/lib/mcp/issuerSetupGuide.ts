/**
 * Contextual setup-guide link for the MCP status page.
 *
 * Maps the derived OAuth issuer context (configured / not configured /
 * unable to verify) to the matching anchored section of the public MCP
 * setup guide at /docs/mcp-api. Pure and deterministic — no network,
 * no storage.
 */

export type IssuerContext = "configured" | "not_configured" | "unverified";

export type SetupGuideLink = {
  /** Same-origin path + anchor into the setup guide. */
  href: string;
  /** Visible link text, specific to the issuer context. */
  label: string;
  /** One-line explanation of why this section matches. */
  description: string;
};

export const SETUP_GUIDE_PATH = "/docs/mcp-api";

const LINKS: Record<IssuerContext, SetupGuideLink> = {
  configured: {
    href: `${SETUP_GUIDE_PATH}#issuer-configured`,
    label: "Setup guide: connect a client to this issuer",
    description:
      "Your OAuth issuer looks configured — this section walks through connecting an assistant.",
  },
  not_configured: {
    href: `${SETUP_GUIDE_PATH}#issuer-not-configured`,
    label: "Setup guide: OAuth issuer not configured",
    description:
      "No OAuth issuer is advertised — this section explains what the owner must enable first.",
  },
  unverified: {
    href: `${SETUP_GUIDE_PATH}#issuer-unverified`,
    label: "Setup guide: verify this issuer",
    description:
      "The advertised issuer could not be verified safely — this section covers how to check it.",
  },
};

export function getIssuerSetupGuideLink(context: IssuerContext): SetupGuideLink {
  return LINKS[context] ?? LINKS.unverified;
}
