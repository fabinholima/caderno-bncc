import { createServer } from 'node:http';
import { ZodError } from 'zod';
import { pool } from './db.mjs';
import { createQuestion, listQuestions } from './questions.mjs';

const port = Number(process.env.PORT || 8788);
const institutionId = process.env.DEMO_INSTITUTION_ID;
const userId = process.env.DEMO_USER_ID;
const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': allowedOrigin, 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' });
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
    if (!institutionId || !userId) return json(response, 503, { error: 'Identidade de desenvolvimento não configurada.' });
    if (request.method === 'GET' && url.pathname === '/api/questions') return json(response, 200, { data: await listQuestions({ institutionId, query: url.searchParams.get('q') || '', subject: url.searchParams.get('subject') || '' }) });
    if (request.method === 'POST' && url.pathname === '/api/questions') return json(response, 201, { data: await createQuestion({ institutionId, userId, input: await readJson(request) }) });
    return json(response, 404, { error: 'Rota não encontrada.' });
  } catch (error) {
    if (error instanceof ZodError) return json(response, 422, { error: 'Dados inválidos.', issues: error.issues });
    console.error(error); return json(response, 500, { error: 'Erro interno.' });
  }
});

server.listen(port, () => console.log(`Caderno API em http://localhost:${port}`));

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { server.close(); await pool.end(); process.exit(0); });
