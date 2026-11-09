import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from './db.mjs';
import { mobileMutation } from './mobile-mutations.mjs';
import {
  minimumExpectedPercent,
  isBelowExpected,
  normalizeFollowup,
  LOW_PERFORMANCE_REASONS,
  PEDAGOGICAL_ACTIONS,
} from './assessment-results.mjs';
import { recordResultVersion, manualPointsFrom } from './result-versions.mjs';

// Revisão e autorização de lançamento pelo professor. Toda consulta é
// filtrada pela instituição da sessão; um ID de outra instituição responde
// como inexistente.

const notFound = (message) =>
  Object.assign(new Error(message), { statusCode: 404 });
const number = (value) => (value == null ? null : Number(value));

export const resultSettingsSchema = z
  .object({
    minExpectedPercent: z.number().min(0).max(100).nullable().default(null),
    releasePolicy: z
      .enum(['summary', 'answers', 'answers_and_key'])
      .default('summary'),
    annulledQuestions: z
      .array(z.number().int().positive())
      .max(1000)
      .default([]),
    annulledPolicy: z.enum(['exclude', 'award_full']).nullable().default(null),
  })
  .strict();

export const authorizeSchema = z
  .object({
    clientMutationId: z.uuid().optional(),
    applicationId: z.uuid(),
    items: z
      .array(z.object({ resultId: z.uuid(), versionId: z.uuid() }).strict())
      .min(1)
      .max(500),
  })
  .strict();

async function loadApplication(db, { institutionId, applicationId }) {
  const application = await db.query(
    `SELECT aa.id,aa.status,aa.scheduled_at,a.title,a.subject,c.id class_id,c.name class_name,c.school_id,
            rs.min_expected_percent,rs.release_policy,rs.annulled_questions,rs.annulled_policy,rs.updated_at settings_updated_at
     FROM assessment_applications aa
     JOIN assessments a ON a.id=aa.assessment_id
     JOIN classes c ON c.id=aa.class_id
     LEFT JOIN application_result_settings rs ON rs.application_id=aa.id
     WHERE aa.id=$1 AND aa.institution_id=$2`,
    [applicationId, institutionId],
  );
  if (!application.rowCount) throw notFound('Aplicação não encontrada.');
  const row = application.rows[0];
  const thresholds = await db.query(
    `SELECT school_id "schoolId",subject,min_expected_percent "minExpectedPercent" FROM performance_thresholds WHERE institution_id=$1`,
    [institutionId],
  );
  const questions = await db.query(
    `SELECT DISTINCT av.id,jsonb_array_length(av.snapshot->'questions') questions
     FROM application_students aps JOIN assessment_versions av ON av.id=aps.assessment_version_id
     WHERE aps.application_id=$1`,
    [applicationId],
  );
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    classId: row.class_id,
    className: row.class_name,
    schoolId: row.school_id,
    status: row.status,
    scheduledAt: row.scheduled_at,
    questionCounts: [
      ...new Set(questions.rows.map((version) => version.questions)),
    ],
    settings: {
      minExpectedPercent: number(row.min_expected_percent),
      releasePolicy: row.release_policy ?? 'summary',
      annulledQuestions: row.annulled_questions ?? [],
      annulledPolicy: row.annulled_policy ?? null,
      updatedAt: row.settings_updated_at ?? null,
    },
    minExpectedPercent: minimumExpectedPercent({
      applicationPercent: row.min_expected_percent,
      thresholds: thresholds.rows,
      schoolId: row.school_id,
      subject: row.subject,
    }),
  };
}

