import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import { mobileMutation, assertInstitutionScope } from './mobile-mutations.mjs';
import { Readable } from 'node:stream';
import { pool, transaction } from './db.mjs';
import { gradeSubmission } from './submissions.mjs';
import { assertInstitutionLimit } from './auth.mjs';
import { recordResultVersion, confirmedAnswers } from './result-versions.mjs';
export const scanSchema = z.object({
  clientScanId: z.uuid().optional(),
  expectedApplicationId: z.uuid().optional(),
  expectedInstitutionId: z.uuid().optional(),
  imageDataUrl: z
    .string()
    .max(8_000_000)
    .regex(
      /^data:(image\/(?:png|jpeg)|application\/pdf);base64,[A-Za-z0-9+/]+={0,2}$/,
    ),
});
export const reviewSchema = z.object({
  clientMutationId: z.uuid().optional(),
  expectedInstitutionId: z.uuid().optional(),
  applicationStudentId: z.uuid(),
  responses: z.array(
    z.object({
      questionNumber: z.number().int().positive(),
      selectedLabels: z.array(z.enum(['A', 'B', 'C', 'D', 'E'])).max(5),
    }),
  ),
});
export async function createScan({ institutionId, userId, portalAdmin = false, developmentBypass = false, input }) {
  const v = scanSchema.parse(input);
  assertInstitutionScope(institutionId, v.expectedInstitutionId);
  const [, mimeType, data] = v.imageDataUrl.match(
    /^data:(image\/(?:png|jpeg)|application\/pdf);base64,(.+)$/,
  );
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length || bytes.length > 6_000_000)
    throw Object.assign(new Error('A digitalização deve ter no máximo 6 MB.'), {
      statusCode: 422,
    });
  const hash = createHash('sha256').update(mimeType).update(bytes).update(v.expectedApplicationId ? `:application:${v.expectedApplicationId}` : '').digest('hex');
  return transaction(async client => {
    if(v.expectedApplicationId) {
      const application=await client.query("SELECT id FROM assessment_applications WHERE id=$1 AND institution_id=$2 AND status<>'cancelled'",[v.expectedApplicationId,institutionId]);
      if(!application.rowCount)throw Object.assign(new Error('Aplicação indisponível. Confira a avaliação e a turma no portal.'),{statusCode:422});
    }
    const id = v.clientScanId || randomUUID();
    const r = await client.query({
      text: `INSERT INTO card_scans(id,institution_id,uploaded_by,mime_type,image_data,upload_sha256,expected_application_id)
             VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING RETURNING id,status,created_at`,
      values: [id, institutionId, userId, mimeType, bytes, hash, v.expectedApplicationId || null],
    });
    if (!r.rowCount) {
      const existing = await client.query('SELECT id,status,created_at,institution_id,uploaded_by,upload_sha256 FROM card_scans WHERE id=$1', [id]);
      const row = existing.rows[0];
      if (!row || row.institution_id !== institutionId || row.uploaded_by !== userId || row.upload_sha256 !== hash) throw Object.assign(new Error('O identificador de envio já foi usado com outros dados.'), { statusCode: 409 });
      return { id: row.id, status: row.status, created_at: row.created_at };
    }
    // Novas correções dependem da assinatura do responsável; repetir um envio
    // já recebido continua respondendo, e resultados publicados seguem
    // disponíveis aos alunos.
    await requireActiveSubscription({ institutionId, portalAdmin, developmentBypass, db: client });
    await client.query(`INSERT INTO usage_events(institution_id,user_id,kind,quantity,metadata) VALUES($1,$2,'omr',1,$3::jsonb)`, [institutionId, userId, JSON.stringify({ scanId: id, bytes: bytes.length })]);
    return r.rows[0];
  });
}
async function requireActiveSubscription(options) {
  try {
    await assertInstitutionLimit({ ...options, kind: 'correction' });
  } catch (error) {
    if (error.statusCode !== 402) throw error;
    throw Object.assign(new Error('A assinatura da instituição está inativa. As fotos continuam salvas no aparelho e o envio será retomado quando a assinatura for regularizada.'), { statusCode: 402 });
  }
}

