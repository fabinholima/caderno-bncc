import {
  importClassStudents,
  previewClassStudentImport,
} from './student-import.mjs';
import { regenerateAssessment } from './assessments.mjs';
import { getClassRoster, listClassStudents } from './academic.mjs';
import { deleteScanImage } from './scan-image-storage.mjs';
import { academicDashboard, studentTimeline } from './academic-insights.mjs';
import {
  academicYearClosingCheck,
  archiveAcademicYear,
  closeAcademicYear,
  createAcademicYear,
  deleteAcademicYear,
  reopenAcademicYear,
  getStudentHistory,
  listAcademicYears,
  updateAcademicYear,
} from './academic-years.mjs';
import {
  listWorkspaces,
  getWorkspace,
  createWorkspace,
  saveWorkspace,
  pinWorkspace,
  deleteWorkspace,
} from './assessment-workspaces.mjs';
import {
  questionStatusHistory,
  approveQuestionsInBulk,
  sendQuestionsToReviewInBulk,
} from './question-workflow.mjs';
import {
  listDrafts,
  getDraft,
  saveDraft,
  completeDraft,
} from './question-drafts.mjs';
import { requirePortalAdmin } from './portal-admin.mjs';
import {
  maintenanceStatus,
  maintenanceBlocks,
  saveMaintenance,
} from './maintenance.mjs';
import { createServer } from 'node:http';
import { authOriginAllowed } from './auth-origin.mjs';
import {
  apiSecurityHeaders,
  clientIp,
  configuredOrigins,
  jsonBodyAllowed,
  mutationOriginAllowed,
} from './request-security.mjs';
import { missingProductionSecrets } from './qr-signing.mjs';
import { findRoute } from './routes/router.mjs';
import { studentAreaRoutes } from './routes/student-area-routes.mjs';
import { gates } from './route-policy.mjs';
import {
  listApplicationResults,
  getResultDetail,
  authorizeResults,
  getResultSettings,
  saveResultSettings,
  listFollowups,
  saveFollowup,
} from './result-publication.mjs';
import {
  revenueReport,
  revenueReportCsv,
  listSubscribers,
  manageSubscriber,
} from './admin-dashboard.mjs';
import {
  catalogAccess,
  sharedCatalogRoute,
  setPortalEditor,
} from './portal-access.mjs';
import {
  deleteEducatorSchool,
  getEducatorProfile,
  saveEducatorProfile,
  saveEducatorProfileOnly,
  saveEducatorSchool,
  setHeaderSchool,
} from './educator-profile.mjs';
import { schoolCatalogReady, searchSchools } from './inep-schools.mjs';
import {
  googleConfigured,
  startGoogle,
  startGoogleLink,
  finishGoogle,
} from './google-auth.mjs';
import {
  createGoogleSessionExchange,
  claimGoogleSessionExchange,
} from './google-session-exchange.mjs';
import {
  canManageInstitutionTeam,
  canPurgeAcademicRecords,
} from './institution-permissions.mjs';
import {
  assertOwnership,
  assertRouteOwnership,
  teacherScope,
} from './ownership.mjs';
import { mobileGoogleAuth } from './mobile-google-auth.mjs';
import {
  billingStatus,
  createCheckout,
  cancelBilling,
  billingWebhook,
  previewBillingCoupon,
} from './billing.mjs';
import {
  publicBillingPlans,
  listBillingSettings,
  updateBillingPlan,
  saveBillingCoupon,
} from './billing-admin.mjs';
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
  streamApplicationBatchFile,
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
  deleteClass,
  createStudent,
  enrollStudent,
  getApplication,
  listApplications,
  listClasses,
  listStudents,
  updateStudent,
  retryApplicationRenders,
} from './academic.mjs';
import {
  confirmScanReview,
  createScan,
  getScanImage,
  getScanReview,
  listScans,
  retryScan,
  discardScan,
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
  listMyInstitutions,
  switchInstitution,
  authenticate as authenticateSession,
  completeCpf,
  createInvitation,
  getSubscription,
  login,
  logout,
  logoutAll,
  recordSessionNetwork,
  register,
  registerStudent,
  requestPasswordReset,
  resetPassword,
  requestEmailVerification,
  verifyEmail,
} from './auth.mjs';
import { mailConfigured, developmentMail } from './auth-mail.mjs';
import {
  createEssayApplication,
  createEssayPrompt,
  duplicateEssayPrompt,
  essayApplicationSheetsPdf,
  essayPromptFilters,
  essaySheetPdf,
  getEssayApplication,
  getEssayPrompt,
  listEssayApplications,
  listEssayPrompts,
  setEssayPromptStatus,
  updateEssayApplication,
  updateEssayPrompt,
} from './essays.mjs';
import {
  addTeacherScanFile,
  essayDashboard,
  essayFileForStaff,
  getEssayEntry,
  listEssayEntries,
  listEssayRubrics,
  markEssayAbsent,
  publishEssayApplication,
  publishEssayEntry,
  receiveTeacherScan,
  removeTeacherScanFile,
  reopenEssayGrading,
  requestEssayAiGrading,
  requestEssayOcr,
  returnEssayEntry,
  saveEssayGrading,
  saveEssayTranscription,
} from './essay-correction.mjs';
import { createQuestionPdfPreview } from './question-preview.mjs';
import { listSaebDescriptors, listSaebMatrices } from './saeb.mjs';
import { renderChemicalStructure } from './chemical-structures.mjs';
import { allowAuthAttempt } from './auth-attempts.mjs';
import {
  unlinkStudentAccount,
  inspectFirstAccess,
  completeFirstAccess,
  loginWithCode,
  allowCodeAttempt,
  renewAccessCode,
} from './student-access-code.mjs';
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
import {
  createErrorAlerter,
  errorFields,
  log,
  logPath,
  requestIdFrom,
} from './observability.mjs';

const port = Number(process.env.PORT || 8788);
const maxConcurrentPreviews = Number(process.env.PREVIEW_CONCURRENCY || 2);
let activePreviewCount = 0;
const activePreviewUsers = new Set();
const allowedOrigins = configuredOrigins();
console.log(`Origens autorizadas: ${[...allowedOrigins].join(', ')}`);

