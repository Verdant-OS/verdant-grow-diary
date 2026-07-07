/**
 * /glossary — cannabis breeding, cultivation, and phenotype glossary.
 *
 * Alphabetized, searchable, category-filterable. Work-focused reference
 * content only: no medical/legal/cultivation instructions, no marketing hero,
 * no AI, no Action Queue, no automation, no device control, no sensor ingest.
 */
import { useMemo, useState } from "react";
import {
  GLOSSARY_CATEGORIES,
  GLOSSARY_DISCLAIMER,
  GLOSSARY_TERMS,
  type GlossaryCategory,
  type GlossaryTerm,
} from "@/constants/glossaryTerms";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function firstLetter(t: string): string {
  const c = t.trim().charAt(0).toUpperCase();
  return c >= "A" && c <= "Z" ? c : "#";
}

function slugFor(letter: string): string {
  return `glossary-letter-${letter}`;
}

export default function Glossary() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<GlossaryCategory | "All">("All");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GLOSSARY_TERMS.filter((t) => {
      if (category !== "All" && t.category !== category) return false;
      if (!q) return true;
      return (
        t.term.toLowerCase().includes(q) ||
        t.definition.toLowerCase().includes(q)
      );
    });
  }, [query, category]);

  const grouped = useMemo(() => {
    const map = new Map<string, GlossaryTerm[]>();
    for (const t of filtered) {
      const letter = firstLetter(t.term);
      const arr = map.get(letter) ?? [];
      arr.push(t);
      map.set(letter, arr);
    }
    return map;
  }, [filtered]);

  const activeLetters = new Set(grouped.keys());

  return (
    <main
      data-testid="glossary-page"
      className="container mx-auto max-w-4xl px-4 py-6"
    >
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Cannabis glossary</h1>
        <p className="text-sm text-muted-foreground">{GLOSSARY_DISCLAIMER}</p>
      </header>

      <section className="mt-4 space-y-3">
        <label className="block text-sm">
          <span className="sr-only">Search glossary</span>
          <input
            type="search"
            data-testid="glossary-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search terms and definitions…"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
          />
        </label>

        <div
          data-testid="glossary-categories"
          className="flex flex-wrap gap-1.5 text-xs"
        >
          {(["All", ...GLOSSARY_CATEGORIES] as const).map((c) => {
            const active = c === category;
            return (
              <button
                key={c}
                type="button"
                data-testid={`glossary-category-${c}`}
                onClick={() => setCategory(c as GlossaryCategory | "All")}
                className={`rounded-full border px-3 py-1 ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground"
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>

        <nav
          data-testid="glossary-alphabet-nav"
          aria-label="Jump to letter"
          className="flex flex-wrap gap-1 text-xs"
        >
          {ALPHABET.map((letter) => {
            const enabled = activeLetters.has(letter);
            return (
              <a
                key={letter}
                href={enabled ? `#${slugFor(letter)}` : undefined}
                aria-disabled={!enabled}
                data-testid={`glossary-jump-${letter}`}
                className={`rounded border px-2 py-1 font-medium ${
                  enabled
                    ? "border-border bg-background text-foreground hover:bg-muted"
                    : "cursor-not-allowed border-border/40 text-muted-foreground/50"
                }`}
              >
                {letter}
              </a>
            );
          })}
        </nav>
      </section>

      {filtered.length === 0 ? (
        <p
          data-testid="glossary-empty"
          className="mt-6 text-sm text-muted-foreground"
        >
          No terms match “{query}”.
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {ALPHABET.filter((l) => grouped.has(l)).map((letter) => (
            <section
              key={letter}
              id={slugFor(letter)}
              data-testid={`glossary-section-${letter}`}
            >
              <h2 className="mb-2 text-lg font-semibold text-muted-foreground">
                {letter}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {grouped.get(letter)!.map((t) => (
                  <li
                    key={t.term}
                    data-testid={`glossary-term-${t.term}`}
                    className="rounded-lg border border-border bg-card p-3"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-sm font-semibold">{t.term}</h3>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t.category}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-foreground/90">
                      {t.definition}
                    </p>
                    {t.seeAlso && t.seeAlso.length > 0 && (
                      <p
                        data-testid={`glossary-seealso-${t.term}`}
                        className="mt-2 text-xs text-muted-foreground"
                      >
                        See also:{" "}
                        {t.seeAlso.map((s, i) => (
                          <span key={s}>
                            <button
                              type="button"
                              onClick={() => setQuery(s)}
                              className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                            >
                              {s}
                            </button>
                            {i < t.seeAlso!.length - 1 ? ", " : ""}
                          </span>
                        ))}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