export async function listScans({ institutionId }) {
  const r = await pool.query({
    text: `SELECT cs.id,cs.status,cs.result,cs.error_message,cs.created_at,
                  cs.submission_id,cs.source_page,cs.source_pages,
                  cs.parent_scan_id,s.name student_name,av.code version_code,
                  sub.score,sub.max_score,sub.requires_manual_review,
                  (cs.review_image_data IS NOT NULL) image_available,
                  ar.processing_status result_processing_status,ar.publication_status
           FROM card_scans cs
           LEFT JOIN assessment_results ar ON ar.application_student_id=cs.application_student_id
           LEFT JOIN application_students aps ON aps.id=cs.application_student_id
           LEFT JOIN students s ON s.id=aps.student_id
           LEFT JOIN assessment_versions av ON av.id=aps.assessment_version_id
           LEFT JOIN assessment_submissions sub ON sub.id=cs.submission_id
           WHERE cs.institution_id=$1 ORDER BY cs.created_at DESC LIMIT 50`,
    values: [institutionId],
  });
  return r.rows.map((x) => ({
    id: x.id,
    status: x.status,
    result: x.result,
    error: x.error_message,
    studentName: x.student_name,
    versionCode: x.version_code,
    submissionId: x.submission_id,
    score: x.score == null ? null : Number(x.score),
    maxScore: x.max_score == null ? null : Number(x.max_score),
    requiresManualReview: x.requires_manual_review,
    sourcePage: x.source_page,
    sourcePages: x.source_pages,
    parentScanId: x.parent_scan_id,
    createdAt: x.created_at,
    imageAvailable: x.image_available,
    duplicateOfScanId: x.result?.duplicateOfScanId ?? null,
    resultProcessingStatus: x.result_processing_status ?? null,
    publicationStatus: x.publication_status ?? null,
  }));
}

export async function getScanReview({ institutionId, scanId }) {
  const scan = await pool.query({
    text: `SELECT cs.id,cs.status,cs.result,cs.error_message,
                  cs.application_student_id,cs.expected_application_id,cs.submission_id,sub.score,sub.max_score,sub.requires_manual_review,sub.revision,
                  (cs.review_image_data IS NOT NULL) image_available,
                  ar.id result_id,ar.processing_status result_processing_status,ar.publication_status,
                  (SELECT coalesce(json_agg(json_build_object('id',o.id,'status',o.status,'completedAt',o.completed_at) ORDER BY o.completed_at DESC),'[]')
                   FROM card_scans o WHERE o.application_student_id=cs.application_student_id AND o.id<>cs.id
                     AND o.status IN ('completed','review')) other_scans
           FROM card_scans cs LEFT JOIN assessment_submissions sub ON sub.id=cs.submission_id
           LEFT JOIN assessment_results ar ON ar.application_student_id=cs.application_student_id
           WHERE cs.id=$1 AND cs.institution_id=$2`,
    values: [scanId, institutionId],
  });
  if (!scan.rowCount) return null;
  const candidates = await pool.query({
    text: `SELECT aps.id,s.name,s.registration,ce.number,av.code,
                  a.title,a.id assessment_id,c.id class_id,c.name class_name,av.snapshot
           FROM application_students aps
           JOIN assessment_applications aa ON aa.id=aps.application_id
           JOIN students s ON s.id=aps.student_id
           JOIN assessment_versions av ON av.id=aps.assessment_version_id
           JOIN assessments a ON a.id=av.assessment_id
           JOIN classes c ON c.id=aa.class_id
           LEFT JOIN class_enrollments ce
             ON ce.class_id=aa.class_id AND ce.student_id=s.id
           WHERE aa.institution_id=$1 AND aa.status<>'cancelled' AND ($2::uuid IS NULL OR aa.id=$2)
           ORDER BY aa.created_at DESC,ce.number NULLS LAST,s.name
           LIMIT 1000`,
    values: [institutionId,scan.rows[0].expected_application_id],
  });
  const row = scan.rows[0];
  return {
    id: row.id,
    status: row.status,
    error: row.error_message || row.result?.reviewReason || null,
    submissionId: row.submission_id,
    score: row.score == null ? null : Number(row.score),
    maxScore: row.max_score == null ? null : Number(row.max_score),
    requiresManualReview: Boolean(row.requires_manual_review),
    revision: row.revision,
    applicationStudentId: row.application_student_id,
    imageAvailable: row.image_available,
    detectedAnswers: row.result?.answers ?? [],
    // Outros cartões do mesmo aluno nesta aplicação: o professor decide qual vale.
    duplicateOfScanId: row.result?.duplicateOfScanId ?? null,
    otherScans: row.other_scans ?? [],
    resultId: row.result_id ?? null,
    resultProcessingStatus: row.result_processing_status ?? null,
    publicationStatus: row.publication_status ?? null,
    candidates: candidates.rows.map((candidate) => ({
      id: candidate.id,
      studentName: candidate.name,
      registration: candidate.registration,
      number: candidate.number,
      versionCode: candidate.code,
      assessmentId: candidate.assessment_id,
      classId: candidate.class_id,
      assessmentTitle: candidate.title,
      className: candidate.class_name,
      questions: (candidate.snapshot?.questions ?? []).map((question) => ({
        number: question.number,
        type: question.type,
        labels: (question.alternatives ?? []).map(
          (alternative) => alternative.label,
        ),
      })),
    })),
  };
}

