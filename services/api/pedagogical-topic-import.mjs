import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { transaction } from './db.mjs';

const gradeRange = z.enum(['1ª série', '2ª série', '3ª série']).optional();
const topicSchema = z.object({
  sourceKey: z.string().trim().min(1).max(160),
  name: z.string().trim().min(2).max(120),
  gradeRange,
  subtopics: z.array(z.lazy(() => topicSchema)).default([]),
});

export const pedagogicalTopicCatalogSchema = z.object({
  version: z.string().trim().min(1).max(80),
  subjects: z
    .array(
      z.object({
        sourceKey: z.string().trim().min(1).max(160),
        name: z.string().trim().min(2).max(120),
        stage: z.enum(['Ensino Fundamental', 'Ensino Médio']),
        areaSourceKey: z.string().trim().regex(/^em-area-[a-z]+$/),
        topics: z.array(topicSchema).min(1),
      }),
    )
    .min(1),
});

function flattenTopics(topics, parent = null, result = [], seen = new Set()) {
  for (const [position, topic] of topics.entries()) {
    if (seen.has(topic.sourceKey))
      throw new Error(`sourceKey de tópico duplicado: ${topic.sourceKey}`);
    seen.add(topic.sourceKey);
    result.push({
      sourceKey: topic.sourceKey,
      name: topic.name,
      gradeRange: topic.gradeRange || parent?.gradeRange || null,
      parentSourceKey: parent?.sourceKey || null,
      position: position + 1,
    });
    flattenTopics(topic.subtopics, topic, result, seen);
  }
  return result;
}

export function normalizePedagogicalTopicCatalog(input) {
  const catalog = pedagogicalTopicCatalogSchema.parse(input);
  const subjectKeys = new Set();
  const topics = [];
  for (const subject of catalog.subjects) {
    if (subjectKeys.has(subject.sourceKey))
      throw new Error(`sourceKey de disciplina duplicado: ${subject.sourceKey}`);
    subjectKeys.add(subject.sourceKey);
    const rows = flattenTopics(subject.topics);
    if (rows.some((row) => !row.gradeRange))
      throw new Error(`Objeto sem série informada na disciplina ${subject.name}`);
    topics.push({ ...subject, topics: rows });
  }
  return { ...catalog, subjects: topics };
}

export async function importPedagogicalTopicCatalog({
  institutionId,
  userId,
  catalog,
}) {
  if (!institutionId || !userId)
    throw new Error('institutionId e userId são obrigatórios.');
  const normalized = normalizePedagogicalTopicCatalog(catalog);
  return transaction(async (client) => {
    const imported = [];
    for (const subject of normalized.subjects) {
      const discipline = await client.query(
        `INSERT INTO pedagogical_disciplines
           (institution_id, area_id, name, stage, created_by)
         SELECT $1, id, $2, $3, $4
         FROM curriculum_areas
         WHERE curriculum_version='BNCC-2018' AND source_key=$5
         ON CONFLICT (institution_id, area_id, name)
         DO UPDATE SET stage=EXCLUDED.stage, updated_at=now()
         RETURNING id, name, stage, area_id`,
        [institutionId, subject.name, subject.stage, userId, subject.areaSourceKey],
      );
      if (!discipline.rowCount)
        throw new Error(`Área curricular oficial não encontrada: ${subject.areaSourceKey}`);
      const disciplineId = discipline.rows[0].id;
      const ids = new Map();
      for (const topic of subject.topics) {
        const parentId = topic.parentSourceKey ? ids.get(topic.parentSourceKey) : null;
        if (topic.parentSourceKey && !parentId)
          throw new Error(`Pai deve aparecer antes do filho: ${topic.sourceKey}`);
        const conflict = parentId
          ? 'ON CONFLICT (parent_id, lower(name)) WHERE parent_id IS NOT NULL'
          : 'ON CONFLICT (discipline_id, lower(name)) WHERE parent_id IS NULL';
        const row = await client.query(
          `INSERT INTO pedagogical_topics
             (institution_id, discipline_id, parent_id, name, grade_range, position, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ${conflict}
           DO UPDATE SET grade_range=EXCLUDED.grade_range,
                         position=EXCLUDED.position, updated_by=EXCLUDED.updated_by,
                         updated_at=now()
           RETURNING id, name, parent_id, grade_range, position`,
          [institutionId, disciplineId, parentId, topic.name, topic.gradeRange, topic.position, userId],
        );
        ids.set(topic.sourceKey, row.rows[0].id);
      }
      imported.push({ discipline: discipline.rows[0], topicCount: subject.topics.length });
    }
    return { version: normalized.version, subjects: imported };
  });
}

export async function importPedagogicalTopicCatalogFile({
  file,
  institutionId,
  userId,
}) {
  const input = JSON.parse(await readFile(resolve(process.cwd(), file), 'utf8'));
  return importPedagogicalTopicCatalog({ institutionId, userId, catalog: input });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , file, institutionId, userId] = process.argv;
  if (!file || !institutionId || !userId) {
    console.error('Uso: node pedagogical-topic-import.mjs <catalogo.json> <institutionId> <userId>');
    process.exitCode = 2;
  } else {
    importPedagogicalTopicCatalogFile({ file, institutionId, userId })
      .then((result) => console.log(JSON.stringify(result, null, 2)))
      .catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
  }
}
