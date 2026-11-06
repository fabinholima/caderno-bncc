// Compara o banco atual com uma cópia (dump do Render, backup antigo) e
// recupera as questões que existem na cópia e faltam no banco atual.
//
//   node recover-questions.mjs --source-db caderno_recuperacao          # só relatório
//   node recover-questions.mjs --source-db caderno_recuperacao --apply  # recupera
//   ... --match IME   # só questões cujo código, disciplina ou fonte contém "IME"
//
// --source-db usa o mesmo servidor e senha de DATABASE_URL, trocando só o nome
// do banco. Para outro servidor, use --source-url postgresql://...
// A cópia é lida numa transação somente leitura; nada é gravado nela.
// Veja docs/recuperar-questoes.md.
import pg from 'pg';

const { Client } = pg;
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const apply = args.includes('--apply');
const sourceDb = option('--source-db');
const match = option('--match')?.toLocaleLowerCase('pt-BR');
let sourceUrl = option('--source-url') || process.env.SOURCE_DATABASE_URL;
if (!process.env.DATABASE_URL)
  throw new Error('Defina DATABASE_URL (banco atual).');
if (!sourceUrl && sourceDb) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${sourceDb}`;
  sourceUrl = url.toString();
}
if (!sourceUrl)
  throw new Error(
    'Informe --source-db NOME ou --source-url URL (a cópia antiga).',
  );

// Ordem de inserção: cada tabela depende das anteriores.
const questionTables = [
  'questions',
  'question_revisions',
  'alternatives',
  'question_skills',
  'question_saeb_descriptors',
];

const source = new Client({ connectionString: sourceUrl });
const target = new Client({ connectionString: process.env.DATABASE_URL });
await source.connect();
await target.connect();

const sameDatabase = (
  await Promise.all(
    [source, target].map((client) =>
      client.query(
        'SELECT system_identifier::text || current_database() AS id FROM pg_control_system()',
      ),
    ),
  )
).map((result) => result.rows[0].id);
if (sameDatabase[0] === sameDatabase[1])
  throw new Error('A cópia e o banco atual são o mesmo banco.');

await source.query(
  'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
);

async function tableColumns(client) {
  const result = await client.query(
    `SELECT table_name, array_agg(column_name::text ORDER BY ordinal_position) AS columns
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (SELECT table_name FROM information_schema.tables
                            WHERE table_schema = 'public' AND table_type = 'BASE TABLE')
      GROUP BY table_name`,
  );
  return new Map(result.rows.map((row) => [row.table_name, row.columns]));
}
const sourceColumns = await tableColumns(source);
const targetColumns = await tableColumns(target);

// 1. Contagem de linhas por tabela: onde a cópia tem mais linhas que o banco atual.
const quote = (name) => `"${name.replaceAll('"', '""')}"`;
const differences = [];
for (const table of [...sourceColumns.keys()]
  .filter((name) => targetColumns.has(name))
  .sort((a, b) => a.localeCompare(b))) {
  const count = async (client) =>
    Number(
      (await client.query(`SELECT count(*) FROM public.${quote(table)}`))
        .rows[0].count,
    );
  const [before, now] = [await count(source), await count(target)];
  if (before > now)
    differences.push({
      tabela: table,
      copia: before,
      atual: now,
      faltam: before - now,
    });
}
console.log('\n== Tabelas com menos linhas no banco atual que na cópia');
if (differences.length) console.table(differences);
else console.log('Nenhuma.');

// 2. Questões que existem na cópia e não no banco atual.
const targetIds = new Set(
  (await target.query('SELECT id FROM questions')).rows.map((row) => row.id),
);
const sourceQuestions = (
  await source.query(
    `SELECT q.id, q.institution_id, q.public_code, q.status::text AS status, q.created_at, q.created_by,
            i.name AS institution, u.email AS author, r.subject, r.grade, concat_ws(' ', r.source_institution, r.source_year::text) AS source_name
       FROM questions q
       JOIN institutions i ON i.id = q.institution_id
       LEFT JOIN users u ON u.id = q.created_by
       LEFT JOIN question_revisions r ON r.question_id = q.id AND r.revision = q.current_revision
      ORDER BY q.created_at, q.public_code`,
  )
).rows;
const allMissing = sourceQuestions.filter(
  (question) => !targetIds.has(question.id),
);
const missing = allMissing.filter(
  (question) =>
    !match ||
    [question.public_code, question.subject, question.source_name].some(
      (value) =>
        String(value || '')
          .toLocaleLowerCase('pt-BR')
          .includes(match),
    ),
);
console.log(
  `\n== Questões: ${sourceQuestions.length} na cópia, ${targetIds.size} no banco atual, ${allMissing.length} faltando` +
    (match ? ` (${missing.length} com "${option('--match')}")` : ''),
);
if (missing.length)
  console.table(
    missing.map((question) => ({
      codigo: question.public_code,
      disciplina: question.subject,
      serie: question.grade,
      fonte: question.source_name,
      status: question.status,
      criada_em: question.created_at
        .toISOString()
        .slice(0, 16)
        .replace('T', ' '),
      autor: question.author,
      instituicao: question.institution,
    })),
  );

