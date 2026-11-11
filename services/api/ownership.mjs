import { pool } from './db.mjs';

// Regra de acesso dentro da instituição. Professores (papel teacher) só veem e
// alteram o que é seu: turmas que criaram ou em que lecionam (class_subjects),
// os alunos que cadastraram ou que estão matriculados nessas turmas, e as
// avaliações, aplicações, cartões, resultados e relatórios correspondentes.
// Coordenação, administração da instituição e administradores do portal veem
// toda a instituição. O tenant (institution_id) continua sempre obrigatório.

/** null = vê toda a instituição; senão, o id do professor que limita o acesso. */
export function teacherScope(identity) {
  if (
    identity?.portalAdmin ||
    ['admin', 'coordinator'].includes(identity?.role)
  )
    return null;
  return identity?.userId ?? '00000000-0000-0000-0000-000000000000';
}

// Predicados SQL. `p` é o parâmetro com o resultado de teacherScope (pode ser
// NULL: o predicado inteiro passa). Os aliases internos têm sufixo próprio para
// poderem ser aninhados.
const ownsClassRow = (c, p) =>
  `(${c}.created_by=${p} OR EXISTS(SELECT 1 FROM class_subjects own_cs WHERE own_cs.class_id=${c}.id AND own_cs.teacher_id=${p}))`;
const ownsApplicationRow = (aa, p) =>
  `(${aa}.created_by=${p} OR EXISTS(SELECT 1 FROM classes own_ac WHERE own_ac.id=${aa}.class_id AND ${ownsClassRow('own_ac', p)}))`;

export const ownsClass = (c, p) =>
  `(${p}::uuid IS NULL OR ${ownsClassRow(c, p)})`;
export const ownsStudent = (s, p) =>
  `(${p}::uuid IS NULL OR ${s}.teacher_id=${p} OR EXISTS(SELECT 1 FROM class_enrollments own_se JOIN classes own_sc ON own_sc.id=own_se.class_id WHERE own_se.student_id=${s}.id AND ${ownsClassRow('own_sc', p)}))`;
export const ownsApplication = (aa, p) =>
  `(${p}::uuid IS NULL OR ${ownsApplicationRow(aa, p)})`;
export const ownsAssessment = (a, p) =>
  `(${p}::uuid IS NULL OR ${a}.created_by=${p})`;
export const ownsEssayApplication = (ea, p) =>
  `(${p}::uuid IS NULL OR ${ea}.created_by=${p} OR EXISTS(SELECT 1 FROM classes own_ec WHERE own_ec.id=${ea}.class_id AND ${ownsClassRow('own_ec', p)}))`;
const ownsApplicationStudent = (apsId, p) =>
  `EXISTS(SELECT 1 FROM application_students own_aps JOIN assessment_applications own_aa ON own_aa.id=own_aps.application_id WHERE own_aps.id=${apsId} AND ${ownsApplicationRow('own_aa', p)})`;
export const ownsScan = (cs, p) =>
  `(${p}::uuid IS NULL OR ${cs}.uploaded_by=${p} OR ${ownsApplicationStudent(`${cs}.application_student_id`, p)} OR EXISTS(SELECT 1 FROM assessment_applications own_xa WHERE own_xa.id=${cs}.expected_application_id AND ${ownsApplicationRow('own_xa', p)}))`;

