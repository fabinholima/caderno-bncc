import { normalizeTopicGrade } from './topic-grade.mjs';

/**
 * @param {{subject: string, grade?: string, stage?: 'Ensino Fundamental' | 'Ensino Médio', skills?: Array<{code: string, isPrimary?: boolean, knowledgeObjectId?: string}>, pedagogicalTopicId?: string, knowledgeTopic?: string}} question
 * @param {{disciplines?: import('./import-classification.mjs').PedagogicalDiscipline[], topics?: import('./import-classification.mjs').PedagogicalTopic[], highSchoolAreas?: Record<string, string[]>, elementaryAreas?: Record<string, string[]>}} options
 */
// Restore stored identities; never infer a new subject/skill from the first catalog option.
export function restoreQuestionClassification(
  question,
  {
    disciplines = [],
    topics = [],
    highSchoolAreas = {},
    elementaryAreas = {},
  } = {},
) {
  const primarySkill =
    question.skills?.find((skill) => skill.isPrimary) || question.skills?.[0];
  const skill = primarySkill?.code || '';
  const stage =
    question.stage ||
    (skill.startsWith('EF') ||
    (/ano/i.test(question.grade || '') &&
      !/série|serie|médio|medio/i.test(question.grade || '') &&
      !skill.startsWith('EM') &&
      !(
        disciplines.some(
          (item) =>
            item.name === question.subject && item.stage === 'Ensino Médio',
        ) &&
        !disciplines.some(
          (item) =>
            item.name === question.subject &&
            item.stage === 'Ensino Fundamental',
        )
      ))
      ? 'Ensino Fundamental'
      : 'Ensino Médio');
  const areas = stage === 'Ensino Médio' ? highSchoolAreas : elementaryAreas;
  const area =
    Object.entries(areas).find(([, subjects]) =>
      subjects.includes(question.subject),
    )?.[0] || '';
  const discipline = disciplines.find(
    (item) => item.name === question.subject && item.stage === stage,
  );
  const disciplineTopics = topics.filter(
    (topic) => topic.discipline_id === discipline?.id,
  );
  const grade = normalizeTopicGrade(question.grade, stage);
  const eligible = disciplineTopics.filter(
    (topic) =>
      !topic.grade_range ||
      normalizeTopicGrade(topic.grade_range, stage) === grade,
  );
  const path = [];
  let current = disciplineTopics.find(
    (topic) => topic.id === question.pedagogicalTopicId,
  );
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = disciplineTopics.find((topic) => topic.id === current.parent_id);
  }
  if (!path.length) {
    let parent = null;
    for (const name of String(question.knowledgeTopic || '').split(/\s*>\s*/)) {
      const topic = eligible.find(
        (topic) => topic.name === name && (topic.parent_id || null) === parent,
      );
      if (!topic) break;
      path.push(topic);
      parent = topic.id;
    }
  }
  return {
    subject: question.subject,
    grade,
    stage,
    area,
    skill,
    knowledgeObjectId: primarySkill?.knowledgeObjectId || '',
    objectId: path[0]?.id || question.pedagogicalTopicId || '',
    subtopicId: path[1]?.id || '',
    detailId: path[2]?.id || '',
  };
}
