// Importação aditiva: não substitui habilidades, tópicos ou vínculos existentes.
import { fileURLToPath } from 'node:url';
import { pool, transaction } from './db.mjs';
import { BNCC_API_URL, HIGH_SCHOOL_AREAS, validateAreaPayload } from './bncc-api-import.mjs';

export async function restoreCompetencies(fetcher=fetch) {
  const downloaded=[];
  const expected={'em-area-mat':5,'em-area-cnt':3,'em-area-lgg':7,'em-area-chs':6};
  for(const area of HIGH_SCHOOL_AREAS) {
    const url=new URL(BNCC_API_URL);
    url.search=new URLSearchParams({etapa:'EM',area:area.key,limite:'100'});
    const response=await fetcher(url,{signal:AbortSignal.timeout(20000)});
    if(!response.ok) throw new Error(`Fonte BNCC indisponível: ${response.status}`);
    const items=validateAreaPayload(await response.json(),area);
    const competencies=new Map();
    for(const item of items) for(const c of item.competenciasEspecificas || []) {
      if(!c.id || !Number.isInteger(c.numero) || c.numero<1 || typeof c.texto!=='string' || c.texto.length<20) throw new Error('Competência inválida na fonte.');
      competencies.set(c.numero,c);
    }
    if(competencies.size!==expected[area.key]) throw new Error(`Competências incompletas: ${area.key}`);
    downloaded.push({area,items,competencies});
  }
  return transaction(async db=>{
    let added=0,links=0;
    for(const {area,items,competencies} of downloaded) {
      const found=await db.query("SELECT id FROM curriculum_areas WHERE curriculum_version='BNCC-2018' AND source_key=$1",[area.key]);
      if(found.rowCount!==1) throw new Error(`Área não cadastrada: ${area.key}`);
      const areaId=found.rows[0].id;
      for(const c of competencies.values()) {
        const inserted=await db.query(`INSERT INTO curriculum_competencies(area_id,source_key,number,description,source_metadata) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[areaId,c.id,c.numero,c.texto,JSON.stringify({fonte:BNCC_API_URL,documento:'bncc-2018'})]);
        added+=inserted.rowCount;
      }
      for(const item of items) for(const c of item.competenciasEspecificas || []) {
        const linked=await db.query(`INSERT INTO skill_competencies(skill_id,competency_id) SELECT s.id,c.id FROM curriculum_skills s JOIN curriculum_competencies c ON c.area_id=$2 AND c.number=$3 WHERE s.curriculum_version='BNCC-2018' AND s.code=$1 ON CONFLICT DO NOTHING`,[item.codigo,areaId,c.numero]);
        links+=linked.rowCount;
      }
    }
    return {added,links};
  });
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  try{console.log(JSON.stringify(await restoreCompetencies()));}finally{await pool.end();}
}
