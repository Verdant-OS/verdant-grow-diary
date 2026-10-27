/**
 * Manual IndexNow submission. Not wired to CI or postbuild.
 * Run only after a production deploy is confirmed:
 *   INDEXNOW_SUBMIT=1 node scripts/indexnow-submit.mjs
 * The key file is public by IndexNow's design.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const KEY = "a7c3e91b4d8f2e6c0b5a19d47e83f012";
const HOST = "verdantgrowdiary.com";
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const SITEMAP = new URL("../public/sitemap.xml", import.meta.url);

export function indexNowSubmitEnabled(env = process.env) {
  return env.INDEXNOW_SUBMIT === "1";
}

export function sitemapLocs(xml) {
  return [...String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => match[1].trim())
    .filter((loc) => loc.length > 0);
}

export async function submitIndexNow(env = process.env, fetchImpl = fetch) {
  if (!indexNowSubmitEnabled(env)) {
    console.log("IndexNow submit skipped. Set INDEXNOW_SUBMIT=1 after a production deploy.");
    return { submitted: false, count: 0 };
  }
  const xml = readFileSync(SITEMAP, "utf8");
  const urlList = sitemapLocs(xml);
  const response = await fetchImpl("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: HOST,
      key: KEY,
      keyLocation: KEY_LOCATION,
      urlList,
    }),
  });
  const body = await response.text();
  console.log(`IndexNow ${response.status} ${urlList.length} urls`);
  if (!response.ok) {
    console.error(body.slice(0, 500));
    throw new Error(`IndexNow submit failed: ${response.status}`);
  }
  return { submitted: true, count: urlList.length };
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  submitIndexNow()
    .then((result) => {
      if (!result.submitted) process.exit(0);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