export async function getScanImage({ institutionId, scanId }) {
  const result = await pool.query({
    text: `SELECT review_image_data FROM card_scans
           WHERE id=$1 AND institution_id=$2`,
    values: [scanId, institutionId],
  });
  if (!result.rowCount || !result.rows[0].review_image_data)
    return { status: 404, error: 'Imagem de revisão não disponível.' };
  const data = result.rows[0].review_image_data;
  return {
    status: 200,
    size: data.length,
    stream: Readable.from(data),
  };
}

export async function retryScan({ institutionId, scanId, portalAdmin = false, developmentBypass = false }) {
  await requireActiveSubscription({ institutionId, portalAdmin, developmentBypass });
  const result = await pool.query({
    text: `UPDATE card_scans
           SET status='queued',mime_type='image/png',image_data=review_image_data,
               result=NULL,error_message=NULL,completed_at=NULL
           WHERE id=$1 AND institution_id=$2
             AND status IN ('review','failed') AND review_image_data IS NOT NULL
           RETURNING id,status`,
    values: [scanId, institutionId],
  });
  if (!result.rowCount)
    throw Object.assign(
      new Error('Este cartão não possui imagem disponível para reprocessar.'),
      { statusCode: 409 },
    );
  return result.rows[0];
}

export async function confirmScanReview({ institutionId, userId, scanId, input }) {
  const value = reviewSchema.parse(input);
  assertInstitutionScope(institutionId, value.expectedInstitutionId);
  return transaction(client => mobileMutation(client, { institutionId, userId, requestId: value.clientMutationId, kind: 'scan-confirm', entityId: scanId, input: value }, async () => {
    const assignment = await client.query({
      text: `SELECT aps.id,aps.application_id,aps.assessment_version_id,av.snapshot,s.name,
                    ce.number,c.name class_name
             FROM application_students aps
             JOIN assessment_applications aa ON aa.id=aps.application_id
             JOIN assessment_versions av ON av.id=aps.assessment_version_id
             JOIN students s ON s.id=aps.student_id
             JOIN classes c ON c.id=aa.class_id
             LEFT JOIN class_enrollments ce
               ON ce.class_id=aa.class_id AND ce.student_id=s.id
             WHERE aps.id=$1 AND aa.institution_id=$2 AND aa.status<>'cancelled'`,
      values: [value.applicationStudentId, institutionId],
    });
    if (!assignment.rowCount)
      throw Object.assign(new Error('Aluno ou aplicação não encontrado.'), {
        statusCode: 404,
      });
    const scan = await client.query({
      text: `SELECT id,submission_id,status,expected_application_id FROM card_scans
             WHERE id=$1 AND institution_id=$2 FOR UPDATE`,
      values: [scanId, institutionId],
    });
    if (!scan.rowCount)
      throw Object.assign(new Error('Cartão não encontrado.'), {
        statusCode: 404,
      });
    if (value.clientMutationId && scan.rows[0].status !== 'review') throw Object.assign(new Error('O cartão não está mais pendente de revisão. Atualize a leitura antes de continuar.'), { statusCode: 409 });
    const selected = assignment.rows[0];
    if(scan.rows[0].expected_application_id && scan.rows[0].expected_application_id!==selected.application_id)throw Object.assign(new Error('O aluno não pertence à aplicação selecionada para este cartão.'),{statusCode:409});
    const grade = gradeSubmission(selected.snapshot, {
      candidate: {
        name: selected.name,
        class: selected.class_name,
        number: selected.number ? String(selected.number) : '',
      },
      responses: value.responses,
    });
    let submissionId = scan.rows[0].submission_id;
    if (submissionId) {
      await client.query(
        `UPDATE assessment_submissions SET assessment_version_id=$2,
           candidate=$3::jsonb,responses=$4::jsonb,result=$5::jsonb,
           score=$6,max_score=$7,requires_manual_review=$8,submitted_at=now(),revision=revision+1
         WHERE id=$1`,
        [
          submissionId,
          selected.assessment_version_id,
          JSON.stringify(grade.candidate),
          JSON.stringify(grade.responses),
          JSON.stringify(grade.result),
          grade.score,
          grade.maxScore,
          grade.requiresManualReview,
        ],
      );
    } else {
      const submission = await client.query(
        `INSERT INTO assessment_submissions
           (assessment_version_id,candidate,responses,result,score,max_score,requires_manual_review)
         VALUES($1,$2::jsonb,$3::jsonb,$4::jsonb,$5,$6,$7) RETURNING id`,
        [
          selected.assessment_version_id,
          JSON.stringify(grade.candidate),
          JSON.stringify(grade.responses),
          JSON.stringify(grade.result),
          grade.score,
          grade.maxScore,
          grade.requiresManualReview,
        ],
      );
      submissionId = submission.rows[0].id;
    }
    // A confirmação do professor gera uma versão provisória; publicar ao
    // aluno é uma autorização separada.
    const version = await recordResultVersion(client, {
      applicationStudentId: selected.id, source: 'manual_review',
      answers: confirmedAnswers(selected.snapshot, value.responses),
      cardScanId: scanId, submissionId, userId,
    });
    await client.query(
      `UPDATE card_scans SET status='completed',application_student_id=$2,
         submission_id=$3,result=$4::jsonb,error_message=NULL,completed_at=now()
       WHERE id=$1`,
      [
        scanId,
        selected.id,
        submissionId,
        JSON.stringify({
          answers: value.responses.map((response) => ({
            ...response,
            status: 'confirmed',
          })),
          requiresReview: false,
          reviewedManually: true,
          grade,
          resultVersionId: version.versionId,
        }),
      ],
    );
    return {
      id: scanId,
      submissionId,
      score: grade.score,
      maxScore: grade.maxScore,
      requiresManualReview: grade.requiresManualReview,
      resultId: version.resultId,
      resultVersion: version.versionNumber,
      publicationStatus: version.publicationStatus,
      publishable: version.summary.publishable,
    };
  }));
}
