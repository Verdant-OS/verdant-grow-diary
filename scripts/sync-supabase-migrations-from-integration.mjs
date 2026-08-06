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

console.log(`Syncing missing Supabase migrations from origin/${branch}...`);

try {
  // Fetch integration branch
  execSync(`git fetch origin ${branch} --quiet`);
} catch (error) {
  console.error(`Failed to fetch origin/${branch}. Ensure the branch exists.`);
  process.exit(1);
}

// Get list of migration files on the integration branch
let integrationFilesStr = '';
try {
  integrationFilesStr = execSync(`git ls-tree -r --name-only origin/${branch} supabase/migrations/`, { encoding: 'utf-8' });
} catch (error) {
  // If the directory doesn't exist on the branch, just ignore
  integrationFilesStr = '';
}

const integrationFiles = integrationFilesStr.split('\n').filter(f => f.endsWith('.sql'));

if (integrationFiles.length === 0) {
  console.log(`No migrations found in supabase/migrations/ on origin/${branch}.`);
  process.exit(0);
}

let copiedCount = 0;
const localMigrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
if (!fs.existsSync(localMigrationsDir)) {
  fs.mkdirSync(localMigrationsDir, { recursive: true });
}

for (const file of integrationFiles) {
  const fileName = path.basename(file);
  const localPath = path.join(localMigrationsDir, fileName);
  
  if (!fs.existsSync(localPath)) {
    console.log(`Copying missing migration: ${fileName}`);
    try {
      const content = execSync(`git show origin/${branch}:${file}`);
      fs.writeFileSync(localPath, content);
      copiedCount++;
    } catch (e) {
      console.error(`Failed to copy ${fileName}: ${e.message}`);
    }
  }
}

if (copiedCount === 0) {
  console.log(`All migrations from origin/${branch} are already present locally.`);
} else {
  console.log(`Successfully synced ${copiedCount} migration(s).`);
}
process.exit(0);
