import { regenerateAssessment } from './assessments.mjs';
import { listClassStudents } from './academic.mjs';
import {
  listWorkspaces,
  getWorkspace,
  createWorkspace,
  saveWorkspace,
  pinWorkspace,
  deleteWorkspace,
} from './assessment-workspaces.mjs';
import {questionStatusHistory,approveQuestionsInBulk,sendQuestionsToReviewInBulk} from './question-workflow.mjs';
import {listDrafts,getDraft,saveDraft,completeDraft} from './question-drafts.mjs';
import { requirePortalAdmin } from './portal-admin.mjs';
import { maintenanceStatus, maintenanceBlocks, saveMaintenance } from './maintenance.mjs';
import { createServer } from 'node:http';
import { authOriginAllowed } from './auth-origin.mjs';
import { revenueReport, listSubscribers, manageSubscriber } from './admin-dashboard.mjs';
import { catalogAccess, sharedCatalogRoute, setPortalEditor } from './portal-access.mjs';
import { getEducatorProfile, saveEducatorProfile } from './educator-profile.mjs';
import { googleConfigured, startGoogle, finishGoogle } from './google-auth.mjs';
import { mobileGoogleAuth } from './mobile-google-auth.mjs';
import { billingStatus, createCheckout, cancelBilling, billingWebhook, previewBillingCoupon } from './billing.mjs';
import { publicBillingPlans, listBillingSettings, updateBillingPlan, saveBillingCoupon } from './billing-admin.mjs';
import { ZodError } from 'zod';
import { pool } from './db.mjs';
import {
  clearQuestionDuplicate,
  createQuestion,
  createQuestionRevision,
  deleteQuestion,
  getQuestionFilterOptions,
  getQuestion,
  listQuestions,
  listQuestionDuplicates,
  markQuestionDuplicate,
  permanentlyDeleteQuestionDuplicate,
  setQuestionStatus,
} from './questions.mjs';
import {
  createAssessment,
  deleteAssessment,
  getAssessment,
  listAssessments,
} from './assessments.mjs';
import {
  createKnowledgeObject,
  createSkill,
  createSubject,
  listHighSchoolCurriculum,
  listCurriculum,
} from './curriculum.mjs';
import {
  getApplicationBatchFile,
  getRenderFile,
  getRenderJobStatus,
} from './renders.mjs';
import {
  renderFontCatalog,
  renderTemplateCatalog,
} from '../../lib/render-templates.mjs';
import { saveManualReview } from './manual-review.mjs';
import {
  createSubmission,
  getSubmission,
  listSubmissions,
} from './submissions.mjs';
import {
  deleteAssessmentPreset,
  listAssessmentPresets,
  saveAssessmentPreset,
} from './assessment-presets.mjs';
import {
  createPedagogicalTopic,
  createPedagogicalDiscipline,
  listPedagogicalDisciplines,
  listPedagogicalTopics,
  setPedagogicalDisciplineSkills,
  updatePedagogicalTopic,
  deletePedagogicalTopic,
} from './pedagogical-disciplines.mjs';
import { importPedagogicalTopicCatalog } from './pedagogical-topic-import.mjs';
import {
  cancelApplication,
  createApplication,
  createClass,
  createStudent,
  enrollStudent,
  getApplication,
  listApplications,
  listClasses,
  listStudents,
  setStudentActive,
  retryApplicationRenders,
} from './academic.mjs';
import {
  createInvite, getInvite, deactivateInvite, inspectInvite, requestJoin,
  listRequests, listCandidates, decideRequest, myJoinRequests, myActivities,
} from './class-invites.mjs';
import {
  confirmScanReview,
  createScan,
  getScanImage,
  getScanReview,
  listScans,
  retryScan,
} from './scans.mjs';
import {
  createApplicationReportRender,
  createStudentReportRender,
  getApplicationReport,
  getApplicationReportFile,
  getApplicationReportRender,
  getStudentApplicationReport,
  getStudentProgress,
} from './reports.mjs';
import {
  buildClassReportCsv,
  buildClassReportWorkbook,
} from './report-exports.mjs';
import {
  acceptInvitation,
  authenticate,
  completeCpf,
  createInvitation,
  getSubscription,
  login,
  logout,
  register,
  registerStudent,
  requestPasswordReset,
  resetPassword,
  requestEmailVerification,
  verifyEmail,
} from './auth.mjs';
import { mailConfigured, developmentMail } from './auth-mail.mjs';
import { createQuestionPdfPreview } from './question-preview.mjs';
import { listSaebDescriptors, listSaebMatrices } from './saeb.mjs';
import { renderChemicalStructure } from './chemical-structures.mjs';
import {
  createExamImport,
  cropExamImportCandidateImage,
  extractExamImportAnswerKey,
  getExamImportDocument,
  getExamImportPagePreview,
  listExamImports,
  deleteExamImport,
  updateExamImportCandidate,
} from './exam-imports.mjs';
import {
  cancelExamImportAnalysis,
  cancelExamImportJob,
  enqueueExamImportAnalysis,
  enqueueExamImportExtraction,
  retryExamImportAnalysis,
  retryExamImportJob,
} from './exam-import-jobs.mjs';

const port = Number(process.env.PORT || 8788);
const maxConcurrentPreviews = Number(process.env.PREVIEW_CONCURRENCY || 2);
let activePreviewCount = 0;
const activePreviewUsers = new Set();
const allowedOrigins = new Set(
  (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
// O portal também é acessado pelo domínio oficial. Mantemos esses aliases
// permitidos mesmo quando o CORS_ORIGIN do Render ainda estiver apontando
// somente para o endereço *.onrender.com.
for (const origin of [
  'https://ufaprova.com.br',
  'https://www.ufaprova.com.br',
  'https://ufaprova-frontend.onrender.com',
]) allowedOrigins.add(origin);

function corsHeaders(response) {
  return response.corsOrigin
    ? {
        'access-control-allow-origin': response.corsOrigin,
        'access-control-allow-credentials': 'true',
        vary: 'Origin',
      }
    : {};
}

function json(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...corsHeaders(response),
    'access-control-allow-headers': 'content-type, authorization, x-client',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  });
  response.end(JSON.stringify(body));
}

async function readJson(request, maxBytes = 8_500_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Payload muito grande');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function setSessionCookie(response, token) {
  // Frontend e API ficam em origens diferentes no Render; o cookie precisa
  // permitir requisições cross-site autenticadas em produção.
  const sameSite = process.env.NODE_ENV === 'production' ? 'None' : 'Lax';
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader(
    'set-cookie',
    `caderno_session=${encodeURIComponent(token)}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=2592000${secure}`,
  );
}

function clearSessionCookie(response) {
  const sameSite = process.env.NODE_ENV === 'production' ? 'None' : 'Lax';
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader(
    'set-cookie',
    `caderno_session=; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=0${secure}`,
  );
}

