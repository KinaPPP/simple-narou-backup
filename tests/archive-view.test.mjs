import test from 'node:test';
import assert from 'node:assert/strict';
import {historyEntries} from '../archive-view.mjs';
test('A B A versions remain separate and history pages reach older records',()=>{
 const entries=Array.from({length:205},(_,i)=>({id:String(i),savedAt:String(i).padStart(3,'0'),url:'same',category:'エピソード'}));
 const pages=[0,1,2].map(page=>historyEntries(entries,page));
 assert.deepEqual(pages.map(p=>p.entries.length),[100,100,5]);
 assert.equal(new Set(pages.flatMap(p=>p.entries.map(e=>e.id))).size,205);
 assert.equal(historyEntries(entries,999).page,2);assert.equal(historyEntries([]).pages,1);
});
