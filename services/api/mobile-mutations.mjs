import { createHash } from 'node:crypto';
export const payloadHash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function mobileMutation(client, { institutionId, userId, requestId, kind, entityId, input }, execute) {
  if (!requestId) return execute();
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${institutionId}:${userId}:${requestId}`]);
  const hash = payloadHash(input);
  const existing = await client.query('SELECT kind,entity_id,payload_hash,response FROM mobile_mutations WHERE institution_id=$1 AND user_id=$2 AND request_id=$3', [institutionId, userId, requestId]);
  if (existing.rowCount) {
    const row = existing.rows[0];
    if (row.kind !== kind || row.entity_id !== entityId || row.payload_hash !== hash) throw Object.assign(new Error('O identificador de sincronização já foi usado com outros dados.'), { statusCode: 409 });
    return row.response;
  }
  const response = await execute();
  await client.query('INSERT INTO mobile_mutations(institution_id,user_id,request_id,kind,entity_id,payload_hash,response) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)', [institutionId, userId, requestId, kind, entityId, hash, JSON.stringify(response)]);
  return response;
}

export function assertInstitutionScope(institutionId, expectedInstitutionId) {
  if (expectedInstitutionId && institutionId !== expectedInstitutionId) throw Object.assign(new Error('O contexto da conta mudou no servidor. Entre novamente antes de sincronizar.'), { statusCode: 401 });
}