const authAttempts = new Map();
function allowAuthAttempt(key) {
  const now = Date.now();
  for (const [ip, value] of authAttempts) if (value.until <= now) authAttempts.delete(ip);
  const current = authAttempts.get(key) || { count: 0, until: now + 15 * 60_000 };
  if (!authAttempts.has(key) && authAttempts.size >= 10000) return false;
  authAttempts.set(key, current);
  return ++current.count <= 30;
}
function oauthCookie(value, age) {
  return `caderno_oauth=${value}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=${age}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

const server = createServer(async (request, response) => {
  const requestOrigin = request.headers.origin;
  response.corsOrigin = allowedOrigins.has(requestOrigin) ? requestOrigin : '';
  if (request.method === 'OPTIONS') return json(response, 204, null);
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (request.method === 'GET' && url.pathname === '/api/maintenance') {
      response.setHeader('cache-control','no-store');
      return json(response,200,{data:await maintenanceStatus()});
    }
    if (request.method === 'GET' && url.pathname === '/api/public/billing-plans') {
      response.setHeader('cache-control', 'public, max-age=60');
      return json(response, 200, { data: await publicBillingPlans() });
    }
    // Keep login/recovery, payment callbacks and health available during maintenance.
    if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth/') && url.pathname !== '/api/billing/webhook') {
      const state = await maintenanceStatus();
      if (maintenanceBlocks(state,await authenticate(request))) {
        response.setHeader('retry-after','300');
        response.setHeader('cache-control','no-store');
        return json(response,503,{error:state.message,maintenance:true});
      }
    }
    if (request.method === 'GET' && url.pathname === '/api/auth/config')
      return json(response, 200, { data: { google: googleConfigured(), googleMobile: googleConfigured(), passwordRecovery: mailConfigured() || developmentMail() } });
    if (request.method === 'POST' && url.pathname.startsWith('/api/auth/')) {
      if (!authOriginAllowed({ path: url.pathname, origin: requestOrigin, mobileClient: request.headers['x-client'], allowedOrigins }))
        return json(response, 403, { error: 'Origem da requisição não autorizada.' });
      if (['/api/auth/login', '/api/auth/register', '/api/auth/student/register', '/api/auth/google/start', '/api/auth/google/mobile/start', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/resend-verification', '/api/auth/verify-email'].includes(url.pathname)) {
        if (!allowAuthAttempt(request.socket.remoteAddress || 'unknown'))
          return json(response, 429, { error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' });
      }
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/google/mobile/start') {
      response.setHeader('cache-control', 'no-store');
      return json(response, 200, { data: await mobileGoogleAuth.start(await readJson(request, 4096)) });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/google/mobile/status') {
      response.setHeader('cache-control', 'no-store');
      return json(response, 200, { data: await mobileGoogleAuth.status(await readJson(request, 4096)) });
    }
    if (request.method === 'GET' && url.pathname === '/api/auth/google/mobile/browser') {
      if (!allowAuthAttempt(request.socket.remoteAddress || 'unknown')) return json(response, 429, { error: 'Muitas tentativas. Aguarde e tente novamente.' });
      const result = await mobileGoogleAuth.browser(url.searchParams.get('ticket'));
      response.setHeader('set-cookie', oauthCookie(result.browser, 600));
      response.writeHead(303, { location: result.url, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
      return response.end();
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/google/start') {
      const result = await startGoogle(await readJson(request, 4096));
      response.setHeader('set-cookie', oauthCookie(result.browser, 600));
      return json(response, 200, { data: { url: result.url } });
    }
    if (request.method === 'GET' && url.pathname === '/api/auth/google/callback') {
      if (!googleConfigured()) return json(response, 503, { error: 'Login Google não configurado.' });
      const mobile = await mobileGoogleAuth.callback(url, request.headers.cookie);
      if (mobile) {
        response.setHeader('set-cookie', oauthCookie('', 0));
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
          'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; frame-ancestors 'none'", 'x-content-type-options': 'nosniff' });
        const text = mobile.status === 'completed' ? 'Entrada confirmada. Feche esta aba e volte ao aplicativo UFA Prova.' : mobile.message;
        return response.end(`<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UFA Prova</title><body><h1>UFA Prova</h1><p>${text}</p></body></html>`);
      }
      const destination = new URL('/portal', process.env.AUTH_FRONTEND_URL);
      try {
        const result = await finishGoogle(url, request.headers.cookie);
        setSessionCookie(response, result.token);
        response.setHeader('set-cookie', [response.getHeader('set-cookie'), oauthCookie('', 0)]);
      } catch (error) {
        console.error('Google OAuth callback failed', {
          message: error instanceof Error ? error.message : String(error),
          code: error?.code || null,
          statusCode: error?.statusCode || null,
        });
        destination.searchParams.set('auth_error', error.statusCode === 428 ? 'registration_required' : error.statusCode === 409 || error.code === '23505' ? 'existing_account' : 'google_failed');
        response.setHeader('set-cookie', oauthCookie('', 0));
      }
      response.writeHead(303, { location: destination.href, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
      return response.end();
    }
    if (request.method === 'POST' && url.pathname === '/api/billing/webhook')
      return json(response, 200, { data: await billingWebhook(request, url, await readJson(request, 64000)) });
    if (request.method === 'GET' && url.pathname === '/health') {
      const readiness = await pool.query("SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE filename='066_mobile_sync_manual_review.sql') AS mobile_sync_ready");
      const ready = readiness.rows[0]?.mobile_sync_ready === true;
      return json(response, ready ? 200 : 503, { status: ready ? 'ok' : 'migration_pending', release: process.env.RENDER_GIT_COMMIT || null, mobileSyncSchemaVersion: ready ? 1 : 0 });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/student/register') return json(response,201,{data:await registerStudent(await readJson(request,4096))});
    if (request.method === 'POST' && url.pathname === '/api/auth/register') {
      const result = await register(await readJson(request));
      return json(response, 201, { data: result });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      const result = await login(await readJson(request));
      setSessionCookie(response, result.token);
      const { token: _token, ...data } = result;
      if (request.headers['x-client'] === 'mobile') data.token = result.token;
      return json(response, 200, { data });
    }
    if (
      request.method === 'POST' &&
      url.pathname === '/api/auth/forgot-password'
    )
      return json(response, 202, {
        data: await requestPasswordReset(await readJson(request)),
      });
    if (
      request.method === 'POST' &&
      url.pathname === '/api/auth/reset-password'
    )
      return json(response, 200, {
        data: await resetPassword(await readJson(request)),
      });
    if (request.method === 'POST' && url.pathname === '/api/auth/resend-verification')
      return json(response, 202, { data: await requestEmailVerification(await readJson(request, 4096)) });
    if (request.method === 'POST' && url.pathname === '/api/auth/verify-email')
      return json(response, 200, { data: await verifyEmail(await readJson(request, 4096)) });
    const identity = await authenticate(request);
    if (!identity)
      return json(response, 401, { error: 'Faça login para continuar.' });
    const { userId } = identity;
    response.setHeader('cache-control','no-store');
    if (/^\/api\/(?:class-invites|class-join-requests|classes\/[^/]+\/(?:invite|join-requests|join-candidates))/.test(url.pathname) && !['GET','HEAD'].includes(request.method)) {
      if(requestOrigin ? !allowedOrigins.has(requestOrigin) : request.headers['x-client'] !== 'mobile') return json(response,403,{error:'Origem não autorizada.'});
    }
    if(request.method === 'POST' && url.pathname === '/api/class-invites/inspect') {
      if(!allowAuthAttempt(`invite:${identity.userId}`))return json(response,429,{error:'Muitas tentativas de código. Aguarde 15 minutos.'});
      return json(response,200,{data:await inspectInvite(identity,await readJson(request,4096))});
    }
    // Convites de turma ficam antes das exigências de perfil para permitir que
    // contas de aluno entrem pelo aplicativo sem preencher dados de professor.
    const classInviteMatch = url.pathname.match(/^\/api\/classes\/([0-9a-f-]{36})\/invite$/i);
    if (classInviteMatch && request.method === 'GET') return json(response,200,{data:await getInvite(identity,classInviteMatch[1])});
    if (classInviteMatch && request.method === 'POST')
      return json(response, 201, { data: await createInvite(identity, classInviteMatch[1], await readJson(request,4096)) });
    if (classInviteMatch && request.method === 'DELETE')
      return json(response, 200, { data: await deactivateInvite(identity, classInviteMatch[1]) });
    if (request.method === 'POST' && url.pathname === '/api/class-invites/request')
      { if(!allowAuthAttempt(`invite:${identity.userId}`))return json(response,429,{error:'Muitas tentativas. Aguarde 15 minutos.'}); return json(response, 201, { data: await requestJoin(identity, await readJson(request, 4096)) }); }
    if (request.method === 'GET' && url.pathname === '/api/class-join-requests/me')
      return json(response, 200, { data: await myJoinRequests(identity) });
    const candidatesMatch=url.pathname.match(/^\/api\/classes\/([0-9a-f-]{36})\/join-candidates$/i);
    if(candidatesMatch && request.method === 'GET')return json(response,200,{data:await listCandidates(identity,candidatesMatch[1])});
    const classRequestsMatch = url.pathname.match(/^\/api\/classes\/([0-9a-f-]{36})\/join-requests$/i);
    if (classRequestsMatch && request.method === 'GET')
      return json(response, 200, { data: await listRequests(identity, classRequestsMatch[1]) });
    const requestDecisionMatch = url.pathname.match(/^\/api\/class-join-requests\/([0-9a-f-]{36})$/i);
    if (requestDecisionMatch && request.method === 'POST')
      return json(response, 200, { data: await decideRequest(identity, requestDecisionMatch[1], await readJson(request, 8192)) });
    if(request.method==='GET' && url.pathname==='/api/student/activities')return json(response,200,{data:await myActivities(identity)});
    if(identity.role==='student' && !['/api/auth/me','/api/auth/logout'].includes(url.pathname)) return json(response,403,{error:'Este recurso é exclusivo de professores e gestores.'});
    if (url.pathname === '/api/admin/maintenance') {
      if (request.method === 'GET') {
        requirePortalAdmin(identity);
        return json(response,200,{data:await maintenanceStatus()});
      }
      if (request.method === 'POST') {
        if (!requestOrigin || !allowedOrigins.has(requestOrigin)) return json(response,403,{error:'Origem não autorizada.'});
        return json(response,200,{data:await saveMaintenance(identity,await readJson(request,4096))});
      }
    }
    if (url.pathname.startsWith('/api/admin/')) response.setHeader('cache-control','no-store');
    if (request.method === 'GET' && url.pathname === '/api/admin/revenue')
      return json(response,200,{data:await revenueReport(identity,{year:url.searchParams.get('year') || new Date().getFullYear()})});
    if (url.pathname === '/api/admin/billing-settings') {
      if (request.method === 'GET')
        return json(response, 200, { data: await listBillingSettings(identity) });
      if (request.method === 'POST') {
        if (!requestOrigin || !allowedOrigins.has(requestOrigin))
          return json(response, 403, { error: 'Origem da requisição não autorizada.' });
        return json(response, 200, { data: await updateBillingPlan(identity, await readJson(request, 4096)) });
      }
    }
    if (request.method === 'POST' && url.pathname === '/api/admin/billing-coupons') {
      if (!requestOrigin || !allowedOrigins.has(requestOrigin))
        return json(response, 403, { error: 'Origem da requisição não autorizada.' });
      return json(response, 200, { data: await saveBillingCoupon(identity, await readJson(request, 4096)) });
    }
    if (request.method === 'GET' && url.pathname === '/api/admin/subscribers')
      return json(response,200,{data:await listSubscribers(identity,{q:url.searchParams.get('q') || '',ip:url.searchParams.get('ip') || '',page:url.searchParams.get('page') || 1})});
    if (request.method === 'POST' && url.pathname === '/api/admin/subscribers') {
      if (!requestOrigin || !allowedOrigins.has(requestOrigin)) return json(response,403,{error:'Origem não autorizada.'});
      return json(response,200,{data:await manageSubscriber(identity,await readJson(request,4096))});
    }
    const canEditCatalog = catalogAccess(identity, request.method, url.pathname);
    const sharedRoute = sharedCatalogRoute(url.pathname);
    const institutionId = sharedRoute ? identity.questionBankId || identity.institutionId : identity.institutionId;
    const role = sharedRoute ? (canEditCatalog ? 'admin' : 'teacher') : identity.role;
    if (request.method === 'POST' && url.pathname === '/api/admin/bank-context') {
      return json(response,410,{error:'O portal agora usa um painel único. Atualize a página.'});
    }
    if (request.method === 'POST' && url.pathname === '/api/admin/editors') {
      if (!requestOrigin || !allowedOrigins.has(requestOrigin)) return json(response,403,{error:'Origem não autorizada.'});
      return json(response,200,{data:await setPortalEditor(identity,await readJson(request,4096))});
    }
    if (request.method === 'POST' && url.pathname === '/api/invitations' && !identity.portalAdmin)
      return json(response,403,{error:'Somente o administrador geral pode gerenciar permissões.'});
    if (request.method === 'POST' && url.pathname === '/api/auth/complete-cpf')
      return json(response, 200, { data: await completeCpf(identity, await readJson(request, 4096)) });
    if (identity.role !== 'student' && !identity.portalAdmin && !identity.cpfComplete && !identity.developmentBypass && !['/api/auth/me','/api/auth/logout'].includes(url.pathname))
      return json(response, 428, { error: 'Complete o cadastro com seu CPF para continuar.' });
    if (request.method === 'GET' && url.pathname === '/api/educator-profile')
      return json(response, 200, { data: await getEducatorProfile(userId) });
    if (request.method === 'POST' && url.pathname === '/api/educator-profile') {
      if (!requestOrigin || !allowedOrigins.has(requestOrigin)) return json(response, 403, { error: 'Origem não autorizada.' });
      return json(response, 200, { data: await saveEducatorProfile(userId, await readJson(request, 650000)) });
    }
    if (identity.role !== 'student' && !identity.portalAdmin && !identity.profileComplete && !identity.developmentBypass && !['/api/auth/me','/api/auth/logout'].includes(url.pathname))
      return json(response, 428, { error: 'Complete seu perfil e cadastre sua escola para continuar.' });
    if (request.method === 'GET' && url.pathname === '/api/billing')
      return json(response, 200, { data: await billingStatus(identity) });
    if (request.method === 'POST' && url.pathname === '/api/billing/coupon/validate') {
      if (!requestOrigin || !allowedOrigins.has(requestOrigin))
        return json(response, 403, { error: 'Origem da requisição não autorizada.' });
      return json(response, 200, { data: await previewBillingCoupon(identity, await readJson(request, 4096)) });
    }
    if (request.method === 'POST' && ['/api/billing/checkout', '/api/billing/cancel'].includes(url.pathname)) {
      if (!requestOrigin || !allowedOrigins.has(requestOrigin))
        return json(response, 403, { error: 'Origem da requisição não autorizada.' });
      return json(response, 200, { data: url.pathname.endsWith('/checkout')
        ? await createCheckout(identity, await readJson(request, 4096))
        : await cancelBilling(identity) });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
      await logout(identity.sessionId);
      clearSessionCookie(response);
      return json(response, 200, { data: { loggedOut: true } });
    }
    if (request.method === 'GET' && url.pathname === '/api/auth/me')
      return json(response, 200, {
        data: {
          user: {
            id: identity.userId,
            email: identity.email,
            displayName: identity.displayName,
            cpfComplete: Boolean(identity.cpfComplete),
            profileComplete: Boolean(identity.profileComplete),
          },
          institution: {
            id: identity.institutionId,
            name: identity.institutionName,
          },
          role: identity.role,
          portalAdmin: Boolean(identity.portalAdmin),
          portalEditor: Boolean(identity.portalEditor),
          portalRole: identity.portalRole,
          globalBank: Boolean(identity.globalBank),
        },
      });
    if (request.method === 'GET' && url.pathname === '/api/exam-imports')
      return json(response, 200, {
        data: await listExamImports({ institutionId }),
      });
    if (request.method === 'POST' && url.pathname === '/api/exam-imports')
      return json(response, 201, {
        data: await createExamImport({
          institutionId,
          userId,
          role,
          input: await readJson(request, 42_000_000),
        }),
      });
    const examImportDeleteMatch =
      request.method === 'DELETE' &&
      url.pathname.match(/^\/api\/exam-imports\/([0-9a-f-]{36})$/i);
    if (examImportDeleteMatch) {
      const deleted = await deleteExamImport({
        institutionId,
        examImportId: examImportDeleteMatch[1],
      });
      if (!deleted)
        return json(response, 409, {
          error: 'Cancele o processamento ativo antes de remover esta importação.',
        });
      return json(response, 200, { data: { deleted: true } });
    }
    const examImportDocumentMatch =
      request.method === 'GET' &&
      url.pathname.match(
        /^\/api\/exam-imports\/([0-9a-f-]{36})\/documents\/([0-9a-f-]{36})\/pdf$/i,
      );
    if (examImportDocumentMatch) {
      const document = await getExamImportDocument({
        institutionId,
        examImportId: examImportDocumentMatch[1],
        documentId: examImportDocumentMatch[2],
      });
      if (document.error)
        return json(response, document.status, { error: document.error });
      response.writeHead(200, {
        'content-type': 'application/pdf',
        'content-length': document.size,
        'content-disposition': 'inline; filename="documento-importado.pdf"',
        'cache-control': 'private, max-age=300',
        'x-content-type-options': 'nosniff',
        ...corsHeaders(response),
      });
      return response.end(document.contents);
    }
    const examImportExtractMatch =
      request.method === 'POST' &&
      url.pathname.match(/^\/api\/exam-imports\/([0-9a-f-]{36})\/extract$/i);
    if (examImportExtractMatch)
      return json(response, 202, {
        data: await enqueueExamImportExtraction({
          institutionId,
          userId,
          examImportId: examImportExtractMatch[1],
        }),
      });
    const examImportAnalyzeMatch =
      request.method === 'POST' &&
      url.pathname.match(/^\/api\/exam-imports\/([0-9a-f-]{36})\/analyze$/i);
    if (examImportAnalyzeMatch)
      return json(response, 202, {
        data: await enqueueExamImportAnalysis({
          institutionId,
          userId,
          examImportId: examImportAnalyzeMatch[1],
          provider: (await readJson(request, 4096)).provider,
        }),
      });
    const examImportAnalyzeCancelMatch =
      request.method === 'POST' &&
      url.pathname.match(
        /^\/api\/exam-imports\/([0-9a-f-]{36})\/analyze\/cancel$/i,
      );
    if (examImportAnalyzeCancelMatch) {
      const job = await cancelExamImportAnalysis({
        institutionId,
        examImportId: examImportAnalyzeCancelMatch[1],
      });
      if (!job)
        return json(response, 404, { error: 'Análise ativa não encontrada.' });
      return json(response, 202, { data: job });
    }
    const examImportAnalyzeRetryMatch =
      request.method === 'POST' &&
      url.pathname.match(
        /^\/api\/exam-imports\/([0-9a-f-]{36})\/analyze\/retry$/i,
      );
    if (examImportAnalyzeRetryMatch)
      return json(response, 202, {
        data: await retryExamImportAnalysis({
          institutionId,
          userId,
          examImportId: examImportAnalyzeRetryMatch[1],
          provider: (await readJson(request, 4096)).provider,
        }),
      });
    const examImportCancelMatch =
      request.method === 'POST' &&
      url.pathname.match(/^\/api\/exam-imports\/([0-9a-f-]{36})\/cancel$/i);
    if (examImportCancelMatch) {
      const job = await cancelExamImportJob({
        institutionId,
        examImportId: examImportCancelMatch[1],
      });
      if (!job)
        return json(response, 404, { error: 'Trabalho ativo não encontrado.' });
      return json(response, 202, { data: job });
    }
    const examImportRetryMatch =
      request.method === 'POST' &&
      url.pathname.match(/^\/api\/exam-imports\/([0-9a-f-]{36})\/retry$/i);
    if (examImportRetryMatch)
      return json(response, 202, {
        data: await retryExamImportJob({
          institutionId,
          userId,
          examImportId: examImportRetryMatch[1],
        }),
      });
    const examImportCandidateMatch =
      request.method === 'PATCH' &&
      url.pathname.match(
        /^\/api\/exam-imports\/([0-9a-f-]{36})\/candidates\/([0-9a-f-]{36})$/i,
      );
    if (examImportCandidateMatch)
      return json(response, 200, {
        data: await updateExamImportCandidate({
          institutionId,
          userId,
          examImportId: examImportCandidateMatch[1],
          candidateId: examImportCandidateMatch[2],
          input: await readJson(request),
        }),
      });
    const examImportPageMatch =
      request.method === 'GET' &&
      url.pathname.match(
        /^\/api\/exam-imports\/([0-9a-f-]{36})\/pages\/(\d+)\.jpg$/i,
      );
    if (examImportPageMatch) {
      const preview = await getExamImportPagePreview({
        institutionId,
        examImportId: examImportPageMatch[1],
        pageNumber: Number(examImportPageMatch[2]),
      });
      if (preview.error)
        return json(response, preview.status, { error: preview.error });
      response.writeHead(200, {
        'content-type': 'image/jpeg',
        'content-length': preview.size,
        'cache-control': 'private, max-age=300',
        'x-content-type-options': 'nosniff',
        ...corsHeaders(response),
      });
      return response.end(preview.contents);
    }
    const examImportCropMatch =
      request.method === 'POST' &&
      url.pathname.match(
        /^\/api\/exam-imports\/([0-9a-f-]{36})\/candidates\/([0-9a-f-]{36})\/crop$/i,
      );
    if (examImportCropMatch)
      return json(response, 200, {
        data: await cropExamImportCandidateImage({
          institutionId,
          examImportId: examImportCropMatch[1],
          candidateId: examImportCropMatch[2],
          input: await readJson(request),
        }),
      });
    const examImportAnswerKeyMatch =
      request.method === 'POST' &&
      url.pathname.match(
        /^\/api\/exam-imports\/([0-9a-f-]{36})\/answer-key\/extract$/i,
      );
    if (examImportAnswerKeyMatch)
      return json(response, 200, {
        data: await extractExamImportAnswerKey({
          institutionId,
          examImportId: examImportAnswerKeyMatch[1],
        }),
      });
    if (request.method === 'POST' && url.pathname === '/api/invitations')
      return json(response, 201, {
        data: await createInvitation(identity, await readJson(request)),
      });
    if (request.method === 'POST' && url.pathname === '/api/invitations/accept')
      return json(response, 200, {
        data: await acceptInvitation(identity, await readJson(request)),
      });
    if (request.method === 'GET' && url.pathname === '/api/subscription')
      return json(response, 200, { data: await getSubscription(identity) });
    if (request.method === 'GET' && url.pathname === '/api/mobile-sync') {
      const ready = await pool.query("SELECT to_regclass('mobile_mutations') AS ledger");
      if (!ready.rows[0]?.ledger) return json(response, 503, { error: 'A migração de sincronização móvel ainda não foi aplicada.' });
      return json(response, 200, { data: { version: 1, idempotentUploads: true, manualReview: true, applicationScopedUploads:true, userId, institutionId } });
    }
    const classStudentsMatch=request.method==='GET' && url.pathname.match(/^\/api\/classes\/([0-9a-f-]{36})\/students$/i);
    if(classStudentsMatch) return json(response,200,{data:await listClassStudents({institutionId,classId:classStudentsMatch[1]})});
    if (request.method === 'GET' && url.pathname === '/api/classes')
      return json(response, 200, {
        data: await listClasses({ institutionId }),
      });
    if (request.method === 'POST' && url.pathname === '/api/classes')
      return json(response, 201, {
        data: await createClass({
          institutionId,
          input: await readJson(request),
        }),
      });
    if (request.method === 'POST' && url.pathname === '/api/students')
      return json(response, 201, {
        data: await createStudent({
          institutionId,
          userId,
          input: await readJson(request),
        }),
      });
    if (request.method === 'GET' && url.pathname === '/api/students')
      return json(response, 200, {
        data: await listStudents({ institutionId }),
      });
    const studentActiveMatch = request.method === 'PATCH' && url.pathname.match(/^\/api\/students\/([0-9a-f-]{36})$/i);
    if (studentActiveMatch)
      return json(response, 200, { data: await setStudentActive({
        institutionId, studentId: studentActiveMatch[1], active: (await readJson(request)).active,
      }) });
    const enrollmentMatch =
      request.method === 'POST' &&
      url.pathname.match(/^\/api\/classes\/([0-9a-f-]{36})\/enrollments$/i);
    if (enrollmentMatch)
      return json(response, 201, {
        data: await enrollStudent({
          institutionId,
          classId: enrollmentMatch[1],
          input: await readJson(request),
        }),
      });
    if (
      request.method === 'POST' &&
      url.pathname === '/api/assessment-applications'
    )
      return json(response, 201, {
        data: await createApplication({
          institutionId,
          userId,
          input: await readJson(request),
        }),
      });
    if (
      request.method === 'GET' &&
      url.pathname === '/api/assessment-applications'
    )
      return json(response, 200, {
        data: await listApplications({ institutionId }),
      });
    const applicationDetailMatch =
      request.method === 'GET' &&
      url.pathname.match(/^\/api\/assessment-applications\/([0-9a-f-]{36})$/i);
    if (applicationDetailMatch) {
      const application = await getApplication({
        institutionId,
        applicationId: applicationDetailMatch[1],
      });
      if (!application)
        return json(response, 404, { error: 'Aplicação não encontrada.' });
      return json(response, 200, { data: application });
    }
    const applicationRetryMatch =
      request.method === 'POST' &&
      url.pathname.match(
        /^\/api\/assessment-applications\/([0-9a-f-]{36})\/retry$/i,
      );
    if (applicationRetryMatch)
      return json(response, 200, {
        data: await retryApplicationRenders({
          institutionId,
          applicationId: applicationRetryMatch[1],
        }),
      });
    const applicationCancelMatch =
      request.method === 'POST' &&
      url.pathname.match(
        /^\/api\/assessment-applications\/([0-9a-f-]{36})\/cancel$/i,
      );
    if (applicationCancelMatch)
      return json(response, 200, {
        data: await cancelApplication({
          institutionId,
          applicationId: applicationCancelMatch[1],
        }),
      });
    const applicationBatchMatch =
      request.method === 'GET' &&
      url.pathname.match(
        /^\/api\/assessment-applications\/([0-9a-f-]{36})\/pdf$/i,
      );
    if (applicationBatchMatch) {
      const file = await getApplicationBatchFile({
        institutionId,
        applicationId: applicationBatchMatch[1],
      });
      if (file.error) return json(response, file.status, { error: file.error });
      response.writeHead(200, {
        'content-type': 'application/pdf',
        'content-length': file.size,
        'content-disposition': `attachment; filename="provas-${applicationBatchMatch[1]}.pdf"`,
        ...corsHeaders(response),
      });
      return file.stream.pipe(response);
    }
    const applicationReportExportMatch =
      request.method === 'GET' &&
      url.pathname.match(
        /^\/api\/assessment-applications\/([0-9a-f-]{36})\/report\.(csv|xlsx)$/i,
      );
    if (applicationReportExportMatch) {
      const report = await getApplicationReport({
        institutionId,
        applicationId: applicationReportExportMatch[1],
      });
      if (!report)
        return json(response, 404, { error: 'Aplicação não encontrada.' });
      const format = applicationReportExportMatch[2].toLowerCase();
      const body =
        format === 'csv'
          ? Buffer.from(buildClassReportCsv(report), 'utf8')
          : await buildClassReportWorkbook(report);
      response.writeHead(200, {
        'content-type':
          format === 'csv'
            ? 'text/csv; charset=utf-8'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-length': body.length,
        'content-disposition': `attachment; filename="relatorio-turma-${applicationReportExportMatch[1]}.${format}"`,
        ...corsHeaders(response),
      });
      return response.end(body);
    }
    const applicationReportMatch =
      request.method === 'GET' &&
      url.pathname.match(
        /^\/api\/assessment-applications\/([0-9a-f-]{36})\/report$/i,
      );
    if (applicationReportMatch) {
      const report = await getApplicationReport({
        institutionId,
        applicationId: applicationReportMatch[1],
      });
      if (!report)
        return json(response, 404, { error: 'Aplicação não encontrada.' });
      return json(response, 200, { data: report });
    }
    const createApplicationReportRenderMatch =
      request.method === 'POST' &&
      url.pathname.match(
        /^\/api\/assessment-applications\/([0-9a-f-]{36})\/report-renders$/i,
      );
    if (createApplicationReportRenderMatch) {
      const job = await createApplicationReportRender({
        institutionId,
        userId,
        applicationId: createApplicationReportRenderMatch[1],
      });
      if (!job)
        return json(response, 404, { error: 'Aplicação não encontrada.' });
      return json(response, 202, { data: job });
    }
    const studentReportMatch =
      request.method === 'GET' &&
      url.pathname.match(
        /^\/api\/assessment-applications\/([0-9a-f-]{36})\/students\/([0-9a-f-]{36})\/report$/i,
      );
    if (studentReportMatch) {
      const report = await getStudentApplicationReport({
        institutionId,
        applicationId: studentReportMatch[1],
        studentId: studentReportMatch[2],
      });
      if (!report)
        return json(response, 404, {
          error: 'Aluno ou aplicação não encontrado.',
        });
      return json(response, 200, { data: report });
    }
    const createStudentReportRenderMatch =
      request.method === 'POST' &&
      url.pathname.match(
        /^\/api\/assessment-applications\/([0-9a-f-]{36})\/students\/([0-9a-f-]{36})\/report-renders$/i,
      );
    if (createStudentReportRenderMatch) {
      const job = await createStudentReportRender({
        institutionId,
        userId,
        applicationId: createStudentReportRenderMatch[1],
        studentId: createStudentReportRenderMatch[2],
      });
      if (!job)
        return json(response, 404, {
          error: 'Aluno ou aplicação não encontrado.',
        });
      return json(response, 202, { data: job });
    }
    if (
      request.method === 'POST' &&
      url.pathname === '/api/chemistry/structures/preview'
    )
      return json(response, 200, {
        data: await renderChemicalStructure(await readJson(request)),
      });
    const studentProgressMatch =
      request.method === 'GET' &&
      url.pathname.match(/^\/api\/students\/([0-9a-f-]{36})\/progress$/i);
    if (studentProgressMatch) {
      const progress = await getStudentProgress({
        institutionId,
        studentId: studentProgressMatch[1],
      });
      if (!progress)
        return json(response, 404, { error: 'Aluno não encontrado.' });
      return json(response, 200, { data: progress });
    }
    const reportRenderMatch = url.pathname.match(
      /^\/api\/report-render-jobs\/([0-9a-f-]{36})(?:\/(pdf))?$/i,
    );
    if (request.method === 'GET' && reportRenderMatch?.[2] === 'pdf') {
      const file = await getApplicationReportFile({
        institutionId,
        jobId: reportRenderMatch[1],
      });
      if (file.error) return json(response, file.status, { error: file.error });
      response.writeHead(200, {
        'content-type': 'application/pdf',
        'content-length': file.size,
        'content-disposition': `attachment; filename="relatorio-turma-${reportRenderMatch[1]}.pdf"`,
        ...corsHeaders(response),
      });
      return file.stream.pipe(response);
    }
    if (request.method === 'GET' && reportRenderMatch) {
      const job = await getApplicationReportRender({
        institutionId,
        jobId: reportRenderMatch[1],
      });
      if (!job)
        return json(response, 404, { error: 'Relatório não encontrado.' });
      return json(response, 200, { data: job });
    }
    if (request.method === 'POST' && url.pathname === '/api/card-scans')
      return json(response, 202, {
        data: await createScan({
          institutionId,
          userId,
          input: await readJson(request),
        }),
      });
    if (request.method === 'GET' && url.pathname === '/api/card-scans')
      return json(response, 200, { data: await listScans({ institutionId }) });
    const scanReviewMatch =
      request.method === 'GET' &&
      url.pathname.match(/^\/api\/card-scans\/([0-9a-f-]{36})$/i);
    if (scanReviewMatch) {
      const scan = await getScanReview({
        institutionId,
        scanId: scanReviewMatch[1],
      });
      if (!scan)
        return json(response, 404, { error: 'Cartão não encontrado.' });
      return json(response, 200, { data: scan });
    }
    const scanImageMatch =
      request.method === 'GET' &&
      url.pathname.match(/^\/api\/card-scans\/([0-9a-f-]{36})\/image$/i);
    if (scanImageMatch) {
      const image = await getScanImage({
        institutionId,
        scanId: scanImageMatch[1],
      });
      if (image.error)
        return json(response, image.status, { error: image.error });
      response.writeHead(200, {
        'content-type': 'image/png',
        'content-length': image.size,
        'cache-control': 'private, max-age=300',
        ...corsHeaders(response),
      });
      return image.stream.pipe(response);
    }
    const scanRetryMatch =
      request.method === 'POST' &&
      url.pathname.match(/^\/api\/card-scans\/([0-9a-f-]{36})\/retry$/i);
    if (scanRetryMatch)
      return json(response, 202, {
        data: await retryScan({
          institutionId,
          scanId: scanRetryMatch[1],
        }),
      });
    const scanConfirmMatch =
      request.method === 'POST' &&
      url.pathname.match(/^\/api\/card-scans\/([0-9a-f-]{36})\/confirm$/i);
    if (scanConfirmMatch)
      return json(response, 200, {
        data: await confirmScanReview({
          institutionId,
          userId,
          scanId: scanConfirmMatch[1],
          input: await readJson(request),
        }),
      });
    if (request.method === 'GET' && url.pathname === '/api/render-templates')
      return json(response, 200, {
        data: renderTemplateCatalog,
        fonts: renderFontCatalog,
        fontSizes: { min: 10, max: 16, default: 11 },
      });
    if (request.method === 'GET' && url.pathname === '/api/assessment-presets')
      return json(response, 200, {
        data: await listAssessmentPresets({ institutionId, userId }),
      });
    if (
      request.method === 'GET' &&
      url.pathname === '/api/curriculum/pedagogical-disciplines'
    )
      return json(response, 200, {
        data: await listPedagogicalDisciplines({ institutionId }),
      });
    if (
      request.method === 'POST' &&
      url.pathname === '/api/curriculum/pedagogical-disciplines'
    )
      return json(response, 201, {
        data: await createPedagogicalDiscipline({
          institutionId,
          userId,
          input: await readJson(request),
        }),
      });
    const disciplineSkillsMatch =
      request.method === 'PUT' &&
      url.pathname.match(
        /^\/api\/curriculum\/pedagogical-disciplines\/([0-9a-f-]{36})\/skills$/i,
      );
    if (disciplineSkillsMatch)
      return json(response, 200, {
        data: await setPedagogicalDisciplineSkills({
          institutionId,
          userId,
          disciplineId: disciplineSkillsMatch[1],
          input: await readJson(request),
        }),
      });
    if (request.method === 'POST' && url.pathname === '/api/assessment-presets')
      return json(response, 200, {
        data: await saveAssessmentPreset({
          institutionId,
          userId,
          input: await readJson(request),
        }),
      });
    const presetDeleteMatch =
      request.method === 'DELETE' &&
      url.pathname.match(/^\/api\/assessment-presets\/([0-9a-f-]{36})$/i);
    if (presetDeleteMatch) {
      const deleted = await deleteAssessmentPreset({
        institutionId,
        userId,
        presetId: presetDeleteMatch[1],
      });
      if (!deleted)
        return json(response, 404, { error: 'Configuração não encontrada.' });
      return json(response, 200, { data: { deleted: true } });
    }
    if (request.method === 'GET' && url.pathname === '/api/questions')
      return json(response, 200, {
        data: await listQuestions({
          institutionId,
          allInstitutions: Boolean(identity.portalAdmin),
          stage: url.searchParams.get('stage') || '',
          query: url.searchParams.get('q') || '',
          subject: url.searchParams.get('subject') || '',
          knowledgeObjectId: url.searchParams.get('knowledgeObjectId') || '',
          competencyId: url.searchParams.get('competencyId') || '',
          knowledgeTopic: url.searchParams.get('knowledgeTopic') || '',
          sourceInstitution: url.searchParams.get('sourceInstitution') || '',
          sourceYear: url.searchParams.get('sourceYear') || undefined,
          difficulty: url.searchParams.get('difficulty') || '',
        }),
      });
    if (request.method === 'GET' && url.pathname === '/api/question-filters')
      return json(response, 200, {
        data: await getQuestionFilterOptions({ institutionId }),
      });
    const questionMatch = url.pathname.match(
      /^\/api\/questions\/([0-9a-f-]{36})$/i,
    );
    if (request.method === 'GET' && questionMatch) {
      const question = await getQuestion({
        institutionId,
        role,
        questionId: questionMatch[1],
      });
      if (!question)
        return json(response, 404, { error: 'Questão não encontrada.' });
      return json(response, 200, { data: question });
    }
    if (request.method === 'DELETE' && questionMatch) {
      const deleted = await deleteQuestion({
        institutionId,
        userId,
        role,
        questionId: questionMatch[1],
      });
      if (!deleted)
        return json(response, 404, { error: 'Questão não encontrada.' });
      return json(response, 200, { data: { deleted: true } });
    }
    const revisionMatch =
      request.method === 'POST' &&
      url.pathname.match(/^\/api\/questions\/([0-9a-f-]{36})\/revisions$/i);
    if (revisionMatch)
      return json(response, 201, {
        data: await createQuestionRevision({
          institutionId,
          userId,
          role,
          questionId: revisionMatch[1],
          input: await readJson(request),
        }),
      });
    if(request.method==='POST' && ['/api/questions/status/bulk-approve','/api/questions/status/bulk-review'].includes(url.pathname)){
      if(!requestOrigin || !allowedOrigins.has(requestOrigin))return json(response,403,{error:'Origem não autorizada.'});
      return json(response,200,{data:await (url.pathname.endsWith('bulk-review')?sendQuestionsToReviewInBulk:approveQuestionsInBulk)({institutionId,userId,role:identity.portalAdmin&&!identity.developmentBypass?'admin':'teacher',input:await readJson(request)})});
    }
    const historyMatch=request.method==='GET' && url.pathname.match(/^\/api\/questions\/([0-9a-f-]{36})\/status-history$/i);
    if(historyMatch){response.setHeader('cache-control','no-store');return json(response,200,{data:await questionStatusHistory({institutionId,userId,questionId:historyMatch[1]})});}
    const questionStatusMatch =
      request.method === 'PATCH' &&
      url.pathname.match(/^\/api\/questions\/([0-9a-f-]{36})\/status$/i);
    if (questionStatusMatch) {
      if(!requestOrigin || !allowedOrigins.has(requestOrigin))return json(response,403,{error:'Origem não autorizada.'});
      const question = await setQuestionStatus({
        institutionId,
        userId,
        role:identity.portalAdmin && !identity.developmentBypass ? 'admin' : 'teacher',
        questionId: questionStatusMatch[1],
        input: await readJson(request),
      });
      if (!question)
        return json(response, 404, { error: 'Questão não encontrada.' });
      return json(response, 200, { data: question });
    }
    const questionDuplicateMatch =
      request.method === 'PATCH' &&
      url.pathname.match(/^\/api\/questions\/([0-9a-f-]{36})\/duplicate$/i);
    if (questionDuplicateMatch) {
      const question = await markQuestionDuplicate({
        institutionId,
        userId,
        role,
        questionId: questionDuplicateMatch[1],
        input: await readJson(request),
      });
      if (!question)
        return json(response, 404, { error: 'Questão não encontrada.' });
      return json(response, 200, { data: question });
    }
    const clearQuestionDuplicateMatch =
      request.method === 'DELETE' &&
      url.pathname.match(/^\/api\/questions\/([0-9a-f-]{36})\/duplicate$/i);
    if (clearQuestionDuplicateMatch) {
      const question = await clearQuestionDuplicate({
        institutionId,
        userId,
        role,
        questionId: clearQuestionDuplicateMatch[1],
      });
      if (!question)
        return json(response, 404, {
          error: 'Marcação de duplicidade não encontrada.',
        });
      return json(response, 200, { data: question });
    }
    const deleteQuestionDuplicateMatch =
      request.method === 'DELETE' &&
      url.pathname.match(
        /^\/api\/questions\/([0-9a-f-]{36})\/duplicate\/permanent$/i,
      );
    if (deleteQuestionDuplicateMatch) {
      const question = await permanentlyDeleteQuestionDuplicate({
        institutionId,
        userId,
        role,
        questionId: deleteQuestionDuplicateMatch[1],
      });
      if (!question)
        return json(response, 404, {
          error: 'Questão duplicada não encontrada.',
        });
      return json(response, 200, { data: question });
    }
    if (request.method === 'GET' && url.pathname === '/api/curriculum')
      return json(response, 200, {
        data: await listCurriculum({
          subject: url.searchParams.get('subject') || '',
        }),
      });
    if (
      request.method === 'GET' &&
      url.pathname === '/api/curriculum/high-school'
    )
      return json(response, 200, {
        data: await listHighSchoolCurriculum({
          area: url.searchParams.get('area') || '',
        }),
      });
    if (
      request.method === 'GET' &&
      url.pathname === '/api/curriculum/saeb/matrices'
    )
      return json(response, 200, {
        data: await listSaebMatrices({
          stage: url.searchParams.get('stage') || '',
          subject: url.searchParams.get('subject') || '',
          gradeRange: url.searchParams.get('gradeRange') || '',
        }),
      });
    if (
      request.method === 'GET' &&
      url.pathname === '/api/curriculum/saeb/descriptors'
    )
      return json(response, 200, {
        data: await listSaebDescriptors({
          stage: url.searchParams.get('stage') || '',
          matrixId: url.searchParams.get('matrixId') || '',
          subject: url.searchParams.get('subject') || '',
          gradeRange: url.searchParams.get('gradeRange') || '',
        }),
      });
    if (
      request.method === 'GET' &&
      url.pathname === '/api/curriculum/pedagogical-topics'
    )
      return json(response, 200, {
        data: await listPedagogicalTopics({
          institutionId,
          disciplineId: url.searchParams.get('disciplineId') || '',
          includeInactive:
            url.searchParams.get('includeInactive') === 'true' &&
            role !== 'teacher',
        }),
      });
    if (
      request.method === 'POST' &&
      url.pathname === '/api/curriculum/pedagogical-topics'
    ) {
      if (role === 'teacher')
        return json(response, 403, {
          error:
            'Somente coordenação e administração podem alterar o catálogo.',
        });
      return json(response, 201, {
        data: await createPedagogicalTopic({
          institutionId,
          userId,
          input: await readJson(request),
        }),
      });
    }
    if (
      request.method === 'POST' &&
      url.pathname === '/api/curriculum/pedagogical-topics/import'
    ) {
      if (role === 'teacher')
        return json(response, 403, {
          error: 'Somente coordenação e administração podem importar o catálogo.',
        });
      return json(response, 201, {
        data: await importPedagogicalTopicCatalog({
          institutionId,
          userId,
          catalog: await readJson(request),
        }),
      });
    }
    const pedagogicalTopicMatch =
      ['PATCH', 'DELETE'].includes(request.method) &&
      url.pathname.match(
        /^\/api\/curriculum\/pedagogical-topics\/([0-9a-f-]{36})$/i,
      );
    if (pedagogicalTopicMatch) {
      if (role === 'teacher')
        return json(response, 403, {
          error:
            'Somente coordenação e administração podem alterar o catálogo.',
        });
      if (request.method === 'DELETE') return json(response, 200, {
        data: await deletePedagogicalTopic({institutionId,topicId:pedagogicalTopicMatch[1],input:await readJson(request)}),
      });
      return json(response, 200, {
        data: await updatePedagogicalTopic({
          institutionId,
          userId,
          topicId: pedagogicalTopicMatch[1],
          input: await readJson(request),
        }),
      });
    }
    if (
      request.method === 'POST' &&
      url.pathname === '/api/curriculum/subjects'
    )
      return json(response, 201, {
        data: await createSubject(await readJson(request)),
      });
    if (
      request.method === 'POST' &&
      url.pathname === '/api/curriculum/knowledge-objects'
    )
      return json(response, 201, {
        data: await createKnowledgeObject(await readJson(request)),
      });
    if (request.method === 'POST' && url.pathname === '/api/curriculum/skills')
      return json(response, 201, {
        data: await createSkill(await readJson(request)),
      });
    const renderSourceMatch =
      request.method === 'GET' &&
      url.pathname.match(
        /^\/api\/render-jobs\/([0-9a-f-]{36})\/(prova|gabarito)\.tex$/i,
      );
    if (renderSourceMatch) {
      const file = await getRenderFile({
        institutionId,
        jobId: renderSourceMatch[1],
        kind: renderSourceMatch[2],
        format: 'tex',
      });
      if (file.error) return json(response, file.status, { error: file.error });
      const disposition =
        url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
      response.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        'content-length': file.size,
        'content-disposition': `${disposition}; filename="${renderSourceMatch[2]}.tex"`,
        ...corsHeaders(response),
      });
      return file.stream.pipe(response);
    }
    const renderMatch =
      request.method === 'GET' &&
      url.pathname.match(
        /^\/api\/render-jobs\/([0-9a-f-]{36})\/(prova|gabarito)$/i,
      );
    if (renderMatch) {
      const file = await getRenderFile({
        institutionId,
        jobId: renderMatch[1],
        kind: renderMatch[2],
      });
      if (file.error) return json(response, file.status, { error: file.error });
      response.writeHead(200, {
        'content-type': 'application/pdf',
        'content-length': file.size,
        'content-disposition': `attachment; filename="${renderMatch[2]}.pdf"`,
        ...corsHeaders(response),
      });
      return file.stream.pipe(response);
    }
    const renderStatusMatch =
      request.method === 'GET' &&
      url.pathname.match(/^\/api\/render-jobs\/([0-9a-f-]{36})$/i);
    if (renderStatusMatch) {
      const job = await getRenderJobStatus({
        institutionId,
        jobId: renderStatusMatch[1],
      });
      if (!job)
        return json(response, 404, {
          error: 'Trabalho de renderização não encontrado.',
        });
      return json(response, 200, { data: job });
    }
    if (
      request.method === 'POST' &&
      url.pathname === '/api/questions/preview'
    ) {
      if (
        activePreviewUsers.has(userId) ||
        activePreviewCount >= maxConcurrentPreviews
      ) {
        response.setHeader('retry-after', '5');
        return json(response, 429, {
          error: activePreviewUsers.has(userId)
            ? 'Já existe uma prévia sendo compilada para este usuário.'
            : 'O renderizador de prévias está ocupado. Tente novamente em alguns segundos.',
        });
      }
      activePreviewUsers.add(userId);
      activePreviewCount += 1;
      try {
        const pdf = await createQuestionPdfPreview(await readJson(request));
        response.writeHead(200, {
          'content-type': 'application/pdf',
          'content-disposition': 'inline; filename="previa-questao.pdf"',
          'cache-control': 'no-store',
          ...corsHeaders(response),
        });
        return response.end(pdf);
      } catch (error) {
        // Durante o desenvolvimento, devolva o diagnóstico do ConTeXt para
        // que o editor consiga exibir o log e apontar o comando inválido.
        return json(response, error?.statusCode || 422, {
          error: error instanceof Error ? error.message : 'Falha ao compilar a prévia.',
        });
      } finally {
        activePreviewUsers.delete(userId);
        activePreviewCount -= 1;
      }
    }
    if (request.method === 'GET' && url.pathname === '/api/questions/drafts') {
      if (!canEditCatalog) return json(response,403,{error:'Rascunhos são exclusivos de editores e administradores.'});
      response.setHeader('cache-control','no-store');
      return json(response,200,{data:await listDrafts({institutionId,userId})});
    }
    const draftMatch=/^\/api\/questions\/drafts\/([0-9a-f-]{36})(\/complete)?$/.exec(url.pathname);
    if (draftMatch) {
      if (!canEditCatalog) return json(response,403,{error:'Rascunhos são exclusivos de editores e administradores.'});
      response.setHeader('cache-control','no-store');
      const args={institutionId,userId,id:draftMatch[1]};
      if(request.method==='GET' && !draftMatch[2]) return json(response,200,{data:await getDraft(args)});
      if(request.method==='POST') {
        if(!requestOrigin || !allowedOrigins.has(requestOrigin)) return json(response,403,{error:'Origem não autorizada.'});
        return json(response,200,{data:draftMatch[2]?await completeDraft(args):await saveDraft({...args,input:await readJson(request)})});
      }
    }
    if (request.method === 'POST' && url.pathname === '/api/questions')
      return json(response, 201, {
        data: await createQuestion({
          institutionId,
          userId,
          input: await readJson(request),
        }),
      });
    if (
      request.method === 'GET' &&
      url.pathname === '/api/questions/duplicates'
    )
      return json(response, 200, {
        data: await listQuestionDuplicates({ institutionId }),
      });
    if (url.pathname === '/api/assessment-workspaces') {
      if (request.method === 'GET') return json(response,200,{data:await listWorkspaces({institutionId,userId,offset:Math.min(100000,Math.max(0,Number(url.searchParams.get('offset'))||0))})});
      if (request.method === 'POST') return json(response,201,{data:await createWorkspace({institutionId,userId,input:await readJson(request)})});
    }
    const workspaceMatch=url.pathname.match(/^\/api\/assessment-workspaces\/([0-9a-f-]{36})(\/pin)?$/i);
    if(workspaceMatch) {
      const args={institutionId,userId,id:workspaceMatch[1]};
      if(request.method==='GET' && !workspaceMatch[2]) return json(response,200,{data:await getWorkspace(args)});
      if(request.method==='PUT' && !workspaceMatch[2]) return json(response,200,{data:await saveWorkspace({...args,input:await readJson(request)})});
      if(request.method==='PATCH' && workspaceMatch[2]) return json(response,200,{data:await pinWorkspace({...args,input:await readJson(request)})});
      if(request.method==='DELETE' && !workspaceMatch[2]) return json(response,200,{data:await deleteWorkspace(args)});
    }
    if (request.method === 'GET' && url.pathname === '/api/assessments')
      return json(response, 200, {
        data: await listAssessments({ institutionId }),
      });
    const regenerateMatch=request.method==='POST' && url.pathname.match(/^\/api\/assessments\/([0-9a-f-]{36})\/renders$/i);
    if(regenerateMatch)return json(response,202,{data:await regenerateAssessment({institutionId,assessmentId:regenerateMatch[1]})});
    const assessmentMatch = url.pathname.match(
      /^\/api\/assessments\/([0-9a-f-]{36})$/i,
    );
    if (assessmentMatch && request.method === 'DELETE')
      return json(response, 200, {
        data: await deleteAssessment({
          institutionId,
          userId,
          assessmentId: assessmentMatch[1],
        }),
      });
    if (assessmentMatch && request.method === 'GET') {
      const assessment = await getAssessment({
        institutionId,
        assessmentId: assessmentMatch[1],
      });
      if (!assessment)
        return json(response, 404, { error: 'Avaliação não encontrada.' });
      return json(response, 200, { data: assessment });
    }
    if (request.method === 'POST' && url.pathname === '/api/assessments')
      return json(response, 201, {
        data: await createAssessment({
          institutionId,
          questionBankId: identity.questionBankId,
          userId,
          portalAdmin: identity.portalAdmin,
          input: await readJson(request),
        }),
      });
    const submissionCreateMatch =
      request.method === 'POST' &&
      url.pathname.match(
        /^\/api\/assessment-versions\/([0-9a-f-]{36})\/submissions$/i,
      );
    const submissionListMatch =
      request.method === 'GET' &&
      url.pathname.match(
        /^\/api\/assessment-versions\/([0-9a-f-]{36})\/submissions$/i,
      );
    if (submissionListMatch)
      return json(response, 200, {
        data: await listSubmissions({
          institutionId,
          versionId: submissionListMatch[1],
        }),
      });
    if (submissionCreateMatch)
      return json(response, 201, {
        data: await createSubmission({
          institutionId,
          versionId: submissionCreateMatch[1],
          input: await readJson(request),
        }),
      });
    const manualReviewMatch = request.method === 'POST' && url.pathname.match(/^\/api\/submissions\/([0-9a-f-]{36})\/manual-review$/i);
    if (manualReviewMatch) return json(response, 200, { data: await saveManualReview({ institutionId, userId, submissionId: manualReviewMatch[1], input: await readJson(request) }) });
    const submissionMatch =
      request.method === 'GET' &&
      url.pathname.match(/^\/api\/submissions\/([0-9a-f-]{36})$/i);
    if (submissionMatch) {
      const submission = await getSubmission({
        institutionId,
        submissionId: submissionMatch[1],
      });
      if (!submission)
        return json(response, 404, { error: 'Correção não encontrada.' });
      return json(response, 200, { data: submission });
    }
    return json(response, 404, { error: 'Rota não encontrada.' });
  } catch (error) {
    if (error.code === '23505' && (error.constraint === 'users_cpf_hash_unique' || error.constraint === 'users_email_key'))
      return json(response, 409, { error: 'Já existe cadastro com os dados informados. Entre na conta existente ou procure suporte.' });
    if (error instanceof ZodError)
      return json(response, 422, {
        error: error.issues.map((issue) => issue.message).join(' '),
        issues: error.issues,
      });
    if (error?.statusCode)
      return json(response, error.statusCode, {
        error: error.message,
        ...(error.duplicateQuestionId
          ? {
              duplicateQuestionId: error.duplicateQuestionId,
              duplicateQuestionCode: error.duplicateQuestionCode,
            }
          : {}),
      });
    console.error(error);
    return json(response, 500, { error: 'Erro interno.' });
  }
});

server.listen(port, () =>
  console.log(`Caderno API em http://localhost:${port}`),
);

for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    server.close();
    await pool.end();
    process.exit(0);
  });
