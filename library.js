import {saveOfflineViewer} from './offline-viewer-save.mjs';
import {historyEntries} from './archive-view.mjs';
import {belongsToSelection,selectRecords,selectMetadata,selectionWarnings} from './export-selection.mjs';
import {ArchiveSet,openArchives} from './archive-set.mjs';
import {writableDirectory,backupName,reserveBase} from './save-directory.mjs';
import {archiveText} from './core.mjs';
import {renderSiteRecords} from './site-view.mjs';
import {textOutput,validRecord,recordIndex} from './archive.mjs';
import {downloadSettings,setupDownloadSettings} from './download-settings.mjs';
const $=id=>document.getElementById(id==='status'&&document.getElementById('libraryStatus')?'libraryStatus':id);
let records=[],downloadPreferences=[],associations={},importedJSON=null;
export let currentArchive=null;
export function importedRecords(){return importedJSON?.records||null;}
let renderGeneration=0,selectedKey='';
export async function refresh(){
 try{currentArchive=null;importedJSON=null;selectedKey='';++renderGeneration;if($('importStatus'))$('importStatus').textContent='';if($('file'))$('file').value='';const data=await chrome.storage.local.get(null);associations=data['blog-associations']||{};downloadPreferences=Object.entries(data).filter(([k])=>k.startsWith('download-preference:')).map(([,v])=>v);records=Object.entries(data).filter(([k])=>k.startsWith('snapshot:')).map(([,v])=>v).sort((a,b)=>a.savedAt.localeCompare(b.savedAt));const bytes=await chrome.storage.local.getBytesInUse(null);$('status').textContent=records.length+'件の履歴 ／ 約'+(bytes/1048576).toFixed(2)+'MB（Chrome内の記録）';await draw();}catch(error){$('status').textContent='読み取りに失敗しました。'+error.message;}
}
function summaryRecord(m){return {id:'zip-inventory',ownerId:m.ownerId,siteId:m.siteId,category:'作品一覧',title:'ZIP内の作品一覧',savedAt:m.updatedAt||m.createdAt,url:'https://syosetu.com/usernovel/list/',fields:[{label:'作品一覧',value:''}],data:{entries:m.works}};}
function latest(entries){const map=new Map();for(const e of entries)map.set(e.category+'|'+e.url,e);return [...map.values()];}
async function draw(key=selectedKey,historyPage=0){
 const generation=++renderGeneration;selectedKey=key;
 if(currentArchive){const archive=currentArchive,m=archive.manifest;
   if(!key)key=m.works.length?'work:'+m.works[0].id:'ブックマーク';selectedKey=key;
   const work=key.startsWith('work:')?key.slice(5):null;
   const history=key==='取得履歴'?historyEntries(m.records,historyPage):null;
   let entries=(history?history.entries:latest(m.records)).filter(e=>work?e.workId===work||e.category==='活動報告'&&associations[m.ownerId+'|'+e.url]===work:key==='共通設定'?e.category==='テンプレート'||e.category==='カテゴリ':key==='取得履歴'?true:e.category===key);
   
   const loaded=[summaryRecord(m)];for(const entry of entries){try{loaded.push(await archive.record(entry));}catch(error){/* archive.record retains the integrity failure for every subsequent view. */}}
   if(generation!==renderGeneration)return;records=loaded;$('records').dataset.activeKey=key;
   await renderSiteRecords(records,$('records'),{preferences:downloadPreferences,associations,onAssociation:value=>{associations=value;},onSelect:draw});
   if(history&&history.pages>1){
    const nav=document.createElement('div');nav.className='toolbar';nav.setAttribute('aria-label','取得履歴のページ');
    const newer=document.createElement('button'),older=document.createElement('button'),label=document.createElement('span');
    newer.textContent='新しい履歴';older.textContent='古い履歴';newer.className=older.className='secondary';
    newer.disabled=history.page===0;older.disabled=history.page===history.pages-1;
    newer.onclick=()=>draw('取得履歴',history.page-1);older.onclick=()=>draw('取得履歴',history.page+1);
    label.textContent=(history.page+1)+' / '+history.pages+'ページ（1ページ100件）';nav.append(newer,label,older);$('records').prepend(nav);
   }

   $('status').textContent='ZIP内 '+m.records.length+'件 ／ 表示 '+Math.max(0,loaded.length-1)+'件'+(m.complete?' ／ 取得完了の記録':' ／ 途中保存')+(history?'（履歴 '+(history.page+1)+' / '+history.pages+'ページ）':'')+' ／ 検証済み '+(archive.verifiedIds?.size||0)+' / '+m.records.length+'件'+(archive.integrityErrors?.size?' ／ 未取得・破損 '+archive.integrityErrors.size+'件：'+[...archive.integrityErrors.values()][0]:'');
   window.dispatchEvent(new CustomEvent('backup-integrity-changed'));
 }else await renderSiteRecords(records,$('records'),{preferences:downloadPreferences,associations,onAssociation:async value=>{associations=value;if(!importedJSON)await chrome.storage.local.set({'blog-associations':value});}});
 $('json').disabled=!records.length&&!downloadPreferences.length;$('txt').disabled=!records.length;
}
export async function loadBackup(value){
 const files=Array.isArray(value)?value:[value],file=files[0];if(!file)return;if($('importStatus'))$('importStatus').textContent='ファイルを読み込んでいます。';
 if(files.some(f=>!f.name.toLowerCase().endsWith('.zip'))&&files.length>1){if($('importStatus'))$('importStatus').textContent='複数選択は同じバックアップのZIPのみ対応しています。';throw new Error('複数選択は同じバックアップのZIPのみ対応しています。');}
 try{if(file.name.toLowerCase().endsWith('.zip')){const archive=await openArchives(files);currentArchive=archive;importedJSON=null;associations=archive.manifest.blogAssociations||{};downloadPreferences=archive.manifest.downloadPreferences||[];selectedKey='';await draw();if($('importStatus'))$('importStatus').textContent=files.length+'個のZIP ／ '+(archive.missingParts?.length?'分割不足：'+archive.missingParts.map(n=>String(n).padStart(3,'0')).join(', ')+'（ある原稿は確認できます）':archive.missing.length?'不足 '+archive.missing.length+'件':archive.integrityErrors?.size?'未取得・破損 '+archive.integrityErrors.size+'件（このZIPからの再開はできません）':archive.manifest.complete?'取得完了のZIP':archive.manifest.checkpoint?'途中保存のZIP。取得再開ができます。':archive.manifest.archiveSet?'分割ZIPの一部。後続のZIPもまとめて読み込んでください。':'履歴を書き出したZIP（取得の再開情報なし）');}
 else{if(file.size>60*1024*1024)throw new Error('JSONは60MBまでです。大量データは単一ZIPをご利用ください。');const data=JSON.parse((await file.text()).replace(/^\uFEFF/,''));if(!(data.format==='narou-local-backup'&&data.version===1||data.format==='novel-site-backup'&&data.version===2)||!Array.isArray(data.records)||!data.records.every(validRecord))throw new Error('この拡張機能で保存したJSONを選んでください。');currentArchive=null;importedJSON=data;records=data.records;downloadPreferences=data.downloadPreferences||[];associations=data.blogAssociations||{};await draw();if($('importStatus'))$('importStatus').textContent=file.name+' ／ '+records.length+'件（ファイルを表示中。Chrome内の履歴へは追加しません）';}
 window.dispatchEvent(new Event('backup-imported'));
 }catch(error){if($('importStatus'))$('importStatus').textContent='読み込みできませんでした：'+error.message;else $('status').textContent=error.message;throw error;}
}
async function exportScope(){
 if(!document.getElementById('allWorks')||document.getElementById('allWorks').checked)return null;
 const option=document.getElementById('selectedWorks').selectedOptions[0];
 if(!option)throw new Error('保存する作品を選んでください。');
 const {sourceContext}=await chrome.storage.session.get('sourceContext');
 if(!sourceContext?.ownerId)throw new Error('対象のアカウントを確認してください。');
 return {siteId:sourceContext.siteId||'narou',ownerId:sourceContext.ownerId,workId:option.value,title:option.textContent};
}
async function allRecords(scope=null){if(currentArchive){const result=[];try{for(const entry of currentArchive.manifest.records.filter(e=>belongsToSelection(e,scope,associations)))result.push(await currentArchive.record(entry));return result;}finally{window.dispatchEvent(new CustomEvent('backup-integrity-changed'));}}if(!importedJSON){const data=await chrome.storage.local.get(null);records=Object.entries(data).filter(([key])=>key.startsWith('snapshot:')).map(([,value])=>value).sort((a,b)=>a.savedAt.localeCompare(b.savedAt));}return selectRecords(records,scope,associations);}
function exportMessage(message,warnings=[]){const text=[message,...warnings].join(' ');$('status').textContent=text;if($('exportStatus'))$('exportStatus').textContent=text;}
function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function download(format){try{if(currentArchive&&currentArchive.fileSize>60*1024*1024)throw new Error('大きなZIPはZIPのまま保管してください。');const scope=await exportScope(),list=await allRecords(scope);const metadata=selectMetadata(downloadPreferences,associations,scope),warnings=selectionWarnings(currentArchive?.manifest.records||records.map(recordIndex),scope);if(!list.length)throw new Error(['選択した対象の保存データがありません。',...warnings].join(' '));const settings=await downloadSettings();const content=format==='json'?(settings.bom?'\uFEFF':'')+JSON.stringify({format:'novel-site-backup',version:2,exportedAt:new Date().toISOString(),records:list,downloadPreferences:metadata.preferences,blogAssociations:metadata.associations,exportWarnings:warnings},null,2):textOutput(list,settings);saveBlob(new Blob([content]),backupName(list[0]?.ownerId)+'.'+format);exportMessage('保存を要求しました。ダウンロード先のファイルを確認してください。',warnings);}catch(error){exportMessage(error.message);}}
$('json').onclick=()=>download('json');$('txt').onclick=()=>download('txt');$('refresh').onclick=async()=>{await refresh();document.getElementById('saved')?.scrollIntoView({behavior:'smooth',block:'start'});if($('importStatus'))$('importStatus').textContent='ブラウザ内のデータを表示中です。';window.dispatchEvent(new Event('backup-library-view'));};
if($('downloadDialog'))setupDownloadSettings();else $('settings').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('settings.html')});
if($('zipExport'))$('zipExport').onclick=async()=>{
 window.dispatchEvent(new CustomEvent('library-writing',{detail:true}));
 try{
  const scope=await exportScope(),archive=currentArchive,m=archive?.manifest;
  const metadata=selectMetadata(downloadPreferences,associations,scope);
  const withOther=!!document.getElementById('includeOther')?.checked,other=e=>withOther&&scope&&e.ownerId===scope.ownerId&&(e.siteId||'narou')===scope.siteId&&['ブックマーク','お気に入りユーザ','活動報告','テンプレート','カテゴリ'].includes(e.category);
  const entries=archive?m.records.filter(e=>belongsToSelection(e,scope,associations)||other(e)):null;
  const list=archive?null:(scope&&withOther?(await allRecords(null)).filter(r=>belongsToSelection(recordIndex(r),scope,associations)||other(r)):await allRecords(scope));
  if(scope&&!(entries?.some(e=>belongsToSelection(e,scope,associations))||list?.some(r=>belongsToSelection(recordIndex(r),scope,associations))))throw new Error('選択した作品の保存データがありません。作品を取得してから保存してください。');
  const warnings=selectionWarnings(m?.records||records.map(recordIndex),scope);
  const c=scope?{siteId:scope.siteId,ownerId:scope.ownerId}:archive?{siteId:m.siteId,ownerId:m.ownerId}:{siteId:list[0]?.siteId||'narou',ownerId:list[0]?.ownerId};
  if(!(entries?.length||list?.length)||!c.ownerId)throw new Error(['選択した対象の保存データがありません。',...warnings].join(' '));
  if(list?.some(r=>r.ownerId!==c.ownerId||(r.siteId||'narou')!==c.siteId))throw new Error('ZIP保存は1アカウントずつ行ってください。');
  const directory=await writableDirectory(),settings=await downloadSettings();
  const viewerName=await saveOfflineViewer(directory,settings);
  const limit=Number(document.getElementById('splitMode')?.value)||0,base=await reserveBase(directory,backupName(c.ownerId),true);
  const seed=m?{...m,works:scope?m.works.filter(w=>String(w.id)===scope.workId):m.works}:undefined;
  const sink=new ArchiveSet(directory,base,c,settings,{limit,seed,separateOther:true});
  if(scope&&!seed){sink.manifest.works=[{id:scope.workId,title:scope.title}];}
  sink.manifest.exportWarnings=warnings;sink.manifest.blogAssociations=metadata.associations;sink.manifest.downloadPreferences=metadata.preferences;
  await sink.init();
  if(archive){for(const entry of entries)await sink.add(await archive.record(entry));}else for(const record of list)await sink.add(record);
  if(!scope&&m?.checkpoint&&!archive.missingParts?.length&&!archive.missing.length)await sink.checkpoint(m.checkpoint);
  await sink.finish(!scope&&m?m.complete:false);
  exportMessage('ZIPへ保存しました：'+base+' ／ '+sink.parts.length+'ファイル'+(viewerName?' ／ ビューアー：'+viewerName:'')+(scope?'（選択した作品の履歴。取得の再開情報なし）':m?'':'（既存履歴の書き出し。取得の完了判定は含みません）'),warnings);
 }catch(error){exportMessage(error.name==='AbortError'?'保存先の選択をキャンセルしました。':error.message);}
 finally{window.dispatchEvent(new CustomEvent('library-writing',{detail:false}));}
};
if($('file')){$('file').onchange=e=>loadBackup([...e.target.files]).catch(()=>{});$('drop').ondragover=e=>{e.preventDefault();$('drop').classList.add('drag');};$('drop').ondragleave=()=>$('drop').classList.remove('drag');$('drop').ondrop=e=>{e.preventDefault();if($('file').disabled){$('importStatus').textContent='取得中はファイルを読み込めません。取得終了後、または詳細タブを開き直して読み込んでください。';return;}$('drop').classList.remove('drag');loadBackup([...e.dataTransfer.files]).catch(()=>{});};}
if(document.getElementById('libraryStatus')){let timer;chrome.storage.onChanged.addListener((changes,area)=>{if(!currentArchive&&!importedJSON&&area==='local'&&Object.keys(changes).some(k=>k.startsWith('snapshot:'))){clearTimeout(timer);timer=setTimeout(()=>{if(!document.querySelector('#records details[open]'))refresh();},700);}});}
refresh();

