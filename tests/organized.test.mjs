import {findSite,checkpointKey,legacyCheckpointKey} from '../core.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const script=await readFile(new URL('../sites/narou/organized.js',import.meta.url),'utf8');
class Node {
 constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.text='';this.value='';}
 set textContent(value){this.text=String(value);this.children=[];}
 get textContent(){return this.text+this.children.map(child=>child.textContent).join('');}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];this.text='';}
 setAttribute(key,value){this.attributes[key]=value;}
 addEventListener(type,callback){this['on'+type]=callback;}
 click(){this.onclick?.();}
 focus(){}
}
const context=vm.createContext({findSite,checkpointKey,legacyCheckpointKey,URL,document:{createElement:tag=>new Node(tag)}});
vm.runInContext(script,context);
const ui=context.NarouOrganized;
const record=(category,url,data={},title=category,date='2026-10-08T01:00:00Z',ownerId='123')=>({category,url,data,title,savedAt:date,ownerId,fields:[{label:'本文',value:'<script>原稿</script>\n次行'}]});
const listUrl='https://syosetu.com/usernovel/list/';
const all=[
 record('作品一覧',listUrl,{entries:[{id:'2',title:'二番という題名'},{id:'1',title:'一番という題名'}]}),
 record('作品一覧',listUrl+'?p=2',{entries:[{id:'3',title:'三番'}]}),
 record('作品情報','https://syosetu.com/usernovelmanage/top/ncode/1/',{id:'1',title:'一番更新'}),
 record('エピソード','https://syosetu.com/usernoveldatamanage/updateinput/ncode/2/noveldataid/4/',{workId:'2',order:1},'第2話'),
 record('エピソード','https://syosetu.com/usernoveldatamanage/updateinput/ncode/2/noveldataid/5/',{workId:'2',order:0},'第1話'),
 record('作品設定','https://syosetu.com/usernovelmanage/updateinput/ncode/2/',{workId:'2'}),
 record('活動報告','https://syosetu.com/userblogmanage/updateinput/blogkey/6/',{},'告知'),
 record('作品一覧',listUrl,{entries:[{id:'9',title:'別ユーザー'}]},'別アカウント',undefined,'456'),
 record('作品一覧',listUrl,{entries:[{id:'2',title:'二番という題名'},{id:'1',title:'一番という題名'}]},'再開時再取得','2026-10-08T02:00:00Z'),
];
test('作品は一覧順を維持し、再取得は最新の1件、アカウントを分離する',()=>{
 const model=ui.model(all,'123');
 assert.deepEqual(Array.from(model.works,w=>w.id),['2','1','3']);
 assert.equal(model.works[1].title,'一番更新');
 assert.equal(model.records.filter(r=>r.category==='作品一覧').length,2);
 assert.equal(model.history.length,8);
 assert.deepEqual(Array.from(ui.model(all,'456').works,w=>w.id),['9']);
});
test('作品タブ内で本文→設定→関連告知、未取得表示、関連付け保存を行う',async()=>{
 const root=new Node('main'),associations={};let persisted;
 ui.render(all,root,{associations,onAssociation:value=>{persisted=value;}});
 const tabs=root.children[3],panel=root.children[4];
 assert.deepEqual(tabs.children.slice(0,3).map(n=>n.textContent),['二番という題名','一番更新','三番']);
 assert.ok(panel.textContent.indexOf('第1話')<panel.textContent.indexOf('第2話'));
 assert.ok(panel.textContent.indexOf('第2話')<panel.textContent.indexOf('作品設定・章設定'));
 tabs.children.find(n=>n.textContent==='活動報告').click();
 const row=panel.children[2],picker=row.children[0].children[0];picker.value='2';await picker.onchange();
 assert.equal(persisted[ui.associationKey(all[6])],'2');
 tabs.children[0].click();
 assert.ok(panel.textContent.includes('告知ページ（活動報告） 1件'));
 assert.ok(panel.textContent.indexOf('作品設定・章設定')<panel.textContent.indexOf('告知ページ（活動報告）'));
 const episode=panel.children.find(n=>n.tagName==='details'&&n.textContent.includes('第1話'));episode.open=true;episode.ontoggle();
 assert.equal(episode.children[2].children[1].value,'<script>原稿</script>\n次行');
 tabs.children[2].click();assert.ok(panel.textContent.includes('本文は未取得'));
 assert.equal(tabs.children[2].attributes['aria-selected'],'true');
});

