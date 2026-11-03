import {
  scoringRule, summarizeResult, processingStatusFor, publicationStatusAfterNewVersion,
} from './assessment-results.mjs';

// Grava uma versão provisória do resultado de um aluno numa aplicação.
// Recebe o client de uma transação aberta: a versão nasce junto com a
// correção e a atualização do cartão. Nunca publica nada.

const OBJECTIVE_TYPES = new Set(['single_choice', 'multiple_choice', 'true_false']);

// Respostas de uma correção já conferida (submission): toda objetiva tem
// resposta definida; ausência equivale a questão em branco, como na nota.
export function confirmedAnswers(snapshot, responses = []) {
  const byNumber = new Map(responses.map((response) => [response.questionNumber, response]));
  return (snapshot?.questions ?? [])
    .filter((question) => OBJECTIVE_TYPES.has(question.type))
    .map((question) => ({
      questionNumber: question.number,
      selectedLabels: byNumber.get(question.number)?.selectedLabels ?? [],
      status: 'confirmed',
    }));
}

// Notas já atribuídas às discursivas de uma correção.
export function manualPointsFrom(submissionResult) {
  return new Map((submissionResult?.items ?? [])
    .filter((item) => item.status === 'manually_reviewed' && item.awardedPoints != null)
    .map((item) => [item.questionNumber, Number(item.awardedPoints)]));
}

function sameAnswer(left, right) {
  const a = [...(left?.selectedLabels ?? [])].sort((x, y) => x.localeCompare(y));
  const b = [...(right?.selectedLabels ?? [])].sort((x, y) => x.localeCompare(y));
  return left?.status === right?.status && a.length === b.length && a.every((label, index) => label === b[index])
    && (left?.awardedPoints ?? null) === (right?.awardedPoints ?? null);
}

export async function recordResultVersion(client, {
  applicationStudentId, source, answers = [], manualPoints = new Map(),
  cardScanId = null, submissionId = null, userId = null,
}) {
  const assignment = await client.query(
    `SELECT aps.application_id,aps.assessment_version_id,av.snapshot,aa.institution_id,
            encode(sha256(convert_to(av.answer_key::text,'UTF8')),'hex') key_hash,
            rs.annulled_questions,rs.annulled_policy
     FROM application_students aps
     JOIN assessment_applications aa ON aa.id=aps.application_id
     JOIN assessment_versions av ON av.id=aps.assessment_version_id
     LEFT JOIN application_result_settings rs ON rs.application_id=aps.application_id
     WHERE aps.id=$1`,
    [applicationStudentId],
  );
  if (!assignment.rowCount) throw Object.assign(new Error('Aluno ou aplicação não encontrado.'), { statusCode: 404 });
  const a = assignment.rows[0];
  const rule = scoringRule({ annulledQuestions: a.annulled_questions ?? [], annulledPolicy: a.annulled_policy });
  const summary = summarizeResult(a.snapshot, answers, rule, manualPoints);

  // ON CONFLICT bloqueia a linha: gravações simultâneas do mesmo aluno
  // ficam em fila e numeram versões sem colisão.
  const result = (await client.query(
    `INSERT INTO assessment_results(institution_id,application_student_id) VALUES($1,$2)
     ON CONFLICT (application_student_id) DO UPDATE SET updated_at=now()
     RETURNING id,current_version_id,publication_status`,
    [a.institution_id, applicationStudentId],
  )).rows[0];

  const items = JSON.stringify(summary.items);
  const scoringRuleJson = JSON.stringify(rule);
  if (result.current_version_id) {
    // Reprocessar o mesmo cartão ou repetir uma confirmação idêntica não
    // cria outra versão.
    const same = await client.query(
      `SELECT id,version_number FROM assessment_result_versions
       WHERE id=$1 AND items=$2::jsonb AND scoring_rule=$3::jsonb AND answer_key_sha256=$4
         AND card_scan_id IS NOT DISTINCT FROM $5`,
      [result.current_version_id, items, scoringRuleJson, a.key_hash, cardScanId],
    );
    if (same.rowCount) {
      if (submissionId) await client.query('UPDATE assessment_result_versions SET submission_id=$2 WHERE id=$1 AND submission_id IS NULL', [same.rows[0].id, submissionId]);
      return { resultId: result.id, versionId: same.rows[0].id, versionNumber: same.rows[0].version_number, created: false, summary, publicationStatus: result.publication_status };
    }
  }

  const previous = result.current_version_id
    ? (await client.query('SELECT items FROM assessment_result_versions WHERE id=$1', [result.current_version_id])).rows[0]
    : null;
  const version = (await client.query(
    `INSERT INTO assessment_result_versions(
       result_id,version_number,source,card_scan_id,submission_id,assessment_version_id,answer_key_sha256,
       scoring_rule,items,question_count,annulled_count,valid_count,correct_count,incorrect_count,blank_count,
       invalid_count,review_pending_count,manual_pending_count,percent,score,max_score,created_by)
     SELECT $1,COALESCE(max(version_number),0)+1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
     FROM assessment_result_versions WHERE result_id=$1
     RETURNING id,version_number`,
    [result.id, source, cardScanId, submissionId, a.assessment_version_id, a.key_hash, scoringRuleJson, items,
      summary.questionCount, summary.annulledCount, summary.validCount, summary.correctCount, summary.incorrectCount,
      summary.blankCount, summary.invalidCount, summary.reviewPendingCount, summary.manualPendingCount,
      summary.percent, summary.score, summary.maxScore, userId],
  )).rows[0];

  const publicationStatus = publicationStatusAfterNewVersion(result.publication_status);
  await client.query(
    `UPDATE assessment_results SET current_version_id=$2,processing_status=$3,publication_status=$4,updated_at=now() WHERE id=$1`,
    [result.id, version.id, processingStatusFor(summary), publicationStatus],
  );

  // Alterações feitas pelo professor ficam registradas questão a questão.
  if (userId && previous) {
    const before = new Map(previous.items.map((item) => [item.questionNumber, item]));
    for (const item of summary.items) {
      const old = before.get(item.questionNumber);
      if (old && sameAnswer(old, item)) continue;
      await client.query(
        `INSERT INTO assessment_result_changes(result_id,from_version_id,to_version_id,question_number,previous_labels,new_labels,previous_status,new_status,changed_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [result.id, result.current_version_id, version.id, item.questionNumber, old?.selectedLabels ?? [],
          item.selectedLabels ?? [], old?.status ?? null, item.status, userId],
      );
    }
  }
  return { resultId: result.id, versionId: version.id, versionNumber: version.version_number, created: true, summary, publicationStatus };
}

// Outro cartão do mesmo aluno, na mesma aplicação, já lido ou em revisão.
export async function findDuplicateScan(client, { applicationStudentId, scanId }) {
  const duplicate = await client.query(
    `SELECT id FROM card_scans WHERE application_student_id=$1 AND id<>$2 AND status IN ('completed','review')
     ORDER BY completed_at DESC NULLS LAST LIMIT 1`,
    [applicationStudentId, scanId],
  );
  return duplicate.rows[0]?.id ?? null;
}
