import { pool } from './db.mjs';

const publicCode = process.argv[2];
if (!publicCode) throw new Error('Informe o código público da questão.');

const result = await pool.query(
  `UPDATE questions
   SET status = 'archived', updated_at = now()
   WHERE public_code = $1 AND status <> 'archived'
   RETURNING id, public_code`,
  [publicCode],
);

console.log(JSON.stringify({ archived: result.rows }));
await pool.end();