// 3. Edições perdidas: revisões da cópia que faltam em questões que ainda existem.
const sourceRevisions = (
  await source.query('SELECT question_id, revision FROM question_revisions')
).rows;
const targetRevisionKeys = new Set(
  (
    await target.query('SELECT question_id, revision FROM question_revisions')
  ).rows.map((row) => `${row.question_id}:${row.revision}`),
);
const lostRevisions = sourceRevisions.filter(
  (row) =>
    targetIds.has(row.question_id) &&
    !targetRevisionKeys.has(`${row.question_id}:${row.revision}`),
);
if (lostRevisions.length) {
  const codes = new Map(
    sourceQuestions.map((question) => [question.id, question.public_code]),
  );
  console.log(
    `\n== Atenção: ${lostRevisions.length} revisão(ões) de questões existentes não estão no banco atual ` +
      '(edições feitas só na cópia). Elas não são recuperadas automaticamente; confira à mão:',
  );
  console.log(
    [...new Set(lostRevisions.map((row) => codes.get(row.question_id)))].join(
      ', ',
    ),
  );
}

if (!missing.length || !apply) {
  if (missing.length)
    console.log(
      '\nNada foi alterado. Rode de novo com --apply para recuperar as questões listadas.',
    );
  await source.query('ROLLBACK');
  await Promise.all([source.end(), target.end()]);
  process.exit(0);
}

// 4. Recuperação, numa única transação no banco atual. Cada questão entra com
// seu id original, revisões, alternativas e vínculos; uma questão que falhar
// (ex.: autor ou habilidade inexistente no banco atual) é pulada e informada.
const missingIds = missing.map((question) => question.id);
const rowsByTable = new Map();
for (const table of questionTables) {
  if (!sourceColumns.has(table) || !targetColumns.has(table)) continue;
  const key = table === 'questions' ? 'id' : 'question_id';
  const rows = (
    await source.query(
      `SELECT row_to_json(t) AS row FROM public.${quote(table)} t WHERE t.${key} = ANY($1::uuid[])`,
      [missingIds],
    )
  ).rows.map((result) => result.row);
  const columns = targetColumns
    .get(table)
    .filter((column) => sourceColumns.get(table).includes(column));
  rowsByTable.set(table, { key, rows, columns });
}

// Os catálogos (habilidades BNCC, descritores SAEB, tópicos) podem ter sido
// recriados por migrações com outros ids. Os vínculos são traduzidos pelo
// código natural; o que não existir no banco atual é descartado e informado.
async function naturalIds(client, sql) {
  return new Map(
    (await client.query(sql)).rows.map((row) => [row.id, row.key]),
  );
}
const skillSql = `SELECT id, curriculum_version || '|' || code AS key FROM curriculum_skills`;
const saebSql = `SELECT d.id, m.source_key || '|' || d.code AS key FROM saeb_descriptors d JOIN saeb_matrices m ON m.id = d.matrix_id`;
const sourceSkills = await naturalIds(source, skillSql);
const targetSkills = new Map(
  [...(await naturalIds(target, skillSql))].map(([id, key]) => [key, id]),
);
const hasSaeb =
  sourceColumns.has('saeb_matrices') && targetColumns.has('saeb_matrices');
const sourceSaeb = hasSaeb ? await naturalIds(source, saebSql) : new Map();
const targetSaeb = hasSaeb
  ? new Map(
      [...(await naturalIds(target, saebSql))].map(([id, key]) => [key, id]),
    )
  : new Map();
const targetTopics = targetColumns
  .get('question_revisions')
  .includes('pedagogical_topic_id')
  ? new Set(
      (await target.query('SELECT id FROM pedagogical_topics')).rows.map(
        (row) => row.id,
      ),
    )
  : new Set();
await source.query('ROLLBACK');

