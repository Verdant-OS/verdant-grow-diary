import { createServerFn } from "@tanstack/react-start";
import {
  summariseSeoBuildArtifacts,
  type SeoArtifactCheck,
  type SeoBuildArtifactReport,
} from "./seoBuildArtifactRules";

/**
 * inspectSeoBuildArtifacts — reports whether the postbuild SEO artifacts
 * (dist/seo-manifest.json and every staticSocialRouteDocuments output document)
 * exist in the current build output.
 *
 * Read-only. Never writes, never regenerates. If the build output cannot be
 * read (dev server, worker runtime without dist/), the report is BLOCKED.
 */
export const inspectSeoBuildArtifacts = createServerFn({ method: "GET" }).handler(
  async (): Promise<SeoBuildArtifactReport> => {
    const checkedAt = new Date().toISOString();
    const distDir = process.env["SEO_DIST_DIR"] ?? "dist";

    let fs: typeof import("node:fs");
    let path: typeof import("node:path");
    try {
      fs = await import("node:fs");
      path = await import("node:path");
    } catch (error) {
      return summariseSeoBuildArtifacts({
        distDir,
        distDirExists: false,
        blockedReason: `Filesystem access unavailable in this runtime: ${
          error instanceof Error ? error.message : String(error)
        }`,
        checkedAt,
      });
    }

    const resolvedDist = path.resolve(distDir);
    const distDirExists = fs.existsSync(resolvedDist);
    if (!distDirExists) {
      return summariseSeoBuildArtifacts({ distDir: resolvedDist, distDirExists: false, checkedAt });
    }

    const { STATIC_PUBLIC_OUTPUT_DOCUMENTS } = await import("./build/staticPublicSeoDocuments");

    const check = (file: string, producer: string): SeoArtifactCheck => {
      const full = path.join(resolvedDist, file);
      try {
        const stats = fs.statSync(full);
        return { file, producer, present: stats.isFile(), bytes: stats.size };
      } catch {
        return { file, producer, present: false, bytes: null };
      }
    };

    const seen = new Set<string>();
    const documents: SeoArtifactCheck[] = [];
    for (const document of STATIC_PUBLIC_OUTPUT_DOCUMENTS) {
      if (seen.has(document.fileName)) continue;
      seen.add(document.fileName);
      documents.push(check(document.fileName, "capture-ssr-head-snapshots"));
    }

    return summariseSeoBuildArtifacts({
      distDir: resolvedDist,
      distDirExists: true,
      manifest: check("seo-manifest.json", "generate-seo-artifacts"),
      documents,
      checkedAt,
    });
  },
);
