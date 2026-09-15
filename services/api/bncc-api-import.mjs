import { fileURLToPath } from 'node:url';
import { pool, transaction } from './db.mjs';

export const BNCC_API_URL = 'https://api.bncc.dev/v1/habilidades';
export const HIGH_SCHOOL_AREAS = Object.freeze([
  { key: 'em-area-mat', expectedSkills: 43, discipline: 'Matemática' },
  { key: 'em-area-cnt', expectedSkills: 26, discipline: 'Física' },
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
  if (codes.some((code) => !code.startsWith(area.key === 'em-area-mat' ? 'EM13MAT' : 'EM13CNT')))
    throw new Error(`${area.key}: há códigos de outra área na resposta.`);
  return payload.itens;
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
    const result = await client.query(
      `INSERT INTO curriculum_competencies
         (area_id,source_key,number,description,source_metadata)
       VALUES($1,$2,$3,$4,$5::jsonb)
       ON CONFLICT(area_id,source_key) DO UPDATE SET
         number=EXCLUDED.number,description=EXCLUDED.description,
         source_metadata=EXCLUDED.source_metadata
       RETURNING id`,
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
     WHERE area_id=$1 AND name=$2 AND stage='Ensino Médio'`,
    [areaId, area.discipline],
  );
  for (const discipline of disciplines.rows) {
    await client.query(
      'DELETE FROM pedagogical_discipline_skills WHERE discipline_id=$1',
      [discipline.id],
    );
    for (const skillId of skillIds)
      await client.query(
        `INSERT INTO pedagogical_discipline_skills
           (discipline_id,skill_id,tagged_by,rationale)
         VALUES($1,$2,$3,$4)`,
        [
          discipline.id,
          skillId,
          discipline.created_by,
          area.discipline === 'Física'
            ? 'Vínculo pedagógico institucional com a área integrada de Ciências da Natureza.'
            : 'Vínculo com as habilidades oficiais de Matemática do Ensino Médio.',
        ],
      );
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
