import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const databaseDir = path.resolve(new URL('../../database', import.meta.url).pathname);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const files = (await fs.readdir(databaseDir)).filter((file) => /^\d{3}_.*\.sql$/.test(file)).sort();
    const applied = new Set((await client.query('SELECT filename FROM schema_migrations')).rows.map((row) => row.filename));
    for (const filename of files) {
      if (applied.has(filename)) continue;
      console.log(`Applying ${filename}`);
      await client.query(await fs.readFile(path.join(databaseDir, filename), 'utf8'));
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    }
    await client.query('COMMIT');
    console.log(`Migrations complete (${files.length} files known).`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
} finally { await pool.end(); }
