import { inheritedTopicGrade, normalizeTopicGrade } from './topic-grade.mjs';

/**
 * @typedef {{id: string, name: string, stage?: string, skills?: Array<{id: string, code: string, description?: string}>}} PedagogicalDiscipline
 * @typedef {{id: string, name: string, discipline_id: string, parent_id: string | null, grade_range: string}} PedagogicalTopic
 */

/**
 * @template {PedagogicalDiscipline} D
 * @template {PedagogicalTopic} T
 * @param {{
 *   candidate?: {pedagogicalDisciplineId?: string, pedagogicalTopicId?: string, grade?: string, skill?: string},
 *   settings?: {pedagogicalDisciplineId?: string, grade?: string, detailId?: string, topicId?: string, objectId?: string, skill?: string},
 *   item?: {primarySubject?: string},
 *   disciplines?: D[],
 *   topics?: T[]
 * }} options
 */
// An individual discipline must never inherit topics/skills from a different batch discipline.
export function resolveImportClassification({
  candidate = {},
  settings = {},
  item = {},
  disciplines = [],
  topics = [],
}) {
  const batch =
    disciplines.find((d) => d.id === settings.pedagogicalDisciplineId) ||
    disciplines.find(
      (d) => d.name === item.primarySubject && d.stage === 'Ensino Médio',
    );
  const discipline = candidate.pedagogicalDisciplineId
    ? disciplines.find((d) => d.id === candidate.pedagogicalDisciplineId)
    : batch;
  const sameDiscipline = Boolean(
    discipline && batch && discipline.id === batch.id,
  );
  const grade = normalizeTopicGrade(
    candidate.grade || settings.grade,
    discipline?.stage,
  );
  const topicId =
    candidate.pedagogicalTopicId ||
    (sameDiscipline
      ? settings.detailId || settings.topicId || settings.objectId
      : '');
  const topic = topics.find(
    (t) =>
      t.id === topicId &&
      t.discipline_id === discipline?.id &&
      (!inheritedTopicGrade(t, topics) ||
        normalizeTopicGrade(
          inheritedTopicGrade(t, topics),
          discipline?.stage,
        ) === grade),
  );
  const skill =
    candidate.skill ??
    (sameDiscipline &&
    (!candidate.grade ||
      normalizeTopicGrade(candidate.grade, discipline?.stage) ===
        normalizeTopicGrade(settings.grade, discipline?.stage))
      ? settings.skill
      : '');
  return {
    discipline,
    grade,
    topicId: topic?.id || '',
    skill: skill || '',
    subject: discipline?.name || '',
  };
}
