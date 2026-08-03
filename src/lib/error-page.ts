export type ErrorPageKind = "generic" | "supabase_initialization";

export interface ErrorPageOptions {
  kind?: ErrorPageKind;
  reference?: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderErrorPage(options: ErrorPageOptions = {}): string {
  const kind = options.kind ?? "generic";
  const heading =
    kind === "supabase_initialization"
      ? "Verdant couldn't connect to its data service"
      : "This page didn't load";
  const description =
    kind === "supabase_initialization"
      ? "This page is temporarily unavailable. No grow data was changed. Try again in a moment."
      : "Something went wrong on our end. You can try refreshing or head back home.";
  const reference = options.reference?.trim()
    ? `<details><summary>Technical details</summary><p class="reference">Error reference: <code>${escapeHtml(options.reference.trim())}</code></p></details>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(heading)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 32rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #111; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #d1d5db; }
      details { margin-top: 1.25rem; color: #6b7280; font-size: 0.8125rem; }
      summary { cursor: pointer; }
      .reference { margin: 0.5rem 0 0; }
      code { user-select: all; }
    </style>
  </head>
  <body>
    <main class="card" role="alert" aria-live="assertive">
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(description)}</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
      ${reference}
    </main>
  </body>
</html>`;
}
