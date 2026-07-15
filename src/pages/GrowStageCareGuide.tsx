/**
 * GrowStageCareGuide — public searchable grow-stage care guide.
 *
 * Presents watering, nutrients, environment, and harvest checklists for
 * seedling, veg, and flower stages. Includes a live search filter and
 * stage/category tabs. Checklist state is local-only (no persistence,
 * no backend, no device control).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  CARE_CATEGORY_LABELS,
  CARE_CATEGORY_ORDER,
  GROW_STAGE_CARE_CHECKLIST,
  GROW_STAGE_CARE_FAQ,
  GROW_STAGE_LABELS,
  type CareCategory,
  type CareChecklistItem,
  type GrowStage,
} from "@/constants/growStageCareGuide";
import {
  VERDANT_GUIDES_BREADCRUMB_ITEMS,
  VERDANT_SITE_ORIGIN,
} from "@/constants/verdantSeoContent";
import {
  buildBreadcrumbListJsonLd,
  buildFaqPageJsonLd,
  safeJsonLdStringify,
} from "@/lib/seoStructuredData";

const PAGE_URL = `${VERDANT_SITE_ORIGIN}/guides/grow-stage-care-guide`;

type StageFilter = "all" | GrowStage;

const categoryClasses: Record<CareCategory, string> = {
  watering: "bg-blue-500/10 text-blue-700 hover:bg-blue-500/20",
  nutrients: "bg-green-500/10 text-green-700 hover:bg-green-500/20",
  environment: "bg-amber-500/10 text-amber-700 hover:bg-amber-500/20",
  harvest: "bg-purple-500/10 text-purple-700 hover:bg-purple-500/20",
};

function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function GrowStageCareGuide() {
  usePageSeo({
    title: "Grow stage care guide | Seedling, Veg, and Flower checklists | Verdant",
    description:
      "A searchable grow-stage care guide with watering, nutrients, environment, and harvest checklists for seedling, vegetative, and flower stages.",
    path: "/guides/grow-stage-care-guide",
  });

  useEffect(() => {
    const faq = buildFaqPageJsonLd({
      pageUrl: PAGE_URL,
      questions: GROW_STAGE_CARE_FAQ,
    });
    const crumbs = buildBreadcrumbListJsonLd({
      items: [
        ...VERDANT_GUIDES_BREADCRUMB_ITEMS,
        { name: "Grow stage care guide", url: PAGE_URL },
      ],
    });
    const faqScript = document.createElement("script");
    faqScript.type = "application/ld+json";
    faqScript.setAttribute("data-page-ldjson", "grow-stage-care-guide-faq");
    faqScript.text = safeJsonLdStringify(faq);
    document.head.appendChild(faqScript);
    const crumbScript = document.createElement("script");
    crumbScript.type = "application/ld+json";
    crumbScript.setAttribute("data-page-ldjson", "grow-stage-care-guide-breadcrumb");
    crumbScript.text = safeJsonLdStringify(crumbs);
    document.head.appendChild(crumbScript);
    return () => {
      faqScript.remove();
      crumbScript.remove();
    };
  }, []);

  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [activeCategory, setActiveCategory] = useState<CareCategory | "all">("all");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const normalizedQuery = useMemo(() => normalizeSearch(query), [query]);

  const filteredItems = useMemo(() => {
    return GROW_STAGE_CARE_CHECKLIST.filter((item) => {
      if (stageFilter !== "all" && item.stage !== stageFilter) return false;
      if (activeCategory !== "all" && item.category !== activeCategory) return false;
      if (normalizedQuery.length === 0) return true;
      const haystack = normalizeSearch(`${item.label} ${item.detail} ${GROW_STAGE_LABELS[item.stage]} ${CARE_CATEGORY_LABELS[item.category]}`);
      return haystack.includes(normalizedQuery);
    });
  }, [stageFilter, activeCategory, normalizedQuery]);

  const grouped = useMemo(() => {
    const map = new Map<GrowStage, Map<CareCategory, CareChecklistItem[]>>();
    for (const item of filteredItems) {
      if (!map.has(item.stage)) map.set(item.stage, new Map());
      const stageMap = map.get(item.stage)!;
      if (!stageMap.has(item.category)) stageMap.set(item.category, []);
      stageMap.get(item.category)!.push(item);
    }
    return map;
  }, [filteredItems]);

  const toggleChecked = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visibleStages: ReadonlyArray<GrowStage> = useMemo(() => {
    return (stageFilter === "all" ? ["seedling", "veg", "flower"] : [stageFilter]) as ReadonlyArray<GrowStage>;
  }, [stageFilter]);

  return (
    <main
      data-testid="grow-stage-care-guide-page"
      className="min-h-screen bg-background text-foreground"
    >
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <Link to="/welcome" aria-label="Verdant Grow Diary home">
          <BrandLogo size="md" showText />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/guides" className="text-muted-foreground hover:text-foreground">
            All guides
          </Link>
          <Link to="/pricing" className="text-muted-foreground hover:text-foreground">
            Pricing
          </Link>
        </nav>
      </header>

      <article className="px-6 pt-6 pb-16 max-w-3xl mx-auto">
        <p className="text-xs uppercase tracking-[0.18em] text-primary/80 font-medium">
          Grower Guide
        </p>
        <h1 className="mt-3 font-display text-3xl md:text-4xl font-bold tracking-tight leading-tight">
          Grow-stage care guide
        </h1>
        <p className="mt-5 text-lg text-muted-foreground">
          A searchable checklist for seedling, vegetative, and flower stages.
          Filter by stage and category, search for any task, and check items off
          as you work. The guidance is stage-based, not calendar-based, because
          cultivars move at different speeds.
        </p>

        {/* Search + filters */}
        <section className="mt-10 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search checklists, e.g. 'watering', 'pH', 'harvest'"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
              aria-label="Search care checklist"
              data-testid="grow-stage-care-search"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground mr-1">Stage:</span>
            <button
              type="button"
              onClick={() => setStageFilter("all")}
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                stageFilter === "all"
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              All
            </button>
            {(["seedling", "veg", "flower"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStageFilter(s)}
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  stageFilter === s
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted"
                }`}
              >
                {GROW_STAGE_LABELS[s]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground mr-1">Category:</span>
            <button
              type="button"
              onClick={() => setActiveCategory("all")}
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors ${
                activeCategory === "all"
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              All
            </button>
            {CARE_CATEGORY_ORDER.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors ${
                  activeCategory === cat
                    ? "border-transparent bg-primary text-primary-foreground"
                    : `border-border ${categoryClasses[cat]}`
                }`}
              >
                {CARE_CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          {filteredItems.length === 0 && (
            <p className="text-sm text-muted-foreground" data-testid="grow-stage-care-empty">
              No checklist items match your search. Try a broader term or clear the filters.
            </p>
          )}
        </section>

        {/* Checklists */}
        <section className="mt-10 space-y-10">
          {visibleStages.map((stage) => {
            const stageMap = grouped.get(stage);
            if (!stageMap || stageMap.size === 0) return null;
            return (
              <div key={stage} data-testid={`grow-stage-care-${stage}`}>
                <h2 className="font-display text-2xl font-semibold mb-4">
                  {GROW_STAGE_LABELS[stage]}
                </h2>
                <div className="space-y-6">
                  {CARE_CATEGORY_ORDER.map((cat) => {
                    const items = stageMap.get(cat);
                    if (!items || items.length === 0) return null;
                    return (
                      <div key={`${stage}-${cat}`}>
                        <div className="flex items-center gap-2 mb-3">
                          <Badge className={categoryClasses[cat]}>
                            {CARE_CATEGORY_LABELS[cat]}
                          </Badge>
                        </div>
                        <ul className="space-y-3">
                          {items.map((item) => (
                            <li
                              key={item.id}
                              className="flex items-start gap-3 rounded-lg border border-border/60 p-4"
                            >
                              <Checkbox
                                id={item.id}
                                checked={checked.has(item.id)}
                                onCheckedChange={() => toggleChecked(item.id)}
                                className="mt-0.5"
                                aria-label={`Mark ${item.label} as done`}
                              />
                              <div className="flex-1">
                                <label
                                  htmlFor={item.id}
                                  className={`block text-sm font-medium ${
                                    checked.has(item.id) ? "line-through text-muted-foreground" : ""
                                  }`}
                                >
                                  {item.label}
                                </label>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {item.detail}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        {/* FAQ */}
        <section className="mt-14">
          <h2 className="font-display text-xl md:text-2xl font-semibold mb-4">
            Common questions
          </h2>
          <Accordion type="single" collapsible className="w-full">
            {GROW_STAGE_CARE_FAQ.map((entry, i) => (
              <AccordionItem key={entry.question} value={`faq-${i}`}>
                <AccordionTrigger className="text-left">
                  {entry.question}
                </AccordionTrigger>
                <AccordionContent>{entry.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* Related links */}
        <section className="mt-12 rounded-lg border border-border/60 p-5">
          <h2 className="font-display text-lg font-semibold">Keep reading</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link
                to="/guides/cannabis-plant-care"
                className="underline hover:text-foreground text-muted-foreground"
              >
                Cannabis plant care FAQ
              </Link>
            </li>
            <li>
              <Link
                to="/guides/grow-room-vpd-tracker"
                className="underline hover:text-foreground text-muted-foreground"
              >
                How to track VPD in a grow room
              </Link>
            </li>
            <li>
              <Link
                to="/guides"
                className="underline hover:text-foreground text-muted-foreground"
              >
                All grower guides
              </Link>
            </li>
            <li>
              <Link
                to="/welcome"
                className="underline hover:text-foreground text-muted-foreground"
              >
                See how Verdant works
              </Link>
            </li>
          </ul>
        </section>

        <section
          data-testid="guide-demo-cta"
          className="mt-10 rounded-lg border border-border/60 p-6 bg-card/40"
        >
          <h2 className="font-display text-lg md:text-xl font-semibold">
            See a real One-Tent Loop before signing up
          </h2>
          <p className="mt-2 text-sm md:text-base text-muted-foreground">
            Walk through how Verdant connects a grow, tent, plant, Quick Log,
            timeline, sensor snapshot, cautious AI review, and grower-approved
            action queue.
          </p>
          <div className="mt-4">
            <Link
              to="/welcome"
              data-testid="guide-demo-cta-link"
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Explore the public demo
            </Link>
          </div>
        </section>
      </article>
    </main>
  );
}
