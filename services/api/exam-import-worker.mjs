import {
  claimExamImportJob,
  processExamImportJob,
} from './exam-import-jobs.mjs';

const interval = Number(process.env.IMPORT_POLL_MS || 2000);
let stopping = false;
process.on('SIGINT', () => (stopping = true));
process.on('SIGTERM', () => (stopping = true));

console.log('Worker de importação iniciado.');
while (!stopping) {
  const job = await claimExamImportJob();
  if (!job) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    continue;
  }
  await processExamImportJob(job).catch((error) =>
    console.error(`Importação ${job.exam_import_id}:`, error.message),
  );
}
await import('./db.mjs').then(({ pool }) => pool.end());
