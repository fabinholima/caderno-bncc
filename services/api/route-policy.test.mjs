import test from 'node:test';
import assert from 'node:assert/strict';
import { gates } from './route-policy.mjs';
import { findRoute } from './routes/router.mjs';
import { studentAreaRoutes } from './routes/student-area-routes.mjs';

const teacher = {
  role: 'teacher',
  cpfComplete: true,
  profileComplete: true,
  portalAdmin: false,
};
const student = { role: 'student' };

test('aluno só passa pelas rotas da própria conta', () => {
  assert.equal(gates.studentArea(student, '/api/auth/me'), null);
  assert.equal(gates.studentArea(student, '/api/classes').status, 403);
  assert.equal(gates.studentArea(teacher, '/api/classes'), null);
  // As barreiras de professor não se aplicam a alunos.
  assert.equal(gates.cpf(student, '/api/classes'), null);
  assert.equal(gates.profile(student, '/api/classes'), null);
});

test('professor sem CPF ou sem perfil é parado, exceto nas rotas liberadas', () => {
  const noCpf = { ...teacher, cpfComplete: false };
  assert.equal(gates.cpf(noCpf, '/api/classes').status, 428);
  assert.equal(gates.cpf(noCpf, '/api/auth/logout-all'), null);
  assert.equal(gates.cpf(noCpf, '/api/invitations/accept').status, 428);
  assert.equal(
    gates.cpf({ ...noCpf, portalAdmin: true }, '/api/classes'),
    null,
  );
  const noProfile = { ...teacher, profileComplete: false };
  assert.equal(gates.profile(noProfile, '/api/classes').status, 428);
  assert.equal(gates.profile(noProfile, '/api/invitations/accept'), null);
  assert.equal(gates.profile(noProfile, '/api/auth/institution'), null);
  assert.equal(
    gates.profile({ ...noProfile, developmentBypass: true }, '/api/classes'),
    null,
  );
  assert.equal(gates.profile(teacher, '/api/classes'), null);
});

test('rotas da área do aluno: método, IDs e exigências declaradas', () => {
  const classId = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const invite = findRoute(
    studentAreaRoutes,
    'POST',
    `/api/classes/${classId}/invite`,
  );
  assert.deepEqual([invite.route.status, invite.params], [201, [classId]]);
  assert.equal(
    findRoute(studentAreaRoutes, 'PUT', `/api/classes/${classId}/invite`),
    null,
  );
  assert.equal(
    findRoute(studentAreaRoutes, 'GET', '/api/classes/nao-e-id/invite'),
    null,
  );
  assert.ok(
    findRoute(studentAreaRoutes, 'POST', '/api/class-invites/inspect').route
      .rateLimit,
  );
  const photo = findRoute(
    studentAreaRoutes,
    'POST',
    '/api/student/profile',
  ).route;
  assert.deepEqual([photo.originOrMobile, photo.maxBytes], [true, 150000]);
  assert.equal(
    findRoute(
      studentAreaRoutes,
      'GET',
      `/api/student/essays/${classId}/proposal.pdf`,
    ).route.responseType,
    'pdf',
  );
  // Todas as rotas desta tabela são da área do aluno ou de convites de turma.
  for (const route of studentAreaRoutes)
    assert.match(
      String(route.path),
      /\/api\\?\/(student|class-invites|class-join-requests|classes)/,
    );
});
