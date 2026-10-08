import test from 'node:test';
import assert from 'node:assert/strict';
import {saveOfflineViewer} from '../offline-viewer-save.mjs';
test('ビューアーは初期オン、同名HTMLを上書きせず連番保存し、オフではアクセスしない',async()=>{
 const oldFetch=globalThis.fetch,oldChrome=globalThis.chrome;let calls=0;
 globalThis.chrome={runtime:{getURL:name=>'https://extension.local/'+name}};
 globalThis.fetch=async()=>{calls++;return {ok:true,text:async()=>'<html>viewer</html>'};};
 const files=new Map([['simple-narou-zipviewer.html','existing']]);
 const directory={async getFileHandle(name,options={}){if(!files.has(name)){if(!options.create)throw Object.assign(new Error('missing'),{name:'NotFoundError'});files.set(name,'');}return {async createWritable(){let value;return {write:async text=>value=text,close:async()=>files.set(name,value),abort:async()=>{}};}};}};
 try{assert.equal(await saveOfflineViewer(directory,{viewer:false}),null);assert.equal(calls,0);assert.equal(await saveOfflineViewer(directory,{}),'simple-narou-zipviewer-1.html');assert.equal(files.get('simple-narou-zipviewer.html'),'existing');assert.equal(files.get('simple-narou-zipviewer-1.html'),'<html>viewer</html>');assert.equal(await saveOfflineViewer(directory,{viewer:true}),'simple-narou-zipviewer-2.html');}
 finally{globalThis.fetch=oldFetch;globalThis.chrome=oldChrome;}
});
test('ビューアーの書き込み失敗は成功扱いにせず書き込みを中止する',async()=>{
 const oldFetch=globalThis.fetch,oldChrome=globalThis.chrome;let aborted=false;
 globalThis.chrome={runtime:{getURL:n=>n}};globalThis.fetch=async()=>({ok:true,text:async()=>'<html></html>'});
 const d={getFileHandle:async(n,o)=>{if(!o?.create)throw Object.assign(new Error('missing'),{name:'NotFoundError'});return {createWritable:async()=>({write:async()=>{throw new Error('disk full');},abort:async()=>aborted=true})};}};
 try{await assert.rejects(saveOfflineViewer(d,{}),/disk full/);assert.equal(aborted,true);}finally{globalThis.fetch=oldFetch;globalThis.chrome=oldChrome;}
});
