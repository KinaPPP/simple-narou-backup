import {findSite,checkpointKey,legacyCheckpointKey} from '../core.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {allowedUrl,validateSnapshot} from '../core.mjs';
const base=new URL('../',import.meta.url);
test('アイコンの取得元を保持して詳細タブを再利用し、閉じた後も開き直せる',async()=>{
 const session={},tabs=new Map(),created=[],updates=[];let click;
 const chrome={action:{onClicked:{addListener:fn=>click=fn}},runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,onMessage:{addListener:()=>{}}},
  storage:{local:{setAccessLevel:async()=>{}},session:{get:async key=>({[key]:session[key]}),set:async data=>Object.assign(session,structuredClone(data))}},
  scripting:{executeScript:async args=>args.files?[]:[{result:{ownerId:'123',userName:'作者'}}]},
  tabs:{onRemoved:{addListener:()=>{}},get:async id=>{if(!tabs.has(id))throw new Error('closed');return tabs.get(id);},update:async(id,options)=>updates.push({id,...options}),create:async options=>{const tab={id:100+created.length,url:options.url};tabs.set(tab.id,tab);created.push(tab);return tab;}}};
 const context=vm.createContext({findSite,checkpointKey,legacyCheckpointKey,chrome,allowedUrl,validateSnapshot,crypto:globalThis.crypto});
 vm.runInContext((await readFile(new URL('background.js',base),'utf8')).replace(/^import[^\n]+\n/gm,''),context);
 assert.equal(typeof click,'function');
 await Promise.all([context.openDetail({id:7,url:'https://syosetu.com/user/top/?ref=header'}),context.openDetail({id:7,url:'https://syosetu.com/user/top/?ref=header'})]);
 assert.equal(created.length,1);assert.equal(updates.length,1);assert.equal(session.sourceContext.tabId,7);assert.equal(session.sourceContext.ownerId,'123');
 await context.openDetail({id:100,url:'chrome-extension://test/detail.html'});
 assert.equal(session.sourceContext.tabId,7);assert.equal(created.length,1);
 tabs.delete(100);await context.openDetail();assert.equal(created.length,2);assert.equal(session.sourceContext.tabId,7);
});
test('詳細ページの操作は前景タブではなく取得元を使い、ポップアップ設定を外す',async()=>{
 const manifest=JSON.parse((await readFile(new URL('manifest.json',base),'utf8')).replace(/^\uFEFF/,''));
 assert.equal(manifest.action.default_popup,undefined);
 const detail=await readFile(new URL('detail.js',base),'utf8');
 assert.ok(detail.includes('chrome.tabs.get(sourceContext.tabId)'));
 assert.equal(detail.includes('chrome.tabs.query'),false);
 assert.ok(detail.includes('result.result!==sourceContext.ownerId'));
 assert.ok(detail.includes('quiet:true'));
 const html=await readFile(new URL('detail.html',base),'utf8');
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(new Set(ids).size,ids.length);
 for(const id of ['bulk','resume','gauge','stop','account','json','txt','records','libraryStatus'])assert.ok(ids.includes(id));
});
