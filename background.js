import {removeAcquiredData} from './reset-data.mjs';
import {validateSnapshot,allowedUrl,findSite,checkpointKey,legacyCheckpointKey} from './core.mjs';

const ready = chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
let opening=Promise.resolve();let resetting=false;const jobs=new Set();
function tracked(task){const promise=task();jobs.add(promise);promise.finally(()=>jobs.delete(promise)).catch(()=>{});return promise;}
function openDetail(sourceTab){
  opening=opening.catch(()=>{}).then(async()=>{
    if(sourceTab&&allowedUrl(sourceTab.url)){
      try{
        const unit=findSite(sourceTab.url);
        await chrome.scripting.executeScript({target:{tabId:sourceTab.id},files:unit.scripts.account});
        const [result]=await chrome.scripting.executeScript({target:{tabId:sourceTab.id},func:()=>globalThis.NovelSiteUnit.account(document)});
        await chrome.storage.session.set({sourceContext:{tabId:sourceTab.id,url:sourceTab.url,...result.result,siteId:unit.id}});
      }catch{await chrome.storage.session.set({sourceContext:{tabId:sourceTab.id,url:sourceTab.url}});}
    }
    const url=chrome.runtime.getURL('detail.html');
    const {detailTabId}=await chrome.storage.session.get('detailTabId');
    if(detailTabId){try{const tab=await chrome.tabs.get(detailTabId);if(tab.url===url){await chrome.tabs.update(tab.id,{active:true});return;}}catch{}}
    const tab=await chrome.tabs.create({url});await chrome.storage.session.set({detailTabId:tab.id});
  });
  return opening;
}
chrome.action.onClicked.addListener(tab=>{openDetail(tab).catch(()=>{});});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if(message?.type==='resetData'){
    (async()=>{
      const {detailTabId,sourceContext,archiveSink}=await chrome.storage.session.get(['detailTabId','sourceContext','archiveSink']);
      if(sender.id!==chrome.runtime.id||sender.tab?.id!==detailTabId||sender.url!==chrome.runtime.getURL('detail.html'))throw new Error('詳細ページから操作してください。');
      if(resetting)throw new Error('リセット中です。');
      if(archiveSink){let active=true;try{const tab=await chrome.tabs.get(archiveSink.tabId);active=tab.url===chrome.runtime.getURL('detail.html');}catch{active=!archiveSink.tabId;}if(active)throw new Error('ZIPの取得を終了してからリセットしてください。');}
      const tabs=await chrome.tabs.query({});const ids=[...new Set([sourceContext?.tabId,...tabs.filter(t=>allowedUrl(t.url)).map(t=>t.id)].filter(Boolean))];
      for(const id of ids){let state;try{const [r]=await chrome.scripting.executeScript({target:{tabId:id},func:()=>globalThis.NovelSiteUnit?.collectionStatus()});state=r.result;}catch{continue;}if(state?.running||state?.waiting)throw new Error('取得中・休憩中はリセットできません。一時停止してください。');}
      resetting=true;
      try{
        for(const id of ids){try{await chrome.scripting.executeScript({target:{tabId:id},func:()=>{globalThis.narouLocalBackup?.stop();globalThis.narouBulkBackup?.reset?.();}});}catch{}}
        await Promise.allSettled([...jobs]);await ready;await removeAcquiredData(chrome.storage.local);
        await chrome.storage.session.remove(['archiveInterrupted','archiveSink']);
        await chrome.action.setBadgeText({text:''});reply({ok:true});
      }finally{resetting=false;}
    })().catch(error=>reply({ok:false,error:error.message}));return true;
  }
  if(resetting&&['saveSnapshot','checkpoint','importCheckpoint','bindArchive'].includes(message?.type)){reply({ok:false,error:'取得データをリセット中です。'});return true;}

  if(['bindArchive','releaseArchive','abandonArchive','importCheckpoint'].includes(message?.type)){
    tracked(async()=>{
      const {detailTabId,sourceContext}=await chrome.storage.session.get(['detailTabId','sourceContext']);
      if(sender.id!==chrome.runtime.id||sender.tab?.id!==detailTabId||sender.url!==chrome.runtime.getURL('detail.html'))throw new Error('詳細ページから操作してください。');
      if(message.type==='abandonArchive'){const {archiveSink}=await chrome.storage.session.get('archiveSink');if(archiveSink){try{await chrome.scripting.executeScript({target:{tabId:archiveSink.sourceTabId},func:()=>globalThis.NovelSiteUnit?.pauseCollection()});}catch{}await chrome.storage.session.set({archiveInterrupted:true});await chrome.storage.session.remove('archiveSink');}reply({ok:true});return;}
      if(message.type==='releaseArchive'){await chrome.storage.session.remove('archiveSink');reply({ok:true});return;}
      if(!sourceContext?.ownerId||sourceContext.siteId!==message.siteId||sourceContext.ownerId!==message.ownerId)throw new Error('バックアップと現在のアカウントが一致しません。');
      if(message.type==='bindArchive')await chrome.storage.session.set({archiveSink:{tabId:detailTabId,sourceTabId:sourceContext.tabId,siteId:message.siteId,ownerId:message.ownerId,backupId:message.backupId}});
      else {if(message.report?.ownerId!==message.ownerId||JSON.stringify(message.report).length>2000000)throw new Error('再開情報が不正です。');await chrome.storage.local.set({[checkpointKey(message.siteId,message.ownerId)]:message.report});}
      reply({ok:true});
    }).catch(error=>reply({ok:false,error:error.message}));return true;
  }
  if(message?.type==='backupStatus'){
    tracked(async()=>{
      const {sourceContext}=await chrome.storage.session.get('sourceContext');
      if(sender.id!==chrome.runtime.id||sender.frameId!==0||!sender.tab||!allowedUrl(sender.url)||sourceContext?.tabId!==sender.tab.id||sourceContext.ownerId!==message.ownerId)return;
      const states={running:['取得','#4a8ce0'],waiting:['待機','#4a8ce0'],ready:['一覧','#777777'],complete:['済','#28a745'],paused:['停止','#777777'],error:['!','#b8860b']};
      const state=states[message.state];if(!state)return;
      await chrome.action.setBadgeBackgroundColor({color:state[1]});
      await chrome.action.setBadgeText({text:state[0]});
      await chrome.action.setTitle({title:'シンプルになろう（バックアップ） — '+String(message.message||'').slice(0,160)});
    }).catch(()=>{});return;
  }
  if (['checkpoint','resume'].includes(message?.type)) {
    tracked(async()=>{
      await ready;
      if(sender.id!==chrome.runtime.id || !sender.tab || sender.frameId!==0) throw new Error('保存元を確認できません。');
      validateSnapshot({fields:[{label:'検証',value:''}]},sender.url);
      const unit=findSite(sender.url);
      if(message.siteId&&message.siteId!==unit.id)throw new Error('取得元のサイトが変わっています。');
      const key=checkpointKey(unit.id,message.ownerId);
      const legacy=legacyCheckpointKey(unit.id,message.ownerId);
      if(message.type==='resume') reply({ok:true,checkpoint:(await chrome.storage.local.get(key))[key] || (legacy?(await chrome.storage.local.get(legacy))[legacy]:null) || null});
      else {
        if(message.report?.ownerId!==message.ownerId || JSON.stringify(message.report).length>2000000) throw new Error('継続情報が不正か大きすぎます。');
        const {archiveSink}=await chrome.storage.session.get('archiveSink');
        if(message.report.options?.archive){
          if(!archiveSink||archiveSink.sourceTabId!==sender.tab.id||archiveSink.ownerId!==message.ownerId)throw new Error('ZIP保存ページが閉じられました。ZIPを読み込んで再開してください。');
          const saved=await chrome.runtime.sendMessage({type:'archiveWrite',recipient:archiveSink.tabId,backupId:archiveSink.backupId,report:message.report});
          if(!saved?.ok)throw new Error(saved?.error||'ZIPの継続情報を保存できません。');
        }
        await chrome.storage.local.set({[key]:{...message.report,siteId:unit.id}});reply({ok:true});
      }
    }).catch(error=>reply({ok:false,error:error.message}));
    return true;
  }
  if (message?.type === 'openLibrary' && sender.id === chrome.runtime.id) {
    openDetail().catch(()=>{});
    return;
  }
  if (message?.type !== 'saveSnapshot') return;
  tracked(async () => {
    await ready;
    if (sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0)
      throw new Error('編集画面からの保存ではありません。');
    const record = validateSnapshot(message.snapshot, sender.url);
    record.id = crypto.randomUUID();
    record.savedAt = new Date().toISOString();
    // Each version has its own key, avoiding lost updates between tabs.
    const {archiveSink}=await chrome.storage.session.get('archiveSink');
    if(archiveSink&&archiveSink.sourceTabId===sender.tab.id&&archiveSink.ownerId===record.ownerId&&archiveSink.siteId===record.siteId){
      const saved=await chrome.runtime.sendMessage({type:'archiveWrite',recipient:archiveSink.tabId,backupId:archiveSink.backupId,record});
      if(!saved?.ok)throw new Error(saved?.error||'ZIP保存ページに接続できません。');
    }else{
      const cp=(await chrome.storage.local.get(checkpointKey(record.siteId,record.ownerId)))[checkpointKey(record.siteId,record.ownerId)];
      if(cp?.options?.archive&&!cp.complete&&cp.runId===record.runId)throw new Error('ZIP保存ページが閉じられました。ZIPを読み込んで再開してください。');
      // Same contents reached through another entry point are not stored twice.
      const values=Object.values(await chrome.storage.local.get(null));
      const previous=values.filter(r=>r?.category===record.category&&r.ownerId===record.ownerId&&(r.siteId||'narou')===record.siteId&&(r.data?.sourceUrl||r.url)===(record.data?.sourceUrl||record.url)).sort((a,b)=>a.savedAt.localeCompare(b.savedAt)).at(-1);
      const same=previous&&JSON.stringify(previous.fields)===JSON.stringify(record.fields)&&JSON.stringify(previous.data)===JSON.stringify(record.data);
      if(!same)await chrome.storage.local.set({['snapshot:' + record.id]: record});
    }
    reply({ok: true, savedAt: record.savedAt});
  }).catch(error => reply({ok: false, error: '保存できませんでした。容量不足などを確認し、原稿をファイルにも保存してください。 ' + error.message}));
  return true;
});

chrome.tabs.onRemoved.addListener(id=>{tracked(async()=>{const {archiveSink}=await chrome.storage.session.get('archiveSink');if(archiveSink?.tabId!==id)return;await chrome.storage.session.set({archiveInterrupted:true});try{await chrome.scripting.executeScript({target:{tabId:archiveSink.sourceTabId},func:()=>globalThis.NovelSiteUnit?.pauseCollection()});}catch{}await chrome.action.setBadgeText({text:'停止'});}).catch(()=>{});});
