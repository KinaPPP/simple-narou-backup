import {openArchives} from './archive-set.mjs';
import {openMergedArchives} from './merged-archives.mjs';
import {validRecord,recordIndex} from './archive.mjs';
import {historyEntries} from './archive-view.mjs';
import {getSite} from './sites/registry.mjs';
import {ViewerFiles} from './viewer-files.mjs';
const held=new ViewerFiles(),observedErrors=new Set(),pending=[];
const $=id=>document.getElementById(id);
let archive=null,json=null,groups=[],associations={},generation=0,reading=false;
function normalize(r){return getSite(r.siteId||'narou')?.normalize(r)||r;}
function backupDate(value){const date=new Date(value);return Number.isNaN(date.getTime())?'日時不明':new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date)+'（日本時間）';}
function latest(entries){const map=new Map();for(const e of [...entries].sort((a,b)=>String(a.savedAt).localeCompare(String(b.savedAt))))map.set((e.category||'編集履歴')+'|'+e.url,e);return [...map.values()];}
function inventory(m){return {id:'offline-inventory',ownerId:m.ownerId,siteId:m.siteId,category:'作品一覧',title:'保存した作品一覧',savedAt:m.updatedAt||m.createdAt||'',url:'https://syosetu.com/usernovel/list/',fields:[],data:{entries:m.works}};}
function status(){
 if(!archive)return;
 const a=archive,m=a.manifest,errors=[...a.integrityErrors.values()];for(const error of errors)observedErrors.add(a.fileName+'：'+error);
 $('status').textContent=''+(a.merged?'合成表示 ':'ZIP内 ')+m.records.length+'件 ／ 作品 '+m.works.length+'件 ／ 検証済み '+a.verifiedIds.size+' / '+m.records.length+'件';
 $('warning').textContent=[a.missingParts?.length?'分割不足：'+a.missingParts.map(n=>String(n).padStart(3,'0')).join(', ')+'。不足するZIPを続けてD&Dしてください。数が多い場合は「ZIPのあるフォルダを読み込む」を使えます。':'',a.missing.length?'未取得 '+a.missing.length+'件。':'',observedErrors.size?'読み込み済みZIPの破損・衝突警告：'+[...observedErrors].join(' ／ '):'',...held.warnings].filter(Boolean).join(' ');
}
async function draw(key='',page=0){
 const token=++generation;
 if(!archive){if(!json)return;const list=json.records.map(normalize),owners=[...new Set(list.map(r=>r.ownerId))],inventories=[];
  for(const ownerId of owners){const own=list.filter(r=>r.ownerId===ownerId),allWorks=new Map();for(const r of own){if(r.category==='作品一覧')for(const w of r.data?.entries||[])allWorks.set(String(w.id),w);if(r.category==='作品情報'&&r.data?.id)allWorks.set(String(r.data.id),r.data);}for(const r of own){const id=recordIndex(r).workId;if(id&&!allWorks.has(id))allWorks.set(id,{id,title:'作品ID '+id});}inventories.push(inventory({ownerId,siteId:'narou',works:[...allWorks.values()]}));}list.unshift(...inventories);
  $('records').dataset.activeKey=key;NarouOrganized.render(list,$('records'),{preferences:json.downloadPreferences||[],associations,onAssociation:value=>associations=value});return;
 }
 const a=archive,m=a.manifest;if(!key)key=m.works.length?'work:'+m.works[0].id:'取得履歴';
 const work=key.startsWith('work:')?key.slice(5):null,h=key==='取得履歴'?historyEntries(m.records,page):null;
 const entries=(h?h.entries:latest(m.records)).filter(e=>work?e.workId===work||e.category==='活動報告'&&associations[m.ownerId+'|'+e.url]===work:key==='共通設定'?['テンプレート','カテゴリ'].includes(e.category):key==='取得履歴'?true:e.category===key);
 const loaded=[inventory(m)];for(const e of entries){try{loaded.push(normalize(await a.record(e)));}catch{}}
 if(token!==generation)return;
 $('records').dataset.activeKey=key;NarouOrganized.render(loaded,$('records'),{preferences:m.downloadPreferences||[],associations,onAssociation:value=>associations=value,onSelect:draw});
 if(h&&h.pages>1){const nav=document.createElement('div');nav.className='toolbar';nav.setAttribute('aria-label','取得履歴のページ');const newer=document.createElement('button'),older=document.createElement('button'),label=document.createElement('span');newer.textContent='新しい履歴';older.textContent='古い履歴';newer.className=older.className='secondary';newer.disabled=h.page===0;older.disabled=h.page===h.pages-1;newer.onclick=()=>draw('取得履歴',h.page-1);older.onclick=()=>draw('取得履歴',h.page+1);label.textContent=(h.page+1)+' / '+h.pages+'ページ（1ページ100件）';nav.append(newer,label,older);$('records').prepend(nav);}
 status();
}
async function chooseGroup(){const group=groups[Number($('backup').value)];if(!group)return;archive=await (group.merged?openMergedArchives:openArchives)(group.files);json=null;associations=structuredClone(archive.manifest.blogAssociations||{});delete $('records').dataset.owner;await draw();}
function clear(){
 if(reading)return;++generation;held.clear();observedErrors.clear();archive=null;json=null;groups=[];associations={};$('records').replaceChildren();delete $('records').dataset.owner;$('backup').replaceChildren();$('backup').disabled=true;$('file').value='';$('folderFile').value='';$('importStatus').textContent='読み込みをクリアしました。保存ファイルは変更しません。';$('status').textContent='ZIPを読み込んでください。後から追加できます。';$('warning').textContent='';
}
async function load(files){
 if(reading){const batch=Array.from(files);if(pending.reduce((n,b)=>n+b.length,0)+batch.length<=1000)pending.push(batch);else $('warning').textContent='追加待ちのZIPが多すぎます。読み込みが終わってから追加してください。';return;}reading=true;for(const id of ['file','backup','folder','clear'])$(id).disabled=true;
 try{
  files=Array.from(files);if(!files.length)throw new Error('ZIPまたはJSONを選んでください。');if(files.length>1000)throw new Error('一度に読み込めるファイルは1000個までです。');
  const zips=files.filter(f=>f.name.toLowerCase().endsWith('.zip'));
  if(zips.length){
   const result=await held.add(zips);if(!result.entries.length)throw new Error(result.warnings.join(' ／ '));
   const map=new Map();for(const entry of result.entries){const m=entry.manifest,key=m.siteId+'|'+m.ownerId+'|'+m.backupId;let group=map.get(key);if(!group){group={files:[],date:m.createdAt||'',owner:m.ownerId,site:m.siteId};map.set(key,group);}group.files.push(entry.file);}
   const individual=[...map.values()].sort((a,b)=>b.date.localeCompare(a.date)),accounts=new Map();for(const g of individual){const k=g.site+'|'+g.owner;if(!accounts.has(k))accounts.set(k,{files:[],date:g.date,owner:g.owner,site:g.site,merged:true,sets:0});const account=accounts.get(k);account.files.push(...g.files);account.sets++;}
   groups=[...[...accounts.values()].filter(g=>g.sets>1),...individual];$('backup').replaceChildren();
   groups.forEach((g,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent='ID:'+g.owner+' ／ '+(g.merged?'全バックアップを合成（'+g.sets+'組）':backupDate(g.date))+' ／ ZIP '+g.files.length+'個';$('backup').append(option);});
   await chooseGroup();$('importStatus').textContent='ZIP '+held.entries.size+'個を保持中。追加 '+result.added+'個'+(result.duplicates?' ／ 重複 '+result.duplicates+'個は追加しませんでした。':'。')+' 後から不足ZIPを追加できます。「表示するバックアップ」で合成表示・保存操作ごとの表示を切り替えます。';
  }else{
   if(files.length!==1||!files[0].name.toLowerCase().endsWith('.json'))throw new Error('ZIP、またはJSONを1つ選んでください。');
   if(held.entries.size)throw new Error('ZIPを保持しています。JSONに切り替える場合は「読み込みをクリア」してください。');
   const file=files[0];if(file.size>60*1024*1024)throw new Error('JSONは60MBまでです。大量データはZIPをご利用ください。');const data=JSON.parse((await file.text()).replace(/^\uFEFF/,''));if(!(data.format==='narou-local-backup'&&data.version===1||data.format==='novel-site-backup'&&data.version===2)||!Array.isArray(data.records)||!data.records.every(validRecord)||data.records.some(r=>!getSite(r.siteId||'narou')))throw new Error('このツールで保存したJSONを選んでください。');archive=null;json=data;associations=structuredClone(data.blogAssociations||{});delete $('records').dataset.owner;await draw();$('status').textContent='JSON内 '+data.records.length+'件';$('warning').textContent='';$('importStatus').textContent=file.name+' を読み込みました。';
  }
 }catch(error){$('warning').textContent='読み込みできませんでした：'+error.message+' 読み込み済みのファイルは保持しています。';}
 finally{reading=false;for(const id of ['file','folder','clear'])$(id).disabled=false;$('backup').disabled=!groups.length;$('file').value='';$('folderFile').value='';if(pending.length)void load(pending.shift());}
}
$('clear').onclick=clear;
$('file').onchange=e=>load(e.target.files);
$('backup').onchange=async()=>{if(reading)return;reading=true;$('file').disabled=true;$('backup').disabled=true;$('clear').disabled=true;$('folder').disabled=true;try{await chooseGroup();}catch(error){$('warning').textContent='読み込みできませんでした：'+error.message;$('records').replaceChildren();archive=null;}finally{reading=false;$('file').disabled=false;$('backup').disabled=false;$('clear').disabled=false;$('folder').disabled=false;if(pending.length)void load(pending.shift());}};
$('drop').ondragover=e=>{e.preventDefault();$('drop').classList.add('drag');};$('drop').ondragleave=()=>$('drop').classList.remove('drag');$('drop').ondrop=e=>{e.preventDefault();$('drop').classList.remove('drag');load(e.dataTransfer.files);};
$('folder').onclick=async()=>{try{if(!window.showDirectoryPicker){$('folderFile').click();return;}const directory=await window.showDirectoryPicker({mode:'read'}),files=[];for await(const h of directory.values())if(h.kind==='file'&&h.name.toLowerCase().endsWith('.zip'))files.push(await h.getFile());await load(files);}catch(error){if(error.name!=='AbortError')$('warning').textContent='フォルダを読み込めません：'+error.message+' ZIPをドラッグ＆ドロップしてください。';}};
$('folderFile').onchange=e=>load([...e.target.files].filter(f=>f.name.toLowerCase().endsWith('.zip')&&(!f.webkitRelativePath||f.webkitRelativePath.split('/').length===2)));
$('top').onclick=()=>window.scrollTo({top:0,behavior:'smooth'});
