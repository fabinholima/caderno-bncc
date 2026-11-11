// Worker de redações: transcrição (OCR) e sugestão de correção pela IA.
//   node essay-worker.mjs
// Precisa de DATABASE_URL, GEMINI_API_KEY e do mesmo armazenamento da API.
import {
  claimEssayJob,
  processEssayJob,
  purgeExpiredEssayFiles,
} from './essay-jobs.mjs';

const interval = Number(process.env.ESSAY_POLL_MS || 3000);
const retentionDays = Number(process.env.ESSAY_FILE_RETENTION_DAYS || 0);
let lastPurge = 0;
let stopping = false;
process.on('SIGINT', () => (stopping = true));
process.on('SIGTERM', () => (stopping = true));

console.log('Worker de redações iniciado.');
while (!stopping) {
  if (retentionDays > 0 && Date.now() - lastPurge > 3_600_000) {
    lastPurge = Date.now();
    await purgeExpiredEssayFiles(retentionDays)
      .then(
        (count) =>
          count &&
          console.log(`Retenção: ${count} arquivo(s) de redação removidos.`),
      )
      .catch((error) => console.error('Retenção de redações:', error.message));
  }
  const job = await claimEssayJob().catch((error) => {
    console.error('Fila de redações indisponível:', error.message);
    return null;
  });
  if (!job) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    continue;
  }
  await processEssayJob(job).catch((error) =>
    console.error(`Redação (job ${job.id}, ${job.kind}):`, error.message),
  );
}
await import('./db.mjs').then(({ pool }) => pool.end());
