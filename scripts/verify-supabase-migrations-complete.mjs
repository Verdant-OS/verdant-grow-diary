import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Parse args
const args = process.argv.slice(2);
let branch = process.env.SUPABASE_MIGRATIONS_INTEGRATION_BRANCH || 'dev';
const branchArgIndex = args.indexOf('--branch');
if (branchArgIndex !== -1 && args[branchArgIndex + 1]) {
  branch = args[branchArgIndex + 1];
}

console.log(`Verifying Supabase migrations against origin/${branch}...`);

try {
  execSync(`git fetch origin ${branch} --quiet`);
} catch (error) {
  console.error(`Failed to fetch origin/${branch}. Ensure the branch exists.`);
  process.exit(1);
}

let integrationFilesStr = '';
try {
  integrationFilesStr = execSync(`git ls-tree -r --name-only origin/${branch} supabase/migrations/`, { encoding: 'utf-8' });
} catch (error) {
  integrationFilesStr = '';
}

const integrationFiles = integrationFilesStr.split('\n').filter(f => f.endsWith('.sql'));
const localMigrationsDir = path.join(process.cwd(), 'supabase', 'migrations');

let missingCount = 0;

for (const file of integrationFiles) {
  const fileName = path.basename(file);
  const localPath = path.join(localMigrationsDir, fileName);
  
  if (!fs.existsSync(localPath)) {
    console.error(`ERROR: Missing migration file locally: ${fileName}`);
    missingCount++;
  }
}

if (missingCount > 0) {
  console.error(`\nFailed: ${missingCount} migration(s) missing from local branch.`);
  console.error(`Run 'npm run supabase:migrations:sync' to copy missing migrations.`);
  process.exit(1);
}

console.log(`Success: All migrations from origin/${branch} are present locally.`);
process.exit(0);
