import crypto from "node:crypto";
import { z } from "zod";
import { pool, transaction } from "./db.mjs";
import { assertInstitutionLimit } from "./auth.mjs";

const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const error = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const normalize = (input) => {
  const code = z
    .object({
      code: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-?[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/),
    })
    .parse(input)
    .code.replace("-", "");
  return code.slice(0, 4) + "-" + code.slice(4);
};
const studentOnly = (identity) => {
  if (identity.role !== "student")
    throw error("Esta opção está disponível apenas para contas de aluno.", 403);
};
async function access(db, identity, classId, lock = false) {
  if (!["admin", "coordinator", "teacher"].includes(identity.role))
    throw error("Você não tem autorização para esta turma.", 403);
  const result = await db.query(
    `SELECT c.id,c.name,c.institution_id FROM classes c JOIN memberships m ON m.institution_id=c.institution_id AND m.user_id=$2 AND m.role IN ('admin','coordinator','teacher') WHERE c.id=$1 AND c.institution_id=$3 ${lock ? "FOR UPDATE OF c" : ""}`,
    [classId, identity.userId, identity.institutionId],
  );
  if (!result.rowCount) throw error("Turma não encontrada ou sem autorização.", 404);
  return result.rows[0];
}
async function audit(db, identity, action, id) {
  await db.query(
    "INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id) VALUES($1,$2,$3,'class',$4)",
    [identity.institutionId, identity.userId, action, id],
  );
}
export async function getInvite(identity, classId) {
  await access(pool, identity, classId);
  const r = await pool.query(
    'SELECT code_hint code,school_id AS "schoolId",created_at AS "createdAt",active FROM class_invites WHERE class_id=$1 AND active',
    [classId],
  );
  return r.rows[0] || null;
}
export async function createInvite(identity, classId, input = {}) {
  return transaction(async (db) => {
    const klass = await access(db, identity, classId, true);
    const selection = z.object({ schoolId: z.uuid().optional() }).strict().parse(input);
    const schools = await db.query(
      "SELECT id FROM educator_schools WHERE user_id=$1 AND ($2::uuid IS NULL OR id=$2)",
      [identity.userId, selection.schoolId || null],
    );
    if (schools.rowCount !== 1)
      throw error("Escolha uma escola do seu cadastro para este convite.", 422);
    const schoolId = schools.rows[0].id;
    const old = await db.query(
      "UPDATE class_invites SET active=false,deactivated_at=now() WHERE class_id=$1 AND active RETURNING id",
      [classId],
    );
    for (let attempt = 0; attempt < 5; attempt++) {
      const raw = Array.from({ length: 8 }, () => alphabet[crypto.randomInt(alphabet.length)]).join(
          "",
        ),
        code = raw.slice(0, 4) + "-" + raw.slice(4);
      const r = await db.query(
        "INSERT INTO class_invites(class_id,institution_id,code_hash,code_hint,created_by,school_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(code_hash) DO NOTHING RETURNING id,created_at",
        [classId, klass.institution_id, hash(code), code, identity.userId, schoolId],
      );
      if (r.rowCount) {
        await audit(
          db,
          identity,
          old.rowCount ? "class_invite.renewed" : "class_invite.created",
          classId,
        );
        return {
          id: r.rows[0].id,
          classId,
          className: klass.name,
          code,
          schoolId,
          active: true,
          createdAt: r.rows[0].created_at,
        };
      }
    }
    throw error("Não foi possível gerar o convite. Tente novamente.", 503);
  });
}
export async function deactivateInvite(identity, classId) {
  return transaction(async (db) => {
    await access(db, identity, classId, true);
    const r = await db.query(
      "UPDATE class_invites SET active=false,deactivated_at=now() WHERE class_id=$1 AND active RETURNING id",
      [classId],
    );
    if (r.rowCount) await audit(db, identity, "class_invite.deactivated", classId);
    return { deactivated: !!r.rowCount };
  });
}
async function inspect(db, input, lock = false) {
  const r = await db.query(
    `SELECT ci.id,ci.class_id,ci.institution_id,c.name class_name,es.name school_name,u.display_name teacher_name FROM class_invites ci JOIN classes c ON c.id=ci.class_id AND c.institution_id=ci.institution_id JOIN educator_schools es ON es.id=ci.school_id JOIN users u ON u.id=ci.created_by WHERE ci.code_hash=$1 AND ci.active ${lock ? "FOR SHARE OF ci" : ""}`,
    [hash(normalize(input))],
  );
  if (!r.rowCount) throw error("Código inválido ou desativado.", 404);
  return r.rows[0];
}
export async function inspectInvite(identity, input) {
  studentOnly(identity);
  const x = await inspect(pool, input);
  return { schoolName: x.school_name, className: x.class_name, teacherName: x.teacher_name };
}
export async function requestJoin(identity, input) {
  studentOnly(identity);
  return transaction(async (db) => {
    const info = await inspect(db, input, true);
    const r = await db.query(
      "INSERT INTO class_join_requests(class_id,invite_id,institution_id,user_id) VALUES($1,$2,$3,$4) ON CONFLICT(class_id,user_id) DO NOTHING RETURNING id,requested_at",
      [info.class_id, info.id, info.institution_id, identity.userId],
    );
    if (!r.rowCount) throw error("Você já tem uma solicitação ou vínculo para esta turma.", 409);
    return {
      id: r.rows[0].id,
      status: "pending",
      requestedAt: r.rows[0].requested_at,
      schoolName: info.school_name,
      className: info.class_name,
    };
  });
}
export async function listRequests(identity, classId) {
  await access(pool, identity, classId);
  const r = await pool.query(
    'SELECT r.id,r.status,r.requested_at AS "requestedAt",u.display_name name,u.email,l.student_id AS "linkedStudentId",s.name AS "linkedStudentName",s.registration AS "linkedRegistration" FROM class_join_requests r JOIN users u ON u.id=r.user_id LEFT JOIN student_account_links l ON l.user_id=r.user_id AND l.institution_id=r.institution_id LEFT JOIN students s ON s.id=l.student_id WHERE r.class_id=$1 AND r.status=\'pending\' ORDER BY r.requested_at',
    [classId],
  );
  return r.rows;
}
export async function listCandidates(identity, classId) {
  await access(pool, identity, classId);
  return (
    await pool.query(
      "SELECT s.id,s.name,s.registration FROM students s JOIN class_enrollments ce ON ce.student_id=s.id WHERE ce.class_id=$1 AND s.institution_id=$2 AND s.active AND NOT EXISTS(SELECT 1 FROM student_account_links l WHERE l.student_id=s.id) ORDER BY s.name",
      [classId, identity.institutionId],
    )
  ).rows;
}
export async function decideRequest(identity, requestId, input) {
  const action = z
    .object({
      action: z.enum(["approve", "reject"]),
      studentId: z.uuid().optional(),
      confirmed: z.boolean().optional(),
      studentName: z.string().trim().min(2).max(160).optional(),
      registration: z.string().trim().min(1).max(60).optional(),
    })
    .strict()
    .parse(input);
  return transaction(async (db) => {
    const r = await db.query(
      "SELECT * FROM class_join_requests WHERE id=$1 AND institution_id=$2 FOR UPDATE",
      [requestId, identity.institutionId],
    );
    if (!r.rowCount) throw error("Solicitação não encontrada.", 404);
    const row = r.rows[0];
    await access(db, identity, row.class_id);
    if (row.status !== "pending") throw error("Esta solicitação já foi decidida.", 409);
    if (action.action === "reject") {
      await db.query(
        "UPDATE class_join_requests SET status='rejected',decided_by=$2,decided_at=now() WHERE id=$1",
        [requestId, identity.userId],
      );
      await audit(db, identity, "class_join.rejected", row.class_id);
      return { status: "rejected" };
    }
    if (action.confirmed !== true)
      throw error("Confirme explicitamente o cadastro que será vinculado.", 422);
    // Serializes approvals for the same account across multiple classes in one school.
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${identity.institutionId}:${row.user_id}`,
    ]);
    const user = await db.query(
      "SELECT id FROM users WHERE id=$1 AND active AND account_type='student'",
      [row.user_id],
    );
    if (!user.rowCount) throw error("Conta de aluno indisponível.", 409);
    const linked = (
      await db.query(
        "SELECT student_id FROM student_account_links WHERE institution_id=$1 AND user_id=$2",
        [identity.institutionId, row.user_id],
      )
    ).rows[0];
    let studentId = action.studentId;
    if (linked) {
      if (!studentId)
        throw error(
          "Esta conta já possui cadastro na escola. Selecione esse cadastro para confirmar o vínculo.",
          422,
        );
      if (studentId !== linked.student_id)
        throw error("Esta conta já está associada a outro cadastro nesta escola.", 409);
      studentId = linked.student_id;
    }
    if (studentId) {
      const s = await db.query(
        "SELECT s.id FROM students s WHERE s.id=$1 AND s.institution_id=$2 AND s.active AND ($4::boolean OR EXISTS(SELECT 1 FROM class_enrollments ce WHERE ce.student_id=s.id AND ce.class_id=$3)) FOR UPDATE OF s",
        [studentId, identity.institutionId, row.class_id, Boolean(linked)],
      );
      if (!s.rowCount) throw error("Escolha um aluno ativo já cadastrado nesta turma.", 422);
    } else {
      if (!action.studentName || !action.registration)
        throw error("Informe nome e matrícula para criar o cadastro.", 422);
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `student-quota:${identity.institutionId}`,
      ]);
      await assertInstitutionLimit({
        institutionId: identity.institutionId,
        kind: "student",
        portalAdmin: identity.portalAdmin,
      });
      const s = await db.query(
        "INSERT INTO students(institution_id,registration,name,teacher_id,access_code) VALUES($1,$2,$3,$4,'UFA-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))) RETURNING id",
        [identity.institutionId, action.registration, action.studentName, identity.userId],
      );
      studentId = s.rows[0].id;
    }
    if (!linked) {
      const link = await db.query(
        "INSERT INTO student_account_links(institution_id,user_id,student_id,linked_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING student_id",
        [identity.institutionId, row.user_id, studentId, identity.userId],
      );
      if (!link.rowCount) throw error("Este cadastro já está vinculado a outra conta.", 409);
    }
    await db.query(
      "INSERT INTO memberships(institution_id,user_id,role) VALUES($1,$2,'student') ON CONFLICT DO NOTHING",
      [identity.institutionId, row.user_id],
    );
    await db.query(
      "INSERT INTO class_enrollments(class_id,student_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [row.class_id, studentId],
    );
    await db.query(
      "UPDATE class_join_requests SET status='approved',student_id=$2,decided_by=$3,decided_at=now() WHERE id=$1",
      [requestId, studentId, identity.userId],
    );
    await audit(db, identity, "class_join.approved", row.class_id);
    return { status: "approved", studentId };
  });
}
export async function myJoinRequests(identity) {
  studentOnly(identity);
  return (
    await pool.query(
      'SELECT r.id,r.status,r.requested_at AS "requestedAt",c.name AS "className",es.name AS "schoolName" FROM class_join_requests r JOIN classes c ON c.id=r.class_id JOIN class_invites ci ON ci.id=r.invite_id JOIN educator_schools es ON es.id=ci.school_id WHERE r.user_id=$1 ORDER BY r.requested_at DESC',
      [identity.userId],
    )
  ).rows;
}
export async function myActivities(identity) {
  studentOnly(identity);
  return (
    await pool.query(
      `SELECT ast.id,a.title,c.name AS "className",es.name AS "schoolName",aa.scheduled_at AS "scheduledAt",aa.status,
 CASE WHEN sub.requires_manual_review=false THEN sub.score END AS score,
 CASE WHEN sub.requires_manual_review=false THEN sub.max_score END AS "maxScore",
 COALESCE(sub.requires_manual_review,false) AS "requiresManualReview"
 FROM student_account_links l
 JOIN students s ON s.id=l.student_id AND s.active
 JOIN class_join_requests jr ON jr.user_id=l.user_id AND jr.student_id=l.student_id AND jr.status='approved'
 JOIN class_invites ci ON ci.id=jr.invite_id JOIN educator_schools es ON es.id=ci.school_id
 JOIN class_enrollments ce ON ce.student_id=l.student_id AND ce.class_id=jr.class_id
 JOIN application_students ast ON ast.student_id=l.student_id
 JOIN assessment_applications aa ON aa.id=ast.application_id AND aa.class_id=ce.class_id AND aa.institution_id=l.institution_id AND aa.status!='cancelled'
 JOIN assessments a ON a.id=aa.assessment_id JOIN classes c ON c.id=aa.class_id JOIN institutions i ON i.id=l.institution_id
 LEFT JOIN LATERAL(SELECT sub.* FROM card_scans cs JOIN assessment_submissions sub ON sub.id=cs.submission_id WHERE cs.application_student_id=ast.id AND cs.status='completed' ORDER BY cs.completed_at DESC LIMIT 1) sub ON true
 WHERE l.user_id=$1 ORDER BY aa.scheduled_at DESC NULLS LAST`,
      [identity.userId],
    )
  ).rows;
}
