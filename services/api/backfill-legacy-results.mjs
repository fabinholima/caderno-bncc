// Converte em publicação legada os cartões concluídos pelo worker anterior à
// migração 103 (por exemplo, durante a troca de versão). Idempotente: cartões
// que já têm resultado são ignorados. Uso: DATABASE_URL=... node backfill-legacy-results.mjs
import { pool } from './db.mjs';

try {
  const result = await pool.query('SELECT publish_legacy_scan_results() converted');
  console.log(`Resultados legados convertidos: ${result.rows[0].converted}`);
} finally {
  await pool.end();
}
