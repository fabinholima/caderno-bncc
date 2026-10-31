import crypto from "node:crypto";
import { z } from "zod";
import { pool, transaction } from "./db.mjs";
import { allowAuthAttempt } from "./auth-attempts.mjs";
import { classSchoolName } from "./class-invites.mjs";

// Vínculo imediato da conta do aluno ao próprio cadastro pelo students.access_code.
// O código tem 32 bits: as tentativas compartilham o limitador dos convites.
// O aplicativo interpreta 403 como "servidor sem estas rotas"; por isso os
// erros de negócio usam 404, 409, 422 e 429.
const error = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const studentOnly = (identity) => {
  if (identity.role !== "student")
    throw error("Esta opção está disponível apenas para contas de aluno.", 403);
};
const attempt = (identity) => {
  if (!allowAuthAttempt(`invite:${identity.userId}`))
    throw error("Muitas tentativas de código. Aguarde 15 minutos.", 429);
};
const notFound = () => error("Código não encontrado ou cadastro inativo.", 404);
const normalize = (input) => {
  const parsed = z.object({ code: z.string().max(40) }).safeParse(input);
  if (!parsed.success) throw notFound();
  const raw = parsed.data.code.toUpperCase().replace(/[\s-]/g, "");
  const hex = raw.startsWith("UFA") ? raw.slice(3) : raw;
  if (!/^[0-9A-F]{8}$/.test(hex)) throw notFound();
  return "UFA-" + hex;
};

async function resolve(db, identity, input, lock = false) {
  const r = await db.query(
    `SELECT s.id,s.name,s.institution_id,i.name institution_name,l.user_id linked_user
     FROM students s JOIN institutions i ON i.id=s.institution_id
     LEFT JOIN student_account_links l ON l.student_id=s.id
     WHERE lower(s.access_code)=lower($1) AND s.active ${lock ? "FOR UPDATE OF s" : ""}`,
    [normalize(input)],
  );
  if (!r.rowCount) throw notFound();
  const student = r.rows[0];
  if (student.linked_user && student.linked_user !== identity.userId)
    throw error("Este cadastro já está vinculado a outra conta. Fale com o professor.", 409);
  const own = await db.query(
    "SELECT student_id FROM student_account_links WHERE institution_id=$1 AND user_id=$2",
    [student.institution_id, identity.userId],
  );
  if (own.rowCount && own.rows[0].student_id !== student.id)
    throw error("Sua conta já está vinculada a outro cadastro nesta instituição.", 409);
  const classes = (
    await db.query(
      `SELECT c.id,c.name AS "className",${classSchoolName("c", "i")} AS "schoolName"
       FROM class_enrollments ce JOIN classes c ON c.id=ce.class_id AND c.institution_id=$2
       JOIN institutions i ON i.id=c.institution_id
       WHERE ce.student_id=$1 ORDER BY c.name`,
      [student.id, student.institution_id],
    )
  ).rows;
  if (!classes.length)
    throw error("Este cadastro ainda não está matriculado em nenhuma turma.", 422);
  return { student, classes, linked: own.rowCount > 0 };
}

export async function inspectAccessCode(identity, input) {
  studentOnly(identity);
  attempt(identity);
  const { student, classes } = await resolve(pool, identity, input);
  return {
    studentName: student.name,
    schoolName: classes[0].schoolName || student.institution_name,
    classes: classes.map(({ className }) => ({ className })),
  };
}

export async function claimAccessCode(identity, input) {
  studentOnly(identity);
  attempt(identity);
  return transaction(async (db) => {
    // Serializa vínculos simultâneos da mesma conta (códigos diferentes).
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`student-link:${identity.userId}`]);
    const { student, classes, linked } = await resolve(db, identity, input, true);
    let changed = false;
    if (!linked) {
      const link = await db.query(
        "INSERT INTO student_account_links(institution_id,user_id,student_id,linked_by) VALUES($1,$2,$3,$2) ON CONFLICT DO NOTHING RETURNING student_id",
        [student.institution_id, identity.userId, student.id],
      );
      if (!link.rowCount) throw error("Este cadastro já está vinculado a outra conta.", 409);
      changed = true;
    }
    await db.query(
      "INSERT INTO memberships(institution_id,user_id,role) VALUES($1,$2,'student') ON CONFLICT DO NOTHING",
      [student.institution_id, identity.userId],
    );
    for (const klass of classes) {
      const r = await db.query(
        `INSERT INTO class_join_requests(class_id,institution_id,user_id,student_id,status,source,decided_by,decided_at)
         VALUES($1,$2,$3,$4,'approved','access_code',$3,now())
         ON CONFLICT(class_id,user_id) DO UPDATE SET status='approved',student_id=EXCLUDED.student_id,decided_by=EXCLUDED.decided_by,decided_at=now()
         WHERE class_join_requests.status<>'approved' OR class_join_requests.student_id IS DISTINCT FROM EXCLUDED.student_id
         RETURNING id`,
        [klass.id, student.institution_id, identity.userId, student.id],
      );
      if (r.rowCount) changed = true;
    }
    if (changed)
      await db.query(
        "INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id) VALUES($1,$2,'student_link.access_code','student',$3)",
        [student.institution_id, identity.userId, student.id],
      );
    return {
      studentId: student.id,
      classes: classes.map(({ className, schoolName }) => ({
        className,
        schoolName: schoolName || student.institution_name,
      })),
    };
  });
}

export async function unlinkStudentAccount(identity, studentId) {
  if (!["admin", "coordinator", "teacher"].includes(identity.role))
    throw error("Somente professores e gestores da instituição podem desvincular contas.", 403);
  z.uuid().parse(studentId);
  return transaction(async (db) => {
    const s = await db.query(
      "SELECT id FROM students WHERE id=$1 AND institution_id=$2 FOR UPDATE",
      [studentId, identity.institutionId],
    );
    if (!s.rowCount) throw error("Aluno não encontrado.", 404);
    const link = await db.query(
      "DELETE FROM student_account_links WHERE student_id=$1 AND institution_id=$2 RETURNING user_id",
      [studentId, identity.institutionId],
    );
    if (!link.rowCount) throw error("Este cadastro não tem conta vinculada.", 409);
    const userId = link.rows[0].user_id;
    await db.query(
      "DELETE FROM class_join_requests WHERE institution_id=$1 AND user_id=$2 AND student_id=$3",
      [identity.institutionId, userId, studentId],
    );
    // A conta só tem um cadastro por instituição; sem ele, perde o acesso de aluno.
    await db.query(
      "DELETE FROM memberships WHERE institution_id=$1 AND user_id=$2 AND role='student'",
      [identity.institutionId, userId],
    );
    let accessCode = null;
    for (let i = 0; i < 5 && !accessCode; i++) {
      const candidate = "UFA-" + crypto.randomBytes(4).toString("hex").toUpperCase();
      const r = await db.query(
        "UPDATE students SET access_code=$2 WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM students WHERE lower(access_code)=lower($2)) RETURNING access_code",
        [studentId, candidate],
      );
      accessCode = r.rows[0]?.access_code || null;
    }
    if (!accessCode) throw error("Não foi possível gerar um novo código. Tente novamente.", 503);
    await db.query(
      "INSERT INTO audit_log(institution_id,user_id,action,entity_type,entity_id) VALUES($1,$2,'student_link.unlinked','student',$3)",
      [identity.institutionId, identity.userId, studentId],
    );
    return { studentId, unlinked: true, accessCode };
  });
}
