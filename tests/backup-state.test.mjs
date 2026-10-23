import {findSite,checkpointKey,legacyCheckpointKey} from '../core.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {backupState} from '../backup-state.mjs';
const ownerId='123',workPlan=Array.from({length:9},(_,index)=>({id:String(index+1),title:'作品'+(index+1)}));
const report=(doneWorks,other={})=>({ownerId,doneWorks,workPlan,scope:{totalWorks:9,first:1,count:3},complete:true,options:{works:true,favorites:true,announcements:true},...other});
const record=data=>({category:'取得結果',ownerId,savedAt:'2026-10-08T01:00:00Z',data});
test('先頭3作品の範囲完了を全体完了と扱わず、残り6作品へ案内する',()=>{
 const state=backupState([record(report(['1','2','3']))],null,ownerId);
 assert.equal(state.allComplete,false);assert.equal(state.pending,false);assert.equal(state.total,9);
 assert.equal(state.completed.length,3);assert.deepEqual(state.remaining.map(work=>work.id),['4','5','6','7','8','9']);
 assert.equal(state.favoritesComplete,true);assert.equal(state.announcementsComplete,true);
});
test('上限で止まった最新実行は、過去に完了した実行があっても再開対象となる',()=>{
 const current=report(['1','2','3'],{complete:false,failures:[{error:'取得ページ上限'}]});
 const state=backupState([record(report(['1','2','3']))],current,ownerId);
 assert.equal(state.pending,true);assert.equal(state.allComplete,false);assert.equal(state.remaining.length,6);
 assert.equal(state.current,current);
});
test('異なる実行の完了作品を累計し、本文だけ完了しても他項目が残れば未完了にする',()=>{
 const records=[record(report(['1','2','3'])),record(report(['4','5','6','7','8','9'],{options:{works:true,favorites:false,announcements:false}}))];
 assert.equal(backupState(records,null,ownerId).allComplete,true);
 assert.equal(backupState([record(report(workPlan.map(work=>work.id),{options:{works:true}}))],null,ownerId).allComplete,false);
 assert.equal(backupState(records,null,'456').completed.length,0);
});
test('未確認と0作品を区別し、新しい作品一覧を採用する',()=>{
 assert.equal(backupState([],null,ownerId).allComplete,false);
 const empty=report([],{workPlan:[],scope:{first:1,count:0,totalWorks:0}});
 assert.equal(backupState([record(empty)],null,ownerId).allComplete,true);
 const old=record(report(workPlan.map(work=>work.id)));
 const current=report(['1','2'],{workPlan:workPlan.slice(0,2),scope:{totalWorks:2}});
 assert.equal(backupState([old],current,ownerId).total,2);
});

