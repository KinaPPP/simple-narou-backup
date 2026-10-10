import test from 'node:test';
import assert from 'node:assert/strict';
import {gaugeState} from '../progress-state.mjs';
test('progress uses completed works and reserves 100 for confirmed completion',()=>{
 assert.equal(gaugeState({coverage:{total:10,completed:[1,2,3,4]}}).percent,40);
 assert.equal(gaugeState({coverage:{total:1,completed:[1]}}).percent,99);
 assert.equal(gaugeState({coverage:{allComplete:true}}).percent,100);
 assert.equal(gaugeState({state:{inventoryOnly:true,complete:true},coverage:{}}).percent,0);
});
test('paused and failed runs retain progress with distinct severity',()=>{
 const coverage={total:10,completed:[1,2,3,4],pending:true};
 assert.deepEqual(gaugeState({coverage,state:{phase:'paused'}}),{percent:40,level:'paused'});
 assert.equal(gaugeState({coverage,state:{phase:'error'}}).level,'error');
 assert.equal(gaugeState({coverage,state:{phase:'warning'}}).level,'warning');
});
test('archive respects selected works and final completion',()=>{
 const manifest={checkpoint:{workPlan:[{id:'1'},{id:'2'}],doneSelectedWorks:['2'],options:{selectedWorkIds:['2']}}};
 assert.equal(gaugeState({manifest}).percent,99);
 manifest.complete=true;assert.equal(gaugeState({manifest}).percent,100);
});

test('missing ZIPs warn and corrupt entries are errors',()=>{
 assert.equal(gaugeState({manifest:{missingParts:[2]}}).level,'warning');
 assert.equal(gaugeState({manifest:{integrityErrors:new Map([['bad','CRC']])}}).level,'error');
});
