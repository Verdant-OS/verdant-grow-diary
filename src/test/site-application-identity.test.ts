/** Public JSON-LD must identify this Web Grow OS and its own publisher. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { SITE_SOFTWARE_APPLICATION_JSON_LD } from "@/lib/build/siteSoftwareApplicationJsonLd";

/**
 * Evaluate the root head's actual data expressions without booting its auth,
 * router or providers. The application payload stays the real imported object;
 * no test graph or scripts list stands in for what the root emits.
 */
function emittedRootJsonLd(): Array<Record<string, unknown>> {
  const source = ts.createSourceFile(
    "__root.tsx",
    readFileSync(resolve(__dirname, "../routes/__root.tsx"), "utf8"),
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TSX,
  );
  const declarations = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations]);
  const constants = ["SITE_URL", "SITE_NAME", "SITE_DESCRIPTION", "SITE_IMAGE", "SITE_JSON_LD"]
    .map((name) => {
      const declaration = declarations.find((node) => node.name.getText(source) === name);
      if (!declaration?.initializer) throw new Error(`Missing root head constant: ${name}`);
      return `const ${name} = ${declaration.initializer.getText(source)};`;
    })
    .join("\n");
  const scriptArrays: ts.Expression[] = [];
  function visit(node: ts.Node): void {
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === "scripts") {
      scriptArrays.push(node.initializer);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (scriptArrays.length !== 1) throw new Error("Expected one root head scripts array");
  const code = ts.transpileModule(`${constants}\n(${scriptArrays[0].getText(source)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const scripts = runInNewContext(
    code,
    { SITE_SOFTWARE_APPLICATION_JSON_LD },
    { timeout: 1000 },
  ) as Array<{ type: string; children: string }>;
  return scripts
    .filter((script) => script.type === "application/ld+json")
    .map((script) => JSON.parse(script.children))
    .flatMap((document) => document["@graph"] ?? [document]);
}

describe("root SSR application identity", () => {
  it("emits one application for Verdant Grow Diary on its own Web origin", () => {
    const applications = emittedRootJsonLd().filter(
      (node) => node["@type"] === "SoftwareApplication",
    );
    expect(applications).toHaveLength(1);
    expect(applications[0]).toMatchObject({
      "@id": "https://verdantgrowdiary.com/#app",
      name: "Verdant Grow Diary",
      url: "https://verdantgrowdiary.com",
      operatingSystem: "Web",
    });
  });

  it("resolves the application publisher to the same emitted organization as the website", () => {
    const nodes = emittedRootJsonLd();
    const organization = nodes.find((node) => node["@type"] === "Organization");
    const application = nodes.find((node) => node["@type"] === "SoftwareApplication");
    const website = nodes.find((node) => node["@type"] === "WebSite");
    expect(organization).toMatchObject({
      "@id": "https://verdantgrowdiary.com/#organization",
      name: "Verdant Grow Diary",
    });
    expect(application?.publisher).toEqual({ "@id": organization?.["@id"] });
    expect(application?.publisher).toEqual(website?.publisher);
  });

  it("describes the indoor Grow OS and preserves the grower's decision role", () => {
    const application = emittedRootJsonLd().find((node) => node["@type"] === "SoftwareApplication");
    const description = application?.description;
    expect(description).toEqual(expect.any(String));
    for (const concept of [
      /Verdant Grow Diary/,
      /Grow OS/,
      /indoor cultivation/i,
      /source-labeled sensor readings/i,
      /cautious AI/i,
      /grower-approved decisions/i,
    ]) {
      expect(description).toMatch(concept);
    }
  });
});
