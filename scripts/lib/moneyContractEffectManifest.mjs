/**
 * Pure logic for introspect-money-contract-effect.mjs, split out so it is
 * importable and testable without executing psql, touching the filesystem, or
 * calling process.exit. The CLI script owns all I/O; this module owns only
 * parsing and comparison.
 */

/**
 * Derive the asserted contract from the migration's own SQL text.
 *
 * Parses OUR OWN committed migration, not user input — but still returns an
 * empty function_names set rather than throwing on zero matches, so the
 * caller can decide how loudly to fail. A parser that silently matched
 * nothing would otherwise produce a confident, empty, meaningless report.
 */
export function parseContractSql(sql) {
  const functionNames = new Set();
  for (const m of sql.matchAll(
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z0-9_]+)\s*\(/gi,
  )) {
    functionNames.add(m[1].toLowerCase());
  }

  // Signature-level EXECUTE grants, so the report can say which role the
  // migration intends to be the ONLY executor.
  const grants = [];
  for (const m of sql.matchAll(
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.([a-z0-9_]+)\s*\(([^)]*)\)\s*TO\s+([a-z_]+)/gi,
  )) {
    grants.push({
      name: m[1].toLowerCase(),
      arg_types: m[2]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      grantee: m[3].toLowerCase(),
    });
  }

  const tables = new Set();
  for (const m of sql.matchAll(
    /(?:REVOKE|GRANT)[\s\S]{0,80}?ON\s+TABLE\s+public\.([a-z0-9_]+)/gi,
  )) {
    tables.add(m[1].toLowerCase());
  }

  return {
    function_names: [...functionNames].sort(),
    tables: [...tables].sort(),
    intended_execute_grants: grants,
  };
}

/**
 * A safe SQL literal array from identifiers. Throws rather than returning
 * unsafe SQL — names here originate from our own committed migration, but the
 * guard stays because it is the only thing standing between a regex mismatch
 * and string-building a query.
 */
export function sqlNameArray(names) {
  for (const n of names) {
    if (!/^[a-z0-9_]+$/.test(n)) {
      throw new Error(`refusing unsafe identifier from manifest: ${n}`);
    }
  }
  return `ARRAY[${names.map((n) => `'${n}'`).join(",")}]::text[]`;
}

/**
 * The introspection query: ALL overloads of the target function names, plus
 * the target tables.
 *
 * aclexplode over COALESCE(acl, acldefault(...)) matters: a NULL acl means
 * the built-in default, which for a function INCLUDES EXECUTE for PUBLIC.
 * Reading NULL as "no grants" would report a wide-open function as locked
 * down — the same trap this repo's security-hardening scripts already
 * document and guard against.
 */
export function buildIntrospectionSql(contract) {
  const functionsArray = sqlNameArray(contract.function_names);
  const tablesArray = sqlNameArray(contract.tables.length ? contract.tables : ["__none__"]);
  return `
    SELECT json_build_object(
      'functions', (
        SELECT coalesce(json_agg(f ORDER BY f->>'signature'), '[]'::json) FROM (
          SELECT json_build_object(
            'signature',        p.oid::regprocedure::text,
            'name',             p.proname,
            'security_definer', p.prosecdef,
            'config',           p.proconfig,
            'owner',            pg_get_userbyid(p.proowner),
            'body_sha',         md5(pg_get_functiondef(p.oid)),
            'body_len',         length(pg_get_functiondef(p.oid)),
            'definition',       pg_get_functiondef(p.oid),
            'acl',              (
              SELECT coalesce(json_agg(json_build_object(
                'grantee',   CASE WHEN a.grantee = 0 THEN 'PUBLIC'
                                  ELSE pg_get_userbyid(a.grantee) END,
                'privilege', a.privilege_type)), '[]'::json)
              FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            )
          ) AS f
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname = ANY(${functionsArray})
        ) s
      ),
      'tables', (
        SELECT coalesce(json_agg(t ORDER BY t->>'name'), '[]'::json) FROM (
          SELECT json_build_object(
            'name',  c.relname,
            'owner', pg_get_userbyid(c.relowner),
            'rls',   c.relrowsecurity,
            'acl',   (
              SELECT coalesce(json_agg(json_build_object(
                'grantee',   CASE WHEN a.grantee = 0 THEN 'PUBLIC'
                                  ELSE pg_get_userbyid(a.grantee) END,
                'privilege', a.privilege_type)), '[]'::json)
              FROM aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
            )
          ) AS t
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relkind = 'r'
            AND c.relname = ANY(${tablesArray})
        ) s
      )
    )::text;`;
}

/**
 * State observed vs asserted -- explicitly WITHOUT deciding pass/fail. Every
 * entry is an observation a human (or a later gate) can judge.
 */
export function compare(contract, observed) {
  const notes = [];
  for (const name of contract.function_names) {
    const overloads = observed.functions.filter((f) => f.name === name);
    if (overloads.length === 0) {
      notes.push({
        object: name,
        observation: "absent",
        detail: "no function of this name exists in public",
      });
      continue;
    }
    if (overloads.length > 1) {
      notes.push({
        object: name,
        observation: "multiple_overloads",
        detail: `${overloads.length} overloads present. The documented failure mode is an export reintroducing an earlier overload beside the current one.`,
        signatures: overloads.map((o) => o.signature),
      });
    }
    for (const o of overloads) {
      const executors = o.acl
        .filter((a) => a.privilege === "EXECUTE")
        .map((a) => a.grantee)
        .sort();
      const intended = contract.intended_execute_grants
        .filter((g) => g.name === name)
        .map((g) => g.grantee);
      notes.push({
        object: o.signature,
        observation: "execute_grantees",
        detail: executors.join(", ") || "(none)",
        intended_by_migration: [...new Set(intended)].join(", ") || "(unstated)",
        security_definer: o.security_definer,
        search_path: (o.config ?? []).join(" ") || "(unset)",
      });
    }
  }
  for (const t of observed.tables) {
    const grants = t.acl.map((a) => `${a.grantee}:${a.privilege}`).sort();
    notes.push({
      object: `table ${t.name}`,
      observation: "grants",
      detail: grants.join(", ") || "(none)",
      rls: t.rls,
    });
  }
  return notes;
}
