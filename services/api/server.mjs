import { createServer } from 'node:http';
import { ZodError } from 'zod';
import { pool } from './db.mjs';
import {
  createQuestion,
  createQuestionRevision,
  deleteQuestion,
  getQuestionFilterOptions,
  getQuestion,
  listQuestions,
  setQuestionStatus,
} from './questions.mjs';
import {
  createAssessment,
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
  createPedagogicalDiscipline,
  listPedagogicalDisciplines,
  listPedagogicalTopics,
  setPedagogicalDisciplineSkills,
} from './pedagogical-disciplines.mjs';
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
  retryApplicationRenders,
} from './academic.mjs';
import {
  confirmScanReview,
  createScan,
  getScanImage,
  getScanReview,
  listScans,
  retryScan,
} from './scans.mjs';
import { getApplicationReport } from './reports.mjs';
import {
  acceptInvitation,
  authenticate,
  createInvitation,
  getSubscription,
  login,
  logout,
  register,
  requestPasswordReset,
  resetPassword,
} from './auth.mjs';
import { createQuestionPdfPreview } from './question-preview.mjs';
import { listSaebDescriptors, listSaebMatrices } from './saeb.mjs';

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
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8_500_000) throw new Error('Payload muito grande');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function setSessionCookie(response, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader(
    'set-cookie',
    `caderno_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`,
  );
}

function clearSessionCookie(response) {
  response.setHeader(
    'set-cookie',
    'caderno_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
  );
}

const server = createServer(async (request, response) => {
  const requestOrigin = request.headers.origin;
  response.corsOrigin = allowedOrigins.has(requestOrigin) ? requestOrigin : '';
  if (request.method === 'OPTIONS') return json(response, 204, null);
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (request.method === 'GET' && url.pathname === '/health') {
      await pool.query('SELECT 1');
      return json(response, 200, { status: 'ok' });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/register') {
      const result = await register(await readJson(request));
      setSessionCookie(response, result.token);
      const { token, ...data } = result;
      return json(response, 201, { data });
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      const result = await login(await readJson(request));
      setSessionCookie(response, result.token);
      const { token, ...data } = result;
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
    const identity = await authenticate(request);
    if (!identity)
      return json(response, 401, { error: 'Faça login para continuar.' });
    const { institutionId, userId, role } = identity;
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
          },
          institution: {
            id: identity.institutionId,
            name: identity.institutionName,
          },
          role: identity.role,
        },
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
          input: await readJson(request),
        }),
      });
    if (request.method === 'GET' && url.pathname === '/api/students')
      return json(response, 200, {
        data: await listStudents({ institutionId }),
      });
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
    const questionStatusMatch =
      request.method === 'PATCH' &&
      url.pathname.match(/^\/api\/questions\/([0-9a-f-]{36})\/status$/i);
    if (questionStatusMatch) {
      const question = await setQuestionStatus({
        institutionId,
        userId,
        role,
        questionId: questionStatusMatch[1],
        input: await readJson(request),
      });
      if (!question)
        return json(response, 404, { error: 'Questão não encontrada.' });
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
        }),
      });
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
      } finally {
        activePreviewUsers.delete(userId);
        activePreviewCount -= 1;
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
    if (request.method === 'GET' && url.pathname === '/api/assessments')
      return json(response, 200, {
        data: await listAssessments({ institutionId }),
      });
    const assessmentMatch =
      request.method === 'GET' &&
      url.pathname.match(/^\/api\/assessments\/([0-9a-f-]{36})$/i);
    if (assessmentMatch) {
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
          userId,
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
    if (error instanceof ZodError)
      return json(response, 422, {
        error: error.issues.map((issue) => issue.message).join(' '),
        issues: error.issues,
      });
    if (error?.statusCode)
      return json(response, error.statusCode, { error: error.message });
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
