// Importa dados curriculares e questões do snapshot versionado sem apagar dados.
// Executar no shell do Render a partir de services/api:
//   node seed-from-backup.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool, transaction } from './db.mjs';

const dumpPath = path.resolve(process.cwd(), '../../database/backups/caderno-current.sql');
const tables = [
  'institutions', 'curriculum_areas', 'curriculum_subjects', 'curriculum_skills',
  'knowledge_objects', 'pedagogical_disciplines', 'pedagogical_topics',
  'skill_knowledge_objects', 'questions', 'question_revisions', 'alternatives',
  'question_skills',
];

function decode(value) {
  if (value === '\\N') return null;
  return value.replaceAll('\\\\t', '\\t').replaceAll('\\\\n', '\\n').replaceAll('\\\\r', '\\r').replaceAll('\\\\\\\\', '\\\\');
}

function readCopyBlocks(text) {
  const result = new Map();
  const re = /^COPY public\.([a-z_]+) \(([^)]+)\) FROM stdin;\n([\s\S]*?)^\\\.$/gm;
  for (const match of text.matchAll(re)) {
    result.set(match[1], {
      columns: match[2].split(',').map((column) => column.trim()),
      rows: match[3].split('\n').filter(Boolean).map((line) => line.split('\t').map(decode)),
    });
  }
  return result;
}

const dump = readCopyBlocks(await fs.readFile(dumpPath, 'utf8'));
let inserted = 0;
let skipped = 0;
await transaction(async (client) => {
  const admin = await client.query("SELECT id FROM users WHERE portal_admin=true AND active ORDER BY created_at LIMIT 1");
  const adminId = admin.rows[0]?.id;
  for (const table of tables) {
    const block = dump.get(table);
    if (!block?.rows.length) continue;
    const placeholders = block.columns.map((_, index) => `$${index + 1}`).join(',');
    const sql = `INSERT INTO ${table} (${block.columns.join(',')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
    for (const sourceRow of block.rows) {
      const row = [...sourceRow];
      // O snapshot pode apontar para o usuário de demonstração, inexistente
      // no Render. Vincule questões importadas ao administrador atual.
      if (table === 'questions' && adminId) row[block.columns.indexOf('created_by')] = adminId;
      // O vínculo curricular pode usar um UUID de uma taxonomia antiga;
      // mantenha o caminho textual da revisão e deixe o vínculo opcional.
      if (table === 'question_revisions') row[block.columns.indexOf('pedagogical_topic_id')] = null;
      try {
        await client.query('SAVEPOINT seed_row');
        const result = await client.query(sql, row);
        inserted += result.rowCount || 0;
        await client.query('RELEASE SAVEPOINT seed_row');
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT seed_row');
        skipped += 1;
        console.warn(`Ignorado ${table}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
});
console.log(JSON.stringify({ inserted, skipped, source: dumpPath }));
await pool.end();
