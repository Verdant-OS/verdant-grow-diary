import { anyApi, componentsGeneric } from "convex/server";
import { convexTest } from "convex-test";

import type { ComponentApi } from "../convex/components/abuse_guard/_generated/component";
import componentSchema from "../convex/components/abuse_guard/schema";
import rootSchema from "../convex/schema";

const rootModules = import.meta.glob(["../convex/**/*.ts", "!../convex/components/**/*.ts"]);
const componentModules = import.meta.glob("../convex/components/abuse_guard/**/*.ts");

export const HASH_A = "a".repeat(64);
export const HASH_B = "b".repeat(64);

export const rootInternal = anyApi as any;

export const mountedComponents = componentsGeneric() as unknown as {
  abuse_guard: ComponentApi<"abuse_guard"> & {
    isolationProbe: {
      attemptParentTableRead: any;
      countAllBuckets: any;
      getFirstBucketId: any;
      listBuckets: any;
    };
  };
};

export function createHarness() {
  const t = convexTest(rootSchema, rootModules);
  t.registerComponent("abuse_guard", componentSchema, componentModules);
  return t;
}
