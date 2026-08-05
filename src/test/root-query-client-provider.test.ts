import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT_ROUTE = readFileSync(resolve(__dirname, "../routes/__root.tsx"), "utf8");

describe("root query client provider", () => {
  it("provides the router-owned QueryClient before the authenticated application tree mounts", () => {
    expect(ROOT_ROUTE).toMatch(
      /import\s*\{[^}]*QueryClientProvider[^}]*\}\s*from\s*["']@tanstack\/react-query["']/,
    );
    expect(ROOT_ROUTE).toMatch(
      /function RootComponent\(\)\s*\{[\s\S]*?const \{ queryClient \} = Route\.useRouteContext\(\);[\s\S]*?<QueryClientProvider client=\{queryClient\}>[\s\S]*?<AuthProvider /,
    );
  });
});
