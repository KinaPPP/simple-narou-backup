import {diagnosticKey,reportSummary,publicReportURL,reportText} from './diagnostics.mjs';
import {checkpointKey,legacyCheckpointKey} from './core.mjs';
import {currentArchive,archiveDiagnostics} from './library.js';
export function setupReportUI(){
 const $=id=>document.getElementById(id);let captured={events:[],summary:null,version:chrome.runtime.getManifest().version};
 let copyTimer,prepared=false;
 const status=text=>$('reportStatus').textContent=text;
 function invalidate(){ clearTimeout(copyTimer);$('reportCopy').textContent='報告文をコピー';if(prepared)$('reportOutput').value='';prepared=false;$('reportCopy').disabled=true;status('内容を確認し、「報告文を作成」を押してください。');}
 function urlState(){const on=$('reportPublic').checked;$('reportURL').disabled=!on;$('reportURLCheck').disabled=!on||!publicReportURL($('reportURL').value);invalidate();}
 async function refresh(){
  try{const {sourceContext:c}=await chrome.storage.session.get('sourceContext');const all=await chrome.storage.local.get(null);
   const own=c?.ownerId;const site=c?.siteId||'narou';const log=own?all[diagnosticKey(site,own)]:null;
   const cp=own?all[checkpointKey(site,own)]||all[legacyCheckpointKey(site,own)]:null;
   const archive=currentArchive?.manifest;const used=archive&&archive.ownerId===own?(archive.checkpoint?{...archive.checkpoint,complete:archive.complete}:null):cp;
   captured={version:chrome.runtime.getManifest().version,events:Array.isArray(log?.events)?log.events:[],summary:reportSummary(used),importStatus:archiveDiagnostics(),includeTimes:$('reportTimes').checked};
   invalidate();$('reportOutput').value=reportText(captured);
  }catch{captured={version:chrome.runtime.getManifest().version,events:[],summary:null,importStatus:archiveDiagnostics(),includeTimes:$('reportTimes').checked};invalidate();$('reportOutput').value=reportText(captured);status('診断情報を読み取れませんでした。自由記入で状況を補足できます。');}
 }
 $('reportButton').onclick=async()=>{$('reportArea').hidden=false;await refresh();$('reportArea').scrollIntoView({behavior:'smooth',block:'start'});$('reportHeading').focus({preventScroll:true});};
 $('reportRefresh').onclick=refresh;
 $('reportForm').onclick=()=>{window.open('https://docs.google.com/forms/d/e/1FAIpQLScfqnyKSInEFFeMWcj8IzEnV4zwAveGGQpxl6ut-j7eoWxgyQ/viewform','_blank','noopener,noreferrer');status('受付フォームの「不具合報告の内容」へ報告文を貼り付けて送信してください。');};
 $('reportPublic').onchange=urlState;$('reportURL').oninput=urlState;$('reportNote').oninput=invalidate;
 $('reportTimes').onchange=()=>{invalidate();$('reportOutput').value='';};
 $('reportURLCheck').onclick=()=>{const url=$('reportPublic').checked&&publicReportURL($('reportURL').value);if(!url)return;window.open(url,'_blank','noopener,noreferrer');status('別タブで公開ページを確認してください。');};
 $('reportPrepare').onclick=()=>{
  const allowed=$('reportPublic').checked,raw=$('reportURL').value.trim(),url=allowed?publicReportURL(raw):null;
  if(allowed&&!url){status('公開URLを確認してください。公開マイページ、または公開作品・エピソードのHTTPS URLを入力してください。');$('reportURL').focus();return;}
  $('reportOutput').value=reportText({...captured,includeTimes:$('reportTimes').checked,note:$('reportNote').value,publicURL:url});prepared=true;$('reportOutput').scrollTop=0;$('reportCopy').disabled=false;status('上の送信用文章を確認し、個人情報や非公開の内容がないことを確かめてからコピーしてください。');
 };
 $('reportCopy').onclick=async()=>{const button=$('reportCopy');try{await navigator.clipboard.writeText($('reportOutput').value);button.textContent='コピーしました';clearTimeout(copyTimer);copyTimer=setTimeout(()=>button.textContent='報告文をコピー',2000);status('コピーしました。送信先へ貼り付けてください。自動送信は行いません。');}catch{$('reportOutput').focus();$('reportOutput').select();status('コピーできませんでした。選択された報告文を手動でコピーしてください。');}};
}
