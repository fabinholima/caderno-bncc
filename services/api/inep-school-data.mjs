export const normalizeSchoolName = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g, ' ');
const digits = value => String(value ?? '').replace(/\D/g, '');
const first = (row, ...keys) => {
  for (const key of keys) if (row[key] != null && String(row[key]).trim()) return String(row[key]).trim();
  return '';
};

export function dependencyType(value) {
  return ({ '1': 'federal', '2': 'estadual', '3': 'municipal', '4': 'privada' })[digits(value)] || '';
}
export function formatPostalCode(value) {
  const number = digits(value).slice(0, 8);
  return number.length === 8 ? `${number.slice(0, 5)}-${number.slice(5)}` : '';
}
export function formatPhone(ddd, phone) {
  let number = digits(`${ddd}${phone}`);
  if (number.length === 10 || number.length === 11) {
    const area = number.slice(0, 2); number = number.slice(2);
    return `(${area}) ${number.length === 9 ? `${number.slice(0, 5)}-${number.slice(5)}` : `${number.slice(0, 4)}-${number.slice(4)}`}`;
  }
  return number;
}

/** Adapta cabeçalhos de diferentes anos; coluna que não existir fica vazia. */
export function mapInepSchoolRow(row, year) {
  const code = digits(first(row, 'CO_ENTIDADE', 'CO_ESCOLA', 'CODIGO_INEP')).slice(0, 8);
  const name = first(row, 'NO_ENTIDADE', 'NO_ESCOLA', 'NOME_ESCOLA');
  const state = first(row, 'SG_UF', 'UF').toUpperCase();
  const city = first(row, 'NO_MUNICIPIO', 'MUNICIPIO');
  if (!/^\d{8}$/.test(code) || !name || !/^[A-Z]{2}$/.test(state) || !city) return null;
  const address = first(row, 'DS_ENDERECO', 'NO_ENDERECO', 'ENDERECO');
  const number = first(row, 'NU_ENDERECO', 'NUMERO_ENDERECO', 'NUMERO');
  const cnpj = digits(first(row, 'CNPJ', 'NU_CNPJ_ESCOLA', 'NU_CNPJ_ESCOLA_PRIVADA')).slice(0, 14);
  const email = first(row, 'DS_EMAIL', 'NO_EMAIL', 'EMAIL');
  const ddd = first(row, 'NU_DDD', 'DDD');
  const phone = first(row, 'NU_TELEFONE', 'TELEFONE');
  return {
    inepCode: code, name, nameNormalized: normalizeSchoolName(name),
    schoolType: dependencyType(first(row, 'TP_DEPENDENCIA')),
    cnpj, address, addressNumber: number, city, state,
    postalCode: formatPostalCode(first(row, 'CO_CEP', 'CEP')),
    phone: formatPhone(ddd, phone), email, censusYear: Number(year),
  };
}

export function isActiveSchool(row) {
  return String(row.TP_SITUACAO_FUNCIONAMENTO ?? '').trim() === '1';
}

/** Validação de CNPJ com dígitos verificadores, aceita vazio. */
export function isValidCnpj(value) {
  const cnpj = digits(value);
  if (!cnpj) return true;
  if (cnpj.length !== 14 || /^([0-9])\1{13}$/.test(cnpj)) return false;
  const digit = (base, weights) => {
    const sum = base.split('').reduce((total, char, index) => total + Number(char) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const firstDigit = digit(cnpj.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]);
  const secondDigit = digit(cnpj.slice(0, 12) + firstDigit, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return cnpj.endsWith(`${firstDigit}${secondDigit}`);
}