// Consulta de posse por tipo de registro: confirma tenant e dono num só passo.
const checks = {
  class: `SELECT 1 FROM classes c WHERE c.id=$1 AND c.institution_id=$2 AND ${ownsClass('c', '$3')}`,
  student: `SELECT 1 FROM students s WHERE s.id=$1 AND s.institution_id=$2 AND ${ownsStudent('s', '$3')}`,
  assessment: `SELECT 1 FROM assessments a WHERE a.id=$1 AND a.institution_id=$2 AND ${ownsAssessment('a', '$3')}`,
  assessmentVersion: `SELECT 1 FROM assessment_versions av JOIN assessments a ON a.id=av.assessment_id WHERE av.id=$1 AND a.institution_id=$2 AND ${ownsAssessment('a', '$3')}`,
  application: `SELECT 1 FROM assessment_applications aa WHERE aa.id=$1 AND aa.institution_id=$2 AND ${ownsApplication('aa', '$3')}`,
  applicationStudent: `SELECT 1 FROM application_students aps JOIN assessment_applications aa ON aa.id=aps.application_id WHERE aps.id=$1 AND aa.institution_id=$2 AND ${ownsApplication('aa', '$3')}`,
  scan: `SELECT 1 FROM card_scans cs WHERE cs.id=$1 AND cs.institution_id=$2 AND ${ownsScan('cs', '$3')}`,
  result: `SELECT 1 FROM assessment_results ar JOIN application_students aps ON aps.id=ar.application_student_id JOIN assessment_applications aa ON aa.id=aps.application_id WHERE ar.id=$1 AND ar.institution_id=$2 AND ${ownsApplication('aa', '$3')}`,
  renderJob: `SELECT 1 FROM render_jobs rj JOIN assessment_versions av ON av.id=rj.assessment_version_id JOIN assessments a ON a.id=av.assessment_id WHERE rj.id=$1 AND a.institution_id=$2 AND ($3::uuid IS NULL OR a.created_by=$3 OR ${ownsApplicationStudent('rj.application_student_id', '$3')})`,
  reportRenderJob: `SELECT 1 FROM application_report_render_jobs j JOIN application_report_snapshots rs ON rs.id=j.report_snapshot_id JOIN assessment_applications aa ON aa.id=rs.application_id WHERE j.id=$1 AND aa.institution_id=$2 AND ${ownsApplication('aa', '$3')}`,
  submission: `SELECT 1 FROM assessment_submissions sub JOIN assessment_versions av ON av.id=sub.assessment_version_id JOIN assessments a ON a.id=av.assessment_id WHERE sub.id=$1 AND a.institution_id=$2 AND ($3::uuid IS NULL OR a.created_by=$3 OR EXISTS(SELECT 1 FROM card_scans own_ss WHERE own_ss.submission_id=sub.id AND ${ownsScan('own_ss', '$3')}))`,
  essayApplication: `SELECT 1 FROM essay_applications ea WHERE ea.id=$1 AND ea.institution_id=$2 AND ${ownsEssayApplication('ea', '$3')}`,
  essayEntry: `SELECT 1 FROM essay_application_students eas JOIN essay_applications ea ON ea.id=eas.application_id WHERE eas.id=$1 AND ea.institution_id=$2 AND ${ownsEssayApplication('ea', '$3')}`,
  essayFile: `SELECT 1 FROM essay_submission_files f JOIN essay_submissions sub ON sub.id=f.submission_id JOIN essay_application_students eas ON eas.id=sub.application_student_id JOIN essay_applications ea ON ea.id=eas.application_id WHERE f.id=$1 AND ea.institution_id=$2 AND ${ownsEssayApplication('ea', '$3')}`,
  joinRequest: `SELECT 1 FROM class_join_requests r JOIN classes c ON c.id=r.class_id WHERE r.id=$1 AND r.institution_id=$2 AND ${ownsClass('c', '$3')}`,
};

const notFound = () =>
  Object.assign(new Error('Registro não encontrado.'), { statusCode: 404 });

/** Lança 404 (sem revelar se o registro existe) quando o usuário não é o dono. */
export async function assertOwnership(identity, kind, id, db = pool) {
  const sql = checks[kind];
  if (!sql) throw new Error(`Tipo de registro desconhecido: ${kind}`);
  // IDs malformados ficam para a validação do handler (422), não viram erro SQL.
  const ids = (Array.isArray(id) ? id : [id]).filter(
    (value) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value),
  );
  for (const value of new Set(ids)) {
    const found = await db.query(sql, [
      value,
      identity.institutionId,
      teacherScope(identity),
    ]);
    if (!found.rowCount) throw notFound();
  }
}

// Rotas com ID na URL e o tipo de registro que o ID representa. A guarda roda
// antes dos handlers, então nenhum deles precisa repetir a checagem.
const routeKinds = [
  [/^\/api\/classes\/([0-9a-f-]{36})(?:\/|$)/i, 'class'],
  [/^\/api\/students\/([0-9a-f-]{36})(?:\/|$)/i, 'student'],
  [/^\/api\/assessments\/([0-9a-f-]{36})(?:\/|$)/i, 'assessment'],
  [
    /^\/api\/assessment-versions\/([0-9a-f-]{36})(?:\/|$)/i,
    'assessmentVersion',
  ],
  [/^\/api\/assessment-applications\/([0-9a-f-]{36})(?:\/|$)/i, 'application'],
  [/^\/api\/card-scans\/([0-9a-f-]{36})(?:\/|$)/i, 'scan'],
  [/^\/api\/assessment-results\/([0-9a-f-]{36})(?:\/|$)/i, 'result'],
  [/^\/api\/render-jobs\/([0-9a-f-]{36})(?:\/|$)/i, 'renderJob'],
  [/^\/api\/report-render-jobs\/([0-9a-f-]{36})(?:\/|$)/i, 'reportRenderJob'],
  [/^\/api\/submissions\/([0-9a-f-]{36})(?:\/|$)/i, 'submission'],
  [/^\/api\/essay-applications\/([0-9a-f-]{36})(?:\/|$)/i, 'essayApplication'],
  [/^\/api\/essay-entries\/([0-9a-f-]{36})(?:\/|$)/i, 'essayEntry'],
  [/^\/api\/essay-files\/([0-9a-f-]{36})(?:\/|$)/i, 'essayFile'],
  [/^\/api\/class-join-requests\/([0-9a-f-]{36})$/i, 'joinRequest'],
];

export function ownedRoute(pathname) {
  for (const [pattern, kind] of routeKinds) {
    const match = pattern.exec(pathname);
    if (match) return { kind, id: match[1] };
  }
  return null;
}

/** Guarda das rotas com ID para contas da equipe (alunos têm rotas próprias). */
export async function assertRouteOwnership(identity, pathname) {
  const route = ownedRoute(pathname);
  if (route) await assertOwnership(identity, route.kind, route.id);
}
