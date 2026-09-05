import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, transaction } from './db.mjs';

export const BNCC_DATASET_COMMIT = 'daabd7dd63ae0cac0aa520b6189e79f95c24f583';
export const OFFICIAL_HIGH_SCHOOL_COUNTS = Object.freeze({
  'em-area-lgg': { competencies: 7, skills: 82 },
  'em-area-mat': { competencies: 5, skills: 43 },
  'em-area-cnt': { competencies: 3, skills: 26 },
  'em-area-chs': { competencies: 6, skills: 32 },
});

function gradeRange(years) {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  if (sorted.length === 1) return `${sorted[0]}º ano`;
  const consecutive = sorted.every(
    (year, index) => index === 0 || year === sorted[index - 1] + 1,
  );
  if (consecutive) return `${sorted[0]}º ao ${sorted.at(-1)}º ano`;
  return `${sorted.map((year) => `${year}º`).join(', ')} anos`;
}

export function buildFundamentalCatalog(structure, fundamental) {
  const components = new Map(
    structure.componentes_curriculares
      .filter((item) => item.etapa === 'EF' && item.tem_aprendizagens_proprias)
      .map((item) => [item.id, item]),
  );
  const contexts = new Map(
    fundamental.contextos_organizacao
      .filter((item) => item.tipo === 'oc')
      .map((item) => [item.id, item]),
  );
  const yearsByObject = new Map();
  for (const skill of fundamental.habilidades) {
    for (const objectId of skill.objetos_conhecimento) {
      const years = yearsByObject.get(objectId) || new Set();
      skill.anos.forEach((year) => years.add(year));
      yearsByObject.set(objectId, years);
    }
  }

  const subjects = [...components.values()].map((item) => ({
    sourceKey: item.id,
    name: item.nome,
    stage: 'Ensino Fundamental',
  }));
  const objects = [...yearsByObject].map(([sourceKey, years]) => {
    const item = contexts.get(sourceKey);
    if (!item) throw new Error(`Objeto BNCC ausente: ${sourceKey}`);
    return {
      sourceKey,
      subjectKey: item.componente,
      name: item.nome,
      gradeRange: gradeRange([...years]),
      sourceMetadata: item.fonte,
    };
  });
  const skills = fundamental.habilidades.map((item) => {
    const component = components.get(item.componente);
    if (!component)
      throw new Error(`Componente BNCC ausente: ${item.componente}`);
    return {
      code: item.codigo,
      subjectKey: item.componente,
      subject: component.nome,
      stage: 'Ensino Fundamental',
      gradeRange: gradeRange(item.anos),
      description: item.texto,
      objectKeys: item.objetos_conhecimento,
      datasetVersion: item.vigencia?.desde || null,
      validityStatus: item.vigencia?.status || null,
      sourceMetadata: item.fonte,
    };
  });
  return { subjects, objects, skills };
}

