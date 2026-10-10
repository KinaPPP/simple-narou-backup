export const diagnosticKinds={started:'取得開始',resumed:'取得再開',waiting:'休憩・自動再開待ち',paused:'利用者による一時停止',complete:'取得完了',request_error:'受信エラー',save_error:'保存エラー',stopped:'エラーで停止',scan:'一覧の確認',check_error:'件数・形式の確認エラー',ui_error:'操作エラー'};
export const diagnosticStages={unknown:'取得段階不明',inventory:'作品一覧',draft_inventory:'下書き作品一覧',work:'作品・エピソード一覧',episode:'エピソード本文',settings:'作品設定',chapter:'章設定',template:'共通設定',bookmarks:'ブックマーク',users:'お気に入りユーザ',blogs:'活動報告一覧',blog:'活動報告本文',save:'ファイル・端末への保存',source:'取得元の確認'};
export const diagnosticCodes={NONE:'なし',HTTP:'HTTP受信エラー',TIMEOUT:'通信時間超過',NETWORK:'通信失敗',LOGIN:'ログイン状態・取得元の変化',FORMAT:'ページ・入力欄の形式を認識できない',COUNT:'一覧と取得の件数不一致',SCAN_LIMIT:'一覧の確認上限',SAVE:'書き込み・保存失敗',PERMISSION:'アクセス許可の確認',CANCEL:'利用者によるキャンセル',UNKNOWN:'詳細不明（自由記入で補足してください）'};
export function errorCode(value){
 const s=String(value?.message||value||'');
 if(value?.name==='AbortError'&&/キャンセル|選択/.test(s))return 'CANCEL';
 if(/時間超過|timeout|timed out/i.test(s))return 'TIMEOUT';
 if(/HTTP\s*\d{3}/.test(s))return 'HTTP';
 if(/ログイン|アカウント|取得元|タブ.*閉じ|別画面/.test(s))return 'LOGIN';
 if(/件数不一致/.test(s))return 'COUNT';
 if(/200ページ/.test(s))return 'SCAN_LIMIT';
 if(/許可|permission|NotAllowed/i.test(s))return 'PERMISSION';
 if(/保存|書き込|容量|disk|quota/i.test(s))return 'SAVE';
 if(/形式|認識|入力欄|本文欄|リンク.*見つか/.test(s))return 'FORMAT';
 if(/fetch|network|通信/i.test(s))return 'NETWORK';
 return 'UNKNOWN';
}
export function diagnosticKey(site,owner){if(site!=='narou'||!/^\d{1,20}$/.test(String(owner)))throw new Error('診断の対象が不正です。');return 'diagnostics:'+site+':'+owner;}
export function cleanDiagnostic(input,now=new Date().toISOString()){
 if(!input||!Object.hasOwn(diagnosticKinds,input.kind))return null;
 const e={at:now,kind:input.kind,stage:Object.hasOwn(diagnosticStages,input.stage)?input.stage:'unknown',code:Object.hasOwn(diagnosticCodes,input.code)?input.code:'NONE'};
 for(const key of ['workNumber','episodeNumber','listPage','requestNumber','pages','expected','actual'])if(Number.isSafeInteger(input[key])&&input[key]>=0&&input[key]<=100000000)e[key]=input[key];
 if(Number.isInteger(input.http)&&input.http>=100&&input.http<=599)e.http=input.http;
 return e;
}
export function createDiagnosticStore(storage){
 let queue=Promise.resolve();
 return (site,owner,event)=>{
  const task=queue.then(async()=>{const key=diagnosticKey(site,owner),e=cleanDiagnostic(event);if(!e)return;const old=(await storage.get(key))[key];const events=Array.isArray(old?.events)?old.events:[];await storage.set({[key]:{version:1,events:[...events,e].slice(-200)}});});
  queue=task.catch(()=>{});return task;
 };
}
export function reportSummary(checkpoint){
 if(!checkpoint)return null;
 const number=v=>Number.isSafeInteger(v)&&v>=0?v:0;
 return {works:number(checkpoint.workPlan?.length),savedPages:number(checkpoint.pages),doneWorks:number(checkpoint.doneSelectedWorks?.length??checkpoint.doneWorks?.length),scannedPages:number(Object.keys(checkpoint.scans||{}).length),complete:!!checkpoint.complete,body:checkpoint.options?.includeBody!==false,settings:checkpoint.options?.includeSettings!==false,other:!!(checkpoint.options?.favorites||checkpoint.options?.announcements)};
}
export function publicReportURL(text){
 try{const u=new URL(text.trim());if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash)return null;
 const legacy=u.hostname==='mypage.syosetu.com'&&u.pathname.match(/^\/mypage\/top\/userid\/(\d+)\/$/);
 if(legacy)return 'https://mypage.syosetu.com/'+legacy[1]+'/';
 if(u.hostname==='mypage.syosetu.com'&&/^\/\d+\/$/.test(u.pathname)||u.hostname==='ncode.syosetu.com'&&/^\/n\d+[a-z]+\/(?:\d+\/)?$/i.test(u.pathname))return u.href;
 }catch{}return null;
}
export function reportText({version,events=[],summary=null,note='',publicURL=null,importStatus=null,includeTimes=false}){
 const lines=['シンプルになろう（バックアップ） 不具合報告','バージョン：'+(/^[\d.]+$/.test(version||'')?version:'不明'),'診断情報：本文・フリーメモ・作品名・アカウントID・非公開URLを含みません。'];
 if(summary)lines.push('保存対象：本文 '+(summary.body?'あり':'なし')+'／設定 '+(summary.settings?'あり':'なし')+'／その他情報 '+(summary.other?'あり':'なし'),'作品一覧 '+summary.works+'件／取得済み作品 '+summary.doneWorks+'件／保存済みページ '+summary.savedPages+'件／確認済み一覧ページ '+summary.scannedPages+'件','取得完了の記録：'+(summary.complete?'あり':'なし'));
 if(importStatus){lines.push('','バックアップ読み込みの確認：','直近の読み込み失敗：'+(importStatus.lastImportFailed?'あり':'なし'));const a=importStatus.archive;if(a){const n=v=>Number.isSafeInteger(v)&&v>=0?v:0;const total=n(a.total),verified=n(a.verified);lines.push('現在表示中のZIP：項目 '+total+'件／検証済み '+verified+'件／未検証 '+Math.max(0,total-verified-n(a.damaged))+'件','未取得・破損 '+n(a.damaged)+'件／不足項目 '+n(a.missingRecords)+'件／不足分割ZIP '+n(a.missingParts)+'個','未検証の項目について、破損がないとは判断していません。');}else lines.push('現在表示中のZIP：なし');}
 lines.push('','取得・保存の記録（最大200件）：',includeTimes?'日時：含める':'日時：省略（記録は発生順）');
 if(!events.length)lines.push('記録はありません。この版の導入前に発生したエラーは含まれません。');
 for(const item of events){if(!item)continue;const validDate=/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(item.at||'')&&Number.isFinite(Date.parse(item.at));const e=cleanDiagnostic(item,validDate?item.at:'日時不明');if(!e)continue;
  const time=e.at==='日時不明'?e.at:new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(e.at));
  let line=(includeTimes?time+'（日本時間） ':'')+diagnosticKinds[e.kind]+'／'+diagnosticStages[e.stage];
  if(e.code!=='NONE')line+='／'+diagnosticCodes[e.code];if(e.http)line+=' HTTP '+e.http;
  for(const [key,label] of [['workNumber','作品一覧の順番'],['episodeNumber','エピソード順'],['listPage','一覧ページ'],['requestNumber','この回の受信回数'],['pages','確認ページ数'],['expected','一覧件数'],['actual','認識件数']])if(e[key]!==undefined)line+='／'+label+' '+e[key];lines.push(line);
 }
 lines.push('','追加説明（利用者が入力）：',note.trim()||'なし');
 if(publicURL&&publicReportURL(publicURL))lines.push('','公開ページ（利用者が許可）：',publicReportURL(publicURL));
 lines.push('','匿名報告のため、折り返しの返信はありません。');return lines.join('\n');
}
