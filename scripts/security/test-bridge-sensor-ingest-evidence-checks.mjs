#!/usr/bin/env node
/**
 * Self-test for scripts/security/bridge-sensor-ingest-evidence-checks.mjs.
 *
 * A green evidence lane is only meaningful if the detectors provably fire.
 * For every check: take the real repo file, remove the protection the check
 * pins (for required patterns) or inject the forbidden construct (for
 * forbidden patterns), and assert the check FAILS on the tampered content.
 * Also asserts a missing trust-chain file is a failure, never a skip.
 *
 * Mirrors the pattern of scripts/security/test-static-client-secret-scan.mjs:
 * the package script runs this self-test first, then the real checks.
 */
import {
  CHECKS,
  MIGRATION_CHECKS,
  FILES,
  readRepoFile,
  bridgeMigrationCorpus,
  runExpectations,
  runAllChecks,
  stripSqlComments,
} from "./bridge-sensor-ingest-evidence-checks.mjs";

let failures = 0;
function report(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} selftest ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function globalized(re) {
  return new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
}

/** Content snippets that satisfy each forbidden pattern, keyed by check id. */
const FORBIDDEN_INJECTIONS = {
  E2: "const r = await deps.lookupBridgeToken(rawToken);",
  E12: "const spoofed = body.user_id;",
  E20: 'await supabase.from("bridge_tokens").insert({ token: plaintext });',
  E24: 'const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); // SERVICE_ROLE',
  E33: 'const auth = await authenticateBearer(req.headers.get("Authorization") ?? "", deps); // vbt_',
};

// --- file-based checks ----------------------------------------------------
for (const check of CHECKS) {
  const rel = FILES[check.file];
  const real = readRepoFile(rel);
  if (real === null) {
    report(`${check.id} fixture`, false, `${rel} missing; cannot exercise detector`);
    continue;
  }

  for (const ex of check.expect) {
    if (ex.must) {
      const tampered = real.replace(globalized(ex.re), "/* TAMPERED */");
      const stillDetects = runExpectations(tampered, check.expect).length > 0;
      report(`${check.id} detects removal of ${ex.re}`, stillDetects);
    } else {
      const injection = FORBIDDEN_INJECTIONS[check.id];
      if (!injection) {
        report(`${check.id} forbidden-injection fixture`, false, "no injection snippet defined");
        continue;
      }
      const tampered = `${real}\n${injection}\n`;
      const detects = runExpectations(tampered, check.expect).length > 0;
      report(`${check.id} detects injection of forbidden construct`, detects);
    }
  }

  if (check.custom) {
    const tampered = `${real}\nexport const driftedBehavior = () => 42;\n`;
    const detects = check.custom(tampered).length > 0;
    report(`${check.id} custom detector fires on added executable code`, detects);
  }
}

