import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import {
  GROW_HELP_REFERENCE_GROUPS,
  GROW_HELP_RELATED_RESOURCES,
} from "@/constants/growHelpToolkitReferences";
import { Link } from "@/lib/react-router-compat";

export default function GrowHelpAboutPanel() {
  return (
    <section aria-labelledby="grow-help-about-title" data-testid="grow-help-about-panel">
      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <h2 id="grow-help-about-title" className="font-display text-xl font-semibold">
            About this toolkit
          </h2>
          <CardDescription className="max-w-3xl leading-6">
            A private, client-side planning aid for nutrient recipes, canopy lighting, and cycle
            costs. It does not read sensors, control devices, promise a yield, or provide an
            official feeding chart.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-background/55 p-4">
              <dt className="font-semibold text-foreground">Local and private</dt>
              <dd className="mt-1 leading-6 text-muted-foreground">
                The toolkit saves its last inputs in this browser&apos;s localStorage. It has no
                backend, account, grow-data upload, live-reading, or device-control path. Calculator
                inputs are not sent to analytics.
              </dd>
            </div>

            <div className="rounded-lg border border-border/60 bg-background/55 p-4">
              <dt className="font-semibold text-foreground">Nutrient strength</dt>
              <dd className="mt-1 leading-6 text-muted-foreground">
                EC in mS/cm is the primary strength. PPM 500, 640, and 700 values are derived
                scales, so use the scale printed on your meter. Reservoir size means working
                solution volume, not the container&apos;s maximum capacity.
              </dd>
            </div>

            <div className="rounded-lg border border-border/60 bg-background/55 p-4">
              <dt className="font-semibold text-foreground">Light is a planning estimate</dt>
              <dd className="mt-1 leading-6 text-muted-foreground">
                Prefer fixture PPF in &micro;mol/s. Watts require user-entered efficacy and produce
                estimated PPF. Use canopy dimensions, not tent-wall dimensions. DLI, fixture count,
                canopy average, heatmap, and inverse-square results are models—not a PAR map. Verify
                the canopy with a PAR meter; inverse-square math is only an approximation.
              </dd>
            </div>

            <div className="rounded-lg border border-border/60 bg-background/55 p-4">
              <dt className="font-semibold text-foreground">Costs use honest inputs</dt>
              <dd className="mt-1 leading-6 text-muted-foreground">
                Electricity uses actual equipment draw, never equivalent-watt marketing claims. Cost
                per gram requires user-entered dried, saleable harvest weight—not wet weight.
                Comparison prices are user-entered; the toolkit supplies no market price or yield
                promise.
              </dd>
            </div>
          </dl>

          <p className="text-xs leading-5 text-muted-foreground">
            Any stage or crop range shown elsewhere in the toolkit is a typical starting reference,
            not a guarantee, diagnosis, or instruction to make an aggressive change.
          </p>

          <details className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
            <summary className="cursor-pointer select-none text-sm font-semibold text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
              Sources and method notes
            </summary>

            <div className="mt-4 space-y-4 text-xs leading-5 text-muted-foreground">
              <p>
                Sources were reviewed in 2026 as capability and formula references. The toolkit
                implements its own interface and copy, does not fetch these pages at runtime, and
                does not reproduce a trademarked feeding chart. External pages can change.
              </p>

              <div className="space-y-4" data-testid="grow-help-source-list">
                {GROW_HELP_REFERENCE_GROUPS.map((group) => (
                  <div key={group.title}>
                    <h3 className="font-semibold text-foreground">{group.title}</h3>
                    <ol className="mt-1 list-decimal space-y-1.5 pl-5">
                      {group.sources.map((source) => (
                        <li key={source.url}>
                          <span className="font-medium text-foreground">{source.label}: </span>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-all text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {source.url}
                          </a>
                          <span> — {source.method}</span>
                          {source.note ? <span> — {source.note}</span> : null}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>

              <p>
                The unavailable LumenCalculator hanging-height page is retained above for source
                transparency. The toolkit&apos;s inverse-square calculation is generic planning
                math, not a claim copied from that page and not a substitute for manufacturer data
                or a measured five-point PAR check.
              </p>
            </div>
          </details>

          <nav aria-labelledby="grow-help-related-title" data-testid="grow-help-related-resources">
            <h3 id="grow-help-related-title" className="font-display text-lg font-semibold">
              Continue planning with Verdant
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              These public references are separate tools. They do not receive or change this
              browser-local plan.
            </p>
            <ul className="mt-3 grid gap-3 md:grid-cols-3">
              {GROW_HELP_RELATED_RESOURCES.map((resource) => (
                <li key={resource.path} className="rounded-lg border border-border/60 p-4">
                  <Link to={resource.path} className="font-semibold text-primary hover:underline">
                    {resource.title}
                  </Link>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {resource.description}
                  </p>
                </li>
              ))}
            </ul>
          </nav>
        </CardContent>
      </Card>
    </section>
  );
}
