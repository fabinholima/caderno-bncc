#!/usr/bin/env node
// Cria a conta usada nos testes de tela (Playwright): cadastro pela própria
// API, confirmação do e-mail com o token de desenvolvimento e acesso de
// administrador do portal. Só roda contra bancos locais.
//
//   DATABASE_URL=... E2E_API_URL=http://localhost:8788 node services/api/e2e-seed.mjs
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const apiUrl = process.env.E2E_API_URL || 'http://localhost:8788';
const origin = process.env.E2E_ORIGIN || 'http://localhost:3000';
const e2eUser = {
  email: process.env.E2E_EMAIL || 'e2e@local.dev',
  password: process.env.E2E_PASSWORD || 'SenhaForte#2026',
};

if (!databaseUrl) throw new Error('Defina DATABASE_URL.');
const host = new URL(databaseUrl).hostname;
if (!['localhost', '127.0.0.1', 'postgres'].includes(host))
  throw new Error(`O seed dos testes só roda em banco local (recebido: ${host}).`);

// CPF válido gerado na hora: o cadastro exige CPF único.
function randomCpf() {
  const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  for (const length of [9, 10]) {
    const sum = digits.slice(0, length).reduce((total, digit, index) => total + digit * (length + 1 - index), 0);
    digits.push(((sum * 10) % 11) % 10);
  }
  return digits.join('');
}

async function post(path, body) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${response.status} ${payload.error || ''}`);
  return payload.data;
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  const existing = await client.query('SELECT id FROM users WHERE lower(email) = $1', [e2eUser.email]);
  if (!existing.rowCount) {
    const registration = await post('/api/auth/register', {
      cpf: randomCpf(),
      institutionName: 'Escola dos Testes',
      displayName: 'Prof E2E',
      email: e2eUser.email,
      password: e2eUser.password,
    });
    if (!registration?.developmentToken)
      throw new Error('A API não devolveu o token de verificação. Inicie-a com AUTH_DEV_RESET_TOKENS=true.');
    await post('/api/auth/verify-email', { token: registration.developmentToken });
  }
  await client.query('UPDATE users SET portal_admin = true WHERE lower(email) = $1', [e2eUser.email]);
  // Escola em "Minhas escolas": toda turma nova é criada vinculada a uma escola.
  await client.query(
    `INSERT INTO educator_schools(user_id,name,school_type,city,state)
     SELECT id,'Escola Estadual dos Testes','estadual','Campo Grande','MS' FROM users u
     WHERE lower(email)=$1 AND NOT EXISTS(SELECT 1 FROM educator_schools es WHERE es.user_id=u.id)`,
    [e2eUser.email],
  );
  console.log(`Conta de teste pronta: ${e2eUser.email}`);
} finally {
  await client.end();
}
