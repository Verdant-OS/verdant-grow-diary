import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Sprout } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import StageBadge from "@/components/StageBadge";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useTent } from "@/hooks/useMockData";
import { useGrowPlant } from "@/hooks/useGrowData";
import { format, formatDistanceToNow } from "date-fns";

export default function PlantDetail() {
  const { id } = useParams();
  const { data: plant, isLoading } = useGrowPlant(id);
  const { data: tent } = useTent(plant?.tentId);
  if (isLoading) return <div className="glass rounded-2xl h-64 animate-pulse" />;
  if (!plant) return <EmptyState icon={<Sprout className="h-6 w-6" />} title="Plant not found" action={<Button asChild variant="outline"><Link to="/plants"><ArrowLeft className="h-4 w-4" /> Back</Link></Button>} />;

  const ageDays = Math.floor((Date.now() - new Date(plant.startedAt).getTime()) / 86400000);
  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3"><Link to="/plants"><ArrowLeft className="h-4 w-4" /> Plants</Link></Button>
      <PageHeader title={plant.name} description={plant.strain} icon={<Sprout className="h-5 w-5" />} actions={<StageBadge stage={plant.stage} />} />
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 glass rounded-2xl overflow-hidden">
          <div className="aspect-square bg-secondary/40"><img src={plant.photo} alt="" className="w-full h-full object-cover" /></div>
        </div>
        <div className="lg:col-span-2 glass rounded-2xl p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-xs text-muted-foreground uppercase tracking-wider">Tent</div><div>{tent?.name ?? "—"}</div></div>
            <div><div className="text-xs text-muted-foreground uppercase tracking-wider">Age</div><div>{ageDays} days</div></div>
            <div><div className="text-xs text-muted-foreground uppercase tracking-wider">Started</div><div>{format(new Date(plant.startedAt), "PP")}</div></div>
            <div><div className="text-xs text-muted-foreground uppercase tracking-wider">Health</div><div className="capitalize">{plant.health}</div></div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Last note</div>
            <p className="text-sm">{plant.lastNote}</p>
            <p className="text-xs text-muted-foreground mt-1">Updated {formatDistanceToNow(new Date(plant.startedAt), { addSuffix: true })}</p>
          </div>
          <Button asChild variant="outline" size="sm"><Link to="/logs">Open grow logs</Link></Button>
        </div>
      </div>
    </div>
  );
}
