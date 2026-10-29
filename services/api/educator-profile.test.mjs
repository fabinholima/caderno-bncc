import test from 'node:test';
import assert from 'node:assert/strict';
import { educatorProfileSchema, educatorSchema } from './educator-profile.mjs';
const school = {
  name: 'Escola Exemplo',
  schoolType: 'estadual',
  address: 'Rua Exemplo, 123',
  city: 'Campo Grande',
  state: 'MS',
};
test('teacher requires subjects and grades; school needs address and municipality', () => {
  const data = {
    professionalRole: 'teacher',
    subjects: ['Química'],
    grades: ['1ª série'],
    school,
  };
  assert.equal(educatorSchema.parse(data).school.logoDataUrl, '');
  assert.throws(() => educatorSchema.parse({ ...data, subjects: [] }));
  assert.throws(() =>
    educatorSchema.parse({ ...data, school: { ...school, city: '' } }),
  );
  assert.throws(() =>
    educatorSchema.parse({ ...data, school: { ...school, state: 'ZZ' } }),
  );
});
test('coordinator requires stages, not an administrative role', () => {
  assert.equal(
    educatorSchema.parse({
      professionalRole: 'coordinator',
      stages: ['Ensino Médio'],
      school,
    }).professionalRole,
    'coordinator',
  );
  assert.throws(() =>
    educatorSchema.parse({ professionalRole: 'coordinator', school }),
  );
  assert.throws(() =>
    educatorSchema.parse({ professionalRole: 'admin', school }),
  );
});
test('perfil profissional pode ser salvo sem escola e as listas legadas continuam aceitas', () => {
  const profile = educatorProfileSchema.parse({
    professionalRole: 'teacher',
    phone: '(67) 99999-0000',
    subjects: ['Química', 'Componente antigo'],
    grades: ['1ª série'],
  });
  assert.deepEqual(profile.subjects, ['Química', 'Componente antigo']);
  assert.throws(() => educatorProfileSchema.parse({ professionalRole: 'teacher', subjects: [], grades: [] }));
  assert.equal(educatorProfileSchema.parse({ professionalRole: 'coordinator', stages: ['EJA'] }).professionalRole, 'coordinator');
});
test('school rejects external logo URLs and malformed optional identifiers', () => {
  const data = {
    professionalRole: 'teacher',
    subjects: ['Física'],
    grades: ['2ª série'],
    school,
  };
  for (const patch of [
    { logoDataUrl: 'https://example.com/logo.png' },
    { cnpj: '123' },
    { inep: 'abc' },
    { email: 'invalid' },
  ])
    assert.throws(() =>
      educatorSchema.parse({ ...data, school: { ...school, ...patch } }),
    );
});