export async function importFundamentalCatalog(dataDirectory) {
  const baseDirectory = resolve(
    process.env.INIT_CWD || process.cwd(),
    dataDirectory,
  );
  const [structure, fundamental] = await Promise.all([
    readFile(resolve(baseDirectory, 'estrutura.json'), 'utf8').then(JSON.parse),
    readFile(resolve(baseDirectory, 'ensino-fundamental.json'), 'utf8').then(
      JSON.parse,
    ),
  ]);
  const catalog = buildFundamentalCatalog(structure, fundamental);
  await transaction(async (client) => {
    const subjectIds = new Map();
    for (const item of catalog.subjects) {
      const result = await client.query(
        `INSERT INTO curriculum_subjects (curriculum_version, source_key, name, stage)
         VALUES ('BNCC-2018', $1, $2, $3)
         ON CONFLICT (curriculum_version, name, stage)
         DO UPDATE SET source_key = EXCLUDED.source_key
         RETURNING id`,
        [item.sourceKey, item.name, item.stage],
      );
      subjectIds.set(item.sourceKey, result.rows[0].id);
    }

    const objectIds = new Map();
    for (const item of catalog.objects) {
      const result = await client.query(
        `INSERT INTO knowledge_objects
           (subject_id, source_key, name, grade_range, source_metadata)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (subject_id, name, grade_range)
         DO UPDATE SET source_key = EXCLUDED.source_key,
           source_metadata = EXCLUDED.source_metadata
         RETURNING id`,
        [
          subjectIds.get(item.subjectKey),
          item.sourceKey,
          item.name,
          item.gradeRange,
          JSON.stringify(item.sourceMetadata),
        ],
      );
      objectIds.set(item.sourceKey, result.rows[0].id);
    }

    for (const item of catalog.skills) {
      const linkedObjects = item.objectKeys.map((key) => objectIds.get(key));
      const result = await client.query(
        `INSERT INTO curriculum_skills
           (curriculum_version, code, stage, subject, grade_range, description,
            knowledge_object_id, dataset_version, validity_status, source_metadata)
         VALUES ('BNCC-2018', $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         ON CONFLICT (curriculum_version, code) DO UPDATE SET
           stage = EXCLUDED.stage, subject = EXCLUDED.subject,
           grade_range = EXCLUDED.grade_range, description = EXCLUDED.description,
           knowledge_object_id = EXCLUDED.knowledge_object_id,
           dataset_version = EXCLUDED.dataset_version,
           validity_status = EXCLUDED.validity_status,
           source_metadata = EXCLUDED.source_metadata
         RETURNING id`,
        [
          item.code,
          item.stage,
          item.subject,
          item.gradeRange,
          item.description,
          linkedObjects[0],
          item.datasetVersion,
          item.validityStatus,
          JSON.stringify(item.sourceMetadata),
        ],
      );
      const skillId = result.rows[0].id;
      await client.query(
        'DELETE FROM skill_knowledge_objects WHERE skill_id = $1',
        [skillId],
      );
      for (const [index, objectId] of linkedObjects.entries()) {
        await client.query(
          `INSERT INTO skill_knowledge_objects (skill_id, knowledge_object_id, position)
           VALUES ($1, $2, $3)`,
          [skillId, objectId, index + 1],
        );
      }
    }
  });
  return {
    datasetCommit: BNCC_DATASET_COMMIT,
    subjects: catalog.subjects.length,
    knowledgeObjects: catalog.objects.length,
    skills: catalog.skills.length,
  };
}

export function buildHighSchoolAreaCatalog(structure, highSchool, areaKey) {
  const area = structure.areas_conhecimento.find(
    (item) => item.id === areaKey,
  );
  if (!area || !area.id.startsWith('em-area-'))
    throw new Error(`Área oficial do Ensino Médio ausente: ${areaKey}.`);
  return {
    area: { sourceKey: area.id, name: area.nome, stage: 'Ensino Médio' },
    competencies: structure.competencias_especificas
      .filter((item) => item.area === area.id)
      .map((item) => ({
        sourceKey: item.id,
        number: item.numero,
        description: item.texto,
        sourceMetadata: item.fonte,
      })),
    skills: highSchool.habilidades
      .filter((item) => item.area === area.id)
      .map((item) => ({
        code: item.codigo,
        description: item.texto,
        competencyKeys: item.competencias_especificas,
        datasetVersion: item.vigencia?.desde || null,
        validityStatus: item.vigencia?.status || null,
        sourceMetadata: item.fonte,
      })),
  };
}

export function buildHighSchoolNatureCatalog(structure, highSchool) {
  return buildHighSchoolAreaCatalog(structure, highSchool, 'em-area-cnt');
}

export function buildHighSchoolCatalog(structure, highSchool) {
  return structure.areas_conhecimento
    .filter((item) => item.id.startsWith('em-area-'))
    .map((item) => buildHighSchoolAreaCatalog(structure, highSchool, item.id));
}

