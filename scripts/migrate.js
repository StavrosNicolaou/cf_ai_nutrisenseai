import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@libsql/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error('Missing TURSO_DATABASE_URL');
  process.exit(1);
}

const client = createClient({ url, authToken });

const migrationsDir = path.resolve(__dirname, '../src/db/migrations');
const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

for (const file of files) {
  const sql = await readFile(path.join(migrationsDir, file), 'utf8');
  if (!sql.trim()) continue;
  console.log(`Running ${file}...`);
  const statements = sql
    .split(/;\s*\n/)
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) {
    try {
      await client.execute(statement);
    } catch (error) {
      const message = String(error?.message || '');
      if (message.includes('duplicate column name')) {
        console.warn(`Skipping duplicate column: ${message}`);
        continue;
      }
      throw error;
    }
  }
}

console.log('Migrations complete.');
process.exit(0);
