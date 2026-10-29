import test from 'node:test';
import assert from 'node:assert/strict';
import { dependencyType, formatPhone, formatPostalCode, isActiveSchool, isValidCnpj, mapInepSchoolRow, normalizeSchoolName } from './inep-school-data.mjs';

test('normaliza nomes ignorando acentos, caixa e espaços extras', () => {
  assert.equal(normalizeSchoolName('  Escola São João  '), 'escola sao joao');
});

test('mapeia campos presentes sem inventar campos ausentes', () => {
  const school = mapInepSchoolRow({
    NO_ENTIDADE: 'Escola Exemplo', CO_ENTIDADE: '12345678', TP_DEPENDENCIA: '2',
    TP_SITUACAO_FUNCIONAMENTO: '1', NO_MUNICIPIO: 'Campo Grande', SG_UF: 'MS',
  }, 2025);
  assert.equal(school.name, 'Escola Exemplo');
  assert.equal(school.schoolType, 'estadual');
  assert.equal(school.city, 'Campo Grande');
  assert.equal(school.address, '');
  assert.equal(school.postalCode, '');
  assert.equal(school.phone, '');
  assert.equal(school.email, '');
});

test('lê o nome real do CNPJ de escola publicado no Censo 2025', () => {
  const school = mapInepSchoolRow({
    NO_ENTIDADE: 'Escola Exemplo', CO_ENTIDADE: '12345678', TP_DEPENDENCIA: '4',
    TP_SITUACAO_FUNCIONAMENTO: '1', NO_MUNICIPIO: 'Campo Grande', SG_UF: 'MS',
    NU_CNPJ_ESCOLA_PRIVADA: '11222333000181',
  }, 2025);
  assert.equal(school.cnpj, '11222333000181');
});

test('converte dependência, CEP e telefone quando as colunas existem', () => {
  assert.equal(dependencyType('1'), 'federal');
  assert.equal(dependencyType('4'), 'privada');
  assert.equal(formatPostalCode('79002000'), '79002-000');
  assert.equal(formatPhone('67', '999991234'), '(67) 99999-1234');
});

test('filtra escolas fora de funcionamento e valida CNPJ', () => {
  assert.equal(isActiveSchool({ TP_SITUACAO_FUNCIONAMENTO: '1' }), true);
  assert.equal(isActiveSchool({ TP_SITUACAO_FUNCIONAMENTO: '2' }), false);
  assert.equal(isValidCnpj(''), true);
  assert.equal(isValidCnpj('11222333000181'), true);
  assert.equal(isValidCnpj('11222333000182'), false);
});
