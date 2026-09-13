import assert from 'node:assert/strict';
import test from 'node:test';
import { validateProductionEnvironment } from './check-production-env.mjs';

const validEnvironment = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:secret@db.example.com:5432/caderno',
  CORS_ORIGIN: 'https://app.example.com,https://admin.example.com',
  EXAM_STORAGE_DIR: '/srv/caderno/exams',
  RENDER_OUTPUT_DIR: '/srv/caderno/renders',
  QR_SIGNING_SECRET: '0123456789abcdef0123456789abcdef',
  DEV_AUTH_BYPASS: 'false',
};

test('accepts a safe production environment', () => {
  assert.deepEqual(validateProductionEnvironment(validEnvironment), []);
});

test('rejects development authentication, unsafe origins and weak secrets', () => {
  const errors = validateProductionEnvironment({
    ...validEnvironment,
    NODE_ENV: 'development',
    DEV_AUTH_BYPASS: 'true',
    CORS_ORIGIN: '*',
    QR_SIGNING_SECRET: 'short',
    EXAM_STORAGE_DIR: './outputs/exams',
  });

  assert.ok(errors.some((error) => error.includes('NODE_ENV')));
  assert.ok(errors.some((error) => error.includes('DEV_AUTH_BYPASS')));
  assert.ok(errors.some((error) => error.includes('CORS_ORIGIN')));
  assert.ok(errors.some((error) => error.includes('QR_SIGNING_SECRET')));
  assert.ok(errors.some((error) => error.includes('EXAM_STORAGE_DIR')));
});
