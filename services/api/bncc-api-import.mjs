import { fileURLToPath } from 'node:url';
import { pool, transaction } from './db.mjs';

export const BNCC_API_URL = 'https://api.bncc.dev/v1/habilidades';
export const HIGH_SCHOOL_AREAS = Object.freeze([
  { key: 'em-area-mat', expectedSkills: 43, disciplines: ['Matemática'] },
  {
    key: 'em-area-cnt',
    expectedSkills: 26,
    disciplines: ['Biologia', 'Física', 'Química'],
  },
  {
    key: 'em-area-lgg',
    expectedSkills: 82,
    disciplines: ['Língua Portuguesa', 'Arte', 'Educação Física', 'Língua Inglesa'],
  },
  {
    key: 'em-area-chs',
    expectedSkills: 32,
    disciplines: ['História', 'Geografia', 'Sociologia', 'Filosofia'],
  },
]);

export function validateAreaPayload(payload, area) {
  if (!payload || !Array.isArray(payload.itens))
    throw new Error(`Resposta inválida para ${area.key}.`);
  if (payload.total !== area.expectedSkills)
    throw new Error(
      `${area.key}: esperadas ${area.expectedSkills} habilidades; recebidas ${payload.total}.`,
    );
  const codes = payload.itens.map((item) => item.codigo);
  if (payload.itens.length !== area.expectedSkills)
    throw new Error(`${area.key}: a resposta não contém todos os registros.`);
  if (new Set(codes).size !== codes.length)
    throw new Error(`${area.key}: há códigos duplicados.`);
  const expectedPrefixes = {
    'em-area-mat': 'EM13MAT',
    'em-area-cnt': 'EM13CNT',
    'em-area-lgg': ['EM13LGG', 'EM13LP'],
    'em-area-chs': 'EM13CHS',
  }[area.key];
  const prefixes = Array.isArray(expectedPrefixes)
    ? expectedPrefixes
    : [expectedPrefixes];
  if (codes.some((code) => !prefixes.some((prefix) => code.startsWith(prefix))))
    throw new Error(`${area.key}: há códigos de outra área na resposta.`);
  return payload.itens;
}

export function skillBelongsToDiscipline(skillCode, disciplineName) {
  // EM13LP skills are specific to the Língua Portuguesa component. The
  // EM13LGG area skills remain shared across all components in Linguagens.
  return !skillCode.startsWith('EM13LP') || disciplineName === 'Língua Portuguesa';
}

async function fetchArea(area, fetchImpl = fetch) {
  const url = new URL(BNCC_API_URL);
  url.searchParams.set('etapa', 'EM');
  url.searchParams.set('area', area.key);
  url.searchParams.set('limite', '100');
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok)
    throw new Error(`BNCC API respondeu ${response.status} para ${area.key}.`);
  return validateAreaPayload(await response.json(), area);
}

