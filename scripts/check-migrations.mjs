// Garante que cada migração nova tenha um número próprio. As duplicatas abaixo
// já foram aplicadas em produção: o schema_migrations guarda o nome do arquivo,
// então renomeá-las faria o migrate.mjs executá-las de novo.
import { readdirSync } from 'node:fs';

const legacyDuplicates = new Set(['071', '072', '073', '074']);

export function findMigrationProblems(files) {
  const problems = [];
  const byNumber = new Map();
  for (const file of files.filter((name) => name.endsWith('.sql'))) {
    const match = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(file);
    if (!match) continue;
    byNumber.set(match[1], [...(byNumber.get(match[1]) || []), file]);
  }
  for (const [number, names] of byNumber)
    if (names.length > 1 && !legacyDuplicates.has(number))
      problems.push(`Número de migração repetido ${number}: ${names.join(', ')}`);
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = findMigrationProblems(readdirSync(new URL('../database', import.meta.url)));
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exit(1);
  console.log('Migrações com numeração válida.');
}
