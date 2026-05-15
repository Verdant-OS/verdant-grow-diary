import { useMemo, useState } from "react";
import { useVerdant, EventType } from "@/store/verdant";
import { PageHeader } from "@/components/ui-bits";
import { Calendar as CalIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { addMonths, endOfMonth, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, endOfWeek, addDays } from "date-fns";
import { eventDot, eventChip } from "@/lib/eventColors";

interface DayItem {
  id: string; plantId?: string; date: string; type: EventType; title: string;
  source: "diary" | "event"; sourceId?: string;
}

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

  const all: DayItem[] = [
    ...v.events.map(e => ({ id: e.id, plantId: e.plantId, date: e.date, type: e.type, title: e.title, source: "event" as const, sourceId: e.sourceId })),
    ...v.diary.map(d => ({ id: d.id, plantId: d.plantId, date: d.timestamp, type: d.type as EventType, title: d.note, source: "diary" as const })),
  ];

  return (
    <>
      <PageHeader title="Calendar" subtitle="Color-coded grow timeline · click any day for details" icon={CalIcon}
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
            const items = all.filter(e => isSameDay(new Date(e.date), day));
            const isToday = isSameDay(day, new Date());
            const cell = (
              <button type="button"
                className={`w-full text-left min-h-[80px] rounded-lg p-1.5 border border-border/40 transition hover:border-primary/40 ${isSameMonth(day, cursor) ? "bg-card/40" : "bg-transparent opacity-40"} ${isToday ? "ring-1 ring-primary" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs">{format(day, "d")}</span>
                  {isToday && <span className="text-[9px] uppercase tracking-wider text-primary">Today</span>}
                </div>
                <div className="mt-1 space-y-0.5">
                  {items.slice(0, 3).map(e => (
                    <div key={e.id} className="text-[10px] truncate text-foreground/90 px-1 py-0.5 rounded bg-card/60">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1 align-middle ${eventDot[e.type]}`} />{e.title}
                    </div>
                  ))}
                  {items.length > 3 && <div className="text-[10px] text-muted-foreground">+{items.length - 3} more</div>}
                </div>
              </button>
            );
            if (items.length === 0) return <div key={day.toISOString()}>{cell}</div>;
            return (
              <Popover key={day.toISOString()}>
                <PopoverTrigger asChild>{cell}</PopoverTrigger>
                <PopoverContent className="w-80 p-3 space-y-2 max-h-80 overflow-y-auto">
                  <div className="font-display font-semibold text-sm">{format(day, "EEE, MMM d")}</div>
                  <div className="space-y-1.5">
                    {items.map(it => {
                      const plant = it.plantId ? v.plants.find(p => p.id === it.plantId) : null;
                      const href = it.source === "diary"
                        ? `/app/diary/${it.id}`
                        : it.sourceId ? `/app/diary/${it.sourceId}` : (plant ? `/app/plants/${plant.id}` : "/app/diary");
                      return (
                        <Link key={it.id} to={href} className="block rounded-md border border-border/40 p-2 hover:border-primary/40 transition">
                          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                            <Badge variant="outline" className={"capitalize text-[10px] " + eventChip[it.type]}>{it.type}</Badge>
                            {plant && <span className="text-[10px] text-muted-foreground">{plant.name}</span>}
                            <span className="text-[10px] text-muted-foreground ml-auto">{format(new Date(it.date), "HH:mm")}</span>
                          </div>
                          <div className="text-xs truncate">{it.title}</div>
                        </Link>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            );
          })}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {Object.entries(eventDot).map(([k, c]) => (
          <div key={k} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${c}`} /><span className="capitalize">{k}</span></div>
        ))}
      </div>
    </>
  );
}
