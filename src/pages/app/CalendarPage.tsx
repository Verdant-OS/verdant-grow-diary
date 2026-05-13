import { useMemo, useState } from "react";
import { useVerdant, EventType } from "@/store/verdant";
import { PageHeader } from "@/components/ui-bits";
import { Calendar as CalIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addMonths, endOfMonth, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, endOfWeek, addDays } from "date-fns";

const colors: Record<EventType, string> = {
  watering: "bg-info", feeding: "bg-primary", training: "bg-warning",
  photo: "bg-accent", diagnosis: "bg-destructive", harvest: "bg-leaf",
  reminder: "bg-muted-foreground", transplant: "bg-secondary-foreground",
  environment: "bg-success", note: "bg-muted-foreground",
};

export default function CalendarPage() {
  const v = useVerdant();
  const [cursor, setCursor] = useState(new Date());
  const start = startOfWeek(startOfMonth(cursor));
  const end = endOfWeek(endOfMonth(cursor));

  const days = useMemo(() => {
    const out: Date[] = []; let d = start;
    while (d <= end) { out.push(d); d = addDays(d, 1); }
    return out;
  }, [start, end]);

  const all = [...v.events, ...v.diary.map(d => ({ id: d.id, plantId: d.plantId, date: d.timestamp, type: d.type as EventType, title: d.note, sourceId: d.id }))];

  return (
    <>
      <PageHeader title="Calendar" subtitle="Color-coded grow timeline" icon={CalIcon}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="font-display font-semibold w-40 text-center">{format(cursor, "MMMM yyyy")}</div>
            <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        } />
      <div className="glass rounded-xl p-3 md:p-4">
        <div className="grid grid-cols-7 gap-1 text-xs uppercase tracking-wider text-muted-foreground mb-2">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d} className="px-2 py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map(day => {
            const evts = all.filter(e => isSameDay(new Date(e.date), day));
            return (
              <div key={day.toISOString()} className={`min-h-[80px] rounded-lg p-1.5 border border-border/40 ${isSameMonth(day, cursor) ? "bg-card/40" : "bg-transparent opacity-40"} ${isSameDay(day, new Date()) ? "ring-1 ring-primary" : ""}`}>
                <div className="text-xs">{format(day, "d")}</div>
                <div className="mt-1 space-y-0.5">
                  {evts.slice(0, 3).map(e => (
                    <div key={e.id} className={`text-[10px] truncate text-foreground/90 px-1 py-0.5 rounded ${colors[e.type] || "bg-muted"} bg-opacity-30`}>
                      <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1 align-middle ${colors[e.type] || "bg-muted"}`} />{e.title}
                    </div>
                  ))}
                  {evts.length > 3 && <div className="text-[10px] text-muted-foreground">+{evts.length - 3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {Object.entries(colors).map(([k, c]) => (
          <div key={k} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${c}`} /><span className="capitalize">{k}</span></div>
        ))}
      </div>
    </>
  );
}
