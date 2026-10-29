import { Link } from "@/lib/react-router-compat";

import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  PUBLIC_GROW_GUIDE_LEGAL_LINE,
  type PublicGrowGuideArticle as Article,
} from "@/lib/publicGrowGuideArticles";

const sectionClass = "mt-8 max-w-3xl";

/** Presenter for the four public article guides. Stores nothing and makes no requests. */
export default function PublicGrowGuideArticle({ guide }: { readonly guide: Article }) {
  usePageSeo({
    title: `${guide.title} | Verdant Grow Diary`,
    description: guide.description,
    path: guide.path,
  });

  const cta = (location: "top" | "article" | "footer") => (
    <div className="mt-4 rounded-lg border border-emerald-900/15 bg-emerald-50 p-4">
      <Link
        className="inline-flex min-h-11 items-center rounded-md bg-emerald-900 px-4 text-sm font-semibold text-white"
        to={guide.ctaHref}
        data-cta-location={location}
      >
        Keep this record in Verdant →
      </Link>
      <p className="mt-2 text-sm">{guide.ctaNote}</p>
    </div>
  );

  return (
    <div
      data-testid="public-grow-guide-article"
      data-guide-slug={guide.slug}
      className="min-h-screen bg-[#f6f8f5] text-emerald-950"
    >
      <header className="border-b border-emerald-900/10 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <a href="https://verdantgrowdiary.com/" aria-label="Verdant Grow Diary">
            <BrandLogo />
          </a>
          <nav aria-label="Breadcrumb" className="text-sm">
            <ol className="flex flex-wrap gap-1">
              <li>
                <a className="underline" href="https://verdantgrowdiary.com/">
                  Home
                </a>{" "}
                <span aria-hidden="true">›</span>
              </li>
              <li>
                <Link to="/guides" className="underline">
                  Guides
                </Link>{" "}
                <span aria-hidden="true">›</span>
              </li>
              <li aria-current="page">{guide.breadcrumbName}</li>
            </ol>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <article>
          <h1 className="font-display text-3xl font-semibold leading-tight md:text-4xl">
            {guide.h1}
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7">{guide.intro}</p>

          <section id="quick-answer" className="mt-6 max-w-3xl" aria-labelledby="quick-answer-h">
            <h2 id="quick-answer-h" className="text-2xl font-semibold">
              Quick answer
            </h2>
            <div className="mt-2 rounded-xl bg-white p-4 shadow-sm">
              <p className="leading-7">{guide.quickAnswer}</p>
            </div>
            {cta("top")}
          </section>

          {guide.sections.map((section) => (
            <section key={section.id} id={section.id} className={sectionClass}>
              <h2 className="text-2xl font-semibold">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-2 leading-7">
                  {paragraph}
                </p>
              ))}
              {section.bullets ? (
                <ul className="mt-2 list-disc space-y-1 pl-6">
                  {section.bullets.map((bullet) => (
                    <li key={bullet} className="leading-7">
                      {bullet}
                    </li>
                  ))}
                </ul>
              ) : null}
              {section.links?.map((link) => (
                <p key={link.to} className="mt-2">
                  <Link className="underline" to={link.to}>
                    {link.label}
                  </Link>
                </p>
              ))}
            </section>
          ))}

          <section id="keep-the-record" className={sectionClass}>
            <h2 className="text-2xl font-semibold">Keep the record in Verdant</h2>
            <p className="mt-2 leading-7">
              Notes in a phone or on paper get lost between runs. Verdant keeps them on each
              plant&apos;s timeline, next to your photos, feeds and sensor readings.
            </p>
            {cta("article")}
          </section>

          <section id="faq" className={sectionClass}>
            <h2 className="text-2xl font-semibold">FAQ</h2>
            {guide.faq.map((entry) => (
              <details key={entry.question} className="mt-3 rounded-md border bg-white p-3">
                <summary className="min-h-11 cursor-pointer font-medium">{entry.question}</summary>
                <p className="mt-2 leading-7">{entry.answer}</p>
              </details>
            ))}
          </section>

          <section id="keep-reading" className={sectionClass}>
            <h2 className="text-2xl font-semibold">Keep reading</h2>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              {guide.keepReading.map((link) => (
                <li key={link.to}>
                  <Link className="underline" to={link.to}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </article>
      </main>

      <footer id="sources" className="border-t border-emerald-900/10 bg-white px-4 py-8">
        <div className="mx-auto max-w-5xl">
          {guide.sources.length > 0 ? (
            <>
              <h2 className="text-lg font-semibold">Sources</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {guide.sources.map((source) => (
                  <li key={source.url} className="break-words">
                    {source.label}:{" "}
                    <a
                      className="underline [overflow-wrap:anywhere]"
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {source.url}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {cta("footer")}
          <p className="mt-4 text-sm">{PUBLIC_GROW_GUIDE_LEGAL_LINE}</p>
        </div>
      </footer>
    </div>
  );
}
