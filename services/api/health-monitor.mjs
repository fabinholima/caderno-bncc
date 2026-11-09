// Monitor de saúde: consulta a API (e o portal) a cada minuto e manda alerta
// por e-mail depois de falhas seguidas; manda outro quando volta ao normal.
// Roda como serviço próprio no compose, para alertar mesmo com a API fora do ar:
//   HEALTH_TARGETS="api=http://api:8788/health,portal=http://frontend:3000/portal"
import { pathToFileURL } from 'node:url';
import { errorFields, log, sendAlert } from './observability.mjs';

export function parseTargets(value = '') {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [name, ...rest] = item.split('=');
      const url = rest.join('=');
      return url ? { name: name.trim(), url } : { name: item, url: item };
    });
}

async function probe(url, fetcher) {
  try {
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok
      ? { ok: true }
      : { ok: false, reason: `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, reason: errorFields(error).message || 'sem resposta' };
  }
}

/** Uma rodada: atualiza o estado de cada alvo e devolve os alertas a enviar. */
export async function checkTargets(
  targets,
  state,
  { failuresBeforeAlert = 3, fetcher = fetch } = {},
) {
  const alerts = [];
  for (const target of targets) {
    const current = state.get(target.name) ?? { failures: 0, alerted: false };
    const result = await probe(target.url, fetcher);
    if (result.ok) {
      if (current.alerted)
        alerts.push({
          subject: `${target.name} voltou a responder`,
          text: `${target.name} (${target.url}) voltou a responder normalmente.`,
        });
      state.set(target.name, { failures: 0, alerted: false });
      continue;
    }
    const failures = current.failures + 1;
    log('warn', 'health.failed', {
      target: target.name,
      failures,
      reason: result.reason,
    });
    const alerted = current.alerted || failures >= failuresBeforeAlert;
    if (alerted && !current.alerted)
      alerts.push({
        subject: `${target.name} fora do ar`,
        text: `${target.name} (${target.url}) falhou ${failures} checagens seguidas.\nÚltimo erro: ${result.reason}\n\nVerifique com: docker compose ps && docker compose logs --tail=200 ${target.name}`,
      });
    state.set(target.name, { failures, alerted });
  }
  return alerts;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const targets = parseTargets(
    process.env.HEALTH_TARGETS || 'api=http://127.0.0.1:8788/health',
  );
  const intervalMs = Number(process.env.HEALTH_INTERVAL_MS) || 60_000;
  const state = new Map();
  log('info', 'health.monitor_started', {
    targets: targets.map((target) => target.name),
    intervalMs,
  });
  const round = async () => {
    for (const alert of await checkTargets(targets, state))
      await sendAlert(alert.subject, alert.text);
  };
  await round();
  setInterval(() => void round(), intervalMs);
}
