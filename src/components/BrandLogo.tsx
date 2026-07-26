/**
 * Verdant brand logo.
 *
 * Renders the circular Verdant mark from /brand/verdant-logo.png.
 *
 * Sizes:
 *  - sm   24px  — favicon-adjacent, dense nav rails
 *  - md   32px  — sidebar / app shell header
 *  - lg   56px  — auth screens, landing header
 *  - hero 128px — landing hero
 *
 * The image is square; we render at fixed pixel sizes (width = height)
 * to avoid layout shift on slow networks. Dark mode is intentionally
 * not inverted — the mark reads well on dark surfaces as-is.
 *
 * The detailed circular mark is not reused at 16×16; index.html points to
 * the purpose-built leaf-and-pen SVG favicon in public/favicon.svg.
 */

const LOGO_SRC = "/brand/verdant-logo.png";
const ALT = "Verdant Grow Diary logo";

export type BrandLogoSize = "sm" | "md" | "lg" | "hero";

const SIZE_PX: Record<BrandLogoSize, number> = {
  sm: 24,
  md: 32,
  lg: 56,
  hero: 128,
};

const TEXT_CLASS: Record<BrandLogoSize, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
  hero: "text-3xl",
};

export interface BrandLogoProps {
  size?: BrandLogoSize;
  showText?: boolean;
  className?: string;
}

export default function BrandLogo({ size = "md", showText = false, className }: BrandLogoProps) {
  const px = SIZE_PX[size];
  // Hero variant is the landing LCP candidate — eager-load and hint the
  // browser to fetch it at high priority so it isn't deprioritized behind
  // late-discovered resources. Smaller variants keep lazy behavior.
  const isHero = size === "hero";
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`.trim()}>
      <img
        src={LOGO_SRC}
        alt={ALT}
        width={px}
        height={px}
        loading={isHero ? "eager" : "lazy"}
        {...(isHero ? ({ fetchpriority: "high" } as Record<string, string>) : {})}
        decoding="async"
        className="rounded-full shrink-0 select-none"
        style={{ width: px, height: px }}
      />

      {showText && (
        <span
          className={`hidden min-[380px]:inline whitespace-nowrap font-display font-semibold tracking-tight ${TEXT_CLASS[size]}`}
        >
          Verdant Grow Diary
        </span>
      )}
    </span>
  );
}
