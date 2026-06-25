import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { X } from "lucide-react";
import {
  DIARY_CALENDAR_DRAWER_CLOSE_LABEL,
  type DiaryCalendarEventDrawerViewModel,
} from "@/lib/diaryCalendarEventDrawerViewModel";

export interface DiaryCalendarEventDrawerProps {
  model: DiaryCalendarEventDrawerViewModel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function DiaryCalendarEventDrawer({
  model,
  open,
  onOpenChange,
}: DiaryCalendarEventDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg sm:mx-auto rounded-t-2xl"
        data-testid="diary-calendar-event-drawer"
        aria-label="Diary event details"
      >
        {model && (
          <>
            <SheetHeader className="text-left">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <SheetTitle className="text-base">
                    {model.title}
                  </SheetTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(model.occurredAtIso).toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <SheetClose
                  aria-label={DIARY_CALENDAR_DRAWER_CLOSE_LABEL}
                  className="rounded-full p-1 hover:bg-secondary transition"
                  data-testid="diary-calendar-event-drawer-close"
                >
                  <X className="h-4 w-4" aria-hidden />
                </SheetClose>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-border/50 bg-secondary/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {model.readOnlyLabel}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-border/40 bg-background/40 text-[10px] text-muted-foreground italic">
                  {model.derivedDisclaimer}
                </span>
              </div>
            </SheetHeader>

            <div className="mt-4 space-y-4">
              <DrawerSectionBlock
                testid="diary-calendar-event-drawer-summary"
                title={model.summary.title}
              >
                {model.noteSnippet && (
                  <p className="text-xs whitespace-pre-wrap break-words">
                    {model.noteSnippet}
                  </p>
                )}
                <FieldList fields={model.summary.fields} />
                {!model.noteSnippet && model.summary.fields.length === 0 && (
                  <EmptyLine>No summary available.</EmptyLine>
                )}
              </DrawerSectionBlock>

              <DrawerSectionBlock
                testid="diary-calendar-event-drawer-measurements"
                title={model.measurements.title}
              >
                <FieldList fields={model.measurements.fields} />
                {model.measurements.ecPreview &&
                  model.measurements.ecPreview.visible && (
                    <p
                      className="text-[11px] text-muted-foreground mt-1"
                      data-testid="diary-calendar-event-drawer-ec-preview"
                    >
                      <span className="font-medium text-foreground">
                        {model.measurements.ecPreview.label}:
                      </span>{" "}
                      {model.measurements.ecPreview.valueDisplay}
                      <span className="ml-1 italic">
                        ({model.measurements.ecPreview.disclaimer})
                      </span>
                    </p>
                  )}
                {model.measurements.fields.length === 0 &&
                  !model.measurements.ecPreview && (
                    <EmptyLine>No measurements recorded.</EmptyLine>
                  )}
              </DrawerSectionBlock>

              <DrawerSectionBlock
                testid="diary-calendar-event-drawer-plant-memory"
                title={model.plantMemory.title}
              >
                <FieldList fields={model.plantMemory.fields} />
                {model.plantMemory.fields.length === 0 && (
                  <EmptyLine>No plant memory captured.</EmptyLine>
                )}
              </DrawerSectionBlock>

              <DrawerSectionBlock
                testid="diary-calendar-event-drawer-attachments"
                title="Attachments"
              >
                <ul className="text-xs space-y-1">
                  <li
                    className="text-muted-foreground"
                    data-testid="diary-calendar-event-drawer-photo"
                  >
                    {model.attachments.photoLabel}
                  </li>
                  <li
                    className="text-muted-foreground"
                    data-testid="diary-calendar-event-drawer-sensor"
                  >
                    {model.attachments.sensorLabel}
                  </li>
                </ul>
              </DrawerSectionBlock>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerSectionBlock({
  title,
  testid,
  children,
}: {
  title: string;
  testid: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-xl border border-border/40 bg-secondary/20 p-3"
      data-testid={testid}
      aria-label={title}
    >
      <h3 className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
        {title}
      </h3>
      {children}
    </section>
  );
}

function FieldList({
  fields,
}: {
  fields: { label: string; value: string }[];
}) {
  if (fields.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {fields.map((f) => (
        <div key={f.label} className="contents">
          <dt className="text-muted-foreground">{f.label}</dt>
          <dd className="break-words">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground italic">{children}</p>;
}
