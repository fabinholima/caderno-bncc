// Monitor de saúde: consulta a API (e o portal) a cada minuto e manda alerta
// por e-mail depois de falhas seguidas; manda outro quando volta ao normal.
// Roda como serviço próprio no compose, para alertar mesmo com a API fora do ar:
//   HEALTH_TARGETS="api=http://api:8788/health,portal=http://frontend:3000/portal"
// Também confere o espaço em disco (DISK_PATHS, alerta a partir de
// DISK_ALERT_PERCENT, padrão 80%). Um volume Docker montado mostra o disco do host.
import { statfs } from 'node:fs/promises';
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

/** Percentual usado do sistema de arquivos, como o df (blocos reservados contam como usados). */
export async function diskUsage(path, reader = statfs) {
  const stats = await reader(path);
  const total = stats.blocks * stats.bsize;
  const available = stats.bavail * stats.bsize;
  return {
    percent: total ? Math.round(((total - available) / total) * 100) : 0,
    availableGb: available / 1024 ** 3,
  };
}

/** Alerta ao passar do limite e avisa de novo só depois de cair 5 pontos abaixo dele. */
export async function checkDisks(
  paths,
  state,
  { thresholdPercent = 80, reader = statfs } = {},
) {
  const alerts = [];
  for (const path of paths) {
    const key = `disk:${path}`;
    const alerted = state.get(key)?.alerted ?? false;
    let usage;
    try {
      usage = await diskUsage(path, reader);
    } catch (error) {
      log('warn', 'health.disk_unreadable', {
        path,
        reason: errorFields(error).message,
      });
      continue;
    }
    const free = `${usage.availableGb.toFixed(1)} GB livres`;
    if (!alerted && usage.percent >= thresholdPercent) {
      log('warn', 'health.disk_full', { path, percent: usage.percent });
      alerts.push({
        subject: `Disco do servidor em ${usage.percent}%`,
        text: `O disco que guarda ${path} está ${usage.percent}% ocupado (${free}).\n\nVerifique com: df -h && docker system df && du -sh deploy/vps/backups`,
      });
      state.set(key, { alerted: true });
    } else if (alerted && usage.percent < thresholdPercent - 5) {
      alerts.push({
        subject: `Disco do servidor voltou a ${usage.percent}%`,
        text: `O disco que guarda ${path} está ${usage.percent}% ocupado (${free}).`,
      });
      state.set(key, { alerted: false });
    }
  }
  return alerts;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const targets = parseTargets(
    process.env.HEALTH_TARGETS || 'api=http://127.0.0.1:8788/health',
  );
  const disks = String(process.env.DISK_PATHS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const thresholdPercent = Number(process.env.DISK_ALERT_PERCENT) || 80;
  const intervalMs = Number(process.env.HEALTH_INTERVAL_MS) || 60_000;
  const state = new Map();
  log('info', 'health.monitor_started', {
    targets: targets.map((target) => target.name),
    disks,
    intervalMs,
  });
  const round = async () => {
    const alerts = [
      ...(await checkTargets(targets, state)),
      ...(await checkDisks(disks, state, { thresholdPercent })),
    ];
    for (const alert of alerts) await sendAlert(alert.subject, alert.text);
  };
  await round();
  setInterval(() => void round(), intervalMs);
}