const warnings = [];
function translate(table, row, code) {
  if (table === 'question_skills') {
    const skill = targetSkills.get(sourceSkills.get(row.skill_id));
    if (!skill)
      warnings.push({
        codigo: code,
        aviso: `habilidade ${sourceSkills.get(row.skill_id) || row.skill_id} não existe; vínculo descartado`,
      });
    return skill ? { ...row, skill_id: skill } : null;
  }
  if (table === 'question_saeb_descriptors') {
    const descriptor = targetSaeb.get(sourceSaeb.get(row.descriptor_id));
    if (!descriptor)
      warnings.push({
        codigo: code,
        aviso: `descritor SAEB ${sourceSaeb.get(row.descriptor_id) || row.descriptor_id} não existe; vínculo descartado`,
      });
    return descriptor ? { ...row, descriptor_id: descriptor } : null;
  }
  if (
    table === 'question_revisions' &&
    row.pedagogical_topic_id &&
    !targetTopics.has(row.pedagogical_topic_id)
  ) {
    warnings.push({
      codigo: code,
      aviso: `revisão ${row.revision}: tópico pedagógico não existe; mantido só o texto do tópico`,
    });
    return { ...row, pedagogical_topic_id: null };
  }
  return row;
}

const recovered = [];
const skipped = [];
await target.query('BEGIN');
try {
  for (const question of missing) {
    await target.query('SAVEPOINT recover_question');
    try {
      let code = question.public_code;
      const clash = await target.query(
        'SELECT 1 FROM questions WHERE institution_id = $1 AND public_code = $2',
        [question.institution_id, code],
      );
      if (clash.rowCount) {
        // O código foi reutilizado por outra questão depois da cópia: gera o próximo livre.
        const prefix = code.replace(/-[^-]*$/, '');
        const next = await target.query(
          `SELECT GREATEST(count(*), COALESCE(max(NULLIF(regexp_replace(public_code, '^.*-', ''), '')::int)
                    FILTER (WHERE public_code ~ '-[0-9]+$'), 0))::int AS n
             FROM questions WHERE institution_id = $1`,
          [question.institution_id],
        );
        let number = next.rows[0].n + 1;
        for (;;) {
          code = `${prefix}-${String(number).padStart(4, '0')}`;
          const taken = await target.query(
            'SELECT 1 FROM questions WHERE institution_id = $1 AND public_code = $2',
            [question.institution_id, code],
          );
          if (!taken.rowCount) break;
          number += 1;
        }
      }
      for (const table of questionTables) {
        const data = rowsByTable.get(table);
        if (!data) continue;
        const rows = data.rows
          .filter((row) => row[data.key] === question.id)
          .map((row) =>
            table === 'questions'
              ? { ...row, public_code: code, duplicate_of_question_id: null }
              : translate(table, row, question.public_code),
          )
          .filter(Boolean);
        if (!rows.length) continue;
        const list = data.columns.map(quote).join(', ');
        await target.query(
          `INSERT INTO public.${quote(table)} (${list})
           SELECT ${list} FROM json_populate_recordset(NULL::public.${quote(table)}, $1::json)`,
          [JSON.stringify(rows)],
        );
      }
      await target.query('RELEASE SAVEPOINT recover_question');
      recovered.push({ ...question, code });
    } catch (error) {
      await target.query('ROLLBACK TO SAVEPOINT recover_question');
      skipped.push({
        codigo: question.public_code,
        motivo: error instanceof Error ? error.message : String(error),
      });
    }
  }
  // Restaura a marcação de duplicata quando a questão original também existe.
  const duplicates = (rowsByTable.get('questions')?.rows || []).filter(
    (row) => row.duplicate_of_question_id,
  );
  for (const row of duplicates)
    await target.query(
      `UPDATE questions SET duplicate_of_question_id = $2
        WHERE id = $1 AND EXISTS (SELECT 1 FROM questions WHERE id = $2)`,
      [row.id, row.duplicate_of_question_id],
    );
  await target.query('COMMIT');
} catch (error) {
  await target.query('ROLLBACK');
  throw error;
}

console.log(`\n== Recuperadas: ${recovered.length}`);
const renamed = recovered.filter(
  (question) => question.code !== question.public_code,
);
if (renamed.length)
  console.table(
    renamed.map((question) => ({
      codigo_na_copia: question.public_code,
      novo_codigo: question.code,
    })),
  );
const recoveredCodes = new Set(
  recovered.map((question) => question.public_code),
);
const relevantWarnings = warnings.filter((warning) =>
  recoveredCodes.has(warning.codigo),
);
if (relevantWarnings.length) {
  console.log(`\n== Avisos: ${relevantWarnings.length}`);
  console.table(relevantWarnings);
}
if (skipped.length) {
  console.log(`\n== Não recuperadas: ${skipped.length}`);
  console.table(skipped);
}
await Promise.all([source.end(), target.end()]);
