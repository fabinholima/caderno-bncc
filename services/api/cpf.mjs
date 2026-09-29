import { createHmac } from 'node:crypto';

export function normalizeCpf(value) {
  if (typeof value !== 'string' || !/^[\d.\-\s]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return null;
  for (let position = 9; position < 11; position++) {
    let sum = 0;
    for (let i = 0; i < position; i++) sum += Number(digits[i]) * (position + 1 - i);
    const remainder = (sum * 10) % 11;
    if ((remainder === 10 ? 0 : remainder) !== Number(digits[position])) return null;
  }
  return digits;
}

export function cpfFingerprint(value, secret = process.env.CPF_HASH_SECRET) {
  const cpf = normalizeCpf(value);
  if (!cpf) throw Object.assign(new Error('Informe um CPF válido.'), { statusCode: 422 });
  if (!secret || secret.length < 32) throw Object.assign(new Error('Cadastro temporariamente indisponível. Chave de proteção do CPF não configurada.'), { statusCode: 503 });
  return createHmac('sha256', secret).update(`cpf:v1:${cpf}`).digest('hex');
}
