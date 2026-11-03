/**
 * HTML for a retryable 503. Router redirects with status 503 have a null
 * body, so the worker replaces that response with this page.
 */
export class ServiceUnavailablePage {
  static html(): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Cultivar reference unavailable | Verdant</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; background: #111; color: #fff; border: 0; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>The cultivar reference could not be loaded</h1>
      <p>The library did not answer this request. Nothing was saved. Try again in a moment.</p>
      <button type="button" onclick="location.reload()">Try again</button>
    </main>
  </body>
</html>`;
  }

  /** Keep a non-503 response. A 503 becomes this page, with no-store and no Location. */
  static present(response: Response): Response {
    if (response.status !== 503) return response;
    const headers = new Headers(response.headers);
    headers.delete("location");
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set("cache-control", "no-store");
    if (!headers.has("retry-after")) headers.set("retry-after", "30");
    return new Response(ServiceUnavailablePage.html(), { status: 503, headers });
  }
}