// Visão do professor: todos os alunos da aplicação com o resultado atual,
// pendências e a versão publicada.
export async function listApplicationResults({ institutionId, applicationId }) {
  const application = await loadApplication(pool, {
    institutionId,
    applicationId,
  });
  const rows = await pool.query(
    `SELECT aps.id application_student_id,s.name student_name,s.registration,ce.number,
            ar.id result_id,ar.processing_status,ar.publication_status,ar.current_version_id,ar.published_version_id,
            cv.version_number,cv.source,cv.question_count,cv.valid_count,cv.correct_count,cv.incorrect_count,cv.blank_count,
            cv.invalid_count,cv.annulled_count,cv.review_pending_count,cv.manual_pending_count,cv.percent,cv.score,cv.max_score,
            cv.card_scan_id,cv.created_at version_created_at,
            pv.version_number published_version_number,pub.authorized_at,pub.authorizer_name,pub.legacy,
            (SELECT count(*)::int FROM card_scans cs WHERE cs.application_student_id=aps.id AND cs.status='review') scans_in_review,
            (SELECT f.status FROM performance_followups f WHERE f.result_id=ar.id ORDER BY f.created_at DESC LIMIT 1) followup_status
     FROM application_students aps
     JOIN assessment_applications aa ON aa.id=aps.application_id AND aa.institution_id=$2
     JOIN students s ON s.id=aps.student_id
     LEFT JOIN class_enrollments ce ON ce.class_id=aa.class_id AND ce.student_id=s.id
     LEFT JOIN assessment_results ar ON ar.application_student_id=aps.id
     LEFT JOIN assessment_result_versions cv ON cv.id=ar.current_version_id
     LEFT JOIN assessment_result_versions pv ON pv.id=ar.published_version_id
     LEFT JOIN assessment_result_publications pub ON pub.result_version_id=ar.published_version_id
     WHERE aps.application_id=$1
     ORDER BY ce.number NULLS LAST,s.name`,
    [applicationId, institutionId],
  );
  const students = rows.rows.map((row) => {
    const pending =
      (row.review_pending_count ?? 0) + (row.manual_pending_count ?? 0);
    const percent = number(row.percent);
    return {
      applicationStudentId: row.application_student_id,
      studentName: row.student_name,
      registration: row.registration,
      number: row.number,
      resultId: row.result_id,
      processingStatus: row.processing_status ?? 'not_scanned',
      publicationStatus: row.publication_status ?? 'unpublished',
      currentVersionId: row.current_version_id,
      currentVersion: row.version_number,
      source: row.source,
      counts: row.result_id
        ? {
            questions: row.question_count,
            valid: row.valid_count,
            correct: row.correct_count,
            incorrect: row.incorrect_count,
            blank: row.blank_count,
            invalid: row.invalid_count,
            annulled: row.annulled_count,
            reviewPending: row.review_pending_count,
            manualPending: row.manual_pending_count,
          }
        : null,
      percent,
      score: number(row.score),
      maxScore: number(row.max_score),
      cardScanId: row.card_scan_id,
      scansInReview: row.scans_in_review,
      // Sem pendência de leitura e sem outro cartão aguardando decisão.
      publishable:
        Boolean(row.result_id) && pending === 0 && row.scans_in_review === 0,
      published: row.published_version_id
        ? {
            versionId: row.published_version_id,
            version: row.published_version_number,
            authorizedAt: row.authorized_at,
            authorizerName: row.authorizer_name,
            legacy: row.legacy,
          }
        : null,
      belowExpected: isBelowExpected(percent, application.minExpectedPercent),
      followupStatus: row.followup_status ?? null,
    };
  });
  return { application, students };
}