test('別の入口で全設定が一致すれば1件、値・空欄・項目数・作品・状態が違えば別件',()=>{
 const a=record('作品設定','https://syosetu.com/usernovelmanage/updateinput/ncode/2/',{workId:'2'},'自慢');
 a.fields=[{label:'ジャンル',value:'SF'},{label:'前書き',value:''},{label:'本文',value:'一行\n二行'}];
 const b={...a,url:a.url+'?filter=all',savedAt:'2026-10-08T03:00:00Z',fields:[...a.fields].reverse()};
 const result=ui.consolidatedSettings([a,b]);
 assert.equal(result.length,1);assert.equal(result[0].savedAt,b.savedAt);assert.equal(result[0].mergedSources.length,2);
 for(const different of [
  {...b,fields:[...b.fields,{label:'追加項目',value:''}]},
  {...b,fields:b.fields.map(f=>f.label==='前書き'?{...f,value:' '}:f)},
  {...b,fields:b.fields.map(f=>f.label==='本文'?{...f,value:'一行\r\n二行'}:f)},
  {...b,data:{workId:'3'}},
  {...b,ownerId:'456'},
  {...b,category:'章設定'},
 ])assert.equal(ui.consolidatedSettings([a,different]).length,2);
 const checkbox={name:'option',type:'checkbox',value:'1',checked:true,disabled:false};
 const controlled={...a,data:{workId:'2',controls:[checkbox]}};
 assert.equal(ui.consolidatedSettings([controlled,{...b,data:{workId:'2',controls:[{...checkbox,checked:false}]}}]).length,2);
 assert.equal(ui.consolidatedSettings([controlled,{...b,data:{workId:'2',controls:[checkbox]}}]).length,1);
 assert.equal(a.mergedSources,undefined);
});

test('確認画面は同じ設定を1件表示し、取得履歴と異なる本文はそのまま残す',()=>{
 const duplicate={...all[5],url:all[5].url+'?filter=all',savedAt:'2026-10-08T03:00:00Z'};
 const archive=[...all,duplicate],root=new Node('main');ui.render(archive,root);
 const tabs=root.children[3],panel=root.children[4];
 const settings=panel.children.filter(n=>n.tagName==='details'&&n.textContent.startsWith('【作品情報の編集】'));
 assert.equal(settings.length,1);
 const episodes=panel.children.filter(n=>n.tagName==='details'&&n.textContent.startsWith('【エピソード】'));
 assert.equal(episodes.length,2);
 settings[0].open=true;settings[0].ontoggle();assert.ok(settings[0].textContent.includes('同一内容の保存元'));
 tabs.children.find(n=>n.textContent==='取得履歴').click();
 assert.equal(panel.children.filter(n=>n.tagName==='details'&&n.textContent.startsWith('【作品情報の編集】')).length,2);
 assert.equal(archive.length,all.length+1);
});


