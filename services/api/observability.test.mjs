import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alertRecipients,
  createErrorAlerter,
  log,
  logPath,
  requestIdFrom,
  sendAlert,
} from './observability.mjs';
import { checkDisks, checkTargets, parseTargets } from './health-monitor.mjs';

test('ID da requisição: aceita o do proxy só quando bem formado', () => {
  assert.equal(
    requestIdFrom({ headers: { 'x-request-id': 'abc12345-xyz' } }),
    'abc12345-xyz',
  );
  assert.match(
    requestIdFrom({ headers: { 'x-request-id': 'bad id\nInjected' } }),
    /^[0-9a-f-]{36}$/,
  );
  assert.match(requestIdFrom({ headers: {} }), /^[0-9a-f-]{36}$/);
});

test('log em JSON, sem query string e com IDs agrupados', () => {
  let line = '';
  log('info', 'request', { status: 200 }, { write: (value) => (line = value) });
  const entry = JSON.parse(line);
  assert.deepEqual(
    [entry.level, entry.msg, entry.status],
    ['info', 'request', 200],
  );
  assert.equal(
    logPath(
      '/api/classes/0f8fad5b-d9cb-469f-a165-70867728950e/roster?token=segredo',
    ),
    '/api/classes/:id/roster',
  );
});

test('alerta de 5xx: dispara no limite e respeita o intervalo de silêncio', () => {
  let time = 0;
  const sent = [];
  const record = createErrorAlerter({
    threshold: 3,
    windowMs: 1000,
    cooldownMs: 5000,
    now: () => time,
    send: (subject, text) => sent.push({ subject, text }),
  });
  const error = { status: 500, method: 'GET', path: '/api/x', requestId: 'r1' };
  assert.equal(record({ ...error, status: 404 }), false);
  assert.equal(record(error), false);
  time = 2000; // o primeiro saiu da janela
  assert.equal(record(error), false);
  assert.equal(record(error), false);
  assert.equal(record(error), true);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /GET \/api\/x \(r1\)/);
  for (let i = 0; i < 5; i++) record(error);
  assert.equal(sent.length, 1);
  time = 8000;
  for (let i = 0; i < 3; i++) record(error);
  assert.equal(sent.length, 2);
});

test('alerta por e-mail só com destinatários e Resend configurados', async () => {
  assert.deepEqual(
    alertRecipients({
      ALERT_EMAIL_TO: 'ops@example.com, inválido ,b@example.com',
    }),
    ['ops@example.com', 'b@example.com'],
  );
  const env = {
    ALERT_EMAIL_TO: 'ops@example.com',
    RESEND_API_KEY: 'private-test-key',
    AUTH_EMAIL_FROM: 'UfaProva <no-reply@example.com>',
  };
  const original = process.stdout.write;
  process.stdout.write = () => true;
  try {
    assert.equal(
      await sendAlert('x', 'y', {
        env: { ...env, ALERT_EMAIL_TO: '' },
        fetcher: () => assert.fail('não deve enviar'),
      }),
      false,
    );
    let body;
    assert.equal(
      await sendAlert('API fora do ar', 'detalhes', {
        env,
        fetcher: async (_url, options) => {
          body = JSON.parse(options.body);
          return { ok: true };
        },
      }),
      true,
    );
    assert.deepEqual(
      [body.to, body.subject],
      [['ops@example.com'], '[UfaProva] API fora do ar'],
    );
  } finally {
    process.stdout.write = original;
  }
});

test('monitor: alerta após falhas seguidas e avisa a recuperação', async () => {
  const targets = parseTargets(
    'api=http://api:8788/health?x=1, portal=http://frontend:3000/portal',
  );
  assert.deepEqual(
    targets.map((target) => target.url),
    ['http://api:8788/health?x=1', 'http://frontend:3000/portal'],
  );
  const state = new Map();
  let apiUp = false;
  const fetcher = async (url) => {
    if (url.includes('frontend') || apiUp) return { ok: true, status: 200 };
    throw new Error('connect ECONNREFUSED');
  };
  const original = process.stdout.write;
  process.stdout.write = () => true;
  try {
    assert.deepEqual(await checkTargets(targets, state, { fetcher }), []);
    assert.deepEqual(await checkTargets(targets, state, { fetcher }), []);
    const down = await checkTargets(targets, state, { fetcher });
    assert.deepEqual(
      down.map((alert) => alert.subject),
      ['api fora do ar'],
    );
    assert.deepEqual(await checkTargets(targets, state, { fetcher }), []);
    apiUp = true;
    const up = await checkTargets(targets, state, { fetcher });
    assert.deepEqual(
      up.map((alert) => alert.subject),
      ['api voltou a responder'],
    );
  } finally {
    process.stdout.write = original;
  }
});

test('monitor: alerta de disco acima do limite e aviso quando libera espaço', async () => {
  let usedPercent = 70;
  // 100 blocos de 1 GiB; bavail = parte livre.
  const reader = async () => ({
    blocks: 100,
    bsize: 1024 ** 3,
    bavail: 100 - usedPercent,
  });
  const state = new Map();
  const original = process.stdout.write;
  process.stdout.write = () => true;
  try {
    const check = () => checkDisks(['/var/data'], state, { reader });
    assert.deepEqual(await check(), []);
    usedPercent = 83;
    const full = await check();
    assert.deepEqual(
      full.map((alert) => alert.subject),
      ['Disco do servidor em 83%'],
    );
    assert.match(full[0].text, /17\.0 GB livres/);
    usedPercent = 78;
    assert.deepEqual(await check(), [], 'sem repetir perto do limite');
    usedPercent = 70;
    assert.deepEqual(
      (await check()).map((alert) => alert.subject),
      ['Disco do servidor voltou a 70%'],
    );
    const unreadable = await checkDisks(['/nao-existe'], new Map(), {
      reader: async () => {
        throw new Error('ENOENT');
      },
    });
    assert.deepEqual(unreadable, []);
  } finally {
    process.stdout.write = original;
  }
});
