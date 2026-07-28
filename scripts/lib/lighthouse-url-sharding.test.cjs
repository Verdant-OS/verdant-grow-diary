"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const {
  extractSitemapUrls,
  loadSitemapUrls,
  normalizeSitemapUrls,
  resolveLighthouseShardConfig,
  selectLighthouseShard,
} = require("./lighthouse-url-sharding.cjs");

const REPOSITORY_ROOT = path.resolve(__dirname, "..", "..");
const SITEMAP_PATH = path.resolve(REPOSITORY_ROOT, "public", "sitemap.xml");
const WORKFLOW_PATH = path.resolve(REPOSITORY_ROOT, ".github", "workflows", "lighthouse-ci.yml");

function loadConfiguredLighthouse(shardIndex, shardCount) {
  const output = execFileSync(
    process.execPath,
    [
      "-e",
      'const config = require("./lighthouserc.cjs"); process.stdout.write(JSON.stringify(config));',
    ],
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        LHCI_SHARD_INDEX: String(shardIndex),
        LHCI_SHARD_COUNT: String(shardCount),
      },
    },
  );

  return JSON.parse(output);
}

test("defaults to one shard so local Lighthouse runs still audit every URL", () => {
  const urls = ["https://example.com/", "https://example.com/guides"];
  const shard = resolveLighthouseShardConfig({});

  assert.deepEqual(shard, { index: 0, count: 1 });
  assert.deepEqual(selectLighthouseShard(urls, shard), urls);
});

test("four shards cover the real sitemap exactly once without changing URL order", () => {
  const allUrls = loadSitemapUrls(SITEMAP_PATH);
  const shards = Array.from({ length: 4 }, (_, index) =>
    selectLighthouseShard(allUrls, { index, count: 4 }),
  );
  const selectedUrls = shards.flat();

  assert.ok(allUrls.length >= 4);
  assert.equal(selectedUrls.length, allUrls.length);
  assert.deepEqual(new Set(selectedUrls), new Set(allUrls));
  assert.equal(new Set(selectedUrls).size, allUrls.length);
  assert.ok(
    Math.max(...shards.map((shard) => shard.length)) -
      Math.min(...shards.map((shard) => shard.length)) <=
      1,
  );

  for (const [index, shard] of shards.entries()) {
    assert.deepEqual(
      shard,
      allUrls.filter((_, position) => position % 4 === index),
    );
  }
});

test("lighthouserc applies each shard without weakening run counts or audit budgets", () => {
  const allUrls = loadSitemapUrls(SITEMAP_PATH);
  const configs = Array.from({ length: 4 }, (_, index) => loadConfiguredLighthouse(index, 4));
  const selectedUrls = configs.flatMap((config) => config.ci.collect.url);

  assert.equal(selectedUrls.length, allUrls.length);
  assert.deepEqual(new Set(selectedUrls), new Set(allUrls));
  assert.equal(new Set(selectedUrls).size, allUrls.length);

  for (const config of configs) {
    assert.equal(config.ci.collect.numberOfRuns, 3);
    assert.deepEqual(config.ci.collect.settings.onlyCategories, [
      "performance",
      "seo",
      "accessibility",
      "best-practices",
    ]);
    assert.deepEqual(config.ci.assert.assertions["largest-contentful-paint"], [
      "error",
      { maxNumericValue: 2500, aggregationMethod: "median" },
    ]);
    assert.deepEqual(config.ci.assert.assertions["categories:seo"], [
      "error",
      { minScore: 0.9, aggregationMethod: "median" },
    ]);
  }
});

