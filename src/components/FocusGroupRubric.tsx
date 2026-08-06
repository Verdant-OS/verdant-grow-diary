import { Users, Star, Droplet, Wind, Sparkles, Cigarette } from "lucide-react";

export interface FocusGroupScore {
  id: string;
  reviewerName: string;
  evaluatedAt: string;
  aromaScore: number;
  flavorScore: number;
  effectScore: number;
  bagAppealScore: number;
  ashColorScore: number;
  notes?: string;
}

function MetricBar({ label, value, icon: Icon, max = 10 }: { label: string; value: number; icon: any; max?: number }) {
  const percentage = (value / max) * 100;
  
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
        <span className="font-semibold">{value}<span className="text-muted-foreground font-normal">/{max}</span></span>
      </div>
      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default function FocusGroupRubric({ scores }: { scores: FocusGroupScore[] }) {
  if (!scores || scores.length === 0) {
    return (
      <div className="glass rounded-2xl p-5 border border-border/50">
        <h3 className="font-semibold flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-muted-foreground" />
          Focus Group Rubric
        </h3>
        <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
          <Star className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">No focus group scores logged.</p>
          <p className="text-xs mt-1">James Loud Methodology uses blind testing to eliminate breeder bias.</p>
        </div>
      </div>
    );
  }

  // Calculate averages
  const avgAroma = scores.reduce((acc, curr) => acc + curr.aromaScore, 0) / scores.length;
  const avgFlavor = scores.reduce((acc, curr) => acc + curr.flavorScore, 0) / scores.length;
  const avgEffect = scores.reduce((acc, curr) => acc + curr.effectScore, 0) / scores.length;
  const avgBagAppeal = scores.reduce((acc, curr) => acc + curr.bagAppealScore, 0) / scores.length;
  const avgAshColor = scores.reduce((acc, curr) => acc + curr.ashColorScore, 0) / scores.length;

  const totalAvg = (avgAroma + avgFlavor + avgEffect + avgBagAppeal + avgAshColor) / 5;

  return (
    <div className="glass rounded-2xl p-5 border border-border/50">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Focus Group Averages
        </h3>
        <div className="flex items-center gap-1.5 bg-primary/10 text-primary px-2.5 py-1 rounded-full text-xs font-semibold border border-primary/20">
          <Star className="h-3.5 w-3.5 fill-primary" />
          {totalAvg.toFixed(1)} / 10
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 mb-6">
        <MetricBar label="Aroma" value={Number(avgAroma.toFixed(1))} icon={Wind} />
        <MetricBar label="Flavor" value={Number(avgFlavor.toFixed(1))} icon={Droplet} />
        <MetricBar label="Effect" value={Number(avgEffect.toFixed(1))} icon={Sparkles} />
        <MetricBar label="Bag Appeal" value={Number(avgBagAppeal.toFixed(1))} icon={Star} />
        <MetricBar label="Ash Color" value={Number(avgAshColor.toFixed(1))} icon={Cigarette} />
      </div>

      {scores.length > 0 && (
        <div className="mt-6 pt-6 border-t border-border/50">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Individual Scores ({scores.length})
          </h4>
          <div className="space-y-3">
            {scores.map((score) => (
              <div key={score.id} className="p-3 rounded-lg bg-background/50 border border-border/50 text-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{score.reviewerName}</span>
                  <span className="text-xs text-muted-foreground">{new Date(score.evaluatedAt).toLocaleDateString()}</span>
                </div>
                {score.notes && (
                  <p className="text-xs text-muted-foreground italic">"{score.notes}"</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
