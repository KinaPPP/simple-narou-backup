import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
import {validateSnapshot} from '../core.mjs';import {recordIndex} from '../archive.mjs';import {selectRecords,selectionWarnings} from '../export-selection.mjs';
const scope={ownerId:'123',siteId:'narou',workId:'1'};
const raw={id:'edit',ownerId:'123',title:'編集履歴',fields:[{label:'本文',value:'変更'}],url:'https://syosetu.com/usernoveldatamanage/updateinput/ncode/1/noveldataid/2/',savedAt:'1'};
test('new and old editing histories infer work identity from a supported URL',()=>{
 const normalized=validateSnapshot(raw,raw.url);assert.equal(normalized.data.workId,'1');assert.equal(normalized.entity.workId,'1');
 assert.equal(recordIndex(raw).workId,'1');assert.equal(selectRecords([raw],scope).length,1);
 assert.equal(selectRecords([{...raw,ownerId:'456'}],scope).length,0);
 assert.equal(selectRecords([{...raw,url:raw.url.replace('syosetu.com','evil.test')}],scope).length,0);
 // Old ZIP indices may have an empty workId; derive only from the known path.
 assert.equal(selectRecords([{...raw}],scope).length,1);
 assert.deepEqual(selectionWarnings([{...recordIndex(raw),workId:''}],scope),[]);
});
test('unknown draft editing histories are not guessed and generate a warning',()=>{
 const unknown={...raw,url:'https://syosetu.com/draftepisode/updateinput/draftepisodeid/123/'};
 assert.equal(recordIndex(unknown).workId,'');assert.equal(selectRecords([unknown],scope).length,0);
 assert.equal(selectionWarnings([recordIndex(unknown)],scope).length,1);assert.deepEqual(selectionWarnings([recordIndex(unknown)],null),[]);
});
test('draft editor uses one unambiguous work link in its main area',async()=>{
 const ctx=vm.createContext({URL});vm.runInContext(await readFile(new URL('../sites/narou/parser.js',import.meta.url),'utf8'),ctx);
 const doc=ids=>({querySelector:s=>s==='.l-main'?{querySelectorAll:()=>ids.map(id=>({textContent:'作品',getAttribute:()=>'/draftnovelmanage/top/ncode/'+id+'/'}))}:null});
 const url='https://syosetu.com/draftepisode/updateinput/draftepisodeid/123/';
 assert.equal(ctx.NarouParser.editWorkId(doc(['1']),url),'1');assert.equal(ctx.NarouParser.editWorkId(doc(['1','2']),url),null);assert.equal(ctx.NarouParser.editWorkId(doc([]),url),null);
});
