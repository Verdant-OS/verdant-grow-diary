import { test, expect } from "vitest";
test("check import.meta.env", () => {
  const meta = import.meta as any;
  console.log("typeof meta.env:", typeof meta.env);
  if (meta.env) {
    meta.env.VITE_TEST = "hello";
    console.log("meta.env.VITE_TEST:", meta.env.VITE_TEST);
    expect(meta.env.VITE_TEST).toBe("hello");
  } else {
    console.log("meta.env is undefined");
  }
});
