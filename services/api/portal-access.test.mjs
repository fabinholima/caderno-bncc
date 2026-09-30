import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogAccess,sharedCatalogRoute } from './portal-access.mjs';
test('teacher and personal-space admin can read but cannot mutate shared catalog',()=>{
  for(const identity of [{role:'teacher'},{role:'admin'},{role:'coordinator'}]) {
    assert.equal(catalogAccess(identity,'GET','/api/questions'),false);
    for(const path of ['/api/questions','/api/questions/id/revisions','/api/curriculum/subjects','/api/exam-imports']) assert.throws(()=>catalogAccess(identity,'POST',path),{statusCode:403});
  }
});
test('editors and portal administrators can manage catalog and import',()=>{
  for(const identity of [{portalAdmin:true},{portalEditor:true}]) for(const method of ['GET','POST','PATCH','DELETE']) assert.equal(catalogAccess(identity,method,'/api/questions'),true);
});
test('personal records and assessments never use catalog context',()=>{
  for(const path of ['/api/assessments','/api/classes','/api/students','/api/billing','/api/educator-profile','/api/admin/editors']) assert.equal(sharedCatalogRoute(path),false);
  assert.equal(sharedCatalogRoute('/api/curriculum/high-school'),true);
  assert.equal(sharedCatalogRoute('/api/curriculum/pedagogical-topics'),true);
  assert.equal(catalogAccess({portalEditor:true,developmentBypass:true},'GET','/api/questions'),false);
});
