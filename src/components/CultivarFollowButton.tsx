/**
 * CultivarFollowButton — follow a public cultivar reference and surface the
 * "updated since you followed" nudge (in-app retention loop).
 *
 * Signed-out growers see a sign-in prompt; signed-in growers can follow/unfollow
 * and, when the guide version has advanced, get an "updated" badge + mark-seen.
 * No plant linkage; no email (that transport does not exist yet).
 */
import { Link } from "react-router-dom";
import type { VerdantCultivarProfile } from "@/constants/verdantCultivars";
import { useAuth } from "@/store/auth";
import { useCultivarFollow } from "@/hooks/useCultivarFollow";

interface Props {
  cultivar: VerdantCultivarProfile;
}

export default function CultivarFollowButton({ cultivar }: Props) {
  const { user } = useAuth();
  const { loading, isFollowing, hasUpdate, follow, unfollow, markSeen } =
    useCultivarFollow(cultivar);

  if (!user) {
    return (
      <Link
        to="/auth"
        data-testid="cultivar-follow-signin"
        className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
      >
        Sign in to follow updates
      </Link>
    );
  }

  if (loading) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        data-testid="cultivar-follow-button"
        aria-pressed={isFollowing}
        onClick={() => void (isFollowing ? unfollow() : follow())}
        className={
          isFollowing
            ? "inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary"
            : "inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        }
      >
        {isFollowing ? "Following" : "Follow"}
      </button>

      {hasUpdate ? (
        <span
          data-testid="cultivar-follow-updated-badge"
          className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-200"
        >
          Guide updated since you followed
          <button
            type="button"
            data-testid="cultivar-follow-mark-seen"
            onClick={() => void markSeen()}
            className="underline underline-offset-2 hover:no-underline"
          >
            Mark seen
          </button>
        </span>
      ) : null}
    </div>
  );
}
