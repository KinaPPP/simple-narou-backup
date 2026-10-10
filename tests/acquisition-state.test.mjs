import test from 'node:test';
import assert from 'node:assert/strict';
import {acquisitionActive} from '../acquisition-state.mjs';
test('export controls stay locked across transient gaps and restart preparation',()=>{
 assert.equal(acquisitionActive(null,true,true),true);
 assert.equal(acquisitionActive({running:false,waiting:false,phase:'running'},true),true);
 assert.equal(acquisitionActive({complete:true},true,true),true);
 assert.equal(acquisitionActive({waiting:true},true),true);
});
test('terminal states release the acquisition lock',()=>{
 for(const phase of ['complete','ready','paused','error','idle'])assert.equal(acquisitionActive({phase},true),false);
 assert.equal(acquisitionActive({complete:true},true),false);
 assert.equal(acquisitionActive(null,false),false);
 assert.equal(acquisitionActive(null,true),false);
});