// --- migration checks -----------------------------------------------------
// Each check gets a tamper per failure mode: protections removed AND the
// regression statement that would undo them injected after the real history.
const { corpus } = bridgeMigrationCorpus();
const MIGRATION_TAMPERS = {
  E29: [
    (c) =>
      c.replace(/ALTER TABLE public\.bridge_tokens ENABLE ROW LEVEL SECURITY;/g, "-- TAMPERED"),
    (c) => `${c}\nALTER TABLE public.bridge_tokens DISABLE ROW LEVEL SECURITY;\n`,
  ],
  E30: [
    (c) => `${c}\nGRANT SELECT ON public.bridge_tokens TO anon;\n`,
    // No TO clause: PostgreSQL defaults the policy to PUBLIC.
    (c) =>
      `${c}\nCREATE POLICY "sneaky_default" ON public.bridge_tokens FOR SELECT USING (true);\n`,
    (c) =>
      `${c}\nCREATE POLICY "sneaky_public" ON public.bridge_tokens FOR SELECT TO PUBLIC USING (true);\n`,
    // Mixed role lists in every order, on both CREATE and ALTER.
    (c) =>
      `${c}\nCREATE POLICY "sneaky_mixed" ON public.bridge_tokens FOR SELECT TO authenticated, anon USING (true);\n`,
    (c) =>
      `${c}\nCREATE POLICY "sneaky_extra_role" ON public.bridge_tokens FOR SELECT TO authenticated, service_role USING (true);\n`,
    // Role-changing ALTER POLICY in a later migration.
    (c) => `${c}\nALTER POLICY "Users view own bridge_tokens" ON public.bridge_tokens TO PUBLIC;\n`,
    (c) => `${c}\nALTER POLICY "Users view own bridge_tokens" ON public.bridge_tokens TO anon;\n`,
    (c) =>
      `${c}\nALTER POLICY "Users view own bridge_tokens" ON public.bridge_tokens TO authenticated, anon;\n`,
    (c) =>
      `${c}\nALTER POLICY "Users view own bridge_tokens" ON public.bridge_tokens TO anon, authenticated;\n`,
    (c) =>
      `${c}\nALTER POLICY "Users view own bridge_tokens" ON public.bridge_tokens TO authenticated, PUBLIC;\n`,
  ],
  E31: [(c) => c.replace(/token_hash text NOT NULL UNIQUE,/g, "token text NOT NULL,")],
  E34: [
    (c) =>
      c.replace(
        /REVOKE EXECUTE ON FUNCTION public\.bump_bridge_token_usage\(UUID, INTEGER\) FROM PUBLIC, anon, authenticated;/g,
        "-- TAMPERED",
      ),
    (c) =>
      `${c}\nGRANT EXECUTE ON FUNCTION public.bump_bridge_token_usage(UUID, INTEGER) TO authenticated;\n`,
  ],
};
for (const check of MIGRATION_CHECKS) {
  const tampers = MIGRATION_TAMPERS[check.id];
  if (!tampers?.length) {
    report(`${check.id} migration tamper fixture`, false, "no tamper defined");
    continue;
  }
  tampers.forEach((tamper, i) => {
    // Mirror the production loop: comment-stripped for regex expectations,
    // raw for custom (which strips internally).
    const tampered = tamper(corpus);
    const failures = runExpectations(stripSqlComments(tampered), check.expect);
    if (check.custom) failures.push(...check.custom(tampered));
    report(`${check.id} detects tampered migration corpus (#${i + 1})`, failures.length > 0);
  });
}

// --- false-positive guards: benign content must NOT trip E30 --------------
{
  const e30 = MIGRATION_CHECKS.find((c) => c.id === "E30");
  const evaluate = (content) => [
    ...runExpectations(stripSqlComments(content), e30.expect),
    ...e30.custom(content),
  ];

  const untouched = evaluate(corpus);
  report(
    "E30 passes the real untampered migration corpus",
    untouched.length === 0,
    untouched.join("; "),
  );

  const benign = `${corpus}\nALTER POLICY "Users view own bridge_tokens" ON public.bridge_tokens RENAME TO "Owners view own bridge_tokens";\nALTER POLICY "Users update own bridge_tokens" ON public.bridge_tokens USING (auth.uid() = user_id);\n`;
  const spurious = evaluate(benign);
  report(
    "E30 stays quiet on benign RENAME TO / role-preserving ALTER POLICY",
    spurious.length === 0,
    spurious.join("; "),
  );

  const commented = `${corpus}\n-- ALTER POLICY "Users view own bridge_tokens" ON public.bridge_tokens TO PUBLIC;\n/* ALTER POLICY "Users view own bridge_tokens" ON public.bridge_tokens TO anon; */\n-- GRANT SELECT ON public.bridge_tokens TO anon;\n`;
  const ghost = evaluate(commented);
  report(
    "E30 stays quiet on commented-out ALTER POLICY / GRANT regressions",
    ghost.length === 0,
    ghost.join("; "),
  );
}

// --- missing files are failures, never skips ------------------------------
const missingFileRun = runAllChecks({
  readFile: () => null,
  migrations: () => ({ files: [], corpus: "" }),
});
report(
  "missing trust-chain files fail closed",
  missingFileRun.length > 0 && missingFileRun.every((r) => r.ok === false),
);

console.log(
  `bridge-sensor-ingest evidence self-test: ${failures === 0 ? "all detectors fire" : `${failures} detector(s) dead`}`,
);
if (failures > 0) process.exit(1);
