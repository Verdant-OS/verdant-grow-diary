import { ListChecks } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import GrowDataSourceDisclosure from "@/components/GrowDataSourceDisclosure";
import { type GrowDataSourceMeta } from "@/hooks/useGrowData";

/**
 * Tasks page — V0 status.
 *
 * Verdant does not yet have a real `tasks` table or grower-facing task
 * pipeline wired in. Per source-truth rules we must NOT show demo/mock
 * task rows as if they were real schedule output, and we must NOT seed
 * fake tasks into Supabase. Until a real task source ships, this page
 * renders a safe empty state and an "Unavailable" disclosure.
 */
const TASKS_UNAVAILABLE_META: GrowDataSourceMeta = {
  isDemoData: false,
  dataSource: "unavailable",
  sourceReason: "tasks:no-real-source",
};

export default function Tasks() {
  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Watering, feeding, training, and inspection schedule."
        icon={<ListChecks className="h-5 w-5" />}
      />
      <GrowDataSourceDisclosure
        resource="tasks"
        hasAnyData={false}
        metas={[TASKS_UNAVAILABLE_META]}
        testId="tasks-data-source-disclosure"
      />
      <div
        className="glass rounded-2xl p-8 text-center"
        data-testid="tasks-empty-state"
      >
        <ListChecks className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <h3 className="font-display font-semibold text-base mb-1">
          No tasks yet.
        </h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Create a task from a plant, alert, or grow workflow when there's
          something to track.
        </p>
      </div>
    </div>
  );
}
