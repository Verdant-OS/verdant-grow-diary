/**
 * CustomerShareLinkPreview — operator-facing helper for previewing a
 * Customer Mode share link. Presenter-only.
 *
 * Hard constraints:
 *  - No backend validation of the shareId.
 *  - No fetch, no Supabase, no token minting.
 *  - Treats shareId as opaque, normalized only for URL safety.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  buildCustomerSharePreview,
  CUSTOMER_SHARE_LINK_PREVIEW_DISCLAIMER,
  CUSTOMER_SHARE_LINK_PUBLIC_ONLY_COPY,
} from "@/lib/customerShareLinkPreviewRules";

export interface CustomerShareLinkPreviewProps {
  /** Optional initial value (e.g. an opaque draft id). */
  initialShareId?: string | null;
}

export default function CustomerShareLinkPreview({
  initialShareId,
}: CustomerShareLinkPreviewProps) {
  const [raw, setRaw] = useState<string>(initialShareId ?? "");
  const preview = useMemo(() => buildCustomerSharePreview(raw), [raw]);

  return (
    <section
      data-testid="customer-share-link-preview"
      aria-labelledby="customer-share-link-preview-heading"
      className="rounded-xl border border-border/60 bg-card/60 p-5"
    >
      <h2
        id="customer-share-link-preview-heading"
        className="text-base font-semibold tracking-tight"
      >
        Customer share link preview
      </h2>
      <p
        data-testid="customer-share-link-preview-disclaimer"
        className="mt-2 text-xs text-amber-300/80"
      >
        {CUSTOMER_SHARE_LINK_PREVIEW_DISCLAIMER}
      </p>
      <p
        data-testid="customer-share-link-preview-public-only"
        className="mt-1 text-xs text-muted-foreground"
      >
        {CUSTOMER_SHARE_LINK_PUBLIC_ONLY_COPY}
      </p>

      <label
        htmlFor="customer-share-link-preview-input"
        className="mt-4 block text-xs font-medium text-muted-foreground"
      >
        Share ID
      </label>
      <input
        id="customer-share-link-preview-input"
        data-testid="customer-share-link-preview-input"
        type="text"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="Enter an opaque share id"
        autoComplete="off"
        spellCheck={false}
        className="mt-1 w-full rounded-md border border-border bg-background px-3 min-h-11 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      <div className="mt-4 flex flex-col gap-2">
        <p
          data-testid="customer-share-link-preview-url"
          className="text-xs text-muted-foreground break-all"
        >
          {preview.path ?? "—"}
        </p>
        {preview.canOpen && preview.path ? (
          <Link
            to={preview.path}
            data-testid="customer-share-link-preview-open"
            className="inline-flex items-center justify-center rounded-md border border-border/60 bg-secondary/40 px-4 min-h-11 text-sm font-medium hover:bg-secondary/70 active:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Open preview
          </Link>
        ) : (
          <button
            type="button"
            data-testid="customer-share-link-preview-open"
            disabled
            aria-disabled="true"
            className="inline-flex items-center justify-center rounded-md border border-border/40 bg-secondary/20 px-4 min-h-11 text-sm font-medium text-muted-foreground cursor-not-allowed"
          >
            Open preview
          </button>
        )}
      </div>
    </section>
  );
}
