import { execFileSync } from 'node:child_process';
import { digest, validateCommit } from './common.mjs';

export function readSourceInventory(repo, commit) {
  validateCommit(commit);
  const git = args => execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try { git(['cat-file', '-e', `${commit}^{commit}`]); }
  catch { throw new Error('Reference commit is unavailable locally; fetch it before running.'); }
  const paths = git(['ls-tree', '-r', '--name-only', commit, '--', 'src/']).trim().split('\n').filter(Boolean);
  const modules = paths.filter(path => /\.[cm]?[jt]sx?$/.test(path) &&
    !/(?:^|\/)(?:test|__tests__)\/|\.(?:test|spec)\./.test(path)).sort();
  let tree;
  try { tree = git(['show', `${commit}:src/routeTree.gen.ts`]); }
  catch { return { routes: null, modules, reason: 'NOT_MEASURED: reference commit has no generated TanStack route manifest.' }; }
  const body = tree.match(/export interface FileRoutesByFullPath\s*\{([\s\S]*?)\n\}/)?.[1];
  const routes = body && [...body.matchAll(/^\s*['"]([^'"\r\n]+)['"]\s*:\s*typeof\s+/gm)].map(match => match[1]);
  if (!routes?.length) return { routes: null, modules, reason: 'NOT_MEASURED: unsupported or empty source route manifest.' };
  return { routes: [...new Set(routes)].sort(), modules,
    route_manifest: 'src/routeTree.gen.ts', route_manifest_sha256: digest(tree) };
}
