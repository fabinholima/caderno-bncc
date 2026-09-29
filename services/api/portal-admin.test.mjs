import test from 'node:test';
import assert from 'node:assert/strict';
import { requirePortalAdmin, globalBankRouteAllowed, resolvePortalContext } from './portal-admin.mjs';

test('institution admin is not portal admin; development bypass cannot escalate',()=>{
  for(const identity of [{role:'admin',sessionId:'s'}, {portalAdmin:true,developmentBypass:true,sessionId:'s'}, {portalAdmin:true}]) assert.throws(()=>requirePortalAdmin(identity),/exclusivo/);
  assert.doesNotThrow(()=>requirePortalAdmin({portalAdmin:true,sessionId:'s'}));
});
test('global bank only permits editorial routes',()=>{
  for(const path of ['/api/questions','/api/questions/123/revisions','/api/exam-imports','/api/curriculum','/api/auth/logout']) assert.equal(globalBankRouteAllowed(path),true);
  for(const path of ['/api/invitations','/api/billing/checkout','/api/students','/api/assessments','/api/subscription']) assert.equal(globalBankRouteAllowed(path),false);
});
test('revocation immediately stops global context even with old session flag',async()=>{
  const identity={portalAdmin:false,institutionId:'personal'};
  const result=await resolvePortalContext(identity,true);
  assert.equal(result.institutionId,'personal');
  assert.equal(result.globalBank,false);
});
