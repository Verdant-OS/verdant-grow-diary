#!/usr/bin/env node
/**
 * Verdant SEO Monitoring v1 — Google Search Console OAuth helper.
 *
 * Local-only OAuth 2.0 flow for authorizing read-only Search Console
 * access. Never commits or prints the refresh token by default.
 *
 * Env:
 *   GSC_CLIENT_ID      (required)
 *   GSC_CLIENT_SECRET  (required)
 *   GSC_REDIRECT_URI   (default: http://localhost:53682/oauth2callback)
 *   GSC_SITE_URL       (optional, echoed into token file for convenience)
 *
 * Flags:
 *   --print-github-secret-instructions   Print instructions for adding
 *                                        the refresh token to GitHub
 *                                        Actions secrets (value stays
 *                                        redacted unless --reveal is
 *                                        also passed on the same host).
 *   --reveal                             Print the refresh token to
 *                                        stdout. Off by default.
 *
 * Writes:
 *   .seo/gsc-token.local.json  (gitignored)
 */
import { createServer } from "node:http";
import { writeFileSync, mkdirSync, existsSync, readFileSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_PATH = resolve(process.cwd(), ".seo/gsc-token.local.json");
const GITIGNORE_PATH = resolve(process.cwd(), ".gitignore");
const DEFAULT_REDIRECT = "http://localhost:53682/oauth2callback";

function ensureGitignoreEntry() {
  const line = ".seo/";
  if (!existsSync(GITIGNORE_PATH)) {
    writeFileSync(GITIGNORE_PATH, `${line}\n`);
    return;
  }
  const current = readFileSync(GITIGNORE_PATH, "utf8");
  if (!current.split(/\r?\n/).some((l) => l.trim() === line || l.trim() === ".seo")) {
    appendFileSync(GITIGNORE_PATH, `\n# Verdant SEO monitoring — local OAuth token cache\n${line}\n`);
  }
}

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`ERROR: ${name} is required (do not paste in chat — export locally).`);
    process.exit(2);
  }
  return v;
}

function buildAuthUrl({ clientId, redirectUri }) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPE);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  return u.toString();
}

async function exchangeCode({ clientId, clientSecret, redirectUri, code }) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Token exchange failed: ${r.status} ${text.slice(0, 200)}`);
  }
  return r.json();
}

function waitForCode(redirectUri) {
  const url = new URL(redirectUri);
  const port = Number(url.port || 80);
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer((req, res) => {
      const reqUrl = new URL(req.url, redirectUri);
      const code = reqUrl.searchParams.get("code");
      const err = reqUrl.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><meta charset=utf-8><title>Verdant GSC OAuth</title>` +
          `<body style="font:14px system-ui;padding:24px;max-width:640px">` +
          (code
            ? `<h1>Authorization received</h1><p>You can close this tab and return to your terminal.</p>`
            : `<h1>Authorization failed</h1><pre>${err ?? "no code"}</pre>`) +
          `</body>`,
      );
      server.close();
      if (code) resolvePromise(code);
      else rejectPromise(new Error(`OAuth error: ${err ?? "no code"}`));
    });
    server.listen(port, "127.0.0.1");
    server.on("error", rejectPromise);
  });
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const clientId = need("GSC_CLIENT_ID");
  const clientSecret = need("GSC_CLIENT_SECRET");
  const redirectUri = process.env.GSC_REDIRECT_URI || DEFAULT_REDIRECT;
  const siteUrl = process.env.GSC_SITE_URL || null;

  ensureGitignoreEntry();

  const authUrl = buildAuthUrl({ clientId, redirectUri });
  console.log("Open this URL in a browser signed into the GSC-owning Google account:\n");
  console.log(authUrl + "\n");
  console.log(`Waiting for redirect on ${redirectUri} ...`);

  const code = await waitForCode(redirectUri);
  const tokens = await exchangeCode({ clientId, clientSecret, redirectUri, code });

  mkdirSync(dirname(TOKEN_PATH), { recursive: true });
  const payload = {
    obtained_at: new Date().toISOString(),
    scope: SCOPE,
    site_url: siteUrl,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
    token_type: tokens.token_type,
  };
  writeFileSync(TOKEN_PATH, JSON.stringify(payload, null, 2), { mode: 0o600 });

  console.log(`\nToken written to ${TOKEN_PATH} (gitignored).`);
  if (!tokens.refresh_token) {
    console.warn(
      "WARNING: no refresh_token returned. Revoke the app under Google Account permissions and re-run to force consent.",
    );
  }

  if (args.has("--print-github-secret-instructions")) {
    console.log("\n--- GitHub Actions secrets checklist ---");
    console.log("Add these as repository secrets (Settings → Secrets and variables → Actions):");
    console.log("  GSC_CLIENT_ID       (from your Google Cloud OAuth client)");
    console.log("  GSC_CLIENT_SECRET   (from your Google Cloud OAuth client)");
    console.log("  GSC_REFRESH_TOKEN   (from .seo/gsc-token.local.json)");
    console.log("  GSC_SITE_URL        (e.g. https://verdantgrowdiary.com/)");
    if (args.has("--reveal")) {
      console.log("\nRefresh token (paste into GSC_REFRESH_TOKEN secret):");
      console.log(tokens.refresh_token ?? "(missing — re-run consent flow)");
    } else {
      console.log(
        "\nRefresh token is REDACTED. Re-run with --reveal to print it, or open .seo/gsc-token.local.json manually.",
      );
    }
  }
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
