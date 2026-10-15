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
  const grade = candidate.grade || settings.grade || '';
  const topicId =
    candidate.pedagogicalTopicId ||
    (sameDiscipline
      ? settings.detailId || settings.topicId || settings.objectId
      : '');
  const topic = topics.find(
    (t) =>
      t.id === topicId &&
      t.discipline_id === discipline?.id &&
      t.grade_range === grade,
  );
  const skill =
    candidate.skill ??
    (sameDiscipline && (!candidate.grade || candidate.grade === settings.grade)
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