export async function getResultDetail({ institutionId, resultId }) {
  const result = await pool.query(
    `SELECT ar.*,aps.application_id,s.name student_name,s.registration
     FROM assessment_results ar
     JOIN application_students aps ON aps.id=ar.application_student_id
     JOIN students s ON s.id=aps.student_id
     WHERE ar.id=$1 AND ar.institution_id=$2`,
    [resultId, institutionId],
  );
  if (!result.rowCount) throw notFound('Resultado não encontrado.');
  const row = result.rows[0];
  const [versions, changes, publications, scans, followups, application] =
    await Promise.all([
      pool.query(
        `SELECT v.id,v.version_number,v.source,v.card_scan_id,v.items,v.scoring_rule,v.question_count,v.valid_count,
              v.correct_count,v.incorrect_count,v.blank_count,v.invalid_count,v.annulled_count,v.review_pending_count,
              v.manual_pending_count,v.percent,v.score,v.max_score,v.created_at,u.display_name created_by_name
       FROM assessment_result_versions v LEFT JOIN users u ON u.id=v.created_by
       WHERE v.result_id=$1 ORDER BY v.version_number DESC`,
        [resultId],
      ),
      pool.query(
        `SELECT c.question_number,c.previous_labels,c.new_labels,c.previous_status,c.new_status,c.changed_at,
              u.display_name changed_by_name,fv.version_number from_version,tv.version_number to_version
       FROM assessment_result_changes c LEFT JOIN users u ON u.id=c.changed_by
       LEFT JOIN assessment_result_versions fv ON fv.id=c.from_version_id
       JOIN assessment_result_versions tv ON tv.id=c.to_version_id
       WHERE c.result_id=$1 ORDER BY c.changed_at DESC,c.question_number`,
        [resultId],
      ),
      pool.query(
        `SELECT p.id,v.version_number,p.authorizer_name,p.authorized_at,p.legacy,p.superseded_at,p.batch_id
       FROM assessment_result_publications p JOIN assessment_result_versions v ON v.id=p.result_version_id
       WHERE p.result_id=$1 ORDER BY p.authorized_at DESC`,
        [resultId],
      ),
      pool.query(
        `SELECT id,status,created_at,completed_at,(review_image_data IS NOT NULL) image_available,result->>'duplicateOfScanId' duplicate_of
       FROM card_scans WHERE application_student_id=$1 AND institution_id=$2 ORDER BY created_at DESC`,
        [row.application_student_id, institutionId],
      ),
      followupHistory(pool, resultId),
      loadApplication(pool, {
        institutionId,
        applicationId: row.application_id,
      }),
    ]);
  const version = (v) => ({
    id: v.id,
    version: v.version_number,
    source: v.source,
    cardScanId: v.card_scan_id,
    items: v.items,
    scoringRule: v.scoring_rule,
    counts: {
      questions: v.question_count,
      valid: v.valid_count,
      correct: v.correct_count,
      incorrect: v.incorrect_count,
      blank: v.blank_count,
      invalid: v.invalid_count,
      annulled: v.annulled_count,
      reviewPending: v.review_pending_count,
      manualPending: v.manual_pending_count,
    },
    percent: number(v.percent),
    score: number(v.score),
    maxScore: number(v.max_score),
    createdAt: v.created_at,
    createdByName: v.created_by_name,
  });
  return {
    id: row.id,
    applicationId: row.application_id,
    applicationStudentId: row.application_student_id,
    studentName: row.student_name,
    registration: row.registration,
    processingStatus: row.processing_status,
    publicationStatus: row.publication_status,
    currentVersionId: row.current_version_id,
    publishedVersionId: row.published_version_id,
    versions: versions.rows.map(version),
    changes: changes.rows.map((c) => ({
      questionNumber: c.question_number,
      previousLabels: c.previous_labels,
      newLabels: c.new_labels,
      previousStatus: c.previous_status,
      newStatus: c.new_status,
      changedAt: c.changed_at,
      changedByName: c.changed_by_name,
      fromVersion: c.from_version,
      toVersion: c.to_version,
    })),
    publications: publications.rows.map((p) => ({
      id: p.id,
      version: p.version_number,
      authorizerName: p.authorizer_name,
      authorizedAt: p.authorized_at,
      legacy: p.legacy,
      supersededAt: p.superseded_at,
      batchId: p.batch_id,
    })),
    minExpectedPercent: application.minExpectedPercent,
    belowExpected: isBelowExpected(
      number(
        versions.rows.find((v) => v.id === row.current_version_id)?.percent,
      ),
      application.minExpectedPercent,
    ),
    followups,
    scans: scans.rows.map((s) => ({
      id: s.id,
      status: s.status,
      createdAt: s.created_at,
      completedAt: s.completed_at,
      imageAvailable: s.image_available,
      duplicateOfScanId: s.duplicate_of,
    })),
  };
}

