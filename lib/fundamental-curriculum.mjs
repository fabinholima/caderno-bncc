/** @param {{skill_years?: number[] | null, skill_code?: string | null}} row */
export function fundamentalYears(row) {
  if (row.skill_years?.length) return row.skill_years;
  const match = /^EF(\d{2})/.exec(row.skill_code || '');
  if (!match) return [];
  const [first,last]=match[1].split('').map(Number);
  return first===0 ? [last] : Array.from({length:last-first+1},(_,i)=>first+i);
}
/** @template {{stage:string,subject:string,skill_years?:number[]|null,skill_code?:string|null}} T
 * @param {T[]} rows @param {string} subject @param {string} grade @returns {T[]} */
export function fundamentalRows(rows,subject,grade) {
  const year=Number.parseInt(grade,10);
  return rows.filter(row=>row.stage==='Ensino Fundamental' && row.subject===subject && fundamentalYears(row).includes(year));
}