test("workflow defines all four parallel shards and passes their coordinates to Lighthouse", () => {
  const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
  const matrixIndexes = Array.from(workflow.matchAll(/^\s+- index: (\d+)$/gm)).map((match) =>
    Number(match[1]),
  );

  assert.deepEqual(matrixIndexes, [0, 1, 2, 3]);
  assert.match(workflow, /^\s+max-parallel: 4$/m);
  assert.match(workflow, /^\s+timeout-minutes: 25$/m);
  assert.match(workflow, /^\s+run: node --test scripts\/lib\/lighthouse-url-sharding\.test\.cjs$/m);
  assert.match(workflow, /^\s+run: npm install -g @lhci\/cli@0\.15\.1$/m);
  assert.match(workflow, /^\s+LHCI_SHARD_INDEX: \$\{\{ matrix\.shard\.index \}\}$/m);
  assert.match(workflow, /^\s+LHCI_SHARD_COUNT: 4$/m);
});

test("selection is deterministic and preserves round-robin boundary assignments", () => {
  const urls = ["a", "b", "c", "d", "e"];
  const first = selectLighthouseShard(urls, { index: 0, count: 2 });
  const second = selectLighthouseShard(urls, { index: 1, count: 2 });

  assert.deepEqual(first, ["a", "c", "e"]);
  assert.deepEqual(second, ["b", "d"]);
  assert.deepEqual(selectLighthouseShard(urls, { index: 0, count: 2 }), first);
  assert.deepEqual(selectLighthouseShard(urls, { index: 1, count: 2 }), second);
});

test("parses valid environment values and rejects incomplete or invalid shard settings", async (t) => {
  assert.deepEqual(
    resolveLighthouseShardConfig({
      LHCI_SHARD_INDEX: "3",
      LHCI_SHARD_COUNT: "4",
    }),
    { index: 3, count: 4 },
  );

  const invalidCases = [
    [{ LHCI_SHARD_INDEX: "0" }, /must be set together/],
    [{ LHCI_SHARD_COUNT: "4" }, /must be set together/],
    [{ LHCI_SHARD_INDEX: "", LHCI_SHARD_COUNT: "4" }, /non-negative integer string/],
    [{ LHCI_SHARD_INDEX: "-1", LHCI_SHARD_COUNT: "4" }, /non-negative integer string/],
    [{ LHCI_SHARD_INDEX: "1.5", LHCI_SHARD_COUNT: "4" }, /non-negative integer string/],
    [{ LHCI_SHARD_INDEX: "0", LHCI_SHARD_COUNT: "0" }, /must be at least 1/],
    [{ LHCI_SHARD_INDEX: "4", LHCI_SHARD_COUNT: "4" }, /must be less than/],
  ];

  for (const [environment, expectedError] of invalidCases) {
    await t.test(JSON.stringify(environment), () => {
      assert.throws(() => resolveLighthouseShardConfig(environment), expectedError);
    });
  }
});

test("fails closed for malformed URL lists and impossible shard configurations", () => {
  assert.throws(() => normalizeSitemapUrls([]), /at least one URL/);
  assert.throws(
    () => normalizeSitemapUrls(["https://example.com", " https://example.com "]),
    /duplicate/,
  );
  assert.throws(() => normalizeSitemapUrls(["https://example.com", ""]), /non-empty string/);
  assert.throws(() => selectLighthouseShard(["a", "b"], { index: 0, count: 3 }), /must not exceed/);
  assert.throws(
    () => selectLighthouseShard(["a", "b"], { index: -1, count: 2 }),
    /between 0 and count - 1/,
  );
  assert.throws(() => selectLighthouseShard(["a", "b"], { index: 0, count: 0 }), /at least 1/);
});

test("extracts and trims sitemap locations while rejecting empty sitemap content", () => {
  assert.deepEqual(
    extractSitemapUrls(`
      <urlset>
        <url><loc> https://example.com/ </loc></url>
        <url><loc>https://example.com/guides</loc></url>
      </urlset>
    `),
    ["https://example.com/", "https://example.com/guides"],
  );
  assert.throws(() => extractSitemapUrls("<urlset></urlset>"), /at least one URL/);
  assert.throws(() => extractSitemapUrls(null), /must be a string/);
});
