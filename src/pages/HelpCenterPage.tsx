/**
 * Presenter for /help and a section hub. Copy comes from HelpCenterContent.
 */
import { Link } from "@/lib/react-router-compat";
import BrandLogo from "@/components/BrandLogo";
import { usePageSeo } from "@/hooks/usePageSeo";
import { HelpCenterContent, type HelpSection } from "@/lib/helpCenterContent";

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

function Crumbs({ section }: { readonly section: HelpSection | null }) {
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

export default function HelpCenterPage({ section }: { readonly section: HelpSection | null }) {
  const title = section ? section.titleTag : HelpCenterContent.homeTitle();
  const description = section ? section.covers : HelpCenterContent.homeDescription();
  const path = section ? section.path : HelpCenterContent.homePath();

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
          <Crumbs section={section} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {section ? <Hub section={section} /> : <Home />}
      </main>
      <LegalFooter />
    </div>
  );
}

function Home() {
  return (
    <>
      <h1 className="font-display text-3xl font-semibold leading-tight">Help</h1>
      <p className="mt-4 text-base leading-7">
        Need a person? Email{" "}
        <a className={tapLink} href="mailto:support@verdantgrowdiary.com">
          support@verdantgrowdiary.com
        </a>{" "}
        or use the{" "}
        <Link to="/contact" className={tapLink}>
          contact form
        </Link>
        . Typical reply time is 1–2 business days.
      </p>
      <p className="mt-4 text-base leading-7">
        These pages answer one question at a time. For growing know-how (symptoms, nutrients,
        lighting), use the{" "}
        <Link to="/guides" className={tapLink}>
          grower guides
        </Link>
        .
      </p>
      <h2 className="mt-8 text-xl font-semibold">All sections</h2>
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
      <h2 className="mt-8 text-xl font-semibold">Sources</h2>
      <p className="mt-2 text-base leading-7">
        <Link to="/contact" className={tapLink}>
          Contact
        </Link>
      </p>
    </>
  );
}

function Hub({ section }: { readonly section: HelpSection }) {
  return (
    <>
      <h1 className="font-display text-3xl font-semibold leading-tight">{section.title}</h1>
      <p className="mt-4 text-base leading-7">
        <span className="font-semibold">Covers</span> {section.covers}
      </p>
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
