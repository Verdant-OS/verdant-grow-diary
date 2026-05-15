import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useNugs } from "@/store/nugs";

export default function NugBadge() {
  const { profile } = useNugs();
  const total = profile?.nugs_total ?? 0;
  const level = profile?.level ?? 0;
  return (
    <Link
      to="/rewards"
      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/60 px-3 h-9 text-xs font-medium hover:border-primary/60 transition"
      aria-label={`${total} NUGs, level ${level}`}
    >
      <Sparkles className="h-3.5 w-3.5 text-primary" />
      <span className="tabular-nums">{total.toLocaleString()}</span>
      <span className="text-muted-foreground">·</span>
      <span className="text-primary">Lv {level}</span>
    </Link>
  );
}
