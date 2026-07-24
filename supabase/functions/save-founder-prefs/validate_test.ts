import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validatePrefs, isSafeHttpsUrl } from "./validate.ts";

const base = {
  display_name: "Alice",
  display_style: "custom_name" as const,
  show_on_wall: true,
  optional_link: "https://example.com",
};

Deno.test("validatePrefs — happy path returns normalized value", () => {
  const r = validatePrefs(base);
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value, base);
});

Deno.test("validatePrefs — empty optional_link becomes null", () => {
  const r = validatePrefs({ ...base, optional_link: "" });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.optional_link, null);
});

Deno.test("validatePrefs — null display_name and null optional_link accepted", () => {
  const r = validatePrefs({ ...base, display_name: null, optional_link: null });
  assertEquals(r.ok, true);
});

Deno.test("validatePrefs — rejects non-object body", () => {
  assertEquals(validatePrefs(null).ok, false);
  assertEquals(validatePrefs("nope").ok, false);
  assertEquals(validatePrefs(42).ok, false);
});

Deno.test("validatePrefs — rejects unknown display_style", () => {
  const r = validatePrefs({ ...base, display_style: "admin" });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "invalid_display_style");
});

Deno.test("validatePrefs — rejects non-boolean show_on_wall", () => {
  const r = validatePrefs({ ...base, show_on_wall: "true" });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "invalid_show_on_wall");
});

Deno.test("validatePrefs — rejects overlong display_name", () => {
  const r = validatePrefs({ ...base, display_name: "a".repeat(61) });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "display_name_too_long");
});

Deno.test("validatePrefs — rejects control chars in display_name", () => {
  for (const bad of ["Alice\u0000", "A\nB", "A\tB", "A\u007fB", "A\u0085B"]) {
    const r = validatePrefs({ ...base, display_name: bad });
    assertEquals(r.ok, false);
    if (!r.ok) assertEquals(r.error, "display_name_control_chars");
  }
});

Deno.test("validatePrefs — rejects non-https / dangerous schemes", () => {
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html,<script>",
    "http://example.com",
    "/relative",
    "example.com",
    " https://example.com",
    "https://example.com/ hax",
  ]) {
    const r = validatePrefs({ ...base, optional_link: bad });
    assertEquals(r.ok, false, `expected reject for ${bad}`);
    if (!r.ok) assertEquals(r.error, "optional_link_not_https");
  }
});

Deno.test("validatePrefs — rejects optional_link over 300 chars", () => {
  const link = "https://example.com/" + "a".repeat(300);
  const r = validatePrefs({ ...base, optional_link: link });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "optional_link_too_long");
});

Deno.test("isSafeHttpsUrl — direct checks", () => {
  assertEquals(isSafeHttpsUrl("https://a.example"), true);
  assertEquals(isSafeHttpsUrl("http://a.example"), false);
  assertEquals(isSafeHttpsUrl(""), false);
  assertEquals(isSafeHttpsUrl("https://"), false);
});
