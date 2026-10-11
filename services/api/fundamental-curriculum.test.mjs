import test from 'node:test';
import assert from 'node:assert/strict';
import { fundamentalRows,fundamentalYears } from '../../lib/fundamental-curriculum.mjs';
test('recognizes single years, official ranges and exact dataset years',()=>{
 assert.deepEqual(fundamentalYears({skill_code:'EF09MA01'}),[9]);
 assert.deepEqual(fundamentalYears({skill_code:'EF15AR01'}),[1,2,3,4,5]);
 assert.deepEqual(fundamentalYears({skill_code:'EF69LP01',skill_years:[6,8]}),[6,8]);
 assert.deepEqual(fundamentalYears({skill_code:'EM13MAT101'}),[]);
});
test('filters by stage, subject and year while retaining multiple object links',()=>{
 const rows=[{stage:'Ensino Fundamental',subject:'Arte',skill_code:'EF15AR01',object:'A'},{stage:'Ensino Fundamental',subject:'Arte',skill_code:'EF15AR01',object:'B'},{stage:'Ensino Fundamental',subject:'Arte',skill_code:'EF69AR01'},{stage:'Ensino Fundamental',subject:'Matemática',skill_code:'EF01MA01'},{stage:'Ensino Médio',subject:'Arte',skill_code:'EF15AR01'}];
 assert.deepEqual(fundamentalRows(rows,'Arte','1º ano').map(r=>r.object),['A','B']);
 assert.equal(fundamentalRows(rows,'Arte','6º ano').length,1);
});
