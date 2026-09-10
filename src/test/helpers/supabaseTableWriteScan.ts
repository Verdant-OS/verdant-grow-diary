/**
 * Receiver-provenance scan for Supabase table mutations.
 *
 * Regexes of the form `from("sensor_readings").insert` miss aliased builders:
 *
 *     const readings = supabase.from("sensor_readings");
 *     await readings.insert(row);
 *
 * This helper walks a TypeScript AST, follows `.from(table)` through chained
 * calls and identifier bindings, and reports insert/update/delete/upsert.
 * It is a forbidden-construct scan, not a config-resolution check.
 */
import ts from "typescript";

export const SUPABASE_WRITE_METHODS = ["insert", "update", "delete", "upsert"] as const;

export type SupabaseWriteMethod = (typeof SUPABASE_WRITE_METHODS)[number];

export type SupabaseTableWriteFinding = {
  table: string;
  method: SupabaseWriteMethod;
};

const WRITE_METHODS = new Set<string>(SUPABASE_WRITE_METHODS);

function unwrap(node: ts.Node | undefined): ts.Node | undefined {
  let current = node;
  while (current) {
    if (
      ts.isAsExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isAwaitExpression(current)
    ) {
      current = current.expression;
      continue;
    }
    break;
  }
  return current;
}

function literalString(node: ts.Node | undefined): string | null {
  const n = unwrap(node);
  if (!n) return null;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  return null;
}

function callMethodName(call: ts.CallExpression): string | null {
  const expr = unwrap(call.expression);
  if (!expr) return null;
  if (ts.isPropertyAccessExpression(expr) || ts.isPropertyAccessChain(expr)) {
    return expr.name.text;
  }
  if (ts.isElementAccessExpression(expr) || ts.isElementAccessChain(expr)) {
    return literalString(expr.argumentExpression);
  }
  return null;
}

function callReceiver(call: ts.CallExpression): ts.Expression | undefined {
  const expr = unwrap(call.expression);
  if (!expr) return undefined;
  if (ts.isPropertyAccessExpression(expr) || ts.isPropertyAccessChain(expr)) {
    return expr.expression;
  }
  if (ts.isElementAccessExpression(expr) || ts.isElementAccessChain(expr)) {
    return expr.expression;
  }
  return undefined;
}

function bindingName(node: ts.BindingName | undefined): string | null {
  return node && ts.isIdentifier(node) ? node.text : null;
}

function fromTableArgument(
  call: ts.CallExpression,
  stringConsts: Map<string, string>,
): string | null {
  if (callMethodName(call) !== "from" || call.arguments.length === 0) return null;
  const arg = unwrap(call.arguments[0]);
  const lit = literalString(arg);
  if (lit) return lit;
  if (arg && ts.isIdentifier(arg)) return stringConsts.get(arg.text) ?? null;
  return null;
}

export function resolveSupabaseFromTable(
  expr: ts.Expression | undefined,
  aliases: Map<string, string>,
  stringConsts: Map<string, string>,
): string | null {
  const n = unwrap(expr);
  if (!n) return null;
  if (ts.isIdentifier(n)) return aliases.get(n.text) ?? null;
  if (ts.isCallExpression(n)) {
    const fromTable = fromTableArgument(n, stringConsts);
    if (fromTable) return fromTable;
    return resolveSupabaseFromTable(callReceiver(n), aliases, stringConsts);
  }
  return null;
}

function collectStringConsts(sf: ts.SourceFile): Map<string, string> {
  const stringConsts = new Map<string, string>();
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node)) {
      const name = bindingName(node.name);
      const lit = literalString(node.initializer);
      if (name && lit) stringConsts.set(name, lit);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return stringConsts;
}

function collectAliases(sf: ts.SourceFile, stringConsts: Map<string, string>): Map<string, string> {
  const aliases = new Map<string, string>();
  let changed = true;
  while (changed) {
    changed = false;
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node)) {
        const name = bindingName(node.name);
        if (name && node.initializer) {
          const table = resolveSupabaseFromTable(node.initializer, aliases, stringConsts);
          if (table && aliases.get(name) !== table) {
            aliases.set(name, table);
            changed = true;
          }
        }
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      ) {
        const left = unwrap(node.left);
        if (left && ts.isIdentifier(left)) {
          const table = resolveSupabaseFromTable(node.right, aliases, stringConsts);
          if (table && aliases.get(left.text) !== table) {
            aliases.set(left.text, table);
            changed = true;
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return aliases;
}

/**
 * Return every insert/update/delete/upsert whose receiver traces to
 * `.from(<table>)`, including through aliases and chained builders.
 */
export function findSupabaseTableWrites(
  source: string,
  table: string,
  fileName = "scan.tsx",
): SupabaseTableWriteFinding[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const stringConsts = collectStringConsts(sf);
  const aliases = collectAliases(sf, stringConsts);
  const findings: SupabaseTableWriteFinding[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const method = callMethodName(node);
      if (method && WRITE_METHODS.has(method)) {
        const resolved = resolveSupabaseFromTable(callReceiver(node), aliases, stringConsts);
        if (resolved === table) {
          findings.push({ table, method: method as SupabaseWriteMethod });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}
