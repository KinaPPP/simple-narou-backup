import {saveOfflineViewer} from './offline-viewer-save.mjs';
import {ArchiveSet} from './archive-set.mjs';
import {writableDirectory,backupName,reserveBase} from './save-directory.mjs';
import {downloadSettings} from './download-settings.mjs';
import {loadBackup,currentArchive} from './library.js';
export function setupArchiveUI({sourceTab,start,refreshCoverage,buttons,viewingArchive=()=>true}){
 const $=id=>document.getElementById(id);let sink=null,locked=false,paused=false,finishing=false,hasStarted=false,writing=Promise.resolve();
 const ui={get locked(){return locked;},get paused(){return paused;},get viewComplete(){return viewingArchive()&&!!currentArchive?.manifest.complete;},get canResume(){return viewingArchive()&&!!currentArchive?.manifest.checkpoint&&!currentArchive.manifest.complete&&!currentArchive.missing.length&&!currentArchive.missingParts?.length&&!currentArchive.integrityErrors?.size;},resume, resumeImported,update};
 async function context(){await sourceTab();const {sourceContext}=await chrome.storage.session.get('sourceContext');return sourceContext;}
 async function message(value){const reply=await chrome.runtime.sendMessage(value);if(!reply?.ok)throw new Error(reply?.error||'保存操作を開始できません。');}
 async function prepare(){const c=await context();const directory=await writableDirectory();await context();const limit=Number($('splitMode').value)||0;const base=await reserveBase(directory,backupName(c.ownerId),true);const settings=await downloadSettings(),viewerName=await saveOfflineViewer(directory,settings);return {c,directory,base,limit,settings,viewerName};}
 async function bind(c){await message({type:'bindArchive',siteId:c.siteId,ownerId:c.ownerId,backupId:sink.manifest.backupId});await chrome.storage.session.remove('archiveInterrupted');}
 function notice(error){$('status').textContent=error.name==='AbortError'?'保存先の選択をキャンセルしました。':error.message;}
 $('quick').onclick=async()=>{if(locked)return;let handle;try{
   // Validate the source before selecting a folder or creating any file.
   hasStarted=false;locked=true;buttons();const {c,directory,base,limit,settings}=await prepare();sink=new ArchiveSet(directory,base,c,settings,{limit,separateOther:true});const local=await chrome.storage.local.get(null);sink.manifest.downloadPreferences=Object.entries(local).filter(([key,value])=>key.startsWith('download-preference:')&&value.ownerId===c.ownerId).map(([,value])=>value);sink.manifest.blogAssociations=Object.fromEntries(Object.entries(local['blog-associations']||{}).filter(([key])=>key.startsWith(c.ownerId+'|')));await sink.init();await bind(c);locked=true;paused=false;
   $('allWorks').checked=true;$('selectedMode').checked=false;for(const id of ['includeBody','includeSettings','includeOther','autoContinue'])$(id).checked=true;$('pace').value='5';$('waitSeconds').value='5';buttons();
   if(!await start(false,true,false,true))throw new Error('取得を開始できませんでした。');hasStarted=true;$('status').textContent='ZIP保存先：'+sink.writer.handle.name+' ／ 書き込み確定済みのページは途中でも確認できます。';
 }catch(error){if(!hasStarted){try{await sink?.discardEmpty();}catch{}locked=false;sink=null;await chrome.runtime.sendMessage({type:'releaseArchive'}).catch(()=>{});}notice(error);buttons();}};
 async function resume(){try{if(!sink||!paused)return;paused=false;buttons();if(!await start(true,false,false,true))throw new Error('再開できませんでした。');}catch(error){paused=true;notice(error);buttons();}}
 async function resumeImported(){if(!ui.canResume)return;hasStarted=false;let started=false;try{
   locked=true;buttons();const {c,directory,base,limit}=await prepare(),archive=currentArchive,m=archive.manifest;
   if(c.ownerId!==m.ownerId||c.siteId!==m.siteId)throw new Error('読み込んだZIPとログイン中のアカウントが一致しません。');
   if(archive.missing.length||archive.missingParts?.length)throw new Error('ZIP内に不足した原稿があります。このファイルからの再開はできません。個別に再取得してください。');
   locked=true;buttons();$('status').textContent='以前の保存分を新しいZIPへコピーしています。';sink=new ArchiveSet(directory,base,c,m.settings,{limit,seed:m,separateOther:true});await sink.init();
   for(const entry of m.records){await sink.add(await archive.record(entry));$('status').textContent='保存分をコピー：'+sink.manifest.records.length+' / '+m.records.length;}
   const report=structuredClone(m.checkpoint);report.options={...report.options,archive:true};report.complete=false;report.autoResumeAt=null;
   await sink.checkpoint(report);await bind(c);await message({type:'importCheckpoint',siteId:c.siteId,ownerId:c.ownerId,report});await refreshCoverage();
   if(!await start(true,false,false,true))throw new Error('取得を再開できませんでした。');hasStarted=true;started=true;paused=false;
 }catch(error){if(!started){sink=null;locked=false;paused=false;await chrome.runtime.sendMessage({type:'releaseArchive'}).catch(()=>{});}notice(error);buttons();}}
 chrome.runtime.onMessage.addListener((value,sender,reply)=>{
   if(value?.type!=='archiveWrite'||sender.id!==chrome.runtime.id||sender.tab)return;
   if(!sink||value.backupId!==sink.manifest.backupId)return;
   const task=writing.then(async()=>{if(value.record)await sink.add(value.record);else if(value.report)await sink.checkpoint(value.report);else throw new Error('ZIP保存情報が不正です。');});writing=task.catch(()=>{});
   task.then(()=>reply({ok:true})).catch(error=>{paused=true;notice(error);reply({ok:false,error:error.message});});return true;
 });
 async function update(state){if(!sink||!hasStarted){if(currentArchive&&viewingArchive()){$('coverageTitle').textContent=currentArchive.integrityErrors?.size?'ZIPに読み取れないデータがあります':currentArchive.manifest.complete?'ZIPからバックアップデータを読み込みました':'途中保存のZIPを読み込みました';$('coverageCount').textContent='ZIP内 '+currentArchive.manifest.records.length+'件 ／ 作品 '+currentArchive.manifest.works.length+'件'+(currentArchive.missingParts?.length?' ／ 分割不足 '+currentArchive.missingParts.map(n=>String(n).padStart(3,'0')).join(', '):'');$('coverageNext').textContent=currentArchive.integrityErrors?.size?'破損の警告を確認してください。このZIPからの取得再開はできません。元のZIPを読み込み直すか、作品を再取得してください。':currentArchive.manifest.complete?'下の欄で内容を確認・コピーできます。表示した項目から破損を確認します。未表示の項目は未検証です。':ui.canResume?'「取得再開」で新しいZIPへ保存済み分をコピーして続けます。':currentArchive.missingParts?.length?'不足する分割ZIPもまとめて読み込むか、作品を個別に再取得してください。':'収録済みの内容を確認・コピーできます。';}return;}
   paused=!state.running&&!state.waiting&&!state.complete;
   $('pace').disabled=locked;
   const m=sink.manifest,cp=m.checkpoint,done=cp?.doneWorks?.length||0,total=cp?.workPlan?.length||m.works.length;
   $('coverageTitle').textContent=state.running?'ZIPへ取得・保存中':state.waiting?'休憩中（自動再開）':state.complete?'ZIPの保存を確認中':'途中までZIPへ保存しました';
   $('coverageCount').textContent='作品 '+done+' / '+total+' ｜ ZIP内 '+m.records.length+'件 ｜ '+sink.writer.handle.name;
   $('coverageNext').textContent='外部の画像・音楽・動画本体は対象外です。挿絵コード・URLは原文に残します。';
   if($('workChoices').dataset.archiveCount!==String(m.works.length)){$('workChoices').replaceChildren();for(const title of ['全部保存',...m.works.map(w=>w.title)]){const button=document.createElement('button');button.textContent=title;button.className='secondary';button.disabled=true;$('workChoices').append(button);}$('workChoices').dataset.archiveCount=String(m.works.length);}
   if(!state.running&&!state.waiting&&state.complete&&!finishing){finishing=true;try{await writing;await sink.finish(true);await message({type:'releaseArchive'});const files=await sink.files();locked=false;paused=false;sink=null;await loadBackup(files);$('status').textContent='ZIPへの保存が終了しました。保存先のファイルを確認してください。';}catch(error){const previous=sink;locked=false;paused=false;sink=null;await chrome.runtime.sendMessage({type:'releaseArchive'}).catch(()=>{});try{if(previous)await loadBackup(await previous.files());}catch{}notice(error);$('status').textContent+=' 保存済みZIPを読み込み、新しい保存先で再開してください。';}finally{finishing=false;buttons();}}
   else if(paused)$('status').textContent='「取得再開」で同じZIPへ続けます。タブを閉じた場合はZIPを読み込み、新しい保存先で再開します。';
 }
 $('pace').onchange=()=>{$('waitSeconds').value=$('pace').value;};
 chrome.storage.session.get(['archiveInterrupted','archiveSink']).then(async data=>{if(data.archiveInterrupted||data.archiveSink){if(data.archiveSink)await message({type:'abandonArchive'});$('status').textContent='前回のZIP取得が中断しました。保存済みZIPを下の欄へ読み込み、「取得再開」を押してください。';}}).catch(notice);
 window.addEventListener('backup-integrity-changed',()=>{if(!locked){update({});buttons();}});
 window.addEventListener('backup-imported',async()=>{await refreshCoverage();if(currentArchive&&!locked){$('status').textContent=currentArchive.integrityErrors?.size?'ZIPに読み取れないデータがあります。下の破損の警告を確認してください。':'ZIPからバックアップデータを読み込みました。下の欄で内容を確認できます。';}if(ui.canResume){$('resume').disabled=false;$('status').textContent='途中のZIPを読み込みました。「取得再開」で新しいZIPへ保存済み分をコピーして続けます。';}});
 return ui;
}
