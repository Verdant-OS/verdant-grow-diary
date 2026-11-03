import { Link } from "@/lib/react-router-compat";
import { useGrows } from "@/store/grows";
import { growDetailPath } from "@/lib/routes";
import {
  DETAIL_GROW_CONTEXT_COPY,
  resolveDetailGrowContext,
} from "@/lib/detailPageGrowContextRules";

/** One line under a Plant or Tent header naming the grow it belongs to. */
export function DetailGrowContextLine({
  growId,
  testId,
}: {
  growId: string | null | undefined;
  testId: string;
}) {
  const { grows, archivedGrows, loading } = useGrows();
  const ctx = resolveDetailGrowContext({ growId, grows, archivedGrows, loading });
  if (ctx.kind === "loading") return null;
  return (
    <p className="-mt-2 mb-3 text-sm text-muted-foreground" data-testid={testId}>
      {DETAIL_GROW_CONTEXT_COPY.prefix}:{" "}
      {ctx.kind === "named" ? (
        <>
          <Link
            to={growDetailPath(ctx.growId)}
            className="text-foreground/90 underline-offset-2 hover:underline"
          >
            {ctx.name}
          </Link>
          {ctx.archived ? ` · ${DETAIL_GROW_CONTEXT_COPY.archived}` : ""}
        </>
      ) : ctx.kind === "none" ? (
        DETAIL_GROW_CONTEXT_COPY.none
      ) : (
        DETAIL_GROW_CONTEXT_COPY.unavailable
      )}
    </p>
  );
}