// Autoriza o lançamento de uma ou várias versões, na mesma transação. Cada
// item informa a versão que o professor conferiu: se outra versão surgiu
// depois, o item é recusado como 'stale' em vez de publicar algo não visto.
export async function authorizeResults({ institutionId, userId, input }) {
  const value = authorizeSchema.parse(input);
  return transaction((client) =>
    mobileMutation(
      client,
      {
        institutionId,
        userId,
        requestId: value.clientMutationId,
        kind: 'result-authorize',
        entityId: value.applicationId,
        input: value,
      },
      async () => {
        await loadApplication(client, {
          institutionId,
          applicationId: value.applicationId,
        });
        const author = (
          await client.query(
            "SELECT coalesce(nullif(display_name,''),email) name FROM users WHERE id=$1",
            [userId],
          )
        ).rows[0];
        if (!author)
          throw Object.assign(new Error('Conta não encontrada.'), {
            statusCode: 401,
          });
        const rows = await client.query(
          `SELECT ar.id,ar.current_version_id,ar.published_version_id,
              v.review_pending_count+v.manual_pending_count pending,
              (SELECT count(*)::int FROM card_scans cs WHERE cs.application_student_id=ar.application_student_id AND cs.status='review') scans_in_review
       FROM assessment_results ar
       JOIN application_students aps ON aps.id=ar.application_student_id
       LEFT JOIN assessment_result_versions v ON v.id=ar.current_version_id
       WHERE ar.institution_id=$1 AND aps.application_id=$2 AND ar.id=ANY($3::uuid[])
       ORDER BY ar.id FOR UPDATE OF ar`,
          [
            institutionId,
            value.applicationId,
            value.items.map((item) => item.resultId),
          ],
        );
        const byId = new Map(rows.rows.map((row) => [row.id, row]));
        const batchId = randomUUID();
        const outcomes = [];
        for (const item of value.items) {
          const row = byId.get(item.resultId);
          let outcome;
          if (!row) outcome = 'not_found';
          else if (row.current_version_id !== item.versionId) outcome = 'stale';
          else if (row.pending > 0 || row.scans_in_review > 0)
            outcome = 'pending_review';
          else if (row.published_version_id === item.versionId)
            outcome = 'already_published';
          else {
            await client.query(
              'UPDATE assessment_result_publications SET superseded_at=now() WHERE result_id=$1 AND superseded_at IS NULL',
              [row.id],
            );
            await client.query(
              `INSERT INTO assessment_result_publications(result_id,result_version_id,authorized_by,authorizer_name,batch_id)
           VALUES($1,$2,$3,$4,$5)`,
              [row.id, item.versionId, userId, author.name, batchId],
            );
            await client.query(
              `UPDATE assessment_results SET published_version_id=$2,publication_status='published',updated_at=now() WHERE id=$1`,
              [row.id, item.versionId],
            );
            outcome = 'published';
          }
          outcomes.push({
            resultId: item.resultId,
            versionId: item.versionId,
            outcome,
          });
        }
        const published = outcomes.filter(
          (item) => item.outcome === 'published',
        );
        if (published.length)
          await client.query(
            `INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'result.authorize','application',$3,$4::jsonb)`,
            [
              institutionId,
              userId,
              value.applicationId,
              JSON.stringify({
                batchId,
                versions: published.map((item) => item.versionId),
              }),
            ],
          );
        return { batchId, published: published.length, items: outcomes };
      },
    ),
  );
}

