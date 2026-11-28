/**
 * Presenter for /help, a section hub and a topic page. Copy comes from HelpCenterContent.
 */
import { Link } from "@/lib/react-router-compat";
import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  HelpCenterContent,
  type HelpArticle,
  type HelpArticleBlock,
  type HelpRun,
  type HelpSection,
} from "@/lib/helpCenterContent";

const tapLink = "inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline";

function LegalFooter() {
  return (
    <footer className="border-t border-border/40 px-4 py-8 text-sm text-muted-foreground">
      <nav aria-label="Legal" className="mx-auto flex max-w-3xl flex-wrap gap-x-4 gap-y-2">
        <Link to="/terms" className={tapLink}>
          Terms of Service
        </Link>
        <Link to="/privacy" className={tapLink}>
          Privacy Policy
        </Link>
        <Link to="/refund" className={tapLink}>
          Refund Policy
        </Link>
      </nav>
    </footer>
  );
}

function Crumbs({
  section,
  article,
}: {
  readonly section: HelpSection | null;
  readonly article: HelpArticle | null;
}) {
  if (article) {
    return (
      <nav aria-label="Breadcrumb" className="text-sm">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link to={HelpCenterContent.homePath()} className={tapLink}>
              Help
            </Link>
            <span aria-hidden="true"> → </span>
          </li>
          <li>
            <Link to={article.sectionPath} className={tapLink}>
              {article.sectionTitle}
            </Link>
            <span aria-hidden="true"> → </span>
          </li>
          <li aria-current="page">{article.title}</li>
        </ol>
      </nav>
    );
  }
  return (
    <nav aria-label="Breadcrumb" className="text-sm">
      <ol className="flex flex-wrap items-center gap-1">
        {section ? (
          <li>
            <Link to={HelpCenterContent.homePath()} className={tapLink}>
              Help
            </Link>
            <span aria-hidden="true"> → </span>
          </li>
        ) : null}
        <li aria-current="page">{section ? section.title : "Help"}</li>
      </ol>
    </nav>
  );
}

export default function HelpCenterPage({
  section,
  article = null,
}: {
  readonly section: HelpSection | null;
  readonly article?: HelpArticle | null;
}) {
  const title = article
    ? article.titleTag
    : section
      ? section.titleTag
      : HelpCenterContent.homeTitle();
  const description = article
    ? article.description
    : section
      ? section.covers
      : HelpCenterContent.homeDescription();
  const path = article ? article.path : section ? section.path : HelpCenterContent.homePath();

  usePageSeo({ title, description, path });

  return (
    <div data-testid="help-center-page" className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link
            to="/"
            aria-label="Verdant Grow Diary home"
            className="inline-flex min-h-11 items-center"
          >
            <BrandLogo size="md" showText />
          </Link>
          <Crumbs section={section} article={article} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {article ? <Article article={article} /> : section ? <Hub section={section} /> : <Home />}
      </main>
      <LegalFooter />
    </div>
  );
}

function HelpRunView({ run }: { readonly run: HelpRun }) {
  if (run.kind === "text") return run.text;
  if (run.href.startsWith("/")) {
    return (
      <Link to={run.href} className={tapLink}>
        {run.text}
      </Link>
    );
  }
  return (
    <a className={tapLink} href={run.href}>
      {run.text}
    </a>
  );
}

function Home() {
  const [title, support, guides, sectionsHeading, sourcesHeading, sources] =
    HelpCenterContent.homeBlocks();
  return (
    <>
      <h1 className="font-display text-3xl font-semibold leading-tight">
        {title.runs.map((run, index) => (
          <HelpRunView key={index} run={run} />
        ))}
      </h1>
      <p className="mt-4 text-base leading-7">
        {support.runs.map((run, index) => (
          <HelpRunView key={index} run={run} />
        ))}
      </p>
      <p className="mt-4 text-base leading-7">
        {guides.runs.map((run, index) => (
          <HelpRunView key={index} run={run} />
        ))}
      </p>
      <h2 className="mt-8 text-xl font-semibold">
        {sectionsHeading.runs.map((run, index) => (
          <HelpRunView key={index} run={run} />
        ))}
      </h2>
      <ul className="mt-3 space-y-2">
        {HelpCenterContent.sections().map((entry) => (
          <li key={entry.slug} className="text-base leading-7">
            <Link to={entry.path} className={tapLink}>
              {entry.title}
            </Link>
            : {entry.homeOneLiner}
          </li>
        ))}
      </ul>
      <h2 className="mt-8 text-xl font-semibold">
        {sourcesHeading.runs.map((run, index) => (
          <HelpRunView key={index} run={run} />
        ))}
      </h2>
      <p className="mt-2 text-base leading-7">
        {sources.runs.map((run, index) => (
          <HelpRunView key={index} run={run} />
        ))}
      </p>
    </>
  );
}

function Hub({ section }: { readonly section: HelpSection }) {
  return (
    <>
      <h1 className="font-display text-3xl font-semibold leading-tight">{section.title}</h1>
      <p className="mt-4 text-base leading-7">{HelpCenterContent.coversClause(section.covers)}</p>
      {section.topics.length > 0 ? (
        <ul className="mt-6 space-y-2">
          {section.topics.map((topic) => (
            <li key={topic.href}>
              <Link to={topic.href} className={tapLink}>
                {topic.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function ArticleBlockView({ block }: { readonly block: HelpArticleBlock }) {
  if (block.tag === "ol") {
    return (
      <ol className="mt-4 list-decimal space-y-2 pl-6 text-base leading-7">
        {block.items.map((runs, index) => (
          <li key={index}>
            {runs.map((run, runIndex) => (
              <HelpRunView key={runIndex} run={run} />
            ))}
          </li>
        ))}
      </ol>
    );
  }
  const runs = block.runs.map((run, index) => <HelpRunView key={index} run={run} />);
  if (block.tag === "h1") {
    return <h1 className="font-display text-3xl font-semibold leading-tight">{runs}</h1>;
  }
  if (block.tag === "h2") return <h2 className="mt-8 text-xl font-semibold">{runs}</h2>;
  return <p className="mt-4 text-base leading-7">{runs}</p>;
}

function Article({ article }: { readonly article: HelpArticle }) {
  return (
    <article>
      {article.blocks.map((block, index) => (
        <ArticleBlockView key={index} block={block} />
      ))}
    </article>
  );
}
