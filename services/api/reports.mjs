import path from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool, transaction } from './db.mjs';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const outputRoot = path.resolve(
  projectRoot,
  process.env.RENDER_OUTPUT_DIR || 'outputs/renders',
);

const percentage = (correct, total) =>
  total ? Math.round((correct / total) * 1000) / 10 : 0;

const classification = (value) =>
  value >= 80
    ? 'Consolidado'
    : value >= 60
      ? 'Adequado'
      : value >= 40
        ? 'Em desenvolvimento'
        : 'Requer intervenção';

const rounded = (value) => Math.round(value * 10) / 10;

export function aggregateApplicationReport(application, rows, competencies) {
  const competencyBySkill = new Map();
  for (const competency of competencies) {
    const list = competencyBySkill.get(competency.skill_code) ?? [];
    list.push(competency);
    competencyBySkill.set(competency.skill_code, list);
  }
  const skillStats = new Map();
  const descriptorStats = new Map();
  const competencyStats = new Map();
  const questionStats = new Map();
  const add = (map, key, metadata, status) => {
    const value = map.get(key) ?? {
      ...metadata,
      correct: 0,
      incorrect: 0,
      unanswered: 0,
      total: 0,
    };
    value.total += 1;
    if (status === 'correct') value.correct += 1;
    else if (status === 'incorrect') value.incorrect += 1;
    else value.unanswered += 1;
    map.set(key, value);
  };
  for (const row of rows) {
    for (const item of row.result?.items ?? []) {
      for (const skill of item.skills ?? []) {
        add(
          skillStats,
          skill.code,
          { code: skill.code, primary: Boolean(skill.primary) },
          item.status,
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
            item.status,
          );
      }
      for (const descriptor of item.saebDescriptors ?? [])
        add(
          descriptorStats,
          descriptor.code,
          {
            code: descriptor.code,
            topic: descriptor.topic,
            primary: Boolean(descriptor.primary),
          },
          item.status,
        );
      const question = questionStats.get(item.questionNumber) ?? {
        questionNumber: item.questionNumber,
        correct: 0,
        incorrect: 0,
        unanswered: 0,
        total: 0,
        selectedDistribution: {},
      };
      question.total += 1;
      if (item.status === 'correct') question.correct += 1;
      else if (item.status === 'incorrect') question.incorrect += 1;
      else question.unanswered += 1;
      for (const label of item.selectedLabels ?? [])
        question.selectedDistribution[label] =
          (question.selectedDistribution[label] ?? 0) + 1;
      questionStats.set(item.questionNumber, question);
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
  const scorePercentages = scores
    .map((row) => (Number(row.score) / Number(row.max_score)) * 100)
    .sort((left, right) => left - right);
  const medianPercentage = scorePercentages.length
    ? rounded(
        scorePercentages.length % 2
          ? scorePercentages[Math.floor(scorePercentages.length / 2)]
          : (scorePercentages[scorePercentages.length / 2 - 1] +
              scorePercentages[scorePercentages.length / 2]) /
              2,
      )
    : 0;
  const standardDeviation = scorePercentages.length
    ? rounded(
        Math.sqrt(
          scorePercentages.reduce(
            (sum, value) => sum + (value - averagePercentage) ** 2,
            0,
          ) / scorePercentages.length,
        ),
      )
    : 0;
  const withPercentage = (values) =>
    [...values]
      .map((value) => ({
        ...value,
        validAnswers: value.correct + value.incorrect,
        percentage: percentage(value.correct, value.correct + value.incorrect),
        classification: classification(
          percentage(value.correct, value.correct + value.incorrect),
        ),
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
      medianPercentage,
      standardDeviation,
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
    saebDescriptors: withPercentage(descriptorStats.values()),
    competencies: withPercentage(competencyStats.values()),
    questions: withPercentage(questionStats.values()).sort(
      (left, right) => left.questionNumber - right.questionNumber,
    ),
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

export async function createApplicationReportRender({
  institutionId,
  userId,
  applicationId,
}) {
  const report = await getApplicationReport({ institutionId, applicationId });
  if (!report) return null;
  return transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [
      applicationId,
    ]);
    const versionResult = await client.query(
      `SELECT COALESCE(MAX(version), 0)::int + 1 AS version
       FROM application_report_snapshots
       WHERE application_id = $1 AND scope_type = 'class'`,
      [applicationId],
    );
    const snapshot = {
      schemaVersion: '1.0',
      generatedAt: new Date().toISOString(),
      scope: { type: 'class' },
      ...report,
    };
    const saved = await client.query(
      `INSERT INTO application_report_snapshots
         (application_id, version, schema_version, snapshot, created_by)
       VALUES ($1, $2, '1.0', $3::jsonb, $4)
       RETURNING id, version, created_at`,
      [
        applicationId,
        versionResult.rows[0].version,
        JSON.stringify(snapshot),
        userId,
      ],
    );
    const job = await client.query(
      `INSERT INTO application_report_render_jobs (report_snapshot_id)
       VALUES ($1) RETURNING id, status, created_at`,
      [saved.rows[0].id],
    );
    return {
      id: job.rows[0].id,
      status: job.rows[0].status,
      reportSnapshotId: saved.rows[0].id,
      version: saved.rows[0].version,
      createdAt: job.rows[0].created_at,
    };
  });
}

export async function getStudentApplicationReport({
  institutionId,
  applicationId,
  studentId,
}) {
  const classReport = await getApplicationReport({
    institutionId,
    applicationId,
  });
  if (!classReport) return null;
  const result = await pool.query({
    text: `SELECT s.id AS student_id,s.name AS student_name,s.registration,ce.number,
                  av.code AS version_code,scan.status AS scan_status,
                  sub.id AS submission_id,sub.score,sub.max_score,
                  sub.requires_manual_review,sub.result
           FROM application_students aps
           JOIN assessment_applications aa ON aa.id=aps.application_id
           JOIN students s ON s.id=aps.student_id
           JOIN assessment_versions av ON av.id=aps.assessment_version_id
           LEFT JOIN class_enrollments ce ON ce.class_id=aa.class_id AND ce.student_id=s.id
           LEFT JOIN LATERAL (
             SELECT cs.status,cs.submission_id FROM card_scans cs
             WHERE cs.application_student_id=aps.id
             ORDER BY cs.completed_at DESC NULLS LAST,cs.created_at DESC LIMIT 1
           ) scan ON true
           LEFT JOIN assessment_submissions sub ON sub.id=scan.submission_id
           WHERE aps.application_id=$1 AND aps.student_id=$2 AND aa.institution_id=$3`,
    values: [applicationId, studentId, institutionId],
  });
  if (!result.rowCount) return null;
  const row = result.rows[0];
  if (!row.submission_id)
    throw Object.assign(
      new Error('O aluno ainda não possui correção concluída.'),
      {
        statusCode: 409,
      },
    );
  const skillCodes = [
    ...new Set(
      (row.result?.items ?? []).flatMap((item) =>
        (item.skills ?? []).map((skill) => skill.code),
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
  const individual = aggregateApplicationReport(
    classReport.application,
    [row],
    competencyResult.rows,
  );
  const studentPercentage = individual.students[0].percentage ?? 0;
  const items = row.result?.items ?? [];
  return {
    application: classReport.application,
    student: {
      id: row.student_id,
      name: row.student_name,
      registration: row.registration,
      number: row.number,
      versionCode: row.version_code,
    },
    summary: {
      score: Number(row.score),
      maxScore: Number(row.max_score),
      percentage: studentPercentage,
      classAveragePercentage: classReport.summary.averagePercentage,
      differenceFromClass: rounded(
        studentPercentage - classReport.summary.averagePercentage,
      ),
      correct: items.filter((item) => item.status === 'correct').length,
      incorrect: items.filter((item) => item.status === 'incorrect').length,
      unanswered: items.filter((item) => item.status === 'unanswered').length,
    },
    skills: individual.skills,
    competencies: individual.competencies,
    saebDescriptors: individual.saebDescriptors,
    questions: items.map((item) => ({
      questionNumber: item.questionNumber,
      status: item.status,
      selectedLabels: item.selectedLabels ?? [],
      correctLabels: item.correctLabels ?? [],
      skills: item.skills ?? [],
      saebDescriptors: item.saebDescriptors ?? [],
    })),
  };
}

export async function createStudentReportRender({
  institutionId,
  userId,
  applicationId,
  studentId,
}) {
  const report = await getStudentApplicationReport({
    institutionId,
    applicationId,
    studentId,
  });
  if (!report) return null;
  return transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [
      `${applicationId}:${studentId}`,
    ]);
    const versionResult = await client.query(
      `SELECT COALESCE(MAX(version), 0)::int + 1 AS version
       FROM application_report_snapshots
       WHERE application_id=$1 AND scope_type='student' AND student_id=$2`,
      [applicationId, studentId],
    );
    const snapshot = {
      schemaVersion: '1.0',
      generatedAt: new Date().toISOString(),
      scope: { type: 'student' },
      ...report,
    };
    const saved = await client.query(
      `INSERT INTO application_report_snapshots
         (application_id,scope_type,student_id,version,schema_version,snapshot,created_by)
       VALUES ($1,'student',$2,$3,'1.0',$4::jsonb,$5) RETURNING id,version`,
      [
        applicationId,
        studentId,
        versionResult.rows[0].version,
        JSON.stringify(snapshot),
        userId,
      ],
    );
    const job = await client.query(
      `INSERT INTO application_report_render_jobs (report_snapshot_id,template_version)
       VALUES ($1,'student-report-v1') RETURNING id,status,created_at`,
      [saved.rows[0].id],
    );
    return {
      id: job.rows[0].id,
      status: job.rows[0].status,
      reportSnapshotId: saved.rows[0].id,
      version: saved.rows[0].version,
      createdAt: job.rows[0].created_at,
    };
  });
}

export function aggregateStudentProgress(student, rows, competencies) {
  const competencyBySkill = new Map();
  for (const competency of competencies) {
    const linked = competencyBySkill.get(competency.skill_code) ?? [];
    linked.push(competency);
    competencyBySkill.set(competency.skill_code, linked);
  }
  const dimensions = {
    skills: new Map(),
    competencies: new Map(),
    saebDescriptors: new Map(),
  };
  const add = (map, key, metadata, status) => {
    const item = map.get(key) ?? {
      ...metadata,
      correct: 0,
      incorrect: 0,
      unanswered: 0,
      total: 0,
      assessments: new Set(),
    };
    item.total += 1;
    item.assessments.add(metadata.applicationId);
    if (status === 'correct') item.correct += 1;
    else if (status === 'incorrect') item.incorrect += 1;
    else item.unanswered += 1;
    map.set(key, item);
  };
  let previousPercentage = null;
  const timeline = rows.map((row) => {
    for (const item of row.result?.items ?? []) {
      for (const skill of item.skills ?? []) {
        add(
          dimensions.skills,
          skill.code,
          { code: skill.code, applicationId: row.application_id },
          item.status,
        );
        for (const competency of competencyBySkill.get(skill.code) ?? [])
          add(
            dimensions.competencies,
            competency.source_key,
            {
              sourceKey: competency.source_key,
              code: `Competência ${competency.number}`,
              number: competency.number,
              description: competency.description,
              area: competency.area_name,
              applicationId: row.application_id,
            },
            item.status,
          );
      }
      for (const descriptor of item.saebDescriptors ?? [])
        add(
          dimensions.saebDescriptors,
          descriptor.code,
          {
            code: descriptor.code,
            topic: descriptor.topic,
            applicationId: row.application_id,
          },
          item.status,
        );
    }
    const value = Number(row.max_score)
      ? rounded((Number(row.score) / Number(row.max_score)) * 100)
      : 0;
    const timelineItem = {
      applicationId: row.application_id,
      title: row.assessment_title,
      className: row.class_name,
      scheduledAt: row.scheduled_at ?? row.submitted_at,
      score: Number(row.score),
      maxScore: Number(row.max_score),
      percentage: value,
      change:
        previousPercentage == null ? null : rounded(value - previousPercentage),
    };
    previousPercentage = value;
    return timelineItem;
  });
  const summarize = (map) =>
    [...map.values()]
      .map(({ assessments, applicationId: _applicationId, ...item }) => ({
        ...item,
        assessments: assessments.size,
        validAnswers: item.correct + item.incorrect,
        percentage: percentage(item.correct, item.correct + item.incorrect),
        classification: classification(
          percentage(item.correct, item.correct + item.incorrect),
        ),
      }))
      .sort((left, right) => left.percentage - right.percentage);
  const percentages = timeline.map((item) => item.percentage);
  return {
    student,
    summary: {
      assessments: timeline.length,
      averagePercentage: percentages.length
        ? rounded(
            percentages.reduce((sum, value) => sum + value, 0) /
              percentages.length,
          )
        : 0,
      bestPercentage: percentages.length ? Math.max(...percentages) : 0,
      currentPercentage: percentages.at(-1) ?? 0,
      trend:
        percentages.length > 1
          ? rounded(percentages.at(-1) - percentages[0])
          : 0,
    },
    timeline,
    skills: summarize(dimensions.skills),
    competencies: summarize(dimensions.competencies),
    saebDescriptors: summarize(dimensions.saebDescriptors),
  };
}

export async function getStudentProgress({ institutionId, studentId }) {
  const studentResult = await pool.query({
    text: `SELECT id,name,registration,active FROM students
           WHERE id=$1 AND institution_id=$2`,
    values: [studentId, institutionId],
  });
  if (!studentResult.rowCount) return null;
  const result = await pool.query({
    text: `SELECT aa.id AS application_id,a.title AS assessment_title,c.name AS class_name,
                  aa.scheduled_at,sub.submitted_at,sub.score,sub.max_score,sub.result
           FROM application_students aps
           JOIN assessment_applications aa ON aa.id=aps.application_id
           JOIN assessments a ON a.id=aa.assessment_id
           JOIN classes c ON c.id=aa.class_id
           JOIN LATERAL (
             SELECT submission.id AS submission_id
             FROM card_scans scan
             JOIN assessment_submissions submission ON submission.id=scan.submission_id
             WHERE scan.application_student_id=aps.id
             ORDER BY scan.completed_at DESC NULLS LAST,scan.created_at DESC LIMIT 1
           ) latest ON true
           JOIN assessment_submissions sub ON sub.id=latest.submission_id
           WHERE aps.student_id=$1 AND aa.institution_id=$2
           ORDER BY COALESCE(aa.scheduled_at,sub.submitted_at),sub.submitted_at`,
    values: [studentId, institutionId],
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
  const student = studentResult.rows[0];
  return aggregateStudentProgress(
    {
      id: student.id,
      name: student.name,
      registration: student.registration,
      active: student.active,
    },
    result.rows,
    competencyResult.rows,
  );
}

export async function getApplicationReportRender({ institutionId, jobId }) {
  const result = await pool.query({
    text: `SELECT job.id, job.status, job.error_message, job.output_manifest,
                  job.created_at, job.completed_at, snapshot.version
           FROM application_report_render_jobs job
           JOIN application_report_snapshots snapshot ON snapshot.id = job.report_snapshot_id
           JOIN assessment_applications application ON application.id = snapshot.application_id
           WHERE job.id = $1 AND application.institution_id = $2`,
    values: [jobId, institutionId],
  });
  if (!result.rowCount) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    status: row.status,
    error: row.status === 'failed' ? row.error_message : null,
    version: row.version,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    download:
      row.status === 'completed'
        ? `/api/report-render-jobs/${row.id}/pdf`
        : null,
  };
}

export async function getApplicationReportFile({ institutionId, jobId }) {
  const result = await pool.query({
    text: `SELECT job.status, job.output_manifest
           FROM application_report_render_jobs job
           JOIN application_report_snapshots snapshot ON snapshot.id = job.report_snapshot_id
           JOIN assessment_applications application ON application.id = snapshot.application_id
           WHERE job.id = $1 AND application.institution_id = $2`,
    values: [jobId, institutionId],
  });
  if (!result.rowCount)
    return { status: 404, error: 'Relatório não encontrado.' };
  if (result.rows[0].status === 'failed')
    return { status: 422, error: 'A composição do relatório falhou.' };
  if (result.rows[0].status !== 'completed')
    return { status: 409, error: 'O relatório ainda está sendo composto.' };
  const relative = result.rows[0].output_manifest?.pdf;
  const file = path.resolve(outputRoot, relative || '');
  if (!relative || !file.startsWith(`${outputRoot}${path.sep}`))
    return { status: 500, error: 'Manifesto de saída inválido.' };
  try {
    const metadata = await stat(file);
    return { status: 200, size: metadata.size, stream: createReadStream(file) };
  } catch {
    return {
      status: 410,
      error: 'O PDF do relatório não está mais disponível.',
    };
  }
}