// Recalcula todos os resultados da aplicação com a regra atual. Resultados
// publicados passam a exigir nova autorização; o aluno continua vendo a
// versão publicada até lá.
async function recalculateApplication(client, { applicationId, userId }) {
  const results = await client.query(
    `SELECT ar.application_student_id,v.items,v.card_scan_id,v.submission_id,sub.result submission_result
     FROM assessment_results ar
     JOIN application_students aps ON aps.id=ar.application_student_id
     JOIN assessment_result_versions v ON v.id=ar.current_version_id
     LEFT JOIN assessment_submissions sub ON sub.id=v.submission_id
     WHERE aps.application_id=$1 ORDER BY ar.id`,
    [applicationId],
  );
  let created = 0;
  for (const row of results.rows) {
    const answers = row.items
      .filter(
        (item) =>
          Array.isArray(item.correctLabels) ||
          (item.status === 'annulled' && Array.isArray(item.selectedLabels)),
      )
      .map((item) => ({
        questionNumber: item.questionNumber,
        selectedLabels: item.selectedLabels ?? [],
        status:
          item.answerStatus ??
          (item.status === 'review_pending' ? 'uncertain' : 'confirmed'),
      }));
    const manualPoints = manualPointsFrom(row.submission_result);
    for (const item of row.items)
      if (item.status === 'manual_graded')
        manualPoints.set(item.questionNumber, Number(item.awardedPoints));
    const version = await recordResultVersion(client, {
      applicationStudentId: row.application_student_id,
      source: 'recalculation',
      answers,
      manualPoints,
      cardScanId: row.card_scan_id,
      submissionId: row.submission_id,
      userId,
    });
    if (version.created) created += 1;
  }
  return created;
}

export async function getResultSettings(
  { institutionId, applicationId },
  db = pool,
) {
  const application = await loadApplication(db, {
    institutionId,
    applicationId,
  });
  return {
    ...application.settings,
    effectiveMinExpectedPercent: application.minExpectedPercent,
  };
}

export async function saveResultSettings({
  institutionId,
  userId,
  applicationId,
  input,
}) {
  const value = resultSettingsSchema.parse(input);
  const annulledQuestions = [...new Set(value.annulledQuestions)].sort(
    (a, b) => a - b,
  );
  if (annulledQuestions.length && !value.annulledPolicy)
    throw Object.assign(
      new Error('Defina como as questões anuladas serão pontuadas.'),
      { statusCode: 422 },
    );
  return transaction(async (client) => {
    await client.query(
      'SELECT 1 FROM assessment_applications WHERE id=$1 AND institution_id=$2 FOR UPDATE',
      [applicationId, institutionId],
    );
    const application = await loadApplication(client, {
      institutionId,
      applicationId,
    });
    if (annulledQuestions.length) {
      const versions = await client.query(
        `SELECT DISTINCT av.snapshot FROM application_students aps JOIN assessment_versions av ON av.id=aps.assessment_version_id WHERE aps.application_id=$1`,
        [applicationId],
      );
      for (const { snapshot } of versions.rows) {
        const numbers = new Set(
          (snapshot.questions ?? []).map((question) => question.number),
        );
        const unknown = annulledQuestions.find(
          (question) => !numbers.has(question),
        );
        if (unknown)
          throw Object.assign(
            new Error(
              `A questão ${unknown} não existe em todas as versões desta aplicação.`,
            ),
            { statusCode: 422 },
          );
      }
    }
    const previous = application.settings;
    await client.query(
      `INSERT INTO application_result_settings(application_id,institution_id,min_expected_percent,release_policy,annulled_questions,annulled_policy,updated_by,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,now())
       ON CONFLICT (application_id) DO UPDATE SET min_expected_percent=EXCLUDED.min_expected_percent,release_policy=EXCLUDED.release_policy,
         annulled_questions=EXCLUDED.annulled_questions,annulled_policy=EXCLUDED.annulled_policy,updated_by=EXCLUDED.updated_by,updated_at=now()`,
      [
        applicationId,
        institutionId,
        value.minExpectedPercent,
        value.releasePolicy,
        annulledQuestions,
        annulledQuestions.length ? value.annulledPolicy : null,
        userId,
      ],
    );
    const ruleChanged =
      JSON.stringify(previous.annulledQuestions) !==
        JSON.stringify(annulledQuestions) ||
      (previous.annulledPolicy ?? null) !==
        (annulledQuestions.length ? value.annulledPolicy : null);
    const recalculated = ruleChanged
      ? await recalculateApplication(client, { applicationId, userId })
      : 0;
    await client.query(
      `INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'result.settings','application',$3,$4::jsonb)`,
      [
        institutionId,
        userId,
        applicationId,
        JSON.stringify({ ...value, annulledQuestions, recalculated }),
      ],
    );
    return {
      ...(await getResultSettings({ institutionId, applicationId }, client)),
      recalculated,
    };
  });
}

