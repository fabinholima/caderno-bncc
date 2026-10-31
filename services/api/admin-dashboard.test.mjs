import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionNetwork,reportSchema,subscriberFilter,revenueReport,listSubscribers,manageSubscriber } from './admin-dashboard.mjs';
test('administrative reports and mutations reject other roles before querying database',async()=>{
  for(const identity of [{role:'admin'},{portalEditor:true},{role:'teacher'}]) {
    await assert.rejects(revenueReport(identity,{year:2026}),{statusCode:403});
    await assert.rejects(listSubscribers(identity,{}),{statusCode:403});
    await assert.rejects(manageSubscriber(identity,{}),{statusCode:403});
  }
});
test('IP uses peer address, ignores untrusted forwarding headers and caps user-agent',()=>{
  assert.deepEqual(sessionNetwork({socket:{remoteAddress:'::ffff:192.0.2.10'},headers:{'x-forwarded-for':'203.0.113.1','user-agent':'Browser'}}),{ip:'192.0.2.10',agent:'Browser'});
  assert.equal(sessionNetwork({headers:{'user-agent':'x'.repeat(900)}}).agent.length,512);
  assert.equal(sessionNetwork({headers:{'x-forwarded-for':'203.0.113.1'}}).ip,null);
  assert.throws(()=>subscriberFilter.parse({ip:'not-an-ip'}));
  assert.throws(()=>reportSchema.parse({year:'2026 OR true'}));
});
test('subscriber filter accepts status, plan and sort with safe defaults',()=>{
  assert.deepEqual(subscriberFilter.parse({}),{q:'',ip:'',status:'all',plan:'',sort:'recent',page:1});
  assert.equal(subscriberFilter.parse({status:'blocked',sort:'access',page:'2'}).page,2);
  assert.throws(()=>subscriberFilter.parse({status:'paid'}));
  assert.throws(()=>subscriberFilter.parse({sort:'created_at; DROP TABLE users'}));
});