test('公開・受付設定は項目名と選択文言を表示し、未チェックも省略しない',()=>{
 const controls=[
  {name:'notkansou',type:'radio',label:'受け付ける（ログイン制限あり）',value:'0',checked:false},
  {name:'notkansou',type:'radio',label:'受け付ける（ログイン制限なし）',value:'2',checked:true},
  ...['notreview','notpoint','notreport'].flatMap(name=>[{name,type:'radio',label:'受け付ける',value:'0',checked:true},{name,type:'radio',label:'受け付けない',value:'1',checked:false}]),
  {name:'notpointview',type:'radio',label:'公開する',value:'0',checked:true},
  {name:'notsearch',type:'checkbox',label:'検索や一覧から除外する',value:'1',checked:false},
  {name:'_is_masterpiece',type:'checkbox',label:'マイページに代表作として表示する',value:'1',checked:false},
 ];
 const reception=record('作品設定','https://syosetu.com/usernovelmanage/receptionsupdateinput/ncode/2/',{workId:'2',controls});
 assert.equal(ui.settingTitle(reception),'公開・受付設定');
 assert.equal(ui.settingTitle(all[5]),'作品情報の編集');
 const rows=ui.receptionRows(reception);
 assert.equal(rows.length,7);
 assert.equal(rows.find(row=>row.label==='感想受付').value,'受け付ける（ログイン制限なし）');
 assert.equal(rows.find(row=>row.label==='評価公開').value,'公開する');
 assert.equal(rows.find(row=>row.label==='検索除外設定').value,'設定しない');
 assert.equal(rows.find(row=>row.label==='代表作品設定').value,'設定しない');
 controls.at(-1).checked=true;
 assert.equal(ui.receptionRows(reception).at(-1).value,'マイページに代表作として表示する');
 const root=new Node('main');ui.render([...all,reception],root);
 const panel=root.children[4],card=panel.children.find(n=>n.tagName==='details'&&n.textContent.startsWith('【公開・受付設定】'));
 assert.ok(card);card.open=true;card.ontoggle();
 assert.equal(card.children[1].tagName,'table');
 assert.ok(card.textContent.includes('感想受付受け付ける（ログイン制限なし）'));
 assert.equal(card.children[3].tagName,'details');
 assert.ok(card.children[3].textContent.includes('"value": "2"'));
});

test('作品設定は選択済み名称だけを示し、あらすじ・チェック状態と有効な分類を保持する',()=>{
 const control=(name,type,value,label,other={})=>({name,type,value,label,...other});
 const controls=[
  control('title','text','題名','作品タイトル'),
  control('noveltype','radio','2','作品種別',{checked:true}),
  control('age_limit','radio','1','年齢制限',{checked:true}),
  control('nocgenre','radio','1','ノクターンノベルズ',{checked:true}),
  control('aitype','radio','0','AI利用状況',{checked:true}),
  control('classification','radio','1','オリジナル',{checked:true}),
  control('ff_type','radio','1','二次創作',{checked:true}),
  control('biggenre','select-one','99','大ジャンル',{selectedText:['その他']}),
  control('ex','textarea','一行\r\n\r\n二行','あらすじ'),
  control('iszankoku','checkbox','1','残酷な描写',{checked:false}),
  control('recommend_keyword_array[]','checkbox','日常','日常',{checked:true}),
  control('recommend_keyword_array[]','checkbox','宇宙','宇宙',{checked:false}),
  control('media_support','checkbox','1','希望する',{checked:false}),
  control('is_monetized','checkbox','1','有効にする',{checked:false}),
 ];
 const saved=record('作品設定','https://syosetu.com/usernovelmanage/updateinput/ncode/2/',{workId:'2',controls});
 const rows=ui.workSettingRows(saved),find=label=>rows.find(row=>row.label===label);
 assert.equal(find('作品種別').value,'短編作品');assert.equal(find('年齢制限').value,'全年齢');assert.equal(find('AI利用状況設定').value,'不使用');
 assert.equal(find('大ジャンル').value,'その他');assert.equal(find('あらすじ').value,'一行\r\n\r\n二行');assert.equal(find('あらすじ').multiline,true);
 assert.equal(find('作品に含まれる要素').value,'☐ 残酷な描写');assert.equal(find('キーワード選択').value,'日常');
 assert.equal(find('メディア化打診のサポート').value,'希望しない');assert.equal(find('収益化設定').value,'無効');
 assert.equal(find('二次創作の種類'),undefined);assert.equal(find('R18部門'),undefined);
 const root=new Node('main');ui.render([...all,saved],root);
 const card=root.children[4].children.find(node=>node.tagName==='details'&&node.textContent.startsWith('【作品情報の編集】')&&node.textContent.includes('03:00')===false);
 card.open=true;card.ontoggle();assert.equal(card.children[1].tagName,'table');
});