import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
test('全作品モードは旧3作品制限を使わず、取得済みを除いた作品だけを取得する',async()=>{
 const origin='https://syosetu.com',saved=[],requests=[];let checkpoint;
 const plans=[1,2,3].map(id=>({id:String(id),title:'作品'+id,url:origin+'/usernovelmanage/top/ncode/'+id+'/',publication:'投稿済み'}));
 const docFor=url=>{const kind=url.includes('/draftlist/')?'empty':url.includes('/usernovel/list/')?'list':url.includes('/novelinitialsetting/')?'template':url.includes('/noveldataid/')?'episode':url.includes('/updateinput/')?'settings':'work';return {kind,id:url.match(/ncode\/(\d+)/)?.[1],querySelector:s=>s==='.l-container'?{}:null,querySelectorAll:()=>[]};};
 const parser={ownerId:()=>ownerId,safeUrl:u=>u.startsWith(origin)?u:null,pages:()=>[],list:d=>d.kind==='list'?plans:[],main:d=>d.kind==='list'?'全3件中':d.kind==='empty'?'全0件':'本文',metadata:()=>[],links:d=>d.kind==='work'?[{text:'投稿済1',url:plans.find(p=>p.id===d.id).url},{text:'下書き0',url:origin+'/usernovelmanage/top/ncode/'+d.id+'/?filter=draft'},{text:'設定',url:origin+'/usernovelmanage/updateinput/ncode/'+d.id+'/'},{text:'編集',url:origin+'/usernoveldatamanage/updateinput/ncode/'+d.id+'/noveldataid/'+d.id+'/'}]:[],form:d=>[{name:d.kind==='template'?'preface1':d.kind==='episode'?'novel':'title',label:'本文',value:'文章'}],formFields:c=>c.map(f=>({label:f.label,value:f.value}))};
 const context=vm.createContext({findSite,checkpointKey,legacyCheckpointKey,document:{},location:{href:origin+'/user/top/',pathname:'/user/top/'},NarouParser:parser,chrome:{runtime:{sendMessage:async message=>{if(message.type==='saveSnapshot')saved.push(message.snapshot);if(message.type==='checkpoint')checkpoint=structuredClone(message.report);return {ok:true,checkpoint};}}},URL,crypto:webcrypto,Date,Math,AbortController,setTimeout:(fn,ms)=>{if(ms<30000)fn();return 1;},clearTimeout:()=>{},fetch:async url=>{requests.push(url);return {ok:true,url,text:async()=>url};},DOMParser:class{parseFromString(url){return docFor(url);}}});
 vm.runInContext(await readFile(new URL('../sites/narou/bulk.js',import.meta.url),'utf8'),context);
 await context.narouBulkBackup.start({works:true,favorites:false,announcements:false,quiet:true,allWorks:true,workCount:1,excludeWorkIds:['1'],maxPages:30,waitSeconds:5});
 for(let i=0;i<500&&!saved.some(r=>r.category==='取得結果');i++)await new Promise(resolve=>setImmediate(resolve));
 const result=saved.find(r=>r.category==='取得結果');assert.ok(result);assert.equal(result.data.complete,true);
 assert.deepEqual(saved.filter(r=>r.category==='エピソード').map(r=>r.data.workId),['2','3']);
 assert.equal(requests.includes(plans[0].url),false);assert.equal(result.data.scope.first,2);
 saved.length=0;requests.length=0;
 await context.narouBulkBackup.start({works:true,favorites:false,announcements:false,quiet:true,workCount:1,maxPages:6,waitSeconds:5});
 for(let i=0;i<500&&!saved.some(r=>r.category==='取得結果');i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(saved.find(r=>r.category==='取得結果').data.complete,false);

 const beforeResume=requests.length;
 await context.narouBulkBackup.start({resume:true,quiet:true,allWorks:true,excludeWorkIds:['1'],maxPages:30,waitSeconds:5});
 for(let i=0;i<500&&saved.filter(r=>r.category==='取得結果').length<2;i++)await new Promise(resolve=>setImmediate(resolve));
 const resumed=saved.filter(r=>r.category==='取得結果').at(-1);
 assert.equal(resumed.data.complete,true);assert.equal(resumed.data.options.allWorks,true);
 assert.deepEqual(saved.filter(r=>r.category==='エピソード').map(r=>r.data.workId),['1','2','3']);
 assert.equal(requests.slice(beforeResume).includes(plans[0].url),false);
});
test('旧版の取得処理は動作中に置き換えず、停止後は新版に切り替える',async()=>{
 const script=await readFile(new URL('../sites/narou/bulk.js',import.meta.url),'utf8');
 const old={getStatus:()=>({running:true})};const context=vm.createContext({findSite,checkpointKey,legacyCheckpointKey,narouBulkBackup:old});
 assert.throws(()=>vm.runInContext(script,context),/旧版の取得/);assert.equal(context.narouBulkBackup,old);
 old.getStatus=()=>({running:false});vm.runInContext(script,context);
 assert.equal(context.narouBulkBackup.version,'1.1.1-labels');assert.notEqual(context.narouBulkBackup,old);
});


