import { pool } from './db.mjs';

const percentage = (correct, total) =>
  total ? Math.round((correct / total) * 1000) / 10 : 0;

export function aggregateApplicationReport(application, rows, competencies) {
  const competencyBySkill = new Map();
  for (const competency of competencies) {
    const list = competencyBySkill.get(competency.skill_code) ?? [];
    list.push(competency);
    competencyBySkill.set(competency.skill_code, list);
  }
  const skillStats = new Map();
  const competencyStats = new Map();
  const add = (map, key, metadata, correct) => {
    const value = map.get(key) ?? { ...metadata, correct: 0, total: 0 };
    value.total += 1;
    if (correct) value.correct += 1;
    map.set(key, value);
  };
  for (const row of rows) {
    for (const item of row.result?.items ?? []) {
      const isCorrect = item.status === 'correct';
      for (const skill of item.skills ?? []) {
        add(
          skillStats,
          skill.code,
          { code: skill.code, primary: Boolean(skill.primary) },
          isCorrect,
        );
        for (const competency of competencyBySkill.get(skill.code) ?? [])
          add(
            competencyStats,
            competency.source_key,
            {
              sourceKey: competency.source_key,
              number: competency.number,
              description: competency.description,
              area: competency.area_name,
            },
            isCorrect,
          );
      }
    }
  }
  const corrected = rows.filter((row) => row.submission_id).length;
  const review = rows.filter((row) => row.scan_status === 'review').length;
  const scores = rows.filter(
    (row) => row.submission_id && Number(row.max_score) > 0,
  );
  const averagePercentage = scores.length
    ? Math.round(
        (scores.reduce(
          (sum, row) => sum + (Number(row.score) / Number(row.max_score)) * 100,
          0,
        ) /
          scores.length) *
          10,
      ) / 10
    : 0;
  const withPercentage = (values) =>
    [...values]
      .map((value) => ({
        ...value,
        percentage: percentage(value.correct, value.total),
      }))
      .sort((left, right) => left.percentage - right.percentage);
  return {
    application,
    summary: {
      students: rows.length,
      corrected,
      review,
      awaiting: rows.length - corrected - review,
      averagePercentage,
    },
    students: rows.map((row) => ({
      id: row.student_id,
      name: row.student_name,
      number: row.number,
      versionCode: row.version_code,
      status: row.submission_id
        ? row.requires_manual_review
          ? 'manual_review'
          : 'corrected'
        : row.scan_status === 'review'
          ? 'review'
          : 'awaiting',
      score: row.score == null ? null : Number(row.score),
      maxScore: row.max_score == null ? null : Number(row.max_score),
      percentage:
        row.score == null || !Number(row.max_score)
          ? null
          : Math.round((Number(row.score) / Number(row.max_score)) * 1000) / 10,
    })),
    skills: withPercentage(skillStats.values()),
    competencies: withPercentage(competencyStats.values()),
  };
}

export async function getApplicationReport({ institutionId, applicationId }) {
  const applicationResult = await pool.query({
    text: `SELECT aa.id,a.title,c.name AS class_name,c.grade,c.school_year
           FROM assessment_applications aa
           JOIN assessments a ON a.id=aa.assessment_id
           JOIN classes c ON c.id=aa.class_id
           WHERE aa.id=$1 AND aa.institution_id=$2`,
    values: [applicationId, institutionId],
  });
  if (!applicationResult.rowCount) return null;
  const result = await pool.query({
    text: `SELECT s.id AS student_id,s.name AS student_name,ce.number,
                  av.code AS version_code,scan.status AS scan_status,
                  sub.id AS submission_id,sub.score,sub.max_score,
                  sub.requires_manual_review,sub.result
           FROM application_students aps
           JOIN students s ON s.id=aps.student_id
           JOIN assessment_versions av ON av.id=aps.assessment_version_id
           JOIN assessment_applications aa ON aa.id=aps.application_id
           LEFT JOIN class_enrollments ce
             ON ce.class_id=aa.class_id AND ce.student_id=s.id
           LEFT JOIN LATERAL (
             SELECT cs.status,cs.submission_id
             FROM card_scans cs
             WHERE cs.application_student_id=aps.id
             ORDER BY cs.completed_at DESC NULLS LAST,cs.created_at DESC
             LIMIT 1
           ) scan ON true
           LEFT JOIN assessment_submissions sub ON sub.id=scan.submission_id
           WHERE aps.application_id=$1
           ORDER BY ce.number NULLS LAST,s.name`,
    values: [applicationId],
  });
  const skillCodes = [
    ...new Set(
      result.rows.flatMap((row) =>
        (row.result?.items ?? []).flatMap((item) =>
          (item.skills ?? []).map((skill) => skill.code),
        ),
      ),
    ),
  ];
  const competencyResult = skillCodes.length
    ? await pool.query({
        text: `SELECT cs.code AS skill_code,cc.source_key,cc.number,
                      cc.description,ca.name AS area_name
               FROM curriculum_skills cs
               JOIN skill_competencies sc ON sc.skill_id=cs.id
               JOIN curriculum_competencies cc ON cc.id=sc.competency_id
               JOIN curriculum_areas ca ON ca.id=cc.area_id
               WHERE cs.code=ANY($1::text[])`,
        values: [skillCodes],
      })
    : { rows: [] };
  const row = applicationResult.rows[0];
  return aggregateApplicationReport(
    {
      id: row.id,
      title: row.title,
      className: row.class_name,
      grade: row.grade,
      schoolYear: row.school_year,
    },
    result.rows,
    competencyResult.rows,
  );
}
