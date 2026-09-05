import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFundamentalCatalog,
  buildHighSchoolNatureCatalog,
  buildHighSchoolCatalog,
  validateOfficialHighSchoolCatalog,
} from './bncc-import.mjs';

test('preserva múltiplos objetos e converte anos da habilidade BNCC', () => {
  const catalog = buildFundamentalCatalog(
    {
      componentes_curriculares: [
        {
          id: 'ef-comp-ma',
          etapa: 'EF',
          nome: 'Matemática',
          tem_aprendizagens_proprias: true,
        },
      ],
    },
    {
      contextos_organizacao: [
        {
          id: 'obj-a',
          tipo: 'oc',
          nome: 'Objeto A',
          componente: 'ef-comp-ma',
          fonte: {},
        },
        {
          id: 'obj-b',
          tipo: 'oc',
          nome: 'Objeto B',
          componente: 'ef-comp-ma',
          fonte: {},
        },
      ],
      habilidades: [
        {
          codigo: 'EF67MA01',
          texto: 'Descrição oficial da habilidade.',
          componente: 'ef-comp-ma',
          anos: [6, 7],
          objetos_conhecimento: ['obj-a', 'obj-b'],
          vigencia: { status: 'vigente', desde: 'dados-2026.07' },
          fonte: {},
        },
      ],
    },
  );
  assert.equal(catalog.subjects[0].name, 'Matemática');
  assert.equal(catalog.skills[0].gradeRange, '6º ao 7º ano');
  assert.deepEqual(catalog.skills[0].objectKeys, ['obj-a', 'obj-b']);
  assert.equal(catalog.objects.length, 2);
});

test('importa todas as áreas oficiais do Ensino Médio', () => {
  const structure = {
    areas_conhecimento: [
      { id: 'em-area-cnt', nome: 'Ciências da Natureza' },
      { id: 'em-area-mat', nome: 'Matemática' },
    ],
    competencias_especificas: [
      { id: 'cnt-1', area: 'em-area-cnt', numero: 1, texto: 'CNT', fonte: {} },
      { id: 'mat-1', area: 'em-area-mat', numero: 1, texto: 'MAT', fonte: {} },
    ],
  };
  const highSchool = { habilidades: [
    { codigo: 'EM13CNT101', area: 'em-area-cnt', texto: 'CNT 101', competencias_especificas: ['cnt-1'], fonte: {} },
    { codigo: 'EM13MAT101', area: 'em-area-mat', texto: 'MAT 101', competencias_especificas: ['mat-1'], fonte: {} },
  ] };
  const catalogs = buildHighSchoolCatalog(structure, highSchool);
  assert.equal(catalogs.length, 2);
  assert.equal(catalogs.flatMap((item) => item.skills).length, 2);
});

test('rejeita catálogo do Ensino Médio incompleto', () => {
  assert.throws(() => validateOfficialHighSchoolCatalog([]), /4 áreas/);
});

test('preserva a organização oficial do Ensino Médio por área e competência', () => {
  const catalog = buildHighSchoolNatureCatalog(
    {
      areas_conhecimento: [
        { id: 'em-area-cnt', nome: 'Ciências da Natureza e suas Tecnologias' },
      ],
      competencias_especificas: [
        {
          id: 'em-area-cnt-ce-01',
          area: 'em-area-cnt',
          numero: 1,
          texto: 'Competência oficial.',
          fonte: {},
        },
      ],
    },
    {
      habilidades: [
        {
          codigo: 'EM13CNT101',
          area: 'em-area-cnt',
          texto: 'Habilidade oficial.',
          competencias_especificas: ['em-area-cnt-ce-01'],
          vigencia: { status: 'vigente', desde: 'dados-2026.07' },
          fonte: {},
        },
      ],
    },
  );
  assert.equal(catalog.area.stage, 'Ensino Médio');
  assert.equal(catalog.competencies.length, 1);
  assert.deepEqual(catalog.skills[0].competencyKeys, ['em-area-cnt-ce-01']);
});
