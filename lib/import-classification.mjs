import { inheritedTopicGrade, normalizeTopicGrade } from './topic-grade.mjs';

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
