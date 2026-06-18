/**
 * CustomerGuideQrBlock — presenter for a QR block that encodes the
 * current Customer Mode guide URL.
 *
 * Hard constraints:
 *  - Uses `qrcode.react` (client-only SVG renderer). No external QR
 *    API calls. No network requests.
 *  - Encodes only the public `/customer/:shareId` URL. Never private ids.
 *  - When the shareId is missing, renders a calm fallback instead of a
 *    decorative fake QR.
 */
import { useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  buildCustomerShareAbsoluteUrl,
  buildCustomerSharePreview,
} from "@/lib/customerShareLinkPreviewRules";

export interface CustomerGuideQrBlockProps {
  shareId: string | null | undefined;
  /** Test seam — defaults to window.location.origin in the browser. */
  origin?: string | null;
}

export const CUSTOMER_GUIDE_QR_LABEL = "Customer guide link";
export const CUSTOMER_GUIDE_QR_UNAVAILABLE =
  "Customer guide link unavailable.";

function resolveOrigin(explicit: string | null | undefined): string | null {
  if (typeof explicit === "string" && explicit.length > 0) return explicit;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return null;
}

export default function CustomerGuideQrBlock({
  shareId,
  origin: originProp,
}: CustomerGuideQrBlockProps) {
  const preview = useMemo(() => buildCustomerSharePreview(shareId), [shareId]);
  const origin = resolveOrigin(originProp);
  const absoluteUrl = useMemo(
    () => buildCustomerShareAbsoluteUrl(shareId, origin),
    [shareId, origin],
  );

  const displayUrl = absoluteUrl ?? preview.path ?? null;

  if (!preview.canOpen || !displayUrl) {
    return (
      <section
        data-testid="customer-guide-qr-block"
        data-available="false"
        aria-labelledby="customer-guide-qr-heading"
        className="rounded-xl border border-border/60 bg-card/60 p-5"
      >
        <h2
          id="customer-guide-qr-heading"
          className="text-base font-semibold tracking-tight"
        >
          {CUSTOMER_GUIDE_QR_LABEL}
        </h2>
        <p
          data-testid="customer-guide-qr-unavailable"
          className="mt-2 text-sm text-muted-foreground"
        >
          {CUSTOMER_GUIDE_QR_UNAVAILABLE}
        </p>
      </section>
    );
  }

  return (
    <section
      data-testid="customer-guide-qr-block"
      data-available="true"
      aria-labelledby="customer-guide-qr-heading"
      className="rounded-xl border border-border/60 bg-card/60 p-5"
    >
      <h2
        id="customer-guide-qr-heading"
        className="text-base font-semibold tracking-tight"
      >
        {CUSTOMER_GUIDE_QR_LABEL}
      </h2>
      <div className="mt-4 flex flex-col items-center gap-3">
        <div
          data-testid="customer-guide-qr-svg-wrap"
          className="rounded-md bg-white p-3"
        >
          <QRCodeSVG
            value={displayUrl}
            size={160}
            level="M"
            includeMargin={false}
          />
        </div>
        <p
          data-testid="customer-guide-qr-url"
          className="text-xs text-muted-foreground break-all text-center"
        >
          {displayUrl}
        </p>
      </div>
    </section>
  );
}