// Acompanhamento de baixo rendimento. Cada registro é acrescentado ao
// histórico; nenhum é alterado ou apagado. Motivos e ações vêm de listas
// fechadas e são sempre escolhidos pelo professor.
export const followupSchema = z
  .object({
    clientMutationId: z.uuid().optional(),
    reasons: z
      .array(z.enum(Object.keys(LOW_PERFORMANCE_REASONS)))
      .max(7)
      .default([]),
    otherReason: z.string().max(1000).optional(),
    actions: z
      .array(z.enum(Object.keys(PEDAGOGICAL_ACTIONS)))
      .max(5)
      .default([]),
    internalNote: z.string().max(4000).optional(),
    studentGuidance: z.string().max(4000).optional(),
    publishGuidance: z.boolean().default(false),
  })
  .strict();

async function followupHistory(db, resultId) {
  const rows = await db.query(
    `SELECT f.id,f.status,f.reasons,f.other_reason,f.actions,f.internal_note,f.student_guidance,f.student_guidance_published,
            f.created_at,u.display_name created_by_name,v.version_number
     FROM performance_followups f LEFT JOIN users u ON u.id=f.created_by
     LEFT JOIN assessment_result_versions v ON v.id=f.result_version_id
     WHERE f.result_id=$1 ORDER BY f.created_at DESC,f.id`,
    [resultId],
  );
  return rows.rows.map((f) => ({
    id: f.id,
    status: f.status,
    reasons: f.reasons,
    otherReason: f.other_reason,
    actions: f.actions,
    internalNote: f.internal_note,
    studentGuidance: f.student_guidance,
    studentGuidancePublished: f.student_guidance_published,
    createdAt: f.created_at,
    createdByName: f.created_by_name,
    resultVersion: f.version_number,
  }));
}

export async function listFollowups({ institutionId, resultId }) {
  const owner = await pool.query(
    'SELECT 1 FROM assessment_results WHERE id=$1 AND institution_id=$2',
    [resultId, institutionId],
  );
  if (!owner.rowCount) throw notFound('Resultado não encontrado.');
  return followupHistory(pool, resultId);
}

export async function saveFollowup({ institutionId, userId, resultId, input }) {
  const value = followupSchema.parse(input);
  const entry = normalizeFollowup(value);
  return transaction((client) =>
    mobileMutation(
      client,
      {
        institutionId,
        userId,
        requestId: value.clientMutationId,
        kind: 'result-followup',
        entityId: resultId,
        input: value,
      },
      async () => {
        const result = await client.query(
          'SELECT id,current_version_id FROM assessment_results WHERE id=$1 AND institution_id=$2 FOR UPDATE',
          [resultId, institutionId],
        );
        if (!result.rowCount) throw notFound('Resultado não encontrado.');
        const saved = (
          await client.query(
            `INSERT INTO performance_followups(institution_id,result_id,result_version_id,status,reasons,other_reason,actions,internal_note,student_guidance,student_guidance_published,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
            [
              institutionId,
              resultId,
              result.rows[0].current_version_id,
              entry.status,
              entry.reasons,
              entry.otherReason,
              entry.actions,
              entry.internalNote,
              entry.studentGuidance,
              entry.studentGuidancePublished,
              userId,
            ],
          )
        ).rows[0];
        await client.query(
          `INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'result.followup','assessment_result',$3,$4::jsonb)`,
          [
            institutionId,
            userId,
            resultId,
            JSON.stringify({
              followupId: saved.id,
              status: entry.status,
              reasons: entry.reasons,
              actions: entry.actions,
              guidancePublished: entry.studentGuidancePublished,
            }),
          ],
        );
        return {
          id: saved.id,
          history: await followupHistory(client, resultId),
        };
      },
    ),
  );
}