async function saveArea(client, area, items) {
  const first = items[0];
  const areaResult = await client.query(
    `INSERT INTO curriculum_areas
       (curriculum_version,source_key,name,stage,source_metadata)
     VALUES ('BNCC-2018',$1,$2,'Ensino Médio',$3::jsonb)
     ON CONFLICT (curriculum_version,source_key) DO UPDATE SET
       name=EXCLUDED.name,stage=EXCLUDED.stage,
       source_metadata=EXCLUDED.source_metadata
     RETURNING id`,
    [
      area.key,
      first.area.nome,
      JSON.stringify({
        documento: 'bncc-2018',
        dataset: first.vigencia?.desde || null,
        fonte: 'api.bncc.dev',
      }),
    ],
  );
  const areaId = areaResult.rows[0].id;
  const competencies = new Map();
  for (const item of items)
    for (const competency of item.competenciasEspecificas || [])
      competencies.set(competency.id, competency);

  const competencyIds = new Map();
  for (const competency of competencies.values()) {
    const existing = await client.query(
      `SELECT id FROM curriculum_competencies
       WHERE area_id=$1 AND (source_key=$2 OR number=$3)
       ORDER BY (source_key=$2) DESC LIMIT 1`,
      [areaId, competency.id, competency.numero],
    );
    const result = existing.rowCount
      ? await client.query(
          `UPDATE curriculum_competencies
           SET source_key=$2, number=$3, description=$4, source_metadata=$5::jsonb
           WHERE id=$1 RETURNING id`,
          [
            existing.rows[0].id,
            competency.id,
            competency.numero,
            competency.texto,
            JSON.stringify({ documento: 'bncc-2018', fonte: 'api.bncc.dev' }),
          ],
        )
      : await client.query(
          `INSERT INTO curriculum_competencies
             (area_id,source_key,number,description,source_metadata)
           VALUES($1,$2,$3,$4,$5::jsonb) RETURNING id`,
          [
            areaId,
            competency.id,
            competency.numero,
            competency.texto,
            JSON.stringify({ documento: 'bncc-2018', fonte: 'api.bncc.dev' }),
          ],
        );
    competencyIds.set(competency.id, result.rows[0].id);
  }

  const skillIds = [];
  for (const item of items) {
    const result = await client.query(
      `INSERT INTO curriculum_skills
         (curriculum_version,code,stage,subject,grade_range,description,
          dataset_version,validity_status,source_metadata)
       VALUES('BNCC-2018',$1,'Ensino Médio',$2,
              'Ensino Médio (sem seriação)',$3,$4,$5,$6::jsonb)
       ON CONFLICT(curriculum_version,code) DO UPDATE SET
         stage=EXCLUDED.stage,subject=EXCLUDED.subject,
         grade_range=EXCLUDED.grade_range,description=EXCLUDED.description,
         knowledge_object_id=NULL,dataset_version=EXCLUDED.dataset_version,
         validity_status=EXCLUDED.validity_status,
         source_metadata=EXCLUDED.source_metadata
       RETURNING id`,
      [
        item.codigo,
        item.area.nome,
        item.texto,
        item.vigencia?.desde || null,
        item.vigencia?.status || null,
        JSON.stringify(item.fonte || {}),
      ],
    );
    const skillId = result.rows[0].id;
    skillIds.push(skillId);
    await client.query('DELETE FROM skill_competencies WHERE skill_id=$1', [
      skillId,
    ]);
    for (const competency of item.competenciasEspecificas || []) {
      const competencyId = competencyIds.get(competency.id);
      if (!competencyId)
        throw new Error(`Competência ausente para ${item.codigo}.`);
      await client.query(
        `INSERT INTO skill_competencies(skill_id,competency_id)
         VALUES($1,$2) ON CONFLICT DO NOTHING`,
        [skillId, competencyId],
      );
    }
  }

  const disciplines = await client.query(
    `SELECT id,created_by FROM pedagogical_disciplines
     WHERE area_id=$1 AND name = ANY($2::text[]) AND stage='Ensino Médio'`,
    [areaId, area.disciplines],
  );
  for (const discipline of disciplines.rows) {
    await client.query(
      `DELETE FROM pedagogical_discipline_skills
       WHERE discipline_id=$1 AND skill_id=ANY($2::uuid[])`,
      [discipline.id, skillIds],
    );
    for (const [index, skillId] of skillIds.entries()) {
      if (!skillBelongsToDiscipline(items[index].codigo, discipline.name))
        continue;
      await client.query(
        `INSERT INTO pedagogical_discipline_skills
           (discipline_id,skill_id,tagged_by,rationale)
         VALUES($1,$2,$3,$4)`,
        [
          discipline.id,
          skillId,
          discipline.created_by,
          `Vínculo com as habilidades oficiais da área ${first.area.nome}.`,
        ],
      );
    }
  }
  return {
    area: first.area.nome,
    competencies: competencies.size,
    skills: skillIds.length,
    linkedDisciplines: disciplines.rowCount,
  };
}

export async function importHighSchoolBnccFromApi(fetchImpl = fetch) {
  const downloaded = [];
  for (const area of HIGH_SCHOOL_AREAS)
    downloaded.push({ area, items: await fetchArea(area, fetchImpl) });
  return transaction(async (client) => {
    const results = [];
    for (const entry of downloaded)
      results.push(await saveArea(client, entry.area, entry.items));
    return results;
  });
}

const isCommand =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCommand) {
  try {
    console.log(
      JSON.stringify(await importHighSchoolBnccFromApi(), null, 2),
    );
  } finally {
    await pool.end();
  }
}
