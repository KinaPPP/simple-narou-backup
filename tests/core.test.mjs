import {findSite,checkpointKey,legacyCheckpointKey} from '../core.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {allowedUrl,backupEntryUrl,validateSnapshot,archiveText} from '../core.mjs';
import {effectivePreference,normalizePreference,preferenceKey} from '../preferences.mjs';
const base=new URL('../',import.meta.url);
test('ユーザーホームのref付きURLと作品一覧を開始場所にできる',()=>{
 for(const url of ['https://syosetu.com/user/top/?ref=header','https://syosetu.com/user/top/','https://syosetu.com/usernovel/list/','https://syosetu.com/usernovel/draftlist/']) assert.equal(backupEntryUrl(url),true);
 for(const url of ['https://syosetu.com/','https://syosetu.com/login/input/','http://syosetu.com/user/top/','https://syosetu.com.evil.test/user/top/'])assert.equal(backupEntryUrl(url),false);
});
test('公式の6文字コード・3改行設定を保持し、作品別設定を優先する',()=>{
 for(const encoding of ['utf-8','utf-16le','utf-16be','shift_jis','euc-jp','jis'])for(const lineEnding of ['crlf','cr','lf']){
  assert.deepEqual(normalizePreference({encoding,bom:false,lineEnding}),{encoding,bom:false,lineEnding});
 }
 const common={encoding:'utf-8',bom:false,lineEnding:'crlf'};
 const individual={encoding:'utf-16le',bom:true,lineEnding:'lf'};
 const data={[preferenceKey('123')]:{settings:common},[preferenceKey('123','45')]:{settings:individual}};
 assert.deepEqual(effectivePreference(data,'123','45'),{settings:individual,source:'作品別'});
 assert.deepEqual(effectivePreference(data,'123','46'),{settings:common,source:'共通'});
 assert.deepEqual(effectivePreference(data,'999','45'),{settings:common,source:'初期値'});
 assert.throws(()=>normalizePreference({encoding:'unknown',bom:false,lineEnding:'lf'}));
 assert.throws(()=>preferenceKey('123:999','45'));
});
test('対象サイトだけを許可し、原稿・空欄・ID・改行を保持する',()=>{
 assert.ok(allowedUrl('https://syosetu.com/usernovel/list/'));
 for(const url of ['http://syosetu.com/','https://syosetu.com.evil.test/','https://ncode.syosetu.com/','https://syosetu.com:99/'])assert.equal(allowedUrl(url),false);
 const value='\n｜星《ほし》\n\n😀💖<script>alert(1)</script>\n';
 const record=validateSnapshot({ownerId:'123',url:'https://syosetu.com/editor/?token=secret',title:'原稿',fields:[{label:'本文',value},{label:'前書き',value:''}],data:{workId:'4'}},'https://syosetu.com/usernovel/list/');
 assert.equal(record.url,'https://syosetu.com/editor/');assert.equal(record.ownerId,'123');assert.equal(record.fields[0].value,value);assert.equal(record.fields[1].value,'');
 assert.ok(archiveText([{...record,savedAt:'2026-10-08'}]).includes(value));
 assert.throws(()=>validateSnapshot({fields:[{label:'x',value:'x'}]},'https://evil.test/'));
});
test('入力欄の抽出でパスワード・CSRF・ボタンを保存しない',async()=>{
 const context=vm.createContext({findSite,checkpointKey,legacyCheckpointKey,URL});
 vm.runInContext(await readFile(new URL('sites/narou/parser.js',base),'utf8'),context);
 const node=(name,type,value,extra={})=>({name,type,value,tagName:type==='textarea'?'TEXTAREA':'INPUT',labels:[],disabled:false,...extra});
 const controls=context.NarouParser.form({querySelectorAll:()=>[
   node('password','password','secret'),node('csrf_token','hidden','token'),node('title','text','同名'),node('novel','textarea','本文\n\n｜星《ほし》😀'),node('preface','textarea',''),node('submit','submit','保存'),node('genre','select-one','201',{tagName:'SELECT',selectedOptions:[{textContent:'ハイファンタジー'}]}),node('isr15','checkbox','1',{checked:true})
 ]});
 assert.ok(!JSON.stringify(controls).includes('secret'));assert.ok(!JSON.stringify(controls).includes('token'));
 assert.equal(controls.length,5);assert.equal(controls[2].value,'');assert.equal(controls[3].selectedText[0],'ハイファンタジー');
 assert.equal(context.NarouParser.safeUrl('/usernovel/list/?p=1','https://syosetu.com/'),'https://syosetu.com/usernovel/list/');
 assert.equal(context.NarouParser.safeUrl('https://evil.test/','https://syosetu.com/'),null);
});
async function worker(){
 const storage={};let listener;
 const chrome={action:{onClicked:{addListener:()=>{}}},runtime:{id:'test',onMessage:{addListener:fn=>listener=fn}},storage:{session:{get:async()=>({})},local:{setAccessLevel:async()=>{},set:async values=>{Object.assign(storage,structuredClone(values));},get:async key=>key?{[key]:storage[key]}:storage}},storageSessionUnused:0,tabs:{onRemoved:{addListener:()=>{}},create:async()=>{}}};
 const context=vm.createContext({findSite,checkpointKey,legacyCheckpointKey,chrome,crypto:webcrypto,validateSnapshot,Date});
 vm.runInContext((await readFile(new URL('background.js',base),'utf8')).replace(/^import[^\n]+\n/gm,''),context);
 const send=(message,sender={id:'test',frameId:0,url:'https://syosetu.com/usernovel/list/',tab:{id:1}})=>new Promise(resolve=>listener(message,sender,resolve));
 return {storage,chrome,send};
}
test('複数タブの同時保存で上書きせず、容量不足をエラーにする',async()=>{
 const {storage,chrome,send}=await worker();const snapshot={title:'同名作品',ownerId:'123',fields:[{label:'本文',value:'原稿'}]};
 const results=await Promise.all([send({type:'saveSnapshot',snapshot}),send({type:'saveSnapshot',snapshot:{...snapshot,fields:[{label:'本文',value:'変更後の原稿'}]}})]);
 assert.ok(results.every(result=>result.ok));assert.equal(Object.keys(storage).length,2);
 const bad=await send({type:'saveSnapshot',snapshot},{id:'test',frameId:0,url:'https://evil.test/',tab:{id:1}});assert.equal(bad.ok,false);
 chrome.storage.local.set=async()=>{throw new Error('QUOTA_BYTES');};
 assert.equal((await send({type:'saveSnapshot',snapshot:{...snapshot,fields:[{label:'本文',value:'別の原稿'}]}})).ok,false);
});
test('取得ページ数で分割し、再開時に取得済み本文を読み直さない',async()=>{
 const {storage,send}=await worker();const origin='https://syosetu.com';
 const workUrl=origin+'/usernovelmanage/top/ncode/1/';
 const settingsUrl=origin+'/usernovelmanage/updateinput/ncode/1/';
 const episodes=[1,2,3].map(id=>origin+'/usernoveldatamanage/updateinput/ncode/1/noveldataid/'+id+'/');
 const plan={id:'1',title:'試験作品',url:workUrl,publication:'投稿済み'};
 const docs={
  [origin+'/usernovel/list/']:{kind:'list'},[origin+'/usernovel/draftlist/']:{kind:'empty'},
  [workUrl]:{kind:'work'},[settingsUrl]:{kind:'settings'},
  [origin+'/novelinitialsetting/updateinput/']:{kind:'template'},
  ...Object.fromEntries(episodes.map((url,index)=>[url,{kind:'episode',index}]))
 };
 const requests=[];
 const element=()=>({style:{},dataset:{},append(){},remove(){},attachShadow(){return element();}});
 const document={createElement:element,documentElement:element(),kind:'list'};
 for(const doc of Object.values(docs)) {doc.querySelector=selector=>selector==='.l-container'?{}:null;doc.querySelectorAll=()=>[];}
 const parser={ownerId:()=> '123',safeUrl:value=>value.startsWith(origin)?value:null,
   list:doc=>doc.kind==='list'?[plan]:[],pages:()=>[],metadata:()=>[{label:'ジャンル',value:'SF'}],
   main:doc=>doc.kind==='list'?'全1件中 1件目～1件目を表示':'作品はありません',
   links:doc=>doc.kind==='work'?[{text:'投稿済3',url:workUrl},{text:'下書き0',url:workUrl+'?filter=draft'},{text:'作品設定',url:settingsUrl},...episodes.map(url=>({text:'編集',url}))]:[{text:'未投稿0',url:origin+'/usernovel/draftlist/'}],
   form:doc=>doc.kind==='episode'?[{name:'novel',label:'本文',value:'本文'+doc.index},{name:'subtitle',label:'タイトル',value:'第'+doc.index+'話'}]:doc.kind==='template'?[{name:'preface1',label:'前書き',value:''}]:[{name:'title',label:'作品タイトル',value:'試験作品'}],
   formFields:controls=>controls.map(c=>({label:c.label,value:c.value}))
 };
 const context=vm.createContext({findSite,checkpointKey,legacyCheckpointKey,document,NarouParser:parser,location:{href:origin+'/user/top/?ref=header',pathname:'/user/top/'},chrome:{runtime:{sendMessage:send}},crypto:webcrypto,URL,AbortController,Date,Math,
  setTimeout:(fn,delay)=>{if(delay<30000)fn();return 1;},clearTimeout:()=>{},
  fetch:async(url)=>{requests.push(url);return {ok:true,url,text:async()=>url};},
  DOMParser:class {parseFromString(url){if(!docs[url])throw new Error('Unknown fixture '+url);return docs[url];}}
 });
 vm.runInContext(await readFile(new URL('sites/narou/bulk.js',base),'utf8'),context);
 const options={works:true,favorites:false,announcements:false,startIndex:1,workCount:1,maxPages:5,waitSeconds:5};
 async function waitDone(){for(let i=0;i<1000;i++){await new Promise(resolve=>setImmediate(resolve));const results=Object.values(storage).filter(value=>value?.category==='取得結果');if(results.length)return results.at(-1); }throw new Error('run timed out');}
 await context.narouBulkBackup.start(options);const first=await waitDone();
 assert.equal(first.data.complete,false);assert.equal(requests.length,5);assert.ok(first.data.failures.some(item=>item.error.includes('上限')));
 const initialResults=Object.keys(storage).length;
 await context.narouBulkBackup.start({...options,resume:true});
 let second;
 for(let i=0;i<1000;i++){await new Promise(resolve=>setImmediate(resolve));const results=Object.values(storage).filter(value=>value?.category==='取得結果');if(results.length>1){second=results.at(-1);break;}}
 assert.ok(second);assert.equal(second.data.complete,true);
 assert.ok(Object.keys(storage).length>initialResults);
 assert.equal(requests.filter(url=>episodes.includes(url)).length,3);
 assert.equal(second.data.works[0].episodeCount,3);
 const data=Object.values(storage).filter(value=>value?.category==='エピソード');assert.equal(data.length,3);
});

