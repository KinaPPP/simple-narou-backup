import {findSite,checkpointKey,legacyCheckpointKey} from '../core.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {backupState} from '../backup-state.mjs';
const script=await readFile(new URL('../sites/narou/bulk.js',import.meta.url),'utf8');
async function fixture(){
 const root='https://syosetu.com',saved=[],requests=[],timers=new Map(),badges=[];let checkpoint,errorStatus=0,nextTimer=0,expected=2;
 const works=[1,2].map(id=>({id:String(id),title:'作品'+id,url:root+'/usernovelmanage/top/ncode/'+id+'/',publication:'投稿済み'}));
 const settings=id=>root+'/usernovelmanage/updateinput/ncode/'+id+'/';
 const episode=(id,n)=>root+'/usernoveldatamanage/updateinput/ncode/'+id+'/noveldataid/'+n+'/';
 const doc=url=>({id:url.match(/ncode\/(\d+)/)?.[1],kind:url.includes('draftlist')?'empty':url.includes('usernovel/list')?'list':url.includes('novelinitialsetting')?'template':url.includes('noveldataid')?'episode':url.includes('updateinput')?'settings':'work',querySelector:s=>s==='.l-container'?{}:null,querySelectorAll:()=>[]});
 const parser={ownerId:()=> '123',safeUrl:u=>u.startsWith(root)?u:null,pages:()=>[],metadata:()=>[],main:d=>d.kind==='list'?(expected===null?'作品一覧':'全'+expected+'件中'):'全0件',list:d=>d.kind==='list'?works:[],links:d=>d.kind==='work'?[{text:'投稿済2',url:works.find(w=>w.id===d.id).url},{text:'下書き0',url:works.find(w=>w.id===d.id).url+'?filter=draft'},{text:'設定',url:settings(d.id)},... [1,2].map(n=>({text:'編集',url:episode(d.id,n)}))]:[],form:d=>[{name:d.kind==='episode'?'novel':d.kind==='template'?'preface1':'title',label:'本文',value:'文章'}],formFields:c=>c.map(f=>({label:f.label,value:f.value}))};
 const context=vm.createContext({findSite,checkpointKey,legacyCheckpointKey,document:{},location:{href:root+'/user/top/',pathname:'/user/top/'},NarouParser:parser,URL,crypto:webcrypto,Date,Math,AbortController,
  chrome:{runtime:{sendMessage:async m=>{if(m.type==='checkpoint')checkpoint=structuredClone(m.report);if(m.type==='saveSnapshot')saved.push(structuredClone(m.snapshot));if(m.type==='backupStatus')badges.push(m.state);return {ok:true,checkpoint};}}},
  setTimeout:(fn,ms)=>{const id=++nextTimer;if(ms<30000)fn();else timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
  fetch:async url=>{requests.push(url);return {ok:!errorStatus,status:errorStatus,url,text:async()=>url};},DOMParser:class{parseFromString(url){return doc(url);}}});
 vm.runInContext(script,context);
 const wait=async()=>{for(let i=0;i<1000;i++){await new Promise(r=>setImmediate(r));if(!context.narouBulkBackup.getStatus().running)return;}throw new Error('timeout');};
 const options={works:true,quiet:true,allWorks:true,favorites:false,announcements:false,maxPages:5,waitSeconds:5,autoContinue:true};
 return {worker:context.narouBulkBackup,wait,options,saved,requests,timers,badges,works,setError:value=>errorStatus=value,setExpected:value=>expected=value,get checkpoint(){return checkpoint;}};
}
test('詳細ページなしでも上限後90秒の休憩から自動再開し、本文を重複取得しない',async()=>{
 const f=await fixture();await f.worker.start(f.options);await f.wait();assert.equal(f.worker.getStatus().waiting,true);
 for(let i=0;i<10&&f.worker.getStatus().waiting;i++){const timer=[...f.timers.values()].find(t=>t.ms===90000);assert.ok(timer);timer.fn();await f.wait();}
 assert.equal(f.checkpoint.complete,true);assert.equal(f.worker.getStatus().waiting,false);
 const episodes=f.requests.filter(url=>url.includes('noveldataid'));assert.equal(episodes.length,4);assert.equal(new Set(episodes).size,4);
 assert.ok(f.badges.includes('waiting'));assert.equal(f.badges.at(-1),'complete');
});
test('休憩中の停止は自動再開タイマーを解除し、手動再開できる',async()=>{
 const f=await fixture();await f.worker.start(f.options);await f.wait();f.worker.stop();
 assert.equal(f.worker.getStatus().waiting,false);assert.equal([...f.timers.values()].some(t=>t.ms===90000),false);
 await f.worker.start({...f.options,resume:true,maxPages:30});await f.wait();assert.equal(f.checkpoint.complete,true);
});
test('HTTPエラーでは自動再開せず、正常化した後の手動再開で完了できる',async()=>{
 const f=await fixture();f.setError(503);await f.worker.start(f.options);await f.wait();
 assert.equal(f.requests.length,1);assert.equal(f.worker.getStatus().waiting,false);assert.equal(f.badges.at(-1),'error');
 f.setError(0);await f.worker.start({...f.options,resume:true,maxPages:30});await f.wait();assert.equal(f.checkpoint.complete,true);
});
test('一覧だけの読込は本文・設定を取得せず、個別作品の本文だけを保存できる',async()=>{
 const f=await fixture();await f.worker.start({...f.options,works:false,inventoryOnly:true});await f.wait();assert.equal(f.requests.length,2);assert.equal(f.badges.at(-1),'ready');
 f.requests.length=0;await f.worker.start({...f.options,allWorks:false,selectedWorkIds:['2'],includeSettings:false,maxPages:30});await f.wait();
 assert.equal(f.checkpoint.complete,true);assert.equal(f.requests.some(url=>url.includes('usernovelmanage/updateinput')),false);
 assert.deepEqual(f.saved.filter(r=>r.category==='エピソード').map(r=>r.data.workId),['2','2']);
 const records=f.saved.map((r,index)=>({...r,savedAt:String(index).padStart(4,'0')}));
 assert.equal(backupState(records,f.checkpoint,'123').completed.length,0);
 assert.equal(backupState(records,f.checkpoint,'123',{selectedWorkIds:['2'],includeSettings:false,includeOther:false}).allComplete,true);
});


test('作品一覧の件数不一致は再開しても完了にせず、再走査で不足を解消する',async()=>{const f=await fixture(),removed=f.works.pop(),options={...f.options,maxPages:100,autoContinue:false};await f.worker.start(options);await f.wait();assert.equal(f.checkpoint.complete,false);assert.equal(f.checkpoint.inventoryChecks['https://syosetu.com/usernovel/list/'].validated,false);await f.worker.start({...options,resume:true});await f.wait();assert.equal(f.checkpoint.complete,false);assert.ok(f.checkpoint.failures.some(x=>x.error.includes('件数不一致')));assert.equal(f.requests.filter(u=>u==='https://syosetu.com/usernovel/list/').length,2);f.works.push(removed);await f.worker.start({...options,resume:true});await f.wait();assert.equal(f.checkpoint.complete,true);assert.equal(f.checkpoint.workPlan.length,2);assert.equal(f.checkpoint.inventoryChecks['https://syosetu.com/usernovel/list/'].recognized,2);assert.equal(f.requests.filter(u=>u.includes('noveldataid/1/')&&u.includes('ncode/1/')).length,1);});

test('旧版の検証記録がない再開情報でも作品一覧を再確認する',async()=>{const f=await fixture();const options={...f.options,autoContinue:false};await f.worker.start(options);await f.wait();assert.equal(f.checkpoint.complete,false);delete f.checkpoint.inventoryChecks;await f.worker.start({...options,resume:true,maxPages:100});await f.wait();assert.equal(f.checkpoint.complete,true);assert.equal(f.requests.filter(u=>u==='https://syosetu.com/usernovel/list/').length,2);});


test('再走査で件数表示が読めなくなっても、以前検出した不足を解消扱いにしない',async()=>{const f=await fixture();f.works.pop();const options={...f.options,maxPages:100,autoContinue:false};await f.worker.start(options);await f.wait();assert.equal(f.checkpoint.complete,false);f.setExpected(null);await f.worker.start({...options,resume:true});await f.wait();assert.equal(f.checkpoint.complete,false);assert.equal(f.checkpoint.inventoryChecks['https://syosetu.com/usernovel/list/'].expected,2);assert.equal(f.checkpoint.inventoryChecks['https://syosetu.com/usernovel/list/'].recognized,1);f.setExpected(1);await f.worker.start({...options,resume:true});await f.wait();assert.equal(f.checkpoint.complete,true);});
