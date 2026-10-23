import {setupReportUI} from './report-ui.mjs';
import {recordDiagnostic} from './diagnostic-client.mjs';
import {belongsToSelection} from './export-selection.mjs';
import {acquisitionActive} from './acquisition-state.mjs';
import {gaugeState} from './progress-state.mjs';
import {setupArchiveUI} from './zip-ui.mjs';
import {currentArchive,importedRecords,exportEntries,refresh as refreshLibrary} from './library.js';
import {allowedUrl,backupEntryUrl,findSite,checkpointKey,legacyCheckpointKey} from './core.mjs';
import {normalizePreference,preferenceKey} from './preferences.mjs';
import {backupState} from './backup-state.mjs';
const $ = id => document.getElementById(id);
let tabId;
let pageUrl;
let coverageState;let coverageOwner='';
let busy=false;let starting=false;let libraryWriting=false;
const inventoryAttempted=new Set();
let restoredRun;
let activeSiteId='narou';
let archiveUI;
let sourceAvailable=false;let inventoryFromSite=false;
window.addEventListener('backup-imported',()=>{inventoryFromSite=false;});
window.addEventListener('backup-library-view',()=>{inventoryFromSite=true;refreshCoverage();});
function requirements(){return {siteId:activeSiteId,includeBody:$('includeBody').checked,includeSettings:$('includeSettings').checked,includeOther:$('includeOther').checked,selectedWorkIds:$('allWorks').checked?null:[...$('selectedWorks').selectedOptions].map(option=>option.value)};}
window.addEventListener('library-writing',e=>{libraryWriting=e.detail;buttons();});
window.addEventListener('library-data-changed',()=>buttons());
function buttons(){
  if(libraryWriting){for(const id of ['bulk','resume','fresh','inventory','quick','stop','settings','json','txt','zipExport','refresh','file','splitMode','resetData'])$(id).disabled=true;return;}
  if(archiveUI?.locked){for(const id of ['bulk','fresh','inventory','quick','includeBody','includeSettings','includeOther','autoContinue','maxPages','waitSeconds','settings','json','txt','zipExport','refresh','file','splitMode','resetData'])$(id).disabled=true;$('resume').disabled=busy||!archiveUI.paused;$('stop').disabled=!busy;for(const button of $('workChoices').children)button.disabled=true;return;}
  for(const id of ['quick','settings','zipExport','file','refresh'])$(id).disabled=false;
  for(const id of ['settings','zipExport','file','refresh','splitMode','resetData'])$(id).disabled=busy;
  $('resetData').disabled=busy;
  $('quick').disabled=!sourceAvailable||busy||!!coverageState?.pending;
  const work=$('allWorks').checked?null:[...$('selectedWorks').selectedOptions][0]?.value;
  const scope=work?{ownerId:coverageOwner,siteId:activeSiteId,workId:work}:null;
  const available=exportEntries().some(e=>scope?belongsToSelection(e,scope):true)&&($('allWorks').checked||!!work);
  for(const id of ['json','txt','zipExport'])$(id).disabled=busy||!available;
  $('availabilityStatus').textContent=busy?'':available?'':'保存するデータがありません。取得するか、ZIP・JSONを読み込んでください。';
  const canContinue=coverageState?.pending||coverageState?.completed.length>0&&!coverageState?.allComplete;
  $('resume').disabled=!sourceAvailable||busy||(currentArchive&&!inventoryFromSite?!archiveUI?.canResume:!(canContinue||archiveUI?.canResume));
  $('pace').disabled=busy;
  $('bulk').disabled=!sourceAvailable||busy||!!coverageState?.pending||!coverageState?.inventoryKnown||!!coverageState?.allComplete;
  $('fresh').disabled=!sourceAvailable||busy||!coverageState?.inventoryKnown;
  $('inventory').disabled=!sourceAvailable||busy||!!coverageState?.pending;
  for(const id of ['allWorks','selectedMode','includeBody','includeSettings','includeOther'])$(id).disabled=busy||!!coverageState?.pending;
  $('selectedWorks').disabled=busy||!!coverageState?.pending||$('allWorks').checked;
  for(const button of $('workChoices').children)button.disabled=busy||!!coverageState?.pending;
  for(const id of ['autoContinue','maxPages','waitSeconds'])$(id).disabled=busy;
}
async function refreshCoverage(){
  const {sourceContext}=await chrome.storage.session.get('sourceContext');
  coverageOwner=sourceContext?.ownerId||currentArchive?.manifest.ownerId||importedRecords()?.[0]?.ownerId||'';
  const all=await chrome.storage.local.get(null);
  const changed=Object.entries(all).filter(([key,v])=>key.startsWith('settings-schema:'+activeSiteId+':'+coverageOwner+':')&&v?.warning&&v?.items);
  $('schemaStatus').textContent=changed.length?'設定項目の構成が前回と異なります。設定を含めて再取得し、内容を確認してください。':'';
  let records=Object.entries(all).filter(([key])=>key.startsWith('snapshot:')).map(([,value])=>value);
  const unit=findSite(sourceContext?.url);
  activeSiteId=unit?.id||'narou';
  let checkpoint=unit&&sourceContext?.ownerId?(all[checkpointKey(unit.id,sourceContext.ownerId)]||all[legacyCheckpointKey(unit.id,sourceContext.ownerId)]):null;
  if(!inventoryFromSite&&!archiveUI?.locked&&currentArchive?.manifest.ownerId===sourceContext?.ownerId){const m=currentArchive.manifest;checkpoint=m.checkpoint?{...m.checkpoint,complete:!!m.complete}:null;records=[{ownerId:m.ownerId,category:'作品一覧',savedAt:m.updatedAt,data:{entries:m.works}},...(checkpoint?[{ownerId:m.ownerId,category:'取得結果',savedAt:m.updatedAt,data:checkpoint}]:[])];}
  else if(!inventoryFromSite&&!archiveUI?.locked&&importedRecords()){records=importedRecords();checkpoint=null;}
  if(checkpoint&&!checkpoint.complete&&!checkpoint.options?.inventoryOnly&&restoredRun!==checkpoint.runId){
    restoredRun=checkpoint.runId;
    $('includeBody').checked=checkpoint.options?.includeBody!==false;
    $('includeSettings').checked=checkpoint.options?.includeSettings!==false;
    $('includeOther').checked=!!(checkpoint.options?.favorites||checkpoint.options?.announcements);
    $('allWorks').checked=!checkpoint.options?.selectedWorkIds;
    $('selectedMode').checked=!$('allWorks').checked;
    $('autoContinue').checked=checkpoint.options?.autoContinue!==false;
  }
  coverageState=backupState(records,checkpoint,sourceContext?.ownerId,requirements());
  const selection=checkpoint&&!checkpoint.complete&&checkpoint.options?.selectedWorkIds||[...$('selectedWorks').selectedOptions].map(option=>option.value);
  const list=$('selectedWorks');list.replaceChildren();
  for(const work of coverageState.works){const option=document.createElement('option');option.value=String(work.id);option.textContent=work.title;option.selected=selection.includes(option.value);list.append(option);}
  $('workChoices').replaceChildren();
  const choices=[{id:'all',title:'全部保存'},...coverageState.works];
  for(const work of choices){const button=document.createElement('button');button.className=work.id==='all'?'secondary all-choice':'secondary';button.textContent=work.title;const chosen=work.id==='all'?$('allWorks').checked:!$('allWorks').checked&&selection.includes(String(work.id));button.setAttribute('aria-pressed',String(chosen));button.disabled=busy||!!coverageState?.pending;button.onclick=()=>{$('allWorks').checked=work.id==='all';$('selectedMode').checked=!$('allWorks').checked;for(const option of list.options)option.selected=option.value===String(work.id);refreshCoverage();};$('workChoices').append(button);}
  coverageState=backupState(records,checkpoint,sourceContext?.ownerId,requirements());
  if(archiveUI?.locked){buttons();return;}
  const full=$('allWorks').checked&&$('includeBody').checked&&$('includeSettings').checked&&$('includeOther').checked;
  $('coverageTitle').textContent=coverageState.allComplete?(full?'全体の取得が終了しました':'選択した対象の取得が終了しました'):coverageState.pending?'途中まで取得しています':coverageState.inventoryKnown?'保存する対象を選んでください':'作品一覧を先に読み込みます';
  $('coverageCount').textContent='作品 '+coverageState.completed.length+' / '+coverageState.total+' ｜ 残り '+coverageState.remaining.length+' ｜ お気に入り '+(coverageState.favoritesComplete?'取得済み':'未完了')+' ｜ 活動報告 '+(coverageState.announcementsComplete?'取得済み':'未完了');
  $('coverageNext').textContent=coverageState.allComplete?'「ZIPで保存」「JSONで保存」「テキストで保存」で書き出し、保存先のファイルを確認してください。':coverageState.pending?'休憩中は自動再開を待てます。一時停止・エラーの後は「取得再開」を押してください。':'対象を選び「取得開始」を押してください。「全部保存」または作品を1つ選べます。';
  for(const id of ['coverageTitle','coverageCount','coverageNext'])$(id).title=$(id).textContent;
  if(currentArchive&&!inventoryFromSite)await archiveUI?.update({running:false,waiting:false,complete:currentArchive.manifest.complete});
  buttons();renderGauge();
  $('remainingWorks').replaceChildren();
  for(const work of coverageState.remaining){const item=document.createElement('li');item.textContent=work.title;$('remainingWorks').append(item);}
  if(!coverageState.remaining.length){const item=document.createElement('li');item.textContent=coverageState.total?'作品の未取得はありません。お気に入り・活動報告の状態も確認してください。':'作品一覧はまだ取得していません。';$('remainingWorks').append(item);}
}
async function sourceTab(requireEntry=true){
  const {sourceContext}=await chrome.storage.session.get('sourceContext');
  if(!sourceContext?.tabId||!sourceContext.ownerId)throw new Error('ログイン済みのユーザーホームで拡張アイコンを押してください。');
  let tab;try{tab=await chrome.tabs.get(sourceContext.tabId);}catch{throw new Error('取得元のタブが閉じられています。ユーザーホームを開き、拡張アイコンを押してください。');}
  if(!(requireEntry?backupEntryUrl(tab.url):allowedUrl(tab.url))||findSite(tab.url)?.id!==(sourceContext.siteId||'narou'))throw new Error('取得元のタブが別サイトへ移動しています。ユーザーホームから開き直してください。');
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:findSite(tab.url).scripts.account});
  const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>globalThis.NovelSiteUnit.account(document).ownerId});
  if(result.result!==sourceContext.ownerId)throw new Error('取得元のアカウントが変わったか、ログインが切れています。拡張アイコンから開き直してください。');
  return tab;
}
async function showContext(){
  const {sourceContext}=await chrome.storage.session.get('sourceContext');
  sourceAvailable=false;try{await sourceTab();sourceAvailable=true;}catch{}
  $('account').textContent=sourceContext?.ownerId?(sourceContext.userName||'ユーザー')+' ／ ID:'+sourceContext.ownerId:'ユーザーホームから拡張アイコンを押してください。';
  $('source').textContent=sourceContext?.url||'';
  await refreshCoverage();
  await progress();
  if(false&&!inventoryAttempted.has(sourceContext?.ownerId)&&!coverageState.inventoryKnown&&!coverageState.pending&&!busy&&sourceContext?.ownerId&&backupEntryUrl(sourceContext.url)){inventoryAttempted.add(sourceContext.ownerId);await bulk(false,false,true);}
}
let coverageTimer;
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session'&&changes.sourceContext)showContext();if(area==='local'&&Object.keys(changes).some(key=>key.startsWith('checkpoint:')||key.startsWith('snapshot:'))){clearTimeout(coverageTimer);coverageTimer=setTimeout(refreshCoverage,700);}});
function renderGauge(state={}){
  const manifest=archiveUI?.progressManifest;
  const result=gaugeState({state,manifest,coverage:coverageState});
  $('gauge').hidden=false;$('gauge').value=result.percent;$('gauge').className=result.level;
  $('progressPercent').textContent=result.percent+'%';
  $('gauge').setAttribute('aria-valuetext',result.percent+'%（作品数を基準にした目安）'+({paused:'・停止中',warning:'・警告',error:'・エラー'}[result.level]||''));
}
let polling=false,connectionLost=false;
async function progress(){
  if(polling)return;polling=true;
  try{
    const {sourceContext}=await chrome.storage.session.get('sourceContext');
    if(!sourceContext?.tabId){sourceAvailable=false;buttons();renderGauge();return;}
    try{await sourceTab();sourceAvailable=true;}catch{sourceAvailable=false;}
    const [result]=await chrome.scripting.executeScript({target:{tabId:sourceContext.tabId},func:()=>globalThis.NovelSiteUnit?.collectionStatus()||null});
    const state=result.result;connectionLost=false;
    if(!state){const interrupted=busy&&!starting;busy=acquisitionActive(state,busy,starting);if(busy){buttons();return;}await archiveUI?.update({running:false,waiting:false,complete:false});buttons();$('stop').disabled=true;if(interrupted){void recordDiagnostic('ui_error',new Error('取得元の状態が消えました。'),'source');$('progressText').textContent='取得元のページが再読み込みされたか、取得状態が失われました。保存済み分を確認し、「取得再開」を押してください。';renderGauge({phase:'warning'});}else renderGauge();return;}
    if(state.ownerId&&state.ownerId!==sourceContext.ownerId){$('stop').disabled=true;$('progressText').textContent='別アカウントの取得状況が残っています。取得元のログイン状態を確認してください。';renderGauge({phase:'error'});return;}
    busy=acquisitionActive(state,busy,starting);await archiveUI?.update(state);buttons();$('stop').disabled=!busy;
    const seconds=Math.max(0,Math.ceil((state.resumeAt-Date.now())/1000));
    const text=state.waiting?'休憩中 ｜ 自動再開まで '+String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0'):state.running?(state.message||'取得中です。'):state.phase==='error'||state.phase==='paused'?state.message:state.inventoryOnly&&state.complete?'作品一覧を読み込みました。保存対象を選んでください。':coverageState?.allComplete?'取得完了 ｜ 「ZIPで保存」「JSONで保存」「テキストで保存」でファイルへ保存してください。':state.message||'開始を待っています。';
    $('progressText').textContent=text;$('progressText').title=text;
    renderGauge(state);
  }catch(value){
    if(!connectionLost){connectionLost=true;void recordDiagnostic('ui_error',new Error('取得元のタブに接続できません。'),'source');}
    busy=false;await archiveUI?.update({running:false,waiting:false,complete:false});buttons();$('stop').disabled=true;renderGauge({phase:'warning'});
    $('progressText').textContent='取得元のタブに接続できません。途中までの原稿は下の保存一覧から書き出せます。';
  }finally{polling=false;}
}
$('stop').onclick=async()=>{try{const tab=await sourceTab();await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>globalThis.NovelSiteUnit?.pauseCollection()});}catch(value){error(value);}};
archiveUI=setupArchiveUI({sourceTab,start:bulk,refreshCoverage,buttons,viewingArchive:()=>!inventoryFromSite});
showContext();progress();setInterval(progress,2000);
$('rememberFormat').onclick=async()=>{
  try{
    const tab=await sourceTab(false);
    const unit=findSite(tab.url);
    if(!unit.capabilities.officialDownloadSettings)throw new Error('このサイトには公式ダウンロード設定の控え機能がありません。');
    const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>globalThis.NovelSiteUnit.officialDownloadSettings(document)});
    const value=result.result;
    const settings=normalizePreference(value.settings);
    const workId=$('formatCommon').checked?'default':value.workId;
    const key=preferenceKey(value.ownerId,workId,unit.id);
    await chrome.storage.local.set({[key]:{siteId:unit.id,ownerId:value.ownerId,workId,title:value.title,settings,savedAt:new Date().toISOString(),source:'公式画面'}});
    $('status').textContent=($('formatCommon').checked?'全作品共通':'この作品')+'の設定を記録しました。公式画面は変更しません。';
  }catch(value){error(value);}
};
async function bulk(resume=false,reacquire=false,inventoryOnly=false,archive=false) {
  starting=true;busy=true;buttons();
  try {
    const tab=await sourceTab();
    if(!backupEntryUrl(tab?.url)) throw new Error('ログイン済みのユーザーホーム、または作品一覧を開いてください。');
    if(inventoryOnly){inventoryFromSite=true;await refreshCoverage();}
    const req=requirements();
    if(!archive&&!inventoryOnly)await refreshLibrary();
    const options={archive,works:!inventoryOnly&&(req.includeBody||req.includeSettings),inventoryOnly,includeBody:req.includeBody,includeSettings:req.includeSettings,favorites:!inventoryOnly&&req.includeOther,announcements:!inventoryOnly&&req.includeOther,resume,quiet:true,allWorks:inventoryOnly||$('allWorks').checked,selectedWorkIds:inventoryOnly?undefined:req.selectedWorkIds||undefined,autoContinue:$('autoContinue').checked,excludeWorkIds:reacquire?[]:coverageState?.doneIds||[],maxPages:Number($('maxPages').value),waitSeconds:Number($('waitSeconds').value)};
    if(archive){options.allWorks=true;options.selectedWorkIds=undefined;options.includeBody=options.includeSettings=options.favorites=options.announcements=options.works=options.autoContinue=true;options.excludeWorkIds=[];options.maxPages=30;options.waitSeconds=5;}
    // Other information is reread; unchanged saved content is deduplicated.
    if(!resume&&!inventoryOnly&&options.works&&options.selectedWorkIds&&!options.selectedWorkIds.length)throw new Error('保存する作品を選んでください。');
    if(!resume&&!inventoryOnly&&!options.works&&!options.favorites&&!options.announcements)throw new Error('保存対象を選ぶか「再取得」を押してください。');
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:findSite(tab.url).scripts.collect});
    const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:options=>globalThis.NovelSiteUnit.startCollection(options),args:[options]});
    if(!result.result?.ok) throw new Error('取得を開始できませんでした。');
    $('status').textContent='取得を開始しました。この画面に進捗を表示します。';
    return true;
  } catch(value){error(value);busy=false;buttons();return false;}finally{starting=false;buttons();}
}
async function continueBackup(){await refreshCoverage();if(coverageState?.current?.options?.archive&&coverageState.pending&&!archiveUI?.locked){error(new Error('途中保存のZIPを下の欄へ読み込んでから「取得再開」を押してください。'));return;}await bulk(!!coverageState?.pending);}
$('bulk').onclick=continueBackup;
$('resume').onclick=()=>archiveUI?.locked?archiveUI.resume():archiveUI?.canResume?archiveUI.resumeImported():continueBackup();
$('fresh').onclick=()=>bulk(false,true);
$('inventory').onclick=()=>bulk(false,false,true);
for(const id of ['allWorks','selectedMode','selectedWorks','includeBody','includeSettings','includeOther'])$(id).onchange=refreshCoverage;
function error(value) { void recordDiagnostic('ui_error',value); $('status').textContent = value?.message || String(value); renderGauge({phase:'error'}); }
$('read').onclick = async () => {
  $('start').disabled = true;
  $('fields').replaceChildren();
  try {
    const tab = await sourceTab(false);
    if (!allowedUrl(tab?.url)||!findSite(tab.url).editPathPattern?.test(new URL(tab.url).pathname)) throw new Error('自分のエピソード・作品設定・活動報告などの編集画面を開いてください。');
    tabId = tab.id;
    pageUrl = tab.url;
    await chrome.scripting.executeScript({target: {tabId}, files: findSite(tab.url).scripts.edit});
    const [result] = await chrome.scripting.executeScript({target: {tabId}, func: () => globalThis.NovelSiteUnit.editFields()});
    const fields = result.result;
    if (!fields.length) throw new Error('入力欄が見つかりません。エピソード編集画面を開いてください。');
    for (const field of fields) {
      const label = document.createElement('label');
      label.className = 'field';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = field.index;
      const name = document.createElement('strong');
      name.textContent = field.label;
      const preview = document.createElement('pre');
      preview.textContent = field.value.slice(0, 120) || '（空欄）';
      const count = document.createElement('small');
      count.textContent = [...field.value].length + '文字';
      label.append(checkbox, name, count, preview);
      $('fields').append(label);
    }
    $('status').textContent = '本文・タイトル・前書きなど、原稿の欄だけにチェックを入れてください。';
    $('start').disabled = false;
  } catch (value) { error(value); }
};
$('start').onclick = async () => {
  const indices = [...$('fields').querySelectorAll('input:checked')].map(node => Number(node.value));
  if (!indices.length) return error('保存する欄を選んでください。');
  $('start').disabled = true;
  try {
    const tab = await sourceTab(false);
    if(tab.id!==tabId)throw new Error('取得元が変わりました。「編集欄を確認」からやり直してください。');
    if (tab.url !== pageUrl) throw new Error('画面が変わりました。「編集欄を確認」からやり直してください。');
    const [result] = await chrome.scripting.executeScript({target: {tabId}, func: indices => globalThis.NovelSiteUnit.startEditHistory(indices), args: [indices]});
    if (!result.result?.ok) throw new Error('保存を開始できませんでした。');
    $('status').textContent = '初回保存が完了しました。このページで選んだ欄の変更を保存します。';
  } catch (value) { error(value); }
  finally { $('start').disabled = false; }
};
$('resetData').onclick=()=>$('resetDialog').showModal();
$('cancelReset').onclick=()=>$('resetDialog').close();
$('confirmReset').onclick=async()=>{if(busy||archiveUI?.locked||libraryWriting)return;const button=$('confirmReset');button.disabled=true;try{const reply=await chrome.runtime.sendMessage({type:'resetData'});if(!reply?.ok)throw new Error(reply?.error||'削除できませんでした。');await refreshLibrary();await refreshCoverage();$('status').textContent='Chrome内の取得データを削除しました。保存済みファイルは残っています。';$('resetDialog').close();}catch(value){error(value);}finally{button.disabled=false;}};
$('library').onclick = () => document.getElementById('saved').scrollIntoView({behavior:'smooth'});


setupReportUI();
