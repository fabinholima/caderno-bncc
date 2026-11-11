// Rotas usadas por contas de aluno (e pelos convites de turma). Ficam antes das
// exigências de CPF e de perfil de professor (route-policy.mjs), para que o
// aluno entre pelo aplicativo sem preencher dados de professor.
import {
  createInvite,
  decideRequest,
  deactivateInvite,
  getInvite,
  inspectInvite,
  listCandidates,
  listRequests,
  myActivities,
  myJoinRequests,
  requestJoin,
} from '../class-invites.mjs';
import { myEssayProposalPdf } from '../essays.mjs';
import {
  addMyEssayFile,
  myEssayDetail,
  myEssayFile,
  myEssays,
  removeMyEssayFile,
  saveMyEssayDraft,
  submitMyEssay,
} from '../essay-correction.mjs';
import { claimAccessCode, inspectAccessCode } from '../student-access-code.mjs';
import {
  myStudentProfiles,
  updateMyStudentPhoto,
} from '../student-profile.mjs';
import { myResultDetail, mySkillPerformance } from '../student-results.mjs';
import { myAcademicHistory } from '../academic-insights.mjs';

const id = '([0-9a-f-]{36})';
const inviteLimit = (identity) => `invite:${identity.userId}`;

/** @type {import('./router.mjs').Route[]} */
export const studentAreaRoutes = [
  {
    method: 'POST',
    path: '/api/class-invites/inspect',
    rateLimit: inviteLimit,
    rateLimitError: 'Muitas tentativas de código. Aguarde 15 minutos.',
    handler: ({ identity, body }) => inspectInvite(identity, body),
  },
  {
    method: 'GET',
    path: new RegExp(`^/api/classes/${id}/invite$`, 'i'),
    handler: ({ identity, params }) => getInvite(identity, params[0]),
  },
  {
    method: 'POST',
    path: new RegExp(`^/api/classes/${id}/invite$`, 'i'),
    status: 201,
    handler: ({ identity, params, body }) =>
      createInvite(identity, params[0], body),
  },
  {
    method: 'DELETE',
    path: new RegExp(`^/api/classes/${id}/invite$`, 'i'),
    handler: ({ identity, params }) => deactivateInvite(identity, params[0]),
  },
  {
    method: 'POST',
    path: '/api/class-invites/request',
    status: 201,
    rateLimit: inviteLimit,
    rateLimitError: 'Muitas tentativas. Aguarde 15 minutos.',
    handler: ({ identity, body }) => requestJoin(identity, body),
  },
  {
    method: 'GET',
    path: '/api/class-join-requests/me',
    handler: ({ identity }) => myJoinRequests(identity),
  },
  {
    method: 'GET',
    path: new RegExp(`^/api/classes/${id}/join-candidates$`, 'i'),
    handler: ({ identity, params }) => listCandidates(identity, params[0]),
  },
  {
    method: 'GET',
    path: new RegExp(`^/api/classes/${id}/join-requests$`, 'i'),
    handler: ({ identity, params }) => listRequests(identity, params[0]),
  },
  {
    method: 'POST',
    path: new RegExp(`^/api/class-join-requests/${id}$`, 'i'),
    maxBytes: 8192,
    handler: ({ identity, params, body }) =>
      decideRequest(identity, params[0], body),
  },
  // Código individual do aluno: vínculo imediato, sem aprovação do professor.
  {
    method: 'POST',
    path: '/api/student/access-code/inspect',
    handler: ({ identity, body }) => inspectAccessCode(identity, body),
  },
  {
    method: 'POST',
    path: '/api/student/access-code/claim',
    handler: ({ identity, body }) => claimAccessCode(identity, body),
  },
  {
    method: 'GET',
    path: '/api/student/activities',
    handler: ({ identity }) => myActivities(identity),
  },
  {
    method: 'GET',
    path: '/api/student/history',
    handler: ({ identity }) => myAcademicHistory(identity),
  },
  {
    method: 'GET',
    path: '/api/student/skill-performance',
    handler: ({ identity }) => mySkillPerformance(identity),
  },
  {
    method: 'GET',
    path: new RegExp(`^/api/student/results/${id}$`, 'i'),
    handler: ({ identity, params }) => myResultDetail(identity, params[0]),
  },
  {
    method: 'GET',
    path: '/api/student/profile',
    handler: ({ identity }) => myStudentProfiles(identity),
  },
  {
    method: 'POST',
    path: '/api/student/profile',
    originOrMobile: true,
    maxBytes: 150000,
    handler: ({ identity, body }) => updateMyStudentPhoto(identity, body),
  },
  // Propostas de redação liberadas pelo professor para a turma do aluno.
  {
    method: 'GET',
    path: '/api/student/essays',
    handler: ({ identity }) => myEssays(identity),
  },
  // Minhas Redações: escrever, enviar fotos/PDF, entregar e ver a correção.
  {
    method: 'GET',
    path: new RegExp(`^/api/student/essays/${id}$`, 'i'),
    handler: ({ identity, params }) => myEssayDetail(identity, params[0]),
  },
  {
    method: 'PUT',
    path: new RegExp(`^/api/student/essays/${id}/draft$`, 'i'),
    originOrMobile: true,
    maxBytes: 90000,
    handler: ({ identity, params, body }) =>
      saveMyEssayDraft(identity, params[0], body),
  },
  {
    method: 'POST',
    path: new RegExp(`^/api/student/essays/${id}/files$`, 'i'),
    status: 201,
    originOrMobile: true,
    maxBytes: 12_500_000,
    handler: ({ identity, params, body }) =>
      addMyEssayFile(identity, params[0], body),
  },
  {
    method: 'DELETE',
    path: new RegExp(`^/api/student/essays/${id}/files/${id}$`, 'i'),
    originOrMobile: true,
    handler: ({ identity, params }) =>
      removeMyEssayFile(identity, params[0], params[1]),
  },
  {
    method: 'GET',
    path: new RegExp(`^/api/student/essays/${id}/files/${id}$`, 'i'),
    handler: ({ identity, params }) =>
      myEssayFile(identity, params[0], params[1]),
    responseType: 'file',
  },
  {
    method: 'POST',
    path: new RegExp(`^/api/student/essays/${id}/submit$`, 'i'),
    originOrMobile: true,
    handler: ({ identity, params }) => submitMyEssay(identity, params[0]),
  },
  {
    method: 'GET',
    path: new RegExp(`^/api/student/essays/${id}/proposal\\.pdf$`, 'i'),
    handler: async ({ identity, params }) => ({
      pdf: await myEssayProposalPdf(identity, params[0]),
      filename: 'proposta-de-redacao.pdf',
    }),
    responseType: 'pdf',
  },
];