export function validateOfficialHighSchoolCatalog(catalogs) {
  if (catalogs.length !== 4)
    throw new Error(`A BNCC do Ensino Médio deve possuir 4 áreas; recebidas: ${catalogs.length}.`);
  for (const catalog of catalogs) {
    const expected = OFFICIAL_HIGH_SCHOOL_COUNTS[catalog.area.sourceKey];
    if (!expected)
      throw new Error(`Área não prevista no documento oficial: ${catalog.area.sourceKey}.`);
    if (catalog.competencies.length !== expected.competencies || catalog.skills.length !== expected.skills)
      throw new Error(
        `${catalog.area.name}: esperado ${expected.competencies} competências e ${expected.skills} habilidades; ` +
        `recebido ${catalog.competencies.length} e ${catalog.skills.length}.`,
      );
  }
  const codes = catalogs.flatMap((catalog) => catalog.skills.map((skill) => skill.code));
  if (new Set(codes).size !== 183)
    throw new Error('O catálogo oficial deve conter 183 códigos de habilidades únicos no Ensino Médio.');
  return true;
}

export async function importHighSchoolNatureCatalog(dataDirectory) {
  const baseDirectory = resolve(
    process.env.INIT_CWD || process.cwd(),
    dataDirectory,
  );
  const [structure, highSchool] = await Promise.all([
    readFile(resolve(baseDirectory, 'estrutura.json'), 'utf8').then(JSON.parse),
    readFile(resolve(baseDirectory, 'ensino-medio.json'), 'utf8').then(
      JSON.parse,
    ),
  ]);
  const catalog = buildHighSchoolNatureCatalog(structure, highSchool);
  await transaction(async (client) => {
    const areaResult = await client.query(
      `INSERT INTO curriculum_areas
         (curriculum_version, source_key, name, stage, source_metadata)
       VALUES ('BNCC-2018', $1, $2, $3, $4::jsonb)
       ON CONFLICT (curriculum_version, source_key) DO UPDATE SET
         name = EXCLUDED.name, stage = EXCLUDED.stage,
         source_metadata = EXCLUDED.source_metadata RETURNING id`,
      [
        catalog.area.sourceKey,
        catalog.area.name,
        catalog.area.stage,
        JSON.stringify({ documento: 'bncc-2018' }),
      ],
    );
    const competencyIds = new Map();
    for (const item of catalog.competencies) {
      const result = await client.query(
        `INSERT INTO curriculum_competencies
           (area_id, source_key, number, description, source_metadata)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (area_id, source_key) DO UPDATE SET
           number = EXCLUDED.number, description = EXCLUDED.description,
           source_metadata = EXCLUDED.source_metadata RETURNING id`,
        [
          areaResult.rows[0].id,
          item.sourceKey,
          item.number,
          item.description,
          JSON.stringify(item.sourceMetadata),
        ],
      );
      competencyIds.set(item.sourceKey, result.rows[0].id);
    }
    for (const item of catalog.skills) {
      const result = await client.query(
        `INSERT INTO curriculum_skills
           (curriculum_version, code, stage, subject, grade_range, description,
            dataset_version, validity_status, source_metadata)
         VALUES ('BNCC-2018', $1, 'Ensino Médio', $2,
                 'Ensino Médio (sem seriação)', $3, $4, $5, $6::jsonb)
         ON CONFLICT (curriculum_version, code) DO UPDATE SET
           stage = EXCLUDED.stage, subject = EXCLUDED.subject,
           grade_range = EXCLUDED.grade_range, description = EXCLUDED.description,
           knowledge_object_id = NULL, dataset_version = EXCLUDED.dataset_version,
           validity_status = EXCLUDED.validity_status,
           source_metadata = EXCLUDED.source_metadata RETURNING id`,
        [
          item.code,
          catalog.area.name,
          item.description,
          item.datasetVersion,
          item.validityStatus,
          JSON.stringify(item.sourceMetadata),
        ],
      );
      const skillId = result.rows[0].id;
      await client.query('DELETE FROM skill_competencies WHERE skill_id = $1', [
        skillId,
      ]);
      for (const key of item.competencyKeys)
        await client.query(
          'INSERT INTO skill_competencies (skill_id, competency_id) VALUES ($1, $2)',
          [skillId, competencyIds.get(key)],
        );
    }
  });
  return {
    datasetCommit: BNCC_DATASET_COMMIT,
    area: catalog.area.name,
    competencies: catalog.competencies.length,
    skills: catalog.skills.length,
  };
}

