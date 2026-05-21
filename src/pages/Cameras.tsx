import { Camera as CamIcon, Wifi, WifiOff } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import GrowDataSourceDisclosure from "@/components/GrowDataSourceDisclosure";
import { useCameras, useTents } from "@/hooks/useMockData";
import { type GrowDataSourceMeta } from "@/hooks/useGrowData";
import { formatDistanceToNow } from "date-fns";

// Cameras still rely on useMockData. Surface that honestly as Demo so live
// feed badges below cannot be mistaken for real hardware.
const CAMERAS_MOCK_META: GrowDataSourceMeta = {
  isDemoData: true,
  dataSource: "mock",
  sourceReason: "cameras:mock",
};

export default function Cameras() {
  const { data: cameras = [] } = useCameras();
  const { data: tents = [] } = useTents();
  return (
    <div>
      <PageHeader title="Cameras" description="Live tiles and timelapse snapshots." icon={<CamIcon className="h-5 w-5" />} />
      <GrowDataSourceDisclosure
        resource="cameras"
        hasAnyData={cameras.length > 0}
        metas={[CAMERAS_MOCK_META]}
        testId="cameras-data-source-disclosure"
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cameras.map((c) => {
          const tent = tents.find((t) => t.id === c.tentId);
          return (
            <div key={c.id} className="glass rounded-2xl overflow-hidden animate-fade-in">
              <div className="relative aspect-video bg-secondary/40">
                <img src={c.thumbnail} alt={c.name} className="w-full h-full object-cover" />
                <span className={`absolute top-2 left-2 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${c.online ? "bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]" : "bg-destructive/20 text-destructive"}`}>
                  {c.online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                  {c.online ? "Live" : "Offline"}
                </span>
              </div>
              <div className="p-3">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-[11px] text-muted-foreground">{tent?.name ?? "—"} · last frame {formatDistanceToNow(new Date(c.lastFrameAt), { addSuffix: true })}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
