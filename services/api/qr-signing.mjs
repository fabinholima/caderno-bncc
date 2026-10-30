import crypto from 'node:crypto';

const developmentSecret = 'caderno-local-development';

// Em produção, a assinatura dos QR codes nunca pode usar o segredo público de
// desenvolvimento: sem QR_SIGNING_SECRET, a operação falha.
export function qrSigningSecret(environment = process.env) {
  if (environment.QR_SIGNING_SECRET) return environment.QR_SIGNING_SECRET;
  if (environment.NODE_ENV === 'production')
    throw new Error('QR_SIGNING_SECRET não configurado no ambiente de produção.');
  return developmentSecret;
}

export function signQrId(id, environment = process.env) {
  return crypto.createHmac('sha256', qrSigningSecret(environment)).update(id).digest('hex').slice(0, 20);
}