export async function importHighSchoolCatalog(dataDirectory) {
  const baseDirectory = resolve(process.env.INIT_CWD || process.cwd(), dataDirectory);
  const [structure, highSchool] = await Promise.all([
    readFile(resolve(baseDirectory, 'estrutura.json'), 'utf8').then(JSON.parse),
    readFile(resolve(baseDirectory, 'ensino-medio.json'), 'utf8').then(JSON.parse),
  ]);
  const catalogs = buildHighSchoolCatalog(structure, highSchool);
  validateOfficialHighSchoolCatalog(catalogs);
  await transaction(async (client) => {
    for (const catalog of catalogs) {
      const areaResult = await client.query(
        `INSERT INTO curriculum_areas
           (curriculum_version, source_key, name, stage, source_metadata)
         VALUES ('BNCC-2018', $1, $2, $3, $4::jsonb)
         ON CONFLICT (curriculum_version, source_key) DO UPDATE SET
           name=EXCLUDED.name, stage=EXCLUDED.stage,
           source_metadata=EXCLUDED.source_metadata RETURNING id`,
        [catalog.area.sourceKey, catalog.area.name, catalog.area.stage, JSON.stringify({ documento: 'bncc-2018' })],
      );
      const competencyIds = new Map();
      for (const item of catalog.competencies) {
        const result = await client.query(
          `INSERT INTO curriculum_competencies
             (area_id,source_key,number,description,source_metadata)
           VALUES($1,$2,$3,$4,$5::jsonb)
           ON CONFLICT(area_id,source_key) DO UPDATE SET
             number=EXCLUDED.number,description=EXCLUDED.description,
             source_metadata=EXCLUDED.source_metadata RETURNING id`,
          [areaResult.rows[0].id, item.sourceKey, item.number, item.description, JSON.stringify(item.sourceMetadata)],
        );
        competencyIds.set(item.sourceKey, result.rows[0].id);
      }
      for (const item of catalog.skills) {
        const result = await client.query(
          `INSERT INTO curriculum_skills
             (curriculum_version,code,stage,subject,grade_range,description,
              dataset_version,validity_status,source_metadata)
           VALUES('BNCC-2018',$1,'Ensino Médio',$2,'Ensino Médio (sem seriação)',$3,$4,$5,$6::jsonb)
           ON CONFLICT(curriculum_version,code) DO UPDATE SET
             stage=EXCLUDED.stage,subject=EXCLUDED.subject,grade_range=EXCLUDED.grade_range,
             description=EXCLUDED.description,knowledge_object_id=NULL,
             dataset_version=EXCLUDED.dataset_version,validity_status=EXCLUDED.validity_status,
             source_metadata=EXCLUDED.source_metadata RETURNING id`,
          [item.code, catalog.area.name, item.description, item.datasetVersion, item.validityStatus, JSON.stringify(item.sourceMetadata)],
        );
        await client.query('DELETE FROM skill_competencies WHERE skill_id=$1', [result.rows[0].id]);
        for (const key of item.competencyKeys) {
          const competencyId = competencyIds.get(key);
          if (!competencyId) throw new Error(`Competência ausente para ${item.code}: ${key}`);
          await client.query('INSERT INTO skill_competencies(skill_id,competency_id) VALUES($1,$2)', [result.rows[0].id, competencyId]);
        }
      }
    }
  });
  return {
    datasetCommit: BNCC_DATASET_COMMIT,
    areas: catalogs.length,
    competencies: catalogs.reduce((sum, item) => sum + item.competencies.length, 0),
    skills: catalogs.reduce((sum, item) => sum + item.skills.length, 0),
    details: catalogs.map((item) => ({ area: item.area.name, competencies: item.competencies.length, skills: item.skills.length })),
  };
}

const isCommand =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCommand) {
  const directory = process.argv[2] || process.env.BNCC_DATA_DIR;
  if (!directory)
    throw new Error(
      'Informe o diretório dados/bncc-2018 como argumento ou BNCC_DATA_DIR.',
    );
  try {
    const fundamental = await importFundamentalCatalog(directory);
    const highSchool = await importHighSchoolCatalog(directory);
    console.log(JSON.stringify({ fundamental, highSchool }, null, 2));
  } finally {
    await pool.end();
  }
}
