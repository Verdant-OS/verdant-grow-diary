/**
 * QR option for the one ID-free Customer Mode comparison guide.
 *
 * The encoded URL contains no share id and no private grow context. QR
 * rendering is local through qrcode.react; no external QR service is called.
 */

import { QRCodeSVG } from "qrcode.react";
import { Link } from "@/lib/react-router-compat";
import {
  NEXT_DOOR_CUSTOMER_BRAND,
  NEXT_DOOR_CUSTOMER_COMPARISON_PATH,
} from "@/constants/oreozGelonadeExperience";

export interface CustomerComparisonGuideQrOptionProps {
  /** Test seam. Browser origin is used when omitted. */
  readonly origin?: string | null;
}

function resolveAbsoluteUrl(origin: string | null | undefined): string {
  const candidate =
    typeof origin === "string" && origin.trim()
      ? origin.trim()
      : typeof window !== "undefined"
        ? window.location.origin
        : "";
  if (!candidate) return NEXT_DOOR_CUSTOMER_COMPARISON_PATH;
  try {
    return new URL(NEXT_DOOR_CUSTOMER_COMPARISON_PATH, candidate).toString();
  } catch {
    return NEXT_DOOR_CUSTOMER_COMPARISON_PATH;
  }
}

export default function CustomerComparisonGuideQrOption({
  origin,
}: CustomerComparisonGuideQrOptionProps) {
  const absoluteUrl = resolveAbsoluteUrl(origin);
  return (
    <section
      aria-labelledby="customer-comparison-qr-heading"
      data-testid="customer-comparison-guide-qr-option"
      className="mt-12 rounded-xl border border-primary/30 bg-primary/5 p-5 md:p-6"
    >
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Customer Mode</p>
      <h2 id="customer-comparison-qr-heading" className="mt-2 font-display text-xl font-semibold">
        Open the {NEXT_DOOR_CUSTOMER_BRAND} comparison guide
      </h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Scan or open this customer-safe guide. It is static education only and does not load
        Operator grows, plants, diary entries, sensors, or private customer records.
      </p>
      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="w-fit rounded-lg bg-white p-3" data-testid="customer-comparison-guide-qr">
          <QRCodeSVG value={absoluteUrl} size={152} level="M" includeMargin={false} />
        </div>
        <div className="min-w-0">
          <p
            data-testid="customer-comparison-guide-qr-url"
            className="break-all text-xs text-muted-foreground"
          >
            {absoluteUrl}
          </p>
          <Link
            to={NEXT_DOOR_CUSTOMER_COMPARISON_PATH}
            className="mt-3 inline-flex min-h-[44px] items-center rounded-md border border-primary/50 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
          >
            Open customer guide
          </Link>
        </div>
      </div>
    </section>
  );
}
