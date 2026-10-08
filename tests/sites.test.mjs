import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {findSite,checkpointKey,legacyCheckpointKey,validateSnapshot} from '../core.mjs';
import {siteUnits} from '../sites/registry.mjs';
import {backupState} from '../backup-state.mjs';
test('登録済みの管理サイトだけを認識し、未実装サイトを対応済みにしない',()=>{
 assert.equal(siteUnits.length,1);assert.equal(findSite('https://syosetu.com/user/top/?ref=header').id,'narou');
 for(const url of ['https://kakuyomu.jp/','https://syosetu.com.evil.test/','http://syosetu.com/','https://secret:password@syosetu.com/'])assert.equal(findSite(url),null);
 assert.equal(checkpointKey('narou','123'),'checkpoint:narou:123');assert.equal(legacyCheckpointKey('narou','123'),'checkpoint:123');assert.equal(legacyCheckpointKey('other','123'),null);
});
test('旧形式のなろう原稿も共通形式の識別子を付け、本文を複製せず保持する',()=>{
 const snapshot={title:'試験作品',ownerId:'123',category:'エピソード',fields:[{label:'本文',value:'本文\n\n｜星《ほし》'}],data:{workId:'4'}};
 const record=validateSnapshot(snapshot,'https://syosetu.com/usernoveldatamanage/updateinput/ncode/4/noveldataid/56/');
 assert.equal(record.siteId,'narou');assert.equal(record.schemaVersion,2);assert.equal(record.kind,'episode');assert.deepEqual(record.entity,{workId:'4',id:'56'});assert.deepEqual(record.fields,snapshot.fields);
 assert.throws(()=>validateSnapshot({...snapshot,siteId:'other'},'https://syosetu.com/user/top/'),/一致/);
});
test('同じユーザーIDでも別サイトの取得結果を混ぜない',()=>{
 const data={ownerId:'123',workPlan:[{id:'1',title:'作品1'}],scope:{totalWorks:1},doneWorks:['1'],complete:true,options:{works:true,favorites:true,announcements:true}};
 const records=['narou','future-site'].map(siteId=>({siteId,ownerId:'123',category:'取得結果',savedAt:'1',data:{...data,siteId,workPlan:siteId==='narou'?data.workPlan:[{id:'2',title:'別サイト作品'}],doneWorks:siteId==='narou'?['1']:['2']}}));
 assert.deepEqual(backupState(records,null,'123').doneIds,['1']);
 assert.deepEqual(backupState(records,null,'123',{siteId:'future-site'}).doneIds,['2']);
});
test('なろうユニットが共通呼出契約へ橋渡しする',async()=>{
 let options;const context=vm.createContext({NarouParser:{ownerId:()=> '123'},narouBulkBackup:{start:value=>{options=value;return {ok:true};},getStatus:()=>({running:true}),stop:()=> 'paused'},narouLocalBackup:{fields:()=> ['本文'],start:()=> 'started'}});
 vm.runInContext(await readFile(new URL('../sites/narou/runtime.js',import.meta.url),'utf8'),context);
 const unit=context.NovelSiteUnit;assert.equal(unit.account({querySelectorAll:()=>[]}).siteId,'narou');assert.equal(unit.account({querySelectorAll:()=>[]}).ownerId,'123');
 assert.equal(unit.startCollection({allWorks:true}).ok,true);assert.equal(options.allWorks,true);assert.equal(unit.collectionStatus().running,true);assert.equal(unit.pauseCollection(),'paused');assert.deepEqual(unit.editFields(),['本文']);
});
