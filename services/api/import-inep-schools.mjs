import fs from 'node:fs';
import { pool } from './db.mjs';
import { isActiveSchool, mapInepSchoolRow } from './inep-school-data.mjs';

const [csvPath, yearArg] = process.argv.slice(2);
const year = Number(yearArg || new Date().getFullYear());
if (!csvPath || !Number.isInteger(year)) {
  console.error('Uso: pnpm --filter @caderno/api import:inep-schools -- /caminho/Tabela_Escola.csv 2025');
  process.exit(2);
}

// Leitor CSV com suporte a aspas escapadas e delimitadores/linhas dentro de aspas.
async function* csvRecords(stream, delimiter = ';') {
  let field = '', row = [], quoted = false, afterQuote = false;
  for await (const chunk of stream) {
    for (let i = 0; i < chunk.length; i++) {
      const char = chunk[i];
      if (quoted) {
        if (char === '"' && chunk[i + 1] === '"') { field += '"'; i++; }
        else if (char === '"') { quoted = false; afterQuote = true; }
        else field += char;
      } else if (char === '"' && !field.length && !afterQuote) quoted = true;
      else if (char === delimiter) { row.push(field); field = ''; afterQuote = false; }
      else if (char === '\n' || char === '\r') {
        if (char === '\r' && chunk[i + 1] === '\n') i++;
        row.push(field); field = ''; afterQuote = false;
        if (row.some(value => value.length)) yield row;
        row = [];
      } else { field += char; afterQuote = false; }
    }
  }
  if (field.length || row.length) { row.push(field); yield row; }
}

const stream = fs.createReadStream(csvPath, { encoding: 'utf8' });
const reader = csvRecords(stream);
const headerRow = await reader.next();
if (headerRow.done) throw new Error('O arquivo CSV está vazio.');
const headers = headerRow.value.map((value, index) => (index === 0 ? value.replace(/^\uFEFF/, '') : value).trim().toUpperCase());
const required = ['NO_ENTIDADE', 'CO_ENTIDADE', 'TP_DEPENDENCIA', 'TP_SITUACAO_FUNCIONAMENTO', 'NO_MUNICIPIO', 'SG_UF'];
const missing = required.filter(name => !headers.includes(name));
if (missing.length) throw new Error(`Cabeçalho incompatível. Colunas obrigatórias ausentes: ${missing.join(', ')}. Confira o CSV e seu dicionário.`);

let count = 0, active = 0, skipped = 0, batch = new Map();
async function flush() {
  if (!batch.size) return;
  const rows = [...batch.values()];
  const params = [];
  const tuples = rows.map((school, rowIndex) => {
    const values = [school.inepCode, school.name, school.nameNormalized, school.schoolType, school.cnpj, school.address, school.addressNumber, school.city, school.state, school.postalCode, school.phone, school.email, school.censusYear];
    params.push(...values);
    return `(${values.map((_, colIndex) => `$${rowIndex * values.length + colIndex + 1}`).join(',')})`;
  });
  await pool.query(`INSERT INTO escolas(inep_code,name,name_normalized,school_type,cnpj,address,address_number,city,state,postal_code,phone,email,census_year)
    VALUES ${tuples.join(',')} ON CONFLICT(inep_code) DO UPDATE SET name=EXCLUDED.name,name_normalized=EXCLUDED.name_normalized,school_type=EXCLUDED.school_type,cnpj=EXCLUDED.cnpj,address=EXCLUDED.address,address_number=EXCLUDED.address_number,city=EXCLUDED.city,state=EXCLUDED.state,postal_code=EXCLUDED.postal_code,phone=EXCLUDED.phone,email=EXCLUDED.email,census_year=EXCLUDED.census_year,updated_at=now()`, params);
  count += rows.length; batch = new Map();
}

for await (const values of reader) {
  const record = Object.fromEntries(headers.map((key, index) => [key, values[index] || '']));
  if (!isActiveSchool(record)) { skipped++; continue; }
  active++;
  const school = mapInepSchoolRow(record, year);
  if (!school) { skipped++; continue; }
  batch.set(school.inepCode, school);
  if (batch.size >= 400) await flush();
}
await flush();
console.log(`Importação concluída: ${count} escolas gravadas/atualizadas; ${active} linhas ativas; ${skipped} ignoradas.`);
await pool.end();
