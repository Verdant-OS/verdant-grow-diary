import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  PostGrowReflectionPreviewSectionRow,
  PostGrowReflectionPreviewViewModel,
} from "@/lib/ai/postGrowReflectionPreviewViewModel";

interface Props {
  viewModel: PostGrowReflectionPreviewViewModel;
}

function SectionBlock({ section }: { section: PostGrowReflectionPreviewSectionRow }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs font-medium uppercase text-muted-foreground">{section.label}</div>
      {section.kind === "paragraph" ? (
        <p className="mt-2 text-sm">{section.paragraph}</p>
      ) : (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {(section.items ?? []).map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PostGrowReflectionPreviewCard({ viewModel }: Props) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{viewModel.title}</CardTitle>
          {viewModel.labels.map((label) => (
            <Badge key={label.key} variant="outline">
              {label.text}
            </Badge>
          ))}
        </div>
        <CardDescription>{viewModel.subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {viewModel.status === "empty" ? (
          <p className="text-sm text-muted-foreground">{viewModel.emptyMessage}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                Scenario: <code>{viewModel.scenarioId}</code>
              </span>
              <span>·</span>
              <span>{viewModel.scenarioLabel}</span>
              <span>·</span>
              <span>
                Grow: <code>{viewModel.growId}</code>
              </span>
            </div>
            <div>
              <Badge variant="secondary">{viewModel.confidenceLabel}</Badge>
            </div>
            <div className="grid gap-3">
              {viewModel.sections.map((section) => (
                <SectionBlock key={section.key} section={section} />
              ))}
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-xs font-medium uppercase text-muted-foreground">
                Validation options
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{viewModel.validationOptions.label}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PostGrowReflectionPreviewCard;
