import { execSync } from 'child_process';
import { readFileSync, readdirSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = join(__dirname, '../migrations');
const DATABASE_NAME = 'studiobase-db'; // Should match wrangler.jsonc

function getChecksum(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

const BACKEND_ROOT = join(__dirname, '..');

function runQuery(query: string, remote: boolean = false): any {
  const command = `npx wrangler d1 execute ${DATABASE_NAME} ${remote ? '--remote' : '--local'} --command="${query.replace(/"/g, '\\"')}" --json --yes`;
  try {
    const output = execSync(command, { encoding: 'utf-8', cwd: BACKEND_ROOT });
    
    // Filter out non-JSON lines
    const jsonStart = output.indexOf('[');
    if (jsonStart === -1) {
      const singleObjStart = output.indexOf('{');
      if (singleObjStart === -1) throw new Error(`Invalid JSON output: ${output}`);
      return JSON.parse(output.substring(singleObjStart));
    }
    return JSON.parse(output.substring(jsonStart));
  } catch (err) {
    console.error(`Query failed: ${query}`);
    throw err;
  }
}

function applyMigration(filename: string, remote: boolean = false) {
  const filePath = join(MIGRATIONS_DIR, filename);
  const command = `npx wrangler d1 execute ${DATABASE_NAME} ${remote ? '--remote' : '--local'} --file="${filePath}" --yes`;
  console.log(`Applying ${filename}...`);
  try {
    execSync(command, { stdio: 'inherit', cwd: BACKEND_ROOT });
  } catch (err: any) {
    console.error(`FAILED to apply migration ${filename}`);
    throw err;
  }
}

async function migrate() {
  const isRemote = process.argv.includes('--remote');
  console.log(`Running migrations (${isRemote ? 'REMOTE' : 'LOCAL'})...`);

  // 1. Ensure schema_migrations table exists
  runQuery(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      executedAt INTEGER NOT NULL
    );
  `, isRemote);

  // 2. Get applied migrations
  const appliedRaw = runQuery('SELECT name, checksum FROM schema_migrations', isRemote);
  const appliedResults = (Array.isArray(appliedRaw) ? appliedRaw[0]?.results : appliedRaw?.results) as any[] | undefined;
  const appliedNames = new Set<string>(appliedResults?.map((r: any) => r.name) || []);
  const appliedChecksums = new Map<string, string>(appliedResults?.map((r: any) => [r.name, r.checksum]) || []);

  // 3. Read migration files
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    const checksum = getChecksum(content);

    if (appliedNames.has(file)) {
      const oldChecksum = appliedChecksums.get(file);
      if (oldChecksum !== checksum && oldChecksum !== 'initial' && oldChecksum !== 'foundation') {
        console.error(`[ERROR] Checksum mismatch for ${file}. Expected ${oldChecksum}, got ${checksum}.`);
        console.error(`Migrations should be immutable!`);
        process.exit(1);
      }
      continue;
    }

    // 4. Apply migration
    applyMigration(file, isRemote);

    // 5. Record migration
    runQuery(`
      INSERT INTO schema_migrations (name, checksum, executedAt)
      VALUES ('${file}', '${checksum}', ${Date.now()});
    `, isRemote);
    
    console.log(`Successfully applied ${file}`);
  }

  console.log('All migrations applied successfully.');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