function corsHeaders(response) {
  return response.corsOrigin
    ? {
        'access-control-allow-origin': response.corsOrigin,
        'access-control-allow-credentials': 'true',
        'access-control-expose-headers': 'x-request-id',
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

/** Arquivo privado (foto ou PDF da redação): sem cache e nunca executável. */
function privateFile(response, { contents, mimeType, filename }) {
  response.writeHead(200, {
    'content-type': mimeType,
    'content-disposition': `inline; filename="${filename}"`,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy':
      "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    ...corsHeaders(response),
  });
  return response.end(contents);
}

function pdf(response, contents, filename, download = false) {
  response.writeHead(200, {
    'content-type': 'application/pdf',
    'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
    'cache-control': 'no-store',
    ...corsHeaders(response),
  });
  return response.end(contents);
}

async function readJson(request, maxBytes = 8_500_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes)
      throw Object.assign(new Error('Conteúdo enviado é grande demais.'), {
        statusCode: 413,
      });
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

function oauthCookie(value, age) {
  return `caderno_oauth=${value}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=${age}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

const missingSecrets = missingProductionSecrets();
if (missingSecrets.length) {
  console.error(
    `Configuração de produção incompleta: defina ${missingSecrets.join(' e ')} com pelo menos 32 caracteres aleatórios.`,
  );
  process.exit(1);
}
const securityHeaders = apiSecurityHeaders();
const recordServerError = createErrorAlerter();

const server = createServer(async (request, response) => {
  const startedAt = performance.now();
  const requestId = requestIdFrom(request);
  response.setHeader('x-request-id', requestId);
  response.on('finish', () => {
    const entry = {
      requestId,
      method: request.method,
      path: logPath(request.url),
      status: response.statusCode,
      durationMs: Math.round(performance.now() - startedAt),
    };
    // A checagem de saúde roda a cada 30 s: só entra no log quando falha.
    if (entry.path === '/health' && entry.status < 400) return;
    log(entry.status >= 500 ? 'error' : 'info', 'request', entry);
    recordServerError(entry);
  });
  const requestOrigin = request.headers.origin;
  response.corsOrigin = allowedOrigins.has(requestOrigin) ? requestOrigin : '';
  for (const [name, value] of Object.entries(securityHeaders))
    response.setHeader(name, value);
  if (request.method === 'OPTIONS') return json(response, 204, null);
  // A identidade é consultada antes do roteamento e nas rotas: resolve uma vez só.
  let identityPromise;
  const authenticate = (req) => (identityPromise ??= authenticateSession(req));
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (
      url.pathname.startsWith('/api/') &&
      !url.pathname.startsWith('/api/auth/') &&
      !mutationOriginAllowed({
        method: request.method,
        origin: requestOrigin,
        cookie: request.headers.cookie,
        mobileClient: request.headers['x-client'],
        allowedOrigins,
      })
    )
      return json(response, 403, {
        error: 'Origem da requisição não autorizada.',
      });
    if (
      url.pathname.startsWith('/api/') &&
      !jsonBodyAllowed({ method: request.method, headers: request.headers })
    )
      return json(response, 415, { error: 'Envie os dados no formato JSON.' });
    if (request.method === 'GET' && url.pathname === '/api/maintenance') {
      response.setHeader('cache-control', 'no-store');
      return json(response, 200, { data: await maintenanceStatus() });
    }
    if (
      request.method === 'GET' &&
      url.pathname === '/api/public/billing-plans'
    ) {
      response.setHeader('cache-control', 'public, max-age=60');
      return json(response, 200, { data: await publicBillingPlans() });
    }
    // Keep login/recovery, payment callbacks and health available during maintenance.
    if (
      url.pathname.startsWith('/api/') &&
      !url.pathname.startsWith('/api/auth/') &&
      url.pathname !== '/api/billing/webhook'
    ) {
      const state = await maintenanceStatus();
      if (maintenanceBlocks(state, await authenticate(request))) {
        response.setHeader('retry-after', '300');
        response.setHeader('cache-control', 'no-store');
        return json(response, 503, { error: state.message, maintenance: true });
      }
    }
    if (request.method === 'GET' && url.pathname === '/api/auth/config')
      return json(response, 200, {
        data: {
          google: googleConfigured(),
          googleMobile: googleConfigured(),
          passwordRecovery: mailConfigured() || developmentMail(),
        },
      });
    if (request.method === 'POST' && url.pathname.startsWith('/api/auth/')) {
      if (
        !authOriginAllowed({
          path: url.pathname,
          origin: requestOrigin,
          mobileClient: request.headers['x-client'],
          allowedOrigins,
        })
      )
        return json(response, 403, {
          error: 'Origem da requisição não autorizada.',
        });
      if (
        [
          '/api/auth/login',
          '/api/auth/register',
          '/api/auth/student/register',
          '/api/auth/student/first-access/inspect',
          '/api/auth/student/first-access',
          '/api/auth/student/code-login',
          '/api/auth/google/start',
          '/api/auth/google/link/start',
          '/api/auth/google/claim',
          '/api/auth/google/mobile/start',
          '/api/auth/forgot-password',
          '/api/auth/reset-password',
          '/api/auth/resend-verification',
          '/api/auth/verify-email',
        ].includes(url.pathname)
      ) {
        if (!(await allowAuthAttempt(clientIp(request) || 'unknown')))
          return json(response, 429, {
            error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.',
          });
      }
    }
    if (
      request.method === 'POST' &&
      url.pathname === '/api/auth/google/mobile/start'
    ) {
      response.setHeader('cache-control', 'no-store');
      return json(response, 200, {
        data: await mobileGoogleAuth.start(await readJson(request, 4096)),
      });
    }
    if (
      request.method === 'POST' &&
      url.pathname === '/api/auth/google/mobile/status'
    ) {
      response.setHeader('cache-control', 'no-store');
      return json(response, 200, {
        data: await mobileGoogleAuth.status(await readJson(request, 4096)),
      });
    }
    if (
      request.method === 'GET' &&
      url.pathname === '/api/auth/google/mobile/browser'
    ) {
      if (!(await allowAuthAttempt(clientIp(request) || 'unknown')))
        return json(response, 429, {
          error: 'Muitas tentativas. Aguarde e tente novamente.',
        });
      const result = await mobileGoogleAuth.browser(
        url.searchParams.get('ticket'),
      );
      response.setHeader('set-cookie', oauthCookie(result.browser, 600));
      response.writeHead(303, {
        location: result.url,
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      });
      return response.end();
    }
    if (
      request.method === 'POST' &&
      url.pathname === '/api/auth/google/start'
    ) {
      const result = await startGoogle(await readJson(request, 4096));
      return json(response, 200, { data: { url: result.url } });
    }
    if (
      request.method === 'POST' &&
      url.pathname === '/api/auth/google/claim'
    ) {
      if (!requestOrigin || !allowedOrigins.has(requestOrigin))
        return json(response, 403, {
          error: 'Origem da requisição não autorizada.',
        });
      const { code } = await readJson(request, 4096);
      const token = await claimGoogleSessionExchange(code);
      await recordSessionNetwork(token, request);
      setSessionCookie(response, token);
      return json(response, 200, { data: { authenticated: true } });
    }
    if (
      request.method === 'POST' &&
      url.pathname === '/api/auth/session/cookie'
    ) {
      // PWA: a entrada Google usa o fluxo do aplicativo e termina com um token
      // Bearer. O navegador troca o token por este cookie HttpOnly e o descarta,
      // para que nenhuma sessão fique em armazenamento acessível ao JavaScript.
      if (!requestOrigin || !allowedOrigins.has(requestOrigin))
        return json(response, 403, {
          error: 'Origem da requisição não autorizada.',
        });
      const token = /^Bearer\s+(.+)$/i.exec(
        request.headers.authorization || '',
      )?.[1];
      if (!token || !(await authenticate(request)))
        return json(response, 401, {
          error: 'Sessão inválida. Entre novamente.',
        });
      response.setHeader('cache-control', 'no-store');
      setSessionCookie(response, token);
      return json(response, 200, { data: { authenticated: true } });
    }
    if (
      request.method === 'POST' &&
      url.pathname === '/api/auth/google/link/start'
    ) {
      if (!requestOrigin || !allowedOrigins.has(requestOrigin))
        return json(response, 403, {
          error: 'Origem da requisição não autorizada.',
        });
      const identity = await authenticate(request);
      if (!identity)
        return json(response, 401, {
          error: 'Entre na conta que deseja vincular antes de continuar.',
        });
      if (identity.role === 'student')
        return json(response, 403, {
          error:
            'A vinculação do Google está disponível para contas de professores e gestores.',
        });
      const result = await startGoogleLink(identity.userId);
      response.setHeader('set-cookie', oauthCookie(result.browser, 600));
      return json(response, 200, { data: { url: result.url } });
    }
    if (
      request.method === 'GET' &&
      url.pathname === '/api/auth/google/callback'
    ) {
      if (!googleConfigured())
        return json(response, 503, { error: 'Login Google não configurado.' });
      const mobile = await mobileGoogleAuth.callback(
        url,
        request.headers.cookie,
      );
      if (mobile) {
        response.setHeader('set-cookie', oauthCookie('', 0));
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'referrer-policy': 'no-referrer',
          'content-security-policy':
            "default-src 'none'; frame-ancestors 'none'",
          'x-content-type-options': 'nosniff',
        });
        const text =
          mobile.status === 'completed'
            ? 'Entrada confirmada. Feche esta aba e volte ao aplicativo UFA Prova.'
            : mobile.message;
        return response.end(
          `<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UFA Prova</title><body><h1>UFA Prova</h1><p>${text}</p></body></html>`,
        );
      }
      const destination = new URL('/portal', process.env.AUTH_FRONTEND_URL);
      try {
        const result = await finishGoogle(url, request.headers.cookie);
        if (result.linked)
          destination.searchParams.set('google_link', 'success');
        else
          destination.searchParams.set(
            'google_session',
            await createGoogleSessionExchange(result.sessionId),
          );
        const sessionCookie = response.getHeader('set-cookie');
        response.setHeader('set-cookie', [
          ...(Array.isArray(sessionCookie)
            ? sessionCookie
            : sessionCookie
              ? [sessionCookie]
              : []),
          oauthCookie('', 0),
        ]);
      } catch (error) {
        console.error('Google OAuth callback failed', {
          message: error instanceof Error ? error.message : String(error),
          code: error?.code || null,
          statusCode: error?.statusCode || null,
        });
        destination.searchParams.set(
          error.googleLink ? 'google_link_error' : 'auth_error',
          error.statusCode === 428
            ? 'registration_required'
            : error.statusCode === 409 || error.code === '23505'
              ? 'existing_account'
              : 'google_failed',
        );
        response.setHeader('set-cookie', oauthCookie('', 0));
      }
      response.writeHead(303, {
        location: destination.href,
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      });
      return response.end();
    }
    if (request.method === 'POST' && url.pathname === '/api/billing/webhook')
      return json(response, 200, {
        data: await billingWebhook(
          request,
          url,
          await readJson(request, 64000),
        ),
      });
    if (request.method === 'GET' && url.pathname === '/health') {
      const readiness = await pool.query(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE filename='066_mobile_sync_manual_review.sql') AS mobile_sync_ready",
      );
      const ready = readiness.rows[0]?.mobile_sync_ready === true;
      return json(response, ready ? 200 : 503, {
        status: ready ? 'ok' : 'migration_pending',
        release: process.env.APP_RELEASE || null,
        mobileSyncSchemaVersion: ready ? 1 : 0,
      });
    }
    if (
      request.method === 'POST' &&
      url.pathname === '/api/auth/student/register'
    )
      return json(response, 201, {
        data: await registerStudent(await readJson(request, 4096)),
      });
    // Aluno sem e-mail: primeiro acesso pelo código pessoal e login com código e senha.
    if (
      request.method === 'POST' &&
      [
        '/api/auth/student/first-access/inspect',
        '/api/auth/student/first-access',
        '/api/auth/student/code-login',
      ].includes(url.pathname)
    ) {
      const input = await readJson(request, 4096);
      if (!(await allowCodeAttempt(input)))
        return json(response, 429, {
          error:
            'Muitas tentativas com este código. Aguarde 15 minutos e tente novamente.',
        });
      if (url.pathname.endsWith('/inspect'))
        return json(response, 200, { data: await inspectFirstAccess(input) });
      const result = url.pathname.endsWith('/code-login')
        ? await loginWithCode(input)
        : await completeFirstAccess(input);
      await recordSessionNetwork(result.token, request);
      setSessionCookie(response, result.token);
      const { token: _token, ...data } = result;
      if (request.headers['x-client'] === 'mobile') data.token = result.token;
      return json(response, 200, { data });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/register') {
      const result = await register(await readJson(request, 16384));
      return json(response, 201, { data: result });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      const credentials = await readJson(request, 16384);
      // Além do limite por IP, limita tentativas por conta contra ataques distribuídos.
      if (
        !(await allowAuthAttempt(
          `login:${String(credentials?.email || '')
            .trim()
            .toLowerCase()}`,
          10,
        ))
      )
        return json(response, 429, {
          error:
            'Muitas tentativas para esta conta. Aguarde 15 minutos e tente novamente.',
        });
      const result = await login(credentials);
      await recordSessionNetwork(result.token, request);
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
        data: await requestPasswordReset(await readJson(request, 16384)),
      });
    if (
      request.method === 'POST' &&
      url.pathname === '/api/auth/reset-password'
    )
      return json(response, 200, {
        data: await resetPassword(await readJson(request, 16384)),
      });
    if (
      request.method === 'POST' &&
      url.pathname === '/api/auth/resend-verification'
    )
      return json(response, 202, {
        data: await requestEmailVerification(await readJson(request, 4096)),
      });
    if (request.method === 'POST' && url.pathname === '/api/auth/verify-email')
      return json(response, 200, {
        data: await verifyEmail(await readJson(request, 4096)),
      });
    const identity = await authenticate(request);
    if (!identity)
      return json(response, 401, { error: 'Faça login para continuar.' });
    const { userId } = identity;
    // Professores só acessam turmas, alunos, aplicações e resultados próprios
    // (services/api/ownership.mjs). Alunos usam apenas as rotas /api/student.
    if (identity.role !== 'student')
      await assertRouteOwnership(identity, url.pathname);
    // IDs enviados no corpo (turma, aluno, aplicação...) passam pela mesma regra.
    const ownedInput = async (input, fields) => {
      for (const [field, kind] of Object.entries(fields)) {
        const [type, ids] =
          typeof kind === 'function'
            ? kind(input?.[field])
            : [kind, input?.[field]];
        if (ids) await assertOwnership(identity, type, ids);
      }
      return input;
    };
    response.setHeader('cache-control', 'no-store');
    if (
      /^\/api\/(?:class-invites|class-join-requests|student\/access-code|classes\/[^/]+\/(?:invite|join-requests|join-candidates))/.test(
        url.pathname,
      ) &&
      !['GET', 'HEAD'].includes(request.method)
    ) {
      if (
        requestOrigin
          ? !allowedOrigins.has(requestOrigin)
          : request.headers['x-client'] !== 'mobile'
      )
        return json(response, 403, { error: 'Origem não autorizada.' });
    }
    // Notas e resultados são dados escolares privados: nem o navegador nem o
    // service worker do aplicativo devem guardá-los.
    if (
      /^\/api\/(student\/|assessment-results|assessment-applications\/[0-9a-f-]{36}\/(results|result-settings)$)/i.test(
        url.pathname,
      )
    )
      response.setHeader('cache-control', 'no-store');
    // Área do aluno e convites de turma (routes/student-area-routes.mjs).
    const studentArea = findRoute(
      studentAreaRoutes,
      request.method,
      url.pathname,
    );
    if (studentArea) {
      const { route, params } = studentArea;
      if (
        route.originOrMobile &&
        (requestOrigin
          ? !allowedOrigins.has(requestOrigin)
          : request.headers['x-client'] !== 'mobile')
      )
        return json(response, 403, { error: 'Origem não autorizada.' });
      if (
        route.rateLimit &&
        !(await allowAuthAttempt(route.rateLimit(identity)))
      )
        return json(response, 429, { error: route.rateLimitError });
      const body = ['POST', 'PUT', 'PATCH'].includes(request.method)
        ? await readJson(request, route.maxBytes ?? 4096)
        : undefined;
      const result = await route.handler({ identity, params, body });
      if (route.responseType === 'pdf')
        return pdf(response, result.pdf, result.filename);
      if (route.responseType === 'file') return privateFile(response, result);
      return json(response, route.status ?? 200, { data: result });
    }
    const studentGate = gates.studentArea(identity, url.pathname);
    if (studentGate)
      return json(response, studentGate.status, { error: studentGate.error });
    if (url.pathname === '/api/admin/maintenance') {
      if (request.method === 'GET') {
        requirePortalAdmin(identity);
        return json(response, 200, { data: await maintenanceStatus() });
      }
      if (request.method === 'POST') {
        if (!requestOrigin || !allowedOrigins.has(requestOrigin))
          return json(response, 403, { error: 'Origem não autorizada.' });
        return json(response, 200, {
          data: await saveMaintenance(identity, await readJson(request, 4096)),
        });
      }
    }
    if (url.pathname.startsWith('/api/admin/'))
      response.setHeader('cache-control', 'no-store');
    if (request.method === 'GET' && url.pathname === '/api/admin/revenue.csv') {
      const year = url.searchParams.get('year') || new Date().getFullYear();
      const csv = await revenueReportCsv(identity, { year });
      response.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="receitas-${Number(year)}.csv"`,
        'cache-control': 'no-store',
        ...corsHeaders(response),
      });
      return response.end(csv);
    }
    if (request.method === 'GET' && url.pathname === '/api/admin/revenue')
      return json(response, 200, {
        data: await revenueReport(identity, {
          year: url.searchParams.get('year') || new Date().getFullYear(),
        }),
      });
    if (url.pathname === '/api/admin/billing-settings') {
      if (request.method === 'GET')
        return json(response, 200, {
          data: await listBillingSettings(identity),
        });
      if (request.method === 'POST') {
        if (!requestOrigin || !allowedOrigins.has(requestOrigin))
          return json(response, 403, {
            error: 'Origem da requisição não autorizada.',
          });
        return json(response, 200, {
          data: await updateBillingPlan(
            identity,
            await readJson(request, 4096),
          ),
        });
      }
    }
    if (
      request.method === 'POST' &&
      url.pathname === '/api/admin/billing-coupons'
    ) {
      if (!requestOrigin || !allowedOrigins.has(requestOrigin))
        return json(response, 403, {
          error: 'Origem da requisição não autorizada.',
        });
      return json(response, 200, {
        data: await saveBillingCoupon(identity, await readJson(request, 4096)),
      });
    }
    if (request.method === 'GET' && url.pathname === '/api/admin/subscribers')
      return json(response, 200, {
        data: await listSubscribers(
          identity,
          Object.fromEntries(
            ['q', 'ip', 'status', 'plan', 'sort', 'page'].map((key) => [
              key,
              url.searchParams.get(key) || undefined,
            ]),
          ),
        ),
      });
    if (
      request.method === 'POST' &&
      url.pathname === '/api/admin/subscribers'
    ) {
      if (!requestOrigin || !allowedOrigins.has(requestOrigin))
        return json(response, 403, { error: 'Origem não autorizada.' });
      return json(response, 200, {
        data: await manageSubscriber(identity, await readJson(request, 4096)),
      });
    }
    const canEditCatalog = catalogAccess(
      identity,
      request.method,
      url.pathname,
    );
    const sharedRoute = sharedCatalogRoute(url.pathname);
    const institutionId = sharedRoute
      ? identity.questionBankId || identity.institutionId
      : identity.institutionId;
    const role = sharedRoute
      ? canEditCatalog
        ? 'admin'
        : 'teacher'
      : identity.role;
    if (
      request.method === 'POST' &&
      url.pathname === '/api/admin/bank-context'
    ) {
      return json(response, 410, {
        error: 'O portal agora usa um painel único. Atualize a página.',
      });
    }
    if (request.method === 'POST' && url.pathname === '/api/admin/editors') {
      if (!requestOrigin || !allowedOrigins.has(requestOrigin))
        return json(response, 403, { error: 'Origem não autorizada.' });
      return json(response, 200, {
        data: await setPortalEditor(identity, await readJson(request, 4096)),
      });
    }
    if (
      request.method === 'POST' &&
      url.pathname === '/api/invitations' &&
      !canManageInstitutionTeam(identity)
    )
      return json(response, 403, {
        error:
          'Somente o administrador da instituição pode convidar membros da equipe.',
      });
    if (request.method === 'POST' && url.pathname === '/api/auth/complete-cpf')
      return json(response, 200, {
        data: await completeCpf(identity, await readJson(request, 4096)),
      });
    const cpfGate = gates.cpf(identity, url.pathname);
    if (cpfGate)
      return json(response, cpfGate.status, { error: cpfGate.error });
    if (
      identity.role === 'student' &&
      (url.pathname.startsWith('/api/educator-profile') ||
        url.pathname === '/api/escolas')
    )
      return json(response, 403, {
        error: 'Esta área é exclusiva para professores e gestores.',
      });
    if (request.method === 'GET' && url.pathname === '/api/educator-profile')
      return json(response, 200, { data: await getEducatorProfile(userId) });
    if (request.method === 'GET' && url.pathname === '/api/escolas') {
      const data = await searchSchools({
        q: url.searchParams.get('q') || '',
        uf: url.searchParams.get('uf') || '',
      });
      return json(response, 200, {
        data,
        catalogAvailable: data.length > 0 || (await schoolCatalogReady()),
      });
    }
    if (request.method === 'POST' && url.pathname === '/api/educator-profile') {
      if (!requestOrigin || !allowedOrigins.has(requestOrigin))
        return json(response, 403, { error: 'Origem não autorizada.' });
      return json(response, 200, {
        data: await saveEducatorProfile(
          userId,
          await readJson(request, 650000),
        ),
      });
    }
    if (
      request.method === 'POST' &&
      url.pathname === '/api/educator-profile/profile'
    ) {
      if (!requestOrigin || !allowedOrigins.has(requestOrigin))
        return json(response, 403, { error: 'Origem não autorizada.' });
      return json(response, 200, {
        data: await saveEducatorProfileOnly(
          userId,
          await readJson(request, 650000),
        ),
      });
    }
    if (
      request.method === 'POST' &&
      url.pathname === '/api/educator-profile/schools'
    ) {
      if (!requestOrigin || !allowedOrigins.has(requestOrigin))
        return json(response, 403, { error: 'Origem não autorizada.' });
      return json(response, 200, {
        data: await saveEducatorSchool(userId, await readJson(request, 650000)),
      });
    }
    const educatorSchoolMatch = url.pathname.match(
      /^\/api\/educator-profile\/schools\/([0-9a-f-]{36})(?:\/(header-default))?$/i,
    );
    if (
      educatorSchoolMatch &&
      request.method === 'DELETE' &&
      !educatorSchoolMatch[2]
    ) {
      if (!requestOrigin || !allowedOrigins.has(requestOrigin))
        return json(response, 403, { error: 'Origem não autorizada.' });
      return json(response, 200, {
        data: await deleteEducatorSchool(userId, educatorSchoolMatch[1]),
      });
    }
    if (
      educatorSchoolMatch &&
      request.method === 'PATCH' &&
      educatorSchoolMatch[2]
    ) {
      if (!requestOrigin || !allowedOrigins.has(requestOrigin))
        return json(response, 403, { error: 'Origem não autorizada.' });
      return json(response, 200, {
        data: await setHeaderSchool(userId, educatorSchoolMatch[1]),
      });
    }
    const profileGate = gates.profile(identity, url.pathname);
    if (profileGate)
      return json(response, profileGate.status, { error: profileGate.error });
    if (request.method === 'GET' && url.pathname === '/api/billing')
      return json(response, 200, { data: await billingStatus(identity) });
    if (
      request.method === 'POST' &&
      url.pathname === '/api/billing/coupon/validate'
    ) {
      if (!requestOrigin || !allowedOrigins.has(requestOrigin))
        return json(response, 403, {
          error: 'Origem da requisição não autorizada.',
        });
      return json(response, 200, {
        data: await previewBillingCoupon(
          identity,
          await readJson(request, 4096),
        ),
      });
    }
    if (
      request.method === 'POST' &&
      ['/api/billing/checkout', '/api/billing/cancel'].includes(url.pathname)
    ) {
      if (!requestOrigin || !allowedOrigins.has(requestOrigin))
        return json(response, 403, {
          error: 'Origem da requisição não autorizada.',
        });
      return json(response, 200, {
        data: url.pathname.endsWith('/checkout')
          ? await createCheckout(identity, await readJson(request, 4096))
          : await cancelBilling(identity),
      });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
      await logout(identity.sessionId);
      clearSessionCookie(response);
      return json(response, 200, { data: { loggedOut: true } });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/logout-all') {
      if (
        requestOrigin
          ? !allowedOrigins.has(requestOrigin)
          : request.headers['x-client'] !== 'mobile'
      )
        return json(response, 403, { error: 'Origem não autorizada.' });
      const data = await logoutAll(identity);
      clearSessionCookie(response);
      return json(response, 200, { data });
    }
    if (
      request.method === 'POST' &&
      ['/api/auth/institution', '/api/invitations/accept'].includes(
        url.pathname,
      ) &&
      (requestOrigin
        ? !allowedOrigins.has(requestOrigin)
        : request.headers['x-client'] !== 'mobile')
    )
      return json(response, 403, { error: 'Origem não autorizada.' });
    if (request.method === 'POST' && url.pathname === '/api/auth/institution')
      return json(response, 200, {
        data: await switchInstitution(identity, await readJson(request, 4096)),
      });
    if (request.method === 'GET' && url.pathname === '/api/auth/me')
      return json(response, 200, {
        data: {
          user: {
            id: identity.userId,
            email: identity.email,
            displayName: identity.displayName,
            cpfComplete: Boolean(identity.cpfComplete),
            profileComplete: Boolean(identity.profileComplete),
            googleLinked: Boolean(identity.googleLinked),
          },
          institution: {
            id: identity.institutionId,
            name: identity.institutionName,
          },
          institutions: await listMyInstitutions(identity),
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
          error:
            'Cancele o processamento ativo antes de remover esta importação.',
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
      const ready = await pool.query(
        "SELECT to_regclass('mobile_mutations') AS ledger",
      );
      if (!ready.rows[0]?.ledger)
        return json(response, 503, {
          error: 'A migração de sincronização móvel ainda não foi aplicada.',
        });
      return json(response, 200, {
        data: {
          version: 1,
          idempotentUploads: true,
          manualReview: true,
          applicationScopedUploads: true,
          userId,
          institutionId,
        },
      });
    }
    // Módulo de redação: temas, folhas em PDF e aplicação às turmas.
    if (url.pathname === '/api/essay-prompts' && request.method === 'GET')
      return json(response, 200, {
        data: await listEssayPrompts(
          identity,
          Object.fromEntries(
            [
              'scope',
              'q',
              'keyword',
              'category',
              'institution',
              'year',
              'status',
              'archived',
            ].map((key) => [key, url.searchParams.get(key) || undefined]),
          ),
        ),
      });
    if (url.pathname === '/api/essay-prompts' && request.method === 'POST')
      return json(response, 201, {
        data: await createEssayPrompt(identity, await readJson(request)),
      });
    if (
      url.pathname === '/api/essay-prompts/filters' &&
      request.method === 'GET'
    )
      return json(response, 200, { data: await essayPromptFilters(identity) });
    const essayPromptMatch = url.pathname.match(
      /^\/api\/essay-prompts\/([0-9a-f-]{36})(?:\/(duplicate|status))?$/i,
    );
    if (essayPromptMatch) {
      const [, promptId, action] = essayPromptMatch;
      if (!action && request.method === 'GET')
        return json(response, 200, {
          data: await getEssayPrompt(identity, promptId),
        });
      if (!action && request.method === 'PUT')
        return json(response, 200, {
          data: await updateEssayPrompt(
            identity,
            promptId,
            await readJson(request),
          ),
        });
      if (action === 'duplicate' && request.method === 'POST')
        return json(response, 201, {
          data: await duplicateEssayPrompt(identity, promptId),
        });
      if (action === 'status' && request.method === 'POST')
        return json(response, 200, {
          data: await setEssayPromptStatus(
            identity,
            promptId,
            await readJson(request, 4096),
          ),
        });
    }
    if (url.pathname === '/api/essay-sheets/pdf' && request.method === 'POST')
      return pdf(
        response,
        await essaySheetPdf(identity, await readJson(request)),
        'folha-de-redacao.pdf',
        url.searchParams.get('download') === '1',
      );
    if (url.pathname === '/api/essay-applications' && request.method === 'GET')
      return json(response, 200, {
        data: await listEssayApplications(identity, {
          classId: url.searchParams.get('classId') || undefined,
          promptId: url.searchParams.get('promptId') || undefined,
        }),
      });
    if (url.pathname === '/api/essay-applications' && request.method === 'POST')
      return json(response, 201, {
        data: await createEssayApplication(
          identity,
          await ownedInput(await readJson(request, 16384), {
            classId: 'class',
            classIds: 'class',
          }),
        ),
      });
    // Correção de redações (essay-correction.mjs).
    if (url.pathname === '/api/essay-rubrics' && request.method === 'GET')
      return json(response, 200, { data: await listEssayRubrics(identity) });
    const essayFilters = () =>
      Object.fromEntries(
        [
          'applicationId',
          'classId',
          'promptId',
          'teacherId',
          'schoolId',
          'schoolYear',
          'from',
          'to',
          'status',
          'q',
          'page',
        ].map((key) => [key, url.searchParams.get(key) || undefined]),
      );
    if (url.pathname === '/api/essay-entries' && request.method === 'GET')
      return json(response, 200, {
        data: await listEssayEntries(identity, essayFilters()),
      });
    if (url.pathname === '/api/essay-dashboard' && request.method === 'GET')
      return json(response, 200, {
        data: await essayDashboard(identity, essayFilters()),
      });
    const essayFileMatch =
      request.method === 'GET' &&
      url.pathname.match(/^\/api\/essay-files\/([0-9a-f-]{36})$/i);
    if (essayFileMatch)
      return privateFile(
        response,
        await essayFileForStaff(identity, essayFileMatch[1]),
      );
    const essayEntryMatch = url.pathname.match(
      /^\/api\/essay-entries\/([0-9a-f-]{36})(?:\/([a-z-]+(?:\/(?![0-9a-f-]{36}$)[a-z-]+)?))?(?:\/([0-9a-f-]{36}))?$/i,
    );
    if (essayEntryMatch) {
      const [, entryId, action = '', fileId] = essayEntryMatch;
      const route = `${request.method} ${action}${fileId ? '/:id' : ''}`;
      const body = () => readJson(request, 64000);
      const handlers = {
        'GET ': () => getEssayEntry(identity, entryId),
        'POST files': async () =>
          addTeacherScanFile(
            identity,
            entryId,
            await readJson(request, 12_500_000),
          ),
        'DELETE files/:id': () =>
          removeTeacherScanFile(identity, entryId, fileId),
        'POST receive': () => receiveTeacherScan(identity, entryId),
        'POST absent': async () =>
          markEssayAbsent(identity, entryId, await body()),
        'PUT transcription': async () =>
          saveEssayTranscription(identity, entryId, await body()),
        'POST ocr': () => requestEssayOcr(identity, entryId),
        'POST ai-grading': () => requestEssayAiGrading(identity, entryId),
        'PUT grading': async () =>
          saveEssayGrading(identity, entryId, await body()),
        'POST grading/finalize': async () =>
          saveEssayGrading(identity, entryId, await body(), { finalize: true }),
        'POST grading/reopen': () => reopenEssayGrading(identity, entryId),
        'POST publish': async () =>
          publishEssayEntry(identity, entryId, await body()),
        'POST return': async () =>
          returnEssayEntry(identity, entryId, await body()),
      };
      if (handlers[route])
        return json(response, 200, { data: await handlers[route]() });
    }
    if (
      request.method === 'POST' &&
      /^\/api\/essay-applications\/[0-9a-f-]{36}\/publish$/i.test(url.pathname)
    )
      return json(response, 200, {
        data: await publishEssayApplication(
          identity,
          url.pathname.split('/')[3],
          await readJson(request, 4096),
        ),
      });
    const essayApplicationMatch = url.pathname.match(
      /^\/api\/essay-applications\/([0-9a-f-]{36})(\/sheets\.pdf)?$/i,
    );
    if (essayApplicationMatch) {
      const [, applicationId, sheets] = essayApplicationMatch;
      if (sheets && request.method === 'GET')
        return pdf(
          response,
          await essayApplicationSheetsPdf(identity, applicationId, {
            studentId: url.searchParams.get('studentId') || undefined,
          }),
          'folhas-de-redacao.pdf',
          url.searchParams.get('download') === '1',
        );
      if (!sheets && request.method === 'GET')
        return json(response, 200, {
          data: await getEssayApplication(identity, applicationId),
        });
      if (!sheets && request.method === 'PATCH')
        return json(response, 200, {
          data: await updateEssayApplication(
            identity,
            applicationId,
            await readJson(request, 4096),
          ),
        });
    }
    const classStudentsMatch =
      request.method === 'GET' &&
      url.pathname.match(/^\/api\/classes\/([0-9a-f-]{36})\/students$/i);
    if (classStudentsMatch)
      return json(response, 200, {
        data: await listClassStudents({
          institutionId,
          classId: classStudentsMatch[1],
        }),
      });
    const classRosterMatch =
      request.method === 'GET' &&
      url.pathname.match(/^\/api\/classes\/([0-9a-f-]{36})\/roster$/i);
    if (classRosterMatch)
      return json(response, 200, {
        data: await getClassRoster({
          institutionId,
          userId,
          classId: classRosterMatch[1],
        }),
      });
    if (request.method === 'GET' && url.pathname === '/api/classes')
      return json(response, 200, {
        data: await listClasses({
          institutionId,
          ownerId: teacherScope(identity),
        }),
      });
    if (request.method === 'POST' && url.pathname === '/api/classes')
      return json(response, 201, {
        data: await createClass({
          institutionId,
          userId,
          input: await readJson(request),
        }),
      });
    const classMatch = url.pathname.match(/^\/api\/classes\/([0-9a-f-]{36})$/i);
    if (classMatch && request.method === 'DELETE')
      return json(response, 200, {
        data: await deleteClass({
          institutionId,
          classId: classMatch[1],
        }),
      });
    if (request.method === 'GET' && url.pathname === '/api/academic-years')
      return json(response, 200, { data: await listAcademicYears(identity) });
    if (request.method === 'POST' && url.pathname === '/api/academic-years')
      return json(response, 201, {
        data: await createAcademicYear(identity, await readJson(request, 4096)),
      });
    const academicYearMatch =
      request.method === 'PATCH' &&
      url.pathname.match(/^\/api\/academic-years\/([0-9a-f-]{36})$/i);
    if (academicYearMatch)
      return json(response, 200, {
        data: await updateAcademicYear(
          identity,
          academicYearMatch[1],
          await readJson(request, 4096),
        ),
      });
    const academicYearDeleteMatch =
      request.method === 'DELETE' &&
      url.pathname.match(/^\/api\/academic-years\/([0-9a-f-]{36})$/i);
    if (academicYearDeleteMatch)
      return json(response, 200, {
        data: await deleteAcademicYear(identity, academicYearDeleteMatch[1]),
      });
    const closingCheckMatch =
      request.method === 'GET' &&
      url.pathname.match(
        /^\/api\/academic-years\/([0-9a-f-]{36})\/closing-check$/i,
      );
    if (closingCheckMatch)
      return json(response, 200, {
        data: await academicYearClosingCheck(identity, closingCheckMatch[1]),
      });
    const closeYearMatch =
      request.method === 'POST' &&
      url.pathname.match(/^\/api\/academic-years\/([0-9a-f-]{36})\/close$/i);
    if (closeYearMatch) {
      try {
        return json(response, 200, {
          data: await closeAcademicYear(
            identity,
            closeYearMatch[1],
            await readJson(request, 4096),
          ),
        });
      } catch (error) {
        // O relatório de pendências volta junto, para o assistente mostrar.
        if (error?.report)
          return json(response, error.statusCode || 409, {
            error: error.message,
            report: error.report,
          });
        throw error;
      }
    }
    const academicYearActionMatch =
      request.method === 'POST' &&
      url.pathname.match(
        /^\/api\/academic-years\/([0-9a-f-]{36})\/(archive|reopen)$/i,
      );
    if (academicYearActionMatch)
      return json(response, 200, {
        data: await (
          academicYearActionMatch[2] === 'archive'
            ? archiveAcademicYear
            : reopenAcademicYear
        )(identity, academicYearActionMatch[1], await readJson(request, 4096)),
      });
    if (request.method === 'GET' && url.pathname === '/api/academic-dashboard')
      return json(response, 200, {
        data: await academicDashboard(identity, teacherScope(identity)),
      });
    const studentTimelineMatch =
      request.method === 'GET' &&
      url.pathname.match(/^\/api\/students\/([0-9a-f-]{36})\/timeline$/i);
    if (studentTimelineMatch)
      return json(response, 200, {
        data: await studentTimeline(
          identity,
          studentTimelineMatch[1],
          teacherScope(identity),
        ),
      });
    const studentHistoryMatch =
      request.method === 'GET' &&
      url.pathname.match(/^\/api\/students\/([0-9a-f-]{36})\/history$/i);
    if (studentHistoryMatch)
      return json(response, 200, {
        data: await getStudentHistory(
          identity,
          studentHistoryMatch[1],
          teacherScope(identity),
        ),
      });
    if (request.method === 'POST' && url.pathname === '/api/students')
      return json(response, 201, {
        data: await createStudent({
          institutionId,
          userId,
          portalAdmin: identity.portalAdmin,
          developmentBypass: identity.developmentBypass,
          input: await readJson(request),
        }),
      });
    if (request.method === 'GET' && url.pathname === '/api/students')
      return json(response, 200, {
        data: await listStudents({
          institutionId,
          ownerId: teacherScope(identity),
        }),
      });
    const studentActiveMatch =
      request.method === 'PATCH' &&
      url.pathname.match(/^\/api\/students\/([0-9a-f-]{36})$/i);
    if (studentActiveMatch)
      return json(response, 200, {
        data: await updateStudent({
          institutionId,
          studentId: studentActiveMatch[1],
          input: await readJson(request),
        }),
      });
    const studentAccessCodeMatch =
      request.method === 'POST' &&
      url.pathname.match(/^\/api\/students\/([0-9a-f-]{36})\/access-code$/i);
    if (studentAccessCodeMatch)
      return json(response, 200, {
        data: await renewAccessCode(identity, studentAccessCodeMatch[1]),
      });
    const studentAccountLinkMatch =
      request.method === 'DELETE' &&
      url.pathname.match(/^\/api\/students\/([0-9a-f-]{36})\/account-link$/i);
    if (studentAccountLinkMatch)
      return json(response, 200, {
        data: await unlinkStudentAccount(identity, studentAccountLinkMatch[1]),
      });
    const studentImportMatch =
      request.method === 'POST' &&
      url.pathname.match(
        /^\/api\/classes\/([0-9a-f-]{36})\/students\/import$/i,
      );
    if (studentImportMatch)
      return json(response, 200, {
        data: await importClassStudents({
          institutionId,
          userId,
          classId: studentImportMatch[1],
          portalAdmin: identity.portalAdmin,
          developmentBypass: identity.developmentBypass,
          input: await readJson(request, 2_800_100),
        }),
      });
    const studentImportPreviewMatch =
      request.method === 'POST' &&
      url.pathname.match(
        /^\/api\/classes\/([0-9a-f-]{36})\/students\/import\/preview$/i,
      );
    if (studentImportPreviewMatch)
      return json(response, 200, {
        data: await previewClassStudentImport({
          institutionId,
          classId: studentImportPreviewMatch[1],
          input: await readJson(request, 2_800_100),
        }),
      });
    const enrollmentMatch =
      request.method === 'POST' &&
      url.pathname.match(/^\/api\/classes\/([0-9a-f-]{36})\/enrollments$/i);
    if (enrollmentMatch)
      return json(response, 201, {
        data: await enrollStudent({
          institutionId,
          userId,
          classId: enrollmentMatch[1],
          input: await ownedInput(await readJson(request), {
            studentId: 'student',
          }),
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
          input: await ownedInput(await readJson(request), {
            assessmentId: 'assessment',
            classId: 'class',
          }),
        }),
      });
    if (
      request.method === 'GET' &&
      url.pathname === '/api/assessment-applications'
    )
      return json(response, 200, {
        data: await listApplications({
          institutionId,
          ownerId: teacherScope(identity),
        }),
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
      await streamApplicationBatchFile(
        response,
        file,
        `provas-${applicationBatchMatch[1]}.pdf`,
        corsHeaders,
      );
      return;
    }
    const answerCardBatchMatch =
      request.method === 'GET' &&
      url.pathname.match(
        /^\/api\/assessment-applications\/([0-9a-f-]{36})\/answer-cards\.pdf$/i,
      );
    if (answerCardBatchMatch) {
      const file = await getApplicationBatchFile({
        institutionId,
        applicationId: answerCardBatchMatch[1],
        kind: 'answer-card',
      });
      if (file.error) return json(response, file.status, { error: file.error });
      await streamApplicationBatchFile(
        response,
        file,
        `cartoes-resposta-${answerCardBatchMatch[1]}.pdf`,
        corsHeaders,
      );
      return;
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
          portalAdmin: identity.portalAdmin,
          developmentBypass: identity.developmentBypass,
          input: await ownedInput(await readJson(request), {
            expectedApplicationId: 'application',
          }),
        }),
      });
    if (request.method === 'GET' && url.pathname === '/api/card-scans')
      return json(response, 200, {
        data: await listScans({
          institutionId,
          ownerId: teacherScope(identity),
        }),
      });
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
          portalAdmin: identity.portalAdmin,
          developmentBypass: identity.developmentBypass,
          scanId: scanRetryMatch[1],
        }),
      });
    const scanDiscardMatch =
      request.method === 'POST' &&
      url.pathname.match(/^\/api\/card-scans\/([0-9a-f-]{36})\/discard$/i);
    if (scanDiscardMatch)
      return json(response, 200, {
        data: await discardScan({
          institutionId,
          userId,
          scanId: scanDiscardMatch[1],
          privileged: canPurgeAcademicRecords(identity),
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
          input: await ownedInput(await readJson(request), {
            applicationStudentId: 'applicationStudent',
          }),
        }),
      });
    // Revisão e autorização de resultados (docs/resultados-publicacao.md).
    const applicationResultsMatch =
      request.method === 'GET' &&
      url.pathname.match(
        /^\/api\/assessment-applications\/([0-9a-f-]{36})\/results$/i,
      );
    if (applicationResultsMatch)
      return json(response, 200, {
        data: await listApplicationResults({
          institutionId,
          applicationId: applicationResultsMatch[1],
        }),
      });
    const resultSettingsMatch = url.pathname.match(
      /^\/api\/assessment-applications\/([0-9a-f-]{36})\/result-settings$/i,
    );
    if (resultSettingsMatch && request.method === 'GET')
      return json(response, 200, {
        data: await getResultSettings({
          institutionId,
          applicationId: resultSettingsMatch[1],
        }),
      });
    if (resultSettingsMatch && request.method === 'PUT')
      return json(response, 200, {
        data: await saveResultSettings({
          institutionId,
          userId,
          applicationId: resultSettingsMatch[1],
          input: await readJson(request, 32768),
        }),
      });
    if (
      request.method === 'POST' &&
      url.pathname === '/api/assessment-results/authorize'
    )
      return json(response, 200, {
        data: await authorizeResults({
          institutionId,
          userId,
          input: await ownedInput(await readJson(request, 65536), {
            applicationId: 'application',
            items: (items) => [
              'result',
              items?.map?.((item) => item?.resultId),
            ],
          }),
        }),
      });
    const followupMatch = url.pathname.match(
      /^\/api\/assessment-results\/([0-9a-f-]{36})\/followups$/i,
    );
    if (followupMatch && request.method === 'GET')
      return json(response, 200, {
        data: await listFollowups({
          institutionId,
          resultId: followupMatch[1],
        }),
      });
    if (followupMatch && request.method === 'POST')
      return json(response, 201, {
        data: await saveFollowup({
          institutionId,
          userId,
          resultId: followupMatch[1],
          input: await readJson(request, 32768),
        }),
      });
    const resultDetailMatch =
      request.method === 'GET' &&
      url.pathname.match(/^\/api\/assessment-results\/([0-9a-f-]{36})$/i);
    if (resultDetailMatch)
      return json(response, 200, {
        data: await getResultDetail({
          institutionId,
          resultId: resultDetailMatch[1],
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
    if (
      request.method === 'POST' &&
      [
        '/api/questions/status/bulk-approve',
        '/api/questions/status/bulk-review',
      ].includes(url.pathname)
    ) {
      if (!requestOrigin || !allowedOrigins.has(requestOrigin))
        return json(response, 403, { error: 'Origem não autorizada.' });
      return json(response, 200, {
        data: await (
          url.pathname.endsWith('bulk-review')
            ? sendQuestionsToReviewInBulk
            : approveQuestionsInBulk
        )({
          institutionId,
          userId,
          role:
            identity.portalAdmin && !identity.developmentBypass
              ? 'admin'
              : 'teacher',
          input: await readJson(request),
        }),
      });
    }
    const historyMatch =
      request.method === 'GET' &&
      url.pathname.match(
        /^\/api\/questions\/([0-9a-f-]{36})\/status-history$/i,
      );
    if (historyMatch) {
      response.setHeader('cache-control', 'no-store');
      return json(response, 200, {
        data: await questionStatusHistory({
          institutionId,
          userId,
          questionId: historyMatch[1],
        }),
      });
    }
    const questionStatusMatch =
      request.method === 'PATCH' &&
      url.pathname.match(/^\/api\/questions\/([0-9a-f-]{36})\/status$/i);
    if (questionStatusMatch) {
      if (!requestOrigin || !allowedOrigins.has(requestOrigin))
        return json(response, 403, { error: 'Origem não autorizada.' });
      const question = await setQuestionStatus({
        institutionId,
        userId,
        role:
          identity.portalAdmin && !identity.developmentBypass
            ? 'admin'
            : 'teacher',
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
          error:
            'Somente coordenação e administração podem importar o catálogo.',
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
      if (request.method === 'DELETE')
        return json(response, 200, {
          data: await deletePedagogicalTopic({
            institutionId,
            topicId: pedagogicalTopicMatch[1],
            input: await readJson(request),
          }),
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
          error:
            error instanceof Error
              ? error.message
              : 'Falha ao compilar a prévia.',
        });
      } finally {
        activePreviewUsers.delete(userId);
        activePreviewCount -= 1;
      }
    }
    if (request.method === 'GET' && url.pathname === '/api/questions/drafts') {
      if (!canEditCatalog)
        return json(response, 403, {
          error: 'Rascunhos são exclusivos de editores e administradores.',
        });
      response.setHeader('cache-control', 'no-store');
      return json(response, 200, {
        data: await listDrafts({ institutionId, userId }),
      });
    }
    const draftMatch =
      /^\/api\/questions\/drafts\/([0-9a-f-]{36})(\/complete)?$/.exec(
        url.pathname,
      );
    if (draftMatch) {
      if (!canEditCatalog)
        return json(response, 403, {
          error: 'Rascunhos são exclusivos de editores e administradores.',
        });
      response.setHeader('cache-control', 'no-store');
      const args = { institutionId, userId, id: draftMatch[1] };
      if (request.method === 'GET' && !draftMatch[2])
        return json(response, 200, { data: await getDraft(args) });
      if (request.method === 'POST') {
        if (!requestOrigin || !allowedOrigins.has(requestOrigin))
          return json(response, 403, { error: 'Origem não autorizada.' });
        return json(response, 200, {
          data: draftMatch[2]
            ? await completeDraft(args)
            : await saveDraft({ ...args, input: await readJson(request) }),
        });
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
      if (request.method === 'GET')
        return json(response, 200, {
          data: await listWorkspaces({
            institutionId,
            userId,
            offset: Math.min(
              100000,
              Math.max(0, Number(url.searchParams.get('offset')) || 0),
            ),
          }),
        });
      if (request.method === 'POST')
        return json(response, 201, {
          data: await createWorkspace({
            institutionId,
            userId,
            input: await readJson(request),
          }),
        });
    }
    const workspaceMatch = url.pathname.match(
      /^\/api\/assessment-workspaces\/([0-9a-f-]{36})(\/pin)?$/i,
    );
    if (workspaceMatch) {
      const args = { institutionId, userId, id: workspaceMatch[1] };
      if (request.method === 'GET' && !workspaceMatch[2])
        return json(response, 200, { data: await getWorkspace(args) });
      if (request.method === 'PUT' && !workspaceMatch[2])
        return json(response, 200, {
          data: await saveWorkspace({
            ...args,
            input: await readJson(request),
          }),
        });
      if (request.method === 'PATCH' && workspaceMatch[2])
        return json(response, 200, {
          data: await pinWorkspace({ ...args, input: await readJson(request) }),
        });
      if (request.method === 'DELETE' && !workspaceMatch[2])
        return json(response, 200, { data: await deleteWorkspace(args) });
    }
    if (request.method === 'GET' && url.pathname === '/api/assessments')
      return json(response, 200, {
        data: await listAssessments({
          institutionId,
          ownerId: teacherScope(identity),
        }),
      });
    const regenerateMatch =
      request.method === 'POST' &&
      url.pathname.match(/^\/api\/assessments\/([0-9a-f-]{36})\/renders$/i);
    if (regenerateMatch)
      return json(response, 202, {
        data: await regenerateAssessment({
          institutionId,
          assessmentId: regenerateMatch[1],
        }),
      });
    const assessmentMatch = url.pathname.match(
      /^\/api\/assessments\/([0-9a-f-]{36})$/i,
    );
    if (assessmentMatch && request.method === 'DELETE') {
      const purge = url.searchParams.get('purge') === 'true';
      if (purge && !canPurgeAcademicRecords(identity))
        return json(response, 403, {
          error:
            'Somente o administrador pode excluir provas com respostas e notas.',
        });
      const { imageRefs = [], ...data } = await deleteAssessment({
        institutionId,
        userId,
        assessmentId: assessmentMatch[1],
        unlinkUnsentApplications:
          url.searchParams.get('unlinkUnsentApplications') === 'true',
        purge,
      });
      // Imagens no storage só saem depois do COMMIT; falha não desfaz a exclusão.
      for (const ref of imageRefs)
        await deleteScanImage(ref).catch((error) =>
          log('warn', 'assessment.purge.image', {
            requestId,
            ...errorFields(error),
          }),
        );
      return json(response, 200, { data });
    }
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
          developmentBypass: identity.developmentBypass,
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
    const manualReviewMatch =
      request.method === 'POST' &&
      url.pathname.match(
        /^\/api\/submissions\/([0-9a-f-]{36})\/manual-review$/i,
      );
    if (manualReviewMatch)
      return json(response, 200, {
        data: await saveManualReview({
          institutionId,
          userId,
          submissionId: manualReviewMatch[1],
          input: await readJson(request),
        }),
      });
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
    if (
      error.code === '23505' &&
      (error.constraint === 'users_cpf_hash_unique' ||
        error.constraint === 'users_email_key')
    )
      return json(response, 409, {
        error:
          'Já existe cadastro com os dados informados. Entre na conta existente ou procure suporte.',
      });
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
    log('error', 'request.failed', {
      requestId,
      method: request.method,
      path: logPath(request.url),
      ...errorFields(error),
    });
    return json(response, 500, { error: 'Erro interno.', requestId });
  }
});

server.listen(port, () =>
  console.log(`Caderno API em http://localhost:${port}`),
);

process.on('unhandledRejection', (error) =>
  log('error', 'process.unhandled_rejection', errorFields(error)),
);

for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    server.close();
    await pool.end();
    process.exit(0);
  });
