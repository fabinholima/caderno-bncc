import { pool } from './db.mjs';

const STATES = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));

export function normalizeSchoolName(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g, ' ');
}

export async function searchSchools({ q = '', uf = '' } = {}) {
  const query = String(q).trim();
  const state = String(uf).trim().toUpperCase();
  if (query.length < 3 && !/^\d{8}$/.test(query)) return [];
  if (state && !STATES.has(state)) return [];
  const normalized = normalizeSchoolName(query);
  const values = [];
  const filters = [];
  if (state) { values.push(state); filters.push(`state = $${values.length}`); }
  if (/^\d{8}$/.test(query)) {
    values.push(query); filters.push(`inep_code = $${values.length}`);
  } else {
    values.push(`${normalized}%`); filters.push(`name_normalized LIKE $${values.length}`);
  }
  values.push(10);
  const result = await pool.query(
    `SELECT inep_code AS inep, name, school_type AS "schoolType", cnpj, address, address_number AS "addressNumber", city, state, postal_code AS "postalCode", phone, email
       FROM escolas WHERE ${filters.join(' AND ')}
      ORDER BY name_normalized, city, inep_code LIMIT $${values.length}`,
    values,
  );
  return result.rows;
}

export async function schoolCatalogReady() {
  const result = await pool.query('SELECT EXISTS (SELECT 1 FROM escolas) AS available');
  return result.rows[0]?.available === true;
}
