import {findSite,checkpointKey,legacyCheckpointKey} from '../core.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {allowedUrl,backupEntryUrl} from '../core.mjs';
import {backupState} from '../backup-state.mjs';
const base=new URL('../',import.meta.url);
test('取得元からの状態だけを受け、アイコンの色と表示を切り替える',async()=>{
 let listener;const values={};
 const chrome={tabs:{onRemoved:{addListener:()=>{}}},runtime:{id:'test',onMessage:{addListener:f=>listener=f}},storage:{local:{setAccessLevel:async()=>{}},session:{get:async()=>({sourceContext:{tabId:7,ownerId:'123'}})}},action:{onClicked:{addListener:()=>{}},setBadgeBackgroundColor:async v=>values.color=v.color,setBadgeText:async v=>values.text=v.text,setTitle:async v=>values.title=v.title}};
 const ctx=vm.createContext({findSite,checkpointKey,legacyCheckpointKey,chrome,allowedUrl});vm.runInContext((await readFile(new URL('background.js',base),'utf8')).replace(/^import[^\n]+\n/gm,''),ctx);
 const sender={id:'test',frameId:0,url:'https://syosetu.com/user/top/',tab:{id:7}};
 for(const [state,text,color] of [['running','取得','#4a8ce0'],['waiting','待機','#4a8ce0'],['complete','済','#28a745'],['error','!','#b8860b']]){
  listener({type:'backupStatus',ownerId:'123',state,message:'試験'},sender,()=>{});await new Promise(r=>setImmediate(r));assert.equal(values.text,text);assert.equal(values.color,color);
 }
 listener({type:'backupStatus',ownerId:'123',state:'complete'},{...sender,tab:{id:8}},()=>{});await new Promise(r=>setImmediate(r));assert.equal(values.text,'!');
});
test('詳細画面でボタンは常設され、休憩中は操作を無効化し、一時停止だけを有効にする',async()=>{
 const html=await readFile(new URL('detail.html',base),'utf8'),nodes=new Map();
 class Node{constructor(){this.children=[];this.checked=false;this.hidden=false;this.value='';}append(n){this.children.push(n);}replaceChildren(){this.children=[];}get selectedOptions(){return this.children.filter(n=>n.selected);}setAttribute(){}get options(){return this.children;}removeAttribute(name){delete this[name];}}
 for(const [,id] of html.matchAll(/id="([^"]+)"/g))nodes.set(id,new Node());
 for(const id of ['allWorks','includeBody','includeSettings','includeOther','autoContinue'])nodes.get(id).checked=true;
 const record={ownerId:'123',category:'作品一覧',savedAt:'1',data:{entries:[{id:'1',title:'一つ目'},{id:'2',title:'二つ目'}]}};
 let state=null;const sourceContext={tabId:7,ownerId:'123',url:'https://syosetu.com/user/top/'};
 const chrome={storage:{session:{get:async()=>({sourceContext})},local:{get:async()=>({'snapshot:1':record})},onChanged:{addListener:()=>{}}},tabs:{get:async()=>({id:7,url:sourceContext.url})},scripting:{executeScript:async args=>args.files?[]:args.func.toString().includes('account(document).ownerId')?[{result:'123'}]:[{result:state}]}};
 const ctx=vm.createContext({window:{addEventListener:()=>{}},currentArchive:null,importedRecords:()=>null,refreshLibrary:async()=>{},setupArchiveUI:()=>({locked:false,canResume:false,update:async()=>{}}),findSite,checkpointKey,legacyCheckpointKey,chrome,document:{getElementById:id=>nodes.get(id),createElement:()=>new Node()},backupState,allowedUrl,backupEntryUrl,Date,setTimeout,clearTimeout,setInterval:()=>{},normalizePreference:()=>{},preferenceKey:()=>{}});
 vm.runInContext((await readFile(new URL('detail.js',base),'utf8')).replace(/^import[^\n]+\n/gm,''),ctx);await new Promise(r=>setImmediate(r));
 assert.equal(nodes.get('bulk').disabled,false);assert.equal(nodes.get('resume').disabled,true);assert.equal(nodes.get('selectedWorks').children.length,2);
 state={ownerId:'123',running:false,waiting:true,resumeAt:Date.now()+90000};await ctx.progress();
 for(const id of ['bulk','resume','fresh','inventory']){assert.equal(nodes.get(id).disabled,true);assert.equal(nodes.get(id).hidden,false);}
 assert.equal(nodes.get('stop').disabled,false);assert.match(nodes.get('progressText').textContent,/自動再開まで/);
 state={ownerId:'123',running:false,waiting:false,phase:'error',message:'HTTP 503'};await ctx.progress();assert.equal(nodes.get('progressText').textContent,'HTTP 503');assert.equal(nodes.get('stop').disabled,true);
});
