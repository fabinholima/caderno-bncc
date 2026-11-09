import crypto from 'node:crypto';

const developmentSecret = 'caderno-local-development';

// Sem QR_SIGNING_SECRET, os QR codes continuam assinados com o segredo
// anterior. Assim, os cartões já impressos seguem válidos. Em produção, isso
// gera um aviso: o segredo deve ser configurado no Render.
export function qrSigningSecret(environment = process.env) {
  return environment.QR_SIGNING_SECRET || developmentSecret;
}

export function qrSigningWarning(environment = process.env) {
  if (environment.NODE_ENV === 'production' && !environment.QR_SIGNING_SECRET)
    return 'AVISO: QR_SIGNING_SECRET não configurado. Os QR codes usam o segredo padrão; configure-o no Render.';
  return '';
}

export function signQrId(id, environment = process.env) {
  return crypto
    .createHmac('sha256', qrSigningSecret(environment))
    .update(id)
    .digest('hex')
    .slice(0, 20);
}
