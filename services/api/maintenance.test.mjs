import test from 'node:test';
import assert from 'node:assert/strict';
import {maintenanceBlocks,validateMaintenance,saveMaintenance} from './maintenance.mjs';

test('maintenance denies visitors, teachers, institutional admins and development bypass',()=>{
  for(const identity of [null,{role:'teacher'},{role:'admin'},{portalAdmin:true},{portalAdmin:true,sessionId:'s',developmentBypass:true}])
    assert.equal(maintenanceBlocks({enabled:true},identity),true);
  assert.equal(maintenanceBlocks({enabled:true},{portalAdmin:true,sessionId:'s'}),false);
  assert.equal(maintenanceBlocks({enabled:false},null),false);
});
test('only a real portal admin can change maintenance',async()=>{
  await assert.rejects(saveMaintenance({role:'admin'}, {enabled:true,message:'Teste'}),{statusCode:403});
});
test('maintenance validates explicit boolean and bounded nonempty message',()=>{
  for(const input of [{enabled:'true',message:'Teste'},{enabled:true,message:' '},{enabled:false,message:'x'.repeat(501)}])
    assert.throws(()=>validateMaintenance(input),{statusCode:422});
  assert.deepEqual(validateMaintenance({enabled:false,message:'  Voltamos em breve  '}),{enabled:false,message:'Voltamos em breve'});
});
