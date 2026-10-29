import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageInstitutionTeam } from './institution-permissions.mjs';

test('somente administrador institucional ou geral gerencia a equipe', () => {
  assert.equal(canManageInstitutionTeam({ role: 'admin' }), true);
  assert.equal(canManageInstitutionTeam({ role: 'teacher', portalAdmin: true }), true);
  assert.equal(canManageInstitutionTeam({ role: 'coordinator' }), false);
  assert.equal(canManageInstitutionTeam({ role: 'teacher' }), false);
  assert.equal(canManageInstitutionTeam({ role: 'student', portalAdmin: false }), false);
});
