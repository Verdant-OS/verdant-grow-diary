import PlantPhotoView from "@/components/PlantPhotoView";
import { usePlantProfilePhotoSource } from "@/hooks/usePlantProfilePhotoSource";

interface Props {
  src?: string | null;
  /**
   * Used only when the profile photo does not resolve to a display URL. Must
   * already be a validated display URL (Plant Detail passes the newest diary
   * photo from useDiaryPhotoDisplayRows), so it is rendered as given.
   */
  fallbackSrc?: string | null;
  alt?: string;
  className?: string;
  iconClassName?: string;
  caption?: string;
  ctaLabel?: string | null;
  testId?: string;
}

/**
 * Thin wrapper that resolves a persisted `plants.photo_url` value
 * (which may be a durable `storage://` reference, a legacy http(s)
 * URL, a permitted data: URL, or a local blob: preview) into a
 * display URL, then delegates rendering to the pure `PlantPhotoView`
 * presenter. Placeholder is shown while a signed URL is loading or
 * when resolution fails.
 */
export default function PlantPhoto({
  src,
  fallbackSrc,
  alt = "",
  className,
  iconClassName,
  caption,
  ctaLabel,
  testId,
}: Props) {
  const resolved = usePlantProfilePhotoSource(src);
  const fallbackUrl = typeof fallbackSrc === "string" && fallbackSrc.trim() ? fallbackSrc : null;
  if (!resolved.displayUrl && fallbackUrl) {
    return (
      <PlantPhotoView
        src={fallbackUrl}
        alt={alt}
        className={className}
        iconClassName={iconClassName}
        caption={caption}
        ctaLabel={ctaLabel}
        testId={testId}
      />
    );
  }
  return (
    <PlantPhotoView
      src={resolved.displayUrl}
      alt={alt}
      className={className}
      iconClassName={iconClassName}
      caption={caption}
      ctaLabel={ctaLabel}
      testId={testId}
    />
  );
}
