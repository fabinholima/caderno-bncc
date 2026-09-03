import { createServer } from 'node:http';
import { ZodError } from 'zod';
import { pool } from './db.mjs';
import { createQuestion, listQuestions } from './questions.mjs';
import { createAssessment } from './assessments.mjs';
import { listCurriculum } from './curriculum.mjs';
import { getRenderFile } from './renders.mjs';

const port = Number(process.env.PORT || 8788);
const institutionId = process.env.DEMO_INSTITUTION_ID;
const userId = process.env.DEMO_USER_ID;
const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
const apiToken = process.env.API_TOKEN;

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': allowedOrigin, 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET,POST,OPTIONS' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 1_000_000) throw new Error('Payload muito grande'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return json(response, 204, null);
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (request.method === 'GET' && url.pathname === '/health') { await pool.query('SELECT 1'); return json(response, 200, { status: 'ok' }); }
    if (apiToken && request.headers.authorization !== `Bearer ${apiToken}`) return json(response, 401, { error: 'Acesso institucional não autorizado.' });
    if (!institutionId || !userId) return json(response, 503, { error: 'Identidade de desenvolvimento não configurada.' });
    if (request.method === 'GET' && url.pathname === '/api/questions') return json(response, 200, { data: await listQuestions({ institutionId, query: url.searchParams.get('q') || '', subject: url.searchParams.get('subject') || '' }) });
    if (request.method === 'GET' && url.pathname === '/api/curriculum') return json(response, 200, { data: await listCurriculum({ subject: url.searchParams.get('subject') || '' }) });
    const renderMatch = request.method === 'GET' && url.pathname.match(/^\/api\/render-jobs\/([0-9a-f-]{36})\/(prova|gabarito)$/i);
    if (renderMatch) {
      const file = await getRenderFile({ institutionId, jobId: renderMatch[1], kind: renderMatch[2] });
      if (file.error) return json(response, file.status, { error: file.error });
      response.writeHead(200, { 'content-type': 'application/pdf', 'content-length': file.size, 'content-disposition': `attachment; filename="${renderMatch[2]}.pdf"`, 'access-control-allow-origin': allowedOrigin });
      return file.stream.pipe(response);
    }
    if (request.method === 'POST' && url.pathname === '/api/questions') return json(response, 201, { data: await createQuestion({ institutionId, userId, input: await readJson(request) }) });
    if (request.method === 'POST' && url.pathname === '/api/assessments') return json(response, 201, { data: await createAssessment({ institutionId, userId, input: await readJson(request) }) });
    return json(response, 404, { error: 'Rota não encontrada.' });
  } catch (error) {
    if (error instanceof ZodError) return json(response, 422, { error: 'Dados inválidos.', issues: error.issues });
    console.error(error); return json(response, 500, { error: 'Erro interno.' });
  }
});

server.listen(port, () => console.log(`Caderno API em http://localhost:${port}`));

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { server.close(); await pool.end(); process.exit(0); });
