import crypto from 'node:crypto';

const developmentSecret = 'caderno-local-development';

// O OMR identifica o cartão pelo qr_payload gravado no banco, não recalcula a
// assinatura: trocar o segredo não invalida cartões já impressos. O segredo
// padrão é público e só vale fora de produção.
export function qrSigningSecret(environment = process.env) {
  if (environment.NODE_ENV === 'production' && !environment.QR_SIGNING_SECRET)
    throw new Error('QR_SIGNING_SECRET não configurado.');
  return environment.QR_SIGNING_SECRET || developmentSecret;
}

// Segredos sem os quais a API não inicia em produção.
export function missingProductionSecrets(environment = process.env) {
  if (environment.NODE_ENV !== 'production') return [];
  return ['QR_SIGNING_SECRET', 'CPF_HASH_SECRET'].filter(
    (name) => String(environment[name] ?? '').length < 32,
  );
}

export function signQrId(id, environment = process.env) {
  return crypto
    .createHmac('sha256', qrSigningSecret(environment))
    .update(id)
    .digest('hex')
    .slice(0, 20);
}
